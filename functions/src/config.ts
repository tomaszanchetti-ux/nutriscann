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

import { LIMITES_EN_FRIO, normalizarLimites, type LimitesDeCupo } from "./cupo/decision";

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
  /**
   * Máximo de análisis por dueño y por MES: la garantía que se le comunica al
   * usuario (§3 del contrato de la WS09). Tu API key es la que paga.
   */
  max_scans_per_month: number;
  /**
   * Máximo por dueño y por DÍA: el freno anti-ráfaga. No es una promesa de
   * producto, es lo que evita que una tarde se lleve el mes entero.
   *
   * ⚠️ Este campo y `max_scans_per_month` NO los escribe el seed del catálogo:
   * `kb/seed/src/configuracion.ts` gobierna cinco campos con una máscara y estos
   * dos quedan explícitamente fuera («son de otra mano»). Se publican aparte.
   */
  max_scans_per_day: number;
  /** Textos de la interfaz, editables sin deploy. */
  copy: Record<string, string>;
  /** El documento de reglas publicado. `null` mientras no se haya sembrado. */
  recommendation_rules: ReglasDeRecomendacion | null;
}

/**
 * El arranque en frío. NO es la configuración: es lo mínimo para que la app
 * responda algo sensato el día que `config/app` no exista o Firestore no
 * conteste, y `source` declara cuál de los dos casos ocurrió.
 *
 * Los dos topes salen de `LIMITES_EN_FRIO` (15 al mes, 3 al día) y no de dos
 * números escritos acá: el mismo par que usa la decisión del cupo cuando la
 * configuración no llega, en un solo lugar. `max_scans_per_day` valía 10 y pasa
 * a 3 por la decisión de Tomás del 02/09 (§3 del contrato de la WS09).
 */
export const COLD_START_DEFAULTS: AppConfig = {
  kb_version: null,
  max_scans_per_month: LIMITES_EN_FRIO.por_mes,
  max_scans_per_day: LIMITES_EN_FRIO.por_dia,
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

/**
 * Los dos topes del cupo, resueltos: lo publicado en `config/app` y, detrás, el
 * arranque en frío.
 *
 * Acepta `null` porque el handler llama a esto incluso cuando `loadConfig` falló
 * —ahí la configuración no llegó y rige el arranque en frío—, y así el camino
 * del cupo no tiene una rama «sin configuración» que después nadie prueba.
 */
export function limitesDeCupo(config: AppConfig | null): LimitesDeCupo {
  return normalizarLimites(
    { por_mes: config?.max_scans_per_month, por_dia: config?.max_scans_per_day },
    { por_mes: COLD_START_DEFAULTS.max_scans_per_month, por_dia: COLD_START_DEFAULTS.max_scans_per_day },
  );
}
