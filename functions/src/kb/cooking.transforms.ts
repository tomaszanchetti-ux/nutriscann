/* =============================================================================
 * GENERADO desde kb/curation/cooking.transforms.json — NO EDITAR.
 *
 * La fuente de verdad es ese JSON de curación, con la fuente medida de cada
 * factor escrita al lado (n, mediana, p10, p90). Acá viajan SOLO los tres campos
 * que la matemática necesita: el resto es documentación y no tiene por qué
 * subirse a Cloud Functions.
 *
 * Por qué es un módulo TypeScript y no una copia del JSON: `tsc` compila
 * `src/**\/*.ts` a `lib/` y NO copia archivos JSON. Un `require` relativo a un
 * .json desde `lib/kb/` funcionaría en local (donde `src/` está al lado) y
 * fallaría en el paquete desplegado. Como const de TypeScript no hay archivo que
 * encontrar: la tabla ya está adentro del bundle. Y el motor sigue sin leer nada.
 *
 * Cómo se evita que las dos copias se separen: hay un candado que compara esta
 * tabla, clave por clave, contra el JSON de curación
 * (`functions/src/kb/copias.test.ts`). Si alguien mide de nuevo un factor y
 * actualiza el JSON, el test falla hasta que se actualice también esto.
 * =============================================================================
 */
import type { CookingTransform } from "./transforms";

/**
 * Los siete métodos declarados. `mezclado` es el de por defecto y su factor
 * 1,000 no es un supuesto: es la convención MEDIDA de FNDDS para composiciones
 * (290 recetas resueltas al 100 %, rendimiento implícito mediana 1,000).
 */
export const COOKING_TRANSFORMS: Record<string, CookingTransform> = {
  crudo: { id: "crudo", factor_peso: 1, aceite_absorbido_pct: 0, aceite_ref: null },
  mezclado: { id: "mezclado", factor_peso: 1, aceite_absorbido_pct: 0, aceite_ref: null },
  frito: { id: "frito", factor_peso: 1, aceite_absorbido_pct: 6.5, aceite_ref: "fdc-2710186" },
  horneado: { id: "horneado", factor_peso: 0.759, aceite_absorbido_pct: 0, aceite_ref: null },
  plancha: { id: "plancha", factor_peso: 0.757, aceite_absorbido_pct: 0, aceite_ref: null },
  hervido: { id: "hervido", factor_peso: 1.113, aceite_absorbido_pct: 0, aceite_ref: null },
  horneado_masa: { id: "horneado_masa", factor_peso: 0.891, aceite_absorbido_pct: 0, aceite_ref: null },
};
