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
 * Cuántas lecturas como mucho se le sacan a un término con barras. Ver
 * `lecturasDelTermino`.
 */
export const MAXIMO_DE_LECTURAS = 6;

/**
 * LAS LECTURAS DE UN TÉRMINO: la barra de la visión es una O, no una palabra.
 *
 * Cuando el modelo no se decide entre dos nombres escribe los dos con una barra
 * en el medio: `cured ham, serrano/iberico`, `jamón serrano/ibérico`. Normalizar
 * convierte esa barra en un espacio, y ahí el problema no es de puntuación sino
 * de sentido: `jamon serrano iberico` es una frase que NADIE escribió, y contra
 * ella el alias `Jamón serrano` (0,8) deja de matchear exacto y cae al difuso.
 *
 * MEDIDO EN EL GOLDEN SET DE 30, y es la única regresión que tuvo la corrida v2:
 * en el plato 18 la visión escribió `serrano` a secas y el motor llegó a
 * `Jamón crudo` (195 kcal) por el alias; en el plato 16 escribió
 * `serrano/iberico` y terminó en `Jamón` cocido (117 kcal), un 40 % menos. La
 * ficha correcta estaba, el alias estaba, y lo único que había cambiado era la
 * barra.
 *
 * LA REGLA: cada pedazo con barras se lee una vez por rama, y las ramas se
 * suman —no se multiplican— cuando hay más de un pedazo. `A b/c d e/f` da cuatro
 * lecturas y no seis: cada barra se resuelve por su cuenta, con las demás
 * enteras. Es deliberado y es lo que mantiene el costo acotado; el caso real es
 * siempre UNA barra.
 *
 * LA PRIMERA LECTURA ES SIEMPRE LA LITERAL, y quien elige entre ellas
 * (`buscarAlimento`) solo se queda con otra si es ESTRICTAMENTE mejor. Un término
 * sin barras devuelve una sola lectura y el motor se comporta exactamente igual
 * que antes: esto no puede cambiar ningún match que no tuviera una barra adentro.
 */
export function lecturasDelTermino(texto: string): string[] {
  if (typeof texto !== "string") return [""];
  const lecturas = [texto];
  if (!texto.includes("/")) return lecturas;
  // Un "pedazo con barras" es una corrida de caracteres sin espacios que tiene al
  // menos una barra: `serrano/iberico`, `and/or`, `1/2`.
  const pedazos = texto.match(/\S*\/\S*/g) ?? [];
  for (const pedazo of pedazos) {
    const ramas = pedazo.split("/").map((r) => r.trim()).filter((r) => r.length > 0);
    // Una barra que no separa dos nombres (`/ solo`, `1/`) no dice nada.
    if (ramas.length < 2) continue;
    for (const rama of ramas) {
      if (lecturas.length >= MAXIMO_DE_LECTURAS) return lecturas;
      const lectura = texto.replace(pedazo, rama);
      if (!lecturas.includes(lectura)) lecturas.push(lectura);
    }
  }
  return lecturas;
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
 * LA COLA DESCRIPTIVA: los pedazos que dicen CÓMO SE MIDIÓ el alimento, no cuál es.
 *
 * `MARCADOR_GENERICO` cubre la familia de "no lo especificamos más" y cubre
 * SEGMENTOS ENTEROS entre comas. Falta la otra mitad, que la evaluación del golden
 * set de 30 midió como la ÚNICA causa de los 5 silencios que quedaban: USDA le
 * agrega al nombre una cola que declara si la grasa se sumó, si la cáscara se comió
 * o si la piel entró a la medición. `Cucumber, with peel, raw` es un pepino;
 * `Corn, canned, cooked, fat added, NS as to fat type` es maíz de lata. Nadie
 * fotografía "maíz con la grasa agregada": fotografía maíz.
 *
 * SON FRASES, NO PALABRAS, Y SE SACAN DE CUALQUIER POSICIÓN. Dos razones medidas:
 *
 *   · en inglés la cola a veces es un segmento entre comas (`, fat added,`) y a
 *     veces va pegada al medio del nombre (`Cucumber, with peel, raw`);
 *   · EN ESPAÑOL NO HAY COMAS. La curación escribe `Pepino crudo con cáscara`,
 *     `Maíz de lata cocido con grasa`, `Papa asada con cáscara` — un nombre
 *     corrido. Una regla que solo partiera por comas no mordería NI UNA vez del
 *     lado español, que es justamente el lado donde escribe el usuario. Medido en
 *     el Bloque 0 de la WS06: "pepino" no encontraba `Pepino crudo con cáscara`,
 *     con la ficha existiendo.
 *
 * SOLO LO QUE SUMA, NUNCA LO QUE RESTA, Y ESTO SE MIDIÓ CARO. La primera versión
 * de esta lista incluía las formas negativas —`without salt`, `sin grasa`,
 * `fat free`— por simetría, y la simetría era falsa: un marcador ADITIVO dice que
 * la medición incluyó algo que el alimento normalmente trae, mientras que uno
 * SUSTRACTIVO nombra OTRO PRODUCTO. Medido sobre el catálogo 3.1.0, con las
 * negativas adentro:
 *
 *   · "mayonesa kraft" pasaba de *Mayonesa* (680 kcal/100 g) a *Mayonesa SIN
 *     GRASA Kraft* (64) — y a confianza 1,0, porque la variante entraba por el
 *     nivel exacto. **Diez veces menos calorías.**
 *   · "butter" pasaba de `Butter, NFS` (743) a `Butter, without salt` (717);
 *     "aderezo italiano" de 268 kcal a 47; "leche chocolatada con menos azúcar"
 *     al descremado.
 *
 * La luz baja en grasa no es la comida sin la etiqueta: es otra ficha, y el
 * catálogo la mide aparte a propósito (lo mismo que `Apple, raw, without skin`,
 * que `DESCRIPTORES_DE_PRESENTACION` ya declara fuera de alcance por la fibra).
 *
 * QUÉ ENTRA Y QUÉ NO. Entra una frase solo si SUMA algo a la medición (se agregó
 * grasa, se comió la piel, se salaron) y su ausencia deja el mismo alimento. No
 * entra nada que nombre comida, que reste, ni que cambie de ficha: `with cheese`
 * es un ingrediente, `breaded` es otra ficha con pan rallado, `green` en
 * `Cabbage, green` es una variedad.
 *
 * LAS FRASES SE ESCRIBEN LEGIBLES Y SE COMPARAN PLEGADAS, igual que el resto del
 * vocabulario: `con cáscara` se escribe con tilde y se compara como `con cascara`.
 */
export const COLAS_DESCRIPTIVAS: readonly string[] = [
  // inglés — la grasa que la medición SUMÓ
  "fat added", "salt added",
  // inglés — la piel y la cáscara que entraron a la medición
  "with peel", "with skin", "peel eaten", "skin eaten",
];

/**
 * EL LADO ESPAÑOL SE ESCRIBE DISTINTO Y HAY QUE LEERLO DISTINTO.
 *
 * La curación no escribe frases fijas: escribe `con` y un sustantivo, y los
 * encadena con una `y` — `Lentejas cocidas con sal y grasa`,
 * `Papa asada con cáscara`, `Maíz de lata cocido con grasa`. Una lista de frases
 * cerradas tendría que enumerar todas las combinaciones; una lista de
 * SUSTANTIVOS más la regla de la conjunción las cubre todas y no enumera nada.
 *
 * SOLO `con`, NUNCA `sin`, por la misma razón que la lista inglesa dejó afuera las
 * negativas: `Mayonesa sin grasa` no es mayonesa, y sacarle el `sin grasa` la
 * hacía ganar la palabra "mayonesa" a 64 kcal cuando la mayonesa son 680.
 */
export const SUSTANTIVOS_DE_MEDICION: readonly string[] = ["grasa", "cascara", "piel", "sal", "hueso"];

/** Las colas inglesas, ya plegadas y partidas en palabras. */
const COLAS_EN = COLAS_DESCRIPTIVAS.map((frase) => tokens(claveDeMatching(frase))).sort((a, b) => b.length - a.length);
const MEDICION = new Set(SUSTANTIVOS_DE_MEDICION.map((p) => claveDeMatching(p)));

/**
 * La clave SIN su cola descriptiva. Devuelve la misma clave si no tenía ninguna.
 *
 * Recorre por PALABRAS, nunca por subcadenas, que es lo que impide que `con sal`
 * muerda adentro de `pasta con salsa`. Y una clave que fuera ENTERA su propia
 * cola se devuelve intacta: vaciar un nombre no es normalizarlo.
 */
export function sinColaDescriptiva(clave: string): string {
  const palabras = tokens(clave);
  const salida: string[] = [];
  let i = 0;
  while (i < palabras.length) {
    const palabra = palabras[i] ?? "";
    if (palabra === "con" && MEDICION.has(palabras[i + 1] ?? "")) {
      i += 2;
      // `con sal Y grasa`: la conjunción encadena más sustantivos de medición, y
      // sacar solo el primero dejaría una `y` huérfana colgada del nombre.
      while (palabras[i] === "y" && MEDICION.has(palabras[i + 1] ?? "")) i += 2;
      continue;
    }
    const frase = COLAS_EN.find((cola) => cola.every((p, j) => palabras[i + j] === p));
    if (frase !== undefined) {
      i += frase.length;
      continue;
    }
    salida.push(palabra);
    i += 1;
  }
  return salida.length === 0 ? clave : salida.join(" ");
}

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
  const agregarClave = (clave: string): void => {
    if (clave.length > 0 && clave !== literal) variantes.add(clave);
  };
  // CADA VARIANTE SE AGREGA DOS VECES: con su cola descriptiva y sin ella. Las
  // dos, nunca una en lugar de la otra — es lo que vuelve a la regla puramente
  // ADITIVA. La clave que el índice ya tenía la sigue teniendo, y la nueva se
  // suma; una variante no puede sacarle el lugar a otra ni a un nombre escrito.
  const agregar = (partes: string[]): void => {
    const clave = claveDeMatching(partes.join(" "));
    agregarClave(clave);
    agregarClave(sinColaDescriptiva(clave));
  };
  // EL NOMBRE ENTERO, SIN SU COLA. Es la única vía que muerde del lado español:
  // `Pepino crudo con cáscara` no tiene ni una coma, así que ninguna de las
  // pasadas por segmentos lo toca, y sin esta línea la ficha seguiría invisible
  // para quien escribe "pepino".
  agregarClave(sinColaDescriptiva(literal));
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

/**
 * ¿DOS PALABRAS SUELTAS NOMBRAN EL MISMO ALIMENTO?
 *
 * Existe por el residuo del plegado pobre, y el caso es exactamente este: la
 * ficha `Tomatoes, raw` tiene clave `tomatoe raw` —`plegarPlural` le saca UNA `s`
 * y no pretende acertar el singular— y la visión escribe `tomato, sliced`, cuya
 * clave es `tomato`. Comparando las claves ENTERAS eso no molesta nunca, porque
 * los dos textos pasan por la misma función y caen en la misma clave; comparando
 * PALABRA CONTRA PALABRA entre dos textos distintos (una consulta contra el
 * nombre de una ficha, que es lo que hace `respaldoDeIdentidad`) sí molesta:
 * `tomato` y `tomatoe` son la misma palabra y darían distinto.
 *
 * La tolerancia es UNA sola y del mismo tamaño que el plegado que la causó: se
 * ignora una `e` final en palabras de 4 letras o más. `lime`/`lima` siguen siendo
 * dos palabras distintas (`lim` no es `lima`), que es lo que hay que preservar.
 *
 * EL ERROR BARATO ESTÁ DE ESTE LADO: quien pregunta por esta función lo hace para
 * decidir si dos textos hablan del mismo alimento, y de más a menos el costo es
 * asimétrico — creer que comparten una palabra deja las cosas como están, creer
 * que no comparten NINGUNA es lo que dispara una decisión.
 */
export function mismaPalabra(a: string, b: string): boolean {
  if (a === b) return true;
  const raiz = (p: string): string =>
    p.length >= LARGO_MINIMO_PARA_PLEGAR && p.endsWith("e") ? p.slice(0, -1) : p;
  return raiz(a) === raiz(b);
}
