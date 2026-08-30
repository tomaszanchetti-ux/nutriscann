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
import { loadExclusions } from "./selection";
import { aliasText } from "./types";

test("el pipeline compila el catálogo y pasa los cinco candados", { timeout: 600_000 }, async () => {
  const first = await runPipeline();
  const locks = runContentLocks(first.catalog, first.stats, first.alcohol);

  for (const lock of locks) {
    assert.equal(lock.passed, true, `candado ${lock.id} falló: ${lock.failures.join(" | ")}`);
  }

  assert.ok(first.catalog.foods.length > 900, "el catálogo tiene que traer los ~1.000 seleccionados");
  assert.ok(
    first.stats.manualFoods >= MINIMUM_BY_SOURCE.manual,
    "la curación manual tiene que haber aportado al menos un alimento",
  );
  assert.ok(
    first.stats.recipeFoods >= MINIMUM_BY_SOURCE.receta,
    "las recetas compuestas tienen que haber aportado al menos un alimento",
  );
  assert.deepEqual(first.stats.recipeFailures, [], "ninguna receta puede quedar sin derivar");
  assert.ok(first.stats.bySource.usda_fndds >= MINIMUM_BY_SOURCE.usda_fndds);
  assert.ok(first.stats.bySource.usda_sr_legacy >= MINIMUM_BY_SOURCE.usda_sr_legacy);
  assert.match(first.catalog.kb_version, /^2\.1\.0\+[0-9a-f]{8}$/);

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

test("las fichas que la DT-7 excluyó NO están en el catálogo, y sus reemplazos SÍ", { timeout: 600_000 }, async () => {
  const { catalog } = await runPipeline();
  const byId = new Map(catalog.foods.map((food) => [food.id, food]));
  const exclusions = loadExclusions();
  assert.ok(exclusions !== null, "la DT-7 tiene que estar declarada");
  for (const item of exclusions.exclusions) {
    assert.equal(byId.has(`fdc-${item.fdc_id}`), false, `fdc-${item.fdc_id} tendría que estar excluido`);
    const superviviente = byId.get(`fdc-${item.duplicado_de}`);
    assert.ok(superviviente, `fdc-${item.duplicado_de} tiene que quedar en el catálogo`);
    // Excluir no puede achicar el vocabulario: lo que perdía el excluido se hereda.
    const textos = superviviente.aliases.es.map(aliasText);
    for (const alias of item.aliases_heredados) {
      assert.ok(textos.includes(alias), `"${alias}" tendría que haber quedado como alias de fdc-${item.duplicado_de}`);
    }
  }
});

test("los alimentos descartados por Atwater no entran al catálogo", { timeout: 600_000 }, async () => {
  const { catalog } = await runPipeline();
  const ids = new Set(catalog.foods.map((food) => food.id));
  // La selección los deja fuera; el build no los reintroduce por la ventana.
  const flagged = ["fdc-2707635"];
  for (const id of flagged) assert.equal(ids.has(id), false, `${id} no debería estar`);
});
