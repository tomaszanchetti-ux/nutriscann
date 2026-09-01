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
import {
  CONECTORES_DE_ACOMPANAMIENTO,
  DESCRIPTORES_DE_PRESENTACION,
  PALABRAS_DE_COCIDO,
  PALABRAS_DE_CRUDO,
  PREPARACIONES_QUE_CAMBIAN_LA_FICHA,
} from "./constants";

/**
 * Minúsculas, sin tildes, sin puntuación y con un solo espacio entre palabras.
 *
 * La `ñ` se descompone en `n` + tilde y la tilde se cae: `piña` y `pina` son el
 * mismo término. Es deliberado — lo que llega de un modelo de visión no tiene
 * garantías de acentuación — y no genera colisiones en el catálogo (medido:
 * 1.022 nombres en inglés y 1.768 términos en español, todos distintos después
 * de normalizar).
 *
 * NO PLIEGA EL PLURAL, y eso es deliberado: este texto es también el id de la
 * cola de curación (`idDeCuracion`, en `analyze/persistencia.ts`), que es un
 * identificador que una persona lee. El plegado del plural es una CLAVE DE
 * MATCHING y vive un escalón más adentro, en `claveDeMatching`.
 */
export function normalizar(texto: string): string {
  // El tipo dice `string`, pero lo que llega del otro lado de la frontera es un
  // JSON de un modelo: si el schema fallara y `food_en` viniera como número, un
  // `texto.normalize is not a function` tumbaría el análisis entero. Un texto
  // que no es texto no nombra ningún alimento, y eso se responde con la cadena
  // vacía —que la cascada trata como "sin match"— no con una excepción.
  if (typeof texto !== "string") return "";
  const plano = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return plano;
}

/**
 * LA CLAVE CON LA QUE COMPARA EL MATCHING: normalizar y además plegar el plural.
 *
 * Es la que usan el índice y la consulta, siempre las dos. `normalizar` a secas
 * quedó para lo que una persona lee (el id de la cola de curación); todo lo que
 * se COMPARA pasa por acá.
 */
export function claveDeMatching(texto: string): string {
  return plegarPlural(normalizar(texto));
}

/**
 * El piso de letras para plegar un plural. Debajo de esto la `s` final suele ser
 * parte del nombre y no una marca de plural (`gas`, `res`, `mas`).
 */
export const LARGO_MINIMO_PARA_PLEGAR = 4;

/**
 * La `s` final del plural, plegada. NO es un singularizador: es una CLAVE.
 *
 * El hueco de recall más caro que midió el test de los 10 platos: la visión dijo
 * `lime, raw` y la ficha se llama `Limes, raw`; el usuario dice `pepinillo` y el
 * catálogo dice `Pepinillos`. Ni uno contiene al otro, y el match no existía.
 *
 * LA REGLA ES UNA SOLA Y DELIBERADAMENTE POBRE: se le saca una `s` final a las
 * palabras de 4 letras o más que no terminan en `ss`. No intenta acertar el
 * singular de verdad —`fries` queda en `frie`, `flanes` en `flane`— y no hace
 * falta que lo haga: lo único que importa es que el catálogo y la consulta caigan
 * en la MISMA clave, y como los dos pasan por esta función, caen. Un plegado
 * "equivocado" cuesta un match que ya no teníamos; un plegado ambicioso (quitar
 * `es`, adivinar irregulares) costaría un match EQUIVOCADO, que es lo único que
 * este motor no puede permitirse.
 *
 * El `ss` protege `bass` y `grass`, donde sacar la `s` daría otra palabra.
 *
 * MEDIDO contra el catálogo 3.0.0: el plegado no crea NI UNA colisión nueva —ni
 * entre los 1.022 nombres en inglés ni entre los 1.768 términos en español—, y
 * hay un test que lo vuelve a medir en cada corrida.
 */
export function plegarPlural(normalizado: string): string {
  if (normalizado.length === 0) return normalizado;
  return normalizado
    .split(" ")
    .map((palabra) =>
      palabra.length >= LARGO_MINIMO_PARA_PLEGAR && palabra.endsWith("s") && !palabra.endsWith("ss")
        ? palabra.slice(0, -1)
        : palabra,
    )
    .join(" ");
}

/**
 * Los marcadores con los que USDA dice "no lo especificamos más".
 *
 * `NFS` = "Not Further Specified"; `NS as to fat` = "Not Specified as to fat".
 * Son 197 y 130 fichas del catálogo respectivamente: no es un caso de borde, es
 * cómo se llama una porción enorme del catálogo (`Beef, steak, NFS`,
 * `Roll, NS as to major flour`, `Yellow rice, cooked, NS as to fat`).
 *
 * El test de los 10 platos midió el costo: la visión escribió `beef steak,
 * grilled` y la ficha se llama `Beef, steak, NFS`. Ni uno contiene al otro
 * —`nfs` estorba en el medio— y el bife de la foto salió sin datos.
 *
 * `from fresh`, `from restaurant or fast food` y compañía son la otra familia:
 * FNDDS las usa para decir DE DÓNDE SALIÓ EL DATO, no qué alimento es. La lista
 * es cerrada y corta a propósito — un `from X` cualquiera no entra, porque
 * `Lemon juice from concentrate` sí es parte del nombre—. Sin esto,
 * `Pizza, cheese, from restaurant or fast food, NS as to type of crust` no se
 * encontraba con "pizza, cheese", y el motor devolvía QUESO por una porción de
 * pizza.
 */
const MARCADOR_GENERICO = /^(?:nfs|ns as to\b.*|from (?:fresh|canned|frozen|dried|fast food|restaurant|restaurant or fast food))$/i;

/**
 * Las CLAVES EXTRA con las que también se puede encontrar un nombre del catálogo.
 *
 * La ficha NO CAMBIA: sigue llamándose `Beef, steak, NFS` y es lo que se le
 * muestra al usuario. Lo que cambia es el índice, que además de la clave literal
 * aprende `beef steak`. Es la misma idea que tener aliases, solo que estos no los
 * escribe la curación: salen de una regla, y la regla es una sola —sacarle al
 * nombre los pedazos que declaran GENERICIDAD, no identidad—.
 *
 * Dos formas de pedazo:
 *   - el segmento entre comas que es un marcador de USDA (`NFS`, `NS as to X`);
 *   - el paréntesis, que en este catálogo siempre aclara y nunca identifica
 *     (`Pickles, cucumber, sweet (includes bread and butter pickles)`).
 *
 * Y UNA TERCERA VARIANTE, QUE ES LA QUE MÁS RINDE: USDA escribe los nombres AL
 * REVÉS, con el sustantivo adelante y el adjetivo detrás de una coma —
 * `Rice, white, cooked` es "arroz, blanco, cocido"—, y una persona (y un modelo
 * de visión) escribe `white rice, cooked`. Dar vuelta los dos primeros segmentos
 * reconstruye el orden natural del inglés, y sin eso `white rice, cooked` no
 * encontraba `Rice, white, cooked, NS as to fat` — el arroz blanco, que es de los
 * alimentos más fotografiados que hay.
 *
 * POR QUÉ NO SE LE COBRA UNA RESERVA A LA VARIANTE: lo único que se sacó fue la
 * marca de "no especificado", y ESA reserva ya está cobrada en otro lado — las
 * fichas así vienen con `generic: true` y el motor les descuenta un 15 % fijo
 * (`FACTOR_GENERICO`). Cobrarla otra vez acá sería contarla dos veces. Dar vuelta
 * dos segmentos no saca nada: es el mismo nombre, escrito como se dice.
 */
export function variantesDeIndice(texto: string): string[] {
  if (typeof texto !== "string") return [];
  const literal = claveDeMatching(texto);
  const variantes = new Set<string>();
  const agregar = (partes: string[]): void => {
    const clave = claveDeMatching(partes.join(" "));
    if (clave.length > 0 && clave !== literal) variantes.add(clave);
  };
  for (const version of [texto, texto.replace(/\([^)]*\)/g, " ")]) {
    const utiles = version
      .split(",")
      .map((segmento) => segmento.trim())
      .filter((segmento) => segmento.length > 0 && !MARCADOR_GENERICO.test(segmento));
    agregar(utiles);
    // `Rice, white, cooked` -> `white rice cooked`. Solo los DOS primeros
    // segmentos se dan vuelta: el resto son calificativos que ya venían en orden.
    // SOLO SI EL PRIMER SEGMENTO ES UNA SOLA PALABRA. La convención de USDA es
    // "SUSTANTIVO, calificativo" y un sustantivo es una palabra: `Rice, white`,
    // `Beef, ground`, `Potato, french fries`. Cuando el primer segmento ya es una
    // frase, invertir produce un sinsentido — medido: `Egg white omelet,
    // scrambled, or fried` daba `scrambled egg white omelet...`, y con eso
    // "scrambled eggs" resolvía a la CLARA de huevo (100 kcal) en vez de al huevo
    // revuelto (185). La restricción no es una precaución: es la regla real.
    const [nucleo, calificador, ...resto] = utiles;
    if (nucleo !== undefined && calificador !== undefined && !nucleo.trim().includes(" ")) {
      agregar([calificador, nucleo, ...resto]);
    }
  }
  return [...variantes];
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
 * En qué PALABRA de `pajar` arranca `aguja`. `-1` si no está.
 *
 * Es `contieneSecuencia` con la posición adentro, y la posición es la que
 * permite preguntar si el nombre que matcheó está antes o después del primer
 * conector de acompañamiento ("arepa filled with CHEESE": el queso arranca en la
 * palabra 4, detrás de "with", y por eso no puede ser el plato).
 */
export function posicionDeSecuencia(pajar: string, aguja: string): number {
  if (aguja.length === 0 || pajar.length === 0) return -1;
  const palabras = tokens(pajar);
  const buscadas = tokens(aguja);
  for (let i = 0; i + buscadas.length <= palabras.length; i += 1) {
    let coincide = true;
    for (let j = 0; j < buscadas.length; j += 1) {
      if (palabras[i + j] !== buscadas[j]) {
        coincide = false;
        break;
      }
    }
    if (coincide) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// El vocabulario que no es comida
//
// OJO CON EL ORDEN: estas listas se pliegan al cargar el módulo y `plegarPlural`
// lee `LARGO_MINIMO_PARA_PLEGAR`, así que tienen que estar DESPUÉS de esa
// constante. En CommonJS una constante leída antes de tiempo no explota: vale
// `undefined`, la comparación de largos da `false` y las listas quedarían sin
// plegar, en silencio. Ese es exactamente el tipo de error que este archivo no
// puede tener, y por eso hay un test que compara las listas plegadas.
// ---------------------------------------------------------------------------

/**
 * Artículos y preposiciones. No son comida ni describen nada: son pegamento.
 * Salen del denominador de la cobertura por la misma razón que los descriptores,
 * y viven acá y no en `constants.ts` porque no son una decisión de producto: son
 * gramática.
 */
const ARTICULOS = ["the", "a", "an", "of", "in", "for", "de", "del", "la", "el", "lo", "al", "en", "un", "una"];

/**
 * Las listas ya plegadas con la misma clave que usa el resto del matching: se
 * escriben legibles y se comparan en la forma en la que llegan las palabras.
 */
const CONECTORES = new Set(CONECTORES_DE_ACOMPANAMIENTO.map((p) => claveDeMatching(p)));
const PALABRAS_QUE_NO_SON_COMIDA = new Set(
  [...DESCRIPTORES_DE_PRESENTACION, ...CONECTORES_DE_ACOMPANAMIENTO, ...ARTICULOS].map((p) => claveDeMatching(p)),
);
const CRUDO = new Set(PALABRAS_DE_CRUDO.map((p) => claveDeMatching(p)));
const COCIDO = new Set(PALABRAS_DE_COCIDO.map((p) => claveDeMatching(p)));
const PREPARACIONES = new Set(PREPARACIONES_QUE_CAMBIAN_LA_FICHA.map((p) => claveDeMatching(p)));

/**
 * El estado de cocción que DICE este texto, si es que dice alguno.
 *
 * Se usa de los dos lados: sobre el nombre de la ficha (para saber qué declara)
 * y sobre lo que dijo la visión (para saber si pidió algo). Ver
 * `PALABRAS_DE_CRUDO` y `PALABRAS_DE_COCIDO` en `constants.ts`.
 */
export type EstadoDeCoccion = "crudo" | "cocido" | null;

export function estadoDeCoccion(normalizado: string): EstadoDeCoccion {
  let estado: EstadoDeCoccion = null;
  for (const palabra of tokens(normalizado)) {
    // El crudo manda: un nombre que dice las dos cosas ("raw, cooked weight")
    // está hablando de un alimento crudo y aclarando cómo se pesó.
    if (CRUDO.has(palabra)) return "crudo";
    if (COCIDO.has(palabra)) estado = "cocido";
  }
  return estado;
}

/**
 * Lo que la visión dijo, SIN las palabras que solo describen la presentación.
 *
 * Es el denominador de la cobertura difusa y nada más: el texto que se compara
 * nunca pasa por acá. Ver `DESCRIPTORES_DE_PRESENTACION` en `constants.ts`.
 *
 * Si al sacar los descriptores no queda nada (alguien fotografió algo que la
 * visión nombró "grilled"), se devuelve el texto entero: un denominador cero
 * daría una cobertura infinita, que es la peor manera de equivocarse.
 */
export function sinDescriptores(normalizado: string): string {
  const utiles = tokens(normalizado).filter((palabra) => !PALABRAS_QUE_NO_SON_COMIDA.has(palabra));
  return utiles.length === 0 ? normalizado : utiles.join(" ");
}

/**
 * Las PREPARACIONES que declara este texto. Ver
 * `PREPARACIONES_QUE_CAMBIAN_LA_FICHA` en `constants.ts`.
 *
 * Se usa de los dos lados —sobre el nombre de la ficha y sobre lo que dijo la
 * visión— y para lo mismo: si uno nombra una preparación y el otro no, no están
 * hablando del mismo alimento.
 */
export function preparacionesDeclaradas(normalizado: string): Set<string> {
  return new Set(tokens(normalizado).filter((palabra) => PREPARACIONES.has(palabra)));
}

/** ¿Los dos textos declaran EXACTAMENTE las mismas preparaciones? */
export function mismasPreparaciones(a: string, b: string): boolean {
  const pa = preparacionesDeclaradas(a);
  const pb = preparacionesDeclaradas(b);
  if (pa.size !== pb.size) return false;
  for (const p of pa) if (!pb.has(p)) return false;
  return true;
}

/**
 * La palabra en la que arranca el primer acompañamiento, o `-1` si no hay.
 *
 * Ver `CONECTORES_DE_ACOMPANAMIENTO` en `constants.ts`.
 */
export function inicioDelAcompanamiento(normalizado: string): number {
  const palabras = tokens(normalizado);
  for (let i = 0; i < palabras.length; i += 1) {
    const palabra = palabras[i];
    if (palabra !== undefined && CONECTORES.has(palabra)) return i;
  }
  return -1;
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
