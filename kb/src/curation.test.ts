/**
 * La curación se escribe en paralelo con el build. Estos tests fijan la única
 * regla que importa: la AUSENCIA se tolera (el catálogo sale con names.es en
 * null), la BASURA no (un archivo mal formado se reporta).
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadCuration } from "./curation";

function tempDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "nutriscann-curation-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

test("sin archivos de curación no se rompe nada", () => {
  const curation = loadCuration(tempDir());
  assert.equal(curation.names.size, 0);
  assert.equal(curation.portions.size, 0);
  assert.deepEqual(curation.problems, []);
  assert.deepEqual(curation.filesFound, []);
});

test("lee nombres y aliases del contrato acordado", () => {
  const dir = tempDir({
    "names.es.json": JSON.stringify({
      "173944": { name: "Banana", aliases: ["plátano", "banano"] },
      "171689": { name: "Manzana" },
    }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.names.get(173944)?.name, "Banana");
  assert.deepEqual(curation.names.get(173944)?.aliases, ["plátano", "banano"]);
  assert.deepEqual(curation.names.get(171689)?.aliases, []);
  assert.deepEqual(curation.problems, []);
});

test("una curación a medias solo aporta lo que trae", () => {
  const dir = tempDir({ "names.es.json": JSON.stringify({ "173944": { name: "Banana" } }) });
  const curation = loadCuration(dir);
  assert.equal(curation.names.size, 1);
  assert.equal(curation.names.has(2709215), false);
});

test("un archivo mal formado se reporta, no se traga", () => {
  const dir = tempDir({
    "names.es.json": JSON.stringify({
      "173944": { aliases: ["plátano"] },
      "no-es-un-id": { name: "X" },
    }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.names.size, 0);
  assert.equal(curation.problems.length, 2);
});

test("un JSON roto se reporta como problema y no lanza", () => {
  const dir = tempDir({ "names.es.json": "{ esto no es json" });
  const curation = loadCuration(dir);
  assert.equal(curation.problems.length, 1);
  assert.match(curation.problems[0] as string, /no es JSON válido/);
});

test("las porciones sobrescritas exigen un número positivo", () => {
  const dir = tempDir({
    "portions.overrides.json": JSON.stringify({
      "173944": { default_portion_g: 118, label_es: "1 unidad mediana" },
      "171689": { default_portion_g: 0 },
    }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.portions.get(173944)?.default_portion_g, 118);
  assert.equal(curation.portions.has(171689), false);
  assert.equal(curation.problems.length, 1);
});

test("la etiqueta en español de la porción se lee, no se ignora", () => {
  const dir = tempDir({
    "portions.overrides.json": JSON.stringify({
      "173944": { default_portion_g: 118, label_es: "1 unidad mediana" },
    }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.portions.get(173944)?.label_es, "1 unidad mediana");
});

test("gramos y etiqueta son independientes: se puede corregir solo uno", () => {
  const dir = tempDir({
    "portions.overrides.json": JSON.stringify({
      "173944": { label_es: "1 unidad mediana" },
      "171689": { default_portion_g: 182 },
    }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.portions.get(173944)?.default_portion_g, null);
  assert.equal(curation.portions.get(173944)?.label_es, "1 unidad mediana");
  assert.equal(curation.portions.get(171689)?.label_es, null);
  assert.deepEqual(curation.problems, []);
});

test("una etiqueta vacía se reporta como problema", () => {
  const dir = tempDir({
    "portions.overrides.json": JSON.stringify({ "173944": { label_es: "   " } }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.portions.has(173944), false);
  assert.match(curation.problems[0] as string, /label_es/);
});
