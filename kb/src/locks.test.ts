/**
 * Los candados, probados sin tocar un solo CSV de USDA.
 *
 * La decisión (¿este catálogo pasa?) está separada de la lectura (¿qué dicen
 * los archivos?), así que el escenario de cada candado se CONSTRUYE: no se
 * sale a buscar en los datos reales un alimento que casualmente falle.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { BuildStats } from "./canonical";
import {
  CLAVES_DEL_CATALOGO,
  lockAtwater,
  lockGolden,
  lockIdempotence,
  lockPerSource,
  lockSchema,
  validateFood,
  MINIMUM_BY_SOURCE,
} from "./locks";
import type { CanonicalFood, Catalog, FoodSource, VocabularyGuard } from "./types";

function food(overrides: Partial<CanonicalFood> = {}): CanonicalFood {
  return {
    id: "fdc-1",
    source: "usda_sr_legacy",
    source_ref: "USDA FDC #1",
    names: { en: "Test food", es: null },
    aliases: { es: [] },
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
    portion_hints: [{ grams: 100, label_en: "1 cup", label_es: null }],
    default_portion_g: 100,
    provenance: { "per_100g.kcal": "usda_sr_legacy" },
    deprecated: false,
    ...overrides,
  };
}

/** Una guarda cualquiera, bien formada: el candado 1 exige que la lista no venga vacía. */
const GUARDA_DE_PRUEBA: VocabularyGuard = {
  termino: "chorizo",
  prohibido_en: ["fdc-2705835"],
  motivo: "el corte vacuno no se llama como el embutido",
};

function catalog(foods: CanonicalFood[], guardas: VocabularyGuard[] = [GUARDA_DE_PRUEBA]): Catalog {
  return {
    kb_version: "1.0.0+testtest",
    generated_from: { selection: "1.1-v2", sources: ["usda_sr_legacy"] },
    guardas,
    foods,
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

function manyFoods(source: FoodSource, count: number): CanonicalFood[] {
  return Array.from({ length: count }, (_, i) => {
    if (source === "manual") {
      return food({ id: `manual-x${i}`, source, source_ref: "Etiqueta comercial de prueba" });
    }
    if (source === "receta") {
      return food({ id: `receta-x${i}`, source, source_ref: "Receta compuesta de prueba" });
    }
    return food({ id: `fdc-${source === "usda_fndds" ? 2_000_000 + i : 100_000 + i}`, source });
  });
}

// --- Candado 1 --------------------------------------------------------------

test("candado 1: un NaN en un macro no pasa", () => {
  const bad = food();
  (bad.per_100g as { kcal: number }).kcal = Number.NaN;
  const result = lockSchema(catalog([bad]), emptyStats());
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /kcal no es un número finito/);
});

test("candado 1: Infinity tampoco pasa", () => {
  const bad = food();
  (bad.per_100g as { fat_g: number }).fat_g = Number.POSITIVE_INFINITY;
  assert.equal(lockSchema(catalog([bad]), emptyStats()).passed, false);
});

test("candado 1: un alimento que no se pudo resolver rompe el build", () => {
  const stats = emptyStats();
  stats.unresolved.push({
    fdc_id: 42,
    source: "usda_fndds",
    description: "Fantasma",
    missing: ["kcal"],
  });
  const result = lockSchema(catalog([food()]), stats);
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /fdc-42/);
});

test("candado 1: los campos extendidos aceptan null pero no basura", () => {
  assert.deepEqual(validateFood(food()), []);
  const bad = food();
  (bad.per_100g as { fiber_g: unknown }).fiber_g = "2";
  assert.ok(validateFood(bad).some((p) => p.includes("fiber_g")));
});

test("candado 1: la etiqueta en español de una porción es texto o null", () => {
  const conEspanol = food({
    portion_hints: [{ grams: 118, label_en: "1 medium", label_es: "1 unidad mediana" }],
  });
  assert.deepEqual(validateFood(conEspanol), []);

  const bad = food();
  (bad.portion_hints[0] as { label_es: unknown }).label_es = "";
  assert.ok(validateFood(bad).some((p) => p.includes("label_es")));
});

test("candado 1: dos alimentos con el mismo id se detectan", () => {
  const result = lockSchema(catalog([food(), food()]), emptyStats());
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /id duplicado/);
});

// --- Candado 2 --------------------------------------------------------------

test("candado 2: el catálogo completo pasa el piso por fuente", () => {
  const result = lockPerSource(
    catalog([
      ...manyFoods("usda_fndds", MINIMUM_BY_SOURCE.usda_fndds),
      ...manyFoods("usda_sr_legacy", MINIMUM_BY_SOURCE.usda_sr_legacy),
      ...manyFoods("manual", MINIMUM_BY_SOURCE.manual),
      ...manyFoods("receta", MINIMUM_BY_SOURCE.receta),
    ]),
  );
  assert.equal(result.passed, true);
});

test("candado 2: si las recetas desaparecen, el build explota", () => {
  // Mismo motivo que el piso de la curación manual: `recipes.foods.json` se lee
  // de forma tolerante, así que vaciarlo no lanza nada y el catálogo saldría sin
  // ninguna ficha derivada, con todos los candados en verde.
  const result = lockPerSource(
    catalog([
      ...manyFoods("usda_fndds", MINIMUM_BY_SOURCE.usda_fndds),
      ...manyFoods("usda_sr_legacy", MINIMUM_BY_SOURCE.usda_sr_legacy),
      ...manyFoods("manual", MINIMUM_BY_SOURCE.manual),
    ]),
  );
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /receta: 0 alimentos resueltos/);
});

test("candado 2: si la curación manual desaparece, el build explota", () => {
  // El escenario: alguien renombra o vacía `manual.foods.json`. El build lo lee
  // de forma TOLERANTE, así que no salta ninguna excepción y el catálogo saldría
  // sin el salmorejo y sin ninguna otra entrada manual, con todo en verde.
  const result = lockPerSource(
    catalog([
      ...manyFoods("usda_fndds", MINIMUM_BY_SOURCE.usda_fndds),
      ...manyFoods("usda_sr_legacy", MINIMUM_BY_SOURCE.usda_sr_legacy),
    ]),
  );
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /manual: 0 alimentos resueltos/);
});

test("candado 2: si el mapeo de FNDDS devuelve vacío, el build explota", () => {
  // Este es EXACTAMENTE el fallo silencioso del Bloque 0: usar nutrient.id
  // para FNDDS no lanza ninguna excepción, simplemente no encuentra nada.
  const result = lockPerSource(catalog(manyFoods("usda_sr_legacy", 300)));
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /usda_fndds: 0 alimentos resueltos/);
});

// --- Candado 3 --------------------------------------------------------------

test("candado 3: kcal coherentes con los macros pasan", () => {
  // 4*5 + 4*15 + 9*2 = 98 vs 100 declaradas.
  assert.equal(lockAtwater(catalog([food()]), new Map()).passed, true);
});

test("candado 3: kcal incoherentes con los macros no entran", () => {
  const bad = food({ per_100g: { ...food().per_100g, kcal: 400 } });
  const result = lockAtwater(catalog([bad]), new Map());
  assert.equal(result.passed, false);
});

test("candado 3: hay que fallar el 10 % Y las 20 kcal", () => {
  // Una verdura: 15 kcal declaradas vs 4 predichas. 275 % de desvío relativo,
  // pero 11 kcal absolutas: la división chica no puede descartar una lechuga.
  const verdura = food({
    per_100g: { ...food().per_100g, kcal: 15, protein_g: 1, carbs_g: 0, fat_g: 0 },
  });
  assert.equal(lockAtwater(catalog([verdura]), new Map()).passed, true);
});

test("candado 3: el alcohol suma 7 kcal/g al predictor", () => {
  // Vino tinto: 85 kcal, casi sin macros, 10,6 g de alcohol.
  const vino = food({
    id: "fdc-9",
    per_100g: { ...food().per_100g, kcal: 85, protein_g: 0.07, carbs_g: 2.6, fat_g: 0 },
  });
  assert.equal(lockAtwater(catalog([vino]), new Map()).passed, false, "sin alcohol, falla");
  assert.equal(
    lockAtwater(catalog([vino]), new Map([["fdc-9", 10.6]])).passed,
    true,
    "con alcohol, cierra",
  );
});

// --- Candado 4 --------------------------------------------------------------

test("candado 4: un caso dorado ausente del catálogo falla", () => {
  const result = lockGolden(catalog([food()]));
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /no está en el catálogo/);
});

test("candado 4: un valor fuera del ±15 % falla", () => {
  const manzana = food({
    id: "fdc-171689",
    per_100g: { ...food().per_100g, kcal: 90, protein_g: 0.3, carbs_g: 22, fat_g: 0.1 },
  });
  const result = lockGolden(catalog([manzana]));
  assert.equal(result.passed, false);
  assert.match(result.failures.join(" "), /Manzana/);
});

// --- Candado 5 --------------------------------------------------------------

test("candado 5: dos corridas iguales pasan, distintas fallan", () => {
  assert.equal(lockIdempotence("{}", "{}").passed, true);
  assert.equal(lockIdempotence("{}", "{ }").passed, false);
});

// --- Candado 1 · el encabezado del catálogo (DT-32) --------------------------

test("candado 1: el encabezado declara sus CUATRO claves y en su orden", () => {
  // Sumar o sacar una clave del catálogo es un cambio de contrato —lo leen el
  // seed, el motor y los tests que corren sin los CSVs— y tiene que ser un acto
  // deliberado, con su versión escrita, no un efecto secundario de otra cosa.
  assert.deepEqual(CLAVES_DEL_CATALOGO, ["kb_version", "generated_from", "guardas", "foods"]);
  assert.equal(lockSchema(catalog([food()]), emptyStats()).passed, true);

  const conClaveDeMas = { ...catalog([food()]), extra: 1 } as unknown as Catalog;
  const r = lockSchema(conClaveDeMas, emptyStats());
  assert.equal(r.passed, false);
  assert.match(r.failures.join(" "), /cambio de\s+esquema/);
});

test("candado 1: un catálogo SIN guardas no se publica", () => {
  // El escenario se construye porque no puede aparecer solo: hoy la curación
  // declara veintiuna. Si un día el archivo se vacía o se renombra, el catálogo
  // saldría con la lista vacía y el matcher se quedaría sin NINGUNA prohibición
  // —`chorizo` volvería al bife— sin que nada explote. Esto explota.
  const r = lockSchema(catalog([food()], []), emptyStats());
  assert.equal(r.passed, false);
  assert.match(r.failures.join(" "), /sin guardas de vocabulario/);
});

test("candado 1: una guarda a medio escribir no llega al catálogo", () => {
  // Una prohibición rota no rompe nada VISIBLE —el matcher la recorre y no
  // dispara nunca—, que es exactamente el modo de falla silencioso que las
  // guardas existen para evitar. Por eso se verifica la forma acá y no solo en
  // la curación: desde la DT-32 esta lista es la que corre en runtime.
  const casos: [Partial<VocabularyGuard>, RegExp][] = [
    [{ termino: "", prohibido_en: ["fdc-1"], motivo: "x" }, /el término está vacío/],
    [{ termino: "x", prohibido_en: [], motivo: "x" }, /no prohíbe la palabra en ninguna ficha/],
    [{ termino: "x", prohibido_en: ["fdc-1"], motivo: "" }, /falta el motivo/],
    [{ termino: "x", prohibido_en: ["fdc-1"], salvo_si_contiene: [], motivo: "x" }, /excepción está vacía/],
  ];
  for (const [guarda, esperado] of casos) {
    const r = lockSchema(catalog([food()], [guarda as VocabularyGuard]), emptyStats());
    assert.equal(r.passed, false, JSON.stringify(guarda));
    assert.match(r.failures.join(" "), esperado);
  }
});

test("candado 1: el mismo término declarado dos veces se detecta", () => {
  // Dos filas con el mismo término no suman: la segunda es o una copia muerta o
  // una contradicción, y las dos formas se arreglan en la curación.
  const r = lockSchema(catalog([food()], [GUARDA_DE_PRUEBA, { ...GUARDA_DE_PRUEBA }]), emptyStats());
  assert.equal(r.passed, false);
  assert.match(r.failures.join(" "), /declarado dos veces/);
});
