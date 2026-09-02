/**
 * El contrato del motor de análisis: qué entra y qué sale.
 *
 * ESTE ARCHIVO ES LA FRONTERA. A la izquierda queda el paso 1 (la visión, que
 * llega en la card 2.2) y a la derecha el reporte que ve el usuario. En el medio
 * no hay ni una llamada de red: el motor recibe una `VisionResult` y un catálogo
 * YA CARGADO, y devuelve una `EngineResult`. Por eso se puede testear entero sin
 * modelo, sin Firestore y sin emulador — la decisión separada de la lectura.
 *
 * REGLA DURA 2 DEL PROYECTO, escrita en el tipo: `VisionItem` NO TIENE campos de
 * calorías ni de macros. No es que el motor los ignore: es que el esquema de
 * salida del modelo no se los permite emitir. Cada número del reporte sale de
 * `per_100g` de una ficha del catálogo, con su `source_ref` de USDA al lado.
 */
import type { Per100g } from "../kb/types";

// ---------------------------------------------------------------------------
// Entrada: lo que produce el paso 1 (visión)
// ---------------------------------------------------------------------------

/**
 * Los métodos de cocción que la visión puede declarar.
 *
 * Es un subconjunto de `kb/curation/cooking.transforms.json`: son los que se
 * pueden VER en una foto. `crudo` y `hervido` no están porque en una imagen no
 * se distinguen de forma confiable (y `hervido` es, además, el factor menos
 * confiable de la tabla).
 */
export type Preparacion = "frito" | "horneado" | "horneado_masa" | "plancha" | "mezclado";

/** Un ingrediente visible de un plato que la visión no supo nombrar entero. */
export interface VisionComponent {
  food_en: string;
  /** El mismo ingrediente en español. Ver `VisionItem.food_es`. */
  food_es?: string;
  grams: number;
}

/**
 * Un alimento identificado en la foto.
 *
 * `confidence` es la confianza de la VISIÓN en haber identificado bien: no dice
 * nada sobre si el catálogo tiene ese alimento. Las dos confianzas se componen
 * multiplicándose (ver `EngineItem.confidence`).
 */
export interface VisionItem {
  /** El nombre en inglés, en el mismo registro que los `names.en` del catálogo. */
  food_en: string;
  /**
   * EL MISMO ALIMENTO, EN ESPAÑOL. Card 2.6.
   *
   * No es una traducción de cortesía: el catálogo tiene 1.768 términos curados
   * en español —`Paella`, `Lasaña`, `Bife`, `Papas fritas`— y hasta esta card el
   * modelo tenía prohibido usarlos (el prompt le pedía inglés genérico de USDA).
   * El motor buscaba en un índice español que nadie alimentaba. Medido en el test
   * de los 10 platos: paella, lasaña y risotto existían en el catálogo y salieron
   * sin datos por esto.
   *
   * Es OPCIONAL en el tipo porque el motor tiene que seguir funcionando con una
   * salida vieja o incompleta: sin `food_es` el matching es exactamente el de
   * antes. Ver `buscarConDosNombres` en `match.ts`.
   */
  food_es?: string;
  grams: number;
  /** 0..1 — cuánto confía la visión en la IDENTIFICACIÓN, no en el número. */
  confidence: number;
  preparation?: Preparacion | null;
  /** Ingredientes visibles, cuando el plato entero no tiene un nombre obvio. */
  components?: VisionComponent[];
}

export interface VisionResult {
  is_food: boolean;
  items: VisionItem[];
}

// ---------------------------------------------------------------------------
// Salida: lo que el motor entrega
// ---------------------------------------------------------------------------

/**
 * Los ocho valores del alimento YA ESCALADOS a los gramos del plato.
 *
 * Comparte forma exacta con `Per100g` a propósito —son los mismos ocho campos y
 * las mismas unidades— pero el significado es otro: acá `kcal` son las calorías
 * de ESTA porción, no las de 100 g. El alias existe para que el nombre del tipo
 * lo diga en el lugar donde se lee.
 */
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

/**
 * La cuenta de una composición, entera y a la vista.
 *
 * Viaja al resultado por la misma razón por la que `receta` viaja al catálogo:
 * es la única forma de que quien lea un número pueda rehacerlo. Un plato
 * compuesto en runtime no tiene `source_ref` de USDA propio — su trazabilidad
 * ES esta estructura.
 */
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
  /** El texto que la visión emitió. Se guarda siempre, matchee o no. */
  termino_en: string;
  /**
   * EL MISMO TEXTO, EN ESPAÑOL, TAL COMO LO EMITIÓ LA VISIÓN (DT-25).
   *
   * Se guarda SIEMPRE, igual que `termino_en`, y vale `""` cuando la visión no
   * dijo nada en español. Que la clave EXISTA siempre es la mitad del arreglo:
   * desde la card 2.6 el motor matchea con los DOS nombres (`buscarConDosNombres`)
   * y hasta acá el expediente solo guardaba el inglés, así que un scan no
   * registraba la mitad de lo que decidió su propio match. El costo se midió en
   * la card 6.1: el replay del golden set no puede volver a jugar lo que entró
   * por el español y lo declara `no_comparable_es` — 36 de 68 ítems de la
   * corrida v3, más de la mitad.
   *
   * SIEMPRE PRESENTE Y NO OPCIONAL-CUANDO-HAY, que es la decisión que importa:
   * una clave ausente sería ambigua entre "la visión no dijo nada en español" y
   * "esta corrida es anterior a la DT-25", y el replay necesita distinguirlas
   * para saber si puede juzgar el ítem entero o tiene que declararse tuerto. Con
   * la clave siempre escrita, `""` dice lo primero y la ausencia lo segundo.
   *
   * NO ES EL TÉRMINO QUE GANÓ: es lo que la visión dijo. Por cuál de los dos
   * entró el match lo dice el `motivo`, que lo escribe con todas las letras.
   */
  termino_es: string;
  food_id: string | null;
  name_es: string | null;
  name_en: string | null;
  /** La trazabilidad a USDA. `null` en un compuesto: ahí traza `composicion`. */
  source_ref: string | null;
  grams: number;
  /** vision × matching × factores. Es la que se le muestra al usuario. */
  confidence: number;
  /** Las dos mitades, por separado, para poder auditar de dónde salió la de arriba. */
  confidence_vision: number;
  confidence_match: number;
  match: TipoDeMatch;
  /** Solo cuando vale `true`, igual que en el catálogo. */
  generic?: true;
  /**
   * LA FICHA NOMBRA LO QUE LA VISIÓN DESCRIBIÓ (DT-37). Solo cuando vale `true`.
   *
   * No es una confianza: es la respuesta a otra pregunta. `confidence` mide
   * cuánto se puede creer en este match; esto mide si la ficha que ganó habla de
   * lo que se describió — su vocabulario explica la mayor parte de las palabras
   * de identidad del término, o directamente la consulta ES uno de sus nombres.
   *
   * Existe porque la compuerta del total necesitaba distinguir "no sé qué es
   * esto" de "sé qué es y lo encontré por una vía que puntúa bajo". Ver
   * `identidad_respaldada` en `match.ts` y `sumarTotales` en `arithmetic.ts`.
   */
  identidad_respaldada?: true;
  /**
   * La visión no dio una masa usable (0, negativa, `NaN`, `Infinity`). El item
   * conserva la ficha —se sabe QUÉ es— pero sale con `nutrients: null`: no se
   * cuantifica con un cero inventado. Baja `completo` en los totales.
   */
  grams_no_estimados?: true;
  caveats?: string[];
  /** Los valores por 100 g de la ficha usada. `null` si no hay ficha. */
  per_100g: Per100g | null;
  /** Los valores YA escalados a `grams`. `null` si no hay ficha. */
  nutrients: Per100gEscalado | null;
  /** En una línea, por qué este item terminó como terminó. */
  motivo: string;
  composicion?: Composicion;
}

/**
 * LA SUMA CRUDA de todo el plato: lo que da la aritmética, antes de decidir si se
 * puede publicar.
 *
 * Los cuatro obligatorios salen siempre número —ninguna ficha entra al catálogo
 * sin ellos— y los cuatro opcionales salen `null` cuando alguna ficha no los
 * declara (ver la regla sobre el vacío en `arithmetic.ts`). No es lo que viaja en
 * el payload: eso es `TotalesNutrientes`.
 */
export interface SumaDeNutrientes {
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
 * LOS OCHO VALORES QUE VIAJAN, Y LOS OCHO PUEDEN SER `null`.
 *
 * Card 6.1 — LA COMPUERTA TAMBIÉN CIERRA EL PAYLOAD. Hasta la card 2.8 la
 * compuerta del total (`CONFIANZA_MINIMA_PARA_UN_TOTAL`) apagaba la DECLARACIÓN
 * —`completo: false`, `macro_pct: null` y el motivo escrito— pero los números
 * seguían viajando: la foto de comida de plástico del golden set salía con
 * `completo: false` y con **1.550,4 kcal** en `totals.nutrients.kcal`. Un JSON
 * que dice "esto no se puede afirmar" y a la vez trae el número en firme le deja
 * la decisión a quien lo pinte, y un cliente que se porte mal convierte una
 * reserva del motor en una cifra de portada.
 *
 * Con los ocho en `null` el payload dice lo mismo que la declaración: no hay
 * total. Los ítems NO se tocan — cada alimento sigue abajo con su ficha, sus
 * gramos y sus propios `nutrients` — y `opcionales_ausentes` sigue explicando
 * por qué faltaba lo que ya faltaba.
 */
export type TotalesNutrientes = { [K in keyof SumaDeNutrientes]: number | null };

/** El reparto de calorías por macro, en porcentaje del total. */
export interface PorcentajesDeMacros {
  protein: number;
  carbs: number;
  fat: number;
  /**
   * Cuánto falta (o sobra) para 100. NO se normaliza a propósito: la diferencia
   * es información —alcohol, fibra, redondeos de USDA— y taparla sería inventar
   * un cuadre que los datos no tienen.
   */
  sin_explicar: number;
}

export interface EngineTotals {
  /**
   * La suma del plato — o los ocho valores en `null` cuando la compuerta del
   * total cerró. `macro_pct_motivo` dice cuál de las dos cosas pasó.
   */
  nutrients: TotalesNutrientes;
  /**
   * `true` cuando los ocho `nutrients` vienen en `null` porque la compuerta
   * cerró: no es que la fuente no los declare, es que el análisis no sostiene el
   * total. Solo aparece cuando vale `true`, igual que `generic` en el catálogo.
   *
   * Existe para que quien lea el payload no tenga que deducirlo de un `null`:
   * `fiber_g: null` en un total normal significa "la fuente no lo mide" y acá
   * significa otra cosa. Dos ausencias distintas no pueden leerse igual.
   */
  total_no_publicable?: true;
  /** Por qué un opcional salió `null`. Solo aparecen los que salieron `null`. */
  opcionales_ausentes: Partial<Record<"fiber_g" | "sat_fat_g" | "sugars_g" | "sodium_mg", string>>;
  macro_pct: PorcentajesDeMacros | null;
  /**
   * Por qué no hay porcentajes, cuando no los hay. Dos motivos posibles: el
   * total de calorías es 0, o ningún alimento llegó al piso de confianza que
   * hace falta para publicar un total (`CONFIANZA_MINIMA_PARA_UN_TOTAL`).
   */
  macro_pct_motivo: string | null;
  grams_total: number;
  /** Gramos que SÍ entraron a la suma (los de los items con ficha). */
  grams_cuantificados: number;
  items_incluidos: number;
  items_sin_datos: number;
  /**
   * `true` solo si todos los items del escaneo aportaron números Y AL MENOS UNO
   * se identificó con confianza suficiente (card 2.8, la compuerta del total).
   *
   * Son dos preguntas distintas y las dos tienen que dar que sí: "¿está todo el
   * plato adentro de la suma?" y "¿alguno de esos alimentos se supo identificar?".
   * Un plato entero de matches basura cumple la primera y falla la segunda, y ahí
   * el total no es completo: es una suma de dudas. Ver
   * `CONFIANZA_MINIMA_PARA_UN_TOTAL` en `constants.ts`.
   */
  completo: boolean;
}

/** Por qué un término entra a la cola de curación. */
export type MotivoDeCuracion = "sin_match" | "compuesto_en_runtime" | "componente_sin_match";

/**
 * Un candidato a ficha nueva del catálogo.
 *
 * El catálogo aprende del uso real: lo que la gente fotografía y el catálogo no
 * sabe nombrar es exactamente la lista de lo que hay que curar después. Un plato
 * compuesto en runtime también entra —salió bien, pero merece su propia ficha
 * medida— y por eso el motivo no es un booleano.
 */
export interface CurationCandidate {
  termino_en: string;
  motivo: MotivoDeCuracion;
  grams: number | null;
  preparation: string | null;
  /** Los ingredientes que la visión vio, con lo que se resolvió de cada uno. */
  componentes?: { termino_en: string; grams: number; food_id: string | null }[];
  detalle: string;
}

export interface EngineResult {
  /** `false` cuando la visión dijo que la foto no es comida. */
  es_comida: boolean;
  items: EngineItem[];
  /** `null` si NINGÚN item pudo cuantificarse. */
  totals: EngineTotals | null;
  curation_candidates: CurationCandidate[];
  /** La versión del catálogo con la que se calculó. Trazabilidad del scan. */
  kb_version: string;
}
