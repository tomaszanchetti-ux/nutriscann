/**
 * Lo que agregan las decisiones DT-8 y DT-13 (card 2.DT): la política de los
 * alimentos genéricos y las guardas de vocabulario.
 *
 * Los escenarios se CONSTRUYEN acá, con el mínimo de datos que hace falta para
 * recorrer el camino. Un test que dependiera de que el `Queso, NFS` de USDA siga
 * teniendo 964 mg de sodio mediría a la USDA, no a nuestro código: lo que se
 * prueba es la REGLA, con una regla de juguete y fichas de juguete.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  applyGenericRule,
  checkVocabularyGuards,
  type BuildStats,
} from "./canonical";
import { loadCuration, type Curation, type GuardaVocabulario } from "./curation";
import { caveatDeSodio, esGenerico, formatearSodio, type GenericRule } from "./genericos";
import { lockPolitica, lockSchema, validateFood } from "./locks";
import type { CanonicalFood, Catalog } from "./types";

// --- andamios ---------------------------------------------------------------

const REGLA: GenericRule = {
  criteria_version: "dt13-test",
  marcadores_en: [", NFS", "NS as to"],
  umbral_sodio_mg: 400,
  plantilla_caveat: "Promedio de una familia: {sodio_mg} mg de sodio por 100 g.",
};

function food(overrides: Partial<CanonicalFood> = {}): CanonicalFood {
  return {
    id: "fdc-1",
    source: "usda_fndds",
    source_ref: "USDA FDC #1",
    names: { en: "Cheese, NFS", es: "Queso" },
    aliases: { es: [] },
    category: "Cheese",
    per_100g: {
      kcal: 100,
      protein_g: 5,
      carbs_g: 15,
      fat_g: 2,
      fiber_g: null,
      sat_fat_g: null,
      sugars_g: null,
      sodium_mg: 964,
    },
    portion_hints: [{ grams: 100, label_en: "1 cup", label_es: null }],
    default_portion_g: 100,
    provenance: { "per_100g.kcal": "usda_fndds" },
    deprecated: false,
    ...overrides,
  };
}

function catalog(foods: CanonicalFood[]): Catalog {
  return {
    kb_version: "3.0.0+testtest",
    generated_from: { selection: "test", sources: ["usda_fndds"] },
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
}

function tempDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "nutriscann-dt13-"));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

// --- la regla, pura ---------------------------------------------------------

test("un marcador de USDA hace genérica a la ficha, y solo el inglés decide", () => {
  assert.equal(esGenerico("Cheese, NFS", REGLA.marcadores_en), true);
  assert.equal(esGenerico("Beans, from dried, NS as to type, fat added", REGLA.marcadores_en), true);
  assert.equal(esGenerico("Bananas, raw", REGLA.marcadores_en), false);
  // El español NO decide: la curación borra el marcador a propósito, así que
  // buscarlo ahí sería buscar justo lo que la capa 3 se encarga de quitar.
  assert.equal(esGenerico("Queso", REGLA.marcadores_en), false);
});

test("`NFS` suelto no alcanza: el marcador es `, NFS`", () => {
  // `Latkes` o cualquier nombre que contuviera esas tres letras sin la coma no
  // es un genérico de USDA. El marcador declarado incluye el separador.
  assert.equal(esGenerico("NFS Brand cheese", REGLA.marcadores_en), false);
  assert.equal(esGenerico("Cheese, nfs", REGLA.marcadores_en), true, "y no distingue mayúsculas");
});

test("el caveat sale solo por encima del umbral, y trae el número de la ficha", () => {
  assert.equal(caveatDeSodio(964, REGLA), "Promedio de una familia: 964 mg de sodio por 100 g.");
  assert.equal(caveatDeSodio(400, REGLA), "Promedio de una familia: 400 mg de sodio por 100 g.", "el umbral entra");
  assert.equal(caveatDeSodio(399, REGLA), null);
  // `null` no es cero: una ficha sin dato de sodio no puede afirmar nada sobre él.
  assert.equal(caveatDeSodio(null, REGLA), null);
});

test("el número se escribe en español y sin depender de la intl del Node que corra", () => {
  assert.equal(formatearSodio(1757), "1.757");
  assert.equal(formatearSodio(421), "421");
  assert.equal(formatearSodio(12.5), "12,5");
  assert.equal(formatearSodio(1234567), "1.234.567");
});

// --- la regla aplicada al catálogo ------------------------------------------

test("la política marca al genérico y le agrega el caveat con su propio sodio", () => {
  const foods = [food()];
  const stats = emptyStats();
  applyGenericRule(foods, REGLA, stats);

  assert.equal(foods[0]?.generic, true);
  assert.deepEqual(foods[0]?.caveats, ["Promedio de una familia: 964 mg de sodio por 100 g."]);
  assert.equal(foods[0]?.provenance["generic"], "curation");
  assert.equal(foods[0]?.provenance["caveats"], "curation");
  assert.equal(stats.genericFoods, 1);
  assert.equal(stats.genericCaveats, 1);
});

test("un genérico de sodio bajo se marca igual, pero SIN caveat", () => {
  const foods = [food({ per_100g: { ...food().per_100g, sodium_mg: 12 } })];
  const stats = emptyStats();
  applyGenericRule(foods, REGLA, stats);

  assert.equal(foods[0]?.generic, true, "genérico es genérico, tenga el sodio que tenga");
  assert.equal(foods[0]?.caveats, undefined);
  assert.equal(stats.genericFoods, 1);
  assert.equal(stats.genericCaveats, 0);
});

test("el caveat generado se AGREGA: no pisa el que la curación escribió a mano", () => {
  const foods = [food({ caveats: ["Los valores vienen por 100 ml, no por 100 g."] })];
  applyGenericRule(foods, REGLA, emptyStats());

  assert.deepEqual(foods[0]?.caveats, [
    "Los valores vienen por 100 ml, no por 100 g.",
    "Promedio de una familia: 964 mg de sodio por 100 g.",
  ]);
});

test("un alimento manual o de receta NO se marca genérico, aunque su inglés lo diga", () => {
  // No promedian ninguna familia: los escribió o los derivó la curación para un
  // plato concreto, y su reserva ya está escrita a mano en sus caveats.
  const foods = [
    food({ id: "manual-x", source: "manual", source_ref: "Etiqueta", names: { en: "Soup, NFS", es: "Sopa" } }),
    food({ id: "receta-x", source: "receta", source_ref: "Receta", names: { en: "Stew, NFS", es: "Guiso" } }),
  ];
  const stats = emptyStats();
  applyGenericRule(foods, REGLA, stats);

  assert.equal(foods[0]?.generic, undefined);
  assert.equal(foods[1]?.generic, undefined);
  assert.equal(stats.genericFoods, 0);
});

test("sin regla declarada la política no hace nada (la ausencia se tolera)", () => {
  const foods = [food()];
  const stats = emptyStats();
  applyGenericRule(foods, null, stats);
  assert.equal(foods[0]?.generic, undefined);
  assert.equal(stats.genericFoods, 0);
});

// --- el candado -------------------------------------------------------------

test("candado 1: un genérico sin marcar rompe el build", () => {
  const problems = validateFood(food(), REGLA);
  assert.ok(problems.some((p) => p.includes("no está marcada")), problems.join(" | "));
});

test("candado 1: un genérico de sodio alto sin su caveat rompe el build", () => {
  const problems = validateFood(food({ generic: true }), REGLA);
  assert.ok(problems.some((p) => p.includes("no trae el caveat generado")), problems.join(" | "));
});

test("candado 1: una ficha marcada genérica que no lo es rompe el build", () => {
  const problems = validateFood(food({ names: { en: "Bananas, raw", es: "Banana" }, generic: true }), REGLA);
  assert.ok(problems.some((p) => p.includes("no trae ningún marcador")), problems.join(" | "));
});

test("candado 1: `generic: false` no existe — la clave está o no está", () => {
  const raro = { ...food(), generic: false } as unknown as CanonicalFood;
  assert.ok(validateFood(raro, REGLA).some((p) => p.includes("solo puede valer true")));
});

test("candado 1: en un alimento de USDA solo entra el caveat que genera la DT-13", () => {
  const conCaveatAjeno = food({
    generic: true,
    caveats: ["Promedio de una familia: 964 mg de sodio por 100 g.", "Esto lo escribí a mano"],
  });
  const problems = validateFood(conCaveatAjeno, REGLA);
  assert.ok(problems.some((p) => p.includes("solo puede traer el caveat generado")), problems.join(" | "));
});

test("candado 1: sin la regla en la mano, un caveat en un alimento de USDA se sigue rechazando", () => {
  // La puerta existe solo con la llave: si el candado no recibe la política, un
  // caveat en una ficha de USDA es un valor que entró por donde no hay puerta.
  const problems = validateFood(food({ generic: true, caveats: ["lo que sea"] }));
  assert.ok(problems.some((p) => p.includes("caveat generado")), problems.join(" | "));
});

test("candado 1: el mismo caveat generado DOS veces no pasa", () => {
  // El build no puede producirlo, pero el candado no está para describir lo que
  // el build hace hoy: un `includes` se conformaba con una copia.
  const repetido = food({
    generic: true,
    caveats: [
      "Promedio de una familia: 964 mg de sodio por 100 g.",
      "Promedio de una familia: 964 mg de sodio por 100 g.",
    ],
  });
  const problems = validateFood(repetido, REGLA);
  assert.ok(problems.some((p) => p.includes("aparece 2 veces")), problems.join(" | "));
});

test("candado 1: el genérico bien armado pasa limpio", () => {
  const bueno = food({ generic: true, caveats: ["Promedio de una familia: 964 mg de sodio por 100 g."] });
  assert.deepEqual(validateFood(bueno, REGLA), []);
});

// --- las guardas de vocabulario ---------------------------------------------

const GUARDA_CHORIZO: GuardaVocabulario[] = [
  { termino: "chorizo", prohibido_en: ["fdc-2705835"], motivo: "El bife de chorizo es un corte vacuno" },
];

function bife(overrides: Partial<CanonicalFood> = {}): CanonicalFood {
  return food({
    id: "fdc-2705835",
    names: { en: "Beef, steak, strip, NS as to fat eaten", es: "Bife de chorizo" },
    generic: true,
    caveats: ["Promedio de una familia: 964 mg de sodio por 100 g."],
    ...overrides,
  });
}

test("guarda: `Bife de chorizo` es un nombre CORRECTO — la guarda es por igualdad, no por subcadena", () => {
  const stats = emptyStats();
  checkVocabularyGuards([bife()], GUARDA_CHORIZO, stats);
  assert.deepEqual(stats.guardViolations, []);
});

test("guarda: `chorizo` de alias sobre el corte vacuno rompe el build", () => {
  const stats = emptyStats();
  checkVocabularyGuards([bife({ aliases: { es: ["Entrecot", "Chorizo"] } })], GUARDA_CHORIZO, stats);
  assert.equal(stats.guardViolations.length, 1);
  assert.match(stats.guardViolations[0]?.donde ?? "", /alias "Chorizo"/);
});

test("guarda: la confianza no salva — un `chorizo` a 0,5 sobre el corte también rompe", () => {
  // Una reserva dice "esto se parece". Acá no se parece: es otro alimento.
  const stats = emptyStats();
  const con = bife({ aliases: { es: [{ alias: "chorizo", confidence: 0.5 }] } });
  checkVocabularyGuards([con], GUARDA_CHORIZO, stats);
  assert.equal(stats.guardViolations.length, 1);
  assert.match(stats.guardViolations[0]?.donde ?? "", /confianza 0\.5/);
});

test("guarda: la comparación ignora tildes y mayúsculas", () => {
  const stats = emptyStats();
  checkVocabularyGuards([bife({ names: { en: "Beef", es: "CHORIZO" } })], GUARDA_CHORIZO, stats);
  assert.equal(stats.guardViolations.length, 1);
  assert.match(stats.guardViolations[0]?.donde ?? "", /names\.es/);
});

test("guarda: una guarda que apunta a una ficha que no existe no guarda nada, y se reporta", () => {
  const stats = emptyStats();
  checkVocabularyGuards([food()], GUARDA_CHORIZO, stats);
  assert.equal(stats.guardViolations.length, 1);
  assert.match(stats.guardViolations[0]?.donde ?? "", /no está en el catálogo/);
});

test("candado 1: una guarda violada hace fallar el candado de esquema", () => {
  const stats = emptyStats();
  stats.guardViolations.push({
    id: "fdc-2705835",
    termino: "chorizo",
    donde: 'alias "Chorizo" con confianza 1',
    motivo: "es un corte vacuno",
  });
  const result = lockSchema(catalog([bife()]), stats, REGLA);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((f) => f.includes("guarda de vocabulario")), result.failures.join(" | "));
});

// --- la lectura de los archivos de curación ---------------------------------

test("sin genericos.dt13.json el build sigue: la ausencia se tolera", () => {
  const curation = loadCuration(tempDir());
  assert.equal(curation.genericRule, null);
  assert.deepEqual(curation.guardas, []);
  assert.deepEqual(curation.problems, []);
});

test("lee la política de genéricos del contrato acordado", () => {
  const dir = tempDir({
    "genericos.dt13.json": JSON.stringify({
      criteria_version: "dt13-v1",
      marcadores_en: [", NFS"],
      umbral_sodio_mg: 400,
      plantilla_caveat: "Promedio: {sodio_mg} mg.",
    }),
  });
  const curation = loadCuration(dir);
  assert.deepEqual(curation.problems, []);
  assert.equal(curation.genericRule?.umbral_sodio_mg, 400);
  assert.deepEqual(curation.genericRule?.marcadores_en, [", NFS"]);
});

test("una plantilla sin {sodio_mg} se rechaza: un caveat sin el número no informa nada", () => {
  const dir = tempDir({
    "genericos.dt13.json": JSON.stringify({
      criteria_version: "dt13-v1",
      marcadores_en: [", NFS"],
      umbral_sodio_mg: 400,
      plantilla_caveat: "El sodio puede variar.",
    }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.genericRule, null);
  assert.ok(curation.problems.some((p) => p.includes("{sodio_mg}")), curation.problems.join(" | "));
});

test("una política sin marcadores o con un umbral negativo se rechaza", () => {
  const dir = tempDir({
    "genericos.dt13.json": JSON.stringify({
      criteria_version: "dt13-v1",
      marcadores_en: [],
      umbral_sodio_mg: -1,
      plantilla_caveat: "{sodio_mg}",
    }),
  });
  const curation = loadCuration(dir);
  assert.equal(curation.genericRule, null);
  assert.ok(curation.problems.some((p) => p.includes("marcadores_en")));
  assert.ok(curation.problems.some((p) => p.includes("umbral_sodio_mg")));
});

test("una guarda sin motivo se rechaza: una prohibición sin razón se borra sola con el tiempo", () => {
  const dir = tempDir({
    "guardas.vocabulario.json": JSON.stringify({
      criteria_version: "guardas-v1",
      guardas: [{ termino: "chorizo", prohibido_en: ["fdc-2705835"] }],
    }),
  });
  const curation = loadCuration(dir);
  assert.deepEqual(curation.guardas, []);
  assert.ok(curation.problems.some((p) => p.includes("motivo")), curation.problems.join(" | "));
});

test("una guarda sin fichas donde regir se rechaza", () => {
  const dir = tempDir({
    "guardas.vocabulario.json": JSON.stringify({
      criteria_version: "guardas-v1",
      guardas: [{ termino: "chorizo", prohibido_en: [], motivo: "porque sí" }],
    }),
  });
  const curation = loadCuration(dir);
  assert.deepEqual(curation.guardas, []);
  assert.ok(curation.problems.some((p) => p.includes("prohibido_en")));
});

// --- candado 0: la política no puede desaparecer en silencio ----------------

const POLITICA_COMPLETA = {
  "genericos.dt13.json": JSON.stringify({
    criteria_version: "dt13-v1",
    marcadores_en: [", NFS"],
    umbral_sodio_mg: 400,
    plantilla_caveat: "Promedio: {sodio_mg} mg.",
  }),
  "guardas.vocabulario.json": JSON.stringify({
    criteria_version: "guardas-v1",
    guardas: [{ termino: "chorizo", prohibido_en: ["fdc-2705835"], motivo: "es un corte vacuno" }],
  }),
};

test("candado 0: con los dos archivos de política en su lugar, pasa", () => {
  const result = lockPolitica(loadCuration(tempDir(POLITICA_COMPLETA)));
  assert.equal(result.passed, true, result.failures.join(" | "));
  assert.match(result.detail, /dt13-v1/);
  assert.match(result.detail, /1 guarda/);
});

test("candado 0: sin genericos.dt13.json el build NO puede escribir", () => {
  // La falla que encontró el Q/A: el archivo se borraba y el build salía en
  // verde publicando un catálogo con cero marcas y cero caveats.
  const soloGuardas = { "guardas.vocabulario.json": POLITICA_COMPLETA["guardas.vocabulario.json"] };
  const result = lockPolitica(loadCuration(tempDir(soloGuardas)));
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((f) => f.includes("genericos.dt13.json")), result.failures.join(" | "));
});

test("candado 0: sin guardas.vocabulario.json el build NO puede escribir", () => {
  const soloRegla = { "genericos.dt13.json": POLITICA_COMPLETA["genericos.dt13.json"] };
  const result = lockPolitica(loadCuration(tempDir(soloRegla)));
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((f) => f.includes("guardas.vocabulario.json")), result.failures.join(" | "));
});

test("candado 0: una plantilla sin {sodio_mg} hace fallar el build, no imprime un ⚠", () => {
  const rota = {
    ...POLITICA_COMPLETA,
    "genericos.dt13.json": JSON.stringify({
      criteria_version: "dt13-v1",
      marcadores_en: [", NFS"],
      umbral_sodio_mg: 400,
      plantilla_caveat: "El sodio puede variar.",
    }),
  };
  const result = lockPolitica(loadCuration(tempDir(rota)));
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((f) => f.includes("{sodio_mg}")), result.failures.join(" | "));
});

test("candado 0: una política a MEDIAS también rompe, aunque lo que sobrevivió alcance", () => {
  // Dos guardas, una mal escrita: la que sobrevive haría pasar el chequeo de
  // "hay al menos una". Publicar la mitad de lo que Tomás aprobó y callar el
  // resto es peor que no publicar nada.
  const aMedias = {
    ...POLITICA_COMPLETA,
    "guardas.vocabulario.json": JSON.stringify({
      criteria_version: "guardas-v1",
      guardas: [
        { termino: "chorizo", prohibido_en: ["fdc-2705835"], motivo: "es un corte vacuno" },
        { termino: "morcilla", prohibido_en: ["fdc-9"] },
      ],
    }),
  };
  const curation = loadCuration(tempDir(aMedias));
  assert.equal(curation.guardas.length, 1, "la guarda buena sobrevive a la lectura");
  const result = lockPolitica(curation);
  assert.equal(result.passed, false);
  assert.ok(result.failures.some((f) => f.includes("motivo")), result.failures.join(" | "));
});

test("candado 0: sin la curación en la mano, el candado falla en vez de asumir", () => {
  const result = lockPolitica(null);
  assert.equal(result.passed, false);
  assert.match(result.detail, /AUSENTE/);
});

test("candado 0: un problema de forma en un archivo TOLERANTE no lo hace fallar", () => {
  // La tolerancia sigue valiendo donde valía: el vocabulario se escribe de a
  // poco y un catálogo sin traducir se publica igual. La excepción son los dos
  // archivos de política, y solo esos.
  const conNombresRotos = { ...POLITICA_COMPLETA, "names.es.json": JSON.stringify({ abc: { name: "X" } }) };
  const curation = loadCuration(tempDir(conNombresRotos));
  assert.ok(curation.problems.length > 0, "el problema se reporta igual");
  assert.equal(lockPolitica(curation).passed, true);
});

test("candado 0: la curación real del repo pasa el candado", () => {
  // El único test de este archivo que mira los archivos de verdad, y mira una
  // sola cosa: que la política aprobada esté declarada y bien formada.
  const result = lockPolitica(loadCuration());
  assert.equal(result.passed, true, result.failures.join(" | "));
});

test("candado 0: el tipo Curation no necesita andamio para el candado", () => {
  // Chequeo de forma: `lockPolitica` mira dos campos y nada más, así que un
  // objeto construido a mano alcanza para probarlo sin tocar el disco.
  const armada: Pick<Curation, "genericRule" | "guardas" | "problems"> = {
    genericRule: REGLA,
    guardas: [{ termino: "chorizo", prohibido_en: ["fdc-1"], motivo: "porque" }],
    problems: [],
  };
  assert.equal(lockPolitica(armada as Curation).passed, true);
});
