/**
 * Lo que agrega la card 1.6: la promoción regional, los aliases con confianza y
 * la fuente de curación manual.
 *
 * Los escenarios se CONSTRUYEN acá, no se salen a buscar en el catálogo real:
 * un test que dependa de que el salmorejo siga llamándose salmorejo mide la
 * curación, no el código. Lo que se prueba es el camino, con el mínimo de datos
 * que hace falta para recorrerlo.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyManualFoods, assemble, type AssembleInput, type BuildStats } from "./canonical";
import { loadCuration, type Curation, type ManualFood } from "./curation";
import { lockAtwater, lockSchema, validateFood } from "./locks";
import type { NutrientBundle } from "./nutrients";
import {
  applyExclusions,
  inheritedAliases,
  mergeBlock,
  type Dt7Exclusion,
  type Dt7Exclusions,
  type Selection,
  type SelectionBlock,
  type SelectionEntry,
} from "./selection";
import {
  aliasConfidence,
  aliasText,
  type CanonicalFood,
  type PortionHint,
  type UsdaFoodSource,
} from "./types";

// --- andamios ---------------------------------------------------------------

const BANANA = 173944;
const NUTRIENTS = {
  kcal: 89,
  protein_g: 1.09,
  carbs_g: 22.84,
  fat_g: 0.33,
  fiber_g: 2.6,
  sat_fat_g: 0.112,
  sugars_g: 12.23,
  sodium_mg: 1,
};

function curation(overrides: Partial<Curation> = {}): Curation {
  return {
    names: new Map(),
    portions: new Map(),
    regionalAliases: new Map(),
    manualFoods: [],
    transforms: new Map(),
    recipes: [],
    genericRule: null,
    guardas: [],
    filesFound: [],
    problems: [],
    ...overrides,
  };
}

function entry(overrides: Partial<SelectionEntry> = {}): SelectionEntry {
  return {
    fdc_id: BANANA,
    source: "sr_legacy",
    description: "Bananas, raw",
    category: "Fruits and Fruit Juices",
    n_ingredients: null,
    n_portions: 1,
    default_portion_g: 118,
    portion_needs_review: false,
    ...overrides,
  };
}

function input(cur: Curation, entries: SelectionEntry[] = [entry()]): AssembleInput {
  const selection: Selection = {
    criteria_version: "test",
    generated: "2026-08-30",
    entries,
    foundation_overrides: [],
    flagged_atwater: [],
  };
  const empty = <T>(): Record<UsdaFoodSource, Map<number, T>> => ({
    usda_fndds: new Map<number, T>(),
    usda_sr_legacy: new Map<number, T>(),
  });
  const descriptions = empty<string>();
  const nutrients = empty<NutrientBundle>();
  const portions = empty<PortionHint[]>();
  for (const item of entries) {
    const source: UsdaFoodSource = item.source === "fndds" ? "usda_fndds" : "usda_sr_legacy";
    descriptions[source].set(item.fdc_id, item.description);
    nutrients[source].set(item.fdc_id, { ...NUTRIENTS });
    portions[source].set(item.fdc_id, [{ grams: 118, label_en: "1 medium", label_es: null }]);
  }
  return {
    selection,
    sourceIds: ["usda_sr_legacy"],
    descriptions,
    nutrients,
    portions,
    foundationNutrients: new Map(),
    curation: cur,
  };
}

function manual(overrides: Partial<ManualFood> = {}): ManualFood {
  return {
    id: "manual-salmorejo",
    origen: "etiqueta-comercial",
    source_ref: "Etiqueta comercial, foto del 30/08/2026",
    name_en: "Salmorejo",
    name_es: "Salmorejo",
    aliases: [],
    category: "Soups, broth-based",
    per_100g: {
      kcal: 83,
      protein_g: 0.8,
      carbs_g: 5.6,
      fat_g: 6.1,
      fiber_g: null,
      sat_fat_g: 0.9,
      sugars_g: 2.5,
      sodium_mg: 320,
    },
    portion_hints: [{ grams: 250, label_en: "1 bowl", label_es: "1 plato hondo" }],
    default_portion_g: 250,
    caveats: ["Los valores vienen por 100 ml, no por 100 g."],
    ...overrides,
  };
}

function emptyStats(): BuildStats {
  return {
    foods: 0,
    bySource: { usda_fndds: 0, usda_sr_legacy: 0 },
    resolvedBySource: { usda_fndds: 0, usda_sr_legacy: 0 },
    coverage: {},
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
    manualFoods: 0,
    recipeFoods: 0,
    recipeFailures: [],
    manualOverridesByField: {},
    manualOverrideFoods: 0,
    curatedPortions: 0,
    curatedPortionLabels: 0,
    curatedPortionHints: 0,
    portionNeedsReview: [],
    genericFoods: 0,
    genericCaveats: 0,
    guardViolations: [],
    descriptionMismatches: [],
    foodsWithoutPortions: [],
  };
}

/** Escribe archivos de curación en una carpeta temporal y los lee. */
function conArchivos(files: Record<string, string>, run: (cur: Curation) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "nutriscann-curacion-"));
  try {
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body, "utf8");
    run(loadCuration(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// --- Promoción regional -----------------------------------------------------

test("el bloque regional se SUMA a la selección y nombra su criterio", () => {
  const base: Selection = {
    criteria_version: "1.1-v2",
    generated: "2026-08-30",
    entries: [entry()],
    foundation_overrides: [],
    flagged_atwater: [],
  };
  const block: SelectionBlock = {
    criteria_version: "1.6-regional-v1",
    generated: "2026-08-30",
    justificacion: "cobertura regional",
    entries: [entry({ fdc_id: 174249, description: "Mollusks, octopus, common, cooked, moist heat" })],
  };
  const merged = mergeBlock(base, block);
  assert.equal(merged.entries.length, 2);
  assert.equal(merged.criteria_version, "1.1-v2 + 1.6-regional-v1");
  assert.deepEqual(base.entries.length, 1, "la selección base no se toca");
});

test("un bloque que promueve algo que ya estaba rompe el build", () => {
  const base: Selection = {
    criteria_version: "1.1-v2",
    generated: "2026-08-30",
    entries: [entry()],
    foundation_overrides: [],
    flagged_atwater: [],
  };
  const block: SelectionBlock = {
    criteria_version: "1.6-regional-v1",
    generated: "2026-08-30",
    justificacion: "cobertura regional",
    entries: [entry()],
  };
  assert.throws(() => mergeBlock(base, block), /ya estaban en la selección/);
});

// --- Aliases con confianza --------------------------------------------------

test("un alias en texto plano sigue valiendo confianza 1,0", () => {
  assert.equal(aliasText("Plátano"), "Plátano");
  assert.equal(aliasConfidence("Plátano"), 1);
  assert.equal(aliasText({ alias: "Milanesa", confidence: 0.5 }), "Milanesa");
  assert.equal(aliasConfidence({ alias: "Milanesa", confidence: 0.5 }), 0.5);
});

test("los aliases regionales se agregan DETRÁS de los que ya estaban", () => {
  const cur = curation({
    names: new Map([[BANANA, { name: "Banana", aliases: ["Plátano", "Banano"] }]]),
    regionalAliases: new Map([[BANANA, [{ alias: "Cambur", confidence: 0.6 }]]]),
  });
  const { catalog, stats } = assemble(input(cur));
  const food = catalog.foods[0];
  assert.ok(food);
  assert.deepEqual(food.aliases.es, ["Plátano", "Banano", { alias: "Cambur", confidence: 0.6 }]);
  assert.equal(stats.curatedAliases, 2, "los regionales no se cuentan como aliases de la 1.3");
  assert.equal(stats.regionalAliases, 1);
  assert.equal(food.provenance["aliases.es"], "curation");
});

test("un alimento sin aliases de la 1.3 puede recibir solo regionales", () => {
  const cur = curation({ regionalAliases: new Map([[BANANA, [{ alias: "Cambur", confidence: 0.8 }]]]) });
  const food = assemble(input(cur)).catalog.foods[0];
  assert.ok(food);
  assert.deepEqual(food.aliases.es, [{ alias: "Cambur", confidence: 0.8 }]);
});

test("el candado de esquema acepta las dos formas de alias y rechaza una confianza inventada", () => {
  const base: CanonicalFood = {
    id: "fdc-1",
    source: "usda_sr_legacy",
    source_ref: "USDA FDC #1",
    names: { en: "Test", es: "Prueba" },
    aliases: { es: ["Texto", { alias: "Gemelo", confidence: 0.6 }] },
    category: "Test",
    per_100g: {
      kcal: 100,
      protein_g: 5,
      carbs_g: 15,
      fat_g: 2,
      fiber_g: null,
      sat_fat_g: null,
      sugars_g: null,
      sodium_mg: null,
    },
    portion_hints: [{ grams: 100, label_en: "1 unit", label_es: null }],
    default_portion_g: 100,
    provenance: {},
    deprecated: false,
  };
  assert.deepEqual(validateFood(base), []);

  const inventada = { ...base, aliases: { es: [{ alias: "Gemelo", confidence: 0.73 }] } };
  assert.ok(validateFood(inventada).some((p) => p.includes("fuera de la escala declarada")));
});

test("la curación rechaza una confianza fuera de la escala y deja pasar el resto", () => {
  conArchivos(
    {
      "aliases.regional.json": JSON.stringify({
        aliases: {
          "173944": [
            { alias: "Cambur", confidence: 0.8 },
            { alias: "Guineo", confidence: 0.73 },
          ],
        },
      }),
    },
    (cur) => {
      assert.deepEqual(cur.regionalAliases.get(BANANA), [{ alias: "Cambur", confidence: 0.8 }]);
      assert.ok(cur.problems.some((p) => p.includes("Guineo")));
    },
  );
});

// --- Curación manual --------------------------------------------------------

test("un alimento manual entra entero, con su fuente y su provenance propios", () => {
  const foods: CanonicalFood[] = [];
  const stats = emptyStats();
  applyManualFoods(foods, [manual()], stats, new Map());

  const food = foods[0];
  assert.ok(food);
  assert.equal(food.id, "manual-salmorejo");
  assert.equal(food.source, "manual");
  assert.equal(food.names.es, "Salmorejo");
  assert.equal(food.per_100g.kcal, 83);
  assert.equal(food.per_100g.fiber_g, null, "lo que la etiqueta no dice queda en null, no en cero");
  assert.equal(food.provenance["per_100g.kcal"], "manual/etiqueta-comercial");
  assert.equal(food.provenance["per_100g.fiber_g"], undefined, "un campo que nadie produjo no aparece");
  assert.deepEqual(food.caveats, ["Los valores vienen por 100 ml, no por 100 g."]);
  assert.equal(stats.manualFoods, 1);
  assert.deepEqual(validateFood(food), []);
});

test("un alimento de USDA no puede llevar un id manual, ni al revés", () => {
  const foods: CanonicalFood[] = [];
  applyManualFoods(foods, [manual()], emptyStats(), new Map());
  const food = foods[0];
  assert.ok(food);

  const conRefUsda = { ...food, source_ref: "USDA FDC #999" };
  assert.ok(validateFood(conRefUsda).some((p) => p.includes("referencia USDA")));

  const conIdFdc = { ...food, id: "fdc-999" };
  assert.ok(validateFood(conIdFdc).some((p) => p.includes("manual-")));
});

test("la curación manual PISA los valores de USDA, campo a campo", () => {
  const cur = curation({
    manualFoods: [
      manual({
        id: `fdc-${BANANA}`,
        // Solo dos campos con valor: el resto de la banana tiene que quedar como estaba.
        per_100g: {
          kcal: 95,
          protein_g: 1.09,
          carbs_g: 22.84,
          fat_g: 0.33,
          fiber_g: null,
          sat_fat_g: null,
          sugars_g: null,
          sodium_mg: null,
        },
        caveats: ["Corregido a mano"],
      }),
    ],
  });
  const { catalog, stats } = assemble(input(cur));
  const food = catalog.foods[0];
  assert.ok(food);

  assert.equal(food.per_100g.kcal, 95, "la curación manual gana");
  assert.equal(food.provenance["per_100g.kcal"], "manual/etiqueta-comercial");
  assert.equal(food.per_100g.fiber_g, 2.6, "lo que la entrada manual deja en null no se toca");
  assert.equal(food.provenance["per_100g.fiber_g"], "usda_sr_legacy");
  assert.equal(food.source, "usda_sr_legacy", "pisar valores no cambia la fuente del alimento");
  assert.equal(food.names.en, "Bananas, raw", "la entrada manual corrige números, no vocabulario");
  assert.deepEqual(food.caveats, ["Corregido a mano"]);
  assert.equal(stats.manualOverrideFoods, 1);
  assert.equal(stats.manualFoods, 0, "pisar no es agregar");
});

test("el catálogo ordena por id: los manuales no quedan pegados al final", () => {
  const cur = curation({ manualFoods: [manual({ id: "manual-aaa" })] });
  const { catalog } = assemble(input(cur));
  const ids = catalog.foods.map((food) => food.id);
  assert.deepEqual(ids, [...ids].sort(), "el orden es el mismo con o sin curación manual");
});

test("una entrada manual mal escrita se reporta entera y no entra a medias", () => {
  conArchivos(
    {
      "manual.foods.json": JSON.stringify({
        foods: [
          { id: "salmorejo", origen: "etiqueta comercial", source_ref: "", name_en: "x" },
          manual(),
        ],
      }),
    },
    (cur) => {
      assert.equal(cur.manualFoods.length, 1, "la buena entra, la mala no");
      assert.equal(cur.manualFoods[0]?.id, "manual-salmorejo");
      assert.ok(cur.problems.some((p) => p.includes("manual-<algo>")));
      assert.ok(cur.problems.some((p) => p.includes("origen")));
    },
  );
});

test("sin archivos de curación, el build sigue: la ausencia se tolera", () => {
  conArchivos({}, (cur) => {
    assert.deepEqual(cur.manualFoods, []);
    assert.equal(cur.regionalAliases.size, 0);
    assert.deepEqual(cur.problems, []);
    assert.deepEqual(cur.filesFound, []);
  });
});

test("caveats existe solo donde hace falta", () => {
  const foods: CanonicalFood[] = [];
  applyManualFoods(foods, [manual({ caveats: [] })], emptyStats(), new Map());
  const food = foods[0];
  assert.ok(food);
  assert.equal("caveats" in food, false, "sin caveats, la clave no se escribe");
  assert.deepEqual(validateFood(food), []);

  const vacio = { ...food, caveats: [] };
  assert.ok(validateFood(vacio).some((p) => p.includes("no va la clave")));
});

// --- DT-7: exclusiones y herencia de vocabulario -----------------------------

const BASE: Selection = {
  criteria_version: "1.1-v2",
  generated: "2026-08-30",
  entries: [entry(), entry({ fdc_id: 2709224, source: "fndds", description: "Banana, raw" })],
  foundation_overrides: [],
  flagged_atwater: [],
};

function exclusiones(overrides: Partial<Dt7Exclusion> = {}): Dt7Exclusions {
  return {
    criteria_version: "dt7-v1",
    generated: "2026-08-30",
    exclusions: [
      {
        fdc_id: 2709224,
        source: "fndds",
        description: "Banana, raw",
        duplicado_de: BANANA,
        aliases_heredados: ["Banana", "Plátano"],
        motivo: "la misma banana cruda medida dos veces",
        ...overrides,
      },
    ],
  };
}

test("la exclusión saca la ficha duplicada y deja la que la reemplaza", () => {
  const resultado = applyExclusions(BASE, exclusiones());
  assert.deepEqual(resultado.entries.map((e) => e.fdc_id), [BANANA]);
  assert.match(resultado.criteria_version, /− dt7-v1$/);
  assert.equal(BASE.entries.length, 2, "la selección de entrada no se toca");
});

test("excluir algo que no está en la selección rompe el build", () => {
  assert.throws(
    () => applyExclusions(BASE, exclusiones({ fdc_id: 999999 })),
    /no está en la selección/,
    "una exclusión que no muerde es una exclusión que miente",
  );
});

test("no se puede excluir una ficha apuntando a otra que también sale", () => {
  const dobles: Dt7Exclusions = {
    ...exclusiones(),
    exclusions: [
      ...exclusiones().exclusions,
      {
        fdc_id: BANANA,
        source: "sr_legacy",
        description: "Bananas, raw",
        duplicado_de: 2709224,
        aliases_heredados: [],
        motivo: "circular a propósito",
      },
    ],
  };
  assert.throws(() => applyExclusions(BASE, dobles), /se quedaría sin ninguna ficha/);
});

test("el vocabulario del excluido pasa entero a la ficha que queda", () => {
  const cur = curation({ names: new Map([[BANANA, { name: "Banana cruda", aliases: ["Plátano crudo"] }]]) });
  const base = input(cur);
  base.inheritedAliases = inheritedAliases(exclusiones());

  const { catalog, stats } = assemble(base);
  const food = catalog.foods[0];
  assert.ok(food);
  // Los heredados van con confianza 1,0 (texto plano): no son gemelos, son el
  // mismo alimento con otro nombre.
  assert.deepEqual(food.aliases.es, ["Plátano crudo", "Banana", "Plátano"]);
  assert.equal(stats.inheritedAliases, 2);
});

// --- Candados nuevos ---------------------------------------------------------

test("candado 1: un alias regional que apunta fuera de la selección rompe el build", () => {
  const cur = curation({ regionalAliases: new Map([[999999, [{ alias: "Fantasma", confidence: 0.6 }]]]) });
  const { catalog, stats } = assemble(input(cur));
  assert.deepEqual(stats.orphanRegionalAliases, [999999]);
  const result = lockSchema(catalog, stats);
  assert.equal(result.passed, false, "un alias que nunca matchea no puede pasar en silencio");
  assert.match(result.failures.join(" "), /no matchea nunca/);
});

test("candado 1: un alimento de USDA no puede llevar caveats escritos a mano", () => {
  // Desde la DT-13 hay UNA excepción y una sola: el caveat que GENERA la política
  // de genéricos, que el candado vuelve a derivar de la regla declarada y compara
  // texto contra texto (`genericos.test.ts`). Todo lo demás sigue afuera.
  const food = assemble(input(curation())).catalog.foods[0];
  assert.ok(food);
  assert.deepEqual(validateFood(food), []);
  const conCaveats = { ...food, caveats: ["por 100 ml"] };
  assert.ok(validateFood(conCaveats).some((p) => p.includes("solo puede traer el caveat generado")));
});

test("candado 3: al alimento manual se le exige el 10 % sin el margen de ±20 kcal", () => {
  const foods: CanonicalFood[] = [];
  // 100 kcal declaradas contra 84 predichas: 16 kcal de desvío, un 16 %.
  // Cae justo en la ventana donde los dos brazos discrepan: un alimento de USDA
  // pasa (no llega a las 20 kcal del brazo absoluto); uno manual, no.
  const per100g = {
    kcal: 100,
    protein_g: 2,
    carbs_g: 10,
    fat_g: 4,
    fiber_g: null,
    sat_fat_g: null,
    sugars_g: null,
    sodium_mg: null,
  };
  applyManualFoods(foods, [manual({ per_100g: per100g, caveats: [] })], emptyStats(), new Map());
  const manualFood = foods[0];
  assert.ok(manualFood);
  const catalogo = {
    kb_version: "test",
    generated_from: { selection: "test", sources: [] as never[] },
    foods: [manualFood],
  };
  const result = lockAtwater(catalogo, new Map());
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /curación manual: solo el 10 % relativo/);

  const mismoDeUsda = { ...manualFood, id: "fdc-1", source: "usda_sr_legacy" as const, source_ref: "USDA FDC #1" };
  assert.equal(
    lockAtwater({ ...catalogo, foods: [mismoDeUsda] }, new Map()).passed,
    true,
    "el mismo desvío en un alimento de USDA sí pasa: el margen absoluto existe para las verduras",
  );
});

// --- El candado simétrico del renombre (DT-7) --------------------------------

test("candado 1: un alias 1,0 no puede resucitar el nombre viejo de una ficha renombrada", () => {
  // La regresión exacta, dos veces reintroducida a mano: la ficha se renombra
  // porque su nombre mentía, y el nombre viejo vuelve como alias sin calificar.
  const cur = curation({ names: new Map([[BANANA, { name: "Garbanzos cocidos con sal y grasa", aliases: ["Garbanzos"] }]]) });
  const base = input(cur);
  base.dt7OldNames = new Map([[`fdc-${BANANA}`, "Garbanzos"]]);

  const { catalog, stats } = assemble(base);
  assert.deepEqual(stats.staleAliases, [
    { id: `fdc-${BANANA}`, alias: "Garbanzos", renombrada: `fdc-${BANANA}` },
  ]);
  const result = lockSchema(catalog, stats);
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /entraría por la ventana/);
});

test("el candado del renombre ignora tildes y mayúsculas", () => {
  const cur = curation({ names: new Map([[BANANA, { name: "Quinoa cocida con sal y grasa", aliases: ["QUÍNOA"] }]]) });
  const base = input(cur);
  base.dt7OldNames = new Map([[`fdc-${BANANA}`, "Quinoa"]]);
  assert.equal(assemble(base).stats.staleAliases.length, 1);
});

test("el nombre viejo SÍ puede volver con una reserva declarada", () => {
  // Con confianza < 1,0 el alias dice "esto se parece", no "esto es": es
  // exactamente lo que hace `Bacalao` a 0,8 sobre el bacalao al vapor.
  const cur = curation({
    names: new Map([[BANANA, { name: "Bacalao al vapor", aliases: [] }]]),
    regionalAliases: new Map([[BANANA, [{ alias: "Bacalao", confidence: 0.8 }]]]),
  });
  const base = input(cur);
  base.dt7OldNames = new Map([["fdc-2706240", "Bacalao"]]);
  assert.deepEqual(assemble(base).stats.staleAliases, []);
});

test("candado 1: un alimento de USDA no puede llevar bloque receta", () => {
  const food = assemble(input(curation())).catalog.foods[0];
  assert.ok(food);
  const conReceta = {
    ...food,
    receta: {
      metodo: "mezclado", ingredientes: [{ ref: "fdc-1", grams: 100 }],
      peso_entrada_g: 100, aceite_absorbido_g: 0, peso_final_g: 100,
      rendimiento_de: "transformacion" as const,
    },
  };
  assert.ok(validateFood(conReceta).some((p) => p.includes("source `receta`")));
});
