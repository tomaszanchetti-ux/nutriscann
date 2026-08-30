/**
 * El contrato del catálogo canónico.
 *
 * Este archivo es la forma exacta de `kb/build/foods.canonical.json`, el
 * artefacto que consumen el seed (card 1.5) y el motor de análisis (fase 2).
 * Cambiar una clave de acá es cambiar el contrato con el resto del sistema.
 */

/** Los datasets de USDA declarados en `kb/sources.json`. */
export type SourceId = "usda_sr_legacy" | "usda_foundation" | "usda_fndds";

/**
 * De dónde salió un campo. Foundation aparece acá aunque no aporte alimentos
 * propios: pisa valores puntuales de per_100g y eso queda registrado campo a
 * campo, no a nivel documento.
 */
export type Provenance = SourceId | "curation";

/** Fuentes que aportan alimentos al catálogo (Foundation solo desempata valores). */
export type FoodSource = "usda_fndds" | "usda_sr_legacy";

/**
 * Valores por 100 g. Los cuatro primeros son obligatorios (sin ellos el
 * alimento no sirve para cuantificar nada); los otros cuatro son opcionales y
 * están acá porque salen gratis del mismo CSV: agregarlos después obligaría a
 * re-correr todo el pipeline, y las reglas de la OPS los necesitan.
 */
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

/**
 * Una porción típica: cuántos gramos pesa y cómo se la nombra.
 *
 * Bilingüe por la misma razón que `names`: la etiqueta de una porción es texto
 * que ve el usuario ("1 unidad mediana"), no metadato. `label_en` viene de USDA
 * y siempre está; `label_es` sale de la curación y arranca en `null` — el build
 * no traduce nada.
 */
export interface PortionHint {
  grams: number;
  label_en: string;
  label_es: string | null;
}

/**
 * Un alimento del catálogo.
 *
 * `names` es un objeto por idioma A PROPÓSITO: el mercado es Europa + LATAM y
 * sumar portugués o francés mañana es agregar una clave, no refactorizar.
 * `names.en` viene de USDA y es la clave de matching contra lo que identifica
 * el modelo; `names.es` y los aliases salen de la curación.
 */
export interface CanonicalFood {
  id: string;
  source: FoodSource;
  source_ref: string;
  names: { en: string; es: string | null };
  aliases: { es: string[] };
  category: string;
  per_100g: Per100g;
  portion_hints: PortionHint[];
  default_portion_g: number;
  provenance: Record<string, Provenance>;
  deprecated: boolean;
}

export interface Catalog {
  /** semver + hash corto del contenido: mismo contenido ⇒ misma versión. */
  kb_version: string;
  generated_from: {
    selection: string;
    sources: SourceId[];
  };
  foods: CanonicalFood[];
}
