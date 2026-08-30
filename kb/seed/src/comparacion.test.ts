/**
 * La comparación que decide si hay que escribir, probada con escenarios
 * construidos: cada caso es una diferencia concreta que el seed tiene que ver
 * (o no ver).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { camposDistintos, canonico, iguales } from "./comparacion";

test("el orden de las claves no cuenta: Firestore no lo conserva", () => {
  assert.ok(iguales({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.equal(canonico({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test("el orden de un array SÍ cuenta: los aliases y las porciones están ordenados", () => {
  assert.ok(!iguales(["a", "b"], ["b", "a"]));
});

test("el orden tampoco cuenta en mapas anidados", () => {
  assert.ok(
    iguales(
      { per_100g: { kcal: 160, protein_g: 1.5 } },
      { per_100g: { protein_g: 1.5, kcal: 160 } },
    ),
  );
});

test("un campo de más o de menos es una diferencia", () => {
  assert.ok(!iguales({ a: 1 }, { a: 1, b: 2 }));
});

test("null no es lo mismo que ausente ni que 0", () => {
  assert.ok(!iguales({ fiber_g: null }, { fiber_g: 0 }));
  assert.ok(!iguales({ fiber_g: null }, {}));
});

test("un decimal cambiado se detecta", () => {
  assert.ok(!iguales({ kcal: 160 }, { kcal: 160.5 }));
  assert.ok(iguales({ sat_fat_g: 2.115 }, { sat_fat_g: 2.115 }));
});

test("camposDistintos nombra los campos de primer nivel que difieren", () => {
  const distintos = camposDistintos(
    { id: "fdc-1", per_100g: { kcal: 100 }, names: { es: "Pollo" } },
    { id: "fdc-1", per_100g: { kcal: 165 }, names: { es: "Pollo" }, kb_version: "1.0.0" },
  );
  assert.deepEqual(distintos, ["kb_version", "per_100g"]);
});

test("dos documentos iguales no producen ningún campo distinto", () => {
  const documento = { id: "fdc-1", per_100g: { kcal: 100 }, aliases: { es: [] } };
  assert.deepEqual(camposDistintos(documento, { ...documento }), []);
});
