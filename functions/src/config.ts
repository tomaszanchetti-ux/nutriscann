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

/**
 * El documento de reglas de recomendación, tal como lo publica el seed.
 *
 * OJO CON LA FORMA: es un OBJETO, no un array. El array (`rules`) es una clave
 * adentro. La declaración anterior decía `unknown[]` y era falsa: `config/app`
 * trae el documento entero de `config/recommendation_rules.json` —con su fuente
 * citada, su gramática de evaluación y su fallback—, porque una regla sin su
 * cita no se puede auditar y sin su gramática no se puede evaluar.
 *
 * LA V1 NO LO CONSUME. La decisión del 31/08 sacó las recomendaciones de la v1
 * (§6 del plan): el documento se publica, viaja hasta acá y queda dormido hasta
 * la v2. El tipo existe para que lo que está publicado esté DECLARADO, no para
 * que alguien lo evalúe: el motor de reglas llega con la v2.
 */
export interface ReglasDeRecomendacion {
  $schema_version: number;
  updated_at: string;
  /** La cita de la fuente (OPS 2016) con página impresa y página del PDF. */
  source: Record<string, unknown>;
  /** La lista CERRADA de tags válidos. */
  tags: string[];
  tags_note: string;
  /** Los campos medidos que llegan del paso 2, con tipo y nulabilidad. */
  fields: Record<string, unknown>;
  fields_note: string;
  /** Los campos calculados, con su fórmula EN EL ARCHIVO (no en el código). */
  derived_fields: Record<string, unknown>;
  derived_fields_note: string;
  /** La gramática y los operadores con los que se evalúa cada `if`. */
  evaluation: Record<string, unknown>;
  /** Las reglas propiamente dichas: `if`, `tag`, `priority`, cita y plantillas. */
  rules: Record<string, unknown>[];
  fallback_tag: string;
  fallback_templates: Record<string, string>;
  fallback_note: string;
  ops_thresholds_reference: Record<string, unknown>[];
  notes: Record<string, unknown>;
}

export interface AppConfig {
  /** Versión del catálogo nutricional que la app espera encontrar. */
  kb_version: string | null;
  /** Máximo de análisis por dueño y por día. Tu API key es la que paga. */
  max_scans_per_day: number;
  /** Textos de la interfaz, editables sin deploy. */
  copy: Record<string, string>;
  /** El documento de reglas publicado. `null` mientras no se haya sembrado. */
  recommendation_rules: ReglasDeRecomendacion | null;
}

const COLD_START_DEFAULTS: AppConfig = {
  kb_version: null,
  max_scans_per_day: 10,
  copy: {},
  recommendation_rules: null,
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
