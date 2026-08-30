/**
 * Lectura de las tablas de USDA que necesita el catálogo.
 *
 * Todo se filtra por el conjunto de `fdc_id` que pidió la selección: de los
 * 13.601 alimentos servibles entran ~975, y no hay razón para materializar el
 * resto. Cada función devuelve datos crudos; el armado del alimento canónico
 * pasa en `canonical.ts`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

import { readCsv, readCsvAll } from "./csv";
import { codeIndex, type NutrientBundle, type NutrientKey } from "./nutrients";
import type { PortionHint, SourceId } from "./types";

/** Lee `food.csv` y devuelve la descripción oficial de cada alimento pedido. */
export async function readDescriptions(
  csvDir: string,
  ids: ReadonlySet<number>,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  await readCsv(join(csvDir, "food.csv"), (row) => {
    const fdcId = Number(row["fdc_id"]);
    if (ids.has(fdcId)) out.set(fdcId, (row["description"] ?? "").trim());
  });
  return out;
}

/**
 * Lee `food_nutrient.csv` con el mapeo del dataset. Cuando un campo tiene
 * varios códigos posibles (la energía de Foundation), gana el de menor rango:
 * el primer código declarado que exista.
 */
export async function readNutrients(
  csvDir: string,
  source: SourceId,
  ids: ReadonlySet<number>,
): Promise<Map<number, NutrientBundle>> {
  const index = codeIndex(source);
  const best = new Map<number, Map<NutrientKey, { value: number; rank: number }>>();

  await readCsv(join(csvDir, "food_nutrient.csv"), (row) => {
    const fdcId = Number(row["fdc_id"]);
    if (!ids.has(fdcId)) return;
    // Siempre se lee la MISMA columna, `nutrient_id`, en los tres datasets.
    // Lo que cambia no es la columna sino QUÉ guarda: en SR Legacy y Foundation
    // trae el `nutrient.id` (1008 = energía) y en FNDDS trae literalmente el
    // `nutrient_nbr` (208 = energía). Por eso el mapeo es por dataset
    // (`NUTRIENT_CODES`) y no hay ninguna rama por fuente acá: el índice de
    // códigos ya viene armado con el vocabulario que ese dataset usa.
    const target = index.get(Number(row["nutrient_id"]));
    if (target === undefined) return;
    const raw = row["amount"] ?? "";
    if (raw.trim() === "") return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;

    let bucket = best.get(fdcId);
    if (bucket === undefined) {
      bucket = new Map();
      best.set(fdcId, bucket);
    }
    const current = bucket.get(target.key);
    if (current === undefined || target.rank < current.rank) {
      bucket.set(target.key, { value, rank: target.rank });
    }
  });

  const out = new Map<number, NutrientBundle>();
  for (const [fdcId, bucket] of best) {
    const bundle: NutrientBundle = {};
    for (const [key, hit] of bucket) bundle[key] = hit.value;
    out.set(fdcId, bundle);
  }
  return out;
}

/** `measure_unit.csv` traduce el id de unidad a su nombre ("cup", "tablespoon"). */
async function readMeasureUnits(csvDir: string): Promise<Map<string, string>> {
  const path = join(csvDir, "measure_unit.csv");
  const out = new Map<string, string>();
  if (!existsSync(path)) return out;
  for (const row of await readCsvAll(path)) {
    const name = (row["name"] ?? "").trim();
    // 9999 = "undetermined": la unidad viene en texto libre, no como catálogo.
    if (name !== "" && name !== "undetermined") out.set(row["id"] ?? "", name);
  }
  return out;
}

/** Formatea un número sin ceros de más: "1", "0.5", "2.5". */
function formatAmount(raw: string): string {
  const value = Number(raw);
  return Number.isFinite(value) ? String(value) : raw.trim();
}

/**
 * Arma la etiqueta en inglés de una porción.
 *
 * FNDDS trae la porción escrita ("1 cup", "Quantity not specified") en
 * `portion_description`. SR Legacy deja ese campo vacío y pone la unidad en
 * `modifier` con la cantidad aparte ("1" + "tbsp"). Ninguna de las dos usa el
 * catálogo de unidades en los alimentos seleccionados, pero se contempla.
 */
function portionLabel(
  row: Record<string, string>,
  units: Map<string, string>,
  grams: number,
): string {
  const description = (row["portion_description"] ?? "").trim();
  if (description !== "") return description;

  const parts: string[] = [];
  const amount = (row["amount"] ?? "").trim();
  if (amount !== "") parts.push(formatAmount(amount));
  const unit = units.get((row["measure_unit_id"] ?? "").trim());
  if (unit !== undefined) parts.push(unit);
  const modifier = (row["modifier"] ?? "").trim();
  // En FNDDS el modifier es un código numérico interno, no una unidad.
  if (modifier !== "" && !/^\d+$/.test(modifier)) parts.push(modifier);

  const label = parts.join(" ").trim();
  return label === "" ? `${grams} g` : label;
}

/**
 * Lee `food_portion.csv`. Conserva el orden de USDA (`seq_num`) y descarta
 * duplicados exactos: dos filas con la misma etiqueta y el mismo peso no son
 * dos porciones.
 */
export async function readPortions(
  csvDir: string,
  ids: ReadonlySet<number>,
): Promise<Map<number, PortionHint[]>> {
  const units = await readMeasureUnits(csvDir);
  const rows = new Map<number, { seq: number; order: number; hint: PortionHint }[]>();
  let order = 0;

  await readCsv(join(csvDir, "food_portion.csv"), (row) => {
    const fdcId = Number(row["fdc_id"]);
    if (!ids.has(fdcId)) return;
    const grams = Number(row["gram_weight"]);
    if (!Number.isFinite(grams) || grams <= 0) return;
    const seq = Number(row["seq_num"]);
    order += 1;
    const list = rows.get(fdcId) ?? [];
    list.push({
      seq: Number.isFinite(seq) ? seq : Number.MAX_SAFE_INTEGER,
      order,
      // `label_es` nace en null a propósito: USDA es monolingüe y el build no
      // traduce. El español lo pone la curación, en `canonical.ts`.
      hint: { grams, label_en: portionLabel(row, units, grams), label_es: null },
    });
    rows.set(fdcId, list);
  });

  const out = new Map<number, PortionHint[]>();
  for (const [fdcId, list] of rows) {
    list.sort((a, b) => (a.seq === b.seq ? a.order - b.order : a.seq - b.seq));
    const seen = new Set<string>();
    const hints: PortionHint[] = [];
    for (const item of list) {
      const key = `${item.hint.label_en}|${item.hint.grams}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hints.push(item.hint);
    }
    out.set(fdcId, hints);
  }
  return out;
}
