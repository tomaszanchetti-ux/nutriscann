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
