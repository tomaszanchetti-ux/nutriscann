/**
 * Punto de entrada del build de la base de conocimiento.
 *
 *   npm run build              compila el catálogo y verifica los 6 candados
 *   npm run build -- --rapido  saltea la segunda corrida (candado 5)
 *   npm run build -- --seco    corre y reporta, pero no escribe nada
 *
 * El reporte se imprime siempre: un build que "anduvo" sin decir con cuántos
 * alimentos, con qué cobertura y qué quedó pendiente no informa nada.
 */
import { relative } from "node:path";

import { runBuild, type BuildOutcome } from "./build";
import { REPO_ROOT } from "./sources";

const CURATION_PREVIEW = 15;

function line(label: string, value: string | number): void {
  console.log(`  ${label.padEnd(34, ".")} ${value}`);
}

function report(outcome: BuildOutcome): void {
  const { result, locks, written } = outcome;
  const { stats, catalog } = result;

  console.log("\n== Fuentes ==");
  for (const check of result.sourceChecks) {
    console.log(`  ✓ ${check.id.padEnd(16)} sha256 verificado contra kb/sources.json`);
  }
  const anomalies = result.csvAnomalies;
  line("filas con celdas ≠ encabezado", anomalies.rows);
  for (const [file, count] of Object.entries(anomalies.byFile).sort()) {
    console.log(`      ${file}: ${count}`);
  }

  console.log("\n== Catálogo ==");
  line("versión", catalog.kb_version);
  line("selección", catalog.generated_from.selection);
  line("alimentos", stats.foods);
  line("  de FNDDS", stats.bySource.usda_fndds);
  line("  de SR Legacy", stats.bySource.usda_sr_legacy);
  line("  de curación manual", stats.manualFoods);
  line("  de receta compuesta", stats.recipeFoods);

  console.log("\n== Cobertura de campos extendidos ==");
  for (const [field, count] of Object.entries(stats.coverage)) {
    const pct = stats.foods === 0 ? 0 : (count / stats.foods) * 100;
    line(field, `${count}/${stats.foods} (${pct.toFixed(1)} %)`);
  }

  console.log("\n== Overrides de Foundation ==");
  line("alimentos pisados", stats.overridesFoods);
  for (const [field, count] of Object.entries(stats.overridesByField).sort()) {
    line(`  ${field}`, count);
  }
  if (stats.overrideCollisions.length > 0) {
    console.log(
      `  ${stats.overrideCollisions.length} alimentos con más de un candidato de Foundation ` +
        "(gana el que resuelve más campos; a igualdad, el análisis más reciente):",
    );
    for (const collision of stats.overrideCollisions) {
      console.log(
        `    fdc-${collision.fdc_id}: candidatos ${collision.candidates.join(", ")} → ${collision.winner}`,
      );
    }
  }

  console.log("\n== Curación ==");
  line("archivos leídos", result.curation.filesFound.join(", ") || "(ninguno todavía)");
  line("nombres en español aplicados", stats.curatedNames);
  line("aliases aplicados", stats.curatedAliases);
  line("aliases regionales con confianza", stats.regionalAliases);
  line("alimentos manuales nuevos", stats.manualFoods);
  line("métodos de cocción declarados", result.curation.transforms.size);
  line("recetas compuestas derivadas", stats.recipeFoods);
  if (stats.recipeFailures.length > 0) {
    console.log("  ✗ recetas que no se pudieron derivar:");
    for (const fallo of stats.recipeFailures) console.log(`    - ${fallo.id}: ${fallo.motivo}`);
  }
  line("alimentos pisados por curación manual", stats.manualOverrideFoods);
  for (const [field, count] of Object.entries(stats.manualOverridesByField).sort()) {
    line(`  ${field}`, count);
  }
  line("porciones sobrescritas", stats.curatedPortions);
  line("etiquetas de porción en español", stats.curatedPortionLabels);
  line("porciones agregadas por la curación", stats.curatedPortionHints);

  const regla = result.curation.genericRule;
  line("fichas genéricas marcadas (DT-13)", regla === null ? "(sin regla declarada)" : stats.genericFoods);
  if (regla !== null) {
    line(
      `  con caveat de sodio ≥ ${regla.umbral_sodio_mg} mg`,
      `${stats.genericCaveats} (${regla.criteria_version})`,
    );
  }
  line("guardas de vocabulario", result.curation.guardas.length);
  if (stats.guardViolations.length > 0) {
    console.log("  ✗ guardas violadas:");
    for (const v of stats.guardViolations) console.log(`    - ${v.id} · "${v.termino}" · ${v.donde}`);
  }

  line("PENDIENTES (names.es = null)", stats.pendingCuration.length);
  if (result.curation.problems.length > 0) {
    console.log("  ⚠ problemas de forma en la curación:");
    for (const problem of result.curation.problems) console.log(`    - ${problem}`);
  }
  if (stats.pendingCuration.length > 0) {
    const preview = [...stats.pendingCuration]
      .sort((a, b) => a.fdc_id - b.fdc_id)
      .slice(0, CURATION_PREVIEW);
    for (const item of preview) {
      console.log(`    fdc-${item.fdc_id} [${item.source}] ${item.description}`);
    }
    if (stats.pendingCuration.length > preview.length) {
      console.log(
        `    … y ${stats.pendingCuration.length - preview.length} más. ` +
          "La lista completa queda en kb/build/pending.curation.json",
      );
    }
  }

  if (stats.portionNeedsReview.length > 0) {
    console.log(
      `\n  ⚠ ${stats.portionNeedsReview.length} porciones marcadas para revisar por la ` +
        `selección: ${stats.portionNeedsReview.map((id) => `fdc-${id}`).join(", ")}`,
    );
  }
  if (stats.foodsWithoutPortions.length > 0) {
    console.log(`  ⚠ ${stats.foodsWithoutPortions.length} alimentos sin porciones en USDA`);
  }
  if (stats.descriptionMismatches.length > 0) {
    console.log(
      `  ⚠ ${stats.descriptionMismatches.length} descripciones distintas entre la selección y food.csv ` +
        "(manda food.csv)",
    );
  }

  console.log("\n== Candados ==");
  for (const lock of locks) {
    console.log(`  ✓ candado ${lock.id} — ${lock.name}`);
    if (lock.detail !== "") console.log(`      ${lock.detail}`);
  }

  console.log("\n== Salida ==");
  if (written.length === 0) console.log("  (corrida en seco: no se escribió nada)");
  for (const file of written) console.log(`  ${relative(REPO_ROOT, file)}`);
  console.log("");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const started = Date.now();
  const outcome = await runBuild({
    skipIdempotence: args.includes("--rapido"),
    dryRun: args.includes("--seco"),
  });
  report(outcome);
  console.log(`Listo en ${((Date.now() - started) / 1000).toFixed(1)} s\n`);
}

main().catch((error: unknown) => {
  console.error(`\n✗ ${(error as Error).message}\n`);
  process.exitCode = 1;
});
