/**
 * Los candados del motor entero: de lo que vio el modelo al reporte.
 *
 * Acá se mide lo que el usuario termina viendo — la confianza compuesta, los
 * items sin ficha y la cola de curación — contra el catálogo real.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analizarEscaneo } from "./analyze";
import { FACTOR_COMPOSICION, FACTOR_GENERICO } from "./constants";
import { redondear } from "./match";
import { indiceReal } from "./testing";
import type { VisionResult } from "./types";

const index = indiceReal();

const escaneo = (items: VisionResult["items"]): VisionResult => ({ is_food: true, items });

describe("la foto que no es comida", () => {
  it("no produce items, ni totales, ni cola", () => {
    const r = analizarEscaneo({ is_food: false, items: [] }, index);
    assert.equal(r.es_comida, false);
    assert.deepEqual(r.items, []);
    assert.equal(r.totals, null);
    assert.deepEqual(r.curation_candidates, []);
    assert.equal(r.kb_version, index.kb_version);
  });
});

describe("la confianza se COMPONE", () => {
  it("visión × matching", () => {
    const r = analizarEscaneo(escaneo([{ food_en: "Chorizo", grams: 100, confidence: 0.9 }]), index);
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.confidence_vision, 0.9);
    assert.equal(item.confidence_match, 1);
    assert.equal(item.confidence, 0.9);
  });

  it("una ficha genérica descuenta el factor declarado y lo dice en el motivo", () => {
    // `Bife de chorizo` es `Beef, steak, strip, NS as to fat eaten`: genérica.
    const r = analizarEscaneo(escaneo([{ food_en: "Bife de chorizo", grams: 200, confidence: 1 }]), index);
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.food_id, "fdc-2705835");
    assert.equal(item.generic, true);
    assert.equal(item.confidence_match, FACTOR_GENERICO);
    assert.equal(item.confidence, FACTOR_GENERICO);
    assert.match(item.motivo, /genérica/);
  });

  it("la confianza de la visión fuera de rango se sanea, no se propaga", () => {
    const r = analizarEscaneo(
      escaneo([
        { food_en: "Chorizo", grams: 100, confidence: 5 },
        { food_en: "Chorizo", grams: 100, confidence: Number.NaN },
      ]),
      index,
    );
    assert.equal(r.items[0]?.confidence_vision, 1);
    assert.equal(r.items[1]?.confidence_vision, 0);
  });
});

describe("los números salen de la ficha, no del modelo", () => {
  it("nutrients = per_100g × gramos / 100, con la traza a USDA al lado", () => {
    const r = analizarEscaneo(escaneo([{ food_en: "Chorizo", grams: 50, confidence: 1 }]), index);
    const item = r.items[0];
    assert.ok(item?.per_100g && item.nutrients);
    assert.equal(item.nutrients.kcal, Math.round(item.per_100g.kcal * 0.5 * 1000) / 1000);
    assert.ok(item.source_ref?.startsWith("USDA FDC"));
    assert.equal(r.totals?.nutrients.kcal, item.nutrients.kcal);
  });
});

describe("el alimento que el catálogo no tiene", () => {
  const r = analizarEscaneo(
    escaneo([
      { food_en: "Chorizo", grams: 100, confidence: 1 },
      { food_en: "Zzzz plato inexistente qqq", grams: 150, confidence: 0.8 },
    ]),
    index,
  );
  const desconocido = r.items[1];

  it("queda sin ficha y SIN NÚMEROS (regla dura 2: un número sin ficha no existe)", () => {
    assert.ok(desconocido);
    assert.equal(desconocido.match, "no_catalogado");
    assert.equal(desconocido.food_id, null);
    assert.equal(desconocido.per_100g, null);
    assert.equal(desconocido.nutrients, null);
    assert.equal(desconocido.confidence, 0);
  });

  it("no arrastra el resto del escaneo: los totales se calculan con lo que sí hay", () => {
    assert.ok(r.totals);
    assert.equal(r.totals.items_incluidos, 1);
    assert.equal(r.totals.items_sin_datos, 1);
    assert.equal(r.totals.completo, false);
  });

  it("entra a la cola de curación", () => {
    const candidato = r.curation_candidates.find((c) => c.termino_en === "Zzzz plato inexistente qqq");
    assert.ok(candidato);
    assert.equal(candidato.motivo, "sin_match");
    assert.equal(candidato.grams, 150);
  });

  it("el mismo término repetido entra UNA sola vez a la cola", () => {
    const dos = analizarEscaneo(
      escaneo([
        { food_en: "Zzzz plato inexistente qqq", grams: 100, confidence: 1 },
        { food_en: "Zzzz plato inexistente qqq", grams: 200, confidence: 1 },
      ]),
      index,
    );
    assert.equal(dos.items.length, 2);
    assert.equal(dos.curation_candidates.length, 1);
    assert.equal(dos.totals, null);
  });
});

describe("el plato que se compone en el momento", () => {
  const vision = escaneo([
    {
      food_en: "Zzzz plato sin ficha qqq",
      grams: 300,
      confidence: 0.9,
      preparation: "mezclado",
      components: [
        { food_en: "Rice noodles, cooked", grams: 200 },
        { food_en: "Chorizo", grams: 100 },
      ],
    },
  ]);
  const r = analizarEscaneo(vision, index);
  const item = r.items[0];

  it("cuantifica con la cuenta entera a la vista", () => {
    assert.ok(item);
    assert.equal(item.match, "compuesto");
    assert.equal(item.food_id, null);
    assert.ok(item.nutrients);
    assert.ok(item.composicion);
    assert.equal(item.composicion.componentes.length, 2);
    assert.equal(item.composicion.peso_entrada_g, 300);
    assert.equal(item.composicion.peso_final_g, 300);
    assert.deepEqual(
      item.composicion.componentes.map((c) => c.food_id),
      ["fdc-168914", "fdc-2706179"],
    );
  });

  it("descuenta el factor de composición: la proporción la estimó una foto", () => {
    assert.ok(item);
    assert.equal(item.confidence_match, FACTOR_COMPOSICION);
    assert.equal(item.confidence, redondear(0.9 * FACTOR_COMPOSICION));
  });

  it("un compuesto TAMBIÉN alimenta la curación: el catálogo aprende del uso", () => {
    const candidato = r.curation_candidates.find((c) => c.motivo === "compuesto_en_runtime");
    assert.ok(candidato);
    assert.equal(candidato.termino_en, "Zzzz plato sin ficha qqq");
    assert.equal(candidato.componentes?.length, 2);
  });

  it("si falta un ingrediente NO se compone y se registran los dos faltantes", () => {
    const roto = analizarEscaneo(
      escaneo([
        {
          food_en: "Zzzz plato sin ficha qqq",
          grams: 300,
          confidence: 0.9,
          components: [
            { food_en: "Rice noodles, cooked", grams: 200 },
            { food_en: "Zzzz ingrediente raro qqq", grams: 100 },
          ],
        },
      ]),
      index,
    );
    assert.equal(roto.items[0]?.match, "no_catalogado");
    assert.equal(roto.items[0]?.nutrients, null);
    assert.deepEqual(
      roto.curation_candidates.map((c) => c.motivo).sort(),
      ["componente_sin_match", "sin_match"],
    );
  });

  it("si la visión no estimó los gramos del plato, se usa el peso final de la receta", () => {
    const sinGramos = analizarEscaneo(
      escaneo([
        {
          food_en: "Zzzz plato sin ficha qqq",
          grams: 0,
          confidence: 1,
          components: [{ food_en: "Rice noodles, cooked", grams: 180 }],
        },
      ]),
      index,
    );
    assert.equal(sinGramos.items[0]?.grams, 180);
  });
});

describe("F2 — la frontera: entradas malformadas NO lanzan", () => {
  /**
   * El motor declaraba "nunca lanza" y el Q/A demostró que sí: `vision` nulo, un
   * item nulo adentro de `items`, un componente nulo, un `food_en` que llega
   * como número (`texto.normalize is not a function`). Los tipos describen lo
   * que esperamos; lo que llega es un JSON armado por un modelo.
   */
  const malformadas: [string, unknown][] = [
    ["vision null", null],
    ["vision undefined", undefined],
    ["vision string", "no soy un objeto"],
    ["items no es array", { is_food: true, items: "nada" }],
    ["items con null adentro", { is_food: true, items: [null] }],
    ["item sin campos", { is_food: true, items: [{}] }],
    ["food_en numérico", { is_food: true, items: [{ food_en: 42, grams: 100, confidence: 0.9 }] }],
    ["food_en objeto", { is_food: true, items: [{ food_en: { a: 1 }, grams: 100, confidence: 0.9 }] }],
    ["grams string", { is_food: true, items: [{ food_en: "Chorizo", grams: "cien", confidence: 0.9 }] }],
    ["confidence string", { is_food: true, items: [{ food_en: "Chorizo", grams: 100, confidence: "alta" }] }],
    ["components no es array", { is_food: true, items: [{ food_en: "x", grams: 100, confidence: 1, components: 7 }] }],
    ["component null", { is_food: true, items: [{ food_en: "x", grams: 100, confidence: 1, components: [null] }] }],
    [
      "component con food_en numérico",
      { is_food: true, items: [{ food_en: "x", grams: 100, confidence: 1, components: [{ food_en: 9, grams: 50 }] }] },
    ],
    [
      "preparation inventada",
      { is_food: true, items: [{ food_en: "x", grams: 100, confidence: 1, preparation: "al vapor", components: [{ food_en: "Chorizo", grams: 100 }] }] },
    ],
    [
      "preparation = constructor",
      { is_food: true, items: [{ food_en: "x", grams: 100, confidence: 1, preparation: "constructor", components: [{ food_en: "Chorizo", grams: 100 }] }] },
    ],
    ["is_food ausente", { items: [{ food_en: "Chorizo", grams: 100, confidence: 1 }] }],
  ];

  for (const [nombre, entrada] of malformadas) {
    it(`${nombre} → responde, no explota`, () => {
      const r = analizarEscaneo(entrada as VisionResult, index);
      assert.ok(r, nombre);
      assert.equal(typeof r.es_comida, "boolean");
      assert.ok(Array.isArray(r.items));
      assert.ok(Array.isArray(r.curation_candidates));
      assert.equal(r.kb_version, index.kb_version);
      for (const item of r.items) {
        assert.equal(typeof item.termino_en, "string");
        assert.ok(item.confidence >= 0 && item.confidence <= 1);
        assert.ok(typeof item.motivo === "string" && item.motivo.length > 0);
      }
    });
  }

  it("un `food_en` que no es texto queda no_catalogado, sin números", () => {
    const r = analizarEscaneo({ is_food: true, items: [{ food_en: 42, grams: 100, confidence: 0.9 }] } as unknown as VisionResult, index);
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.termino_en, "");
    assert.equal(item.match, "no_catalogado");
    assert.equal(item.nutrients, null);
  });

  it("una `preparation` fuera del enum degrada a `mezclado` (límite declarado)", () => {
    const r = analizarEscaneo(
      {
        is_food: true,
        items: [
          { food_en: "Zzzz plato raro qqq", grams: 100, confidence: 1, preparation: "al vapor", components: [{ food_en: "Chorizo", grams: 100 }] },
        ],
      } as unknown as VisionResult,
      index,
    );
    assert.equal(r.items[0]?.match, "compuesto");
    assert.equal(r.items[0]?.composicion?.metodo, "mezclado");
  });
});

describe("F5 — unos gramos que no se pudieron estimar dejan rastro", () => {
  for (const [nombre, grams] of [
    ["NaN", Number.NaN],
    ["negativos", -5],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["cero", 0],
  ] as [string, number][]) {
    it(`${nombre}: se sabe QUÉ es, se declara que no se sabe CUÁNTO`, () => {
      const r = analizarEscaneo(escaneo([{ food_en: "Chorizo", grams, confidence: 0.9 }]), index);
      const item = r.items[0];
      assert.ok(item);
      // La ficha se conserva: el alimento se identificó bien.
      assert.equal(item.food_id, "fdc-2706179");
      assert.ok(item.per_100g);
      // Pero NO se cuantifica con un cero inventado.
      assert.equal(item.nutrients, null);
      assert.equal(item.grams_no_estimados, true);
      assert.match(item.motivo, /gramos/);
      assert.ok((item.caveats ?? []).length > 0);
      // Y el escaneo entero deja de declararse completo.
      assert.equal(r.totals, null);
    });
  }

  it("baja `completo` y suma a `items_sin_datos` cuando hay otros items sanos", () => {
    const r = analizarEscaneo(
      escaneo([
        { food_en: "Chorizo", grams: 100, confidence: 1 },
        { food_en: "Rice noodles, cooked", grams: Number.NaN, confidence: 1 },
      ]),
      index,
    );
    assert.ok(r.totals);
    assert.equal(r.totals.completo, false);
    assert.equal(r.totals.items_incluidos, 1);
    assert.equal(r.totals.items_sin_datos, 1);
  });

  it("un COMPUESTO sí recupera la masa: la suman sus ingredientes, y lo declara", () => {
    const r = analizarEscaneo(
      escaneo([
        {
          food_en: "Zzzz plato sin ficha qqq",
          grams: Number.NaN,
          confidence: 1,
          components: [{ food_en: "Rice noodles, cooked", grams: 180 }],
        },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.grams, 180);
    assert.ok(item.nutrients);
    assert.match((item.caveats ?? []).join(" "), /gramos imposibles/);
  });
});

describe("determinismo", () => {
  it("el mismo escaneo dos veces da el mismo byte", () => {
    const vision = escaneo([
      { food_en: "Chorizo", grams: 80, confidence: 0.77 },
      { food_en: "Pastel de carne casero", grams: 210, confidence: 0.61 },
      { food_en: "Zzzz plato inexistente qqq", grams: 30, confidence: 0.4 },
    ]);
    const a = JSON.stringify(analizarEscaneo(vision, index));
    const b = JSON.stringify(analizarEscaneo(vision, index));
    assert.equal(a, b);
  });
});
