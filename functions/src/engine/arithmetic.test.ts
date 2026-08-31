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
import type { EngineItem, TotalesNutrientes } from "./types";

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

describe("porcentajes de macros (Atwater 4/4/9)", () => {
  const base: TotalesNutrientes = {
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
