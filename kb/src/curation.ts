/**
 * Capa 3 del pipeline: la curación (`kb/curation/*.json`).
 *
 * La curación la escribe otra card, en paralelo con esta. Por eso el build la
 * lee de forma TOLERANTE: si los archivos no existen o están a medias, el
 * catálogo sale igual con `names.es = null` en lo que falte y el build imprime
 * la lista de pendientes. Un catálogo sin traducir es un catálogo incompleto;
 * un build que no corre hasta que aparezca la traducción es un bloqueo.
 *
 * Lo que NO es tolerante es un archivo mal formado: si existe y no respeta el
 * contrato, el build avisa fuerte. Tolerar la ausencia no es tolerar la basura.
 *
 * Contrato acordado:
 *   names.es.json          { "<fdc_id>": { "name": "...", "aliases": ["..."] } }
 *   portions.overrides.json { "<fdc_id>": { "default_portion_g": N, "label_es": "..." } }
 *
 * Las dos claves del override son independientes: se puede corregir solo los
 * gramos, solo la etiqueta en español, o las dos.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CURATION_DIR } from "./sources";

export interface CuratedName {
  name: string;
  aliases: string[];
}

export interface CuratedPortion {
  /** Gramos de la porción por defecto. `null` = la curación no la cambia. */
  default_portion_g: number | null;
  /** Cómo se llama esa porción en español ("1 unidad mediana"). */
  label_es: string | null;
}

export interface Curation {
  names: Map<number, CuratedName>;
  portions: Map<number, CuratedPortion>;
  /** Archivos que se encontraron, para que el reporte diga qué se mezcló. */
  filesFound: string[];
  /** Problemas de forma en archivos que sí existen. */
  problems: string[];
}

function readJsonObject(path: string, problems: string[]): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    problems.push(`${path}: no es JSON válido (${(error as Error).message})`);
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push(`${path}: se esperaba un objeto { "<fdc_id>": {...} }`);
    return null;
  }
  return parsed as Record<string, unknown>;
}

/** Lee la curación disponible. Nunca lanza por ausencia. */
export function loadCuration(dir: string = CURATION_DIR): Curation {
  const names = new Map<number, CuratedName>();
  const portions = new Map<number, CuratedPortion>();
  const filesFound: string[] = [];
  const problems: string[] = [];

  const namesFile = join(dir, "names.es.json");
  if (existsSync(namesFile)) {
    filesFound.push("names.es.json");
    const raw = readJsonObject(namesFile, problems);
    for (const [key, value] of Object.entries(raw ?? {})) {
      const fdcId = Number(key);
      if (!Number.isInteger(fdcId)) {
        problems.push(`names.es.json: la clave "${key}" no es un fdc_id`);
        continue;
      }
      if (value === null || typeof value !== "object") {
        problems.push(`names.es.json[${key}]: se esperaba { name, aliases }`);
        continue;
      }
      const entry = value as { name?: unknown; aliases?: unknown };
      if (typeof entry.name !== "string" || entry.name.trim() === "") {
        problems.push(`names.es.json[${key}]: "name" ausente o vacío`);
        continue;
      }
      let aliases: string[] = [];
      if (entry.aliases !== undefined) {
        if (!Array.isArray(entry.aliases) || entry.aliases.some((a) => typeof a !== "string")) {
          problems.push(`names.es.json[${key}]: "aliases" debe ser una lista de textos`);
        } else {
          aliases = (entry.aliases as string[]).map((a) => a.trim()).filter((a) => a !== "");
        }
      }
      names.set(fdcId, { name: entry.name.trim(), aliases });
    }
  }

  const portionsFile = join(dir, "portions.overrides.json");
  if (existsSync(portionsFile)) {
    filesFound.push("portions.overrides.json");
    const raw = readJsonObject(portionsFile, problems);
    for (const [key, value] of Object.entries(raw ?? {})) {
      const fdcId = Number(key);
      if (!Number.isInteger(fdcId)) {
        problems.push(`portions.overrides.json: la clave "${key}" no es un fdc_id`);
        continue;
      }
      if (value === null || typeof value !== "object") {
        problems.push(`portions.overrides.json[${key}]: se esperaba un objeto`);
        continue;
      }
      const entry = value as { default_portion_g?: unknown; label_es?: unknown };

      let grams: number | null = null;
      if (entry.default_portion_g !== undefined && entry.default_portion_g !== null) {
        const parsed = Number(entry.default_portion_g);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          problems.push(
            `portions.overrides.json[${key}]: "default_portion_g" debe ser un número > 0`,
          );
        } else {
          grams = parsed;
        }
      }

      let labelEs: string | null = null;
      if (entry.label_es !== undefined && entry.label_es !== null) {
        if (typeof entry.label_es !== "string" || entry.label_es.trim() === "") {
          problems.push(`portions.overrides.json[${key}]: "label_es" debe ser un texto no vacío`);
        } else {
          labelEs = entry.label_es.trim();
        }
      }

      // Una entrada que no aporta ni gramos ni etiqueta no es un override.
      if (grams === null && labelEs === null) continue;
      portions.set(fdcId, { default_portion_g: grams, label_es: labelEs });
    }
  }

  return { names, portions, filesFound, problems };
}
