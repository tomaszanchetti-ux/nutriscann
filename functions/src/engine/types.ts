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
 * Desde la Fase 5 son LOS OCHO de `kb/curation/cooking.transforms.json`, no un
 * subconjunto. Hasta acá faltaban `crudo`, `hervido` y `cocido_cebolla` porque
 * "no se ven en una foto"; el Bloque 0 de la Fase 5 midió el costo de esa
 * cautela: 24 subfamilias de verdura y legumbre tenían que declarar `mezclado`
 * como método por defecto, y una lenteja hervida se componía con rendimiento 1
 * en vez de 1,113. Lo que la visión no distingue lo pone la subfamilia
 * (`metodo_por_defecto` en `functions/src/kb/familias.ts`).
 */
export type Preparacion =
  | "crudo"
  | "mezclado"
  | "frito"
  | "horneado"
  | "plancha"
  | "hervido"
  | "horneado_masa"
  | "cocido_cebolla";

/** Un ingrediente visible de un plato que la visión no supo nombrar entero. */
export interface VisionComponent {
  food_en: string;
  /** El mismo ingrediente en español. Ver `VisionItem.food_es`. */
  food_es?: string;
  grams: number;
  /**
   * `familia/subfamilia` del ingrediente, uno de `IDS_FAMILIA_SUBFAMILIA`
   * (Fase 5). Opcional: es el respaldo del motor cuando el nombre del
   * ingrediente no llega a ninguna ficha (la masa de pizza cae en su familia).
   */
  familia_subfamilia?: string;
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
  /**
   * EL PLATO EN EL IDIOMA DEL CATÁLOGO (Fase 5, card 5.2). Es un id compuesto
   * `familia/subfamilia` de la lista cerrada `IDS_FAMILIA_SUBFAMILIA`
   * (`functions/src/kb/familias.ts`, generado desde `kb/curation/familias.json`).
   * El esquema de salida lo pide como enum: el modelo no puede escribir "pizza"
   * de tres formas. Es el RESPALDO del término exacto, nunca su reemplazo:
   * medido en el Bloque 0, pisar el término con la cabeza de familia llevaría
   * el atún en lata de 85 a 238 kcal. Opcional en el tipo por la misma razón
   * que `food_es`: una salida vieja o saneada tiene que seguir funcionando.
   */
  familia_subfamilia?: string;
  /**
   * Ingredientes visibles con sus gramos. Desde la Fase 5 la visión los declara
   * SIEMPRE que el plato tenga más de uno (antes, solo si el plato "no tenía
   * nombre obvio", y por eso la composición nunca disparó en producción).
   * Vacío u omitido en un alimento simple.
   */
  components?: VisionComponent[];
  /**
   * Lo que dice el envase, tal cual está impreso, cuando la foto es un producto
   * envasado con etiqueta legible (Fase 5). Un envase con etiqueta ES comida:
   * la etiqueta es la fuente más precisa que hay. Solo el nombre del producto;
   * nunca calorías ni macros (regla dura 2).
   */
  etiqueta_del_envase?: string;
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

/**
 * Cómo se llegó a la ficha (o a la falta de ficha).
 *
 * LOS CUATRO SELLOS NUEVOS DE LA CARD 5.3, en el orden en que baja la cascada:
 *
 *   · `sustituto`         — el catálogo no nombra este alimento y la curación
 *                           declaró por escrito cuál es la ficha más cercana
 *                           (`SUSTITUTOS` en `kb/familias.ts`);
 *   · `cabeza_subfamilia` — el término no llegó a nada, pero la visión declaró
 *                           `familia/subfamilia` y esa subfamilia tiene una ficha
 *                           que la representa;
 *   · `cabeza_familia`    — ni eso: la subfamilia no tiene cabeza y contesta la
 *                           de la familia entera. Es el último recurso con ficha;
 *   · `compuesto_parcial` — se compuso con PARTE de los ingredientes visibles,
 *                           porque lo que faltó era minoritario en gramos
 *                           (`MASA_FALTANTE_MAXIMA`). Qué faltó está escrito en
 *                           `composicion` y en `caveats`.
 *
 * Son sellos y no una escala: el front los pinta distinto porque significan
 * cosas distintas, y `Record<TipoDeMatch, …>` en la PWA no compila hasta que
 * alguien decida cómo se llama cada uno.
 */
export type TipoDeMatch =
  | "exacto"
  | "alias"
  | "difuso"
  | "sustituto"
  | "cabeza_subfamilia"
  | "cabeza_familia"
  | "compuesto"
  | "compuesto_parcial"
  | "no_catalogado";

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
  /**
   * ESTE INGREDIENTE NO SE ENCONTRÓ POR SU NOMBRE (card 5.3). Solo cuando vale
   * `true`, y con el motivo escrito al lado.
   *
   * Un ingrediente que entró por un sustituto declarado o por la cabeza de su
   * subfamilia sigue siendo una ficha real con su `source_ref`, pero no es la
   * ficha de LO QUE SE VIO: es la que la curación —o la taxonomía— puso en su
   * lugar. Quien lea la composición tiene derecho a distinguir las dos cosas sin
   * tener que interpretar el `match`.
   */
  reemplazo?: { por: "sustituto" | "cabeza_subfamilia" | "cabeza_familia"; motivo: string };
}

/**
 * UN INGREDIENTE QUE SE VIO Y NO SE PUDO RESOLVER, con los gramos que pesaba.
 *
 * Viaja adentro de `Composicion.faltantes` en una composición PARCIAL: es la
 * parte del plato por la que el motor está respondiendo con la densidad de otra.
 * Sin esta lista, un compuesto parcial y uno completo se leerían igual.
 */
export interface ComponenteFaltante {
  termino_en: string;
  grams: number;
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
  /**
   * LA COMPOSICIÓN NO TIENE TODO EL PLATO ADENTRO (card 5.3). Solo cuando vale
   * `true`, y entonces `faltantes` y `gramos_faltantes` dicen qué y cuánto.
   *
   * Que sea una clave propia y no una deducción de `faltantes.length > 0` es la
   * misma regla que `total_no_publicable`: dos cosas distintas no se leen igual.
   */
  parcial?: true;
  /** Los ingredientes que se vieron y no se resolvieron. Vacío en una completa. */
  faltantes?: ComponenteFaltante[];
  /** Cuántos gramos del plato representan esos faltantes. */
  gramos_faltantes?: number;
  /**
   * Los gramos a los que se escaló el `per_100g` de lo resuelto. En una
   * composición parcial NO es `peso_final_g`: es la masa del plato entero, la
   * que vio la visión, faltantes incluidos. Es el número que hay que mirar para
   * rehacer la cuenta del ítem.
   */
  gramos_del_plato?: number;
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

/**
 * EL REPARTO DE CALORÍAS POR MACRO. Los tres suman 100 y ninguno sale de 0..100.
 *
 * Cada porcentaje es la parte que le toca de las calorías que APORTAN LOS MACROS
 * (`P×4 + C×4 + F×9`), no de las kcal de la ficha. Ver `porcentajesDeMacros` en
 * `arithmetic.ts`: hasta la card 5.1 el denominador eran las kcal de la fuente y
 * la banana publicaba `carbs: 102,7 %`.
 */
export interface PorcentajesDeMacros {
  protein: number;
  carbs: number;
  fat: number;
  /**
   * Las kcal de la ficha que los macros NO explican, con signo y en kcal.
   * Negativo = con 4/4/9 los macros suman MÁS de lo que declara la fuente
   * (fuentes con factores propios, fibra contada aparte); positivo = la fuente
   * declara calorías que no vienen de ningún macro (alcohol, redondeos).
   */
  kcal_fuera_de_macros: number;
  /** Lo mismo en porcentaje de las kcal de la fuente. La banana da −10,9. */
  diferencia_pct: number;
  /**
   * Por qué existe esa diferencia, en una frase para leer — o `null` cuando es
   * ruido de redondeo y no merece letra chica (`DIFERENCIA_RELEVANTE_PCT`).
   * El umbral se decide UNA vez, acá adentro: la pantalla dibuja lo que le llega.
   */
  motivo_de_la_diferencia: string | null;
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
