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
 *
 * CARD 2.8 — LOS MODIFICADORES DE CORTE. El golden set de 30 dejó el caso que no
 * admite discusión: `apple, raw` matchea EXACTO al 95 % en el plato 01 y
 * `apple slices` sale `no_catalogado` en el plato 23, la misma fruta, el mismo
 * motor y la misma corrida. Diez de los once silencios sobre comida catalogada
 * eran "el ingrediente correcto + un modificador que la ficha no lleva", y la
 * mitad de esos modificadores eran de CORTE, no de cocción: `slices`, `shredded`,
 * `halved`. Cortar una manzana no la convierte en otro alimento.
 *
 * LO QUE NO ENTRÓ, Y POR QUÉ. `ground` / `minced` (carne picada ES otra ficha,
 * con otra grasa), `strips` (`Chicken tender or strip` es una ficha propia,
 * rebozada), `mashed` (el puré lleva leche y manteca) y `peeled` (el catálogo
 * mide aparte `Apple, raw, without skin`: la piel es fibra). Todas describen un
 * corte, y en las cuatro el corte CAMBIA la ficha. La prueba de admisión no es
 * "¿es un corte?" sino "¿el catálogo mide distinto lo cortado?".
 */
export const DESCRIPTORES_DE_PRESENTACION: readonly string[] = [
  // inglés (el registro en el que USDA y la visión escriben)
  "raw", "fresh", "cooked", "grilled", "fried", "baked", "roasted", "boiled",
  "steamed", "toasted", "sauteed", "seasoned", "sliced", "chopped", "diced",
  "shredded", "melted", "whole", "homemade", "style", "plain", "mixed",
  // inglés — corte y forma (card 2.8)
  "slice", "slices", "wedge", "wedges", "halved", "halves", "quartered",
  "cubed", "cubes", "grated", "chunk", "chunks", "piece", "pieces",
  // español (el registro del usuario y de la curación)
  "crudo", "cruda", "cocido", "cocida", "asado", "asada", "frito", "frita",
  "horneado", "horneada", "hervido", "hervida", "plancha", "salteado", "salteada",
  "tostado", "tostada", "rallado", "rallada", "picado", "picada", "troceado",
  "derretido", "derretida", "casero", "casera", "estilo", "natural", "entero",
  "entera",
  // español — corte y forma (card 2.8)
  "rodaja", "rodajas", "gajo", "gajos", "loncha", "lonchas", "lamina", "laminas",
  "cortado", "cortada", "mitad", "mitades", "cubo", "cubos", "trozo", "trozos",
];

/**
 * LAS PREPARACIONES QUE SÍ CAMBIAN LA FICHA.
 *
 * Son las palabras de cocción de la lista de arriba (más un par que esa lista
 * deliberadamente no tiene, como `breaded`: rebozar no es presentación, es pan
 * rallado y aceite), y existen por el falso amigo que el corte no tiene: una
 * papa cortada sigue siendo una papa (87 kcal/100 g), pero
 * una papa FRITA es `Potato, french fries` (312 kcal/100 g) — otra ficha, otro
 * número, casi cuatro veces. Freír, asar, hornear o rebozar agregan grasa o
 * sacan agua; rebanar no hace ninguna de las dos.
 *
 * DÓNDE MUERDE Y DÓNDE NO. En la cobertura difusa estas palabras se descuentan
 * igual que cualquier otro descriptor: ahí lo único que se mide es cuánto texto
 * quedó sin explicar, y "fried" no es comida sin explicar. Donde muerden es en el
 * MATCH POR NOMBRE PARTIDO (la card 2.8, en `match.ts`): ahí el nombre del
 * catálogo ya no tiene que estar entero y seguido adentro de la consulta, y sin
 * este freno "fried potato wedges" alcanzaría a `Potato, boiled` armando el
 * nombre con las palabras sueltas que le convienen. La regla es simétrica: si una
 * de las dos partes nombra una preparación y la otra no, no hay nombre partido.
 *
 * OJO CON LO QUE NO ESTÁ: `cooked`, `boiled`, `hervido` y `raw` NO son
 * preparaciones, son ESTADOS, y viven en `PALABRAS_DE_CRUDO` /
 * `PALABRAS_DE_COCIDO` con su propia regla de desempate. La diferencia es la de
 * siempre en este motor: un estado dice CÓMO ESTÁ el mismo alimento, una
 * preparación dice que es OTRO.
 */
export const PREPARACIONES_QUE_CAMBIAN_LA_FICHA: readonly string[] = [
  "grilled", "fried", "baked", "roasted", "steamed", "toasted", "sauteed",
  "breaded", "smoked", "creamed",
  "asado", "asada", "frito", "frita", "horneado", "horneada", "plancha",
  "salteado", "salteada", "tostado", "tostada", "rebozado", "rebozada",
  "empanado", "ahumado", "ahumada",
  // OJO: `empanada` NO está y no puede estar — en español es un ALIMENTO, no una
  // preparación, y meterla acá haría que la palabra que nombra el plato lo
  // descalifique.
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

/**
 * EL PISO DE CONFIANZA QUE NECESITA UN TOTAL PARA LLAMARSE COMPLETO.
 *
 * No es un umbral de matching: ningún item se descarta por esto y ninguna ficha
 * deja de mostrarse. Es una compuerta sobre EL NÚMERO DE PORTADA. La regla es
 * una sola línea: **si NINGÚN alimento del plato llega a este piso, la suma de
 * esos alimentos no se publica como un total completo.**
 *
 * POR QUÉ EXISTE, con el caso que la abrió: una foto de comida de plástico de
 * exhibición (réplicas de resina en una vitrina) pasó la visión como comida, sus
 * DOS ítems resolvieron a `Miel` con confianza final 0,088 cada uno, y el motor
 * publicó **1.550,4 kcal marcadas `completo: true`, con 510 de 510 g
 * cuantificados**. Cada paso era correcto por separado —la aritmética, la ficha,
 * la confianza declarada— y el resultado era una afirmación en firme construida
 * sobre dos matches que el propio motor consideraba basura. Sumar y no dudar es
 * la falla; la compuerta la corta donde nace.
 *
 * DE DÓNDE SALE EL NÚMERO. Del histograma real del golden set de 30 platos, y
 * mirando lo que importa: **la confianza del MEJOR ítem de cada plato**, que es
 * lo que la compuerta compara. Ordenado, ese histograma tiene un hueco:
 *
 *   0,088  ← plato 28, la comida de plástico (los dos ítems, `Miel`)
 *   ────── el hueco: no hay NI UN plato del set acá adentro ──────
 *   0,152  ← plato 24, espaguetis con albóndigas: las DOS fichas correctas
 *   0,185  ← plato 03, paella: la ficha correcta
 *   0,285 · 0,375 · 0,510 · 0,638 · 0,680 · 0,720 · 0,765 · 0,950 · 0,980
 *
 * 0,12 cae en el medio de ese hueco: un 36 % por encima del plástico y un 21 %
 * por debajo del plato correcto más flojo. Es el punto que más margen deja de
 * los dos lados, y por eso se elige ese y no el borde de ninguno.
 *
 * EL TRADE-OFF, DICHO ENTERO. Un piso más alto convertiría en "parcial" platos
 * que están BIEN: con 0,16 se cae el plato 24 (702,8 kcal, dos fichas correctas)
 * y con 0,20 se cae además la paella. Un piso más bajo (0,09) dejaría al plástico
 * a cuatro milésimas de pasar, que no es un margen. El costo de equivocarse para
 * arriba es barato —un plato correcto se muestra como total parcial, con sus
 * ítems y sus números a la vista igual— y el de equivocarse para abajo es el
 * plato 28 otra vez. Ante la duda, el piso se sube.
 *
 * LÍMITE DECLARADO: la compuerta mira el MEJOR ítem, no el promedio. Un plato con
 * un ítem al 0,9 y cinco al 0,05 sigue saliendo completo. Es deliberado: ahí hay
 * comida bien identificada y la reserva de los otros cinco se lee en cada ítem.
 * Lo que esta constante impide es un total donde NADA se identificó bien.
 */
export const CONFIANZA_MINIMA_PARA_UN_TOTAL = 0.12;

/**
 * LA SEGUNDA PUERTA DE LA COMPUERTA: CUÁNTO DE LO QUE DIJO LA VISIÓN TIENE QUE
 * NOMBRAR LA FICHA PARA QUE EL MOTOR PUEDA DECIR "SÉ QUÉ ES ESTO".
 *
 * POR QUÉ HACÍA FALTA UNA SEGUNDA PUERTA (DT-37, corrida v3 del golden). El
 * plato 05 —una lasaña— llegó a SU ficha correcta (`fdc-2708755` Lasaña con
 * carne y espinaca), con la aritmética exacta, y no publicó total: la visión
 * escribió un nombre largo (`lasaña ... carne ... espinaca ... ricotta`), el
 * término del catálogo que ganó fue el alias corto `Lasaña`, y la cobertura
 * difusa —que mide CUÁNTO DEL TEXTO quedó sin explicar— se hundió a 0,21. Con
 * eso la confianza final quedó en 0,084 contra el piso de 0,12 y la compuerta,
 * escrita para la comida de plástico del plato 28, se disparó sobre un plato
 * bueno. **El piso está para cortar "no sé qué es esto", no "sé qué es y lo
 * encontré por una vía que puntúa bajo".**
 *
 * QUÉ MIDE ESTE NÚMERO, que es OTRA cosa que la cobertura: la cobertura compara
 * la consulta contra EL TÉRMINO que ganó (`Lasaña`, seis letras); el respaldo la
 * compara contra TODO EL VOCABULARIO DE LA FICHA —sus nombres en los dos idiomas
 * y sus alias— y cuenta qué proporción de las palabras de identidad de la
 * consulta nombra esa ficha. Es la pregunta del usuario: "¿la ficha que me
 * diste habla de lo que yo describí?".
 *
 * DE DÓNDE SALE EL NÚMERO. Del histograma real de los ítems que quedaron POR
 * DEBAJO del piso en las tres corridas del golden set (v1, v2 y v3), que son los
 * únicos a los que esta puerta les cambia algo:
 *
 *   0,14 · 0,17 · 0,17 · 0,17 · 0,17 · 0,20   ← los seis ítems `Miel` de la
 *                                               comida de plástico (plato 28)
 *   0,25 · 0,25   ← `fish fillet ...` → Pescado: sabe que es pescado y nada más
 *   ─────────── el hueco ───────────
 *   0,50 · 0,50   ← `tuna, canned` → Atún · `pork meatball, boiled` → Cerdo:
 *                   la ficha explica la mitad, y lo que NO explica (la albóndiga)
 *                   es justamente lo que movería el número
 *   0,75          ← la lasaña del plato 05, con su ficha correcta
 *
 * 0,6 cae entre 0,50 y 0,75 y deja afuera a los dos del 0,50: **ante la duda el
 * piso se sube**, que es la misma regla con la que se eligió el 0,12. Con 0,5 la
 * albóndiga de cerdo publicaría un total apoyada en una ficha de cerdo genérico.
 *
 * LÍMITES DECLARADOS, los tres:
 *   · la puerta NO se abre para la dirección "la consulta está DENTRO del nombre
 *     del catálogo" (`flatbread` → `Crackers, flatbread`). Ahí el respaldo vale
 *     1 por construcción —la consulta es una palabra y la ficha la contiene— y
 *     lo que sobra son afirmaciones DEL CATÁLOGO que la visión nunca hizo: es el
 *     caso medido que publicó una galleta donde había una tortilla (+89 %);
 *   · el respaldo mide PALABRAS, no significados: una ficha que comparte la
 *     palabra sin ser el alimento (el `Cóctel` de `cocktail sausages`) cuenta
 *     como explicada. Por eso es una SEGUNDA puerta y no un reemplazo del piso;
 *   · sigue haciendo falta que la visión haya sabido qué miraba: la mitad de
 *     visión de la confianza se compara contra el mismo piso. Ver `sumarTotales`.
 */
export const RESPALDO_MINIMO_DE_IDENTIDAD = 0.6;

/** Los factores de Atwater, en kcal por gramo. Convención universal. */
export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

/** Decimales con los que se redondea todo lo que sale del motor. */
export const DECIMALES = 3;

/** El método de composición por defecto cuando la visión no declara ninguno. */
export const PREPARACION_POR_DEFECTO = "mezclado";
