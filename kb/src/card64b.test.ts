/**
 * Los dos platos que la card 6.4 dejó bloqueados por RENDIMIENTO (DT-35 a),
 * contra el catálogo PUBLICADO.
 *
 * Mismo contrato que `dt27.test.ts` y `dt33.test.ts`, y por los mismos dos
 * motivos: lee `build/foods.canonical.json` DE DISCO y no corre el pipeline,
 * porque el CI no tiene los datasets de USDA (1,1 GB, fuera de git) y porque lo
 * que se seedea a Firestore es ese archivo.
 *
 * QUÉ FIJA, que es lo que ningún candado del build puede ver:
 *
 *   1. Que los CALÇOTS entraron, y que NO son la cebolleta cruda con otro
 *      nombre — que era el motivo escrito de su bloqueo en el censo de la 6.3.
 *      El factor tiene que ser 0,850 y venir de la tabla, no de la receta.
 *   2. Que la SALSA entró desde UNA etiqueta comercial, con su provenance y con
 *      Atwater cerrado. Fue el criterio de aceptación de la etiqueta.
 *   3. Que el TORREZNO DE SORIA sigue sin DERIVARSE, y que el rendimiento de
 *      fritura de panceta que se midió (0,403) NO está en la tabla de
 *      transformaciones. Está medido y publicado en
 *      `$transformaciones_que_NO_estan_y_por_que` justamente para que nadie lo
 *      vuelva a buscar y para que nadie lo use: el modelo de `transforms.ts` no
 *      sabe restar la grasa que sale de la pieza, y un factor suelto en la tabla
 *      es una invitación a derivar 1.285 kcal/100 g. La card 6.4c publicó el
 *      torrezno desde una ETIQUETA, que es otra puerta y no toca este candado —
 *      ver `card64c.test.ts`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CATALOG_FILE } from "./build";
import { CURATION_DIR } from "./sources";
import { type CanonicalFood, type Catalog } from "./types";

const catalog = JSON.parse(readFileSync(CATALOG_FILE, "utf8")) as Catalog;
const byId = new Map(catalog.foods.map((food) => [food.id, food]));

const transformsFile = JSON.parse(
  readFileSync(join(CURATION_DIR, "cooking.transforms.json"), "utf8"),
) as {
  transforms: Record<string, { factor_peso: number; aceite_absorbido_pct: number; fuente: string; ambito: string }>;
  $transformaciones_que_NO_estan_y_por_que: Record<string, string>;
};

function ficha(id: string): CanonicalFood {
  const food = byId.get(id);
  assert.ok(food, `${id} no está en el catálogo publicado`);
  return food;
}

test("el rendimiento de cocción de la cebolla está declarado, con su fuente y su ámbito", () => {
  const t = transformsFile.transforms["cocido_cebolla"];
  assert.ok(t, "`cocido_cebolla` desapareció de la tabla y con él el rendimiento de los calçots");
  assert.equal(t.factor_peso, 0.85);
  // No absorbe: el calçot se asa desnudo. Si alguien le pone absorción, la ficha
  // se llena de un aceite que el plato no tiene.
  assert.equal(t.aceite_absorbido_pct, 0);
  // La fuente no es decoración: es lo que permite que un tercero rehaga el 0,850.
  assert.match(t.fuente, /fdc-2709950/);
  assert.match(t.fuente, /fdc-2710796/);
  // El ámbito es la mitad del valor del número: 0,850 es de la CEBOLLA.
  assert.match(t.ambito, /CEBOLLA Y CEBOLLETA/);
});

test("los Calçots entraron y NO son la cebolleta cruda con otro nombre", () => {
  const calcots = ficha("receta-calcots");
  const cruda = ficha("fdc-170005");

  assert.equal(calcots.source, "receta");
  assert.equal(calcots.names.es, "Calçots");
  assert.equal(calcots.receta?.metodo, "cocido_cebolla");

  // Un solo ingrediente, y es la cebolleta: el aceite y la almendra están en la
  // salsa, que es otra ficha.
  assert.deepEqual(calcots.receta?.ingredientes, [{ ref: "fdc-170005", grams: 200 }]);
  assert.equal(calcots.receta?.aceite_absorbido_g, 0);

  // El rendimiento sale de la TABLA, no de un número escrito en la receta. Es la
  // diferencia entre derivar y elegir la respuesta.
  assert.equal(calcots.receta?.rendimiento_de, "transformacion");
  assert.equal(calcots.receta?.peso_final_g, 170);
  assert.equal((calcots.receta as { peso_final_g: number }).peso_final_g / 200, 0.85);

  // EL PUNTO DEL TEST: el censo de la 6.3 bloqueó el plato porque una receta de
  // un ingrediente con factor 1,000 «devolvería la cebolleta cruda con otro
  // nombre». Con 0,850 la ficha dice algo distinto, y esto lo vigila.
  assert.ok(
    calcots.per_100g.kcal > cruda.per_100g.kcal,
    `los calçots asados (${calcots.per_100g.kcal}) tienen que ser más densos que la cebolleta cruda (${cruda.per_100g.kcal})`,
  );
  assert.equal(calcots.per_100g.kcal, 37.647);
});

test("la salsa de calçots entró desde UNA etiqueta, con provenance y con Atwater cerrado", () => {
  const salsa = ficha("manual-salsa-de-calcots");
  assert.equal(salsa.source, "manual");
  assert.equal(salsa.names.es, "Salsa de calçots");
  // Los ocho campos son de la MISMA etiqueta: mezclar marcas campo a campo
  // produce un alimento que no existe.
  for (const [campo, origen] of Object.entries(salsa.provenance)) {
    if (campo.startsWith("per_100g.")) assert.equal(origen, "manual/etiqueta-comercial", campo);
  }
  assert.match(salsa.source_ref ?? "", /8480000173515/);

  // El criterio de aceptación de la etiqueta: si Atwater no cierra, no entra.
  const predicho = 4 * salsa.per_100g.protein_g + 4 * salsa.per_100g.carbs_g + 9 * salsa.per_100g.fat_g;
  const desvio = Math.abs(salsa.per_100g.kcal - predicho) / salsa.per_100g.kcal;
  assert.ok(desvio < 0.01, `Atwater de la salsa: ${(desvio * 100).toFixed(2)} %`);

  // `Romesco` es una salsa emparentada, no la misma: entra a 0,6, nunca a 1,0.
  const romesco = (salsa.aliases?.es ?? []).find(
    (a) => typeof a !== "string" && a.alias === "Romesco",
  );
  assert.ok(romesco && typeof romesco !== "string" && romesco.confidence === 0.6);
});

test("el Torrezno de Soria sigue sin DERIVARSE, y su rendimiento medido no está en la tabla", () => {
  // ACTUALIZADO POR LA CARD 6.4c, y el invariante que este test protegía NO
  // cambió. La 6.4b escribía «ninguna ficha se llama torrezno» porque en aquel
  // momento la única vía posible era la derivación, y derivarlo estaba mal. La
  // 6.4c publicó el torrezno por OTRA PUERTA —una etiqueta comercial, igual que
  // la salsa de acá arriba— y eso no destraba la DT-36: el modelo sigue sin
  // saber restar la grasa que sale de la pieza. Lo que el test fija ahora es
  // exactamente eso: si hay un torrezno en el catálogo, tiene que ser `manual`.
  // Un torrezno de `source: "receta"` sería el modelo roto entrando por la
  // ventana, y es lo único que este test nunca puede dejar pasar.
  for (const food of catalog.foods) {
    const es = (food.names.es ?? "").toLowerCase();
    if (!es.includes("torrezno")) continue;
    assert.equal(
      food.source,
      "manual",
      `${food.id} publica un torrezno DERIVADO: el modelo de la DT-36 sigue roto`,
    );
    assert.equal(food.receta, undefined, `${food.id} trae un bloque receta y es un torrezno`);
  }
  // Y el factor 0,403 NO puede estar en la tabla: usarlo daría 1.285 kcal/100 g.
  assert.equal(transformsFile.transforms["fritura_de_panceta"], undefined);
  assert.equal(transformsFile.transforms["frito_panceta"], undefined);
  // Pero SÍ tiene que estar publicado con su medición, para que la próxima ronda
  // no vuelva a afirmar —como afirmaron la 6.4 y el censo— que el par no existe.
  const motivo = transformsFile.$transformaciones_que_NO_estan_y_por_que["fritura_de_panceta"];
  assert.ok(motivo, "el rendimiento medido de la fritura de panceta se perdió del archivo");
  assert.match(motivo, /fdc-168277/);
  assert.match(motivo, /fdc-168322/);
  assert.match(motivo, /0,403/);
});
