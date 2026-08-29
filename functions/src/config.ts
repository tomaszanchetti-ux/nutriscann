/**
 * Lectura de la configuración de negocio desde Firestore.
 *
 * Regla de oro del proyecto: NADA HARDCODEADO. Umbrales, textos y reglas de
 * recomendación viven en `config/app` y se editan sin desplegar.
 *
 * Los valores por defecto de este archivo NO son la configuración: son el
 * arranque en frío, lo mínimo para que la app responda si el documento aún no
 * existe. La respuesta declara cuál de los dos casos ocurrió (`source`), para
 * que "está usando defaults" nunca se confunda con "está configurado".
 */
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

export interface AppConfig {
  /** Versión del catálogo nutricional que la app espera encontrar. */
  kb_version: string | null;
  /** Máximo de análisis por dueño y por día. Tu API key es la que paga. */
  max_scans_per_day: number;
  /** Textos de la interfaz, editables sin deploy. */
  copy: Record<string, string>;
  /** Reglas que traducen macros en una recomendación. Se cargan en la Fase 2. */
  recommendation_rules: unknown[];
}

const COLD_START_DEFAULTS: AppConfig = {
  kb_version: null,
  max_scans_per_day: 10,
  copy: {},
  recommendation_rules: [],
};

const CACHE_TTL_MS = 60_000;
let cached: { at: number; value: AppConfig; source: ConfigSource } | null = null;

export type ConfigSource = "firestore" | "cold-start-defaults";

export interface ConfigResult {
  config: AppConfig;
  source: ConfigSource;
}

/**
 * Devuelve la configuración con una caché corta en memoria: una instancia
 * caliente no relee Firestore en cada request, y un cambio en la consola se
 * refleja en menos de un minuto sin redesplegar nada.
 */
export async function loadConfig(): Promise<ConfigResult> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_TTL_MS) {
    return { config: cached.value, source: cached.source };
  }

  try {
    const snap = await getFirestore().doc("config/app").get();
    if (!snap.exists) {
      logger.warn("config/app no existe todavía: usando valores de arranque en frío");
      cached = { at: now, value: COLD_START_DEFAULTS, source: "cold-start-defaults" };
    } else {
      const value = { ...COLD_START_DEFAULTS, ...(snap.data() as Partial<AppConfig>) };
      cached = { at: now, value, source: "firestore" };
    }
  } catch (err) {
    logger.error("No se pudo leer config/app", err);
    cached = { at: now, value: COLD_START_DEFAULTS, source: "cold-start-defaults" };
  }

  return { config: cached.value, source: cached.source };
}
