/**
 * La traducción JSON ⇄ Firestore, probada sin red.
 *
 * El caso que importa es el de ida y vuelta: si un documento no vuelve igual a
 * como se fue, el seed cree que cambió y lo reescribe en cada corrida. La
 * idempotencia se rompe acá antes que en ningún otro lado.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { aFirestore, aJson, camposDesdeObjeto, objetoDesdeCampos, type ValorJson } from "./valores";

function ida(valor: ValorJson): ValorJson {
  return aJson(aFirestore(valor));
}

test("los escalares se etiquetan con su tipo de Firestore", () => {
  assert.deepEqual(aFirestore(null), { nullValue: null });
  assert.deepEqual(aFirestore(true), { booleanValue: true });
  assert.deepEqual(aFirestore("pollo"), { stringValue: "pollo" });
  assert.deepEqual(aFirestore(160), { integerValue: "160" });
  assert.deepEqual(aFirestore(2.115), { doubleValue: 2.115 });
  assert.deepEqual(aFirestore(-3), { integerValue: "-3" });
});

test("ida y vuelta: los tipos del catálogo vuelven idénticos", () => {
  const valores: ValorJson[] = [null, true, false, "", "aliño cremoso", 0, 160, -12, 2.115, 0.5, 833];
  for (const valor of valores) {
    assert.deepEqual(ida(valor), valor, `no volvió igual: ${JSON.stringify(valor)}`);
  }
});

test("ida y vuelta: un alimento entero, con anidamiento y arrays", () => {
  const alimento: ValorJson = {
    id: "fdc-167684",
    names: { en: "Creamy dressing", es: "Aderezo cremoso" },
    aliases: { es: ["Aliño cremoso"] },
    per_100g: { kcal: 160, protein_g: 1.5, fiber_g: 0, sat_fat_g: 2.115, sodium_mg: null },
    portion_hints: [
      { grams: 15, label_en: "1 tbsp", label_es: null },
      { grams: 245, label_en: "1 cup", label_es: null },
    ],
    deprecated: false,
  };
  assert.deepEqual(ida(alimento), alimento);
});

test("un array vacío vuelve como array vacío aunque Firestore omita 'values'", () => {
  // Así es como la API REST devuelve `[]`: sin la clave `values`.
  assert.deepEqual(aJson({ arrayValue: {} }), []);
  assert.deepEqual(aJson({ mapValue: {} }), {});
  assert.deepEqual(ida({ aliases: { es: [] } }), { aliases: { es: [] } });
});

test("un entero también se acepta si vuelve como número en vez de string", () => {
  // La API REST manda `integerValue` como string; algún cliente lo manda como número.
  assert.equal(aJson({ integerValue: "160" }), 160);
  assert.equal(aJson({ integerValue: 160 }), 160);
});

test("las claves con puntos sobreviven: son claves de mapa, no rutas de campo", () => {
  // `provenance` usa claves como "per_100g.kcal". En un mapa son legales; solo
  // serían rutas si viajaran en un updateMask, y el seed nunca las manda ahí.
  const provenance: ValorJson = { "per_100g.kcal": "usda_sr_legacy", "names.es": "curation" };
  assert.deepEqual(ida(provenance), provenance);
});

test("los campos se serializan en orden alfabético (el request no cambia entre corridas)", () => {
  const primero = camposDesdeObjeto({ b: 1, a: 2 });
  const segundo = camposDesdeObjeto({ a: 2, b: 1 });
  assert.deepEqual(Object.keys(primero), ["a", "b"]);
  assert.equal(JSON.stringify(primero), JSON.stringify(segundo));
});

test("un timestamp vuelve como texto (por eso kb_meta queda fuera de la comparación)", () => {
  assert.equal(aJson({ timestampValue: "2026-08-30T10:00:00Z" }), "2026-08-30T10:00:00Z");
});

test("un valor de Firestore desconocido se denuncia, no se ignora", () => {
  assert.throws(() => aJson({ raroValue: 1 }), /no reconocido/);
});

test("un número no finito se rechaza antes de salir a la red", () => {
  assert.throws(() => aFirestore(Number.POSITIVE_INFINITY), /no representable/);
});

test("objetoDesdeCampos es el inverso exacto de camposDesdeObjeto", () => {
  const objeto = { a: 1, b: { c: [1, "dos", null] }, d: false };
  assert.deepEqual(objetoDesdeCampos(camposDesdeObjeto(objeto)), objeto);
});
