/**
 * EL CANDADO DE LAS COPIAS.
 *
 * `functions/src/kb/` NO es código nuevo: es una copia de `kb/src/` que existe
 * porque el repo no usa workspaces de npm (el hoisting rompe el empaquetado de
 * Cloud Functions) y una función desplegada solo puede requerir lo que viaja
 * adentro de `functions/`.
 *
 * Una copia sin candado es una bomba de tiempo: alguien corrige un factor en
 * `kb/`, el catálogo se rehace con el valor nuevo, y el motor sigue cuantificando
 * con el viejo sin que nada se queje. Este archivo es el que se queja. Compara
 * BYTE A BYTE el cuerpo de cada copia contra su original, y compara la tabla de
 * cocción contra el JSON de curación clave por clave.
 *
 * Si este test falla, la copia NO se arregla a mano: se vuelve a copiar el
 * original entero debajo del centinela.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { COOKING_TRANSFORMS } from "./cooking.transforms";
import { FAMILIAS, FAMILIAS_KB_VERSION, IDS_FAMILIA_SUBFAMILIA, SUSTITUTOS } from "./familias";

const RAIZ = resolve(__dirname, "..", "..", "..");
const CENTINELA = Buffer.from(
  "// ---8<--- COPIA BYTE A BYTE DEL ORIGINAL — TODO LO QUE SIGUE ES kb/src/<archivo> ---8<---\n",
  "utf8",
);

const ARCHIVOS = ["types.ts", "nutrients.ts", "transforms.ts"];

describe("las copias de kb/src son idénticas a su original", () => {
  for (const archivo of ARCHIVOS) {
    it(`${archivo} coincide byte a byte`, () => {
      const original = readFileSync(resolve(RAIZ, "kb", "src", archivo));
      const copia = readFileSync(resolve(RAIZ, "functions", "src", "kb", archivo));

      const corte = copia.indexOf(CENTINELA);
      assert.notEqual(corte, -1, `la copia de ${archivo} perdió el centinela del encabezado`);

      const cuerpo = copia.subarray(corte + CENTINELA.length);
      assert.equal(
        Buffer.compare(cuerpo, original),
        0,
        `functions/src/kb/${archivo} se separó de kb/src/${archivo}: volvé a copiar el original entero debajo del centinela`,
      );
    });

    it(`${archivo} declara que es generado`, () => {
      const copia = readFileSync(resolve(RAIZ, "functions", "src", "kb", archivo), "utf8");
      assert.match(copia.slice(0, 400), /GENERADO desde kb\/src\/.+ — NO EDITAR/);
    });
  }
});

describe("la tabla de cocción no se separó de la curación", () => {
  const json = JSON.parse(
    readFileSync(resolve(RAIZ, "kb", "curation", "cooking.transforms.json"), "utf8"),
  ) as { transforms: Record<string, { factor_peso: number; aceite_absorbido_pct: number; aceite_ref: string | null }> };

  it("están exactamente los mismos métodos", () => {
    assert.deepEqual(Object.keys(COOKING_TRANSFORMS).sort(), Object.keys(json.transforms).sort());
  });

  it("cada método tiene los mismos tres números", () => {
    for (const [id, declarado] of Object.entries(json.transforms)) {
      const copia = COOKING_TRANSFORMS[id];
      assert.ok(copia, id);
      assert.equal(copia.id, id);
      assert.equal(copia.factor_peso, declarado.factor_peso, `${id}.factor_peso`);
      assert.equal(copia.aceite_absorbido_pct, declarado.aceite_absorbido_pct, `${id}.aceite_absorbido_pct`);
      assert.equal(copia.aceite_ref, declarado.aceite_ref, `${id}.aceite_ref`);
    }
  });
});

describe("la taxonomía de familias no se separó de la curación", () => {
  const json = JSON.parse(readFileSync(resolve(RAIZ, "kb", "curation", "familias.json"), "utf8")) as {
    kb_version_medida: string;
    familias: {
      id: string; nombre_es: string; nombre_en: string; modo: string; cabeza?: string | null; aporta_alcohol?: boolean;
      subfamilias: { id: string; nombre_es: string; nombre_en: string; modo: string; metodo_por_defecto: string; cabeza?: string | null; fichas: string[] }[];
    }[];
    sustitutos?: { terminos: string[]; ficha: string; motivo: string }[];
  };

  it("son las mismas familias, subfamilias, cabezas y fichas, en el mismo orden", () => {
    const esperado = json.familias.map((f) => ({
      id: f.id, nombre_es: f.nombre_es, nombre_en: f.nombre_en, modo: f.modo, cabeza: f.cabeza ?? null,
      // `aporta_alcohol` solo viaja cuando vale `true`, igual que en el generador.
      ...(f.aporta_alcohol === true ? { aporta_alcohol: true } : {}),
      subfamilias: f.subfamilias.map((s) => ({
        id: s.id, nombre_es: s.nombre_es, nombre_en: s.nombre_en, modo: s.modo,
        metodo_por_defecto: s.metodo_por_defecto, cabeza: s.cabeza ?? null, fichas: s.fichas,
      })),
    }));
    assert.deepEqual(FAMILIAS, esperado, "regenerá con `node kb/cobertura/generar_familias_ts.js`");
    assert.equal(FAMILIAS_KB_VERSION, json.kb_version_medida);
  });

  it("son los mismos sustitutos declarados, con sus términos y su motivo", () => {
    // El candado de la card 5.3: los sustitutos son curación —"USDA no mide esto
    // y esta es la ficha más cercana"— y viajan al motor por esta copia. Si
    // alguien agrega uno al JSON y no regenera, el motor sigue sin encontrarlo.
    assert.deepEqual(SUSTITUTOS, json.sustitutos ?? [], "regenerá con `node kb/cobertura/generar_familias_ts.js`");
  });

  it("el enum tiene una entrada por subfamilia y ninguna repetida", () => {
    const total = json.familias.reduce((n, f) => n + f.subfamilias.length, 0);
    assert.equal(IDS_FAMILIA_SUBFAMILIA.length, total);
    assert.equal(new Set(IDS_FAMILIA_SUBFAMILIA).size, total);
  });

  it("cada método por defecto existe en la tabla de cocción", () => {
    for (const f of FAMILIAS) for (const s of f.subfamilias) assert.ok(COOKING_TRANSFORMS[s.metodo_por_defecto], `${f.id}/${s.id}: ${s.metodo_por_defecto}`);
  });
});
