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

// --- Porciones que la curación AGREGA (card 6.2) ----------------------------
// `label_es` nombra UNA porción, la de por defecto. La cerveza necesitaba otra
// cosa: el juego entero de medidas de una barra española, que USDA no mide.

test("la curación puede agregar porciones propias, con su etiqueta en español", () => {
  const dir = tempDir({
    "portions.overrides.json": JSON.stringify({
      "168746": {
        default_portion_g: 200,
        portion_hints: [
          { grams: 200, label_en: "1 small draft glass", label_es: "1 caña" },
          { grams: 500, label_en: "1 half-litre mug", label_es: "1 jarra" },
        ],
      },
    }),
  });
  const curation = loadCuration(dir);
  assert.deepEqual(curation.problems, []);
  assert.deepEqual(curation.portions.get(168746)?.portion_hints, [
    { grams: 200, label_en: "1 small draft glass", label_es: "1 caña" },
    { grams: 500, label_en: "1 half-litre mug", label_es: "1 jarra" },
  ]);
});

test("una porción curada SIN label_es no entra: es su única razón de ser", () => {
  const dir = tempDir({
    "portions.overrides.json": JSON.stringify({
      "168746": {
        portion_hints: [
          { grams: 200, label_en: "1 small draft glass" },
          { grams: 0, label_en: "1 nada", label_es: "1 nada" },
          { grams: 500, label_en: "", label_es: "1 jarra" },
        ],
      },
    }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.portions.has(168746), false, "ninguna sobrevive, así que no hay override");
  assert.equal(curation.problems.length, 3);
  assert.match(curation.problems.join(" | "), /label_es/);
  assert.match(curation.problems.join(" | "), /grams/);
  assert.match(curation.problems.join(" | "), /label_en/);
});

test("`portion_hints` que no es una lista se reporta, no se traga", () => {
  const dir = tempDir({
    "portions.overrides.json": JSON.stringify({ "168746": { portion_hints: "1 caña" } }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.portions.has(168746), false);
  assert.match(curation.problems[0] as string, /portion_hints/);
});

// --- Las claves `$algo` son comentarios, no fdc_id --------------------------

test("una clave $comentario en un mapa plano de curación no es un problema", () => {
  const dir = tempDir({
    "names.es.json": JSON.stringify({ $comment: ["por qué"], "173944": { name: "Banana" } }),
    "portions.overrides.json": JSON.stringify({
      $dt27: "la barra española",
      "173944": { default_portion_g: 118, label_es: "1 unidad mediana" },
    }),
  });
  const curation = loadCuration(dir);
  assert.deepEqual(curation.problems, []);
  assert.equal(curation.names.size, 1);
  assert.equal(curation.portions.size, 1);
});

test("una clave mal tipeada SIGUE siendo un problema: solo se admite el prefijo $", () => {
  const dir = tempDir({
    "names.es.json": JSON.stringify({ "17394a": { name: "Banana" } }),
    "portions.overrides.json": JSON.stringify({ comment: "sin el peso" }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.problems.length, 2);
  assert.match(curation.problems.join(" | "), /no es un fdc_id/);
});

// --- `salvo_si_contiene`, la excepción de una guarda (DT-32) -----------------

test("una guarda puede declarar la excepción que la levanta", () => {
  // La clave entró con la DT-32 porque la lista de la curación pasó a ser la que
  // corre en el matcher, y la del matcher ya la tenía: `pepinillos` no puede
  // llegar a los dulces SALVO que quien habló haya dicho "dulces".
  const dir = tempDir({
    "guardas.vocabulario.json": JSON.stringify({
      guardas: [
        { termino: "pepinillos", prohibido_en: ["fdc-169378"], salvo_si_contiene: ["dulces"], motivo: "los de eneldo" },
        { termino: "chorizo", prohibido_en: ["fdc-2705835"], motivo: "el corte no es el embutido" },
      ],
    }),
  });
  const curation = loadCuration(dir);
  assert.deepEqual(curation.problems, []);
  assert.equal(curation.guardas.length, 2);
  assert.deepEqual(curation.guardas[0]?.salvo_si_contiene, ["dulces"]);
  // La clave NO existe donde no se declaró: un `undefined` explícito viajaría al
  // JSON del catálogo como una clave que no dice nada.
  assert.equal("salvo_si_contiene" in (curation.guardas[1] ?? {}), false);
});

test("una excepción vacía o con basura es un problema, no una guarda sin excepción", () => {
  // Una excepción que no levanta nada promete algo que no cumple, que es el modo
  // de falla que la card 2.7 ya le encontró a `sweet`. Se reporta en vez de
  // tolerarse: la guarda entera se descarta y el candado 0 rompe el build.
  for (const salvo of [[], [""], ["ok", 7]]) {
    const dir = tempDir({
      "guardas.vocabulario.json": JSON.stringify({
        guardas: [{ termino: "x", prohibido_en: ["fdc-1"], salvo_si_contiene: salvo, motivo: "m" }],
      }),
    });
    const curation = loadCuration(dir);
    assert.equal(curation.guardas.length, 0, JSON.stringify(salvo));
    assert.match(curation.problems.join(" | "), /salvo_si_contiene.*lista NO vacía/);
  }
});
