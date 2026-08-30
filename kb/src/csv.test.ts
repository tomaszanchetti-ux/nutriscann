/**
 * El parser de CSV, probado contra la forma real de los archivos de USDA:
 * todo entre comillas, comas dentro de las descripciones y comillas escapadas.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { parseCsvText } from "./csv";

test("respeta las comas que van adentro de las comillas", () => {
  const rows = parseCsvText(
    '"fdc_id","description","category"\n"2705384","Milk, NFS","Milk, reduced fat"\n',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.["description"], "Milk, NFS");
  assert.equal(rows[0]?.["category"], "Milk, reduced fat");
});

test("interpreta las comillas escapadas", () => {
  const rows = parseCsvText('"id","name"\n"1","Cheese, ""blue"" type"\n');
  assert.equal(rows[0]?.["name"], 'Cheese, "blue" type');
});

test("tolera saltos de línea dentro de un campo citado", () => {
  const rows = parseCsvText('"id","note"\n"1","primera\nsegunda"\n"2","corta"\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.["note"], "primera\nsegunda");
  assert.equal(rows[1]?.["note"], "corta");
});

test("acepta finales de línea de Windows y campos vacíos", () => {
  const rows = parseCsvText('"id","amount","modifier"\r\n"1","","tbsp"\r\n');
  assert.equal(rows[0]?.["amount"], "");
  assert.equal(rows[0]?.["modifier"], "tbsp");
});

test("acepta la última fila sin salto de línea final", () => {
  const rows = parseCsvText('"id","name"\n"1","Sal"');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.["name"], "Sal");
});

test("no inventa filas con una línea vacía al final", () => {
  const rows = parseCsvText('"id","name"\n"1","Sal"\n\n');
  assert.equal(rows.length, 1);
});
