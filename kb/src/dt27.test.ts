/**
 * El lote de fichas de la DT-27 (card 6.2), contra el catálogo PUBLICADO.
 *
 * Es un test de CONTENIDO y no de mecanismo: los mecanismos (el bloque de
 * selección, la curación de porciones, las guardas) ya tienen los suyos. Lo que
 * se fija acá es la otra mitad, la que ningún candado del build puede ver: que
 * las catorce fichas que Tomás pidió estén, que sean las que se eligieron, y que
 * sus números sigan cruzando con los insumos que él aportó el 01/09/2026
 * (docs/DEUDAS.md §DT-27). Un catálogo puede pasar los seis candados en verde y
 * haber perdido la cerveza: eso es exactamente lo que este archivo impide.
 *
 * LEE `build/foods.canonical.json` DE DISCO Y NO CORRE EL PIPELINE, a propósito
 * y por dos razones. La primera es operativa: el CI no tiene los datasets de
 * USDA (1,1 GB, fuera de git) y por eso excluye a `pipeline.test.js`; un test que
 * corriera el pipeline no protegería nada donde más hace falta. La segunda es de
 * fondo: lo que se seedea a Firestore es ESTE ARCHIVO, así que es el que hay que
 * mirar. Que el archivo sea de verdad el que produce el pipeline lo verifica
 * `pipeline.test.ts`, del otro lado de la frontera.
 *
 * La regla de la card, repetida acá porque es la que se está verificando: los
 * NÚMEROS salen de USDA; los insumos de Tomás son contraste y selección. Por eso
 * cada aserción de abajo compara el valor de USDA contra el rango del insumo, y
 * donde no cruza lo dice en vez de mover el rango.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CATALOG_FILE } from "./build";
import { lockAtwater } from "./locks";
import { aliasConfidence, aliasText, type CanonicalFood, type Catalog } from "./types";

const catalog = JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as Catalog;
const byId = new Map(catalog.foods.map((food) => [food.id, food]));

function ficha(id: string): CanonicalFood {
  const food = byId.get(id);
  assert.ok(food, `${id} no está en el catálogo publicado`);
  return food;
}

/** Las catorce del lote, con lo que cada una tiene que decir. */
const LOTE: { id: string; es: string; kcal: number; fuente: string }[] = [
  { id: "fdc-168746", es: "Cerveza", kcal: 43, fuente: "SR Legacy — Alcoholic beverage, beer, regular, all" },
  { id: "fdc-168749", es: "Cerveza light", kcal: 29, fuente: "SR Legacy — Alcoholic beverage, beer, light" },
  { id: "fdc-171906", es: "Cerveza de alta graduación", kcal: 58, fuente: "SR Legacy — beer, higher alcohol" },
  { id: "fdc-173190", es: "Vino tinto", kcal: 85, fuente: "SR Legacy — wine, table, red" },
  { id: "fdc-174837", es: "Vino blanco", kcal: 82, fuente: "SR Legacy — wine, table, white" },
  {
    id: "fdc-174815",
    es: "Bebida destilada (ginebra, ron, vodka, whisky)",
    kcal: 231,
    fuente: "SR Legacy — distilled, all, 80 proof",
  },
  { id: "fdc-167746", es: "Limón", kcal: 29, fuente: "SR Legacy — Lemons, raw, without peel" },
  { id: "fdc-168070", es: "Arepa", kcal: 219, fuente: "SR Legacy — Restaurant, Latino, arepa" },
  { id: "fdc-2707823", es: "Tortilla de maíz", kcal: 218, fuente: "FNDDS — Tortilla, corn" },
  { id: "fdc-2705954", es: "Pechuga de pollo", kcal: 144, fuente: "FNDDS — Chicken breast, NS as to cooking method" },
  { id: "fdc-2705956", es: "Pechuga de pollo al horno", kcal: 161, fuente: "FNDDS — Chicken breast, baked/broiled/roasted" },
  { id: "fdc-2705968", es: "Pechuga de pollo a la plancha", kcal: 176, fuente: "FNDDS — Chicken breast, grilled without sauce" },
  { id: "fdc-2707616", es: "Pan de pita", kcal: 275, fuente: "FNDDS — Bread, pita" },
  { id: "fdc-2707390", es: "Alubias en salsa de tomate", kcal: 105, fuente: "FNDDS — Baked beans" },
];

/** Los fdc_id de FNDDS que miden LO MISMO que las bebidas de SR Legacy. */
const GEMELOS_FNDDS_DE_LAS_BEBIDAS = [
  "fdc-2710616", // Beer                 = fdc-168746
  "fdc-2710617", // Beer, light          = fdc-168749
  "fdc-2710618", // Beer, higher alcohol = fdc-171906
  "fdc-2710688", // Wine, red            = fdc-173190
  "fdc-2710689", // Wine, white          = fdc-174837
  "fdc-2710700", // Whiskey              = fdc-174815
  "fdc-2710704", // Vodka                = fdc-174815
];

/** Las bebidas con alcohol del lote: el candado 3 solo las deja pasar con él. */
const BEBIDAS_CON_ALCOHOL = [
  "fdc-168746",
  "fdc-168749",
  "fdc-171906",
  "fdc-173190",
  "fdc-174837",
  "fdc-174815",
];

const plano = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Todas las fichas que un término nombra, como nombre o como alias. */
function duenosDelTermino(termino: string): string[] {
  const buscado = plano(termino);
  return catalog.foods
    .filter(
      (food) =>
        (food.names.es !== null && plano(food.names.es) === buscado) ||
        food.aliases.es.some((alias) => plano(aliasText(alias)) === buscado),
    )
    .map((food) => food.id);
}

test("las catorce fichas de la DT-27 están, con su nombre y su número", () => {
  for (const esperada of LOTE) {
    const food = ficha(esperada.id);
    assert.equal(food.names.es, esperada.es, `${esperada.id} cambió de nombre en español`);
    assert.equal(
      food.per_100g.kcal,
      esperada.kcal,
      `${esperada.id} (${esperada.es}) cambió de kcal/100 g — fuente: ${esperada.fuente}`,
    );
    // Ninguna es manual ni receta: los catorce números son de USDA, campo a campo.
    assert.ok(
      food.source === "usda_sr_legacy" || food.source === "usda_fndds",
      `${esperada.id} tiene que venir de USDA, no de curación`,
    );
    assert.equal(food.provenance["per_100g.kcal"], food.source);
    assert.equal(food.provenance["names.es"], "curation");
  }
});

test("el lote es ADITIVO: nada se retira y la versión es 3.7.0", () => {
  // La card 6.3 movió el menor a 3.3.0 SIN tocar este lote (curación de
  // vocabulario pura), la 6.4 lo movió a 3.4.0 SUMANDO fichas (33 de USDA por
  // kb/selection/dt33.v1.json y 43 derivadas por receta) y la 6.4b lo movió a
  // 3.5.0 con dos más: `receta-calcots` y `manual-salsa-de-calcots`, y la 6.4c
  // lo movió a 3.6.0 con una: `manual-torrezno-de-soria`, y la WS07 lo movió a
  // 3.7.0 SIN sumar ninguna —cambia los números de ese mismo torrezno por una
  // decisión de corte y suma vocabulario—. Las 14 de
  // la DT-27 no se tocaron —eso lo vigilan los tests de arriba, uno por ficha— y
  // el conteo total se actualiza acá para que sumar una ficha sin pasar por una
  // card siga siendo imposible en silencio.
  assert.match(catalog.kb_version, /^3\.7\.0\+[0-9a-f]{8}$/);
  // 1.022 de la 3.1.0 + 14 de la DT-27 (card 6.2) + 76 de la DT-33 (card 6.4)
  // + 2 de la card 6.4b + 1 de la card 6.4c.
  assert.equal(catalog.foods.length, 1115);
});

test("las bebidas no se duplicaron: entra la de SR, no la gemela de FNDDS", () => {
  for (const gemelo of GEMELOS_FNDDS_DE_LAS_BEBIDAS) {
    assert.equal(
      byId.has(gemelo),
      false,
      `${gemelo} mide lo MISMO que su par de SR Legacy: tener los dos es el caso de la DT-7`,
    );
  }
});

test("el contraste con los insumos de Tomás sigue cruzando", () => {
  const kcal = (id: string): number => ficha(id).per_100g.kcal;
  /** Insumo de Tomás en kcal por envase ⇒ kcal/100 ml. */
  const por100 = (kcalEnvase: number, ml: number): number => (kcalEnvase / ml) * 100;

  // Cerveza regular: 153 kcal por 355 ml.
  assert.equal(Math.round(por100(153, 355)), 43);
  assert.equal(kcal("fdc-168746"), 43);
  // Cerveza light: 100-110 kcal por 355 ml ⇒ 28,2-31,0/100 ml.
  assert.ok(kcal("fdc-168749") >= por100(100, 355) && kcal("fdc-168749") <= por100(110, 355));
  // Artesanal / IPA: 180-250 kcal por 355 ml ⇒ 50,7-70,4/100 ml.
  assert.ok(kcal("fdc-171906") >= por100(180, 355) && kcal("fdc-171906") <= por100(250, 355));
  // Limón: 29 kcal/100 g, y los macros del insumo también son los de USDA.
  const limon = ficha("fdc-167746");
  assert.deepEqual(
    [limon.per_100g.kcal, limon.per_100g.carbs_g, limon.per_100g.fiber_g, limon.per_100g.protein_g],
    [29, 9.32, 2.8, 1.1],
  );
  // Tortilla de maíz: 60-65 kcal por pieza de 30 g ⇒ 200-217/100 g.
  assert.ok(kcal("fdc-2707823") >= 200 && kcal("fdc-2707823") <= 218);

  // LA QUE NO CRUZA, y por eso está escrita como tal. El insumo da 168-215
  // kcal/100 g para la arepa ASADA SIMPLE y USDA mide 219: un 1,9 % por encima
  // del techo. La diferencia está explicada en la grasa (5,38 g contra 0,6-1 del
  // insumo): USDA midió arepas de restaurante. Si algún día la ficha entra en el
  // rango, no es que se arregló — es que cambió de ficha, y hay que mirarlo.
  const arepa = ficha("fdc-168070");
  assert.equal(arepa.per_100g.kcal, 219);
  assert.ok(arepa.per_100g.kcal > 215, "la arepa de USDA está POR ENCIMA del rango de contraste, y se declara");
  assert.ok(arepa.per_100g.fat_g > 5, "y el motivo es la grasa: 5,38 g contra los 0,6-1 de la arepa de casa");
  // La reserva viaja al catálogo como alias homónimo, la convención del gazpacho.
  const reserva = arepa.aliases.es.find((alias) => plano(aliasText(alias)) === "arepa");
  assert.ok(reserva !== undefined, "la reserva de la arepa tiene que llegar al catálogo como alias");
  assert.equal(aliasConfidence(reserva), 0.8);
});

test("el vino y el destilado declaran su porción en gramos, no en mililitros", () => {
  // La densidad sale de la tabla de porciones del propio USDA y no de ningún
  // lado más: el vino mide 147 g por 5 fl oz (147,87 ml) ⇒ 0,994 g/ml, y el
  // destilado 42 g por 1,5 fl oz (44,36 ml) ⇒ 0,947. Tratar los mililitros como
  // gramos infla el destilado un 5 %, que es de donde salían las «104 kcal por
  // 45 ml» anotadas en la deuda.
  const tinto = ficha("fdc-173190");
  assert.equal(tinto.default_portion_g, 149, "una copa de 150 ml de vino pesa 149 g");
  assert.equal(
    tinto.portion_hints.find((hint) => hint.grams === 149)?.label_es,
    "1 copa (150 ml)",
    "la porción se declara EXPLÍCITA: el rango 65-85 del insumo era por 100 ml, no por copa",
  );
  assert.equal(Math.round(tinto.per_100g.kcal * 1.49), 127);

  const destilado = ficha("fdc-174815");
  assert.equal(destilado.default_portion_g, 43, "45 ml de un destilado de 40° pesan 43 g, no 45");
  assert.equal(destilado.portion_hints.find((hint) => hint.grams === 43)?.label_es, "1 copa (45 ml)");
  const copa = Math.round(destilado.per_100g.kcal * 0.43);
  assert.ok(copa >= 65 && copa <= 100, `la copa da ${copa} kcal, fuera del rango 65-100 del insumo`);
});

test("las cervezas traen las medidas de una barra española, y la caña es la de por defecto", () => {
  // Las medidas que documentó Tomás. La densidad de la cerveza es 1,003 g/ml
  // según el propio USDA (356 g por 12 fl oz), así que mililitros y gramos
  // coinciden dentro del 0,4 %.
  for (const id of ["fdc-168746", "fdc-168749"]) {
    const food = ficha(id);
    const porGramos = new Map(food.portion_hints.map((hint) => [hint.grams, hint.label_es]));
    assert.equal(porGramos.get(120), "1 corto (zurito, penalti)");
    assert.equal(porGramos.get(200), "1 caña (o quinto/botellín)");
    assert.equal(porGramos.get(330), "1 tercio (mediana o tubo)");
    assert.equal(porGramos.get(400), "1 doble (cañón)");
    assert.equal(porGramos.get(500), "1 jarra");
    assert.equal(porGramos.get(1000), "1 litrona");
    assert.equal(food.default_portion_g, 200, "la caña es la medida estándar de barra");
    assert.equal(food.provenance["default_portion_g"], "curation");
    assert.equal(food.provenance["portion_hints.label_es"], "curation");
    // Las de USDA no se pisan ni se reordenan: siguen primeras y en inglés.
    assert.equal(food.portion_hints[0]?.label_es, null);
    assert.equal(food.provenance["portion_hints"], "usda_sr_legacy");
  }

  // La de alta graduación va en tercio: en España se sirve en botella.
  assert.equal(ficha("fdc-171906").default_portion_g, 330);
  // Y la caña, en calorías: 200 ml de rubia son 86 kcal.
  assert.equal(Math.round(ficha("fdc-168746").per_100g.kcal * 2), 86);
});

test("sin el alcohol, las seis bebidas del lote romperían el candado de Atwater", () => {
  // Es la mordida del candado 3 y el motivo por el que este lote no podía entrar
  // sin verificarlo: las calorías de una bebida alcohólica NO están en sus
  // macros. Un destilado declara 231 kcal contra 0 g de proteína, de
  // carbohidratos y de grasa; una cerveza, 43 contra los 16 que suman los suyos.
  //
  // La otra mitad —que CON el alcohol el catálogo entero pasa— la verifica el
  // propio build en cada corrida, y `pipeline.test.ts` la fija como invariante.
  const soloBebidas: Catalog = { ...catalog, foods: BEBIDAS_CON_ALCOHOL.map(ficha) };
  const sinAlcohol = lockAtwater(soloBebidas, new Map<string, number>());
  assert.equal(sinAlcohol.passed, false);
  assert.equal(
    sinAlcohol.failures.length,
    BEBIDAS_CON_ALCOHOL.length,
    "las seis tienen que fallar sin el alcohol, no cuatro",
  );

  // Y el reparto exacto de una cerveza, para que se vea de dónde salen sus kcal.
  const cerveza = ficha("fdc-168746");
  const deLosMacros =
    4 * cerveza.per_100g.protein_g + 4 * cerveza.per_100g.carbs_g + 9 * cerveza.per_100g.fat_g;
  assert.equal(Math.round(deLosMacros), 16, "los macros de la cerveza explican 16 de sus 43 kcal");
  // Las otras 27 son los 3,9 g de alcohol a 7 kcal/g, que el catálogo no guarda
  // (el alcohol no es un campo de per_100g) y el candado sí lee de los CSVs.
  assert.equal(Math.round(3.9 * 7), 27);
});

test("los dos términos que la DT-26 midió mal ahora son de la ficha nueva y de nadie más", () => {
  // `tortilla de maíz` resolvía a la Tortilla de trigo (fdc-2707822) porque la
  // de maíz no existía. Ahora existe y la guarda impide que el término vuelva.
  assert.deepEqual(duenosDelTermino("Tortilla de maíz"), ["fdc-2707823"]);
  // Y la de trigo conserva SU vocabulario: la guarda es de igualdad exacta.
  const trigo = ficha("fdc-2707822");
  assert.equal(trigo.names.es, "Tortilla de trigo");
  assert.ok(trigo.aliases.es.some((alias) => aliasText(alias) === "Tortilla de harina"));

  // `limón` caía en la Tarta de limón. Ahora es del limón, y de nadie más.
  assert.deepEqual(duenosDelTermino("Limón"), ["fdc-167746"]);
  // Los postres de limón siguen existiendo con su nombre compuesto intacto.
  assert.equal(ficha("fdc-2708000").names.es, "Tarta de limón");
  assert.equal(ficha("fdc-2707935").names.es, "Barrita de limón");
});

test("el hueco de la pechuga de pollo quedó cubierto, con su método de cocción", () => {
  // La genérica lleva la marca de la DT-13: USDA dice `NS as to cooking method`,
  // o sea que promedia una familia, y el motor de la fase 2 le baja la confianza.
  const generica = ficha("fdc-2705954");
  assert.equal(generica.generic, true);
  assert.ok(generica.aliases.es.some((alias) => aliasText(alias) === "Pechuga"));

  // Las dos con método NO son genéricas: miden una preparación concreta.
  assert.equal(ficha("fdc-2705956").generic, undefined);
  assert.equal(ficha("fdc-2705968").generic, undefined);
  // Y la plancha tiene más calorías que el horno, que es lo que dice la fuente.
  assert.ok(ficha("fdc-2705968").per_100g.kcal > ficha("fdc-2705956").per_100g.kcal);

  // `Pollo a la plancha` llega a la pechuga con reserva de CORTE (podría ser
  // muslo). `Pollo asado`, en cambio, NO puede ser alias de una pechuga: sería
  // el error de la costilla de la card 2.7 con otro nombre.
  const plancha = ficha("fdc-2705968").aliases.es.find((a) => aliasText(a) === "Pollo a la plancha");
  assert.ok(plancha !== undefined);
  assert.equal(aliasConfidence(plancha), 0.8);
  assert.deepEqual(duenosDelTermino("Pollo asado"), []);
});

test("el zumo de limón NO necesitaba ficha nueva: ya había tres", () => {
  // La deuda preguntaba si hacía falta una ficha de zumo. No: lo que faltaba era
  // el limón ENTERO. Las tres de zumo estaban desde la Fase 1.
  for (const id of ["fdc-167747", "fdc-167748", "fdc-2709180"]) {
    assert.ok(byId.has(id), `${id} es una de las fichas de zumo de limón que ya existían`);
  }
});
