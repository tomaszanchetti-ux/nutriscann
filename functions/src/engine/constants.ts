/**
 * Las constantes del motor, todas juntas y todas explicadas.
 *
 * Están acá y no repartidas por el código para que se puedan leer de un tirón:
 * son las únicas decisiones numéricas que el motor toma por su cuenta. La regla
 * dura 1 del proyecto ("nada hardcodeado") habla de la CONFIGURACIÓN DE NEGOCIO
 * —umbrales de recomendación, textos, límites de uso— que vive en `config/app`.
 * Esto es otra cosa: son parámetros del algoritmo de matching, y moverlos cambia
 * qué alimento se elige, no cuánto se le muestra al usuario. Si mañana hay que
 * poder tocarlos sin desplegar, la card 2.2 los pasa por parámetro: todas las
 * funciones del motor ya reciben sus datos, ninguna los lee de ningún lado.
 */

/**
 * Cuánto se le descuenta a un match contra una ficha `generic: true` (DT-13).
 *
 * Una ficha genérica mide el PROMEDIO de una familia (`Cheese, NFS` es el
 * promedio de todos los quesos de la encuesta), no un alimento. El match es
 * legítimo —en una foto nadie distingue un manchego de un gouda— pero el número
 * que sale de ahí vale menos que el de una ficha específica, y la confianza es
 * el único lugar donde eso se puede decir. 0,85 es un descuento chico a
 * propósito: el genérico sigue siendo la mejor respuesta disponible, solo que
 * con una reserva declarada.
 */
export const FACTOR_GENERICO = 0.85;

/**
 * Cuánto se le descuenta a un plato COMPUESTO en runtime.
 *
 * La composición usa fichas reales del catálogo y una transformación medida
 * sobre los datasets: la aritmética es tan sólida como la de cualquier otra
 * ficha. Lo que no está medido es la PROPORCIÓN: los gramos de cada ingrediente
 * los estimó la visión mirando una foto, no una balanza. 0,8 es esa reserva.
 */
export const FACTOR_COMPOSICION = 0.8;

/**
 * El techo de la confianza de un match difuso.
 *
 * Un match difuso nunca es una certeza: es "el catálogo tiene algo que se
 * parece". Por encima de esto solo puede estar lo que se matcheó por igualdad
 * de texto (exacto o alias).
 */
export const CONFIANZA_DIFUSA_MAX = 0.6;

/**
 * Cobertura mínima para aceptar un match difuso.
 *
 * La cobertura es cuánto del texto largo explica el texto corto (en caracteres
 * normalizados). Por debajo de un tercio el "parecido" es ruido: `Carne` dentro
 * de `pastel de carne casero` cubre el 23 % y no es un match, es una palabra
 * suelta que coincide.
 *
 * El número está ELEGIDO CONTRA EL CATÁLOGO REAL, no a ojo. Tiene que dejar
 * pasar `pepinillos` dentro de `Pepinillos en eneldo o kosher` (cobertura 0,345)
 * y tiene que frenar `pastel` dentro de `Pastel de nuez pecana` (0,286), que es
 * el caso donde un match de más devuelve otro alimento. 0,30 cae entre los dos
 * con margen para los dos lados.
 *
 * CARD 2.6: EL PISO NO SE MOVIÓ, Y NO SE MUEVE. Lo que cambió es QUÉ SE MIDE
 * contra él: la cobertura ya no cuenta las palabras que solo describen la
 * cocción o la presentación (`DESCRIPTORES_DE_PRESENTACION`), porque esas no son
 * comida sin explicar. Y hay UNA segunda puerta, no un piso más bajo: un nombre
 * que es el NÚCLEO de lo que dijo la visión —la frase empieza con él— entra
 * aunque cubra poco, porque ahí el problema no es que se parezca poco sino que la
 * visión describió mucho. Bajar el piso, en cambio, habría dejado entrar a
 * `ricotta` como respuesta a una lasaña, que es la clase de error que este motor
 * no comete.
 */
export const COBERTURA_DIFUSA_MIN = 0.3;

/**
 * Palabras que describen CÓMO está el alimento, no QUÉ alimento es.
 *
 * Existen por la paradoja que midió el test de los 10 platos: cuanto mejor
 * describía la visión, peor matcheaba. `beef steak, grilled` contra la ficha
 * `Beef, steak, NFS` daba una cobertura de 0,33 —y por lo tanto una confianza del
 * 20 %— solo porque la visión agregó la palabra "grilled". Pero "grilled" no es
 * otro alimento que el catálogo no supo explicar: es un adjetivo del mismo.
 *
 * QUÉ HACEN Y QUÉ NO HACEN. Estas palabras se descuentan del DENOMINADOR de la
 * cobertura —o sea, de "cuánto quedó sin explicar"— y de nada más. NO se borran
 * del término que se busca: `hot dog` sigue matcheando `Hot dog` por igualdad
 * exacta, porque el texto que se compara nunca se toca.
 *
 * LA LISTA ES CERRADA Y CORTA A PROPÓSITO. Solo entra una palabra si describe
 * cocción, corte o presentación y NO nombra ningún alimento por sí sola. Una
 * palabra de más acá es una confianza inflada; que falte una es una confianza
 * baja, que es el error barato de los dos.
 */
export const DESCRIPTORES_DE_PRESENTACION: readonly string[] = [
  // inglés (el registro en el que USDA y la visión escriben)
  "raw", "fresh", "cooked", "grilled", "fried", "baked", "roasted", "boiled",
  "steamed", "toasted", "sauteed", "seasoned", "sliced", "chopped", "diced",
  "shredded", "melted", "whole", "homemade", "style", "plain", "mixed",
  // español (el registro del usuario y de la curación)
  "crudo", "cruda", "cocido", "cocida", "asado", "asada", "frito", "frita",
  "horneado", "horneada", "hervido", "hervida", "plancha", "salteado", "salteada",
  "tostado", "tostada", "rallado", "rallada", "picado", "picada", "troceado",
  "derretido", "derretida", "casero", "casera", "estilo", "natural", "entero",
  "entera",
];

/**
 * Palabras que abren un ACOMPAÑAMIENTO: lo que viene después no es el plato.
 *
 * Es la otra mitad de la lista de arriba, y la que evita que abrir el recall se
 * vuelva inventar. Medido: con la cobertura descontando descriptores, la consulta
 * `arepa, grilled, filled with cheese` empezaba a matchear **queso**, porque
 * "cheese" pasaba a explicar un tercio de lo que quedaba. Pero el queso ahí es el
 * RELLENO de una arepa, no el plato — y la arepa no está en el catálogo, así que
 * la respuesta correcta es seguir diciendo que no se sabe.
 *
 * LA REGLA: un nombre del catálogo que empieza DESPUÉS del primer conector no
 * puede ser el plato. Es la misma regla del núcleo del nombre que estructura todo
 * el matcher —el sustantivo principal va adelante— llevada a la frase entera.
 *
 * Un nombre que CONTIENE un conector adentro (`macaroni and cheese`) no se ve
 * afectado: lo que se mira es dónde EMPIEZA el nombre, no qué palabras tiene.
 */
export const CONECTORES_DE_ACOMPANAMIENTO: readonly string[] = [
  "with", "and", "plus", "over", "topped", "filled", "served",
  "con", "y", "mas", "relleno", "rellena", "cubierto", "cubierta", "acompanado",
];

/**
 * Las palabras con las que una ficha —o una persona— dice CRUDO y dice COCIDO.
 *
 * LA REGLA QUE HABILITAN, QUE ES UNA DECISIÓN DE PRODUCTO Y NO DEL ALGORITMO:
 * las fotos son platos COMO SE COMEN. Cuando lo que dijo la visión NO declara
 * ningún estado de cocción y el catálogo ofrece por parecido dos fichas que solo
 * se diferencian en eso —una que dice cruda y otra que dice cocida—, GANA LA
 * COCIDA. Si no hay una cocida, la cruda entra igual —callarse no ayuda a nadie—
 * pero con la reserva escrita en el motivo, que es donde se puede leer.
 *
 * ESTÁ MEDIDO CUÁNTO CUESTA NO TENERLA: `lentejas` a secas resolvía a
 * `Lentejas crudas` (fdc-172420, 352 kcal/100 g) en lugar de las cocidas
 * (fdc-2707423, 166 kcal/100 g). Más del DOBLE de calorías en el plato más común
 * de una casa española. Hasta la card 2.6 el error no se veía porque el motor no
 * matcheaba casi nada; abrir el recall sin esta regla lo habría encendido.
 *
 * POR QUÉ LA REGLA COMPARA Y NO PROHÍBE, que es la parte que costó medir: la
 * primera versión sacaba del difuso a toda ficha que dijera cruda, y con eso
 * `apple` dejaba de resolver a `Apple, raw` y pasaba a resolver a
 * `Apple, baked` — una manzana horneada donde había una manzana. Para una fruta
 * el crudo ES el estado en que se come. La regla solo puede desempatar entre el
 * crudo y el cocido DEL MISMO alimento, nunca castigar al crudo por serlo, y por
 * eso `PALABRAS_DE_COCIDO` es cortísima: son las palabras que dicen "cocido" y
 * NADA MÁS. `baked`, `fried` o `grilled` no están: esas nombran una preparación
 * distinta, no el estado por defecto del mismo alimento.
 *
 * La regla vive SOLO en el nivel difuso. En los niveles exactos no hace falta:
 * si la clave es igual al nombre y el nombre dice "crudas", entonces la consulta
 * también lo dijo, y quien nombra un alimento crudo tiene derecho a que se lo den.
 */
export const PALABRAS_DE_CRUDO: readonly string[] = ["raw", "uncooked", "crudo", "cruda", "crudos", "crudas"];

export const PALABRAS_DE_COCIDO: readonly string[] = [
  "cooked", "boiled", "cocido", "cocida", "cocidos", "cocidas", "cocinado", "cocinada", "hervido", "hervida",
];

/** Los factores de Atwater, en kcal por gramo. Convención universal. */
export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

/** Decimales con los que se redondea todo lo que sale del motor. */
export const DECIMALES = 3;

/** El método de composición por defecto cuando la visión no declara ninguno. */
export const PREPARACION_POR_DEFECTO = "mezclado";
