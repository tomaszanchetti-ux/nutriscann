/* =============================================================================
 * COPIA DE CONTRATO — el original vive en `functions/src/engine/types.ts`.
 *
 * Por qué hay una copia y no un import: el repo NO USA WORKSPACES DE NPM (regla
 * del proyecto, ver CLAUDE.md). `apps/web` y `functions` son dos paquetes que
 * instalan lo suyo; un `import` a `../../functions/src` compilaría en local y se
 * rompería en el build de Vite y en el empaquetado de Cloud Functions.
 *
 * Qué se copió: SOLO los tipos que el front necesita para dibujar el reporte.
 * Los tipos de ENTRADA del motor (`VisionResult`, `VisionItem`) no están acá a
 * propósito: el navegador nunca los ve, manda una foto y recibe un reporte.
 *
 * Si el original cambia, esta copia queda vieja en silencio. Es una deuda
 * conocida (no hay candado de bytes como el de `functions/src/kb/types.ts`) y
 * está declarada en el informe de la card 2.3.
 * ---------------------------------------------------------------------------
 * Origen: functions/src/engine/types.ts + functions/src/kb/types.ts (Per100g)
 * Copiado el 31/08/2026, contra el catálogo 3.0.0+b2b227e1.
 * ========================================================================== */

/** Valores por 100 g. Origen: `kb/src/types.ts` → `Per100g`. */
export interface Per100g {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sat_fat_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
}

/** Los mismos ocho valores, ya escalados a los gramos del plato. */
export type Per100gEscalado = Per100g;

/** Cómo se llegó a la ficha (o a la falta de ficha). */
export type TipoDeMatch = "exacto" | "alias" | "difuso" | "compuesto" | "no_catalogado";

/** Un ingrediente resuelto dentro de un plato compuesto en runtime. */
export interface ComponenteDelPlato {
  termino_en: string;
  grams: number;
  food_id: string;
  name_es: string | null;
  source_ref: string;
  match: TipoDeMatch;
  confidence_match: number;
  generic: boolean;
}

/** La cuenta de una composición, entera y a la vista. */
export interface Composicion {
  metodo: string;
  componentes: ComponenteDelPlato[];
  peso_entrada_g: number;
  aceite_absorbido_g: number;
  aceite_ref: string | null;
  peso_final_g: number;
  rendimiento_de: "transformacion" | "receta";
}

export interface EngineItem {
  termino_en: string;
  food_id: string | null;
  name_es: string | null;
  name_en: string | null;
  source_ref: string | null;
  grams: number;
  /** vision × matching × factores. Es la que se le muestra al usuario. */
  confidence: number;
  confidence_vision: number;
  confidence_match: number;
  match: TipoDeMatch;
  /** Solo cuando vale `true`: la ficha mide el promedio de una familia. */
  generic?: true;
  /**
   * `true` cuando la visión devolvió gramos inutilizables: la ficha se
   * identificó (`food_id` presente) pero no se cuantificó (`nutrients: null`).
   * El `motivo` ya lo explica; el badge sigue siendo el del match, no
   * "no catalogado" — se sabe qué es, no cuánto hay.
   */
  grams_no_estimados?: boolean;
  caveats?: string[];
  per_100g: Per100g | null;
  nutrients: Per100gEscalado | null;
  motivo: string;
  composicion?: Composicion;
}

/** Los ocho valores sumados de todo el plato. */
export interface TotalesNutrientes {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sat_fat_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
}

/**
 * El reparto de calorías por macro. `sin_explicar` NO se normaliza a propósito:
 * la diferencia con 100 es información (alcohol, fibra, redondeos de USDA).
 */
export interface PorcentajesDeMacros {
  protein: number;
  carbs: number;
  fat: number;
  sin_explicar: number;
}

/** Las cuatro claves opcionales que pueden faltar, con el motivo de la falta. */
export type OpcionalAusente = "fiber_g" | "sat_fat_g" | "sugars_g" | "sodium_mg";

export interface EngineTotals {
  nutrients: TotalesNutrientes;
  opcionales_ausentes: Partial<Record<OpcionalAusente, string>>;
  macro_pct: PorcentajesDeMacros | null;
  macro_pct_motivo: string | null;
  grams_total: number;
  grams_cuantificados: number;
  items_incluidos: number;
  items_sin_datos: number;
  /** `true` solo si todos los items del escaneo aportaron números. */
  completo: boolean;
}

// ---------------------------------------------------------------------------
// El sobre del endpoint — contrato fijado por el orquestador de la WS04.
// Origen: la card 2.2 (`POST analyze`). No está en el archivo de tipos del
// motor porque el motor no sabe de HTTP: `items` y `totals` son su salida tal
// cual, y el resto es lo que agrega el endpoint.
// ---------------------------------------------------------------------------

export interface MetaDelScan {
  model: string;
  kb_version: string;
  /** El total del endpoint, de punta a punta. */
  latency_ms: number;
  /** Cuánto de ese total se fue en el modelo. Aditivo: sirve para calibrar. */
  model_latency_ms: number;
  tokens_in: number;
  tokens_out: number;
}

export interface RespuestaDeAnalisis {
  /** `null` cuando no hubo escaneo que guardar (la foto no era comida). */
  scan_id: string | null;
  /** `false` cuando la foto no es comida: `items` viene vacío. */
  is_food: boolean;
  items: EngineItem[];
  /** `null` si NINGÚN item pudo cuantificarse. */
  totals: EngineTotals | null;
  meta: MetaDelScan;
  /** Solo cuando `is_food` es false: el texto simpático que redactó el backend. */
  message_es?: string;
  /**
   * ¿Quedó escrito el expediente? Si la persistencia falla, el análisis ya se
   * pagó y se devuelve igual — pero nadie tiene que suponer que se guardó, así
   * que la pantalla lo dice en el pie del reporte.
   */
  persisted: boolean;
}

/** El cuerpo de un error del backend: un código estable y un texto en español. */
export interface ErrorDelBackend {
  /** `copy_source` declara de dónde salió el texto: "config" o "cold-start-default". */
  error: { code: string; message_es: string; copy_source?: string };
}
