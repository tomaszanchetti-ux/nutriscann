/* =============================================================================
 * GENERADO desde kb/src/nutrients.ts — NO EDITAR.
 *
 * Esto es una COPIA. La fuente de verdad es `kb/src/nutrients.ts` y se edita allá.
 *
 * Por qué hay una copia en vez de un import: el repo NO USA WORKSPACES DE NPM
 * (regla del proyecto). El hoisting de workspaces rompe el empaquetado de Cloud
 * Functions, que se despliega con su propio `node_modules` y solo puede requerir
 * lo que esté dentro de `functions/`. Un import a `../../kb/src` compila en local
 * y explota en la nube.
 *
 * Cómo se evita que las dos copias se separen: hay un candado que las compara
 * BYTE A BYTE en `functions/src/kb/copias.test.ts`. Si alguien edita una y no la
 * otra, el test falla y la CI no pasa. Todo lo que está debajo del centinela es
 * el archivo original, sin una coma de diferencia — el candado lo exige.
 *
 * Para regenerarla: copiar `kb/src/nutrients.ts` debajo del centinela, tal cual.
 * =============================================================================
 */
// ---8<--- COPIA BYTE A BYTE DEL ORIGINAL — TODO LO QUE SIGUE ES kb/src/<archivo> ---8<---
/**
 * El mapeo de nutrientes, POR DATASET.
 *
 * GOTCHA CRÍTICO (medido en el Bloque 0, 65/65 verificado): FNDDS guarda en
 * `food_nutrient.nutrient_id` el `nutrient_nbr` (208 = energía), mientras que
 * SR Legacy y Foundation guardan ahí el `nutrient.id` (1008 = energía). Un
 * mapeo único para los tres datasets no falla con una excepción: devuelve
 * VACÍO EN SILENCIO para la fuente más valiosa. De ahí el candado de
 * aceptación por fuente en `locks.ts`.
 *
 * Los códigos van en orden de preferencia: el primero que exista, gana.
 */
import type { SourceId } from "./types";

/** Los ocho campos del catálogo más el alcohol, que no se emite pero se usa. */
export type NutrientKey =
  | "kcal"
  | "protein_g"
  | "carbs_g"
  | "fat_g"
  | "fiber_g"
  | "sat_fat_g"
  | "sugars_g"
  | "sodium_mg"
  /** No entra al catálogo: solo alimenta el predictor de Atwater (7 kcal/g). */
  | "alcohol_g";

/** Los cuatro que alimentan campos obligatorios de `per_100g`. */
export type RequiredNutrientKey = "kcal" | "protein_g" | "carbs_g" | "fat_g";
/** Los cuatro opcionales de `per_100g`. */
export type OptionalNutrientKey = "fiber_g" | "sat_fat_g" | "sugars_g" | "sodium_mg";

export type NutrientBundle = Partial<Record<NutrientKey, number>>;

export const NUTRIENT_CODES: Record<SourceId, Record<NutrientKey, number[]>> = {
  usda_sr_legacy: {
    kcal: [1008],
    protein_g: [1003],
    carbs_g: [1005],
    fat_g: [1004],
    fiber_g: [1079],
    sat_fat_g: [1258],
    sugars_g: [2000],
    sodium_mg: [1093],
    alcohol_g: [1018],
  },
  usda_foundation: {
    // Foundation calcula la energía por factores en buena parte de su catálogo:
    // 1008 (Energy) puede faltar y hay que caer a Atwater General y Específicos.
    kcal: [1008, 2047, 2048],
    protein_g: [1003],
    carbs_g: [1005],
    fat_g: [1004],
    fiber_g: [1079],
    sat_fat_g: [1258],
    // En Foundation los azúcares viven en 1063 ("Total NLEA"); el 2000 casi no
    // existe (5 alimentos en todo el dataset), pero se deja como respaldo.
    sugars_g: [1063, 2000],
    sodium_mg: [1093],
    alcohol_g: [1018],
  },
  usda_fndds: {
    kcal: [208],
    protein_g: [203],
    carbs_g: [205],
    fat_g: [204],
    fiber_g: [291],
    sat_fat_g: [606],
    sugars_g: [269],
    sodium_mg: [307],
    alcohol_g: [221],
  },
};

/** Los cuatro que no pueden faltar: sin ellos no se puede cuantificar nada. */
export const REQUIRED_KEYS: RequiredNutrientKey[] = ["kcal", "protein_g", "carbs_g", "fat_g"];

/** Los cuatro opcionales, ahí para las reglas de la OPS y para la v2. */
export const OPTIONAL_KEYS: OptionalNutrientKey[] = ["fiber_g", "sat_fat_g", "sugars_g", "sodium_mg"];

/**
 * Invierte el mapeo: código de nutriente -> qué campo alimenta y con qué
 * prioridad. Se arma una sola vez por dataset y evita recorrer tablas por cada
 * una de las millones de filas de `food_nutrient.csv`.
 */
export function codeIndex(source: SourceId): Map<number, { key: NutrientKey; rank: number }> {
  const index = new Map<number, { key: NutrientKey; rank: number }>();
  const codes = NUTRIENT_CODES[source];
  for (const key of Object.keys(codes) as NutrientKey[]) {
    (codes[key] ?? []).forEach((code, rank) => index.set(code, { key, rank }));
  }
  return index;
}
