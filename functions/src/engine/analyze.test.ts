/**
 * Los candados del motor entero: de lo que vio el modelo al reporte.
 *
 * Acá se mide lo que el usuario termina viendo — la confianza compuesta, los
 * items sin ficha y la cola de curación — contra el catálogo real.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analizarEscaneo } from "./analyze";
import {
  CONFIANZA_CABEZA_FAMILIA,
  CONFIANZA_CABEZA_SUBFAMILIA,
  CONFIANZA_MINIMA_PARA_UN_TOTAL,
  FACTOR_COMPOSICION,
  FACTOR_GENERICO,
} from "./constants";
import { redondear } from "./match";
import { fichaFalsa, indiceDeFixture, indiceReal } from "./testing";
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

describe("card 2.6 — el escaneo con los dos nombres", () => {
  it("un plato que el inglés no sabe nombrar deja de salir sin datos", () => {
    // El item 03 del test de los 10 platos, letra por letra: la visión describió
    // una paella como "arroz cocido estilo paella de mariscos" y el motor
    // devolvía `no_catalogado` con `nutrients: null`, teniendo la ficha.
    const r = analizarEscaneo(
      escaneo([
        { food_en: "rice, cooked, seafood paella style", food_es: "paella", grams: 350, confidence: 0.75 },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.food_id, "fdc-2706723");
    assert.equal(item.match, "alias");
    assert.equal(item.generic, true);
    assert.ok(item.nutrients !== null, "ahora SÍ hay números");
    assert.equal(item.confidence, redondear(0.75 * FACTOR_GENERICO));
    assert.deepEqual(r.curation_candidates, [], "no entra a la cola: el catálogo sí lo tenía");
    assert.equal(r.totals?.completo, true);
  });

  it("el término en español también resuelve los INGREDIENTES de un compuesto", () => {
    const r = analizarEscaneo(
      escaneo([
        {
          food_en: "zzz unknown dish qqq",
          food_es: "zzz plato inexistente qqq",
          grams: 300,
          confidence: 0.8,
          preparation: "mezclado",
          components: [
            { food_en: "zzz unknown grain qqq", food_es: "arroz blanco cocido", grams: 200 },
            { food_en: "Chorizo", grams: 100 },
          ],
        },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "compuesto");
    assert.equal(item.composicion?.componentes[0]?.food_id, "fdc-2708403");
  });

  it("el total de un plato que antes salía en 43,6 kcal ahora se puede sumar", () => {
    // La foto 07 del test: bife + papas + ensalada + kétchup + salsa. El sistema
    // devolvía 43,6 kcal de ~700 reales porque solo matcheaba el kétchup, y lo
    // declaraba incompleto. Lo que se mide acá no es el número exacto —depende de
    // los gramos que estime la visión— sino que ya NO haya items sin datos.
    const r = analizarEscaneo(
      escaneo([
        { food_en: "beef steak, grilled", food_es: "bife", grams: 180, confidence: 0.9 },
        { food_en: "french fries, fried", food_es: "papas fritas", grams: 180, confidence: 0.95 },
        { food_en: "coleslaw, cabbage and carrot salad", food_es: "coleslaw", grams: 120, confidence: 0.85 },
        { food_en: "ketchup", food_es: "kétchup", grams: 40, confidence: 0.9 },
        { food_en: "gravy, brown sauce", food_es: "salsa de carne", grams: 40, confidence: 0.6 },
      ]),
      index,
    );
    assert.equal(r.totals?.items_sin_datos, 0);
    assert.equal(r.totals?.completo, true);
    assert.equal(r.totals?.grams_cuantificados, 560);
    assert.ok((r.totals?.nutrients.kcal ?? 0) > 400, `${r.totals?.nutrients.kcal} kcal`);
  });

  it("y la arepa SIGUE saliendo sin datos, que es lo correcto", () => {
    // El candado de que el recall se abrió sin abrir la puerta a inventar: el
    // queso que lleva adentro no puede reemplazar al plato que lo lleva.
    //
    // EL ESCENARIO SE CONSTRUYE, Y ACÁ HUBO QUE RECONSTRUIRLO (card 6.1). La
    // versión anterior se apoyaba en un hueco del catálogo real ("arepa = 0
    // coincidencias, verificado") y el hueco se cerró: la curación de la WS06
    // sumó `fdc-168070` *Arepa*. La REGLA que este test defiende no cambió —lo
    // que viene detrás de un conector es un acompañamiento— y ahora se mide sobre
    // un índice donde el plato no está y el relleno sí, que es exactamente la
    // situación que la regla existe para resolver. Un candado que depende de que
    // al catálogo le siga faltando algo no es un candado: es una casualidad.
    const sinElPlato = indiceDeFixture([
      fichaFalsa({ id: "test-queso", names: { en: "Cheese, NFS", es: "Queso" } }),
      fichaFalsa({ id: "test-pan", names: { en: "Bread, NFS", es: "Pan" } }),
    ]);
    const r = analizarEscaneo(
      escaneo([{ food_en: "arepa, grilled, filled with cheese", food_es: "arepa", grams: 150, confidence: 0.85 }]),
      sinElPlato,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "no_catalogado");
    assert.equal(item.nutrients, null);
    assert.equal(item.confidence, 0);
    assert.equal(r.curation_candidates[0]?.motivo, "sin_match");
  });
});

describe("card 2.8 — el motor entero contra la comida de plástico", () => {
  /**
   * EL PLATO 28 DEL GOLDEN SET, DE PUNTA A PUNTA. Dos réplicas de resina en una
   * vitrina que la visión leyó como comida con un 70 % de confianza, matchearon a
   * `Miel` por una palabra del nombre del postre, y salieron como **1.550,4 kcal
   * marcadas `completo: true`**.
   *
   * El escenario se CONSTRUYE con un fixture y no con el catálogo real: lo que
   * este test tiene que medir es la compuerta, y hacerlo depender de que una
   * ficha del catálogo siga dando un match de 0,088 sería atar el candado a una
   * curación que se mueve. Lo que se reproduce es la FORMA del plato 28: todos
   * los ítems cuantificados, todos por debajo del piso.
   */
  const fixture = indiceDeFixture([
    fichaFalsa({
      id: "test-miel",
      names: { en: "Honey", es: "Miel" },
      per_100g: {
        kcal: 304, protein_g: 0.3, carbs_g: 82.4, fat_g: 0,
        fiber_g: 0.2, sat_fat_g: 0, sugars_g: 82.12, sodium_mg: 4,
      },
    }),
    fichaFalsa({ id: "test-otro", names: { en: "Zzz alimento de relleno", es: null } }),
  ]);

  const plastico = (): VisionResult =>
    escaneo([
      { food_en: "honey toast with whipped cream and cookie, dessert", grams: 250, confidence: 0.7 },
      { food_en: "honey toast with whipped cream and banana, dessert", grams: 260, confidence: 0.7 },
    ]);

  it("los dos ítems matchean, quedan por el piso, y el total deja de ser completo", () => {
    const r = analizarEscaneo(plastico(), fixture);
    assert.equal(r.items.length, 2);
    for (const item of r.items) {
      assert.equal(item.food_id, "test-miel", "el ítem sigue mostrando su ficha");
      assert.ok(item.nutrients !== null, "y sigue mostrando sus números");
      assert.ok(item.confidence < CONFIANZA_MINIMA_PARA_UN_TOTAL, `confianza ${item.confidence}`);
    }
    assert.ok(r.totals);
    assert.equal(r.totals.completo, false);
    assert.equal(r.totals.items_sin_datos, 0, "no falta ningún ítem: lo que falta es confianza");
    assert.equal(r.totals.macro_pct, null);
    assert.match(r.totals.macro_pct_motivo ?? "", /confianza suficiente/);
  });

  it("el mismo plato con la visión segura de lo que vio SÍ publica su total", () => {
    // La compuerta no castiga el plato: castiga la duda. Con la misma ficha y los
    // mismos gramos, una identificación firme pasa.
    const seguro = escaneo([{ food_en: "Honey", grams: 250, confidence: 0.9 }]);
    const r = analizarEscaneo(seguro, fixture);
    assert.ok(r.totals);
    assert.equal(r.totals.completo, true);
    assert.ok(r.totals.macro_pct !== null);
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

/**
 * DT-37 — EL PLATO 05 DEL GOLDEN, DE PUNTA A PUNTA (card 6.5).
 *
 * La única regresión ✅→🟡 de la corrida v3, contra el catálogo REAL: acá el caso
 * ES el catálogo real —la ficha `fdc-2708755` con su alias corto `Lasaña` y su
 * nombre largo— y un fixture no lo reproduciría. El término en español es el que
 * la visión escribió aquel día, reconstruido desde el motivo grabado (el
 * expediente no guarda `food_es`: DT-25) y verificado contra el número exacto de
 * la corrida: difuso 0,099 de matching, 0,084 de confianza final.
 */
describe("DT-37 — la lasaña del plato 05 vuelve a publicar su total", () => {
  const lasana = (): VisionResult =>
    escaneo([
      {
        food_en: "lasagna, meat and spinach ricotta",
        food_es: "lasaña de carne con espinaca y ricotta",
        grams: 350,
        confidence: 0.85,
      },
    ]);

  it("la ficha correcta, la confianza de la corrida v3, y el total publicado", () => {
    const r = analizarEscaneo(lasana(), index);
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.food_id, "fdc-2708755", "la ficha que el ✅ escrito pedía");
    assert.equal(item.match, "difuso");
    assert.equal(item.confidence_match, 0.099, "el número exacto de la corrida v3");
    assert.equal(item.confidence, 0.084, "y por debajo del piso de 0,12");
    assert.ok(item.confidence < CONFIANZA_MINIMA_PARA_UN_TOTAL);
    assert.equal(item.identidad_respaldada, true, "pero la ficha NOMBRA lo que se describió");

    assert.ok(r.totals);
    assert.equal(r.totals.total_no_publicable, undefined);
    assert.equal(r.totals.nutrients.kcal, 724.5, "350 g × 207 kcal/100 g");
    assert.equal(r.totals.completo, true);
    assert.ok(r.totals.macro_pct !== null);
  });

  it("y la comida de plástico del 28 sigue muda, con el catálogo real", () => {
    // El contra-caso, y contra el catálogo de verdad: si la segunda puerta se
    // abriera de más, el plato que hizo nacer la compuerta volvería a publicar
    // 1.550 kcal de resina.
    const r = analizarEscaneo(
      escaneo([
        { food_en: "honey toast with whipped cream and cookie", food_es: "tostada con miel y nata", grams: 250, confidence: 0.6 },
        {
          food_en: "honey toast with whipped cream and chocolate banana",
          food_es: "tostada con miel, nata y plátano",
          grams: 260,
          confidence: 0.6,
        },
      ]),
      index,
    );
    for (const item of r.items) {
      assert.equal(item.food_id, "fdc-169640", "sigue matcheando a Miel");
      assert.equal(item.identidad_respaldada, undefined, "y la miel no nombra el postre");
    }
    assert.ok(r.totals);
    assert.equal(r.totals.total_no_publicable, true);
    assert.equal(r.totals.nutrients.kcal, null);
    assert.equal(r.totals.completo, false);
  });
});

/* ===========================================================================
 * CARD 5.3 — LA CASCADA NUEVA, DE PUNTA A PUNTA
 *
 * Seis escalones y el orden es la card entera. Cada test de acá abajo fija UNO
 * de los escalones con el caso que lo justifica, y todos los casos salen del
 * Bloque 0 de la Fase 5 (`kb/cobertura/familias.bloque0.md`).
 * =========================================================================== */

describe("card 5.3 — escalón 1: el término gana SIEMPRE que llegue", () => {
  it("EL ATÚN EN LATA: la cabeza no le pisa la ficha ni cuando el término entró por difuso", () => {
    // El caso que ordena toda la cascada. `tuna, canned` llega a `Atún` (85
    // kcal/100 g) por un difuso flojo, 0,27. La cabeza de su subfamilia
    // (`pescado/cocinado`) es `Pescado`, 238 kcal: reemplazarla sería un +180 %.
    const r = analizarEscaneo(
      escaneo([
        { food_en: "tuna, canned", food_es: "atún en lata", grams: 100, confidence: 0.9, familia_subfamilia: "pescado/cocinado" },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "difuso");
    assert.equal(item.name_es, "Atún");
    assert.equal(item.per_100g?.kcal, 85);
  });

  it("un exacto tampoco se mueve, ni declarando otra familia entera", () => {
    // `Kétchup` es el nombre exacto de fdc-2709733. Aunque la visión declarara
    // una familia que no tiene nada que ver, un término que escribió la curación
    // no se resuelve por una lista que eligió un modelo.
    const r = analizarEscaneo(
      escaneo([
        { food_en: "ketchup", food_es: "kétchup", grams: 20, confidence: 0.9, familia_subfamilia: "fruta/fresca" },
      ]),
      index,
    );
    assert.equal(r.items[0]?.match, "exacto");
    assert.equal(r.items[0]?.name_es, "Kétchup");
  });

  it("un `familia_subfamilia` que no existe en el enum no rompe nada: se ignora", () => {
    const r = analizarEscaneo(
      escaneo([{ food_en: "ketchup", grams: 20, confidence: 0.9, familia_subfamilia: "no-existe/para-nada" }]),
      index,
    );
    assert.equal(r.items[0]?.match, "exacto");
  });
});

describe("card 5.3 — la contradicción entre el término y la familia declarada", () => {
  it("«Verdura» dejaba de ser verdura: el difuso la llevaba a ACEITE vegetal", () => {
    // Uno de los 15 casos graves del Bloque 0. El término «Verdura» caía en
    // `Aceite vegetal` (otra familia) con un difuso de 0,41.
    const r = analizarEscaneo(
      escaneo([
        { food_en: "Vegetables", food_es: "Verdura", grams: 100, confidence: 0.9, familia_subfamilia: "verdura/cruda" },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "cabeza_subfamilia");
    assert.equal(item.name_es, "Verdura cruda");
    // Y lo que pasó se cuenta donde se lee: qué ofrecía el nombre y por qué perdió.
    assert.match(item.caveats?.join(" ") ?? "", /Aceite vegetal.*otra familia/s);
  });

  it("«perrito caliente» NO se toca: entra por alias, y un alias lo escribió alguien", () => {
    // El peor caso del informe —lleva a la salchicha sin pan— y sobrevive a
    // propósito. La regla desarma conjeturas del motor, no decisiones curadas.
    // El arreglo de este caso es una guarda de vocabulario (deuda 7).
    const r = analizarEscaneo(
      escaneo([
        { food_en: "Hot dog", food_es: "Perrito caliente", grams: 100, confidence: 0.9, familia_subfamilia: "bocadillo/perrito" },
      ]),
      index,
    );
    assert.equal(r.items[0]?.match, "alias");
  });
});

describe("card 5.3 — escalones 4 y 5: las cabezas y la composición", () => {
  it("«arroz cocido» no llegaba a NADA y ahora llega a su cabeza", () => {
    // Uno de los 35 nombres de subfamilia mudos del Bloque 0. Con la subfamilia
    // declarada, sale con número y con la identidad respaldada.
    const r = analizarEscaneo(
      escaneo([
        { food_en: "cooked rice", food_es: "arroz cocido", grams: 150, confidence: 0.9, familia_subfamilia: "arroz/cocido" },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "cabeza_subfamilia");
    assert.equal(item.identidad_respaldada, true);
    assert.ok(item.nutrients !== null);
    // Y la cabeza llega con DOS reservas encima, no una: casi todas las cabezas
    // son fichas `generic` —miden el promedio de una familia, que es justamente
    // por lo que fueron elegidas— así que además del 0,5 de la cabeza se lleva
    // el descuento de genérico de la DT-13.
    assert.equal(item.generic, true);
    assert.equal(item.confidence_match, redondear(CONFIANZA_CABEZA_SUBFAMILIA * FACTOR_GENERICO));
    // Y publica total: es exactamente lo que la compuerta tenía que dejar pasar.
    assert.equal(r.totals?.total_no_publicable, undefined);
  });

  it("una subfamilia SIN cabeza baja a la de la familia, y confía menos", () => {
    // `ensalada/verdura` es uno de los 13 huecos declarados: cuatro ensaladas
    // con nombre propio y ningún promedio.
    const r = analizarEscaneo(
      escaneo([
        { food_en: "Zzzz qqq inexistente", food_es: "Zzzz qqq inexistente", grams: 150, confidence: 0.9, familia_subfamilia: "ensalada/verdura" },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "cabeza_familia");
    assert.equal(item.confidence_match, redondear(CONFIANZA_CABEZA_FAMILIA * (item.generic === true ? FACTOR_GENERICO : 1)));
    assert.ok(item.confidence_match < CONFIANZA_CABEZA_SUBFAMILIA);
    // La cabeza de familia NO respalda la identidad: dentro de una familia los
    // valores varían demasiado. Que publique o no queda en la confianza.
    assert.equal(item.identidad_respaldada, undefined);
  });

  it("EN MODO `componer` LA COMPOSICIÓN VA PRIMERO, aunque la subfamilia TENGA cabeza", () => {
    // Medido en el Bloque 0: responder un plato combinado por identidad le
    // aplica al plato entero la densidad de UN ingrediente (+76 % en el salmón).
    // `bocadillo/sandwich-frio` es de `componer` y ADEMÁS tiene cabeza
    // (`Sándwich`): es el escenario donde el orden importa de verdad.
    const bocadillo = (familia_subfamilia: string) =>
      analizarEscaneo(
        escaneo([
          {
            // Un nombre que NO llega a ninguna ficha, a propósito: si llegara,
            // ganaría el escalón 1 y este test no mediría el orden entre la
            // composición y la cabeza, que es lo que vino a medir.
            food_en: "Zzzz qqq wwww vvvv",
            food_es: "Zzzz qqq wwww vvvv",
            grams: 200,
            confidence: 0.9,
            familia_subfamilia,
            components: [
              { food_en: "Bread, NFS", grams: 120 },
              { food_en: "Ham, sliced", grams: 80 },
            ],
          },
        ]),
        index,
      );
    const componiendo = bocadillo("bocadillo/sandwich-frio").items[0];
    assert.ok(componiendo);
    assert.equal(componiendo.match, "compuesto");
    assert.ok(componiendo.composicion);

    // Y la contraprueba, que es la que demuestra que el `modo` es lo que decide:
    // el MISMO plato declarado en una subfamilia de `identificar` contesta con
    // la ficha, no con la suma.
    const identificando = bocadillo("pizza/con-carne").items[0];
    assert.ok(identificando);
    assert.equal(identificando.match, "cabeza_subfamilia");
  });

  it("en modo `identificar` manda la cabeza, y la composición queda de respaldo", () => {
    // La pizza: `pizza/*` es `identificar`, así que con la subfamilia declarada
    // contesta `Pizza con carne` (280 kcal/100 g) y no la suma de ingredientes.
    const r = analizarEscaneo(
      escaneo([
        {
          food_en: "pizza with ham and mushrooms",
          food_es: "pizza de jamón y champiñones",
          grams: 150,
          confidence: 0.85,
          familia_subfamilia: "pizza/con-carne",
          preparation: "horneado_masa",
          components: [
            { food_en: "pizza dough, baked", grams: 80 },
            { food_en: "mozzarella cheese, melted", grams: 35 },
            { food_en: "ham, sliced", grams: 20 },
            { food_en: "mushrooms, sliced", grams: 15 },
          ],
        },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "cabeza_subfamilia");
    assert.equal(item.food_id, "fdc-2708649");
    assert.equal(item.per_100g?.kcal, 280);
    assert.equal(item.nutrients?.kcal, 420);
    assert.equal(r.totals?.total_no_publicable, undefined);
    assert.equal(r.totals?.completo, true);
  });
});

describe("card 5.3 — LA PIZZA DEL 02/09, tal como salió de la visión ese día", () => {
  // Sin `familia_subfamilia` en ningún lado: es la salida VIEJA, la que dejó al
  // usuario sin números. Con el motor nuevo tiene que salir con número, y sale
  // componiendo, porque la curación declaró el sustituto de la masa.
  const pizza = () =>
    analizarEscaneo(
      escaneo([
        {
          food_en: "pizza with ham and mushrooms",
          food_es: "pizza de jamón y champiñones",
          grams: 150,
          confidence: 0.85,
          preparation: "horneado_masa",
          components: [
            { food_en: "pizza dough, baked", food_es: "masa de pizza horneada", grams: 80 },
            { food_en: "mozzarella cheese, melted", food_es: "mozzarella fundida", grams: 35 },
            { food_en: "ham, sliced", food_es: "jamón en lonchas", grams: 20 },
            { food_en: "mushrooms, sliced", food_es: "champiñones laminados", grams: 15 },
          ],
        },
      ]),
      index,
    );

  it("sale CON números, y con el total publicable", () => {
    const r = pizza();
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "compuesto");
    assert.ok(item.nutrients !== null && item.nutrients.kcal > 0);
    assert.equal(r.totals?.total_no_publicable, undefined);
    assert.ok((r.totals?.nutrients.kcal ?? 0) > 300);
  });

  it("DT-19 — el plato compuesto tiene nombre en ESPAÑOL, no el inglés de la visión", () => {
    // Un usuario español leía "Chicken and pepper skewer" sobre su brocheta.
    assert.equal(pizza().items[0]?.name_es, "pizza de jamón y champiñones");
  });

  it("y el reparto de macros del total suma 100", () => {
    const macro = pizza().totals?.macro_pct;
    assert.ok(macro);
    assert.equal(redondear(macro.protein + macro.carbs + macro.fat, 1), 100);
  });
});

describe("card 5.3 — la composición parcial, en el reporte", () => {
  it("sale con su propio sello, declara qué faltó, y el faltante va a la curación", () => {
    const r = analizarEscaneo(
      escaneo([
        {
          food_en: "plato raro",
          food_es: "plato raro",
          grams: 250,
          confidence: 0.9,
          components: [
            { food_en: "Rice noodles, cooked", grams: 200 },
            { food_en: "Zzzz ingrediente inexistente qqq", grams: 50 },
          ],
        },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "compuesto_parcial");
    assert.equal(item.composicion?.parcial, true);
    assert.equal(item.composicion?.gramos_faltantes, 50);
    // El per_100g de lo resuelto se escala a la masa ENTERA del plato, y eso se
    // declara: `gramos_del_plato` es el número con el que se rehace la cuenta.
    assert.equal(item.composicion?.gramos_del_plato, 250);
    assert.equal(item.grams, 250);
    assert.match(item.caveats?.join(" ") ?? "", /Faltó 50 g/);
    assert.ok(r.curation_candidates.some((c) => c.motivo === "componente_sin_match"));
  });

  it("cuando falta demasiado, el plato cae a su cabeza CON EL MOTIVO de por qué no se compuso", () => {
    const r = analizarEscaneo(
      escaneo([
        {
          food_en: "Zzzz qqq plato inexistente",
          food_es: "Zzzz qqq plato inexistente",
          grams: 300,
          confidence: 0.9,
          familia_subfamilia: "arroz/plato",
          components: [
            { food_en: "Rice noodles, cooked", grams: 200 },
            { food_en: "Zzzz ingrediente inexistente qqq", grams: 100 },
          ],
        },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.match, "cabeza_subfamilia");
    assert.match(item.caveats?.join(" ") ?? "", /33\.3 % de lo que se vio/);
  });
});

describe("card 5.3 — la masa del plato contra la de sus ingredientes, en el reporte", () => {
  it("cuando la visión se contradice con ella misma, manda la suma de los ingredientes", () => {
    // 900 g de plato contra 200 g de ingredientes: los dos números no pueden ser
    // del mismo plato, y el que se puede rehacer es el segundo.
    const r = analizarEscaneo(
      escaneo([
        {
          food_en: "plato raro",
          grams: 900,
          confidence: 0.9,
          components: [{ food_en: "Rice noodles, cooked", grams: 200 }],
        },
      ]),
      index,
    );
    const item = r.items[0];
    assert.ok(item);
    assert.equal(item.grams, 200);
    assert.match(item.caveats?.join(" ") ?? "", /no pueden ser del mismo plato/);
  });
});
