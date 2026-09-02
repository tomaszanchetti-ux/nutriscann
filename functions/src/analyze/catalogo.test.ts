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
import { PISO_DE_FICHAS, cargarIndice, guardasPublicadas } from "./catalogo";
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

// ---------------------------------------------------------------------------
// DT-32 — las guardas publicadas llegan al índice en producción
// ---------------------------------------------------------------------------

test("las guardas publicadas en `config/kb_meta` llegan al índice", async () => {
  // Es la mitad de PRODUCCIÓN del arreglo de la DT-32: esta es la única ruta del
  // sistema que no lee `foods.canonical.json` —arma las fichas documento por
  // documento—, así que las guardas le llegan por el `kb_meta` que escribe el seed.
  const guardas = [
    { termino: "chorizo", prohibido_en: ["fdc-2705835"], motivo: "el corte no es el embutido" },
    { termino: "pepinillos", prohibido_en: ["fdc-169378"], salvo_si_contiene: ["dulces"], motivo: "los de eneldo" },
    { termino: "pasta de tomate", prohibido_en: ["fdc-2708357"], motivo: "el concentrado no es el fideo" },
  ];
  const index = await cargarIndice(baseFalsa(fichasSanas(1000), { ...META, guardas }));
  assert.equal(index.guardas.length, 3);
  assert.deepEqual(index.guardas.map((g) => g.termino), ["chorizo", "pepinillos", "pasta de tomate"]);
  assert.deepEqual(index.guardas[1]?.salvo_si_contiene, ["dulces"], "la excepción viaja entera");
});

test("una base sembrada ANTES de la DT-32 cae al arranque en frío, no a cero guardas", async () => {
  // El escenario se construye porque es el que va a existir de verdad entre el
  // deploy del motor nuevo y el re-seed: `kb_meta` sin la clave `guardas`. El
  // matcher tiene que responder con las dos de siempre —no con ninguna—, y el
  // log lo declara (ver `cargarIndice`).
  const index = await cargarIndice(baseFalsa(fichasSanas(1000), META));
  assert.equal(index.guardas.length, 2, "el arranque en frío del motor");
  assert.deepEqual(index.guardas.map((g) => g.termino).sort(), ["chorizo", "pepinillos"]);
});

test("una guarda rota no se lleva puestas a las demás", async () => {
  // La frontera: lo que viene de Firestore se lee como si nadie lo hubiera
  // saneado. Una prohibición mal escrita se descarta ELLA sola — quedarse sin
  // las otras veinte por una fila rota sería cambiar un error por veinte.
  const index = await cargarIndice(
    baseFalsa(fichasSanas(1000), {
      ...META,
      guardas: [
        { termino: "chorizo", prohibido_en: ["fdc-2705835"], motivo: "válida" },
        { termino: "", prohibido_en: ["fdc-1"], motivo: "sin término" },
        { termino: "sin ids", prohibido_en: [], motivo: "no prohíbe nada" },
        { termino: "no es objeto" },
        null,
        { termino: "asado", prohibido_en: ["fdc-169510"], motivo: "válida" },
      ],
    }),
  );
  assert.deepEqual(index.guardas.map((g) => g.termino), ["chorizo", "asado"]);
});

test("`guardasPublicadas` devuelve null cuando no quedó ninguna usable", () => {
  // `null` y no `[]`, y la diferencia es toda la decisión: `[]` significaría
  // "corré sin ninguna guarda" y `null` significa "acá no hay lista", que es lo
  // que hace caer al arranque en frío.
  assert.equal(guardasPublicadas(undefined), null);
  assert.equal(guardasPublicadas("no es una lista"), null);
  assert.equal(guardasPublicadas([]), null);
  assert.equal(guardasPublicadas([{ termino: "rota" }]), null);
  assert.deepEqual(guardasPublicadas([{ termino: "x", prohibido_en: ["fdc-1"], motivo: "m" }]), [
    { termino: "x", prohibido_en: ["fdc-1"], motivo: "m" },
  ]);
  // Una excepción vacía no viaja: la clave no existe en vez de existir sin decir nada.
  assert.deepEqual(guardasPublicadas([{ termino: "x", prohibido_en: ["fdc-1"], salvo_si_contiene: [], motivo: "m" }]), [
    { termino: "x", prohibido_en: ["fdc-1"], motivo: "m" },
  ]);
});
