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
 *
 * `manual/<origen>` es la curación manual, la precedencia MÁS ALTA del pipeline
 * (`SR < Foundation < FNDDS < curación manual`). El origen viaja pegado al
 * provenance a propósito: un valor que salió de la etiqueta de un producto
 * comercial no es lo mismo que uno que salió de un laboratorio de USDA, y quien
 * lea el catálogo tiene que poder distinguirlos sin abrir otro archivo.
 */
export type ManualProvenance = `manual/${string}`;
/** Un valor derivado de una receta compuesta (card 1.7). */
export type RecipeProvenance = "receta";
export type Provenance = SourceId | "curation" | ManualProvenance | RecipeProvenance;

/**
 * Fuentes que aportan alimentos al catálogo (Foundation solo desempata valores).
 * `manual` entra con la card 1.6: alimentos que USDA no tiene y que la curación
 * declara enteros, con su propio id (`manual-salmorejo`) y su propia trazabilidad.
 */
export type UsdaFoodSource = "usda_fndds" | "usda_sr_legacy";
export type FoodSource = UsdaFoodSource | "manual" | "receta";

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
 * Un alias con cuánto se le puede creer.
 *
 * El formato es ADITIVO y retrocompatible: un alias en texto plano sigue
 * valiendo lo que valía —confianza 1,0, el alimento ES lo que el alias nombra—
 * y el objeto aparece solo cuando hay una reserva que declarar. Nace en la card
 * 1.6, donde "milanesa" no apunta a una milanesa sino al gemelo nutricional más
 * cercano que USDA sí mide: sin un número al lado, el motor no puede distinguir
 * un nombre exacto de una estimación.
 *
 * La escala está declarada en `kb/curation/README.md` y tiene cuatro peldaños:
 * 1,0 el alimento es el plato · 0,8 gemelo fuerte · 0,6 gemelo con reserva ·
 * 0,5 gemelo pobre (sirve de estimación, no de número).
 */
export interface AliasWithConfidence {
  alias: string;
  confidence: number;
}

export type Alias = string | AliasWithConfidence;

/** La confianza de un alias en texto plano: el alimento ES lo que el alias nombra. */
export const PLAIN_ALIAS_CONFIDENCE = 1;

/** Los cuatro peldaños declarados. Cualquier otro valor rompe el candado de esquema. */
export const ALIAS_CONFIDENCE_SCALE = [1, 0.8, 0.6, 0.5] as const;

/** El texto de un alias, venga en texto plano o con confianza. */
export function aliasText(alias: Alias): string {
  return typeof alias === "string" ? alias : alias.alias;
}

/** La confianza de un alias: 1,0 si vino en texto plano. */
export function aliasConfidence(alias: Alias): number {
  return typeof alias === "string" ? PLAIN_ALIAS_CONFIDENCE : alias.confidence;
}

/**
 * Un alimento del catálogo.
 *
 * `names` es un objeto por idioma A PROPÓSITO: el mercado es Europa + LATAM y
 * sumar portugués o francés mañana es agregar una clave, no refactorizar.
 * `names.en` viene de USDA y es la clave de matching contra lo que identifica
 * el modelo; `names.es` y los aliases salen de la curación.
 *
 * `caveats` es opcional y aparece solo donde hace falta: es el lugar donde una
 * entrada de curación manual declara lo que su fuente NO dice (valores por 100
 * ml y no por 100 g, sin dato de fibra), y desde la DT-13 también donde el build
 * escribe la salvedad de un genérico de sodio alto. La clave no existe en las
 * demás fichas y el catálogo no engorda por nada.
 */
export interface CanonicalFood {
  id: string;
  source: FoodSource;
  source_ref: string;
  names: { en: string; es: string | null };
  aliases: { es: Alias[] };
  category: string;
  per_100g: Per100g;
  portion_hints: PortionHint[];
  default_portion_g: number;
  provenance: Record<string, Provenance>;
  deprecated: boolean;
  /**
   * La ficha mide el PROMEDIO de una familia, no un alimento (DT-13). USDA lo
   * dice en su inglés (`Cheese, NFS`, `Beans, NS as to type`) y la curación lo
   * borra del español a propósito, así que sin esta marca el motor de la fase 2
   * tendría que volver a parsear el nombre en inglés para saber cuánto creerle
   * a un match. Solo existe donde vale `true`: un `generic: false` en las otras
   * mil fichas sería una clave que no dice nada, repetida mil veces.
   */
  generic?: true;
  caveats?: string[];
  /**
   * De qué está hecho, cuando el alimento se DERIVÓ de una receta (card 1.7).
   * Viaja al catálogo a propósito: es la única forma de que quien lea un valor
   * pueda rehacer la cuenta. Solo existe en `source: "receta"`.
   */
  receta?: {
    metodo: string;
    ingredientes: { ref: string; grams: number }[];
    peso_entrada_g: number;
    aceite_absorbido_g: number;
    peso_final_g: number;
    rendimiento_de: "transformacion" | "receta";
  };
}

/**
 * Una guarda de vocabulario: un término que NO puede nombrar a ciertas fichas.
 *
 * Nace con `chorizo`, que es un embutido y también la mitad del nombre de un
 * corte vacuno (`Bife de chorizo`). En el BUILD la comparación es por igualdad
 * exacta sobre el término normalizado, no por subcadena: el nombre compuesto es
 * correcto y lo que se prohíbe es el término a secas, como nombre o como alias.
 *
 * VIVE EN `types.ts` Y NO EN `curation.ts` DESDE LA DT-32, y el motivo es todo el
 * arreglo de esa deuda: la guarda dejó de ser un asunto interno del build y pasó
 * a VIAJAR EN EL CATÁLOGO (`Catalog.guardas`), que es el archivo que el motor lee.
 * Hasta la DT-32 había dos listas —una acá que blindaba el catálogo y otra escrita
 * a mano en `functions/src/engine/catalog.ts` que blindaba el matcher— y
 * divergían: dieciocho guardas escritas no impedían que el difuso llegara a la
 * ficha prohibida. Ahora hay UNA sola lista, la declara la curación y el build la
 * emite; `types.ts` es el único archivo que se copia byte a byte a `functions/`,
 * así que poner el tipo acá es lo que hace que las dos puntas hablen del mismo
 * objeto y no de dos parecidos.
 */
export interface VocabularyGuard {
  termino: string;
  /** Los ids del catálogo donde ese término está prohibido. */
  prohibido_en: string[];
  /**
   * Palabras que LEVANTAN la prohibición: si la consulta las trae, quien habló
   * nombró explícitamente la variante y la guarda ya no aplica ("pepinillos
   * DULCES"). Solo la usa el MATCHER: en el build la comparación es por igualdad
   * exacta contra el nombre de la ficha y no hay consulta donde buscarlas.
   */
  salvo_si_contiene?: string[];
  motivo: string;
}

export interface Catalog {
  /** semver + hash corto del contenido: mismo contenido ⇒ misma versión. */
  kb_version: string;
  generated_from: {
    selection: string;
    sources: SourceId[];
  };
  /**
   * LAS GUARDAS DE VOCABULARIO, EMITIDAS POR EL BUILD (DT-32).
   *
   * Es la cuarta clave del encabezado y entró por el patrón de la regla 1 del
   * proyecto: lo declarativo viaja en el catálogo y la constante del código es
   * solo arranque en frío. La curación las escribe en
   * `kb/curation/guardas.vocabulario.json`, el build las verifica contra las
   * fichas (candado 1) y las copia acá tal cual; `construirIndice` las lee de
   * este campo y con eso la MISMA lista que rompe el build cuando una ficha se
   * llama mal impide que el difuso llegue a esa ficha en runtime.
   *
   * Entran en la `kb_version`: dos catálogos con las mismas fichas y distintas
   * guardas responden distinto, así que son contenido y no metadatos.
   */
  guardas: VocabularyGuard[];
  foods: CanonicalFood[];
}
