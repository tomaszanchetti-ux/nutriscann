/**
 * Cliente mínimo de Firestore contra su API REST.
 *
 * Sin `firebase-admin`: la regla del repo es cero dependencias de runtime en
 * `kb/`, y para lo que hace el seed (listar una colección, escribir en lote,
 * parchear un campo) la API REST alcanza y se lee entera. `fetch` es nativo en
 * Node 22.
 *
 * Dos destinos posibles, decididos en un solo lugar:
 *   - EMULADOR: http://localhost:8080/v1/... con `Authorization: Bearer owner`.
 *   - REAL:     https://firestore.googleapis.com/v1/... con un access token
 *               OAuth que entra por variable de entorno o flag. El seed no
 *               genera tokens ni sabe de credenciales: los recibe.
 */
import { camposDesdeObjeto, objetoDesdeCampos, type CamposFirestore, type DocumentoJson, type ValorFirestore, type ValorJson } from "./valores";

/** Cuántas operaciones entran en un `batchWrite`. El límite de Firestore es 500. */
export const MAXIMO_POR_LOTE = 500;

/** Reintentos ante 429 y 5xx, con espera creciente (ms). */
const ESPERAS_REINTENTO = [500, 1_000, 2_000, 4_000, 8_000];

export interface Destino {
  /** Raíz de la API, sin barra final. Ej: `http://localhost:8080/v1`. */
  raiz: string;
  proyecto: string;
  baseDeDatos: string;
  token: string;
  esEmulador: boolean;
  /** Solo para mostrar: `emulador (localhost:8080)` o `proyecto real`. */
  descripcion: string;
}

export interface OpcionesDestino {
  proyecto: string;
  emulador: boolean;
  /** Host del emulador; si falta se usa FIRESTORE_EMULATOR_HOST o localhost:8080. */
  host?: string | undefined;
  /** Access token OAuth para el proyecto real. */
  token?: string | undefined;
  baseDeDatos?: string | undefined;
}

/** Los únicos nombres de host que pueden ser un emulador: la máquina de uno. */
const HOSTS_DE_LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * El nombre de host de un `host:puerto`, sin esquema, sin puerto y sin los
 * corchetes de IPv6. `https://firestore.googleapis.com` ⇒ `firestore.googleapis.com`.
 */
export function nombreDeHost(host: string): string {
  const sinEsquema = host.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const entreCorchetes = /^\[([^\]]+)\](?::\d+)?$/.exec(sinEsquema);
  if (entreCorchetes) return (entreCorchetes[1] as string).toLowerCase();
  // IPv6 sin corchetes (`::1`): no puede llevar puerto, no habría cómo separarlo.
  if (sinEsquema.split(":").length > 2) return sinEsquema.toLowerCase();
  return (sinEsquema.split(":")[0] ?? "").toLowerCase();
}

/**
 * Arma el destino y, de paso, es el único candado que separa emulador de
 * producción. Son DOS candados, uno por rama, porque hay dos formas de
 * equivocarse:
 *
 *   - contra el proyecto real, sin token no se sigue;
 *   - con `--emulator`, el host tiene que ser la máquina de uno. Sin esto,
 *     `--emulator --host https://firestore.googleapis.com` escribiría en la
 *     API REAL con `Bearer owner` y, peor, en silencio: `esEmulador` sería
 *     `true` y el aviso "⚠️ PROYECTO REAL" no se imprimiría. El mismo agujero
 *     lo abría `FIRESTORE_EMULATOR_HOST`, que entra por acá y por eso se
 *     valida DESPUÉS de resolverla, no antes.
 */
export function crearDestino(opciones: OpcionesDestino): Destino {
  const baseDeDatos = opciones.baseDeDatos ?? "(default)";
  if (opciones.emulador) {
    const host = opciones.host ?? process.env["FIRESTORE_EMULATOR_HOST"] ?? "localhost:8080";
    if (!HOSTS_DE_LOOPBACK.has(nombreDeHost(host))) {
      throw new Error(
        `El emulador tiene que estar en esta máquina y recibí el host '${host}'. ` +
          "Solo se admiten localhost, 127.0.0.1 y [::1]. " +
          "Un --emulator apuntando afuera escribiría en un Firestore real creyendo que " +
          "es el emulador, y sin el aviso que avisa. " +
          "Para escribir en el proyecto real, sacá --emulator y pasá un --token.",
      );
    }
    const raiz = host.startsWith("http") ? `${host.replace(/\/$/, "")}/v1` : `http://${host}/v1`;
    return {
      raiz,
      proyecto: opciones.proyecto,
      baseDeDatos,
      // El emulador acepta cualquier credencial; "owner" es la convención.
      token: "owner",
      esEmulador: true,
      descripcion: `emulador (${host})`,
    };
  }
  const token = opciones.token ?? process.env["SEED_TOKEN"] ?? "";
  if (token.trim() === "") {
    throw new Error(
      "Falta el access token para el proyecto real. Pasalo con --token o en SEED_TOKEN " +
        "(por ejemplo: SEED_TOKEN=$(gcloud auth print-access-token)). " +
        "Para probar sin tocar producción, usá --emulator.",
    );
  }
  const host = (opciones.host ?? "https://firestore.googleapis.com").replace(/\/$/, "");
  if (!/^https:\/\//i.test(host)) {
    // El access token viaja en la cabecera Authorization: por HTTP plano se lee
    // en el camino. Contra el proyecto real no hay razón legítima para eso.
    throw new Error(
      `El host del proyecto real tiene que ser https:// (recibí '${host}'). ` +
        "El access token viaja en la cabecera y por HTTP sin cifrar queda expuesto. " +
        "Para apuntar a un servidor local, usá --emulator.",
    );
  }
  return {
    raiz: `${host}/v1`,
    proyecto: opciones.proyecto,
    baseDeDatos,
    token: token.trim(),
    esEmulador: false,
    descripcion: `PROYECTO REAL ${opciones.proyecto}`,
  };
}

/** El prefijo `projects/.../documents` que Firestore usa como nombre de documento. */
export function rutaDocumentos(destino: Destino): string {
  return `projects/${destino.proyecto}/databases/${destino.baseDeDatos}/documents`;
}

/** Nombre completo de un documento, tal como lo espera la API. */
export function nombreDocumento(destino: Destino, coleccion: string, id: string): string {
  return `${rutaDocumentos(destino)}/${coleccion}/${id}`;
}

/**
 * Un nombre de campo, escapado como RUTA de campo para un `updateMask`.
 *
 * En un `updateMask` el punto separa niveles: `per_100g.kcal` significa "la
 * clave kcal adentro del mapa per_100g", no "el campo llamado per_100g.kcal".
 * Firestore resuelve la ambigüedad con backticks. Hoy ningún campo de primer
 * nivel del catálogo tiene puntos (los tienen las claves ADENTRO de
 * `provenance`, que nunca viajan en una máscara), pero eso es una propiedad de
 * los datos de hoy: escapando siempre, deja de ser algo de lo que depender.
 */
export function rutaDeCampo(nombre: string): string {
  if (/^[A-Za-z_][A-Za-z_0-9]*$/.test(nombre)) return nombre;
  return `\`${nombre.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
}

/** Una escritura del lote: reemplazo completo o parche de campos puntuales. */
export interface Escritura {
  nombre: string;
  campos: CamposFirestore;
  /** Si viene, solo se tocan esos campos (merge). Si no, se reemplaza el documento entero. */
  soloCampos?: string[];
}

export class ClienteFirestore {
  constructor(readonly destino: Destino) {}

  /**
   * Lee una colección entera, paginada, y devuelve los documentos ya
   * traducidos a JSON pelado. 975 documentos entran en 4 páginas.
   */
  async listarColeccion(coleccion: string): Promise<Map<string, DocumentoJson>> {
    const documentos = new Map<string, DocumentoJson>();
    let pagina: string | undefined;
    do {
      const parametros = new URLSearchParams({ pageSize: "300" });
      if (pagina) parametros.set("pageToken", pagina);
      const cuerpo = (await this.pedir(
        "GET",
        `${rutaDocumentos(this.destino)}/${coleccion}?${parametros.toString()}`,
      )) as { documents?: Array<{ name: string; fields?: CamposFirestore }>; nextPageToken?: string };
      for (const documento of cuerpo.documents ?? []) {
        const id = documento.name.slice(documento.name.lastIndexOf("/") + 1);
        documentos.set(id, objetoDesdeCampos(documento.fields ?? {}));
      }
      pagina = cuerpo.nextPageToken;
    } while (pagina);
    return documentos;
  }

  /** Lee un documento suelto. `null` si no existe. */
  async obtenerDocumento(coleccion: string, id: string): Promise<DocumentoJson | null> {
    const respuesta = (await this.pedir(
      "GET",
      `${rutaDocumentos(this.destino)}/${coleccion}/${encodeURIComponent(id)}`,
      undefined,
      [404],
    )) as { fields?: CamposFirestore; error?: unknown } | null;
    if (respuesta === null) return null;
    return objetoDesdeCampos(respuesta.fields ?? {});
  }

  /**
   * Escribe un documento suelto. Con `soloCampos` es un merge (no pisa el
   * resto); sin él, reemplaza el documento entero.
   */
  async escribirDocumento(
    coleccion: string,
    id: string,
    datos: Record<string, ValorJson>,
    soloCampos?: string[],
    camposCrudos?: CamposFirestore,
  ): Promise<void> {
    const campos = { ...camposDesdeObjeto(datos), ...(camposCrudos ?? {}) };
    const parametros = new URLSearchParams();
    for (const campo of soloCampos ?? Object.keys(campos)) {
      parametros.append("updateMask.fieldPaths", rutaDeCampo(campo));
    }
    await this.pedir(
      "PATCH",
      `${rutaDocumentos(this.destino)}/${coleccion}/${encodeURIComponent(id)}?${parametros.toString()}`,
      { fields: campos },
    );
  }

  /**
   * Aplica escrituras en lotes de hasta 500 con `batchWrite`.
   *
   * `batchWrite` devuelve un estado POR escritura: un lote puede volver con
   * HTTP 200 y una escritura fallada adentro. Si no se mira ese arreglo, el
   * seed reporta éxito sobre algo que no se escribió.
   *
   * Los reintentos de `pedir` son del HTTP del LOTE (429/5xx), no de una
   * escritura fallada dentro de un 200: esa aborta la corrida y la repara la
   * corrida siguiente, que es para lo que sirve ser idempotente.
   */
  async escribirLotes(escrituras: Escritura[]): Promise<void> {
    for (let desde = 0; desde < escrituras.length; desde += MAXIMO_POR_LOTE) {
      const lote = escrituras.slice(desde, desde + MAXIMO_POR_LOTE);
      const cuerpo = (await this.pedir("POST", `${rutaDocumentos(this.destino)}:batchWrite`, {
        writes: lote.map((escritura) => {
          const update: Record<string, unknown> = { name: escritura.nombre, fields: escritura.campos };
          const write: Record<string, unknown> = { update };
          if (escritura.soloCampos) {
            write["updateMask"] = { fieldPaths: escritura.soloCampos.map(rutaDeCampo) };
          }
          return write;
        }),
      })) as { status?: Array<{ code?: number; message?: string }> };
      const estados = cuerpo.status ?? [];
      estados.forEach((estado, indice) => {
        if (estado.code !== undefined && estado.code !== 0) {
          const fallada = lote[indice];
          throw new Error(
            `Escritura rechazada (${fallada?.nombre ?? indice}): código ${estado.code} ${estado.message ?? ""}`,
          );
        }
      });
    }
  }

  /**
   * Una petición a la API, con reintentos ante 429 y 5xx.
   *
   * `codigosVacios` son los HTTP que NO son error y devuelven `null` (404 al
   * leer un documento que todavía no existe).
   */
  private async pedir(
    metodo: string,
    ruta: string,
    cuerpo?: unknown,
    codigosVacios: number[] = [],
  ): Promise<unknown> {
    const url = `${this.destino.raiz}/${ruta}`;
    let ultimoError = "";
    for (let intento = 0; intento <= ESPERAS_REINTENTO.length; intento += 1) {
      let respuesta: Response;
      try {
        respuesta = await fetch(url, {
          method: metodo,
          headers: {
            Authorization: `Bearer ${this.destino.token}`,
            "Content-Type": "application/json",
          },
          ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
        });
      } catch (error) {
        ultimoError = `sin respuesta: ${(error as Error).message}`;
        await esperar(ESPERAS_REINTENTO[intento] ?? 0);
        continue;
      }
      if (codigosVacios.includes(respuesta.status)) return null;
      if (respuesta.ok) {
        const texto = await respuesta.text();
        return texto === "" ? {} : JSON.parse(texto);
      }
      const texto = await respuesta.text();
      ultimoError = `HTTP ${respuesta.status}: ${texto.slice(0, 400)}`;
      const recuperable = respuesta.status === 429 || respuesta.status >= 500;
      if (!recuperable || intento === ESPERAS_REINTENTO.length) break;
      await esperar(ESPERAS_REINTENTO[intento] ?? 0);
    }
    throw new Error(`${metodo} ${url} falló — ${ultimoError}`);
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, ms));
}

/** Reexportado para que el resto no tenga que importar de dos lugares. */
export type { CamposFirestore, DocumentoJson, ValorFirestore, ValorJson };
