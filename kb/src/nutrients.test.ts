/**
 * El mapeo de nutrientes, clavado en un test.
 *
 * Estas tablas son la traducción entre el vocabulario de cada dataset y el
 * catálogo: un dígito cambiado no rompe nada visible, simplemente hace que un
 * campo salga vacío o —peor— que salga con el número de otro nutriente. El
 * test fija los códigos esperados uno por uno para que un typo tenga que pasar
 * por acá antes de llegar al catálogo.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { NUTRIENT_CODES, OPTIONAL_KEYS, REQUIRED_KEYS, codeIndex } from "./nutrients";

test("SR Legacy referencia los nutrientes por nutrient.id", () => {
  assert.deepEqual(NUTRIENT_CODES.usda_sr_legacy, {
    kcal: [1008],
    protein_g: [1003],
    carbs_g: [1005],
    fat_g: [1004],
    fiber_g: [1079],
    sat_fat_g: [1258],
    sugars_g: [2000],
    sodium_mg: [1093],
    alcohol_g: [1018],
  });
});

test("FNDDS referencia los nutrientes por nutrient_nbr", () => {
  // La trampa del Bloque 0: los mismos nutrientes, otro vocabulario.
  assert.deepEqual(NUTRIENT_CODES.usda_fndds, {
    kcal: [208],
    protein_g: [203],
    carbs_g: [205],
    fat_g: [204],
    fiber_g: [291],
    sat_fat_g: [606],
    sugars_g: [269],
    sodium_mg: [307],
    alcohol_g: [221],
  });
});

test("Foundation usa nutrient.id con cadenas de respaldo para energía y azúcares", () => {
  assert.deepEqual(NUTRIENT_CODES.usda_foundation, {
    // 1008 (Energy) falta seguido: se cae a Atwater General y después a los
    // Específicos. Estas dos cadenas cargan la mitad de los overrides.
    kcal: [1008, 2047, 2048],
    protein_g: [1003],
    carbs_g: [1005],
    fat_g: [1004],
    fiber_g: [1079],
    sat_fat_g: [1258],
    // En Foundation los azúcares viven en 1063 ("Total NLEA"); el 2000 apenas
    // existe, pero queda como respaldo.
    sugars_g: [1063, 2000],
    sodium_mg: [1093],
    alcohol_g: [1018],
  });
});

test("ningún dataset le pone el mismo código a dos campos distintos", () => {
  for (const [source, codes] of Object.entries(NUTRIENT_CODES)) {
    const seen = new Map<number, string>();
    for (const [key, list] of Object.entries(codes)) {
      for (const code of list) {
        const previous = seen.get(code);
        assert.equal(
          previous,
          undefined,
          `${source}: el código ${code} alimenta "${key}" y también "${previous}"`,
        );
        seen.set(code, key);
      }
    }
  }
});

test("los tres datasets cubren los mismos nueve campos", () => {
  const expected = [...REQUIRED_KEYS, ...OPTIONAL_KEYS, "alcohol_g"].sort();
  for (const [source, codes] of Object.entries(NUTRIENT_CODES)) {
    assert.deepEqual(Object.keys(codes).sort(), expected, `${source} no cubre los nueve campos`);
  }
});

test("el índice invertido conserva el orden de preferencia", () => {
  const index = codeIndex("usda_foundation");
  assert.deepEqual(index.get(1008), { key: "kcal", rank: 0 });
  assert.deepEqual(index.get(2047), { key: "kcal", rank: 1 });
  assert.deepEqual(index.get(2048), { key: "kcal", rank: 2 });
  assert.deepEqual(index.get(1063), { key: "sugars_g", rank: 0 });
  assert.deepEqual(index.get(2000), { key: "sugars_g", rank: 1 });
  // El vocabulario de FNDDS no existe en Foundation.
  assert.equal(index.get(208), undefined);
});
