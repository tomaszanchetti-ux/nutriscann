/**
 * La semántica del seed.
 *
 * Está partida en dos a propósito — el mismo patrón que usa el build de `kb`:
 *
 *   DECISIÓN (`planificar`)  pura, sin red: catálogo + lo que hay en Firestore
 *                            ⇒ qué habría que crear, actualizar, dejar quieto
 *                            y deprecar. Se testea construyendo el escenario.
 *   LECTURA/ESCRITURA (`aplicar`)  habla con Firestore y ejecuta el plan.
 *
 * Reglas duras que implementa (CLAUDE.md §6 y PLAN.md capa [4]):
 *   - Upsert por id, con `kb_version` estampada en cada documento.
 *   - Un alimento que sale del catálogo se marca `deprecated: true` con MERGE
 *     (no se pisa el resto del documento) y JAMÁS se borra: el re-seed es un
 *     re-escaneo, no un DELETE. Este archivo no tiene ninguna operación de
 *     borrado, y esa ausencia es la garantía.
 *   - La segunda corrida sobre la misma base hace CERO escrituras.
 */
import type { AlimentoCrudo, Catalogo } from "./catalogo";
import { camposDistintos, iguales } from "./comparacion";
import {
  ClienteFirestore,
  nombreDocumento,
  type DocumentoJson,
  type Escritura,
} from "./firestore";
import { camposDesdeObjeto, type ValorJson } from "./valores";

export const COLECCION_ALIMENTOS = "foods";
export const COLECCION_CONFIG = "config";
export const DOCUMENTO_META = "kb_meta";

/**
 * LAS GUARDAS DE VOCABULARIO QUE VIAJAN A `config/kb_meta` (DT-32).
 *
 * El motor las lee de ahí y las pasa al índice: son la mitad de producción del
 * arreglo de la DT-32 —la otra mitad, la offline, la resuelve el catálogo del
 * repo—. Sin esto, el matcher desplegado seguiría con las dos guardas de su
 * arranque en frío contra las veintiuna que declara la curación.
 *
 * VAN EN `kb_meta` Y NO EN UNA COLECCIÓN PROPIA porque son parte de la identidad
 * del catálogo publicado, igual que la `kb_version` y los conteos: se escriben y
 * se leen en el mismo momento, entran en el hash de la versión (así que un
 * cambio de guardas SIEMPRE mueve la `kb_version` y por lo tanto reescribe este
 * documento) y una lectura suelta más por instancia sería pagar de más.
 *
 * El seed sigue siendo AGNÓSTICO del esquema: no valida la forma de una guarda
 * —eso ya lo hizo el candado 1 del build— y copia lo que el encabezado traiga.
 * Un catálogo anterior a la DT-32, sin la clave, publica una lista vacía y el
 * motor lo declara al arrancar.
 */
function guardasDelCatalogo(catalogo: Catalogo): ValorJson {
  const guardas = catalogo.encabezado["guardas"];
  return Array.isArray(guardas) ? guardas : [];
}

/** Los conteos que se publican en `config/kb_meta` (claves del documento, en inglés). */
export interface Conteos {
  total: number;
  created: number;
  updated: number;
  unchanged: number;
  deprecated: number;
}

export interface DocumentoPlaneado {
  id: string;
  documento: DocumentoJson;
  /** Solo en actualizaciones: qué campos difieren. Para explicar, no para decidir. */
  campos?: string[];
}

export interface Plan {
  kb_version: string;
  crear: DocumentoPlaneado[];
  actualizar: DocumentoPlaneado[];
  sinCambio: string[];
  /** Documentos que ya no están en el catálogo y hay que marcar `deprecated`. */
  aDeprecar: string[];
  /** Ya estaban marcados: no se vuelven a escribir. */
  yaDeprecados: string[];
}

/**
 * El documento que le corresponde a un alimento: el alimento tal cual viene,
 * más la versión del catálogo del que salió.
 */
export function documentoDeseado(alimento: AlimentoCrudo, kbVersion: string): DocumentoJson {
  return { ...(alimento as Record<string, ValorJson>), kb_version: kbVersion };
}

/**
 * Compara el catálogo con lo que hay publicado y decide qué hacer con cada
 * documento. Pura: recibe el estado, no lo lee.
 */
export function planificar(catalogo: Catalogo, publicados: Map<string, DocumentoJson>): Plan {
  const plan: Plan = {
    kb_version: catalogo.kb_version,
    crear: [],
    actualizar: [],
    sinCambio: [],
    aDeprecar: [],
    yaDeprecados: [],
  };

  const enCatalogo = new Set<string>();
  for (const alimento of catalogo.foods) {
    const id = alimento.id;
    enCatalogo.add(id);
    const documento = documentoDeseado(alimento, catalogo.kb_version);
    const actual = publicados.get(id);
    if (actual === undefined) {
      plan.crear.push({ id, documento });
      continue;
    }
    if (iguales(actual, documento)) {
      plan.sinCambio.push(id);
      continue;
    }
    plan.actualizar.push({ id, documento, campos: camposDistintos(actual, documento) });
  }

  for (const [id, documento] of publicados) {
    if (enCatalogo.has(id)) continue;
    if (documento["deprecated"] === true) plan.yaDeprecados.push(id);
    else plan.aDeprecar.push(id);
  }

  plan.crear.sort((a, b) => a.id.localeCompare(b.id));
  plan.actualizar.sort((a, b) => a.id.localeCompare(b.id));
  plan.sinCambio.sort();
  plan.aDeprecar.sort();
  plan.yaDeprecados.sort();
  return plan;
}

/** Cuántas escrituras implica el plan. Cero ⇒ la corrida es un no-op. */
export function escriturasDelPlan(plan: Plan): number {
  return plan.crear.length + plan.actualizar.length + plan.aDeprecar.length;
}

/** Los conteos que describen la corrida. */
export function conteosDelPlan(plan: Plan, totalCatalogo: number): Conteos {
  return {
    total: totalCatalogo,
    created: plan.crear.length,
    updated: plan.actualizar.length,
    unchanged: plan.sinCambio.length,
    deprecated: plan.aDeprecar.length,
  };
}

/**
 * Traduce el plan a escrituras de Firestore.
 *
 * Crear y actualizar van con REEMPLAZO COMPLETO del documento: así el
 * documento publicado es exactamente el alimento del catálogo, y reponer un
 * alimento deprecado lo devuelve solo a la normalidad (el catálogo trae
 * `deprecated: false`) sin ninguna lógica especial.
 *
 * Deprecar va con MERGE de un único campo: el resto del documento — sus
 * nutrientes, su provenance — queda intacto. Es un alimento retirado, no un
 * alimento borrado.
 */
export function escriturasDeFirestore(plan: Plan, cliente: ClienteFirestore): Escritura[] {
  const escrituras: Escritura[] = [];
  for (const entrada of [...plan.crear, ...plan.actualizar]) {
    escrituras.push({
      nombre: nombreDocumento(cliente.destino, COLECCION_ALIMENTOS, entrada.id),
      campos: camposDesdeObjeto(entrada.documento),
    });
  }
  for (const id of plan.aDeprecar) {
    escrituras.push({
      nombre: nombreDocumento(cliente.destino, COLECCION_ALIMENTOS, id),
      campos: camposDesdeObjeto({ deprecated: true }),
      soloCampos: ["deprecated"],
    });
  }
  return escrituras;
}

/**
 * Cuánto de lo publicado puede deprecar una corrida sin pedir permiso.
 *
 * Deprecar es el único acto casi destructivo del seed: no borra, pero saca un
 * alimento de circulación. Un catálogo truncado — un build a medias, un
 * `--catalog` apuntando al archivo equivocado — depreca en masa, y en silencio
 * sería un desastre silencioso.
 */
export const FRACCION_MAXIMA_DEPRECACIONES = 0.1;

export interface Freno {
  /** Cuántas deprecaciones trae el plan. */
  pedidas: number;
  /** Cuántas se admiten sin permiso explícito. */
  limite: number;
  /** ¿Ese límite lo fijó el usuario con --allow-deprecations? */
  explicito: boolean;
  /** Sobre cuántos documentos publicados se calculó el límite. */
  publicados: number;
}

/** El error que frena una deprecación masiva. Se distingue para poder testearlo. */
export class ErrorDeprecacionMasiva extends Error {
  constructor(readonly freno: Freno) {
    super(
      `La corrida quiere deprecar ${freno.pedidas} de ${freno.publicados} documentos publicados ` +
        `y el máximo sin permiso explícito es ${freno.limite} ` +
        `(${Math.round(FRACCION_MAXIMA_DEPRECACIONES * 100)} % de lo publicado). ` +
        "No se escribió NADA. Suele ser un catálogo truncado o un --catalog equivocado: " +
        "revisá el catálogo con --dry-run. Si la baja masiva es intencional, " +
        `autorizala con --allow-deprecations ${freno.pedidas}.`,
    );
    this.name = "ErrorDeprecacionMasiva";
  }
}

/**
 * ¿Este plan puede deprecar lo que quiere deprecar? Pura: la decisión se toma
 * con números, no leyendo la base.
 */
export function evaluarFreno(
  plan: Plan,
  publicados: number,
  maximoAutorizado?: number,
): { freno: Freno; supera: boolean } {
  const explicito = maximoAutorizado !== undefined;
  const limite = explicito
    ? (maximoAutorizado as number)
    : Math.floor(publicados * FRACCION_MAXIMA_DEPRECACIONES);
  const freno: Freno = { pedidas: plan.aDeprecar.length, limite, explicito, publicados };
  return { freno, supera: freno.pedidas > limite };
}

export interface ResultadoCorrida {
  plan: Plan;
  conteos: Conteos;
  escrituras: number;
  /** ¿Se reescribió `config/kb_meta` en esta corrida? En un simulacro es siempre false. */
  metaEscrita: boolean;
  /** ¿Habría que reescribir `config/kb_meta`? Es lo que el simulacro tiene que reportar. */
  metaSeEscribiria: boolean;
  /** El estado del freno de deprecaciones; en un simulacro, aunque lo supere. */
  freno: Freno;
  /** Solo en simulacro: el plan supera el freno y la corrida real abortaría. */
  frenoSuperado: boolean;
  seco: boolean;
}

export interface OpcionesCorrida {
  /** Reporta el diff y no escribe nada. */
  seco?: boolean;
  /** Techo explícito de deprecaciones (`--allow-deprecations N`). */
  maximoDeprecaciones?: number | undefined;
  /** Inyectable para que los tests no dependan del reloj. */
  ahora?: () => Date;
}

/**
 * Corre el seed completo contra un destino: lee, planifica, chequea el freno de
 * deprecaciones, escribe lo que haga falta y publica `config/kb_meta`.
 *
 * Sobre `seeded_at` — el único campo no determinístico de todo el seed:
 * `config/kb_meta` se reescribe SOLO cuando la corrida cambió algo (o cuando
 * el documento no existe, o cuando cambió la `kb_version`). Si se escribiera
 * siempre, la segunda corrida haría una escritura y la idempotencia sería una
 * frase en un README en vez de un hecho verificable. La consecuencia, que se
 * documenta y se acepta: `seeded_at` es "cuándo cambió el catálogo publicado",
 * no "cuándo se corrió el seed por última vez".
 */
export async function correrSeed(
  cliente: ClienteFirestore,
  catalogo: Catalogo,
  opciones: OpcionesCorrida = {},
): Promise<ResultadoCorrida> {
  const seco = opciones.seco === true;
  const publicados = await cliente.listarColeccion(COLECCION_ALIMENTOS);
  const plan = planificar(catalogo, publicados);
  const conteos = conteosDelPlan(plan, catalogo.foods.length);
  const escrituras = escriturasDelPlan(plan);

  const metaActual = await cliente.obtenerDocumento(COLECCION_CONFIG, DOCUMENTO_META);
  const metaHayQueEscribir =
    escrituras > 0 || metaActual === null || metaActual["kb_version"] !== catalogo.kb_version;

  const { freno, supera } = evaluarFreno(plan, publicados.size, opciones.maximoDeprecaciones);

  if (seco) {
    // El simulacro reporta lo que PASARÍA, incluido que la corrida real
    // abortaría por el freno y que kb_meta se reescribiría.
    return {
      plan,
      conteos,
      escrituras,
      metaEscrita: false,
      metaSeEscribiria: metaHayQueEscribir,
      freno,
      frenoSuperado: supera,
      seco: true,
    };
  }

  // Antes de la primera escritura: si el freno salta, no se escribe NADA — ni
  // las deprecaciones ni las altas. Un catálogo truncado no es medio válido.
  if (supera) throw new ErrorDeprecacionMasiva(freno);

  if (escrituras > 0) {
    await cliente.escribirLotes(escriturasDeFirestore(plan, cliente));
  }

  if (metaHayQueEscribir) {
    const ahora = (opciones.ahora ?? (() => new Date()))();
    await cliente.escribirDocumento(
      COLECCION_CONFIG,
      DOCUMENTO_META,
      {
        kb_version: catalogo.kb_version,
        counts: { ...conteos },
        guardas: guardasDelCatalogo(catalogo),
      },
      undefined,
      { seeded_at: { timestampValue: ahora.toISOString() } },
    );
  }

  return {
    plan,
    conteos,
    escrituras,
    metaEscrita: metaHayQueEscribir,
    metaSeEscribiria: metaHayQueEscribir,
    freno,
    frenoSuperado: false,
    seco: false,
  };
}
