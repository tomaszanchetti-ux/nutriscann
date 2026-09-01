/**
 * Las decisiones de la persistencia, separadas de la escritura.
 *
 * Lo que se puede probar sin base de datos se prueba sin base de datos: cómo se
 * agrupa la cola, qué id le toca a cada término y qué forma tiene el documento.
 * El circuito contra Firestore de verdad está en `emulador.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { CurationCandidate, EngineResult } from "../engine";
import { agruparCandidatos, documentoDelScan, idDeCuracion, sinIndefinidos } from "./persistencia";

function candidato(parcial: Partial<CurationCandidate> & { termino_en: string }): CurationCandidate {
  return {
    motivo: "sin_match",
    grams: 100,
    preparation: null,
    detalle: "de prueba",
    ...parcial,
  };
}

test("el id de la cola es el término normalizado con guiones", () => {
  assert.equal(idDeCuracion("Grilled Chicken Breast"), "grilled-chicken-breast");
  assert.equal(idDeCuracion("  Tortilla  de   patatas "), "tortilla-de-patatas");
  assert.equal(idDeCuracion("Piña colada"), "pina-colada", "sin tildes: la ñ se descompone");
  assert.equal(idDeCuracion("!!!"), "", "un término que normaliza a nada no tiene id");
});

test("dos escrituras del MISMO término en un escaneo son un solo documento", () => {
  // Pasa de verdad: el motor deduplica por `motivo + término`, así que un plato
  // sin match cuyo propio ingrediente tampoco matchea entra dos veces. En la cola
  // el término es la unidad de curación: si no se agrupara acá, la transacción
  // escribiría dos veces el mismo documento y el contador contaría mal.
  const grupos = agruparCandidatos([
    candidato({ termino_en: "Migas extremeñas", motivo: "sin_match" }),
    candidato({ termino_en: "migas extremeñas", motivo: "componente_sin_match" }),
    candidato({ termino_en: "otra cosa" }),
  ]);

  assert.equal(grupos.length, 2);
  assert.equal(grupos[0]?.id, "migas-extremenas");
  assert.deepEqual(grupos[0]?.motivos, ["sin_match", "componente_sin_match"]);
  assert.equal(grupos[0]?.candidato.motivo, "sin_match", "gana el primero, y es siempre el mismo");
});

test("un término que no deja nada al normalizar no entra a la cola", () => {
  assert.deepEqual(agruparCandidatos([candidato({ termino_en: "###" })]), []);
});

test("el documento del scan guarda el resultado del motor tal cual", () => {
  const resultado: EngineResult = {
    es_comida: true,
    items: [
      {
        termino_en: "apple",
        termino_es: "manzana",
        food_id: "fdc-1",
        name_es: "Manzana",
        name_en: "Apple, raw",
        source_ref: "usda/1",
        grams: 150,
        confidence: 0.9,
        confidence_vision: 0.9,
        confidence_match: 1,
        match: "exacto",
        per_100g: {
          kcal: 52,
          protein_g: 0.3,
          carbs_g: 14,
          fat_g: 0.2,
          fiber_g: 2.4,
          sat_fat_g: null,
          sugars_g: 10,
          sodium_mg: 1,
        },
        nutrients: {
          kcal: 78,
          protein_g: 0.5,
          carbs_g: 21,
          fat_g: 0.3,
          fiber_g: 3.6,
          sat_fat_g: null,
          sugars_g: 15,
          sodium_mg: 1.5,
        },
        motivo: "match exacto",
      },
    ],
    totals: null,
    curation_candidates: [],
    kb_version: "3.0.0+abc",
  };

  const doc = documentoDelScan({
    owner_id: "anon-dev",
    scan_id: "s1",
    resultado,
    meta: { model: "claude-sonnet-5", kb_version: "3.0.0+abc", latency_ms: 3200, tokens_in: 1300, tokens_out: 240 },
    ahora: new Date("2026-08-31T12:00:00.000Z"),
  });

  assert.equal(doc["status"], "done");
  assert.equal(doc["is_food"], true);
  assert.equal(doc["kb_version"], "3.0.0+abc");
  assert.deepEqual(doc["items"], resultado.items);
  assert.equal(doc["image_ref"], null, "la imagen no se guarda todavía (DT-3), y el campo lo dice");
  assert.equal("recommendation" in doc, false, "la v1 no recomienda: el campo no se inventa vacío");
});

test("los campos opcionales ausentes se van; no se convierten en null", () => {
  // `caveats: undefined` y `caveats: null` no son lo mismo: uno es "esta ficha
  // no tiene salvedades" y el otro sería "las salvedades son nulas". Firestore
  // además rechaza `undefined` con una excepción.
  const limpio = sinIndefinidos({
    a: 1,
    b: undefined,
    c: null,
    d: { e: undefined, f: "sí" },
    g: [1, undefined, { h: undefined, i: 2 }],
  });

  assert.deepEqual(limpio, { a: 1, c: null, d: { f: "sí" }, g: [1, { i: 2 }] });
});

test("sinIndefinidos no destroza los objetos que no son literales", () => {
  const fecha = new Date("2026-08-31T00:00:00.000Z");
  const limpio = sinIndefinidos({ cuando: fecha });
  assert.equal(limpio.cuando, fecha, "un Timestamp o un FieldValue tienen que viajar enteros");
});
