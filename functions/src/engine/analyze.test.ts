/**
 * Los candados del motor entero: de lo que vio el modelo al reporte.
 *
 * Acá se mide lo que el usuario termina viendo — la confianza compuesta, los
 * items sin ficha y la cola de curación — contra el catálogo real.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analizarEscaneo } from "./analyze";
import { CONFIANZA_MINIMA_PARA_UN_TOTAL, FACTOR_COMPOSICION, FACTOR_GENERICO } from "./constants";
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
