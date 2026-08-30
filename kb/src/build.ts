/**
 * El build: de los CSVs crudos de USDA al catálogo canónico.
 *
 * Orden deliberado: primero se verifican los hashes de las fuentes, después se
 * lee, después se arma, después se corren los candados y RECIÉN AHÍ se escribe.
 * Nada toca el disco hasta que los cinco candados dieron verde.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { assemble, serialize, type AssembleResult, type BuildStats } from "./canonical";
import { getCsvAnomalies, resetCsvAnomalies, type CsvAnomalies } from "./csv";
import { loadCuration, type Curation } from "./curation";
import {
  lockAtwater,
  lockGolden,
  lockIdempotence,
  lockPerSource,
  lockSchema,
  type LockResult,
} from "./locks";
import { loadSelection, toSourceId } from "./selection";
import { BUILD_DIR, checkSources, loadSources, type SourceCheck } from "./sources";
import type { Catalog, FoodSource, PortionHint, SourceId } from "./types";
import { readDescriptions, readNutrients, readPortions } from "./usda";
import type { NutrientBundle } from "./nutrients";

export const CATALOG_FILE = join(BUILD_DIR, "foods.canonical.json");
export const PENDING_FILE = join(BUILD_DIR, "pending.curation.json");

export interface PipelineResult extends AssembleResult {
  json: string;
  sourceChecks: SourceCheck[];
  curation: Curation;
  csvAnomalies: CsvAnomalies;
}

/** Una corrida completa del pipeline, de los CSVs al texto del catálogo. */
export async function runPipeline(): Promise<PipelineResult> {
  resetCsvAnomalies();
  const { sources } = loadSources();
  const sourceChecks = await checkSources(sources);
  const broken = sourceChecks.filter((check) => !check.sha256_ok || !check.csv_dir_ok);
  if (broken.length > 0) {
    const detail = broken
      .map((check) =>
        check.sha256_ok
          ? `${check.id}: faltan los CSV extraídos`
          : `${check.id}: sha256 esperado distinto del encontrado (${check.sha256_found})`,
      )
      .join("\n  ");
    throw new Error(
      `Las fuentes crudas no son las declaradas en kb/sources.json:\n  ${detail}\n` +
        "El catálogo dejaría de ser reproducible: el build no sigue.",
    );
  }

  const byId = new Map<SourceId, (typeof sources)[number]>();
  for (const source of sources) byId.set(source.id, source);
  const dirOf = (id: SourceId): string => {
    const source = byId.get(id);
    if (source === undefined) throw new Error(`kb/sources.json no declara la fuente ${id}`);
    return source.csvDir;
  };

  const selection = loadSelection();
  const idsBySource: Record<FoodSource, Set<number>> = {
    usda_fndds: new Set(),
    usda_sr_legacy: new Set(),
  };
  for (const entry of selection.entries) idsBySource[toSourceId(entry.source)].add(entry.fdc_id);
  const foundationIds = new Set(selection.foundation_overrides.map((o) => o.fdc_id_foundation));

  const descriptions = {} as Record<FoodSource, Map<number, string>>;
  const nutrients = {} as Record<FoodSource, Map<number, NutrientBundle>>;
  const portions = {} as Record<FoodSource, Map<number, PortionHint[]>>;
  for (const source of ["usda_fndds", "usda_sr_legacy"] as FoodSource[]) {
    const dir = dirOf(source);
    const ids = idsBySource[source];
    descriptions[source] = await readDescriptions(dir, ids);
    nutrients[source] = await readNutrients(dir, source, ids);
    portions[source] = await readPortions(dir, ids);
  }
  const foundationNutrients = await readNutrients(
    dirOf("usda_foundation"),
    "usda_foundation",
    foundationIds,
  );

  const curation = loadCuration();
  const assembled = assemble({
    selection,
    sourceIds: sources.map((source) => source.id),
    descriptions,
    nutrients,
    portions,
    foundationNutrients,
    curation,
  });

  return {
    ...assembled,
    json: serialize(assembled.catalog),
    sourceChecks,
    curation,
    csvAnomalies: getCsvAnomalies(),
  };
}

/** Corre los cuatro candados que dependen del contenido del catálogo. */
export function runContentLocks(
  catalog: Catalog,
  stats: BuildStats,
  alcohol: Map<string, number>,
): LockResult[] {
  return [lockSchema(catalog, stats), lockPerSource(catalog), lockAtwater(catalog, alcohol), lockGolden(catalog)];
}

/** El archivo de pendientes: lo que la curación todavía no tradujo. */
export function serializePending(result: PipelineResult): string {
  const pending = [...result.stats.pendingCuration]
    .sort((a, b) => a.fdc_id - b.fdc_id)
    .map((item) => ({
      id: `fdc-${item.fdc_id}`,
      fdc_id: item.fdc_id,
      source: item.source,
      name_en: item.description,
    }));
  return `${JSON.stringify(
    {
      kb_version: result.catalog.kb_version,
      total: pending.length,
      $comment:
        "Alimentos sin names.es. Los produce el build; los resuelve la curación " +
        "(kb/curation/names.es.json). Se regenera en cada build.",
      pending,
    },
    null,
    2,
  )}\n`;
}

export interface BuildOptions {
  /** Saltea la segunda corrida completa (el candado de idempotencia). */
  skipIdempotence?: boolean;
  /** No escribe nada: solo corre y reporta. */
  dryRun?: boolean;
}

export interface BuildOutcome {
  result: PipelineResult;
  locks: LockResult[];
  written: string[];
}

export async function runBuild(options: BuildOptions = {}): Promise<BuildOutcome> {
  const result = await runPipeline();
  const locks = runContentLocks(result.catalog, result.stats, result.alcohol);

  if (options.skipIdempotence !== true) {
    const second = await runPipeline();
    locks.push(lockIdempotence(result.json, second.json));
  }

  const failed = locks.filter((lock) => !lock.passed);
  if (failed.length > 0) {
    const detail = failed
      .map((lock) => {
        const shown = lock.failures.slice(0, 10).map((f) => `      - ${f}`);
        const rest = lock.failures.length > 10 ? [`      … y ${lock.failures.length - 10} más`] : [];
        return [`  ✗ candado ${lock.id} (${lock.name})`, ...shown, ...rest].join("\n");
      })
      .join("\n");
    throw new Error(`El build no escribió nada: fallaron ${failed.length} candados.\n${detail}`);
  }

  const written: string[] = [];
  if (options.dryRun !== true) {
    mkdirSync(BUILD_DIR, { recursive: true });
    writeFileSync(CATALOG_FILE, result.json, "utf8");
    writeFileSync(PENDING_FILE, serializePending(result), "utf8");
    written.push(CATALOG_FILE, PENDING_FILE);
  }
  return { result, locks, written };
}
