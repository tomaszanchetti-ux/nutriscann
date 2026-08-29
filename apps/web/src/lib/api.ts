/**
 * Cliente del backend de NutriScann.
 *
 * Toda llamada al servidor pasa por acá — la app nunca arma URLs sueltas.
 */
import { functionUrl } from "./firebase";

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
