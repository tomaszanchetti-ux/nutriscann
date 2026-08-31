/**
 * Normalización de texto y comparación por TOKENS.
 *
 * Todo el matching pasa por acá. La forma normalizada es la misma para el
 * catálogo y para lo que dice la visión, y se calcula una sola vez al construir
 * el índice: comparar dos textos crudos ("Kétchup" contra "ketchup") es una
 * fuente de bugs que no hace falta tener.
 *
 * La decisión que importa es que la comparación difusa es POR TOKENS, no por
 * caracteres: `chorizo` está adentro de la cadena `bife de chorizo`, pero no
 * está adentro como palabra suelta al principio, y esa diferencia es la que
 * impide que un corte vacuno pase por un embutido. Ver `match.ts`.
 */

/**
 * Minúsculas, sin tildes, sin puntuación y con un solo espacio entre palabras.
 *
 * La `ñ` se descompone en `n` + tilde y la tilde se cae: `piña` y `pina` son el
 * mismo término. Es deliberado — lo que llega de un modelo de visión no tiene
 * garantías de acentuación — y no genera colisiones en el catálogo (medido:
 * 1.022 nombres en inglés y 1.768 términos en español, todos distintos después
 * de normalizar).
 */
export function normalizar(texto: string): string {
  // El tipo dice `string`, pero lo que llega del otro lado de la frontera es un
  // JSON de un modelo: si el schema fallara y `food_en` viniera como número, un
  // `texto.normalize is not a function` tumbaría el análisis entero. Un texto
  // que no es texto no nombra ningún alimento, y eso se responde con la cadena
  // vacía —que la cascada trata como "sin match"— no con una excepción.
  if (typeof texto !== "string") return "";
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Las palabras de un texto ya normalizado. */
export function tokens(normalizado: string): string[] {
  return normalizado.length === 0 ? [] : normalizado.split(" ");
}

/**
 * ¿`aguja` aparece dentro de `pajar` como secuencia COMPLETA de palabras?
 *
 * `contieneSecuencia("pastel de carne casero", "pastel de carne")` es `true`;
 * `contieneSecuencia("pasteles", "pastel")` es `false`. Los dos argumentos ya
 * vienen normalizados.
 */
export function contieneSecuencia(pajar: string, aguja: string): boolean {
  if (aguja.length === 0 || pajar.length === 0) return false;
  return ` ${pajar} `.includes(` ${aguja} `);
}

/**
 * ¿`pajar` EMPIEZA con `aguja`, en el límite de una palabra?
 *
 * Es la regla del núcleo del nombre: tanto en español como en inglés
 * gastronómico el sustantivo principal va adelante y lo que sigue lo califica.
 * `Pepinillos en eneldo` empieza con `pepinillos` y es una clase de pepinillo;
 * `Bife de chorizo` NO empieza con `chorizo` y no es una clase de chorizo. Sin
 * esta regla, "chorizo" tendría dos candidatos y uno de los dos es carne vacuna.
 */
export function empiezaConPalabra(pajar: string, aguja: string): boolean {
  if (aguja.length === 0 || pajar.length === 0) return false;
  return pajar === aguja || pajar.startsWith(`${aguja} `);
}
