/**
 * La resolución de nutrientes contra CSVs construidos a mano.
 *
 * El escenario se CONSTRUYE: para probar que la energía cae de 1008 a 2047 y de
 * 2047 a 2048 hace falta un alimento al que le falte justo el código de arriba,
 * y salir a buscar ese caso entre los datos reales sería atarse a que USDA lo
 * siga teniendo. Acá el alimento se escribe.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readNutrients, readPortions } from "./usda";

/** Escribe un `food_nutrient.csv` mínimo con las filas que se le pasen. */
function nutrientCsv(rows: [fdcId: number, nutrientId: number, amount: string][]): string {
  const dir = mkdtempSync(join(tmpdir(), "nutriscann-usda-"));
  const header = '"id","fdc_id","nutrient_id","amount"';
  const body = rows.map(([fdc, nutrient, amount], i) => `"${i}","${fdc}","${nutrient}","${amount}"`);
  writeFileSync(join(dir, "food_nutrient.csv"), `${[header, ...body].join("\n")}\n`);
  return dir;
}

test("Foundation: la energía usa 1008 cuando está", async () => {
  const dir = nutrientCsv([
    [1, 1008, "250"],
    [1, 2047, "260"],
    [1, 2048, "270"],
  ]);
  const values = await readNutrients(dir, "usda_foundation", new Set([1]));
  assert.equal(values.get(1)?.kcal, 250);
});

test("Foundation: sin 1008, la energía cae a Atwater General (2047)", async () => {
  const dir = nutrientCsv([
    [1, 2047, "260"],
    [1, 2048, "270"],
  ]);
  const values = await readNutrients(dir, "usda_foundation", new Set([1]));
  assert.equal(values.get(1)?.kcal, 260);
});

test("Foundation: sin 1008 ni 2047, la energía cae a los Específicos (2048)", async () => {
  const dir = nutrientCsv([[1, 2048, "270"]]);
  const values = await readNutrients(dir, "usda_foundation", new Set([1]));
  assert.equal(values.get(1)?.kcal, 270);
});

test("Foundation: el orden de las filas no cambia cuál gana", async () => {
  // El respaldo aparece ANTES que el preferido en el archivo.
  const dir = nutrientCsv([
    [1, 2048, "270"],
    [1, 2047, "260"],
    [1, 1008, "250"],
  ]);
  const values = await readNutrients(dir, "usda_foundation", new Set([1]));
  assert.equal(values.get(1)?.kcal, 250, "gana el código preferido, no el que aparece primero");
});

test("Foundation: los azúcares salen de 1063 y caen a 2000", async () => {
  const conNlea = await readNutrients(
    nutrientCsv([
      [1, 1063, "5.5"],
      [1, 2000, "9.9"],
    ]),
    "usda_foundation",
    new Set([1]),
  );
  assert.equal(conNlea.get(1)?.sugars_g, 5.5);

  const soloRespaldo = await readNutrients(
    nutrientCsv([[1, 2000, "9.9"]]),
    "usda_foundation",
    new Set([1]),
  );
  assert.equal(soloRespaldo.get(1)?.sugars_g, 9.9);
});

test("FNDDS lee su propio vocabulario y no el de SR", async () => {
  const dir = nutrientCsv([
    [1, 208, "89"],
    [1, 203, "1.09"],
    [1, 1008, "999"],
  ]);
  const values = await readNutrients(dir, "usda_fndds", new Set([1]));
  assert.equal(values.get(1)?.kcal, 89, "208 es la energía de FNDDS");
  assert.equal(values.get(1)?.protein_g, 1.09);
});

test("con el mapeo de SR aplicado a FNDDS no se resuelve nada", async () => {
  // El fallo silencioso del Bloque 0, reproducido: el join no lanza, devuelve
  // vacío. Por eso existe el candado de aceptación por fuente.
  const dir = nutrientCsv([
    [1, 208, "89"],
    [1, 203, "1.09"],
  ]);
  const values = await readNutrients(dir, "usda_sr_legacy", new Set([1]));
  assert.equal(values.get(1), undefined);
});

test("una cantidad vacía o no numérica no entra", async () => {
  const dir = nutrientCsv([
    [1, 1008, ""],
    [1, 1003, "sin dato"],
    [1, 1005, "12"],
  ]);
  const values = await readNutrients(dir, "usda_sr_legacy", new Set([1]));
  assert.equal(values.get(1)?.kcal, undefined);
  assert.equal(values.get(1)?.protein_g, undefined);
  assert.equal(values.get(1)?.carbs_g, 12);
});

test("solo se leen los fdc_id pedidos", async () => {
  const dir = nutrientCsv([
    [1, 1008, "100"],
    [2, 1008, "200"],
  ]);
  const values = await readNutrients(dir, "usda_sr_legacy", new Set([2]));
  assert.equal(values.get(1), undefined);
  assert.equal(values.get(2)?.kcal, 200);
});

test("las porciones respetan el orden de USDA y descartan duplicados exactos", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nutriscann-portions-"));
  writeFileSync(
    join(dir, "food_portion.csv"),
    [
      '"id","fdc_id","seq_num","amount","measure_unit_id","portion_description","modifier","gram_weight"',
      // Llega desordenada: seq_num 2 antes que 1.
      '"2","1","2","1","9999","","cup","244"',
      '"1","1","1","1","9999","1 medium","","118"',
      '"3","1","3","1","9999","1 medium","","118"',
      '"4","1","4","","9999","","","0"',
      "",
    ].join("\n"),
  );
  const portions = await readPortions(dir, new Set([1]));
  assert.deepEqual(portions.get(1), [
    { grams: 118, label_en: "1 medium", label_es: null },
    { grams: 244, label_en: "1 cup", label_es: null },
  ]);
});
