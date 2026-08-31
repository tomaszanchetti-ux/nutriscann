/**
 * Cliente del backend de NutriScann.
 *
 * Toda llamada al servidor pasa por acá — la app nunca arma URLs sueltas.
 */
import { functionUrl } from "./firebase";
import { RESPUESTA_DE_FIXTURE } from "./fixtures/scan.fixture";
import type { ImagenComprimida } from "./imagen";
import type { ErrorDelBackend, RespuestaDeAnalisis } from "./types";

export interface HealthReport {
  status: "ok" | "error";
  backend_version: string;
  kb_version: string | null;
  kb_status: string;
  config_source: "firestore" | "cold-start-defaults";
  region: string;
  latency_ms: number;
  checked_at: string;
}

/** Pregunta al backend si está vivo y qué versión del catálogo publica. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  let res: Response;
  try {
    res = await fetch(functionUrl("health"), { signal });
  } catch (err) {
    // fetch solo lanza por fallas de red: sin conexión, DNS, o —lo más probable
    // durante la Fase 0— la función todavía no desplegada.
    if (signal?.aborted) throw err;
    throw new Error(
      "No hay respuesta en la dirección del backend. Revisá tu conexión, o que la función esté desplegada.",
    );
  }

  if (!res.ok) {
    throw new Error(`El backend respondió con un error ${res.status}.`);
  }
  return (await res.json()) as HealthReport;
}

// ---------------------------------------------------------------------------
// El análisis de una foto
// ---------------------------------------------------------------------------

/**
 * ¿La app trabaja con el fixture en vez de llamar al backend?
 *
 * Existe porque el front (card 2.3) y el endpoint (card 2.2) se construyeron EN
 * PARALELO contra el mismo contrato: sin esta rama, mirar el reporte era esperar
 * a que el backend estuviera terminado. Se enciende con `VITE_ANALYZE_FIXTURE=1`
 * en `apps/web/.env.local` y se apaga borrando esa línea — ver
 * `apps/web/.env.local.example`.
 *
 * Es explícita, como la del emulador, y NO depende del modo dev de Vite: correr
 * en local contra el backend de verdad tiene que seguir siendo lo normal.
 */
export const USA_FIXTURE_DE_ANALISIS = import.meta.env.VITE_ANALYZE_FIXTURE === "1";

/** Cuánto simula tardar el fixture, para que la pantalla de espera se vea. */
const DEMORA_DEL_FIXTURE_MS = 2600;

/**
 * Un error del análisis con su código estable.
 *
 * `codigo` es el `error.code` del backend cuando el backend contestó, y uno
 * nuestro cuando la falla fue de este lado (`sin_red`, `imagen_ilegible`,
 * `respuesta_ilegible`). El texto ya viene en español y listo para mostrar.
 */
export class ErrorDeAnalisis extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeAnalisis";
    this.codigo = codigo;
  }
}

function esErrorDelBackend(cuerpo: unknown): cuerpo is ErrorDelBackend {
  if (typeof cuerpo !== "object" || cuerpo === null) return false;
  const error = (cuerpo as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const { code, message_es } = error as { code?: unknown; message_es?: unknown };
  return typeof code === "string" && typeof message_es === "string";
}

export interface OpcionesDeAnalisis {
  owner_id?: string;
  signal?: AbortSignal;
}

/**
 * Manda la foto ya comprimida a `analyze` y devuelve el reporte.
 *
 * El contrato (fijado por el orquestador de la WS04):
 *   POST { image_base64, media_type, owner_id? }
 *   200  { scan_id, is_food, items, totals, meta }
 *   ≠200 { error: { code, message_es } }
 */
export async function analizarFoto(
  imagen: ImagenComprimida,
  opciones: OpcionesDeAnalisis = {},
): Promise<RespuestaDeAnalisis> {
  if (USA_FIXTURE_DE_ANALISIS) {
    await new Promise((listo) => setTimeout(listo, DEMORA_DEL_FIXTURE_MS));
    return RESPUESTA_DE_FIXTURE;
  }

  let res: Response;
  try {
    res = await fetch(functionUrl("analyze"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: imagen.image_base64,
        media_type: imagen.media_type,
        ...(opciones.owner_id ? { owner_id: opciones.owner_id } : {}),
      }),
      signal: opciones.signal,
    });
  } catch (err) {
    if (opciones.signal?.aborted) throw err;
    throw new ErrorDeAnalisis(
      "sin_red",
      "No hay respuesta en la dirección del backend. Revisá tu conexión, o que la función esté desplegada.",
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch {
    throw new ErrorDeAnalisis(
      "respuesta_ilegible",
      `El backend respondió ${res.status} y el cuerpo no era JSON.`,
    );
  }

  if (!res.ok) {
    // El backend manda el texto en español: se muestra ESE, no uno inventado
    // acá. Si no vino con la forma esperada, se dice el código HTTP y nada más.
    if (esErrorDelBackend(cuerpo)) {
      throw new ErrorDeAnalisis(cuerpo.error.code, cuerpo.error.message_es);
    }
    throw new ErrorDeAnalisis("http_" + res.status, `El backend respondió con un error ${res.status}.`);
  }

  return cuerpo as RespuestaDeAnalisis;
}
