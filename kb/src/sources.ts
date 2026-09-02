/**
 * Capa 1 del pipeline: las fuentes crudas.
 *
 * `kb/sources.json` declara cada dataset de USDA con su sha256. Los .zip pesan
 * 1,1 GB y no viven en git: viven en la carpeta declarada en `raw_dir`. Antes
 * de leer un solo CSV el build verifica los hashes — si un archivo cambió, el
 * catálogo dejó de ser reproducible y el build para acá, no doce pasos después.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { existsSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import type { SourceId } from "./types";

/** Raíz del repo (este archivo compila a `kb/dist/sources.js`). */
export const REPO_ROOT = resolve(__dirname, "..", "..");
export const KB_DIR = join(REPO_ROOT, "kb");
export const BUILD_DIR = join(KB_DIR, "build");
export const CURATION_DIR = join(KB_DIR, "curation");
export const SELECTION_FILE = join(KB_DIR, "selection", "selection.v1.json");
export const SELECTION_DIR = join(KB_DIR, "selection");
/**
 * Bloques que SUMAN alimentos a la selección base, en orden de aplicación.
 * Cada uno trae su propio criterio y su justificación; ninguno reescribe
 * `selection.v1.json`, que sigue siendo el entregable de la card 1.1.
 */
export const SELECTION_BLOCK_FILES = [
  join(SELECTION_DIR, "regional.v1.json"),
  join(SELECTION_DIR, "es.sweep.v1.json"),
  join(SELECTION_DIR, "ingredientes.v1.json"),
  join(SELECTION_DIR, "dt27.v1.json"),
  join(SELECTION_DIR, "dt33.v1.json"),
];
/** Exclusiones de la DT-7: fichas duplicadas que salen de la selección. */
export const EXCLUSIONS_FILE = join(SELECTION_DIR, "exclusions.dt7.json");
/** El artefacto de la DT-7: trae los nombres ANTERIORES de lo que se renombró. */
export const DT7_PAIRS_FILE = join(SELECTION_DIR, "dt7.pairs.json");
export const SOURCES_FILE = join(KB_DIR, "sources.json");

export interface DeclaredSource {
  id: SourceId;
  name: string;
  file: string;
  released: string;
  sha256: string;
  bytes: number;
  precedence: number;
}

interface SourcesManifest {
  kb_schema_version: number;
  raw_dir: string;
  sources: DeclaredSource[];
}

export interface ResolvedSource extends DeclaredSource {
  /** Ruta del .zip declarado. */
  zipPath: string;
  /** Carpeta con los CSVs ya extraídos de ese .zip. */
  csvDir: string;
}

/** Lee el manifiesto y resuelve dónde están los archivos de cada fuente. */
export function loadSources(): { manifest: SourcesManifest; sources: ResolvedSource[] } {
  const manifest = JSON.parse(readFileSync(SOURCES_FILE, "utf8")) as SourcesManifest;
  const rawDir = resolve(REPO_ROOT, manifest.raw_dir);
  const sources = manifest.sources.map((source) => ({
    ...source,
    zipPath: join(rawDir, source.file),
    // Los CSVs se extraen a `<raw_dir>/extracted/<id>/<nombre del zip>/`.
    csvDir: join(rawDir, "extracted", source.id, basename(source.file, ".zip")),
  }));
  return { manifest, sources };
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export interface SourceCheck {
  id: SourceId;
  file: string;
  sha256_ok: boolean;
  sha256_found: string;
  csv_dir_ok: boolean;
}

/**
 * Verifica el sha256 de cada .zip contra `sources.json` y que su carpeta de
 * CSVs exista. No lanza: devuelve el parte para que el candado decida.
 */
export async function checkSources(sources: ResolvedSource[]): Promise<SourceCheck[]> {
  const checks: SourceCheck[] = [];
  for (const source of sources) {
    let found = "";
    if (existsSync(source.zipPath)) found = await sha256(source.zipPath);
    checks.push({
      id: source.id,
      file: source.file,
      sha256_ok: found === source.sha256,
      sha256_found: found === "" ? "(archivo ausente)" : found,
      csv_dir_ok: existsSync(join(source.csvDir, "food.csv")),
    });
  }
  return checks;
}
