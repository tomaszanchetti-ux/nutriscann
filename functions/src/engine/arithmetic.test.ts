/**
 * Los candados de la aritmética.
 *
 * La mitad de los tests de este archivo son sobre el VACÍO, no sobre los
 * números: qué pasa cuando un dato falta. Es a propósito — sumar bien es fácil,
 * y el error caro del sistema sería convertir un "no sé" en un cero que el
 * usuario no puede distinguir de un dato medido.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Per100g } from "../kb/types";
import { escalar, gramosValidos, porcentajesDeMacros, sumarTotales } from "./arithmetic";
import { CONFIANZA_MINIMA_PARA_UN_TOTAL } from "./constants";
import type { EngineItem, SumaDeNutrientes } from "./types";

const COMPLETA: Per100g = {
  kcal: 200,
  protein_g: 10,
  carbs_g: 20,
  fat_g: 8,
  fiber_g: 2,
  sat_fat_g: 1,
  sugars_g: 3,
  sodium_mg: 400,
};

const SIN_AZUCARES: Per100g = { ...COMPLETA, sugars_g: null };

function item(parcial: Partial<EngineItem> & { termino_en: string }): EngineItem {
  return {
    food_id: "test",
    name_es: parcial.termino_en,
    name_en: parcial.termino_en,
    source_ref: "test",
    grams: 100,
    confidence: 1,
    confidence_vision: 1,
    confidence_match: 1,
    match: "exacto",
    per_100g: COMPLETA,
    nutrients: escalar(COMPLETA, parcial.grams ?? 100),
    motivo: "test",
    ...parcial,
  };
}

describe("escalar a los gramos del plato", () => {
  it("per_100g × gramos / 100", () => {
    const r = escalar(COMPLETA, 250);
    assert.equal(r.kcal, 500);
    assert.equal(r.protein_g, 25);
    assert.equal(r.sodium_mg, 1000);
  });

  it("un `null` de la ficha sigue siendo `null`, nunca 0", () => {
    const r = escalar(SIN_AZUCARES, 250);
    assert.equal(r.sugars_g, null);
    assert.equal(r.fiber_g, 5);
  });

  it("cero gramos da ceros, no nulls: el plato tiene el alimento, pesa cero", () => {
    const r = escalar(COMPLETA, 0);
    assert.equal(r.kcal, 0);
    assert.equal(r.sugars_g, 0);
  });

  it("gramos absurdos (NaN, negativos) se tratan como cero, no rompen", () => {
    assert.equal(escalar(COMPLETA, Number.NaN).kcal, 0);
    assert.equal(escalar(COMPLETA, -50).kcal, 0);
    assert.equal(gramosValidos(-5), 0);
    assert.equal(gramosValidos(Number.POSITIVE_INFINITY), 0);
    assert.equal(gramosValidos(120.4567), 120.457);
  });
});

describe("totales del escaneo", () => {
  it("suma los cuatro obligatorios", () => {
    const t = sumarTotales([item({ termino_en: "a", grams: 100 }), item({ termino_en: "b", grams: 50 })]);
    assert.ok(t);
    assert.equal(t.nutrients.kcal, 300);
    assert.equal(t.nutrients.protein_g, 15);
    assert.equal(t.grams_total, 150);
    assert.equal(t.completo, true);
  });

  it("un opcional que le falta a UN item deja el total en `null`, con motivo", () => {
    const t = sumarTotales([
      item({ termino_en: "a", grams: 100 }),
      item({ termino_en: "sin azúcares", grams: 100, per_100g: SIN_AZUCARES, nutrients: escalar(SIN_AZUCARES, 100) }),
    ]);
    assert.ok(t);
    assert.equal(t.nutrients.sugars_g, null);
    assert.equal(t.nutrients.fiber_g, 4);
    assert.match(t.opcionales_ausentes.sugars_g ?? "", /sin azúcares/);
    assert.equal(t.opcionales_ausentes.fiber_g, undefined);
  });

  it("un item sin ficha no suma cero: queda fuera y baja `completo`", () => {
    const t = sumarTotales([
      item({ termino_en: "a", grams: 100 }),
      item({ termino_en: "desconocido", grams: 80, food_id: null, match: "no_catalogado", per_100g: null, nutrients: null }),
    ]);
    assert.ok(t);
    assert.equal(t.nutrients.kcal, 200);
    assert.equal(t.items_incluidos, 1);
    assert.equal(t.items_sin_datos, 1);
    assert.equal(t.completo, false);
    // Los gramos del plato son 180; los que se pudieron cuantificar, 100.
    assert.equal(t.grams_total, 180);
    assert.equal(t.grams_cuantificados, 100);
  });

  it("si NINGÚN item tiene ficha no hay totales: `null`, no ceros", () => {
    const t = sumarTotales([
      item({ termino_en: "x", food_id: null, match: "no_catalogado", per_100g: null, nutrients: null }),
    ]);
    assert.equal(t, null);
  });

  it("un escaneo sin items no tiene totales", () => {
    assert.equal(sumarTotales([]), null);
  });
});

/**
 * CARD 2.8 — LA COMPUERTA DEL TOTAL.
 *
 * El escenario SE CONSTRUYE, no se busca: la miel del plato 28 no está acá, está
 * la FORMA del plato 28 —todos los ítems cuantificados, todos con la confianza
 * por el piso— que es lo único que la compuerta mira. Los números de confianza
 * sí son los reales del golden set de 30, porque son la justificación del piso.
 */
describe("card 2.8 — un total donde nadie se identificó no es un total completo", () => {
  /** El plato 28 reconstruido: dos ítems cuantificados enteros, los dos a 0,088. */
  const comidaDePlastico = (): EngineItem[] => [
    item({ termino_en: "honey toast with whipped cream and cookie", grams: 250, confidence: 0.088 }),
    item({ termino_en: "honey toast with whipped cream and banana", grams: 260, confidence: 0.088 }),
  ];

  it("dos ítems al 0,088 dejan de publicarse como total completo", () => {
    const t = sumarTotales(comidaDePlastico());
    assert.ok(t);
    assert.equal(t.completo, false);
    assert.equal(t.macro_pct, null);
    assert.match(t.macro_pct_motivo ?? "", /confianza suficiente/);
    // El motivo dice los DOS números, el que se alcanzó y el que hacía falta.
    assert.match(t.macro_pct_motivo ?? "", /8\.8 %/);
    assert.match(t.macro_pct_motivo ?? "", /12 %/);
  });

  it("la compuerta protege el TOTAL, no borra ni un ítem", () => {
    const items = comidaDePlastico();
    const t = sumarTotales(items);
    assert.ok(t);
    // CARD 6.1 — LA COMPUERTA CIERRA ENTERA. Hasta la 2.8 la suma seguía viajando
    // en el payload (1.020 kcal acá, 1.550,4 en el plato 28 del golden set) con
    // `completo: false` al lado: el JSON decía las dos cosas a la vez y quien lo
    // pintara decidía cuál. Ahora el payload dice lo mismo que la declaración.
    assert.equal(t.nutrients.kcal, null);
    assert.equal(t.total_no_publicable, true);
    // Pero el CONTEO no se toca: los dos ítems entraron a la suma, y eso es lo que
    // permite seguir explicando de qué está hecho el plato.
    assert.equal(t.items_incluidos, 2);
    assert.equal(t.items_sin_datos, 0);
    assert.equal(t.grams_total, 510);
    assert.equal(t.grams_cuantificados, 510);
    // Y los ítems que se le pasaron no se tocaron.
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.nutrients !== null && i.food_id !== null));
  });

  it("card 6.1 — LOS OCHO valores viajan en `null`, no solo el de portada", () => {
    // DT-28, punto 3. La compuerta de la 2.8 apagaba la declaración y dejaba los
    // números adentro del JSON: el plato 28 del golden set salía `completo: false`
    // y con 1.550,4 kcal en `totals.nutrients.kcal`. Un payload que dice las dos
    // cosas a la vez le deja la decisión a quien lo pinte.
    const t = sumarTotales(comidaDePlastico());
    assert.ok(t);
    assert.deepEqual(t.nutrients, {
      kcal: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      fiber_g: null,
      sat_fat_g: null,
      sugars_g: null,
      sodium_mg: null,
    });
    // Y el `null` de la compuerta NO se puede confundir con el `null` de "la
    // fuente no lo mide": hay una marca que lo dice.
    assert.equal(t.total_no_publicable, true);
  });

  it("card 6.1 — un total que SÍ se publica no lleva la marca ni pierde un número", () => {
    // La otra mitad del candado: la compuerta tiene que ser la excepción, no la
    // regla. Sin este test, apagar todos los totales pasaría los tests de arriba.
    const t = sumarTotales([item({ termino_en: "manzana", grams: 180, confidence: 0.95 })]);
    assert.ok(t);
    assert.equal(t.total_no_publicable, undefined);
    assert.equal(typeof t.nutrients.kcal, "number");
    assert.ok((t.nutrients.kcal ?? 0) > 0);
    assert.ok(t.macro_pct !== null);
  });

  it("NO toca un plato correcto de confianza baja: el 24, con sus dos fichas buenas", () => {
    // Espaguetis con albóndigas del golden set: `Pasta con salsa` a 0,152 y
    // `Albóndigas con salsa` a 0,150. Las dos fichas son las correctas y el
    // total (702,8 kcal) cayó en rango. Es el plato que fija el techo del piso.
    const t = sumarTotales([
      item({ termino_en: "spaghetti, cooked", grams: 100, confidence: 0.152 }),
      item({ termino_en: "meatballs with tomato sauce", grams: 100, confidence: 0.15 }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, true);
    assert.ok(t.macro_pct !== null);
    assert.equal(t.macro_pct_motivo, null);
  });

  it("mira EL MEJOR ítem, no el promedio: un alimento bien identificado alcanza", () => {
    const t = sumarTotales([
      item({ termino_en: "manzana", grams: 100, confidence: 0.95 }),
      item({ termino_en: "duda 1", grams: 50, confidence: 0.05 }),
      item({ termino_en: "duda 2", grams: 50, confidence: 0.02 }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, true);
    assert.ok(t.macro_pct !== null);
  });

  it("el borde del piso está declarado: 0,12 pasa y 0,119 no", () => {
    assert.equal(CONFIANZA_MINIMA_PARA_UN_TOTAL, 0.12);
    const justo = sumarTotales([item({ termino_en: "justo", confidence: CONFIANZA_MINIMA_PARA_UN_TOTAL })]);
    const abajo = sumarTotales([item({ termino_en: "abajo", confidence: 0.119 })]);
    assert.ok(justo && abajo);
    assert.equal(justo.completo, true);
    assert.equal(abajo.completo, false);
  });

  it("un plato que YA era parcial y encima no llega al piso dice las dos cosas", () => {
    const t = sumarTotales([
      item({ termino_en: "duda", grams: 100, confidence: 0.05 }),
      item({ termino_en: "sin ficha", grams: 80, food_id: null, match: "no_catalogado", per_100g: null, nutrients: null }),
    ]);
    assert.ok(t);
    assert.equal(t.completo, false);
    assert.equal(t.items_sin_datos, 1);
    assert.equal(t.macro_pct, null);
    assert.match(t.macro_pct_motivo ?? "", /confianza suficiente/);
  });

  it("con 0 kcal el motivo sigue siendo el de las calorías, no el de la compuerta", () => {
    const vacio: Per100g = { ...COMPLETA, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const t = sumarTotales([item({ termino_en: "agua", confidence: 0.9, per_100g: vacio, nutrients: escalar(vacio, 100) })]);
    assert.ok(t);
    assert.equal(t.completo, true);
    assert.match(t.macro_pct_motivo ?? "", /El total de calorías es 0/);
  });
});

describe("porcentajes de macros (Atwater 4/4/9)", () => {
  const base: SumaDeNutrientes = {
    kcal: 200,
    protein_g: 10,
    carbs_g: 20,
    fat_g: 8,
    fiber_g: null,
    sat_fat_g: null,
    sugars_g: null,
    sodium_mg: null,
  };

  it("reparte sobre las calorías totales", () => {
    const p = porcentajesDeMacros(base);
    assert.ok(p);
    assert.equal(p.protein, 20); // 10 g × 4 = 40 kcal sobre 200
    assert.equal(p.carbs, 40);
    assert.equal(p.fat, 36); // 8 g × 9 = 72 kcal sobre 200
  });

  it("NO normaliza a 100: la diferencia se declara", () => {
    const p = porcentajesDeMacros(base);
    assert.ok(p);
    assert.equal(p.sin_explicar, 4);
    assert.equal(p.protein + p.carbs + p.fat + p.sin_explicar, 100);
  });

  it("con 0 kcal no hay porcentajes: `null`, no 0 %", () => {
    assert.equal(porcentajesDeMacros({ ...base, kcal: 0 }), null);
    assert.equal(porcentajesDeMacros({ ...base, kcal: -5 }), null);
  });

  it("el motivo viaja en los totales cuando no hay porcentajes", () => {
    const vacio: Per100g = { ...COMPLETA, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
    const t = sumarTotales([item({ termino_en: "agua", per_100g: vacio, nutrients: escalar(vacio, 100) })]);
    assert.ok(t);
    assert.equal(t.macro_pct, null);
    assert.match(t.macro_pct_motivo ?? "", /0/);
  });
});
