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
 */
export const COBERTURA_DIFUSA_MIN = 0.3;

/** Los factores de Atwater, en kcal por gramo. Convención universal. */
export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

/** Decimales con los que se redondea todo lo que sale del motor. */
export const DECIMALES = 3;

/** El método de composición por defecto cuando la visión no declara ninguno. */
export const PREPARACION_POR_DEFECTO = "mezclado";
