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

import type { Curation, GuardaVocabulario, ManualFood, Recipe } from "./curation";
import { caveatDeSodio, esGenerico, type GenericRule } from "./genericos";
import { derivarReceta, type ResolvedIngredient } from "./transforms";
import { OPTIONAL_KEYS, REQUIRED_KEYS, type NutrientBundle } from "./nutrients";
import { groupOverrides, toSourceId, type Selection } from "./selection";
import { aliasConfidence, aliasText } from "./types";
import type {
  Alias,
  CanonicalFood,
  Catalog,
  ManualProvenance,
  Per100g,
  PortionHint,
  Provenance,
  SourceId,
  UsdaFoodSource,
} from "./types";

/** Qué clave del catálogo alimenta cada nutriente, y en qué orden se escribe. */
const PER_100G_ORDER = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];

export interface AssembleInput {
  selection: Selection;
  sourceIds: SourceId[];
  descriptions: Record<UsdaFoodSource, Map<number, string>>;
  nutrients: Record<UsdaFoodSource, Map<number, NutrientBundle>>;
  portions: Record<UsdaFoodSource, Map<number, PortionHint[]>>;
  /** Nutrientes de los alimentos de Foundation que pisan valores puntuales. */
  foundationNutrients: Map<number, NutrientBundle>;
  curation: Curation;
  /** Nombres que heredan las fichas que quedan tras las exclusiones de la DT-7. */
  inheritedAliases?: Map<number, string[]>;
  /** Nombres ANTERIORES de las fichas que la DT-7 renombró, por id. */
  dt7OldNames?: Map<string, string>;
}

export interface BuildStats {
  foods: number;
  bySource: Record<UsdaFoodSource, number>;
  /** Alimentos con los cuatro macros + kcal resueltos, por fuente. */
  resolvedBySource: Record<UsdaFoodSource, number>;
  /** Cobertura de los campos extendidos (fibra, saturadas, azúcares, sodio). */
  coverage: Record<string, number>;
  /** Alimentos que la selección pidió y no se pudieron resolver: rompen el build. */
  unresolved: { fdc_id: number; source: UsdaFoodSource; description: string; missing: string[] }[];
  /** Overrides de Foundation aplicados, campo por campo. */
  overridesByField: Record<string, number>;
  overridesFoods: number;
  /** Alimentos con más de un candidato de Foundation y cuál ganó. */
  overrideCollisions: { fdc_id: number; candidates: number[]; winner: number }[];
  /** Alimentos sin `names.es`: la lista de pendientes para la curación. */
  pendingCuration: { fdc_id: number; source: UsdaFoodSource; description: string }[];
  curatedNames: number;
  curatedAliases: number;
  /** Aliases regionales con confianza aplicados (card 1.6). */
  regionalAliases: number;
  /** Aliases heredados de una ficha excluida por la DT-7. */
  inheritedAliases: number;
  /**
   * Aliases de confianza 1,0 que resucitan el nombre viejo de una ficha que la
   * DT-7 renombró. Rompen el build: el nombre entraría por la ventana.
   */
  staleAliases: { id: string; alias: string; renombrada: string }[];
  /**
   * Aliases regionales apuntando a un fdc_id que NO está en la selección.
   * Rompen el build: un alias huérfano no falla, simplemente NUNCA matchea, y
   * ese silencio es el mismo del que nos defiende el candado por fuente.
   */
  orphanRegionalAliases: number[];
  /** Fichas marcadas `generic: true` por la política DT-13. */
  genericFoods: number;
  /** Fichas genéricas que además se llevaron el caveat de sodio (DT-13). */
  genericCaveats: number;
  /**
   * Guardas de vocabulario violadas. Rompen el build: un término que nombra a la
   * ficha equivocada manda al usuario a otro alimento, sin decir nada.
   */
  guardViolations: { id: string; termino: string; donde: string; motivo: string }[];
  /** Alimentos que entraron enteros por curación manual. */
  manualFoods: number;
  /** Alimentos derivados de una receta compuesta (card 1.7). */
  recipeFoods: number;
  /** Recetas que no se pudieron derivar, con el motivo. Rompen el build. */
  recipeFailures: { id: string; motivo: string }[];
  /** Alimentos de USDA cuyos valores pisó una entrada manual, campo a campo. */
  manualOverridesByField: Record<string, number>;
  manualOverrideFoods: number;
  /** Alimentos cuya porción por defecto la corrigió la curación. */
  curatedPortions: number;
  /** Porciones que recibieron su etiqueta en español desde la curación. */
  curatedPortionLabels: number;
  /** Porciones que la curación AGREGÓ a las de USDA (card 6.2: la barra española). */
  curatedPortionHints: number;
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
 * unitario, una regresión acá pasaría todos los candados en verde.
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
    regionalAliases: 0,
    inheritedAliases: 0,
    staleAliases: [],
    orphanRegionalAliases: [],
    genericFoods: 0,
    genericCaveats: 0,
    guardViolations: [],
    manualFoods: 0,
    recipeFoods: 0,
    recipeFailures: [],
    manualOverridesByField: {},
    manualOverrideFoods: 0,
    curatedPortions: 0,
    curatedPortionLabels: 0,
    curatedPortionHints: 0,
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
    // Los aliases en texto plano de `names.es.json` valen confianza 1,0 y no se
    // tocan; detrás van los regionales, que declaran la suya. Aditivo: sumar la
    // card 1.6 no reescribió ni uno de los 609 aliases que ya estaban.
    const regional = curation.regionalAliases.get(entry.fdc_id) ?? [];
    // El nombre que perdió una ficha excluida por la DT-7 vale confianza 1,0:
    // no es un gemelo, es el mismo alimento con otro nombre.
    const heredados = input.inheritedAliases?.get(entry.fdc_id) ?? [];
    const aliases: Alias[] = [...(curated?.aliases ?? []), ...heredados, ...regional];
    stats.regionalAliases += regional.length;
    stats.inheritedAliases += heredados.length;
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
      stats.curatedAliases += curated?.aliases.length ?? 0;
    }

    // --- Porciones ----------------------------------------------------------
    const usdaHints = input.portions[source].get(entry.fdc_id) ?? [];
    // Copia: las porciones de USDA se leen una vez y el español se escribe
    // arriba de la copia, nunca del dato leído.
    const hints = usdaHints.map((hint) => ({ ...hint }));
    if (usdaHints.length === 0) stats.foodsWithoutPortions.push(entry.fdc_id);
    else provenance["portion_hints"] = source;

    const curatedPortion = curation.portions.get(entry.fdc_id);

    // Porciones que la curación AGREGA (card 6.2): la caña, el tubo, el tercio.
    // Van DETRÁS de las de USDA y no pisan ninguna — el orden de las de la
    // fuente no se toca. Se saltea la que ya exista con los mismos gramos y la
    // misma etiqueta en inglés: eso no es una porción nueva, es la misma.
    for (const hint of curatedPortion?.portion_hints ?? []) {
      if (hints.some((h) => h.grams === hint.grams && h.label_en === hint.label_en)) continue;
      hints.push({ ...hint });
      if (provenance["portion_hints"] === undefined) provenance["portion_hints"] = "curation";
      provenance["portion_hints.label_es"] = "curation";
      stats.curatedPortionHints += 1;
    }

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

  // Ningún alias de confianza 1,0 puede ser el nombre ANTERIOR de una ficha que la
  // DT-7 renombró por mentir sobre su composición. Renombrar la ficha y dejarle el
  // nombre viejo de alias no arregla nada: el usuario cae en el mismo lugar.
  const viejos = new Map<string, string>();
  for (const [id, nombre] of input.dt7OldNames ?? []) viejos.set(plano(nombre), id);
  for (const food of foods) {
    for (const alias of food.aliases.es) {
      if (aliasConfidence(alias) !== 1) continue;
      const renombrada = viejos.get(plano(aliasText(alias)));
      if (renombrada === undefined) continue;
      stats.staleAliases.push({ id: food.id, alias: aliasText(alias), renombrada });
    }
  }

  // Un alias regional que apunta afuera de la selección no explota: no matchea
  // nunca. Igual que con el mapeo de FNDDS vacío, el silencio es el problema.
  const enSeleccion = new Set(selection.entries.map((e) => e.fdc_id));
  for (const fdcId of curation.regionalAliases.keys()) {
    if (!enSeleccion.has(fdcId)) stats.orphanRegionalAliases.push(fdcId);
  }
  stats.orphanRegionalAliases.sort((a, b) => a - b);

  // --- Curación manual: la precedencia más alta del pipeline ----------------
  // Va DESPUÉS de USDA y de Foundation a propósito: el orden del código es el
  // orden declarado en sources.json (SR < Foundation < FNDDS < curación manual)
  // y quien lea esta función lo ve en el orden en que pasa.
  applyManualFoods(foods, curation.manualFoods, stats, alcohol);

  // --- Recetas compuestas: el catálogo se compone a sí mismo -----------------
  // Va al final porque una receta puede apuntar a una ficha manual (o a otra que
  // acaba de entrar): los ingredientes tienen que estar todos resueltos antes.
  applyRecipes(foods, curation, stats);

  // --- La política de genéricos (DT-13) --------------------------------------
  // Al final del todo, sobre los valores DEFINITIVOS: el sodio con el que se
  // decide el caveat es el que sale al catálogo, no el que traía el CSV antes de
  // que Foundation o la curación manual lo pisaran.
  applyGenericRule(foods, curation.genericRule, stats);

  // Las guardas se leen sobre el catálogo ya armado, por lo mismo: un alias
  // heredado de una exclusión o agregado por una entrada manual también tiene
  // que pasar por acá.
  checkVocabularyGuards(foods, curation.guardas, stats);

  // Orden estable: por id, comparado como texto (el id es el que viaja a
  // Firestore, así que el orden del archivo es el orden del catálogo).
  foods.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  stats.foods = foods.length;

  const generatedFrom = {
    selection: selection.criteria_version,
    sources: input.sourceIds,
  };
  // 3.0.0 con la card 2.DT (las decisiones DT-8 y DT-13 de Tomás).
  //
  // El 2.0.0 lo justificó la DT-7: retiró ocho alimentos del catálogo y renombró
  // veintiuno, y un menor promete que lo que estaba sigue estando. La 2.1.0 fue
  // MENOR porque lo suyo era aditivo —seis renombres de la misma ola y la fuente
  // `receta`, con su clave nueva y opcional— y porque el 2.0.0 nunca se había
  // publicado: no había consumidor al que romperle nada.
  //
  // Este es un MAYOR y por el motivo contrario en los dos frentes. La DT-8 fusiona
  // tres pares de fichas idénticas y por lo tanto RETIRA tres alimentos
  // (fdc-169768, fdc-2707348 y fdc-2709517), que es exactamente lo que el 2.0.0
  // declaró como cambio mayor; y esta vez la versión anterior SÍ está publicada en
  // Firestore, así que hay ids que un consumidor ya leyó. El seed los marcará
  // `deprecated` y no los borra —la regla 6 del proyecto—, pero quien tenga uno de
  // esos ids guardado deja de encontrar una ficha viva: eso es romper una promesa,
  // y se anuncia con el número.
  //
  // Lo de la DT-13, en cambio, es aditivo y no habría movido el mayor solo: la
  // clave `generic` es nueva y opcional, y los caveats generados usan una clave
  // que el contrato ya tenía.
  //
  // 3.1.0 con la card 2.7 (la curación quirúrgica que abrió el golden set de 30).
  //
  // Es MENOR y no mayor porque no se retira ni una ficha: las 1.022 siguen, con
  // sus ids intactos, y ningún consumidor que haya guardado un `food_id` deja de
  // encontrarlo. Lo que cambia es VOCABULARIO —tres aliases que apuntaban a otra
  // familia de alimento y dos que faltaban— y eso no rompe el contrato con el
  // seed. No es un parche: sube el número porque un catálogo que dice cosas
  // distintas es un catálogo distinto, y el `config/app` de Firestore estampa
  // esta versión para poder decir con qué vocabulario se calculó cada reporte.
  //
  // 3.2.0 con la card 6.2 (el lote de fichas de la DT-27).
  //
  // Es MENOR y no mayor por la misma razón que la 3.1.0, y por una más: es
  // puramente ADITIVO. Entran catorce alimentos de USDA que ya estaban en los
  // datasets declarados —tres cervezas, dos vinos, un destilado, limón, arepa,
  // tortilla de maíz, tres pechugas de pollo, pan de pita y alubias en salsa de
  // tomate—, no sale ninguna ficha, no cambia ningún id y ningún consumidor que
  // haya guardado un `food_id` deja de encontrarlo. La única extensión del
  // contrato de curación (`portion_hints` en portions.overrides.json) también es
  // aditiva y no cambia la FORMA del catálogo: produce más entradas en
  // `portion_hints`, que es una lista que ya existía.
  //
  // Sube el número y no se queda en parche por el mismo motivo de siempre: un
  // catálogo con catorce alimentos más es un catálogo distinto, y el `config/app`
  // de Firestore estampa esta versión para poder decir contra qué se calculó
  // cada reporte.
  //
  // 3.3.0 con la card 6.3 (el censo de cobertura mediterránea y su curación).
  //
  // Es MENOR por el precedente exacto de la 3.1.0, que es la otra versión de
  // vocabulario puro: no entra ni sale ninguna ficha, no cambia ningún id, las
  // 1.036 siguen. Lo que cambia son DIECIOCHO aliases con confianza, OCHO en texto
  // plano y DIEZ guardas nuevas, todos salidos de medir los 141 platos de las
  // dos fuentes de referencia del mercado español contra el motor real
  // (`kb/cobertura/`). Sube el número —y no se queda en parche— por el mismo
  // motivo que la 3.1.0: un catálogo que dice cosas distintas es un catálogo
  // distinto, y `config/app` estampa esta versión para poder decir con qué
  // vocabulario se calculó cada reporte.
  //
  // 3.4.0 con la card 6.4 (las fichas que faltaban del censo mediterráneo).
  //
  // Es MENOR y no MAYOR aunque entren 76 alimentos, por el mismo motivo que la
  // 3.2.0: el cambio es ADITIVO en el sentido fuerte. Entran 33 fichas de USDA
  // promovidas desde los datasets crudos (kb/selection/dt33.v1.json) y 43 fichas
  // derivadas por receta compuesta (kb/curation/recipes.foods.json); NO sale
  // ninguna, NO cambia ningún id y NO cambia ni un número de las 1.036 que ya
  // estaban — verificado por diff en la card. Un `food_id` guardado por un
  // consumidor sigue encontrando exactamente lo mismo.
  //
  // Sube el menor y no se queda en parche porque un catálogo con 1.112 alimentos
  // —y con salmón, mejillón, pasta cocida y cuarenta y tres platos españoles que
  // antes no existían— es un catálogo distinto, y `config/app` estampa esta
  // versión para poder decir contra qué se calculó cada reporte.
  //
  // 3.5.0 con la card 6.4b (los dos platos que la 6.4 dejó bloqueados por
  // rendimiento).
  //
  // Es MENOR y no PARCHE aunque entren solo DOS fichas, y el motivo no es el
  // conteo: cambia la TABLA DE TRANSFORMACIONES, que es la que deriva todas las
  // recetas. Entra `cocido_cebolla` (0,850), el primer rendimiento de hortaliza
  // medido del proyecto, y con él la ficha `receta-calcots`; entra también
  // `manual-salsa-de-calcots` desde una etiqueta comercial verificada. Un
  // catálogo que sabe cocinar una cebolla —y que por lo tanto puede recalcular
  // recetas futuras con ese factor— no es el mismo catálogo, y `config/app`
  // estampa esta versión para poder decir contra qué se calculó cada reporte.
  //
  // Sigue siendo ADITIVO en el sentido fuerte: NO sale ninguna ficha, NO cambia
  // ningún id y NO cambia ni un número de las 1.112 que ya estaban — ninguna
  // receta preexistente usa el método nuevo. El torrezno de Soria NO entra, y su
  // motivo medido está en recipes.foods.json: el rendimiento existe (0,403) y
  // precisamente por eso no se puede usar, porque lo que sale de un torrezno no
  // es solo agua sino grasa, y un `factor_peso` no sabe restarla.
  //
  // 3.6.0 con la card 6.4c (el torrezno, que la 6.4b dejó bloqueado, entra por
  // OTRA PUERTA).
  //
  // Es MENOR y no PARCHE aunque entre UNA sola ficha, y otra vez el motivo no es
  // el conteo: `manual-torrezno-de-soria` cierra el ÚLTIMO bloqueo del censo que
  // no era de especie. De los cinco platos que la card 6.4 dejó sin ficha quedan
  // TRES, y los tres son el mismo caso —besugo, perdiz y halloumi, alimentos que
  // USDA no mide y que esperan la pasada de BEDCA—, así que el catálogo pasa de
  // tener huecos de dos naturalezas a tener una sola. Un catálogo cuya lista de
  // pendientes cambió de forma no es el mismo catálogo, y `config/app` estampa
  // esta versión para poder decir contra qué se calculó cada reporte.
  //
  // NO cambia el modelo: la DT-36 sigue abierta y `transforms.ts` sigue sin
  // saber restar la grasa que sale de la pieza. El torrezno entra por una
  // ETIQUETA COMERCIAL verificada campo a campo (Hacendado 8480000334169,
  // Atwater al 0,69 %), que es la misma puerta por la que entró la salsa de
  // calçots en la 6.4b. El rendimiento medido 0,403 sigue FUERA de la tabla de
  // transformaciones y `card64b.test.ts` lo sigue vigilando.
  //
  // Sigue siendo ADITIVO en el sentido fuerte: NO sale ninguna ficha, NO cambia
  // ningún id y NO cambia ni un número de las 1.114 que ya estaban.
  const kbVersion = `3.6.0+${contentHash({ generated_from: generatedFrom, foods })}`;

  return {
    catalog: { kb_version: kbVersion, generated_from: generatedFrom, foods },
    stats,
    alcohol,
  };
}

/**
 * Mezcla los alimentos de curación manual con precedencia máxima.
 *
 * Dos caminos, una sola puerta:
 *  - el `id` coincide con un alimento del catálogo ⇒ PISA sus valores campo a
 *    campo (los que la entrada declara; un `null` es "la fuente no lo dice" y
 *    no toca nada). Nombre y porciones se dejan como estaban: vinieron de USDA
 *    y la entrada manual está corrigiendo NÚMEROS, no vocabulario.
 *  - el `id` no coincide con nadie ⇒ entra como un alimento nuevo, con su
 *    fuente propia (`manual`) y todo su provenance apuntando al origen que
 *    declaró (`manual/etiqueta-comercial`).
 *
 * Los candados se aplican igual: un alimento manual cuyas calorías no cierran
 * con sus propios macros rompe el build como cualquier otro. Que el dato lo
 * haya escrito una persona no lo exime de ser coherente.
 */
export function applyManualFoods(
  foods: CanonicalFood[],
  manualFoods: ManualFood[],
  stats: BuildStats,
  alcohol: Map<string, number>,
): void {
  const byId = new Map(foods.map((food) => [food.id, food]));

  for (const manual of manualFoods) {
    const origin: ManualProvenance = `manual/${manual.origen}`;
    const existing = byId.get(manual.id);

    if (existing !== undefined) {
      let touched = false;
      for (const key of PER_100G_ORDER) {
        const value = manual.per_100g[key];
        if (value === null || value === undefined) continue;
        existing.per_100g[key] = value;
        existing.provenance[`per_100g.${key}`] = origin;
        stats.manualOverridesByField[key] = (stats.manualOverridesByField[key] ?? 0) + 1;
        touched = true;
      }
      if (manual.aliases.length > 0) {
        existing.aliases.es = [...existing.aliases.es, ...manual.aliases];
        existing.provenance["aliases.es"] = "curation";
      }
      if (manual.caveats.length > 0) existing.caveats = [...manual.caveats];
      existing.provenance = sortKeys(existing.provenance);
      if (touched) stats.manualOverrideFoods += 1;
      continue;
    }

    const provenance: Record<string, Provenance> = {
      "names.en": origin,
      "names.es": origin,
      category: origin,
      default_portion_g: origin,
      portion_hints: origin,
    };
    for (const key of PER_100G_ORDER) {
      if (manual.per_100g[key] !== null) provenance[`per_100g.${key}`] = origin;
    }
    if (manual.aliases.length > 0) provenance["aliases.es"] = origin;

    const food: CanonicalFood = {
      id: manual.id,
      source: "manual",
      source_ref: manual.source_ref,
      names: { en: manual.name_en, es: manual.name_es },
      aliases: { es: [...manual.aliases] },
      category: manual.category,
      per_100g: { ...manual.per_100g },
      portion_hints: manual.portion_hints.map((hint) => ({ ...hint })),
      default_portion_g: manual.default_portion_g,
      provenance: sortKeys(provenance),
      deprecated: false,
    };
    if (manual.caveats.length > 0) food.caveats = [...manual.caveats];
    foods.push(food);
    byId.set(food.id, food);
    stats.manualFoods += 1;
    // Sin alcohol declarado: el predictor de Atwater lo toma como 0, que es
    // lo que corresponde para un alimento que no lo mide.
    alcohol.delete(food.id);
  }
}

/**
 * Deriva los alimentos declarados como receta compuesta (card 1.7).
 *
 * El build no acepta ni un número nutricional escrito a mano acá: cada valor sale
 * de las fichas que la receta referencia, con la aritmética pura de
 * `transforms.ts`. Lo que la receta declara es de QUÉ está hecho el plato; lo que
 * vale, lo calcula el pipeline. Por eso una receta se puede auditar rehaciendo la
 * cuenta, y por eso `receta` viaja al catálogo con los ingredientes y los gramos.
 *
 * Una receta que no se puede derivar NO se salta en silencio: se anota en
 * `recipeFailures` y el candado de esquema rompe el build. Un plato que se
 * publica con los valores de ayer porque hoy su ingrediente desapareció es
 * exactamente el fallo silencioso del que nos defiende todo el resto.
 */
export function applyRecipes(foods: CanonicalFood[], curation: Curation, stats: BuildStats): void {
  const byId = new Map(foods.map((food) => [food.id, food]));

  for (const recipe of curation.recipes) {
    const fallo = (motivo: string): void => {
      stats.recipeFailures.push({ id: recipe.id, motivo });
    };
    if (byId.has(recipe.id)) {
      fallo(`el id ya existe en el catálogo`);
      continue;
    }
    const transform = curation.transforms.get(recipe.metodo);
    if (transform === undefined) {
      fallo(`el método "${recipe.metodo}" no está declarado en cooking.transforms.json`);
      continue;
    }

    const ingredientes: ResolvedIngredient[] = [];
    let roto = false;
    for (const item of recipe.ingredientes) {
      const ficha = byId.get(item.ref);
      if (ficha === undefined) {
        fallo(`el ingrediente ${item.ref} no está en el catálogo`);
        roto = true;
        break;
      }
      if (ficha.deprecated) {
        fallo(`el ingrediente ${item.ref} está deprecado`);
        roto = true;
        break;
      }
      ingredientes.push({ ref: item.ref, grams: item.grams, per_100g: ficha.per_100g });
    }
    if (roto) continue;

    let aceite = null;
    if (transform.aceite_absorbido_pct > 0) {
      const ficha = transform.aceite_ref === null ? undefined : byId.get(transform.aceite_ref);
      if (ficha === undefined) {
        fallo(`el aceite del método "${recipe.metodo}" (${String(transform.aceite_ref)}) no está en el catálogo`);
        continue;
      }
      aceite = ficha.per_100g;
    }

    let derivada;
    try {
      derivada = derivarReceta({
        ingredientes,
        transform,
        aceite,
        rendimiento_declarado: recipe.rendimiento_declarado_g,
      });
    } catch (error) {
      fallo((error as Error).message);
      continue;
    }

    const provenance: Record<string, Provenance> = {
      "names.en": "curation",
      "names.es": "curation",
      category: "curation",
      default_portion_g: "curation",
      portion_hints: "curation",
    };
    for (const key of PER_100G_ORDER) {
      if (derivada.per_100g[key] !== null) provenance[`per_100g.${key}`] = "receta";
    }
    if (recipe.aliases.length > 0) provenance["aliases.es"] = "curation";

    const food: CanonicalFood = {
      id: recipe.id,
      source: "receta",
      source_ref: `Receta compuesta — ${recipe.ingredientes.length} ingredientes, método ${recipe.metodo}`,
      names: { en: recipe.name_en, es: recipe.name_es },
      aliases: { es: [...recipe.aliases] },
      category: recipe.category,
      per_100g: { ...derivada.per_100g },
      portion_hints: recipe.portion_hints.map((hint) => ({ ...hint })),
      default_portion_g: recipe.default_portion_g,
      provenance: sortKeys(provenance),
      deprecated: false,
      caveats: [...recipe.caveats],
      receta: {
        metodo: recipe.metodo,
        ingredientes: recipe.ingredientes.map((i) => ({ ref: i.ref, grams: i.grams })),
        peso_entrada_g: derivada.peso_entrada_g,
        aceite_absorbido_g: derivada.aceite_absorbido_g,
        peso_final_g: derivada.peso_final_g,
        rendimiento_de: derivada.rendimiento_de,
      },
    };
    foods.push(food);
    byId.set(food.id, food);
    stats.recipeFoods += 1;
  }
}

/**
 * Aplica la política de genéricos (DT-13) sobre el catálogo ya armado.
 *
 * Dos salidas, una sola regla declarada en `curation/genericos.dt13.json`:
 *  - `generic: true` en toda ficha de USDA cuyo inglés traiga un marcador;
 *  - un caveat con el sodio de la propia ficha, cuando pasa el umbral.
 *
 * Solo alcanza a los alimentos de USDA a propósito. Un alimento manual o una
 * receta no promedian ninguna familia: los escribió o los derivó la curación
 * para un plato concreto, y su reserva ya está escrita a mano en sus caveats.
 *
 * El caveat generado se AGREGA: si la ficha ya traía caveats, no se pisa ni uno.
 */
export function applyGenericRule(
  foods: CanonicalFood[],
  rule: GenericRule | null,
  stats: BuildStats,
): void {
  if (rule === null) return;
  for (const food of foods) {
    if (food.source !== "usda_fndds" && food.source !== "usda_sr_legacy") continue;
    if (!esGenerico(food.names.en, rule.marcadores_en)) continue;

    food.generic = true;
    food.provenance = sortKeys({ ...food.provenance, generic: "curation" });
    stats.genericFoods += 1;

    const caveat = caveatDeSodio(food.per_100g.sodium_mg, rule);
    if (caveat === null) continue;
    food.caveats = [...(food.caveats ?? []), caveat];
    food.provenance = sortKeys({ ...food.provenance, caveats: "curation" });
    stats.genericCaveats += 1;
  }
}

/**
 * Hace cumplir las guardas de vocabulario sobre el catálogo ya armado.
 *
 * Es el hermano del candado del nombre viejo: aquel impide que un nombre ya
 * corregido vuelva de alias, este impide que un término caiga en la ficha
 * equivocada aunque nadie lo haya escrito todavía. Igualdad exacta sobre el
 * término normalizado, y no subcadena: `Bife de chorizo` contiene `chorizo` y
 * está bien; lo prohibido es la ficha llamándose `Chorizo` a secas.
 *
 * La confianza no salva: un `chorizo` a 0,5 sobre un corte vacuno no dice "esto
 * se parece", dice "esto es otra cosa". Para eso está el rechazo, no la escala.
 */
export function checkVocabularyGuards(
  foods: CanonicalFood[],
  guardas: GuardaVocabulario[],
  stats: BuildStats,
): void {
  if (guardas.length === 0) return;
  const byId = new Map(foods.map((food) => [food.id, food]));

  for (const guarda of guardas) {
    const termino = plano(guarda.termino);
    for (const id of guarda.prohibido_en) {
      const food = byId.get(id);
      // Una guarda que apunta a una ficha que no existe no falla: simplemente no
      // guarda nada. Es el mismo silencio del alias huérfano, y se trata igual.
      if (food === undefined) {
        stats.guardViolations.push({
          id,
          termino: guarda.termino,
          donde: "la ficha no está en el catálogo: la guarda no guarda nada",
          motivo: guarda.motivo,
        });
        continue;
      }
      if (food.names.es !== null && plano(food.names.es) === termino) {
        stats.guardViolations.push({
          id,
          termino: guarda.termino,
          donde: `names.es = "${food.names.es}"`,
          motivo: guarda.motivo,
        });
      }
      for (const alias of food.aliases.es) {
        if (plano(aliasText(alias)) !== termino) continue;
        stats.guardViolations.push({
          id,
          termino: guarda.termino,
          donde: `alias "${aliasText(alias)}" con confianza ${aliasConfidence(alias)}`,
          motivo: guarda.motivo,
        });
      }
    }
  }
}

/** Sin tildes y en minúsculas: dos formas del mismo nombre no pueden escaparse. */
function plano(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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
