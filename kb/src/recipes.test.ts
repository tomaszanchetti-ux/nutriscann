/**
 * La matemática de las recetas compuestas (card 1.7) y sus candados.
 *
 * La derivación se prueba con una receta de JUGUETE cuyo per_100g se puede hacer
 * a mano en dos líneas: si el test necesitara una calculadora, no probaría nada.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { applyRecipes, type BuildStats } from "./canonical";
import type { Curation, Recipe } from "./curation";
import { RECIPE_KCAL_MAX, RECIPE_YIELD_MIN, validateRecipeFood } from "./locks";
import { derivarReceta, desvioDeRendimiento, type CookingTransform } from "./transforms";
import type { CanonicalFood, Per100g } from "./types";

const MEZCLADO: CookingTransform = {
  id: "mezclado",
  factor_peso: 1,
  aceite_absorbido_pct: 0,
  aceite_ref: null,
};
const FRITO: CookingTransform = {
  id: "frito",
  factor_peso: 1,
  aceite_absorbido_pct: 10,
  aceite_ref: "fdc-1",
};

function per100g(over: Partial<Per100g> = {}): Per100g {
  return {
    kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    fiber_g: 0, sat_fat_g: 0, sugars_g: 0, sodium_mg: 0,
    ...over,
  };
}

// --- La derivación, a mano --------------------------------------------------

test("la receta de juguete da el número que se calcula a mano", () => {
  // 100 g de algo de 200 kcal + 100 g de algo de 0 kcal = 200 kcal en 200 g
  // ⇒ 100 kcal por 100 g. Sin transformación que estorbe.
  const d = derivarReceta({
    ingredientes: [
      { ref: "fdc-1", grams: 100, per_100g: per100g({ kcal: 200, protein_g: 10, carbs_g: 20, fat_g: 4 }) },
      { ref: "fdc-2", grams: 100, per_100g: per100g() },
    ],
    transform: MEZCLADO,
  });
  assert.equal(d.peso_entrada_g, 200);
  assert.equal(d.peso_final_g, 200);
  assert.equal(d.per_100g.kcal, 100);
  assert.equal(d.per_100g.protein_g, 5);
  assert.equal(d.per_100g.carbs_g, 10);
  assert.equal(d.per_100g.fat_g, 2);
  assert.equal(d.rendimiento_de, "transformacion");
});

test("el agua que se queda diluye: es un ingrediente, no un factor", () => {
  const sinAgua = derivarReceta({
    ingredientes: [{ ref: "fdc-1", grams: 100, per_100g: per100g({ kcal: 300, protein_g: 0, carbs_g: 75, fat_g: 0 }) }],
    transform: MEZCLADO,
  });
  const conAgua = derivarReceta({
    ingredientes: [
      { ref: "fdc-1", grams: 100, per_100g: per100g({ kcal: 300, protein_g: 0, carbs_g: 75, fat_g: 0 }) },
      { ref: "fdc-agua", grams: 200, per_100g: per100g() },
    ],
    transform: MEZCLADO,
  });
  assert.equal(sinAgua.per_100g.kcal, 300);
  assert.equal(conAgua.per_100g.kcal, 100, "el triple de peso, un tercio de densidad");
});

test("una transformación que pierde peso concentra los nutrientes", () => {
  const d = derivarReceta({
    ingredientes: [{ ref: "fdc-1", grams: 100, per_100g: per100g({ kcal: 100, protein_g: 25, carbs_g: 0, fat_g: 0 }) }],
    transform: { ...MEZCLADO, id: "horneado", factor_peso: 0.5 },
  });
  assert.equal(d.peso_final_g, 50);
  assert.equal(d.per_100g.kcal, 200, "la mitad de peso, el doble de densidad");
  assert.equal(d.per_100g.protein_g, 50);
});

test("la fritura suma el aceite que absorbe, y sin su ficha no deriva", () => {
  const aceite = per100g({ kcal: 900, fat_g: 100 });
  const d = derivarReceta({
    ingredientes: [{ ref: "fdc-2", grams: 100, per_100g: per100g({ kcal: 100, protein_g: 25 }) }],
    transform: FRITO,
    aceite,
  });
  // 10 g de aceite sobre 100 g de ingrediente ⇒ 110 g finales y 100 + 90 kcal.
  assert.equal(d.aceite_absorbido_g, 10);
  assert.equal(d.peso_final_g, 110);
  assert.equal(d.per_100g.kcal, 172.727);

  assert.throws(
    () => derivarReceta({
      ingredientes: [{ ref: "fdc-2", grams: 100, per_100g: per100g({ kcal: 100 }) }],
      transform: FRITO,
    }),
    /absorbe aceite y no se resolvió su ficha/,
  );
});

test("un opcional que le falta a UN ingrediente sale null, no cero", () => {
  const d = derivarReceta({
    ingredientes: [
      { ref: "fdc-1", grams: 100, per_100g: per100g({ kcal: 100, fiber_g: 5 }) },
      { ref: "fdc-2", grams: 100, per_100g: { ...per100g({ kcal: 100 }), fiber_g: null } },
    ],
    transform: MEZCLADO,
  });
  assert.equal(d.per_100g.fiber_g, null, "sumar como si fuera cero inventaría precisión");
  assert.equal(d.per_100g.kcal, 100, "los obligatorios siguen saliendo");
});

test("el rendimiento declarado pisa a la transformación y se marca", () => {
  const d = derivarReceta({
    ingredientes: [{ ref: "fdc-1", grams: 100, per_100g: per100g({ kcal: 100 }) }],
    transform: MEZCLADO,
    rendimiento_declarado: 80,
  });
  assert.equal(d.peso_final_g, 80);
  assert.equal(d.rendimiento_de, "receta");
  assert.equal(desvioDeRendimiento(d), 0.8);
});

test("la derivación es determinística: dos corridas, el mismo objeto", () => {
  const input = {
    ingredientes: [
      { ref: "fdc-1", grams: 33.3, per_100g: per100g({ kcal: 111, protein_g: 7.7, carbs_g: 3.3, fat_g: 1.1 }) },
      { ref: "fdc-2", grams: 66.7, per_100g: per100g({ kcal: 222, protein_g: 1.1, carbs_g: 9.9, fat_g: 5.5 }) },
    ],
    transform: MEZCLADO,
  };
  assert.deepEqual(derivarReceta(input), derivarReceta(input));
});

// --- Los candados -----------------------------------------------------------

function stats(): BuildStats {
  return {
    foods: 0, bySource: { usda_fndds: 0, usda_sr_legacy: 0 },
    resolvedBySource: { usda_fndds: 0, usda_sr_legacy: 0 }, coverage: {},
    unresolved: [], overridesByField: {}, overridesFoods: 0, overrideCollisions: [],
    pendingCuration: [], curatedNames: 0, curatedAliases: 0, regionalAliases: 0,
    inheritedAliases: 0, staleAliases: [], orphanRegionalAliases: [], manualFoods: 0, recipeFoods: 0,
    recipeFailures: [], manualOverridesByField: {}, manualOverrideFoods: 0,
    curatedPortions: 0, curatedPortionLabels: 0, curatedPortionHints: 0, portionNeedsReview: [],
    genericFoods: 0, genericCaveats: 0, guardViolations: [],
    descriptionMismatches: [], foodsWithoutPortions: [],
  };
}

function ficha(id: string, over: Partial<Per100g> = {}): CanonicalFood {
  return {
    id, source: "usda_fndds", source_ref: `USDA FDC #${id.slice(4)}`,
    names: { en: id, es: id }, aliases: { es: [] }, category: "Test",
    per_100g: per100g({ kcal: 200, protein_g: 10, carbs_g: 20, fat_g: 4, ...over }),
    portion_hints: [{ grams: 100, label_en: "1 unit", label_es: null }],
    default_portion_g: 100, provenance: {}, deprecated: false,
  };
}

function receta(over: Partial<Recipe> = {}): Recipe {
  return {
    id: "receta-prueba", name_en: "Test", name_es: "Prueba", aliases: [],
    category: "Test", metodo: "mezclado",
    ingredientes: [{ ref: "fdc-1", grams: 100 }, { ref: "fdc-2", grams: 100 }],
    rendimiento_declarado_g: null, rendimiento_motivo: null,
    portion_hints: [{ grams: 100, label_en: "1 serving", label_es: "1 ración" }],
    default_portion_g: 100, caveats: ["Receta estándar declarada, no medición."],
    ...over,
  };
}

function curacion(recipes: Recipe[]): Curation {
  return {
    names: new Map(), portions: new Map(), regionalAliases: new Map(), manualFoods: [],
    transforms: new Map([["mezclado", MEZCLADO]]), recipes, genericRule: null, guardas: [],
    filesFound: [], problems: [],
  };
}

test("una receta con una ref rota NO se saltea: rompe el build", () => {
  const foods = [ficha("fdc-1")];
  const s = stats();
  applyRecipes(foods, curacion([receta()]), s);
  assert.equal(s.recipeFoods, 0);
  assert.equal(foods.length, 1, "la ficha rota no entra");
  assert.deepEqual(s.recipeFailures, [
    { id: "receta-prueba", motivo: "el ingrediente fdc-2 no está en el catálogo" },
  ]);
});

test("una receta con un método que no existe rompe el build", () => {
  const s = stats();
  applyRecipes([ficha("fdc-1"), ficha("fdc-2")], curacion([receta({ metodo: "inventado" })]), s);
  assert.match(s.recipeFailures[0]?.motivo ?? "", /no está declarado en cooking.transforms.json/);
});

test("una receta que apunta a un ingrediente deprecado rompe el build", () => {
  const dep = ficha("fdc-2");
  dep.deprecated = true;
  const s = stats();
  applyRecipes([ficha("fdc-1"), dep], curacion([receta()]), s);
  assert.match(s.recipeFailures[0]?.motivo ?? "", /está deprecado/);
});

test("la ficha derivada trae su receta entera: el valor se puede rehacer", () => {
  const foods = [ficha("fdc-1"), ficha("fdc-2", { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })];
  const s = stats();
  applyRecipes(foods, curacion([receta()]), s);
  const derivada = foods.at(-1);
  assert.ok(derivada);
  assert.equal(derivada.source, "receta");
  assert.equal(derivada.per_100g.kcal, 100);
  assert.equal(derivada.provenance["per_100g.kcal"], "receta");
  assert.equal(derivada.receta?.peso_final_g, 200);
  assert.deepEqual(derivada.receta?.ingredientes, [
    { ref: "fdc-1", grams: 100 },
    { ref: "fdc-2", grams: 100 },
  ]);
  assert.deepEqual(validateRecipeFood(derivada), []);
  assert.equal(s.recipeFoods, 1);
});

test("candado: un rendimiento absurdo no pasa", () => {
  const foods = [ficha("fdc-1"), ficha("fdc-2")];
  applyRecipes(foods, curacion([receta({ rendimiento_declarado_g: 20, rendimiento_motivo: "a propósito" })]), stats());
  const derivada = foods.at(-1);
  assert.ok(derivada);
  // 20 g de 200 g de ingredientes: un rendimiento de 0,1, muy por debajo del piso.
  const problemas = validateRecipeFood(derivada);
  assert.ok(problemas.some((p) => p.includes("rango de cordura")), problemas.join(" | "));
  assert.ok(RECIPE_YIELD_MIN > 0.1);
});

test("candado: una densidad calórica imposible no pasa", () => {
  const foods = [ficha("fdc-1", { kcal: 5000 }), ficha("fdc-2", { kcal: 5000 })];
  applyRecipes(foods, curacion([receta()]), stats());
  const derivada = foods.at(-1);
  assert.ok(derivada);
  assert.ok(derivada.per_100g.kcal > RECIPE_KCAL_MAX);
  assert.ok(validateRecipeFood(derivada).some((p) => p.includes("densidad calórica")));
});

test("candado: sin la receta en el documento, la ficha no valida", () => {
  const foods = [ficha("fdc-1"), ficha("fdc-2")];
  applyRecipes(foods, curacion([receta()]), stats());
  const derivada = foods.at(-1);
  assert.ok(derivada);
  const sinReceta = { ...derivada };
  delete sinReceta.receta;
  assert.ok(validateRecipeFood(sinReceta).some((p) => p.includes("no se puede rehacer")));
});

test("INVARIANTE: Atwater cierra por construcción en toda receta derivada", () => {
  // Las calorías y los macros salen de las MISMAS fichas y de la MISMA división,
  // así que la coherencia se hereda: si los ingredientes cierran, la receta cierra.
  // Se fija como invariante porque es la propiedad que hace confiable al mecanismo.
  const ingredientes = [
    { ref: "fdc-1", grams: 137, per_100g: per100g({ kcal: 579, protein_g: 21.15, carbs_g: 21.55, fat_g: 49.93 }) },
    { ref: "fdc-2", grams: 263, per_100g: per100g({ kcal: 401, protein_g: 0, carbs_g: 99.6, fat_g: 0.32 }) },
    { ref: "fdc-3", grams: 600, per_100g: per100g() },
  ];
  for (const factor of [0.6, 0.8, 1, 1.3]) {
    const d = derivarReceta({ ingredientes, transform: { ...MEZCLADO, factor_peso: factor } });
    const predicho = 4 * d.per_100g.protein_g + 4 * d.per_100g.carbs_g + 9 * d.per_100g.fat_g;
    const desvio = Math.abs(d.per_100g.kcal - predicho) / d.per_100g.kcal;
    assert.ok(desvio < 0.1, `factor ${factor}: desvío ${(desvio * 100).toFixed(1)} %`);
  }
});
