/**
 * Lectura de la selección: `selection.v1.json` (card 1.1) más los bloques que
 * la extienden (`regional.v1.json`, card 1.6).
 *
 * La selección ya decidió el reparto de territorios (FNDDS gobierna los platos
 * como se comen, SR Legacy los ingredientes crudos) y ya filtró por Atwater.
 * El build no vuelve a decidir qué entra: toma la lista y la compila.
 *
 * Un bloque nuevo NO reescribe el archivo de la card 1.1: se suma. Así el diff
 * de cada card sigue siendo el de esa card y la versión del catálogo nombra
 * todos los criterios que lo produjeron, no solo el primero.
 */
import { existsSync, readFileSync } from "node:fs";

import { DT7_PAIRS_FILE, EXCLUSIONS_FILE, SELECTION_BLOCK_FILES, SELECTION_FILE } from "./sources";
import type { UsdaFoodSource } from "./types";

/** Cómo nombra la selección a cada fuente. */
type SelectionSource = "fndds" | "sr_legacy";

export interface SelectionEntry {
  fdc_id: number;
  source: SelectionSource;
  description: string;
  category: string;
  n_ingredients: number | null;
  n_portions: number;
  default_portion_g: number;
  portion_needs_review: boolean;
}

export interface FoundationOverride {
  fdc_id_foundation: number;
  matched_fdc_id: number;
  description: string;
}

export interface Selection {
  criteria_version: string;
  generated: string;
  entries: SelectionEntry[];
  foundation_overrides: FoundationOverride[];
  /** Descartados por incoherencia de Atwater. NO entran al catálogo. */
  flagged_atwater: { fdc_id: number; source: string; description: string; deviation_pct: number }[];
}

/** Traduce el nombre corto de la selección al id declarado en `sources.json`. */
export function toSourceId(source: SelectionSource): UsdaFoodSource {
  return source === "fndds" ? "usda_fndds" : "usda_sr_legacy";
}

/**
 * Un bloque de promoción: alimentos que YA estaban en el universo USDA y que una
 * card posterior sube a la selección, con su propio criterio y su justificación.
 *
 * Vive en un archivo aparte y no dentro de `selection.v1.json` por dos razones
 * medidas: `selection.v1.json` es el entregable de la card 1.1 y su diff tiene
 * que seguir siendo el de esa card, y un bloque con criterio propio se revisa
 * solo —quién lo promovió, por qué, y contra qué evidencia— en vez de perderse
 * entre novecientas entradas.
 */
export interface SelectionBlock {
  criteria_version: string;
  generated: string;
  justificacion: string;
  entries: SelectionEntry[];
}

/**
 * Una ficha que SALE de la selección (DT-7).
 *
 * El principio de la DT-7 es "el nombre nunca miente": cuando dos fichas de
 * fuentes distintas son el mismo alimento, tener las dos obliga al motor a
 * elegir entre dos verdades y le da al usuario dos números para lo mismo. Queda
 * la de SR Legacy —medición de laboratorio— y la de FNDDS sale por acá, no
 * borrando la línea de `selection.v1.json`.
 *
 * `aliases_heredados` es el vocabulario que perdía el excluido —su nombre y sus
 * propios aliases—: pasa entero a la ficha que queda, para que quien buscaba
 * "Banana" (o "Plátano", o "Guineo") siga encontrando la banana. Excluir una
 * ficha no puede achicar el vocabulario: el alimento sigue existiendo.
 */
export interface Dt7Exclusion {
  fdc_id: number;
  source: SelectionSource;
  description: string;
  duplicado_de: number;
  aliases_heredados: string[];
  motivo: string;
}

export interface Dt7Exclusions {
  criteria_version: string;
  generated: string;
  exclusions: Dt7Exclusion[];
}

/**
 * La selección completa: el bloque base de la card 1.1, más los bloques que la
 * extienden, menos las exclusiones de la DT-7. `criteria_version` los nombra a
 * todos, así que la versión del catálogo dice de qué criterios salió y no solo
 * del primero.
 */
export function loadSelection(): Selection {
  const selection = JSON.parse(readFileSync(SELECTION_FILE, "utf8")) as Selection;
  if (!Array.isArray(selection.entries) || selection.entries.length === 0) {
    throw new Error("La selección no trae entradas: no hay nada que compilar.");
  }

  let armada = selection;
  for (const file of SELECTION_BLOCK_FILES) {
    const block = loadBlock(file);
    if (block !== null) armada = mergeBlock(armada, block);
  }
  const exclusions = loadExclusions();
  return exclusions === null ? armada : applyExclusions(armada, exclusions);
}

/** Lee un bloque de promoción. Devuelve `null` si todavía no existe. */
export function loadBlock(file: string): SelectionBlock | null {
  if (!existsSync(file)) return null;
  const block = JSON.parse(readFileSync(file, "utf8")) as SelectionBlock;
  if (!Array.isArray(block.entries) || block.entries.length === 0) {
    throw new Error(`${file}: el bloque existe y no trae entradas. Un bloque vacío es un error, no un caso.`);
  }
  if (typeof block.criteria_version !== "string" || block.criteria_version.trim() === "") {
    throw new Error(`${file}: el bloque no declara criteria_version.`);
  }
  return block;
}

/** Lee las exclusiones de la DT-7. Devuelve `null` si el archivo no existe. */
export function loadExclusions(file: string = EXCLUSIONS_FILE): Dt7Exclusions | null {
  if (!existsSync(file)) return null;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Dt7Exclusions;
  if (!Array.isArray(parsed.exclusions) || parsed.exclusions.length === 0) {
    throw new Error(`${file}: el archivo existe y no excluye nada. Un archivo vacío es un error, no un caso.`);
  }
  return parsed;
}

/**
 * Suma un bloque a la selección base. Es ADITIVO: un `fdc_id` que ya estaba no
 * se duplica ni se pisa. Un bloque que quiera CAMBIAR una entrada existente es
 * una decisión distinta y tiene que discutirse como tal, no colarse por acá.
 */
export function mergeBlock(base: Selection, block: SelectionBlock): Selection {
  const known = new Set(base.entries.map((entry) => entry.fdc_id));
  const nuevas: SelectionEntry[] = [];
  const repetidas: number[] = [];
  for (const entry of block.entries) {
    if (known.has(entry.fdc_id)) {
      repetidas.push(entry.fdc_id);
      continue;
    }
    known.add(entry.fdc_id);
    nuevas.push(entry);
  }
  if (repetidas.length > 0) {
    throw new Error(
      `El bloque ${block.criteria_version} promueve alimentos que ya estaban en la selección: ` +
        `${repetidas.join(", ")}. Promover lo que ya está no agrega nada y esconde un error de medición.`,
    );
  }
  return {
    ...base,
    criteria_version: `${base.criteria_version} + ${block.criteria_version}`,
    entries: [...base.entries, ...nuevas],
  };
}

/**
 * Saca de la selección las fichas que la DT-7 declaró duplicadas.
 *
 * Dos chequeos que no son opcionales: el excluido tiene que EXISTIR (si no, la
 * exclusión ya se aplicó o el id está mal, y en los dos casos el archivo miente)
 * y su reemplazo tiene que QUEDAR (excluir una ficha apuntando a otra que
 * también sale deja al alimento sin ninguna).
 */
export function applyExclusions(base: Selection, exclusions: Dt7Exclusions): Selection {
  const presentes = new Set(base.entries.map((entry) => entry.fdc_id));
  const fuera = new Set<number>();
  const problemas: string[] = [];

  for (const item of exclusions.exclusions) {
    if (!presentes.has(item.fdc_id)) {
      problemas.push(`fdc-${item.fdc_id} no está en la selección: no se puede excluir`);
      continue;
    }
    if (fuera.has(item.fdc_id)) {
      problemas.push(`fdc-${item.fdc_id} está excluido dos veces`);
      continue;
    }
    fuera.add(item.fdc_id);
  }
  for (const item of exclusions.exclusions) {
    if (!presentes.has(item.duplicado_de) || fuera.has(item.duplicado_de)) {
      problemas.push(
        `fdc-${item.fdc_id} se excluye por duplicar a fdc-${item.duplicado_de}, ` +
          "que no queda en la selección: el alimento se quedaría sin ninguna ficha",
      );
    }
  }
  if (problemas.length > 0) {
    throw new Error(`${exclusions.criteria_version}: exclusiones inconsistentes:\n  ${problemas.join("\n  ")}`);
  }

  return {
    ...base,
    criteria_version: `${base.criteria_version} − ${exclusions.criteria_version}`,
    entries: base.entries.filter((entry) => !fuera.has(entry.fdc_id)),
  };
}

/**
 * Los aliases que heredan las fichas que quedan, por `fdc_id` de la que queda.
 * Una sola fuente de verdad: el nombre que pierde el excluido se declara en
 * `exclusions.dt7.json` y el build lo aplica; no hay que acordarse de copiarlo
 * a mano a `names.es.json`.
 */
export function inheritedAliases(exclusions: Dt7Exclusions | null): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const item of exclusions?.exclusions ?? []) {
    const list = out.get(item.duplicado_de) ?? [];
    list.push(...item.aliases_heredados);
    out.set(item.duplicado_de, list);
  }
  for (const list of out.values()) list.sort();
  return out;
}

/**
 * Agrupa los overrides de Foundation por el alimento que pisan.
 *
 * Varios alimentos de Foundation pueden apuntar al mismo alimento del catálogo
 * (el mismo producto analizado en campañas distintas). En ese caso hace falta
 * una regla declarada, no el azar del orden del archivo: gana el que resuelve
 * más campos y, a igualdad, el `fdc_id` más alto — que en Foundation es el
 * análisis más reciente, que es exactamente su rol declarado en `sources.json`.
 */
export function groupOverrides(
  overrides: FoundationOverride[],
): Map<number, FoundationOverride[]> {
  const grouped = new Map<number, FoundationOverride[]>();
  for (const override of overrides) {
    const list = grouped.get(override.matched_fdc_id) ?? [];
    list.push(override);
    grouped.set(override.matched_fdc_id, list);
  }
  return grouped;
}

/**
 * Los nombres ANTERIORES de las fichas que la DT-7 renombró, por id.
 *
 * Existe por una regresión concreta: la quinoa se renombró a "Quinoa cocida con
 * sal y grasa" y se le dejó el alias pelado "Quinua", así que quien buscaba la
 * variante regional caía igual en la ficha con grasa — 26 veces el sodio de la
 * quinua hervida. Se arregló a mano, y una ronda después pasó lo mismo con el
 * garbanzo. Un error que vuelve dos veces no se arregla a mano: se arregla con un
 * candado, y para eso el artefacto de la DT-7 ya tiene la lista.
 */
export function loadDt7OldNames(file: string = DT7_PAIRS_FILE): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync(file)) return out;
  const parsed = JSON.parse(readFileSync(file, "utf8")) as {
    pares?: { fndds?: { fdc_id?: number }; nombre_anterior?: string | null }[];
    renombrados_fuera_del_censo_cruzado?: { fichas?: { fdc_id: number; nombre_anterior: string }[] };
  };
  // Las dos secciones que renombran: los grupos B y C del censo cruzado, y las
  // fichas cuyo nombre escondía su composición, halladas fuera del censo.
  for (const par of parsed.pares ?? []) {
    const id = par.fndds?.fdc_id;
    if (id === undefined || typeof par.nombre_anterior !== "string") continue;
    out.set(`fdc-${id}`, par.nombre_anterior);
  }
  for (const ficha of parsed.renombrados_fuera_del_censo_cruzado?.fichas ?? []) {
    out.set(`fdc-${ficha.fdc_id}`, ficha.nombre_anterior);
  }
  return out;
}
