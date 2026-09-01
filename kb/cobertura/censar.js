/**
 * EL CENSO DE COBERTURA MEDITERRÁNEA — card 6.3.
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
const { construirIndice } = require(path.join(RAIZ, "functions/lib/engine/catalog.js"));

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
  "Tortilla de camarones": "ficha_equivocada",
  "Cocochas en salsa": "ficha_equivocada",
  "Pastel de cabracho": "ficha_equivocada",
  "Gazpachos manchegos o galianos": "ficha_equivocada",
  "Leche frita": "ficha_equivocada",

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
  harina: "ficha_equivocada",
  huevos: "ficha_equivocada",
  patatas: "ficha_equivocada",
  espaguetis: "ficha_equivocada",
  "fideos finos": "ficha_equivocada",
  "salsa marinara": "ficha_equivocada",
  "salsa Worcester": "ficha_equivocada",
  pimentón: "ficha_equivocada",
  "huesos de aceituna": "ficha_equivocada",
  "puré instantáneo": "ausente_ficha",
};

// ---------------------------------------------------------------------------
// LAS NOTAS. La clase resume; la nota dice la verdad. Solo se escribe donde hay
// algo que decir que el número no dice.
// ---------------------------------------------------------------------------
const NOTAS = {
  "Tortilla de camarones":
    "La tortillita de camarones de Cádiz es una fritura de harina de garbanzo con camarones enteros (~350 kcal/100 g). Cae en `Tortilla de trigo` (`Tortilla, NFS`, 262 kcal) por la palabra `tortilla`, que en América nombra el pan plano. Guarda puesta por adelantado; la ficha la tiene que traer la card 6.4.",
  "Cocochas en salsa":
    "Papada de merluza o bacalao en emulsión de aceite y ajo. Cae en `Salsa mexicana` (`Salsa, NFS`, 34 kcal) arrastrada por la palabra `salsa`. Guarda puesta por adelantado sobre `cocochas`.",
  "Pastel de cabracho":
    "Pudín frío de pescado, huevo, nata y tomate (~180 kcal/100 g). Cae en `Tarta` (`Pie, NFS`, 296 kcal): acá `pastel` no quiere decir postre. La guarda es sobre el término completo — `Pastel` a secas sigue siendo alias legítimo de la tarta.",
  "Gazpachos manchegos o galianos":
    "El nombre que más miente del censo: es un GUISO CALIENTE de caza sobre torta de pan ácimo (~200 kcal/100 g) y cae en la sopa fría andaluza de 26 kcal — casi ocho veces menos. El plural manchego y el singular andaluz son dos platos distintos.",
  "Leche frita":
    "Postre de crema cuajada rebozada y frita (~250 kcal/100 g). Cae en `Leche` (52 kcal), que además de equivocarse por cinco es un LÍQUIDO: la porción también saldría mal.",
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
  "Salmón griego": "NO HAY NINGUNA FICHA DE SALMÓN en el catálogo (medido: cero coincidencias en 1.036 fichas). Es el hueco de proteína más caro del censo.",
  "Salmón marinado con cítricos y tomates a la plancha": "Mismo hueco: no hay salmón en el catálogo.",
  "Mejillones con tomate y ajo": "No hay ficha de mejillón en el catálogo (`mejillones` y `mussels` dan silencio). El tomate y el ajo sí están.",
  "Pez espada con tomates rellenos": "No hay ficha de pez espada en el catálogo (`pez espada` y `swordfish` dan silencio).",
  "Paella de marisco con espárragos": "La paella ya llega por el alias nuevo `Paella de marisco` (0,8); lo que baja la confianza es el espárrago del título, que la visión iba a ver aparte de todos modos.",
  "Pa amb tomàquet": "RESCATADO en esta card: estaba en silencio y el catálogo ya tenía el plato bajo `Pan con tomate` (0,8) sobre `Bruschetta`. Es el mismo plato con el nombre en catalán.",
  Filloas: "RESCATADO en esta card: la filloa gallega es un crepe (harina, leche, huevo) y el catálogo tiene `Crepe`. 0,8.",
  "Papas arrugadas con mojo picón":
    "RESCATADO en esta card: son papa hervida con piel en agua muy salada, que es exactamente fdc-2709393. Se emitió a 0,6 con el mojo nombrado y a 0,8 sin él, porque el mojo es aceite y la ficha no lo tiene.",
  Fideuá: "Sin ficha y sin gemelo: el catálogo no tiene ningún fideo corto cocido. Ver el hueco de `espaguetis` en el censo de ingredientes — es el mismo agujero.",
  "Tocinillo de cielo": "Sin ficha. El `Flan` del catálogo (178 kcal) NO sirve de gemelo: el tocinillo es yema y almíbar, ~300 kcal, sin leche.",
  "Quesada pasiega": "Sin ficha. `Tarta de queso` (399 kcal) no es gemelo: la quesada es cuajada y harina, sin base de queso crema.",
  "Calçots": "Sin ficha. El catálogo tiene cebolla de verdeo cruda, que no es un calçot asado a la brasa; el gemelo habría que medirlo, no suponerlo.",
};

const NOTAS_INGREDIENTES = {
  ajo: "CORREGIDO en esta card: caía en `Puerro cocido con sal y grasa` (0,11) porque el puerro lleva de alias `Ajo porro`. Es el ingrediente más frecuente de las dos fuentes.",
  ajos: "CORREGIDO en esta card, con el mismo motivo que el singular.",
  "tomate pera": "CORREGIDO en esta card: caía en `Pera cruda` (57 kcal) — una fruta por una hortaliza, casi el triple de energía.",
  "lechuga romana": "CORREGIDO en esta card: caía en `Lechuga cocida` (49 kcal contra 20). Especie correcta, preparación equivocada.",
  "pechuga de pavo": "CORREGIDO en esta card: caía en `Pechuga de pollo`. Otra especie.",
  harina:
    "El catálogo NO tiene harina de trigo (sí de papa, arroz, soja, garbanzo, mijo, arrurruz, malta y trigo sarraceno). `harina` cae en `Harina de papa`. Hueco real, aunque la harina casi nunca se fotografía suelta.",
  huevos:
    "Cae en `Huevos rotos` (receta-huevos-rotos, 213 kcal), que es un PLATO entero, no el ingrediente. El catálogo tiene `Huevo crudo` y `Huevo cocido`. No se emitió alias porque `huevos` a secas no dice la preparación y elegirla por decreto sería inventar: es el hueco de plurales de la DT-26.",
  patatas:
    "Cae en `Papas fritas` (225 kcal) teniendo `Papas crudas con cáscara` (77) y `Papa hervida con cáscara` (126). No se emitió alias: `patatas` sin preparación es genuinamente ambiguo, y en el pipeline real la visión SIEMPRE escribe la preparación. Es un artefacto de medir una lista de receta.",
  espaguetis:
    "Cae en `Pasta con salsa` por el alias `Espaguetis a la boloñesa`; en inglés `spaghetti` cae en `Spaghetti sauce with meat`, o sea la SALSA. El catálogo no tiene pasta cocida simple: solo `Pasta seca enriquecida` (371 kcal, cruda). El golden set ya lo había medido — `spaghetti, cooked` da silencio. Hueco de la card 6.4.",
  "fideos finos": "Cae en `Fideos finos de soja` (331 kcal) siendo fideo de trigo del cocido. Mismo agujero que `espaguetis`.",
  "salsa marinara": "Cae en `Salsa mexicana` (`Salsa, NFS`). No se emitió alias: la `Salsa de tomate en lata` del catálogo no lleva el aceite ni el ajo de una marinara, y el término no es del mercado español.",
  "salsa Worcester": "Cae en `Salsa mexicana` por la palabra `salsa`. Sin ficha propia.",
  pimentón:
    "Cae en `Pimiento rojo crudo` por el alias `Pimentón rojo crudo`, que es el nombre del morrón en varios países de América. En España `pimentón` es la especia. NO se tocó: desambiguar a favor de España rompería el vocabulario americano, y las especias están diferidas a v2 por la DT-29.",
  "huesos de aceituna": "Cae en `Aceitunas`. No es comida: es un residuo de la receta. Se deja documentado, no se cura.",
  "puré instantáneo": "Silencio, teniendo `Puré de papa instantáneo` (fdc-2709503) en el catálogo. Hueco de vocabulario, no de ficha.",
  "queso halloumi": "Cae en `Queso` genérico (381 kcal contra ~321 del halloumi). Familia correcta, sin ficha propia. Candidato de la card 6.4.",
  "lomos de salmón": "No hay ninguna ficha de salmón en el catálogo.",
  "huevas de salmón": "No hay ninguna ficha de salmón en el catálogo.",
  mejillones: "No hay ficha de mejillón en el catálogo.",
  "pez espada": "No hay ficha de pez espada en el catálogo.",
};

/**
 * PISTAS PARA LA CARD 6.4, sobre los `ausente_ficha`.
 *
 * ALCANCE DECLARADO, porque es fácil leer de más: esto se midió contra el
 * CATÁLOGO —las 1.036 fichas seleccionadas— y NO contra los datasets crudos de
 * USDA, que tienen unos 15.000 alimentos y que esta card no abrió. Por eso las
 * filas dicen "hay base en el catálogo" o "no la hay", y NINGUNA dice "USDA no
 * lo tiene": eso no se buscó y no se puede afirmar. Un plato sin pista acá es un
 * plato que no se probó, no un plato descartado.
 */
const CANDIDATOS = {
  Fideuá: "no hay base: el catálogo no tiene ningún fideo corto cocido (ver el hueco de `espaguetis`)",
  "Tocinillo de cielo": "hay `Flan` (178 kcal) y NO sirve: el tocinillo es yema y almíbar, ~300 kcal, sin leche",
  "Quesada pasiega": "hay `Tarta de queso` (399 kcal) y NO sirve: la quesada es cuajada y harina, sin queso crema",
  Calçots: "hay `Cebolla de verdeo cruda`; el calçot va a la brasa y el gemelo habría que medirlo, no suponerlo",
  Torrezno: "hay `Tocino cocido` (484 kcal); el torrezno es panceta con corteza, candidato a medir",
  "Torrezno de Soria": "hay `Tocino cocido` (484 kcal); el torrezno es panceta con corteza, candidato a medir",
  "Calamares en su tinta": "hay `Arroz con calamares` y `Calamares rebozados`; ninguno es calamar guisado en su tinta",
  "Caldereta de cordero u oveja": "hay `Cordero` genérico (292 kcal) y `Cordero asado` (0,6); la caldereta es guiso con patata",
  "Paletilla de cordero lechal al horno o lechazo": "hay `Cordero` genérico y `Cordero asado` (0,6): candidato razonable a alias, no a ficha",
  "Conejo al ajillo": "NO hay ninguna ficha de conejo en el catálogo",
  "Perdices estofadas": "NO hay ninguna ficha de perdiz ni de codorniz en el catálogo",
  Mollejas: "NO hay ninguna ficha de molleja en el catálogo",
  "Riñones al Jerez": "NO hay ninguna ficha de riñón en el catálogo",
  "Caracoles a la llauna": "NO hay ninguna ficha de caracol en el catálogo",
  "All i pebre de anguila": "hay `Roll de sushi de anguila`, que no sirve; anguila suelta no hay",
  "Caldereta de langosta": "NO hay ninguna ficha de langosta en el catálogo",
  "Besugo a la espalda": "hay `Lubina` (`Fish, bass, NFS`, 161 kcal) como base de pescado blanco al horno",
  "Merluza a la gallega": "hay `receta-merluza-en-salsa-verde` (152 kcal) y `Pescado` genérico; la gallega es con patata y pimentón",
  "Bonito con tomate": "hay `Atún` (85) y `Atún cocido` (176); el guiso con tomate no está",
  Arancini: "hay `Arroz blanco cocido con mantequilla` (`Risotto`, 147) como base; el arancini es rebozado y frito",
  "Pasta Alla Norma": "hay `Pasta con salsa` (125) como base de familia",
  "Ensalada Niçoise": "hay las partes (atún, huevo, judías, patata, aceitunas) pero ninguna ficha de la ensalada",
  "Ensalada griega": "hay `Queso feta` (265) y las hortalizas; la ensalada armada no está",
  "Ensalada Halloumi": "NO hay ficha de halloumi (el `queso halloumi` cae en `Queso` genérico)",
  "Baba Ghanoush": "hay `Berenjena cruda` y no hay tahini: las dos piezas del plato faltan o están crudas",
  Shakshuka: "hay `Huevo cocido` y `Tomate cocido`; el plato armado no está",
  "Ensalada Fattoush": "hay las hortalizas y `Pita` (card 6.2); la ensalada armada no está",
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
  const index = construirIndice(catalogo.foods, catalogo.kb_version);
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
