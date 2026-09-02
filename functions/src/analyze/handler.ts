/**
 * El endpoint `analyze`, sin Express.
 *
 * Esta función recibe un pedido ya leído y devuelve `{ status, body }`. No
 * conoce `req` ni `res`, no construye el cliente de Anthropic y no llama a
 * `getFirestore()`: todo lo que hace IO entra por `Dependencias`. Es la misma
 * separación que sostiene el motor (decisión aparte de la lectura), corrida un
 * nivel para afuera — y es lo que permite que el test del camino completo
 * "foto → modelo → motor → persistencia" corra con un modelo falso y una base de
 * emulador, midiendo lo que quedó escrito en vez de confiar en que se escribió.
 *
 * EL CIRCUITO, en orden:
 *   1. validar el pedido            (puro)
 *   2. índice del catálogo          (una vez por instancia caliente)
 *   3. visión                       (la ÚNICA llamada al modelo)
 *   4. `analizarEscaneo`            (puro: matching + aritmética + composición)
 *   5. persistir scan + curación    (IO)
 */
import { analizarEscaneo, type CatalogIndex, type EngineResult } from "../engine";
import type { AppConfig } from "../config";
import {
  CLAVE_NO_ES_COMIDA,
  ErrorDeAnalisis,
  TEXTO_NO_ES_COMIDA_EN_FRIO,
  resolverTexto,
  respuestaDeError,
  type CodigoDeError,
  type CuerpoDeError,
} from "./errores";
import { MEDIA_TYPES, pedirVision, type ClienteDeVision, type MediaType, type OpcionesDeVision } from "./vision";

/**
 * El dueño por defecto de un scan MIENTRAS NO HAY LOGIN.
 *
 * Es PROVISORIO y tiene fecha de vencimiento: el login real llega en la Fase 4
 * y ahí `owner_id` pasa a salir del token de Firebase Auth, no del cuerpo del
 * pedido. Hasta entonces todos los scans de desarrollo caen bajo este dueño, y
 * la subcolección `owners/{id}/scans` ya existe con la forma definitiva — cuando
 * llegue el uid real no hay migración, hay un valor distinto.
 */
export const DUEÑO_PROVISORIO = "anon-dev";

/**
 * Techo del base64 que aceptamos: ~1,5 MB de imagen.
 *
 * El cliente comprime a ~1024 px y JPEG 80 antes de subir (§3 del plan), lo que
 * da entre 100 y 350 KB de base64. El techo está un orden de magnitud arriba: no
 * corta el uso normal y sí corta un envío que no puede venir de nuestra PWA.
 */
export const MAX_BASE64_CHARS = 2_000_000;

/** El pedido, ya leído. `body` es lo que sea que haya llegado. */
export interface PedidoDeAnalisis {
  method: string;
  body: unknown;
}

export interface Dependencias {
  cliente: ClienteDeVision;
  /** El índice del catálogo. Se pide una vez por request y se resuelve al vuelo. */
  indice: () => Promise<CatalogIndex>;
  config: () => Promise<{ config: AppConfig }>;
  /** Persiste el scan y la cola. Separada para poder medirla o suprimirla. */
  persistir: (datos: DatosAPersistir) => Promise<void>;
  nuevoScanId: () => string;
  ahora?: () => number;
  opcionesDeVision?: OpcionesDeVision;
  /** Adónde van los avisos. Por defecto, a ningún lado (los tests no logean). */
  advertir?: (mensaje: string, detalle: Record<string, unknown>) => void;
}

export interface DatosAPersistir {
  owner_id: string;
  scan_id: string;
  resultado: EngineResult;
  meta: MetaDeRespuesta;
}

export interface MetaDeRespuesta {
  model: string;
  kb_version: string;
  /** El total del endpoint, de punta a punta. */
  latency_ms: number;
  /** Cuánto de ese total se fue en el modelo. Additivo: sirve para calibrar. */
  model_latency_ms: number;
  tokens_in: number;
  tokens_out: number;
}

export interface CuerpoDeAnalisis {
  scan_id: string | null;
  is_food: boolean;
  items: EngineResult["items"];
  totals: EngineResult["totals"];
  meta: MetaDeRespuesta;
  /** Solo cuando `is_food` es false: el texto simpático que ve el usuario. */
  message_es?: string;
  /**
   * ¿Quedó escrito el expediente? Additivo y honesto: si la persistencia falla,
   * el análisis ya se pagó y se devuelve igual, pero nadie tiene que suponer que
   * se guardó.
   */
  persisted: boolean;
}

export interface RespuestaDeAnalisis {
  status: number;
  body: CuerpoDeAnalisis | CuerpoDeError;
}

// ---------------------------------------------------------------------------
// Validación del pedido (pura)
// ---------------------------------------------------------------------------

export interface EntradaValidada {
  image_base64: string;
  media_type: MediaType;
  owner_id: string;
}

const PREFIJO_DATA_URI = /^data:image\/(jpeg|png|webp);base64,/;
const SOLO_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Valida el cuerpo del POST. Lanza `ErrorDeAnalisis` con el código exacto.
 *
 * Acepta el `data:` URI además del base64 pelado porque es lo que devuelve
 * `canvas.toDataURL()` en el navegador: rechazarlo obligaría a cada cliente a
 * cortar el prefijo, y ese corte hecho mal es un bug de una sola línea que se
 * descubre con una imagen ilegible en producción.
 */
export function validarEntrada(body: unknown): EntradaValidada {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ErrorDeAnalisis("cuerpo_invalido", "el cuerpo del pedido no es un objeto JSON");
  }
  const objeto = body as Record<string, unknown>;

  const crudo = objeto["image_base64"];
  if (typeof crudo !== "string" || crudo.length === 0) {
    throw new ErrorDeAnalisis("cuerpo_invalido", "falta `image_base64` o no es una cadena");
  }

  const media_type = objeto["media_type"];
  if (typeof media_type !== "string" || !(MEDIA_TYPES as readonly string[]).includes(media_type)) {
    throw new ErrorDeAnalisis(
      "cuerpo_invalido",
      `\`media_type\` tiene que ser uno de ${MEDIA_TYPES.join(", ")}`,
    );
  }

  const owner = objeto["owner_id"];
  if (owner !== undefined && (typeof owner !== "string" || owner.trim().length === 0)) {
    throw new ErrorDeAnalisis("cuerpo_invalido", "`owner_id`, si viene, tiene que ser una cadena no vacía");
  }

  const sinPrefijo = crudo.replace(PREFIJO_DATA_URI, "").replace(/\s+/g, "");
  if (sinPrefijo.length > MAX_BASE64_CHARS) {
    throw new ErrorDeAnalisis(
      "imagen_muy_grande",
      `la imagen trae ${sinPrefijo.length} caracteres de base64 y el techo es ${MAX_BASE64_CHARS}`,
    );
  }
  if (sinPrefijo.length === 0 || sinPrefijo.length % 4 !== 0 || !SOLO_BASE64.test(sinPrefijo)) {
    throw new ErrorDeAnalisis("imagen_invalida", "`image_base64` no es base64 válido");
  }

  return {
    image_base64: sinPrefijo,
    media_type: media_type as MediaType,
    owner_id: typeof owner === "string" ? owner.trim() : DUEÑO_PROVISORIO,
  };
}

// ---------------------------------------------------------------------------
// El circuito
// ---------------------------------------------------------------------------

/** Corre el análisis entero y devuelve el par `{ status, body }`. Nunca lanza. */
export async function manejarAnalyze(
  pedido: PedidoDeAnalisis,
  deps: Dependencias,
): Promise<RespuestaDeAnalisis> {
  const ahora = deps.ahora ?? Date.now;
  const comenzo = ahora();
  let copy: Record<string, string> = {};
  let configPublicada: AppConfig | null = null;

  try {
    if (pedido.method.toUpperCase() !== "POST") {
      throw new ErrorDeAnalisis("metodo_no_permitido", `llegó un ${pedido.method}`);
    }

    // El copy se lee ANTES de poder fallar: un error que se responde con el
    // texto en frío teniendo la configuración a mano sería un error evitable.
    try {
      configPublicada = (await deps.config()).config;
      copy = configPublicada.copy ?? {};
    } catch {
      copy = {};
    }

    const entrada = validarEntrada(pedido.body);
    const indice = await deps.indice();

    // La `kb_version` cruzada, que el motor deja explícitamente a esta card.
    // NO aborta: el scan estampa la versión CON LA QUE SE CALCULÓ, así que la
    // trazabilidad está a salvo igual. Lo que la diferencia delata es que uno de
    // los dos seeds no corrió (el catálogo y `config/app` los estampa el mismo
    // seeder), y eso hay que verlo en el log antes de que alguien compare dos
    // scans y no entienda por qué no dan lo mismo.
    const esperada = configPublicada?.kb_version ?? null;
    if (esperada !== null && esperada !== indice.kb_version) {
      deps.advertir?.("la kb_version del catálogo no es la que config/app espera", {
        catalogo: indice.kb_version,
        config_app: esperada,
      });
    }

    const { vision, meta: metaVision } = await pedirVision(
      deps.cliente,
      { image_base64: entrada.image_base64, media_type: entrada.media_type },
      deps.opcionesDeVision ?? {},
    );

    const resultado = analizarEscaneo(vision, indice);

    const meta: MetaDeRespuesta = {
      model: metaVision.model,
      kb_version: resultado.kb_version,
      latency_ms: ahora() - comenzo,
      model_latency_ms: metaVision.latency_ms,
      tokens_in: metaVision.tokens_in,
      tokens_out: metaVision.tokens_out,
    };

    // La foto que no es comida: 200, ítems vacíos, copy simpático y NADA
    // escrito. No se persiste el scan a propósito (§7 del plan): no hubo
    // análisis que guardar y el expediente de una foto de un perro no le sirve
    // a nadie. `scan_id` viaja en `null` porque no hay documento que nombrar.
    if (!resultado.es_comida) {
      const texto = resolverTexto(CLAVE_NO_ES_COMIDA, TEXTO_NO_ES_COMIDA_EN_FRIO, copy);
      return {
        status: 200,
        body: {
          scan_id: null,
          is_food: false,
          items: [],
          totals: null,
          meta,
          message_es: texto.message_es,
          persisted: false,
        },
      };
    }

    const scan_id = deps.nuevoScanId();
    let persisted = true;
    try {
      await deps.persistir({ owner_id: entrada.owner_id, scan_id, resultado, meta });
    } catch (err) {
      // El análisis ya se pagó: se devuelve igual, con `persisted: false` para
      // que nadie suponga que quedó escrito.
      persisted = false;
      deps.advertir?.("no se pudo persistir el scan", { scan_id, error: describir(err) });
    }

    return {
      status: 200,
      body: {
        scan_id,
        is_food: true,
        items: resultado.items,
        totals: resultado.totals,
        meta,
        persisted,
      },
    };
  } catch (err) {
    const codigo: CodigoDeError = err instanceof ErrorDeAnalisis ? err.codigo : "error_interno";
    const detalle = err instanceof ErrorDeAnalisis ? err.detalle : describir(err);
    deps.advertir?.("analyze falló", { codigo, detalle });
    return respuestaDeError(codigo, copy);
  }
}

function describir(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
