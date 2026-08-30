/**
 * Capa 2 del pipeline: el armado del modelo canónico.
 *
 * Determinístico por construcción: los alimentos salen ordenados por `id`, las
 * claves se escriben siempre en el mismo orden y el build no consulta el reloj
 * ni el azar. Mismo input ⇒ mismo archivo, byte a byte. La versión del
 * catálogo es un hash de su propio contenido: si el archivo cambió, la versión
 * cambió, y no hay forma de que un seed publique algo que dice ser otra cosa.
 */
import { createHash } from "node:crypto";

import type { Curation } from "./curation";
import { OPTIONAL_KEYS, REQUIRED_KEYS, type NutrientBundle, type NutrientKey } from "./nutrients";
import { groupOverrides, toSourceId, type Selection } from "./selection";
import type {
  CanonicalFood,
  Catalog,
  FoodSource,
  Per100g,
  PortionHint,
  Provenance,
  SourceId,
} from "./types";

/** Qué clave del catálogo alimenta cada nutriente, y en qué orden se escribe. */
const PER_100G_ORDER: NutrientKey[] = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];

export interface AssembleInput {
  selection: Selection;
  sourceIds: SourceId[];
  descriptions: Record<FoodSource, Map<number, string>>;
  nutrients: Record<FoodSource, Map<number, NutrientBundle>>;
  portions: Record<FoodSource, Map<number, PortionHint[]>>;
  /** Nutrientes de los alimentos de Foundation que pisan valores puntuales. */
  foundationNutrients: Map<number, NutrientBundle>;
  curation: Curation;
}

export interface BuildStats {
  foods: number;
  bySource: Record<FoodSource, number>;
  /** Alimentos con los cuatro macros + kcal resueltos, por fuente. */
  resolvedBySource: Record<FoodSource, number>;
  /** Cobertura de los campos extendidos (fibra, saturadas, azúcares, sodio). */
  coverage: Record<string, number>;
  /** Alimentos que la selección pidió y no se pudieron resolver: rompen el build. */
  unresolved: { fdc_id: number; source: FoodSource; description: string; missing: string[] }[];
  /** Overrides de Foundation aplicados, campo por campo. */
  overridesByField: Record<string, number>;
  overridesFoods: number;
  /** Alimentos con más de un candidato de Foundation y cuál ganó. */
  overrideCollisions: { fdc_id: number; candidates: number[]; winner: number }[];
  /** Alimentos sin `names.es`: la lista de pendientes para la curación. */
  pendingCuration: { fdc_id: number; source: FoodSource; description: string }[];
  curatedNames: number;
  curatedAliases: number;
  /** Alimentos cuya porción por defecto la corrigió la curación. */
  curatedPortions: number;
  /** Porciones que recibieron su etiqueta en español desde la curación. */
  curatedPortionLabels: number;
  /** Porciones que la selección marcó para revisar a mano. */
  portionNeedsReview: number[];
  /** La descripción de la selección no coincide con la de `food.csv`. */
  descriptionMismatches: { fdc_id: number; selection: string; usda: string }[];
  foodsWithoutPortions: number[];
}

export interface AssembleResult {
  catalog: Catalog;
  stats: BuildStats;
  /** Alcohol por alimento (g/100 g): no va al catálogo, lo usa el candado de Atwater. */
  alcohol: Map<string, number>;
}

/**
 * Elige el alimento de Foundation que pisa: más campos resueltos y, a igualdad,
 * el `fdc_id` más alto — que en Foundation es el análisis de laboratorio más
 * reciente, su rol declarado en `sources.json`.
 *
 * Se exporta para poder testear el desempate solo: este camino decide más de
 * doscientos valores y el candado de aceptación por fuente NO lo cubre (cuenta
 * alimentos de FNDDS y SR, y Foundation no aporta alimentos propios). Sin test
 * unitario, una regresión acá pasaría los cinco candados en verde.
 */
export function pickFoundationCandidate(
  candidates: number[],
  foundationNutrients: Map<number, NutrientBundle>,
): number | null {
  let winner: number | null = null;
  let bestScore = -1;
  for (const candidate of [...candidates].sort((a, b) => a - b)) {
    const bundle = foundationNutrients.get(candidate);
    if (bundle === undefined) continue;
    const score = PER_100G_ORDER.filter((key) => bundle[key] !== undefined).length;
    // `>=` con los candidatos en orden ascendente ⇒ a igualdad gana el fdc_id
    // más alto, que en Foundation es el análisis de laboratorio más reciente.
    if (score >= bestScore) {
      bestScore = score;
      winner = candidate;
    }
  }
  return winner;
}

export function assemble(input: AssembleInput): AssembleResult {
  const { selection, curation } = input;
  const overrides = groupOverrides(selection.foundation_overrides);

  const stats: BuildStats = {
    foods: 0,
    bySource: { usda_fndds: 0, usda_sr_legacy: 0 },
    resolvedBySource: { usda_fndds: 0, usda_sr_legacy: 0 },
    coverage: { fiber_g: 0, sat_fat_g: 0, sugars_g: 0, sodium_mg: 0 },
    unresolved: [],
    overridesByField: {},
    overridesFoods: 0,
    overrideCollisions: [],
    pendingCuration: [],
    curatedNames: 0,
    curatedAliases: 0,
    curatedPortions: 0,
    curatedPortionLabels: 0,
    portionNeedsReview: [],
    descriptionMismatches: [],
    foodsWithoutPortions: [],
  };

  const foods: CanonicalFood[] = [];
  const alcohol = new Map<string, number>();

  for (const entry of selection.entries) {
    const source = toSourceId(entry.source);
    stats.bySource[source] += 1;
    if (entry.portion_needs_review) stats.portionNeedsReview.push(entry.fdc_id);

    const base = input.nutrients[source].get(entry.fdc_id) ?? {};
    const values: NutrientBundle = { ...base };
    const provenance: Record<string, Provenance> = {};
    for (const key of PER_100G_ORDER) {
      if (values[key] !== undefined) provenance[`per_100g.${key}`] = source;
    }

    // --- Foundation pisa valores, campo a campo -----------------------------
    const candidates = (overrides.get(entry.fdc_id) ?? []).map((o) => o.fdc_id_foundation);
    if (candidates.length > 0) {
      const winner = pickFoundationCandidate(candidates, input.foundationNutrients);
      if (candidates.length > 1 && winner !== null) {
        stats.overrideCollisions.push({ fdc_id: entry.fdc_id, candidates, winner });
      }
      const better = winner === null ? undefined : input.foundationNutrients.get(winner);
      if (better !== undefined) {
        let touched = false;
        for (const key of PER_100G_ORDER) {
          const value = better[key];
          if (value === undefined) continue;
          values[key] = value;
          provenance[`per_100g.${key}`] = "usda_foundation";
          stats.overridesByField[key] = (stats.overridesByField[key] ?? 0) + 1;
          touched = true;
        }
        if (touched) stats.overridesFoods += 1;
      }
    }

    // --- Los cuatro obligatorios deciden si el alimento existe --------------
    const missing = REQUIRED_KEYS.filter((key) => {
      const value = values[key];
      return value === undefined || !Number.isFinite(value);
    });
    if (missing.length > 0) {
      stats.unresolved.push({
        fdc_id: entry.fdc_id,
        source,
        description: entry.description,
        missing,
      });
      continue;
    }
    stats.resolvedBySource[source] += 1;
    for (const key of OPTIONAL_KEYS) {
      if (values[key] !== undefined) stats.coverage[key] = (stats.coverage[key] ?? 0) + 1;
    }

    // --- Nombres: inglés de USDA, español de la curación --------------------
    const usdaDescription = input.descriptions[source].get(entry.fdc_id);
    if (usdaDescription !== undefined && usdaDescription !== entry.description) {
      stats.descriptionMismatches.push({
        fdc_id: entry.fdc_id,
        selection: entry.description,
        usda: usdaDescription,
      });
    }
    const nameEn = usdaDescription ?? entry.description;
    provenance["names.en"] = source;

    const curated = curation.names.get(entry.fdc_id);
    const nameEs = curated?.name ?? null;
    const aliases = curated?.aliases ?? [];
    if (nameEs !== null) {
      provenance["names.es"] = "curation";
      stats.curatedNames += 1;
    } else {
      stats.pendingCuration.push({
        fdc_id: entry.fdc_id,
        source,
        description: nameEn,
      });
    }
    if (aliases.length > 0) {
      provenance["aliases.es"] = "curation";
      stats.curatedAliases += aliases.length;
    }

    // --- Porciones ----------------------------------------------------------
    const usdaHints = input.portions[source].get(entry.fdc_id) ?? [];
    // Copia: las porciones de USDA se leen una vez y el español se escribe
    // arriba de la copia, nunca del dato leído.
    const hints = usdaHints.map((hint) => ({ ...hint }));
    if (usdaHints.length === 0) stats.foodsWithoutPortions.push(entry.fdc_id);
    else provenance["portion_hints"] = source;

    const curatedPortion = curation.portions.get(entry.fdc_id);
    const curatedGrams = curatedPortion?.default_portion_g ?? null;
    const defaultPortion = curatedGrams ?? entry.default_portion_g;
    if (curatedGrams !== null) stats.curatedPortions += 1;
    provenance["default_portion_g"] = curatedGrams !== null ? "curation" : source;

    // La etiqueta en español va a la porción por defecto: si esa porción ya
    // existe en USDA se le agrega el español encima; si no existe (la curación
    // nombró una medida que USDA no mide) entra como una porción más, con una
    // etiqueta en inglés neutra para no inventar vocabulario ajeno a la fuente.
    const labelEs = curatedPortion?.label_es ?? null;
    if (labelEs !== null) {
      // LÍMITE CONOCIDO: si un alimento tiene dos porciones con los mismos
      // gramos ("1 taza" y "1 vaso", ambas 244 g), el español cae en la primera
      // por `seq_num`. Hoy no molesta porque el override nombra la porción por
      // defecto y alcanza con los gramos. Si `portions.overrides.json` crece
      // hasta querer nombrar varias porciones de un mismo alimento, el destino
      // va a tener que elegirse por intención (por `label_en`, o por índice),
      // no por peso.
      const target = hints.find((hint) => hint.grams === defaultPortion);
      if (target !== undefined) {
        target.label_es = labelEs;
      } else {
        hints.push({ grams: defaultPortion, label_en: `${defaultPortion} g`, label_es: labelEs });
      }
      if (provenance["portion_hints"] === undefined) provenance["portion_hints"] = "curation";
      provenance["portion_hints.label_es"] = "curation";
      stats.curatedPortionLabels += 1;
    }
    provenance["category"] = source;

    const per100g: Per100g = {
      kcal: values.kcal as number,
      protein_g: values.protein_g as number,
      carbs_g: values.carbs_g as number,
      fat_g: values.fat_g as number,
      fiber_g: values.fiber_g ?? null,
      sat_fat_g: values.sat_fat_g ?? null,
      sugars_g: values.sugars_g ?? null,
      sodium_mg: values.sodium_mg ?? null,
    };

    const id = `fdc-${entry.fdc_id}`;
    foods.push({
      id,
      source,
      source_ref: `USDA FDC #${entry.fdc_id}`,
      names: { en: nameEn, es: nameEs },
      aliases: { es: aliases },
      category: entry.category,
      per_100g: per100g,
      portion_hints: hints,
      default_portion_g: defaultPortion,
      provenance: sortKeys(provenance),
      deprecated: false,
    });
    if (values.alcohol_g !== undefined) alcohol.set(id, values.alcohol_g);
  }

  // Orden estable: por id, comparado como texto (el id es el que viaja a
  // Firestore, así que el orden del archivo es el orden del catálogo).
  foods.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  stats.foods = foods.length;

  const generatedFrom = {
    selection: selection.criteria_version,
    sources: input.sourceIds,
  };
  const kbVersion = `1.0.0+${contentHash({ generated_from: generatedFrom, foods })}`;

  return {
    catalog: { kb_version: kbVersion, generated_from: generatedFrom, foods },
    stats,
    alcohol,
  };
}

/** Ordena las claves de un objeto: el provenance no depende del orden de armado. */
function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key] as T;
  return out;
}

/** Hash corto del contenido: la identidad del catálogo es lo que dice, nada más. */
export function contentHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 8);
}

/** Serializa el catálogo con formato estable (el archivo se commitea y se diffea). */
export function serialize(catalog: Catalog): string {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}
