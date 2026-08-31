/**
 * La carga del catálogo, con una base falsa.
 *
 * Los escenarios de acá SE CONSTRUYEN: el emulador sembrado tiene 1.022 fichas
 * sanas y ninguna deprecada, así que "media base" y "deprecación masiva" no se
 * pueden buscar en él — hay que armarlos. El circuito contra Firestore de verdad
 * está en `emulador.test.ts`; lo que se mide acá son los candados.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { Firestore } from "firebase-admin/firestore";

import { fichaFalsa } from "../engine/testing";
import { PISO_DE_FICHAS, cargarIndice } from "./catalogo";
import { ErrorDeAnalisis } from "./errores";

/** Una base que devuelve exactamente los documentos que el test le pone. */
function baseFalsa(fichas: unknown[], kbMeta: Record<string, unknown> | null): Firestore {
  return {
    collection: () => ({
      get: async () => ({
        size: fichas.length,
        empty: fichas.length === 0,
        docs: fichas.map((f) => ({ data: () => f })),
      }),
      doc: () => ({
        get: async () => ({ exists: kbMeta !== null, data: () => kbMeta }),
      }),
    }),
  } as unknown as Firestore;
}

function fichasSanas(cuantas: number, opciones: { deprecated?: boolean } = {}): unknown[] {
  return Array.from({ length: cuantas }, (_unused, i) =>
    fichaFalsa({ id: `fdc-${i}`, names: { en: `food number ${i}`, es: null }, deprecated: opciones.deprecated === true }),
  );
}

const META = { kb_version: "3.0.0+test" };

test("con el catálogo completo, el índice se arma y trae la versión", async () => {
  const index = await cargarIndice(baseFalsa(fichasSanas(1000), META));
  assert.equal(index.kb_version, "3.0.0+test");
  assert.equal(index.exactoEn.size, 1000);
});

test("media base es un 503 declarado, no un análisis donde nada está catalogado", async () => {
  // Es el error que se rompe hacia adelante: sin este candado, un seed cortado
  // por la mitad no falla — contesta que el pollo con arroz no está catalogado y
  // escribe "chicken" y "rice" en la cola de curación.
  await assert.rejects(
    () => cargarIndice(baseFalsa(fichasSanas(400), META)),
    (err: unknown) => {
      assert.ok(err instanceof ErrorDeAnalisis);
      assert.equal(err.codigo, "catalogo_no_disponible");
      assert.match(err.detalle, new RegExp(String(PISO_DE_FICHAS)));
      return true;
    },
  );
});

test("una base vacía también es catalogo_no_disponible", async () => {
  await assert.rejects(
    () => cargarIndice(baseFalsa([], META)),
    (err: unknown) => err instanceof ErrorDeAnalisis && err.codigo === "catalogo_no_disponible",
  );
});

test("sin `config/kb_meta.kb_version` no se analiza: un scan sin versión no es trazable", async () => {
  await assert.rejects(
    () => cargarIndice(baseFalsa(fichasSanas(1000), null)),
    (err: unknown) => {
      assert.ok(err instanceof ErrorDeAnalisis);
      assert.equal(err.codigo, "catalogo_no_disponible");
      assert.match(err.detalle, /kb_version/);
      return true;
    },
  );
  await assert.rejects(
    () => cargarIndice(baseFalsa(fichasSanas(1000), { kb_version: "" })),
    (err: unknown) => err instanceof ErrorDeAnalisis && err.codigo === "catalogo_no_disponible",
  );
});

test("mil documentos DEPRECADOS no son un catálogo: la excepción del motor se traduce a 503", async () => {
  // El escenario que ningún piso por cantidad de documentos atrapa: los 1.000
  // documentos están, y ninguno entra al índice (regla dura 6: una ficha
  // retirada no se borra). `construirIndice` lanza —es su candado— y acá se
  // traduce al mismo 503 con mensaje en español, no a un 500 anónimo.
  await assert.rejects(
    () => cargarIndice(baseFalsa(fichasSanas(1000, { deprecated: true }), META)),
    (err: unknown) => {
      assert.ok(err instanceof ErrorDeAnalisis, "tiene que llegar traducido, no crudo");
      assert.equal(err.codigo, "catalogo_no_disponible");
      return true;
    },
  );
});
