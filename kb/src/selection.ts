/**
 * Lectura de `kb/selection/selection.v1.json` — la salida de la card 1.1.
 *
 * La selección ya decidió el reparto de territorios (FNDDS gobierna los platos
 * como se comen, SR Legacy los ingredientes crudos) y ya filtró por Atwater.
 * El build no vuelve a decidir qué entra: toma la lista y la compila.
 */
import { readFileSync } from "node:fs";

import { SELECTION_FILE } from "./sources";
import type { FoodSource } from "./types";

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
export function toSourceId(source: SelectionSource): FoodSource {
  return source === "fndds" ? "usda_fndds" : "usda_sr_legacy";
}

export function loadSelection(): Selection {
  const selection = JSON.parse(readFileSync(SELECTION_FILE, "utf8")) as Selection;
  if (!Array.isArray(selection.entries) || selection.entries.length === 0) {
    throw new Error("La selección no trae entradas: no hay nada que compilar.");
  }
  return selection;
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
