/**
 * Los candados de la composición on-demand.
 *
 * EL TEST QUE VALE ES EL PRIMERO: las 53 recetas del catálogo se vuelven a
 * componer EN RUNTIME, con los mismos ingredientes y el mismo método, y tienen
 * que dar el mismo `per_100g` que el build escribió en la ficha. Es la única
 * forma de demostrar que la matemática del motor y la del catálogo son LA MISMA
 * —no una reimplementación parecida— y de que la copia de `transforms.ts` no se
 * separó del original. Si mañana alguien toca la fórmula de un lado, nueve
 * fichas dejan de reproducirse y el test lo dice con nombre y apellido.
 *
 * Con la card 6.4 pasaron de nueve a 52, y eso lo vuelve bastante más fuerte: las
 * 43 recetas nuevas de platos españoles y mediterráneos se recomponen en runtime
 * con los mismos gramos y el mismo método, y dan el per_100g exacto que el build
 * escribió. La única línea que la card tocó de este archivo es el CONTEO.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COOKING_TRANSFORMS } from "../kb/cooking.transforms";
import { componerPlato } from "./compose";
import { FACTOR_COMPOSICION, FACTOR_GENERICO } from "./constants";
import { redondear } from "./match";
import { catalogoReal, fichaReal, indiceReal } from "./testing";
import type { Preparacion, VisionItem } from "./types";

const index = indiceReal();

describe("recomponer las recetas del catálogo", () => {
  const recetas = catalogoReal().foods.filter((f) => f.receta !== undefined);

  it("el catálogo trae las 53 recetas compuestas", () => {
    // 9 con la card 1.7, 52 con la card 6.4, 53 con los calçots de la 6.4b.
    assert.equal(recetas.length, 53);
  });

  for (const ficha of recetas) {
    it(`${ficha.id} se reconstruye con el mismo per_100g`, () => {
      const receta = ficha.receta;
      assert.ok(receta);
      const item: VisionItem = {
        food_en: ficha.names.en,
        grams: receta.peso_final_g,
        confidence: 1,
        preparation: receta.metodo as Preparacion,
        // Los ingredientes se nombran por su `names.en`, que es exactamente lo
        // que emitiría la visión mirando el plato.
        components: receta.ingredientes.map((i) => ({ food_en: fichaReal(i.ref).names.en, grams: i.grams })),
      };

      const r = componerPlato(item, index);
      assert.ok(r.ok, r.ok ? "" : r.motivo);
      assert.deepEqual(r.derivacion.per_100g, ficha.per_100g);
      assert.equal(r.derivacion.peso_final_g, receta.peso_final_g);
      assert.equal(r.derivacion.peso_entrada_g, receta.peso_entrada_g);
      assert.equal(r.derivacion.aceite_absorbido_g, receta.aceite_absorbido_g);
      assert.deepEqual(
        r.composicion.componentes.map((c) => c.food_id),
        receta.ingredientes.map((i) => i.ref),
      );
    });
  }
});

describe("la transformación", () => {
  it("sin `preparation` el método es `mezclado` (la convención medida de FNDDS)", () => {
    const r = componerPlato(
      { food_en: "plato sin nombre", grams: 200, confidence: 1, components: [{ food_en: "Rice noodles, cooked", grams: 200 }] },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.composicion.metodo, "mezclado");
    assert.equal(r.composicion.peso_final_g, 200);
  });

  it("`frito` absorbe aceite y lo declara con la ficha con la que lo cuantificó", () => {
    const componentes = [{ food_en: "Rice noodles, cooked", grams: 200 }];
    const crudo = componerPlato({ food_en: "x", grams: 200, confidence: 1, preparation: "mezclado", components: componentes }, index);
    const frito = componerPlato({ food_en: "x", grams: 200, confidence: 1, preparation: "frito", components: componentes }, index);
    assert.ok(crudo.ok && frito.ok);
    assert.equal(crudo.composicion.aceite_absorbido_g, 0);
    assert.equal(frito.composicion.aceite_absorbido_g, 13); // 6,5 % de 200 g
    assert.equal(frito.composicion.aceite_ref, COOKING_TRANSFORMS["frito"]?.aceite_ref);
    assert.ok(frito.derivacion.per_100g.fat_g > crudo.derivacion.per_100g.fat_g);
  });

  it("`horneado` pierde agua y concentra: mismos gramos, más calorías por 100 g", () => {
    const componentes = [{ food_en: "Rice noodles, cooked", grams: 200 }];
    const mezclado = componerPlato({ food_en: "x", grams: 200, confidence: 1, preparation: "mezclado", components: componentes }, index);
    const horneado = componerPlato({ food_en: "x", grams: 200, confidence: 1, preparation: "horneado", components: componentes }, index);
    assert.ok(mezclado.ok && horneado.ok);
    assert.equal(horneado.composicion.peso_final_g, 151.8); // 200 × 0,759
    assert.ok(horneado.derivacion.per_100g.kcal > mezclado.derivacion.per_100g.kcal);
  });
});

describe("cuándo NO se compone", () => {
  it("si falta UN ingrediente no se compone con los otros", () => {
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 0.9,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: "Zzzz ingrediente inexistente qqq", grams: 100 },
        ],
      },
      index,
    );
    assert.equal(r.ok, false);
    assert.ok(!r.ok && r.sin_match.length === 1);
    assert.ok(!r.ok && r.sin_match[0]?.termino_en === "Zzzz ingrediente inexistente qqq");
  });

  it("sin ingredientes no hay nada que componer", () => {
    const r = componerPlato({ food_en: "plato raro", grams: 300, confidence: 0.9 }, index);
    assert.equal(r.ok, false);
  });

  it("un ingrediente con 0 gramos cuenta como no resuelto: no se inventa peso", () => {
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 0.9,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: "Chorizo", grams: 0 },
        ],
      },
      index,
    );
    assert.equal(r.ok, false);
  });
});

describe("confianza y caveats de un compuesto", () => {
  it("la confianza es la del eslabón MÁS DÉBIL, con el descuento de composición", () => {
    // `Pastel brasileño` entra por un alias de confianza 0,6 a una ficha que
    // ADEMÁS es genérica (`Empanada`): 0,6 × 0,85 = 0,51 contra el 1,0 del otro
    // ingrediente. Las dos reservas se acumulan y después llega la de composición.
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 1,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: "Pastel brasileño", grams: 100 },
        ],
      },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.equal(r.confianza_match, redondear(0.6 * FACTOR_GENERICO * FACTOR_COMPOSICION));
  });

  it("los caveats de las fichas ingredientes viajan al plato", () => {
    // Se busca un ingrediente real que traiga caveats, para no inventar uno.
    const conCaveats = catalogoReal().foods.find((f) => !f.deprecated && (f.caveats?.length ?? 0) > 0);
    assert.ok(conCaveats);
    const caveatEsperado = conCaveats.caveats?.[0];
    assert.ok(caveatEsperado);
    const r = componerPlato(
      {
        food_en: "plato raro",
        grams: 300,
        confidence: 1,
        components: [
          { food_en: "Rice noodles, cooked", grams: 200 },
          { food_en: conCaveats.names.en, grams: 100 },
        ],
      },
      index,
    );
    assert.ok(r.ok, r.ok ? "" : r.motivo);
    assert.ok(r.caveats.includes(caveatEsperado));
    assert.match(r.caveats[0] ?? "", /compuesto en el momento/);
  });
});
