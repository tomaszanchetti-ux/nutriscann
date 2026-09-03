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
 * Cuánto se le descuenta a un plato compuesto SOLO CON PARTE de lo que se vio
 * (card 5.3).
 *
 * La composición completa vale 0,8 porque la aritmética está medida y lo que se
 * estimó es la proporción. La parcial vale menos por una razón distinta y peor:
 * hay masa del plato que NO tiene ficha y se está respondiendo por ella con la
 * densidad de lo que sí la tiene. 0,6 es tres cuartos de la completa, que es la
 * misma proporción con la que el difuso (0,6) se descuenta contra el exacto
 * (1,0) — y sale del mismo criterio: cuando se responde por algo que no se vio,
 * la reserva se declara en la confianza, no en una nota al pie.
 */
export const FACTOR_COMPOSICION_PARCIAL = 0.6;

/**
 * CUÁNTA MASA DEL PLATO PUEDE FALTAR PARA QUE LA COMPOSICIÓN PARCIAL SIGA SIENDO
 * HONESTA (card 5.3).
 *
 * La regla vieja de `compose.ts` —o están todos los ingredientes o no hay
 * composición— es correcta en su motivo y está medida en su costo: la pizza de
 * producción del 02/09 resolvió 3 de 4 ingredientes y salió SIN NÚMEROS porque
 * faltaba la masa. Lo que la regla vieja no distinguía es CUÁNTO faltaba.
 *
 * 25 % de la masa, y el número sale de qué error puede producir. La composición
 * parcial escala el `per_100g` de lo resuelto a la masa ENTERA del plato, así
 * que el error relativo del total es, como mucho, la diferencia de densidad
 * entre lo que falta y lo que quedó, POR la fracción que falta. Con un cuarto de
 * la masa ausente y una densidad que se equivoque por el doble —el peor caso
 * realista entre dos alimentos del mismo plato— el total se va un 25 %. Medido
 * en el Bloque 0: la diferencia entre responder un plato compuesto por identidad
 * y componerlo llega al +76 % (el salmón), así que un 25 % es el orden de error
 * que este motor ya considera preferible a callarse.
 *
 * Por encima de un cuarto no se compone: ahí lo que falta ya no es un detalle
 * del plato, es una parte del plato, y el número saldría con cara de medido.
 */
export const MASA_FALTANTE_MAXIMA = 0.25;

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
 * LAS FAMILIAS QUE SE COMEN CRUDAS. Card 6.3.
 *
 * Son ids de familia de la taxonomía (`kb/familias.ts`), y solo las usa el
 * desempate simétrico del crudo/cocido (`desempateDeEstado`, en `match.ts`):
 * cuando la ficha cruda y su hermana cocida EMPATAN y la consulta no dijo nada
 * del estado, la cruda solo gana si su familia está en esta lista.
 *
 * POR QUÉ HACE FALTA, Y ES LO QUE MIDIÓ EL RETOQUE DE LA CARD 6.3. El desempate
 * se lo preguntaba únicamente a las kcal, y las kcal saben decir UNA sola cosa:
 * "esta ficha está SECA" (`Lentejas crudas` 352 contra las cocidas 166; el arroz
 * salvaje 357 contra 101). Lo que NO saben decir es "esto no se come crudo"
 * cuando cocinar AGREGA grasa en vez de sacar agua, porque ahí la cruda es la
 * menos densa y tiene exactamente la misma forma que una lechuga:
 *
 *   · `huevo duro` → `Huevo crudo` (143 kcal) en lugar de `Huevo cocido` (176).
 *     Es el caso real de producción del 03/09/2026, y es inaceptable de cara al
 *     usuario: alguien que escribe "huevo duro" no puede recibir huevo crudo.
 *   · `patata troceada` → `Patatas crudas con cáscara` (77) en lugar de
 *     `Patata hervida con cáscara` (126).
 *
 * LA TAXONOMÍA SÍ SABE LO QUE LAS KCAL NO: `Lechuga cruda` y `Tomate crudo` son
 * `verdura`, la manzana es `fruta`, y el huevo y la patata tienen FAMILIA PROPIA
 * (`huevo`, `patata`) porque el catálogo los mide aparte.
 *
 * MEDIDO (Q/A de la card 6.3, WS14): **16 de las 46 familias** tocan alguna
 * ficha que declara estar cruda —no cinco, como decía una cuenta vieja de este
 * comentario— (`verdura`, `fruta`, `huevo`, `patata`, `legumbre`,
 * `cereal-y-grano`, `cerdo`, `embutido`, `marisco`, `pescado`, `pollo`, `leche`,
 * `frutos-secos`, `alternativa-vegetal`, `bolleria`, `zumo-y-batido`). Pero
 * TOCAR una ficha cruda no es lo mismo que exponer el PATRÓN que este desempate
 * necesita para tener algo que decidir: una hermana cruda Y una cocida con el
 * MISMO texto sin descriptores (`sinDescriptores`, condición 2 de
 * `desempateDeEstado`). Ese patrón, barrido sobre el catálogo real, solo lo
 * producen **7** de esas 16: `verdura`, `fruta`, `huevo` y `patata` —donde la
 * familia es lo que decide, en las dos direcciones— y `legumbre`,
 * `cereal-y-grano` y `cerdo` —donde la densidad ya frenaba antes de que la
 * familia opinara.
 *
 * `PESCADO` Y `FRUTOS-SECOS` NO ESTÁN EN LA LISTA, Y NO ES UN OLVIDO: son dos
 * familias donde el crudo SÍ es una forma normal de comer (salmón crudo, frutos
 * secos crudos), la misma situación que `verdura` y `fruta` — pero hoy el
 * catálogo no las expone al patrón: barrido sobre las 1.115 fichas, CERO
 * hermanas (ninguna ficha cruda de `pescado` o de `frutos-secos` tiene una
 * cocida declarada con el mismo texto sin descriptores). El desempate nunca
 * llega a preguntarles nada, así que agregarlas hoy sería escribir una regla que
 * ningún dato ejercita. Si el catálogo suma esa hermana el día de mañana —un
 * `Salmón cocido`, por ejemplo—, esta lista tiene que revisarse recién ahí, con
 * el caso medido y no por anticipado.
 *
 * LA LISTA ES CORTA Y CERRADA A PROPÓSITO, como `DESCRIPTORES_DE_PRESENTACION`:
 * la prueba de admisión no es "¿se puede comer crudo?" —un huevo se puede— sino
 * "¿es ASÍ como se come normalmente, y es lo que hay en la foto?". Agregar una
 * familia de más devuelve alimentos crudos donde había comida cocinada, que es el
 * error que este retoque vino a cerrar.
 */
export const FAMILIAS_QUE_SE_COMEN_CRUDAS: readonly string[] = ["verdura", "fruta"];

/**
 * EL PISO DE CONFIANZA QUE DEJÓ DE GOBERNAR EL TOTAL.
 *
 * HASTA HOY (03/09/2026, card 6.2) esta constante era una compuerta: si ningún
 * alimento del plato llegaba a este piso, `sumarTotales` (`arithmetic.ts`)
 * apagaba el total entero —los ocho `nutrients` en `null`— y el front mostraba
 * "Sin números para este plato". Tomás la REDEFINIÓ hoy, con el motivo dicho en
 * sus palabras: **«no mostrar ficha nos MATA»**. Desde esta card el total se
 * publica SIEMPRE y esta constante YA NO DECIDE NADA sobre él: ni si se
 * publica, ni si lleva un aviso. La confianza deja de ser un score que quien
 * usa la app tenga que interpretar; la señal de calidad de un plato pasa a ser
 * la VÍA por la que se llegó a cada ficha (exacto, alias, difuso, cabeza de
 * familia…), mostrada ítem por ítem — harina de otra card, no de esta.
 *
 * POR QUÉ EXISTIÓ, con el caso que la abrió (card 2.8): una foto de comida de
 * plástico de exhibición (réplicas de resina en una vitrina) pasó la visión
 * como comida, sus DOS ítems resolvieron a `Miel` con confianza final 0,088
 * cada uno, y el motor publicó 1.550,4 kcal con cara de dato medido. Cada paso
 * era correcto por separado —la aritmética, la ficha, la confianza declarada—
 * y el resultado era una afirmación en firme construida sobre dos matches que
 * el propio motor consideraba basura. La card 2.8 cortaba esa afirmación
 * entera tapando el total del plato; la card 6.2 decidió que tapar el plato
 * entero —CUALQUIER plato, no solo el del plástico— le costaba más caro al
 * producto que dejar ver un número que a veces viene de una identificación
 * floja.
 *
 * DE DÓNDE SALÍA EL NÚMERO ORIGINALMENTE (card 2.8, golden set de 30 platos,
 * visión v1-v3, ítems sueltos): el hueco entre el plástico (0,088) y el plato
 * correcto más flojo (0,152) dejaba margen de sobra para elegir 0,12. Ese
 * histograma YA NO REPRESENTA LA REALIDAD: la visión v6 y el motor de la Fase 5
 * (compuestos, cabezas de subfamilia y familia) mueven la confianza de cada
 * plato, y el plástico dejó de ser el peor caso — lo que terminó de justificar
 * la redefinición de hoy.
 *
 * LO MEDIDO HOY (WS12, `node golden/bin/replay-vision.js` sobre
 * `fase/06-gramos-y-confianza` con las cards 6.1 y 6.3 adentro), la confianza
 * del MEJOR ítem por plato — que es lo que este piso comparaba — de las 31
 * fotos del golden, ordenada:
 *
 *   0,160 30-envase-cerrado (difuso; es un envase con etiqueta legible, comida
 *         por diseño desde la card 5.2)
 *   0,206 · 0,218 · 0,255 · 0,270  (risotto, arepa, queso manchego, naranja)
 *   0,306 28-comida-plástico (`cabeza_subfamilia`; la visión v6 la dio por
 *         comida al 72 %)
 *   0,319 · 0,319 · 0,324 · 0,355  (huevos rotos, croquetas, jamón serrano, pan
 *         tostado)
 *   0,361 · 0,383 · 0,393  (cocido, espaguetis, ensalada mixta compuesta)
 *   0,510 · 0,578 · 0,595 · 0,722 · 0,765 · 0,808 · 0,850 (×3) · 0,900 ·
 *   0,950 (×3) · 0,970 · 0,980
 *
 * LA CONCLUSIÓN MEDIDA: **ningún plato del golden quedaba bajo 0,12** —el piso
 * no frenaba a NADIE del set real— y **el plástico (0,306) quedaba por encima
 * de cinco platos reales** (envase, risotto, arepa, queso manchego, naranja).
 * La confianza sola ya no podía separar "esto es basura" de "esto es comida de
 * verdad, identificada floja": la card 2.8 confiaba en un hueco que la visión
 * de hoy cerró, y no hay ningún piso que dejara pasar esos cinco platos y
 * frenara al plástico a la vez, porque el plástico puntúa MÁS alto que ellos.
 *
 * LÍMITE DECLARADO, dicho con todas las letras: el plástico es un DEFECTO DE LA
 * VISIÓN, no algo que este piso —ni ningún piso de confianza— pudiera separar
 * de un plato real. La visión v6 lo clasificó como comida al 72 % y el motor lo
 * resolvió a una ficha con `identidad_respaldada`; ninguna de las dos cosas es
 * un fallo de la aritmética ni de esta constante. Va a una deuda de curación de
 * la visión aparte (`docs/DEUDAS.md`).
 *
 * QUÉ QUEDA DE ESTA CONSTANTE. El valor y el histograma se conservan, sin
 * ningún uso en `arithmetic.ts`: documentan por qué el total dejó de preguntar
 * nada sobre la confianza, y quedan disponibles si una futura card necesita un
 * piso de confianza para otra cosa. Hoy, ninguna lo usa.
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

/**
 * LO QUE VALE RESPONDER CON LA CABEZA DE UNA SUBFAMILIA (card 5.3).
 *
 * La cabeza NO es un match: es la respuesta declarada de la taxonomía cuando el
 * nombre que escribió la visión no llegó a ninguna ficha. La visión no eligió
 * palabras —eligió un valor de una lista cerrada de 191— así que la identidad
 * está declarada; lo que no está medido es que ESTA porción se parezca al
 * promedio de su subfamilia.
 *
 * 0,5 y no más, y está medido en el Bloque 0: sobre los 68 ítems del golden, la
 * cabeza de la subfamilia del ítem cae dentro de ±20 % de la ficha que
 * realmente ganó en 42 casos y fuera en 23. Dos de cada tres — que es
 * exactamente lo que vale un 0,5: mejor que una conjetura, peor que un nombre.
 *
 * 0,5 también deja la cabeza POR DEBAJO del techo del difuso (0,6) a propósito:
 * si la cabeza puntuara más alto que el parecido, un empate se resolvería a
 * favor del promedio, y la regla número uno de esta card es que el término
 * gana siempre (pisar el exacto lleva el atún en lata de 85 a 238 kcal).
 */
export const CONFIANZA_CABEZA_SUBFAMILIA = 0.5;

/**
 * LO QUE VALE RESPONDER CON LA CABEZA DE LA FAMILIA (card 5.3).
 *
 * Es el último recurso antes de callarse, y vale menos que la de subfamilia
 * porque el Bloque 0 midió exactamente cuánto se pierde al subir un nivel:
 * dentro de «verdura», la cruda son 30 kcal/100 g y la cocida con grasa 86 —
 * casi el triple— y las dos son la misma familia. **El número lo carga la
 * subfamilia, no la familia**, así que la cabeza de familia contesta QUÉ CLASE
 * de comida es y poco más.
 *
 * 0,3 es la mitad de la de subfamilia y coincide con la confianza típica de un
 * difuso flojo. Sigue por encima del piso del total (0,12) multiplicada por una
 * visión razonablemente segura, que es lo que se quiere: un plato identificado
 * por familia publica número, con la reserva escrita.
 */
export const CONFIANZA_CABEZA_FAMILIA = 0.3;

/**
 * LO QUE VALE UN SUSTITUTO DECLARADO POR LA CURACIÓN (card 5.3).
 *
 * Un sustituto no es un alias —la ficha no se llama así— pero tampoco es un
 * promedio: alguien miró el ingrediente, fue a los datasets, comprobó que USDA
 * no lo mide y escribió cuál es el más cercano, con el motivo. Vale como el
 * alias más flojo que admite el catálogo (0,5) y más que cualquier cabeza,
 * porque una decisión escrita a mano le gana a un promedio de familia.
 *
 * Ojo con lo que NO cambia: el sustituto solo entra cuando el matcher no llegó a
 * nada. Un término que resuelve a una ficha propia nunca lo ve.
 */
export const CONFIANZA_SUSTITUTO_DECLARADO = 0.55;

/** Los factores de Atwater, en kcal por gramo. Convención universal. */
export const ATWATER = { protein: 4, carbs: 4, fat: 9 } as const;

/* ===========================================================================
 * EL HALO DE PLAUSIBILIDAD (card 5.3)
 *
 * Toda ficha que el motor CONSTRUYE —un compuesto, un compuesto parcial— pasa
 * por `esPlausible` antes de publicarse. Las fichas del catálogo no: esas vienen
 * medidas por USDA y la trazabilidad es su garantía. Lo que este halo protege es
 * lo que sale de una cuenta nuestra sobre gramos que estimó una foto.
 *
 * LOS CUATRO NÚMEROS DE ABAJO ESTÁN ELEGIDOS CONTRA LAS 1.115 FICHAS DEL
 * CATÁLOGO, no a ojo, y hay un test que vuelve a medirlo: con estos valores
 * pasan las 1.115. Es la única calibración que tiene sentido, porque una
 * composición es un promedio ponderado de fichas del catálogo: un límite que
 * rechace una ficha real rechazaría el plato que la lleva adentro.
 * =========================================================================== */

/**
 * CUÁNTO SE LE PERDONA A LA MASA. En gramos por 100 g.
 *
 * Proteína + hidratos + grasa no pueden pasar de 100 g en 100 g de comida: el
 * alimento no puede pesar más que él mismo. Medido sobre el catálogo entero, la
 * ficha más alta es `Aceite de lino de primera prensada` con **100,09 g** —el
 * resto de los redondeos de USDA— y ninguna otra llega a 100. Medio gramo cubre
 * ese redondeo con margen y sigue cortando el disparate: una composición mal
 * escalada que dé 120 g de macros por 100 g no pasa.
 *
 * OJO CON LA FIBRA, y es un hallazgo de esta card. El enunciado natural de la
 * regla —"proteína + hidratos + grasa + FIBRA ≤ 100"— rechaza **41 fichas
 * perfectamente reales** (semillas de chía 123,8; lino 116,6; casi todos los
 * frutos secos), y no porque estén mal: USDA declara los hidratos *by
 * difference*, así que **la fibra YA ESTÁ ADENTRO de `carbs_g`** y sumarla otra
 * vez la cuenta dos veces. Lo que sí se verifica es la relación que eso implica:
 * la fibra nunca puede pasar a los hidratos que la contienen (medido: 0 fichas
 * de 1.115 la violan).
 */
export const TOLERANCIA_DE_MASA_G = 0.5;

/**
 * EL TECHO ABSOLUTO DE CALORÍAS POR 100 g.
 *
 * Nada supera a la grasa pura: 100 g de grasa son 900 kcal con Atwater. El techo
 * está en 902 y no en 900 porque es lo que MIDE el catálogo —`Sebo de vaca` y
 * `Manteca de cerdo`, las dos únicas fichas de grasa al 100 %, declaran 902 cada
 * una— y un candado se calibra contra el dato, no contra la teoría. Cualquier
 * cosa por encima de eso no es comida: es una cuenta rota.
 */
export const KCAL_MAXIMAS_POR_100G = 902;

/**
 * EL PISO PARA PREGUNTARLE ALGO A ATWATER. En kcal por 100 g.
 *
 * Por debajo de 5 kcal la comparación entre las calorías declaradas y las que
 * explican los macros deja de significar nada: el `Café descafeinado` declara 0
 * y sus macros dan 0,4, lo que en porcentaje es un −100 % y en la realidad es un
 * redondeo. Un candado que se dispara con el café no es un candado.
 */
export const KCAL_MINIMAS_PARA_ATWATER = 5;

/**
 * CUÁNTO PUEDEN QUEDARSE LAS CALORÍAS POR DEBAJO DE LO QUE EXPLICAN SUS MACROS.
 *
 * 40 %, y el número duele pero está medido. La card 5.1 ya había encontrado que
 * USDA calcula la fruta con factores propios (la banana cierra un −10,9 %), y el
 * barrido de esta card sobre las 1.115 fichas muestra que eso llega mucho más
 * lejos: **51 fichas quedan por debajo del −15 %** que parecía razonable, y son
 * todas verdura de hoja y cítricos perfectamente medidos — `Alcaparras` −37,4 %,
 * `Lima cruda` −35,8 %, `Limón` −34,7 %, `Berro` −27,9 %.
 *
 * Con −15 % este candado le sacaría el número a cualquier ensalada compuesta,
 * que es exactamente el plato que la Fase 5 vino a arreglar. 40 % deja pasar el
 * peor caso medido con margen y sigue cortando una cuenta rota, que se va de
 * escala, no de un tercio.
 */
export const MARGEN_ATWATER_INFERIOR = 0.4;

/**
 * CUÁNTO PUEDEN PASARSE LAS CALORÍAS POR ENCIMA DE LO QUE EXPLICAN SUS MACROS.
 *
 * Un 15 % relativo MÁS 25 kcal absolutas, y las dos mitades hacen falta. El 15 %
 * cubre los redondeos de una ficha densa; las 25 kcal cubren a los alimentos
 * cuyas calorías no vienen de ningún macro y que no son alcohol — el `Vinagre`
 * declara 21 kcal contra 3,7 de macros (es ácido acético), el `Café` 1 contra
 * 0,7. Sin el término absoluto, un porcentaje sobre casi-cero se dispara con
 * cualquier cosa.
 *
 * Medido: con este límite, de las 1.115 fichas fallan 16 y las 16 son
 * `bebida-alcoholica`. Ni una sola falsa alarma fuera de esa familia.
 */
export const MARGEN_ATWATER_SUPERIOR = 0.15;
export const KCAL_SIN_MACROS_TOLERADAS = 25;

/**
 * LA EXCEPCIÓN DEL ALCOHOL, DECLARADA Y ACOTADA.
 *
 * El etanol aporta 7 kcal/g y no es proteína, ni hidrato, ni grasa: una copa de
 * destilado son 231 kcal/100 g con CERO macros, y ningún margen relativo la va a
 * dejar pasar nunca. La excepción no se activa sola ni se adivina del número: la
 * declara la taxonomía (`aporta_alcohol` en la familia, hoy solo
 * `bebida-alcoholica`) y el motor la lee de ahí.
 *
 * 700 kcal es el tope del perdón: 100 g de etanol puro. Que la excepción tenga
 * techo es el punto — una composición con alcohol adentro sigue sin poder
 * declarar calorías que ni el etanol explicaría.
 */
export const KCAL_DE_ALCOHOL_TOLERADAS = 700;

/**
 * CUÁNTO PUEDEN SEPARARSE LOS GRAMOS DEL PLATO DE LA SUMA DE SUS INGREDIENTES.
 *
 * La visión estima dos cosas por separado: cuánto pesa el plato y cuánto pesa
 * cada ingrediente. Cuando las dos no se parecen, una de las dos está mal, y la
 * que se cree es la SUMA DE LOS INGREDIENTES: son cuatro estimaciones sobre
 * objetos chicos y separados en vez de una sobre un montón.
 *
 * Un factor de 2 y no menos, porque por debajo la diferencia todavía puede ser
 * legítima: la transformación cambia el peso (el horneado se queda en 0,759 del
 * peso de entrada, el hervido llega a 1,113) y encima está el error de mirar una
 * foto. Más allá del doble —o de la mitad— los dos números no hablan del mismo
 * plato, y el motor usa el que puede rehacer y lo declara.
 */
export const FACTOR_DE_MASA_COHERENTE = 2;

/**
 * CUÁNDO LA DIFERENCIA ENTRE ATWATER Y LA FUENTE MERECE LETRA CHICA (card 5.1).
 *
 * El reparto de macros se calcula sobre las calorías que aportan los TRES
 * macronutrientes con los factores 4/4/9, así que suma 100 por construcción. Esa
 * suma casi nunca coincide exactamente con las kcal que declara la ficha, y la
 * diferencia es real: hay fuentes —USDA con la fruta y las legumbres— que
 * calculan las calorías con factores propios más bajos, la fibra se cuenta
 * distinto según el país, el alcohol aporta calorías que no son ningún macro, y
 * todo redondeo de la ficha deja su resto.
 *
 * DE DÓNDE SALE EL 5 %, medido en producción el 02/09/2026: la banana
 * (`fdc-173944`) declara 89 kcal/100 g y sus macros suman 98,7 con 4/4/9 —un
 * −10,9 %—, y las cerezas (`fdc-171719`) un −11,3 %. Los platos cocinados y las
 * fichas de carne, en cambio, cierran por debajo del 2 %. El corte se pone en 5
 * porque separa esos dos mundos con margen: por debajo la diferencia es ruido de
 * redondeo y contarla sería asustar con nada; por encima hay una decisión de la
 * fuente que el usuario tiene derecho a leer.
 *
 * DÓNDE VIVE LA DECISIÓN: acá, y solo acá. El motor decide si la diferencia
 * merece explicación y manda `motivo_de_la_diferencia` escrito o en `null`; la
 * pantalla no compara contra ningún número — dibuja lo que le llega o no dibuja
 * nada. Un umbral repetido en el front sería un segundo lugar donde cambiarlo.
 */
export const DIFERENCIA_RELEVANTE_PCT = 5;

/** Decimales con los que se redondea todo lo que sale del motor. */
export const DECIMALES = 3;

/** El método de composición por defecto cuando la visión no declara ninguno. */
export const PREPARACION_POR_DEFECTO = "mezclado";
