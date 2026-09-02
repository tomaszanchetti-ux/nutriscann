/**
 * EL CENSO DE COBERTURA MEDITERRÁNEA — card 6.3, actualizado por las cards 6.4,
 * 6.4b y 6.4c.
 *
 *   cd functions && npm run build      # el censo mide con el motor COMPILADO
 *   node kb/cobertura/censar.js        # reescribe censo.json
 *
 * Qué hace: le pregunta al motor real —la misma `buscarAlimento` que corre en
 * producción, con el catálogo real de `kb/build/foods.canonical.json`— por cada
 * uno de los 141 platos de `platos.mediterraneos.json` y por cada uno de sus
 * ingredientes clave, y escribe lo que contestó.
 *
 * QUÉ MIDE Y QUÉ NO. La MEDICIÓN es de la máquina: qué ficha salió, por qué
 * nivel de la cascada y con cuánta confianza. El VEREDICTO de si esa ficha es la
 * correcta NO se automatiza: lo puso una persona mirando la ficha, y vive en las
 * tablas `VEREDICTOS` y `NOTAS` de este archivo. Un censo que dedujera "ficha
 * correcta" de "confianza alta" estaría midiendo la confianza dos veces y no
 * estaría midiendo la corrección ni una.
 *
 * Este script REESCRIBE censo.json. Quien lo corra después de cambiar la
 * curación va a ver el diff, que es justamente el punto. El candado que impide
 * que una cobertura conquistada se pierda en silencio NO está acá: está en
 * `functions/src/engine/cobertura.test.ts`, que corre en cada `npm test`.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const { buscarAlimento } = require(path.join(RAIZ, "functions/lib/engine/match.js"));
const { indiceDelCatalogo } = require(path.join(RAIZ, "functions/lib/engine/catalog.js"));

/** El 15 % que el motor le descuenta a una ficha genérica antes de mostrarla. */
const FACTOR_GENERICO = 0.85;

// ---------------------------------------------------------------------------
// LAS CINCO CLASES. Son cerradas: cualquier otra cosa rompe el candado.
// ---------------------------------------------------------------------------
const CLASES = [
  // El término llega a la ficha correcta por un camino ESCRITO del catálogo
  // (nombre exacto o alias). La confianza es la que la curación declaró, y el
  // piso de la escala cerrada es 0,5 — por eso "nivel exacto o alias" y
  // "confianza ≥ 0,5" dicen lo mismo, salvo por el 15 % de genericidad, que es
  // el motor diciendo la verdad sobre una ficha promedio y no un defecto del
  // vocabulario.
  "ok",
  // La ficha es correcta y el término llegó por el DIFUSO, que nunca pasa de
  // 0,6 y en la práctica publica entre 0,10 y 0,30. El plato está cubierto y el
  // usuario no se entera: es el hueco que la DT-26 llamó "confianza injustamente
  // baja". Candidato a alias.
  "confianza_injusta",
  // La ficha nombra OTRO alimento: otra especie, otra familia, o el ingrediente
  // crudo en lugar del plato. Se arregla con el alias correcto (que saca el
  // término del difuso) más la guarda que impide la vuelta.
  "ficha_equivocada",
  // No hay ficha en el catálogo, o la que hay no sirve ni como gemelo. Es la
  // lista de entrada de la card 6.4.
  "ausente_ficha",
  // El "plato" es una composición ad-hoc que la visión va a desarmar en
  // ingredientes ("pez espada con tomates rellenos"). No se juzga por su nombre
  // —no hay ficha que pueda tenerlo— sino por la cobertura de sus ingredientes.
  "descomponible",
];

// ---------------------------------------------------------------------------
// LOS VEREDICTOS A MANO. Solo lo que la regla automática NO puede decidir.
//
// La regla automática es: sin match -> ausente_ficha · nivel exacto/alias -> ok ·
// nivel difuso -> confianza_injusta. Acá abajo están las excepciones, una por
// una, con el motivo. Todo lo que no está acá lo decidió la regla.
// ---------------------------------------------------------------------------
const VEREDICTOS = {
  // --- La ficha nombra otro alimento ---------------------------------------
  // VACÍO DESDE LA CARD 6.4, y no por relajar el criterio: los CINCO platos que
  // vivían acá —tortilla de camarones, cocochas, pastel de cabracho, gazpachos
  // manchegos y leche frita— tienen ahora su PROPIA ficha, derivada por receta
  // compuesta, y llegan a ella por su nombre con confianza 1,0. La guarda de
  // cada uno sigue puesta: impide que el término vuelva a la ficha equivocada
  // el día que alguien escriba un alias de más.

  // --- Composiciones que la visión desarma ---------------------------------
  // De directoalpaladar: entradas que la fuente escribió como CATEGORÍA y no
  // como plato. No tienen ficha posible porque no nombran un alimento.
  "Fritura andaluza": "descomponible",
  "Menestra de verduras de Tudela": "descomponible",
  Escabechados: "descomponible",
  "Brasas, chuletón...": "descomponible",
  "Potaje de vigilia": "descomponible",
  // De nuevoestilo: el título enumera ingredientes.
  "Ensalada de pollo mediterránea": "descomponible",
  "Alcachofas a la parrilla con mayonesa de ajo": "descomponible",
  "Pepino con helado de mascarpone": "descomponible",
  "Cazuela de gambas con aceitunas": "descomponible",
  "Taramasalata con berros y rabanitos": "descomponible",
  "Ensalada de judías verdes y alubias rojas": "descomponible",
  "Pez espada con tomates rellenos": "descomponible",
  "Pepinos rellenos de langostinos": "descomponible",
  "Pechuga de pavo al cava con uvas y verduras": "descomponible",
  "Canelones de espinacas y aceitunas negras": "descomponible",
  "Salmón marinado con cítricos y tomates a la plancha": "descomponible",
  "Pastel griego de calabaza y berenjena": "descomponible",
  "Chopitos con habitas y ajos tiernos": "descomponible",
  "Sardinas al horno con kale": "descomponible",
  "Paella de marisco con espárragos": "descomponible",
  "Frittata italiana de berenjenas": "descomponible",
  "Pasta de limón con sardinas escabechadas": "descomponible",
  "Pechuga de pavo con naranjas": "descomponible",
  "Sardinas con tomates a la parrilla": "descomponible",
  "Pollo a la Toscana": "descomponible",
  "Pimientos asados con queso feta": "descomponible",
  "Salmón griego": "descomponible",
  "Mejillones con tomate y ajo": "descomponible",
  "Potaje de garbanzos de bacalao": "descomponible",
};

const VEREDICTOS_INGREDIENTES = {
  huevos: "ficha_equivocada",
  patatas: "ficha_equivocada",
  "fideos finos": "ficha_equivocada",
  "salsa marinara": "ficha_equivocada",
  "salsa Worcester": "ficha_equivocada",
  pimentón: "ficha_equivocada",
  "huesos de aceituna": "ficha_equivocada",
  "puré instantáneo": "ausente_ficha",
  // --- Los tres de la card 6.4, CERRADOS por la DT-32 (WS07) ----------------
  // Eran el efecto colateral de las fichas nuevas: tres términos que antes daban
  // silencio y que la 6.4 dejó cayendo en una ficha que no es la suya, con su
  // guarda escrita y sin efecto. Desde que el build emite las guardas y el
  // matcher las lee, los tres VUELVEN AL SILENCIO, que es su destino correcto:
  // el catálogo no tiene concentrado de tomate, ni masa filo, ni huevas, y un
  // hueco declarado vale más que una ficha parecida. El veredicto cambia de
  // `ficha_equivocada` a `ausente_ficha` porque eso es lo que se mide ahora —
  // pasan a estar en la MISMA clase que los otros huecos declarados del censo.
  "pasta de tomate": "ausente_ficha",
  "pasta filo": "ausente_ficha",
  "huevas de salmón": "ausente_ficha",
  // `gallina` NO se movió: sigue cayendo en el PLATO `Gallina en pepitoria` y no
  // tiene guarda (USDA no mide la gallina como especie, DT-35 punto d).
  gallina: "ficha_equivocada",
};

// ---------------------------------------------------------------------------
// LAS NOTAS. La clase resume; la nota dice la verdad. Solo se escribe donde hay
// algo que decir que el número no dice.
// ---------------------------------------------------------------------------
const NOTAS = {
  "Tortilla de camarones":
    "RESUELTO en la card 6.4 con ficha propia (`receta-tortilla-de-camarones`, 278 kcal/100 g, harina de garbanzo + harina de trigo + camarón, método `frito` con el 6,5 % medido). Antes caía en `Tortilla de trigo` (262 kcal) por la palabra `tortilla`, que en América nombra el pan plano. La ficha declara que subestima: la tortillita real ronda las 350 y una fritura de encaje absorbe más aceite que la mediana de FNDDS.",
  "Cocochas en salsa":
    "RESUELTO en la card 6.4 con ficha propia (`receta-cocochas-en-salsa`, 168 kcal/100 g). Antes caía en `Salsa mexicana` (34 kcal) arrastrada por la palabra `salsa`. La receta declara sus 80 g de aceite sobre 500 de pescado, que es exactamente lo que le faltaba a `Bacalao al vapor` para poder representar el plato.",
  "Pastel de cabracho":
    "RESUELTO en la card 6.4 con ficha propia (`receta-pastel-de-cabracho`, 161 kcal/100 g). Antes caía en `Tarta` (`Pie, NFS`, 296 kcal): acá `pastel` no quiere decir postre. La guarda sigue puesta sobre el término completo — `Pastel` a secas es alias legítimo de la tarta.",
  "Gazpachos manchegos o galianos":
    "RESUELTO en la card 6.4 con ficha propia (`receta-gazpachos-manchegos`, 164 kcal/100 g). Era el nombre que más mentía del censo: un GUISO CALIENTE de caza sobre torta de pan ácimo que caía en la sopa fría andaluza de 26 kcal, casi ocho veces menos. El plural manchego y el singular andaluz siguen siendo dos platos distintos y la guarda lo sostiene.",
  "Leche frita":
    "RESUELTO en la card 6.4 con ficha propia (`receta-leche-frita`, 202 kcal/100 g). Antes caía en `Leche` (52 kcal), que además de equivocarse por cinco es un LÍQUIDO. La ficha declara que subestima —la crema pierde agua al espesar y el método `frito` no lo modela—, así que el postre real ronda las 250.",
  "Sopa de ajo":
    "La ficha `Sopa` (`Soup, NFS`, 49 kcal) es de la familia correcta y subestima ~2× (la sopa castellana lleva pan, aceite y huevo). No se emite alias: colgar un plato concreto de la sopa genérica congelaría el error. Candidato de la card 6.4.",
  "Bacalao al pilpil":
    "Cae en `Bacalao al vapor` (87 kcal) por el alias `Bacalao` (0,8), que es correcto para el pescado. NO se emite alias del plato: el pilpil es una emulsión de aceite (~200 kcal/100 g) y heredar el 0,8 diría que el aceite no está. Candidato de la card 6.4.",
  "Bacalao a la vizcaína": "Mismo caso que el pilpil: la ficha es el pescado al vapor y el plato lleva una salsa de pimiento choricero y aceite que la ficha no tiene. Sin alias, a propósito.",
  "Bacalao ajoarriero": "Mismo caso que el pilpil. Sin alias, a propósito.",
  "Patatas a la riojana": "La ficha es la papa hervida sola; el plato lleva chorizo, que mueve la grasa. Sin alias: el nombre `Papa hervida con cáscara` sobre un guiso es defendible en el número y no en la pantalla.",
  "Patatas a la importancia": "Mismo caso: la ficha es la papa hervida y el plato lleva rebozado y salsa.",
  "Patatas revolconas": "Mismo caso: la ficha es la papa hervida y el plato lleva pimentón y torreznos.",
  "Buñuelos de viento":
    "`Buñuelo` (`Fritter, plain`, 378 kcal) es la ficha correcta y la familia exacta. Queda en confianza injusta porque el nombre largo no dispara el alias corto; es candidato limpio a la regla de herencia en una próxima curación.",
  "Soldaditos de Pavía o bacalao rebozado":
    "Llega a `Bacalao rebozado` (fdc-2706240), que es el plato. La confianza es del difuso. No se emitió alias porque esa ficha es `Fish, cod, NFS` renombrada como si fuera rebozada, y apoyar vocabulario nuevo sobre esa decisión de curación sería construir sobre arena. Anotado como pendiente, no como hueco.",
  "Pimientos de piquillo rellenos":
    "CORREGIDO en esta card: caía en `Pimientos crudos` (27 kcal, 6,6 veces menos que el plato) y ahora resuelve a `Pimiento relleno de arroz y carne` a 0,6. La reserva es el arroz del relleno de USDA.",
  "Pechuga de pavo al cava con uvas y verduras":
    "CORREGIDO en parte: el pavo dejó de ser pollo (alias `Pechuga de pavo` 0,8 sobre `Pavo`). Sigue siendo una composición: la visión va a ver pavo, uvas y verduras por separado.",
  "Pechuga de pavo con naranjas": "Mismo caso: el pavo ya no es pollo, y el plato lo desarma la visión.",
  "Salmón griego": "CERRADO EN PARTE por la card 6.4: el catálogo ya tiene cuatro fichas de salmón (fdc-2706285 `Salmón` 274 · a la plancha 259 · ahumado 117 · crudo 188), así que el hueco de proteína más caro del censo dejó de existir. El plato sigue siendo una composición y por eso llega por el difuso: la visión va a ver salmón, feta y hortalizas por separado.",
  "Salmón marinado con cítricos y tomates a la plancha": "Mismo caso: ya hay salmón. Llega a `Salmón ahumado`, que es la ficha más cercana a un marinado (el alias `Salmón marinado` está emitido a 0,6 sobre ella: cambia la técnica de curado, no la especie ni el corte).",
  "Mejillones con tomate y ajo": "CERRADO EN PARTE por la card 6.4: `Mejillones` (fdc-2706350, 109 kcal) ya existe y responde a `mejillones` y a `mussels` con match exacto. El plato sigue siendo una composición.",
  "Pez espada con tomates rellenos": "CERRADO EN PARTE por la card 6.4: `Pez espada a la plancha` (fdc-173704, 172 kcal) ya existe, con `Pez espada` y `Emperador` de alias a 0,8. El plato sigue siendo una composición.",
  "Paella de marisco con espárragos": "La paella ya llega por el alias nuevo `Paella de marisco` (0,8); lo que baja la confianza es el espárrago del título, que la visión iba a ver aparte de todos modos.",
  "Pa amb tomàquet": "RESCATADO en esta card: estaba en silencio y el catálogo ya tenía el plato bajo `Pan con tomate` (0,8) sobre `Bruschetta`. Es el mismo plato con el nombre en catalán.",
  Filloas: "RESCATADO en esta card: la filloa gallega es un crepe (harina, leche, huevo) y el catálogo tiene `Crepe`. 0,8.",
  "Papas arrugadas con mojo picón":
    "RESCATADO en esta card: son papa hervida con piel en agua muy salada, que es exactamente fdc-2709393. Se emitió a 0,6 con el mojo nombrado y a 0,8 sin él, porque el mojo es aceite y la ficha no lo tiene.",
  Fideuá: "RESUELTO en la card 6.4 (`receta-fideua`, 157 kcal/100 g). El agujero era doble y se tapó de una vez: el catálogo no tenía NINGUNA pasta cocida simple, y `Pasta cocida` (fdc-2708357) entró en la misma card.",
  "Tocinillo de cielo": "RESUELTO en la card 6.4 (`receta-tocinillo-de-cielo`, 303 kcal/100 g: partes iguales de yema y azúcar más el agua del almíbar). El `Flan` (178) seguía sin servir de gemelo, y por eso se derivó la receta en vez de emitir un alias.",
  "Quesada pasiega": "RESUELTO en la card 6.4 (`receta-quesada-pasiega`, 277 kcal/100 g). `Tarta de queso` (399) sigue sin ser gemelo: la quesada es cuajada y harina, sin base de queso crema.",
  "Calçots": "RESUELTO en la card 6.4b (`receta-calcots`, 37,6 kcal/100 g). Lo que faltaba era el rendimiento y ahora está medido: `cocido_cebolla` (0,850) es el que la propia FNDDS le asigna a la cebolla, recuperado de su `input_food` —n=2 pares concordantes, dispersión entre trazadores 0,003— y NO es el 1,000 que habría devuelto la cebolleta cruda con otro nombre. La vía de cocción declarada es el HORNO a 200 °C, que es la otra preparación documentada del plato; para la brasa sigue sin haber factor. La ficha es un SUELO y lo dice en sus caveats: la cocción genérica de FNDDS pierde menos agua que un asado.",
  "Torrezno de Soria":
    "RESUELTO en la card 6.4c POR OTRA PUERTA, y con la ETIQUETA CAMBIADA en la WS07: `manual-torrezno-de-soria` (627 kcal/100 g) entra desde UNA etiqueta comercial verificada campo a campo —Carrefour 8431876311617, leída de OpenFoodFacts, Atwater al 0,16 %—, que es la misma vía por la que entró la salsa de calçots en la 6.4b. NO SE DESTRABÓ EL MODELO: la DT-36 sigue abierta tal cual, `transforms.ts` sigue sin saber restar la grasa que sale de la pieza y el rendimiento medido 0,403 sigue FUERA de la tabla de transformaciones, vigilado por `card64b.test.ts`. Lo que la card 6.4c SÍ corrigió es el diagnóstico de la 6.4b: allí se descartó el extremo seco del modelo (542 kcal) por «quedar por encima del bacon frito de USDA (468)», y las 26 etiquetas de mercado que se contrastaron dicen que el torrezno frito real está entre 552 y 665 kcal, con la mediana en 627. 542 era un PISO, no un techo — el modelo no se pasaba de alto, se quedaba corto. La etiqueta de la 6.4c era de CARETA (Hacendado, 580 kcal, el extremo MAGRO de las 26) y Tomás decidió el 01/09/2026 que la ficha tiene que ser el torrezno que más se consume, que es el de PANCETA: la etiqueta nueva cae en la mediana del mercado en cuatro campos exactos (627 kcal · 48 g de grasa · 15 de saturadas · 49 de proteína) y sus ingredientes son «corteza de cerdo con tocino veteado». La careta no estaba mal medida: medía otro corte, y queda nombrada en los caveats de la ficha para que la decisión se pueda revertir.",
  "Perdices estofadas": "SIGUE SIN FICHA. Medido sobre los datasets crudos: `partridge` da CERO coincidencias en los tres. Lo que sí hay —y entró en la card 6.4— es codorniz (fdc-2706149, 226) y faisán (fdc-2706150, 238); colgar `perdiz` de cualquiera de las dos sería cambiar de especie sobre una comparación que nadie hizo.",
  "Besugo a la espalda": "SIGUE SIN FICHA. Medido sobre los datasets crudos: `porgy`, `sea bream` y `bream` dan CERO coincidencias en los tres. USDA no mide ningún espárido. La `Lubina` del catálogo (161 kcal) es otra familia, y emitirle un alias sería vocabulario sobre una ficha preexistente, que esta card no tocó por regla.",
  "Ensalada Halloumi": "SIGUE SIN FICHA. Medido: `halloumi` da CERO coincidencias en los tres datasets. El `Queso feta` (265) no sirve de gemelo —el halloumi ronda las 321 y es de pasta prensada, no de salmuera fresca—, así que la ensalada no se puede derivar sin inventar su ingrediente principal.",
};

const NOTAS_INGREDIENTES = {
  ajo: "CORREGIDO en esta card: caía en `Puerro cocido con sal y grasa` (0,11) porque el puerro lleva de alias `Ajo porro`. Es el ingrediente más frecuente de las dos fuentes.",
  ajos: "CORREGIDO en esta card, con el mismo motivo que el singular.",
  "tomate pera": "CORREGIDO en esta card: caía en `Pera cruda` (57 kcal) — una fruta por una hortaliza, casi el triple de energía.",
  "lechuga romana": "CORREGIDO en esta card: caía en `Lechuga cocida` (49 kcal contra 20). Especie correcta, preparación equivocada.",
  "pechuga de pavo": "CORREGIDO en esta card: caía en `Pechuga de pollo`. Otra especie.",
  harina:
    "CORREGIDO en la card 6.4: hasta hoy el catálogo NO tenía harina de trigo (sí de papa, arroz, soja, garbanzo, mijo, arrurruz, malta y trigo sarraceno) y `harina` caía en `Harina de papa` (357 kcal). Ahora llega a `Harina de trigo` (fdc-168894, 364), que es la ficha correcta. Sigue llegando por el difuso porque la palabra sola no tiene alias propio, y no se le emite: `harina` a secas tampoco dice de qué es.",
  huevos:
    "Cae en `Huevos rotos` (receta-huevos-rotos, 213 kcal), que es un PLATO entero, no el ingrediente. El catálogo tiene `Huevo crudo` y `Huevo cocido`. No se emitió alias porque `huevos` a secas no dice la preparación y elegirla por decreto sería inventar: es el hueco de plurales de la DT-26.",
  patatas:
    "Cae en `Papas fritas` (225 kcal) teniendo `Papas crudas con cáscara` (77) y `Papa hervida con cáscara` (126). No se emitió alias: `patatas` sin preparación es genuinamente ambiguo, y en el pipeline real la visión SIEMPRE escribe la preparación. Es un artefacto de medir una lista de receta.",
  espaguetis:
    "CORREGIDO en la card 6.4: caía en `Pasta con salsa` por el alias `Espaguetis a la boloñesa` y ahora llega a `Pasta cocida` (fdc-2708357, 157 kcal), que es la ficha nueva del lote. El alias `Espaguetis cocidos` está emitido en texto plano sobre ella; el plural pelado sigue llegando por el difuso, que es el hueco de plurales de la DT-26 y no de ficha.",
  "fideos finos": "Cae en `Fideos finos de soja` (331 kcal) siendo fideo de trigo del cocido. El agujero de base se tapó —ya hay `Pasta cocida`—, pero el término sigue ganándolo la soja por la palabra `finos`: es curación, no ficha.",
  "salsa marinara": "Cae en `Salsa mexicana` (`Salsa, NFS`). No se emitió alias: la `Salsa de tomate en lata` del catálogo no lleva el aceite ni el ajo de una marinara, y el término no es del mercado español.",
  "salsa Worcester": "Cae en `Salsa mexicana` por la palabra `salsa`. Sin ficha propia.",
  pimentón:
    "Cae en `Pimiento rojo crudo` por el alias `Pimentón rojo crudo`, que es el nombre del morrón en varios países de América. En España `pimentón` es la especia. NO se tocó: desambiguar a favor de España rompería el vocabulario americano, y las especias están diferidas a v2 por la DT-29.",
  "huesos de aceituna": "Cae en `Aceitunas`. No es comida: es un residuo de la receta. Se deja documentado, no se cura.",
  "puré instantáneo": "Silencio, teniendo `Puré de papa instantáneo` (fdc-2709503) en el catálogo. Hueco de vocabulario, no de ficha.",
  "queso halloumi": "Cae en `Queso` genérico (381 kcal contra ~321 del halloumi). Familia correcta, sin ficha propia. La card 6.4 abrió los datasets y midió que `halloumi` da CERO coincidencias en los tres: no es que no se haya buscado.",
  "lomos de salmón": "CORREGIDO en la card 6.4: ya hay cuatro fichas de salmón y el término llega a `Salmón crudo` (188 kcal), que es lo que es un lomo sin cocinar.",
  "huevas de salmón": "CERRADO por la DT-32 (WS07): vuelve al SILENCIO. Hasta acá llegaba a `Salmón` (274 kcal) a 0,30 por el difuso, que NO es la ficha correcta —las huevas son otro alimento: más grasa, más sodio, otra textura—, y la guarda que lo decía estaba escrita desde la card 6.4 sin poder impedirlo. Ahora el matcher lee las guardas del catálogo y el hueco vuelve a estar a la vista en vez de tapado con la ficha del músculo. USDA sí las mide —`Fish, roe, mixed species` en SR Legacy— y la card 6.4 decidió NO promoverlas: aparecen una sola vez en las dos fuentes y no son un plato del mercado español. Hueco declarado, y ahora también medido como tal.",
  mejillones: "CORREGIDO en la card 6.4: `Mejillones` (fdc-2706350, 109 kcal) entró al catálogo y responde a `mejillones` y a `mussels` con match exacto.",
  "pez espada": "CORREGIDO en la card 6.4: `Pez espada a la plancha` (fdc-173704, 172 kcal) entró al catálogo, con `Pez espada` y `Emperador` de alias a 0,8.",
  alcachofas:
    "CORREGIDO en la card 6.4: daba silencio y ahora llega a `Alcachofa cocida` (fdc-2709766, 53 kcal). Llega por el difuso porque el plural pelado no dispara el alias `Alcachofas cocidas`; es el hueco de plurales de la DT-26.",
  "pasta de tomate":
    "CERRADO por la DT-32 (WS07): vuelve al SILENCIO, que es donde estaba antes de la card 6.4. Aquella card promovió `Pasta cocida` para tapar el hueco de la DT-33 y de paso abrió esta ventana: en español `pasta` nombra el fideo Y cualquier producto triturado, así que el término caía en la pasta a 0,25 (157 kcal contra las 24 de `Salsa de tomate en lata`, seis veces menos energía). La guarda estaba escrita desde entonces y no mordía. Ahora el build la emite dentro del catálogo y `construirIndice` la lee: el silencio es el destino correcto porque el catálogo no tiene ficha de concentrado de tomate.",
  "pasta filo": "CERRADO por la DT-32 (WS07): vuelve al SILENCIO, igual que `pasta de tomate`. Caía en `Pasta cocida` a 0,30 y la pasta filo es una masa de hojaldre finísima (~300 kcal/100 g), no un fideo. El catálogo no tiene ninguna ficha de masa filo —`phyllo` da cero coincidencias útiles—, así que acá el silencio era y sigue siendo lo correcto.",
  gallina:
    "NUEVO EN LA CARD 6.4: antes daba silencio y ahora cae en `Gallina en pepitoria` (161 kcal), que es el PLATO entero y no el ave. El catálogo sigue sin ficha de gallina —USDA no la mide como especie aparte— y la receta usa `Pollo guisado` con esa reserva escrita.",
  "maíz tierno":
    "CORREGIDO en la card 6.4: `Maíz fresco cocido sin grasa` (fdc-2709910, 86 kcal) entró al catálogo y cierra el hueco que la DT-26 había mandado a la DT-33 (`sweet corn, cooked` del golden set).",
};

/**
 * LOS BLOQUEOS QUE QUEDAN, sobre los `ausente_ficha`.
 *
 * La card 6.3 escribió esta tabla como PISTAS para la 6.4, y con un alcance
 * declarado: se había medido contra el CATÁLOGO y no contra los datasets crudos,
 * así que ninguna fila podía decir "USDA no lo tiene".
 *
 * LA CARD 6.4 ABRIÓ LOS DATASETS, y por eso la tabla cambió de naturaleza: ya no
 * son pistas, son BLOQUEOS con el motivo medido. De los 48 platos que la 6.3
 * dejó sin ficha quedan TRES tras la card 6.4c (los calçots se destrabaron en la
 * 6.4b, el torrezno en la 6.4c), y cada uno dice qué se buscó y qué se encontró.
 * "Cero coincidencias en los tres datasets" ahora sí se puede afirmar: se buscó.
 *
 * LOS TRES QUE QUEDAN SON EL MISMO CASO, y eso es lo que cambió con la 6.4c: los
 * tres —besugo, perdiz y halloumi— están bloqueados por ESPECIE o INGREDIENTE, es
 * decir por un alimento que USDA no mide y ninguna otra puerta del proyecto
 * abrió. Los dos que se destrabaron estaban bloqueados por otra cosa (un
 * rendimiento de cocción que faltaba, un modelo que no alcanzaba), y ninguno de
 * los dos se resolvió con el dataset: uno con un rendimiento medido, el otro con
 * una etiqueta comercial. La lista de pendientes dejó de tener dos naturalezas y
 * tiene una sola, y su salida está escrita: la pasada de BEDCA (DT-35 g).
 */
const CANDIDATOS = {
  // `Calçots` salió de esta tabla en la card 6.4b y `Torrezno de Soria` en la
  // 6.4c: dejaron de estar bloqueados. Ver `receta-calcots` con el transform
  // `cocido_cebolla`, y `manual-torrezno-de-soria` con su etiqueta comercial.
  // Ojo con el torrezno: salió del bloqueo SIN que se cerrara la DT-36, porque
  // entró por una puerta que no es el modelo. La deuda del modelo sigue viva.
  "Perdices estofadas":
    "BLOQUEADO POR LA ESPECIE. Medido en los tres datasets: `partridge` da CERO coincidencias. Codorniz y faisán SÍ existen y entraron en la card 6.4 (fdc-2706149, 226 · fdc-2706150, 238), pero nadie midió la perdiz contra ninguna de las dos: un alias a 0,5 diría «se parece» donde lo cierto es «no lo sabemos».",
  "Besugo a la espalda":
    "BLOQUEADO POR LA ESPECIE. Medido en los tres datasets: `porgy`, `sea bream` y `bream` dan CERO coincidencias — USDA no mide ningún espárido. La `Lubina` del catálogo (161 kcal) es otra familia; además, emitirle un alias sería tocar una ficha preexistente, cosa que la card 6.4 no hizo por regla.",
  "Ensalada Halloumi":
    "BLOQUEADO POR EL INGREDIENTE PRINCIPAL. Medido: `halloumi` da CERO coincidencias en los tres datasets, y el `Queso feta` (265 kcal) no sirve de gemelo — el halloumi ronda las 321 y es de pasta prensada, no de salmuera fresca. Derivar la ensalada exigiría inventar el queso que le da nombre.",
};

/** Especias y hierbas: DT-29 las difirió a v2 por decisión de Tomás. */
const DT29_ESPECIAS = new Set([
  "albahaca", "albahaca fresca", "azafrán", "canela", "cayena", "clavo", "comino", "cúrcuma",
  "eneldo", "guindilla verde", "hierbabuena", "laurel", "menta", "orégano", "perejil o cilantro",
  "pimentón dulce", "romero", "semillas de mostaza blanca", "aroma de azahar",
]);

// ---------------------------------------------------------------------------

function medir(termino, index) {
  const r = buscarAlimento(termino, index);
  if (r === null) return null;
  const generic = r.ficha.generic === true;
  return {
    ficha_id: r.ficha.id,
    ficha_es: r.ficha.names.es,
    ficha_en: r.ficha.names.en,
    nivel: r.nivel,
    confianza_match: r.confianza_match,
    confianza_visible: Math.round(r.confianza_match * (generic ? FACTOR_GENERICO : 1) * 100) / 100,
    termino_matcheado: r.termino_matcheado,
    generic,
    kcal_100g: r.ficha.per_100g.kcal,
  };
}

function clasificaSola(match) {
  if (match === null) return "ausente_ficha";
  return match.nivel === "difuso" ? "confianza_injusta" : "ok";
}

function main() {
  const catalogo = JSON.parse(fs.readFileSync(path.join(RAIZ, "kb/build/foods.canonical.json"), "utf8"));
  // CON las guardas del catálogo (DT-32): el censo mide el matcher que corre de
  // verdad, y desde el 3.8.0 ese matcher respeta las guardas que declaró la
  // curación. Un censo armado sin ellas mediría un motor que no existe.
  const index = indiceDelCatalogo(catalogo);
  const fuente = JSON.parse(fs.readFileSync(path.join(__dirname, "platos.mediterraneos.json"), "utf8"));

  const platos = [];
  const usos = new Map();
  for (const lista of fuente.listas) {
    for (const p of lista.platos) {
      const match = medir(p.nombre, index);
      const fila = {
        lista: lista.id,
        plato: p.nombre,
        clasificacion: VEREDICTOS[p.nombre] ?? clasificaSola(match),
        match,
      };
      if (NOTAS[p.nombre] !== undefined) fila.nota = NOTAS[p.nombre];
      if (fila.clasificacion === "ausente_ficha") {
        // La pista para la card 6.4. `null` quiere decir "no se probó", NUNCA
        // "USDA no lo tiene": los datasets crudos no se abrieron en esta card.
        fila.candidato_en_el_catalogo = CANDIDATOS[p.nombre] ?? null;
      }
      platos.push(fila);
      for (const ing of p.ingredientes_clave ?? []) {
        if (!usos.has(ing)) usos.set(ing, []);
        usos.get(ing).push(p.nombre);
      }
    }
  }

  const ingredientes = [...usos.keys()].sort((a, b) => a.localeCompare(b, "es")).map((ing) => {
    const match = medir(ing, index);
    const fila = {
      ingrediente: ing,
      platos_que_lo_usan: usos.get(ing).length,
      clasificacion: VEREDICTOS_INGREDIENTES[ing] ?? clasificaSola(match),
      match,
    };
    if (DT29_ESPECIAS.has(ing)) fila.dt29_especia = true;
    if (NOTAS_INGREDIENTES[ing] !== undefined) fila.nota = NOTAS_INGREDIENTES[ing];
    return fila;
  });

  const cuenta = (filas) => {
    const r = {};
    for (const c of CLASES) r[c] = filas.filter((f) => f.clasificacion === c).length;
    return r;
  };

  const censo = {
    $comment: [
      "GENERADO por kb/cobertura/censar.js. No se edita a mano: se edita el script",
      "—donde viven los veredictos escritos por una persona— y se vuelve a correr.",
      "",
      "La medición sale del motor real. El veredicto de `ficha correcta` contra",
      "`ficha equivocada` NO sale del motor: lo puso alguien mirando la ficha, y el",
      "motivo de cada uno está en la nota de su fila o en la tabla del script.",
      "",
      "El candado que impide perder lo conquistado vive en",
      "functions/src/engine/cobertura.test.ts y corre en cada `npm test`.",
    ],
    medido: new Date().toISOString().slice(0, 10),
    kb_version: catalogo.kb_version,
    fichas_en_el_catalogo: catalogo.foods.length,
    clases: CLASES,
    resumen: {
      platos: { total: platos.length, ...cuenta(platos) },
      ingredientes: { total: ingredientes.length, ...cuenta(ingredientes) },
      por_lista: Object.fromEntries(
        fuente.listas.map((l) => {
          const f = platos.filter((x) => x.lista === l.id);
          return [l.id, { total: f.length, ...cuenta(f) }];
        }),
      ),
    },
    platos,
    ingredientes,
  };

  const salida = path.join(__dirname, "censo.json");
  fs.writeFileSync(salida, `${JSON.stringify(censo, null, 1)}\n`);
  console.log(`kb ${catalogo.kb_version} · ${platos.length} platos · ${ingredientes.length} ingredientes`);
  console.log("platos      ", JSON.stringify(censo.resumen.platos));
  console.log("ingredientes", JSON.stringify(censo.resumen.ingredientes));
  console.log(`-> ${path.relative(RAIZ, salida)}`);
}

main();
