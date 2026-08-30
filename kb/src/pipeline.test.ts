/**
 * El pipeline completo contra los CSVs reales de USDA.
 *
 * Es el único test que lee los datasets: verifica que el catálogo se compile,
 * que los cinco candados den verde y que dos corridas completas produzcan el
 * mismo archivo byte a byte. Tarda unos segundos porque efectivamente recorre
 * los CSVs dos veces: esa es justamente la prueba.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { runContentLocks, runPipeline } from "./build";
import { GOLDEN_CHECKS, MINIMUM_BY_SOURCE, lockIdempotence } from "./locks";

test("el pipeline compila el catálogo y pasa los cinco candados", { timeout: 600_000 }, async () => {
  const first = await runPipeline();
  const locks = runContentLocks(first.catalog, first.stats, first.alcohol);

  for (const lock of locks) {
    assert.equal(lock.passed, true, `candado ${lock.id} falló: ${lock.failures.join(" | ")}`);
  }

  assert.ok(first.catalog.foods.length > 900, "el catálogo tiene que traer los ~975 seleccionados");
  assert.ok(first.stats.bySource.usda_fndds >= MINIMUM_BY_SOURCE.usda_fndds);
  assert.ok(first.stats.bySource.usda_sr_legacy >= MINIMUM_BY_SOURCE.usda_sr_legacy);
  assert.match(first.catalog.kb_version, /^1\.0\.0\+[0-9a-f]{8}$/);

  const second = await runPipeline();
  const idempotence = lockIdempotence(first.json, second.json);
  assert.equal(idempotence.passed, true, idempotence.failures.join(" | "));
  assert.equal(first.catalog.kb_version, second.catalog.kb_version);
});

test("cada caso dorado existe de verdad en la selección", { timeout: 600_000 }, async () => {
  const { catalog } = await runPipeline();
  const ids = new Set(catalog.foods.map((food) => food.id));
  for (const check of GOLDEN_CHECKS) {
    assert.ok(ids.has(`fdc-${check.fdc_id}`), `${check.label} no está en el catálogo`);
  }
});

test("los alimentos descartados por Atwater no entran al catálogo", { timeout: 600_000 }, async () => {
  const { catalog } = await runPipeline();
  const ids = new Set(catalog.foods.map((food) => food.id));
  // La selección los deja fuera; el build no los reintroduce por la ventana.
  const flagged = ["fdc-2707635"];
  for (const id of flagged) assert.equal(ids.has(id), false, `${id} no debería estar`);
});
