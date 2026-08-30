/**
 * El armado del canónico, con la curación puesta a mano.
 *
 * Estos tests existen porque `kb/curation/portions.overrides.json` todavía no
 * está escrito (lo hace la card 1.3, en paralelo): sin ellos, el camino que
 * puebla `label_es` no lo ejercita nadie hasta que el archivo aparezca. El
 * escenario se CONSTRUYE, no se sale a buscarlo en los datos reales.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { assemble, pickFoundationCandidate, type AssembleInput } from "./canonical";
import type { Curation } from "./curation";
import type { NutrientBundle } from "./nutrients";
import type { FoundationOverride, Selection } from "./selection";
import type { PortionHint, UsdaFoodSource } from "./types";

const BANANA = 173944;

const NUTRIENTS: NutrientBundle = {
  kcal: 89,
  protein_g: 1.09,
  carbs_g: 22.84,
  fat_g: 0.33,
  fiber_g: 2.6,
  sat_fat_g: 0.112,
  sugars_g: 12.23,
  sodium_mg: 1,
};

const USDA_HINTS: PortionHint[] = [
  { grams: 225, label_en: "1 cup, mashed", label_es: null },
  { grams: 118, label_en: "1 medium (7\" to 7-7/8\" long)", label_es: null },
];

function emptyCuration(): Curation {
  return {
    names: new Map(),
    portions: new Map(),
    regionalAliases: new Map(),
    manualFoods: [],
    transforms: new Map(),
    recipes: [],
    filesFound: [],
    problems: [],
  };
}

interface FoundationSetup {
  overrides: FoundationOverride[];
  nutrients: Map<number, NutrientBundle>;
}

function input(curation: Curation, foundation?: FoundationSetup): AssembleInput {
  const selection: Selection = {
    criteria_version: "test",
    generated: "2026-08-30",
    entries: [
      {
        fdc_id: BANANA,
        source: "sr_legacy",
        description: "Bananas, raw",
        category: "Fruits and Fruit Juices",
        n_ingredients: null,
        n_portions: 2,
        default_portion_g: 225,
        portion_needs_review: false,
      },
    ],
    foundation_overrides: foundation?.overrides ?? [],
    flagged_atwater: [],
  };
  const empty = <T>(): Record<UsdaFoodSource, Map<number, T>> => ({
    usda_fndds: new Map<number, T>(),
    usda_sr_legacy: new Map<number, T>(),
  });

  const descriptions = empty<string>();
  descriptions.usda_sr_legacy.set(BANANA, "Bananas, raw");
  const nutrients = empty<NutrientBundle>();
  nutrients.usda_sr_legacy.set(BANANA, NUTRIENTS);
  const portions = empty<PortionHint[]>();
  portions.usda_sr_legacy.set(BANANA, USDA_HINTS.map((hint) => ({ ...hint })));

  return {
    selection,
    sourceIds: ["usda_sr_legacy"],
    descriptions,
    nutrients,
    portions,
    foundationNutrients: foundation?.nutrients ?? new Map(),
    curation,
  };
}

/** Un alimento de Foundation, con solo los campos que se le pasen. */
function foundationFood(values: NutrientBundle): NutrientBundle {
  return values;
}

test("sin curación, toda porción de USDA sale con label_es en null", () => {
  const { catalog, stats } = assemble(input(emptyCuration()));
  const food = catalog.foods[0];
  assert.ok(food);
  assert.deepEqual(
    food.portion_hints.map((hint) => hint.label_es),
    [null, null],
  );
  assert.equal(food.provenance["portion_hints"], "usda_sr_legacy");
  assert.equal(food.provenance["portion_hints.label_es"], undefined);
  assert.equal(stats.curatedPortionLabels, 0);
});

test("la curación pone el español sobre la porción por defecto", () => {
  const curation = emptyCuration();
  curation.portions.set(BANANA, { default_portion_g: 118, label_es: "1 unidad mediana" });

  const { catalog, stats } = assemble(input(curation));
  const food = catalog.foods[0];
  assert.ok(food);
  assert.equal(food.default_portion_g, 118);
  assert.equal(food.portion_hints.length, 2, "no se agrega una porción que ya existía");
  assert.equal(food.portion_hints.find((h) => h.grams === 118)?.label_es, "1 unidad mediana");
  assert.equal(food.portion_hints.find((h) => h.grams === 225)?.label_es, null);
  assert.equal(food.provenance["default_portion_g"], "curation");
  assert.equal(food.provenance["portion_hints.label_es"], "curation");
  assert.equal(food.provenance["portion_hints"], "usda_sr_legacy", "el resto sigue siendo de USDA");
  assert.equal(stats.curatedPortions, 1);
  assert.equal(stats.curatedPortionLabels, 1);
});

test("si USDA no mide esa porción, la curación agrega una", () => {
  const curation = emptyCuration();
  curation.portions.set(BANANA, { default_portion_g: 90, label_es: "1 unidad chica" });

  const { catalog } = assemble(input(curation));
  const food = catalog.foods[0];
  assert.ok(food);
  assert.equal(food.portion_hints.length, 3);
  const added = food.portion_hints.at(-1);
  assert.deepEqual(added, { grams: 90, label_en: "90 g", label_es: "1 unidad chica" });
});

test("se puede corregir solo la etiqueta, sin tocar los gramos", () => {
  const curation = emptyCuration();
  curation.portions.set(BANANA, { default_portion_g: null, label_es: "1 taza pisada" });

  const { catalog, stats } = assemble(input(curation));
  const food = catalog.foods[0];
  assert.ok(food);
  assert.equal(food.default_portion_g, 225, "los gramos siguen siendo los de la selección");
  assert.equal(food.provenance["default_portion_g"], "usda_sr_legacy");
  assert.equal(food.portion_hints.find((h) => h.grams === 225)?.label_es, "1 taza pisada");
  assert.equal(stats.curatedPortions, 0);
  assert.equal(stats.curatedPortionLabels, 1);
});

// --- El camino de Foundation -----------------------------------------------
// Foundation no aporta alimentos propios: pisa valores puntuales de otros. Por
// eso el candado de aceptación por fuente NO lo cubre —cuenta alimentos de
// FNDDS y de SR— y estos tests son la única red que tiene ese camino.

test("desempate: gana el que resuelve más campos, aunque sea el más viejo", () => {
  const nutrients = new Map<number, NutrientBundle>([
    [900, foundationFood({ kcal: 95, protein_g: 1.2, carbs_g: 23, fat_g: 0.3 })],
    [901, foundationFood({ kcal: 96 })],
  ]);
  assert.equal(pickFoundationCandidate([900, 901], nutrients), 900);
});

test("desempate: a igualdad exacta de campos gana el fdc_id más alto", () => {
  const nutrients = new Map<number, NutrientBundle>([
    [900, foundationFood({ kcal: 95, carbs_g: 23 })],
    [901, foundationFood({ kcal: 96, carbs_g: 24 })],
  ]);
  assert.equal(pickFoundationCandidate([900, 901], nutrients), 901);
  assert.equal(
    pickFoundationCandidate([901, 900], nutrients),
    901,
    "el orden en que llegan los candidatos no puede cambiar el ganador",
  );
});

test("desempate: un candidato sin datos no compite", () => {
  const nutrients = new Map<number, NutrientBundle>([[900, foundationFood({ kcal: 95 })]]);
  // 999 tiene el fdc_id más alto pero no trae ni un valor.
  assert.equal(pickFoundationCandidate([900, 999], nutrients), 900);
  assert.equal(pickFoundationCandidate([999], nutrients), null);
  assert.equal(pickFoundationCandidate([], nutrients), null);
});

test("el alcohol no cuenta para el desempate: no es un campo del catálogo", () => {
  const nutrients = new Map<number, NutrientBundle>([
    [900, foundationFood({ kcal: 95, carbs_g: 23 })],
    [901, foundationFood({ kcal: 96, alcohol_g: 3 })],
  ]);
  assert.equal(pickFoundationCandidate([900, 901], nutrients), 900);
});

test("el override pisa solo los campos que trae y lo marca en provenance", () => {
  const foundation = {
    overrides: [{ fdc_id_foundation: 900, matched_fdc_id: BANANA, description: "Bananas, raw" }],
    nutrients: new Map<number, NutrientBundle>([
      [900, foundationFood({ kcal: 95, carbs_g: 23.5 })],
    ]),
  };
  const { catalog, stats } = assemble(input(emptyCuration(), foundation));
  const food = catalog.foods[0];
  assert.ok(food);

  assert.equal(food.per_100g.kcal, 95, "el valor pisado es el de Foundation");
  assert.equal(food.per_100g.carbs_g, 23.5);
  assert.equal(food.provenance["per_100g.kcal"], "usda_foundation");
  assert.equal(food.provenance["per_100g.carbs_g"], "usda_foundation");

  assert.equal(food.per_100g.protein_g, 1.09, "lo que Foundation no trae no se toca");
  assert.equal(food.provenance["per_100g.protein_g"], "usda_sr_legacy");
  assert.equal(food.provenance["per_100g.fiber_g"], "usda_sr_legacy");
  assert.equal(food.source, "usda_sr_legacy", "Foundation no cambia la fuente del alimento");

  assert.equal(stats.overridesFoods, 1);
  assert.deepEqual(stats.overridesByField, { kcal: 1, carbs_g: 1 });
  assert.deepEqual(stats.overrideCollisions, []);
});

test("el override puede completar un campo que la fuente base no tenía", () => {
  const sinAzucares = { ...NUTRIENTS };
  delete sinAzucares.sugars_g;
  const base = input(emptyCuration(), {
    overrides: [{ fdc_id_foundation: 900, matched_fdc_id: BANANA, description: "Bananas, raw" }],
    nutrients: new Map<number, NutrientBundle>([[900, foundationFood({ sugars_g: 12.5 })]]),
  });
  base.nutrients.usda_sr_legacy.set(BANANA, sinAzucares);

  const food = assemble(base).catalog.foods[0];
  assert.ok(food);
  assert.equal(food.per_100g.sugars_g, 12.5);
  assert.equal(food.provenance["per_100g.sugars_g"], "usda_foundation");
});

test("con varios candidatos gana el elegido y la colisión queda registrada", () => {
  const foundation = {
    overrides: [
      { fdc_id_foundation: 900, matched_fdc_id: BANANA, description: "Bananas, raw" },
      { fdc_id_foundation: 901, matched_fdc_id: BANANA, description: "Bananas, raw" },
    ],
    nutrients: new Map<number, NutrientBundle>([
      [900, foundationFood({ kcal: 95, carbs_g: 23.5 })],
      [901, foundationFood({ kcal: 97, carbs_g: 24, fat_g: 0.4 })],
    ]),
  };
  const { catalog, stats } = assemble(input(emptyCuration(), foundation));
  const food = catalog.foods[0];
  assert.ok(food);

  assert.equal(food.per_100g.kcal, 97, "gana el que resuelve más campos");
  assert.equal(food.per_100g.fat_g, 0.4);
  assert.deepEqual(stats.overrideCollisions, [
    { fdc_id: BANANA, candidates: [900, 901], winner: 901 },
  ]);
  assert.equal(stats.overridesFoods, 1, "una colisión sigue siendo UN alimento pisado");
});

test("un override que apunta a un alimento sin datos de Foundation no hace nada", () => {
  const foundation = {
    overrides: [{ fdc_id_foundation: 999, matched_fdc_id: BANANA, description: "Bananas, raw" }],
    nutrients: new Map<number, NutrientBundle>(),
  };
  const { catalog, stats } = assemble(input(emptyCuration(), foundation));
  const food = catalog.foods[0];
  assert.ok(food);
  assert.equal(food.per_100g.kcal, 89);
  assert.equal(food.provenance["per_100g.kcal"], "usda_sr_legacy");
  assert.equal(stats.overridesFoods, 0);
});

test("el nombre en español y los aliases entran por la misma puerta", () => {
  const curation = emptyCuration();
  curation.names.set(BANANA, { name: "Banana", aliases: ["plátano", "banano"] });

  const { catalog, stats } = assemble(input(curation));
  const food = catalog.foods[0];
  assert.ok(food);
  assert.equal(food.names.es, "Banana");
  assert.deepEqual(food.aliases.es, ["plátano", "banano"]);
  assert.equal(food.provenance["names.es"], "curation");
  assert.equal(food.provenance["names.en"], "usda_sr_legacy");
  assert.equal(stats.pendingCuration.length, 0);
});
