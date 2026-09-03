/**
 * EL CANDADO DEL CONTRATO DEL FRONT (DT-20, card 3.1).
 *
 * `apps/web/src/lib/types.ts` es una COPIA de los tipos de salida del motor
 * (`functions/src/engine/types.ts`), y existe porque el repo no usa workspaces
 * de npm: `apps/web` no puede importar de `functions/`. Hasta esta card esa
 * copia no tenía nada que la atara al original, y se separó de verdad: la card
 * 6.1 hizo que los ocho valores del total pudieran viajar en `null` y el front
 * siguió declarando `kcal: number` durante toda la WS06. No rompió una pantalla
 * —el render ya se escondía detrás de otro chequeo— pero el contrato mintió, y
 * nadie se enteró.
 *
 * POR QUÉ ACÁ Y NO EN `apps/web`. Este candado tiene que CORRER en CI, y para
 * eso hace falta un runner de tests. `apps/web` no tiene ninguno (`lint` es
 * `tsc --noEmit`, `build` es Vite) y sumarle uno significaría dependencias npm
 * nuevas en la PWA, que es justo lo que la Fase 3 no quiere. `kb/seed` ya corre
 * `node --test` sin una sola dependencia de runtime y YA LEE el front por el
 * mismo motivo: `textos.test.ts` confronta `config/copy.json` contra la interfaz
 * `CopyDeLaApp` de `apps/web/src/lib/config.ts`. Este archivo es el hermano de
 * aquel: uno cuida los TEXTOS que el front lee, este cuida los TIPOS.
 *
 * POR QUÉ NO ES BYTE A BYTE como `functions/src/kb/copias.test.ts`. Aquella es
 * una copia ENTERA de su original y por eso se puede comparar el buffer. Esta es
 * un SUBCONJUNTO —solo lo que el navegador ve— con sus propios comentarios, así
 * que el candado compara lo que de verdad importa: para cada tipo del contrato,
 * la LISTA DE CAMPOS y el TEXTO DE CADA TIPO, ya sin comentarios ni espacios.
 * Un campo nuevo en el motor, uno que cambia de `number` a `number | null`, uno
 * que pasa a opcional: los tres hacen fallar este test.
 *
 * Cómo se arregla cuando falla: se copia el campo del original TAL CUAL está en
 * `functions/src/engine/types.ts`. No se inventa acá una forma parecida.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const RAIZ = resolve(__dirname, "..", "..", "..");
const TIPOS_DEL_MOTOR = resolve(RAIZ, "functions", "src", "engine", "types.ts");
const TIPOS_DEL_FRONT = resolve(RAIZ, "apps", "web", "src", "lib", "types.ts");
const TIPOS_DEL_CATALOGO = resolve(RAIZ, "kb", "src", "types.ts");

/**
 * Los tipos que el front COPIA y que, por lo tanto, tienen que ser idénticos.
 *
 * `RespuestaDeAnalisis`, `MetaDelScan` y `ErrorDelBackend` NO están: son el
 * sobre del endpoint (card 2.2), no salida del motor — el motor no sabe de HTTP.
 * `VisionItem` y compañía tampoco: el navegador nunca los ve.
 */
const TIPOS_COMPARTIDOS = [
  "TipoDeMatch",
  "Per100gEscalado",
  "ComponenteDelPlato",
  "Composicion",
  "EngineItem",
  "PorcentajesDeMacros",
  "EngineTotals",
] as const;

// ── Leer un archivo de tipos sin compilarlo ─────────────────────────────────

/** Saca comentarios de bloque y de línea, que no son parte del contrato. */
function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** El cuerpo de `export interface X { … }`, hasta la llave que cierra sola. */
function cuerpoDeInterface(fuente: string, nombre: string, archivo: string): string {
  const encontrado = new RegExp(`export interface ${nombre} \\{([\\s\\S]*?)\\n\\}`).exec(fuente);
  assert.ok(encontrado, `no encontré 'export interface ${nombre}' en ${archivo}`);
  return encontrado[1] as string;
}

/** El lado derecho de `export type X = … ;`, normalizado. */
function aliasDeTipo(fuente: string, nombre: string, archivo: string): string {
  // `=\\s*`: el alias puede abrir en la misma línea o en la siguiente (una unión
  // de nueve sellos, como `TipoDeMatch` desde la card 5.3, se escribe una por línea).
  const encontrado = new RegExp(`export type ${nombre} =\\s*([\\s\\S]*?);`).exec(sinComentarios(fuente));
  assert.ok(encontrado, `no encontré 'export type ${nombre}' en ${archivo}`);
  return (encontrado[1] as string).replace(/\s+/g, " ").trim();
}

/**
 * Los campos de un cuerpo de interface, como `["nombre?: tipo", …]`, en orden.
 *
 * Se parte por `;` porque ningún campo de este contrato tiene un `;` adentro de
 * su tipo (los genéricos que hay —`Partial<Record<…>>`, `string[]`— usan comas).
 * Si algún día lo hubiera, el test se rompe fuerte y se ve: no pasa de largo.
 */
function campos(cuerpo: string): string[] {
  return sinComentarios(cuerpo)
    .split(";")
    .map((campo) => campo.replace(/\s+/g, " ").trim())
    .filter((campo) => campo !== "");
}

function camposDeInterface(fuente: string, nombre: string, archivo: string): string[] {
  return campos(cuerpoDeInterface(fuente, nombre, archivo));
}

const motor = readFileSync(TIPOS_DEL_MOTOR, "utf8");
const front = readFileSync(TIPOS_DEL_FRONT, "utf8");
const catalogo = readFileSync(TIPOS_DEL_CATALOGO, "utf8");

// ── Los tipos que el front copia, campo por campo ───────────────────────────

for (const nombre of TIPOS_COMPARTIDOS) {
  test(`${nombre}: el front declara exactamente lo que declara el motor`, () => {
    const esAlias = new RegExp(`export type ${nombre} =\\s`).test(motor);
    if (esAlias) {
      assert.equal(
        aliasDeTipo(front, nombre, TIPOS_DEL_FRONT),
        aliasDeTipo(motor, nombre, TIPOS_DEL_MOTOR),
        `apps/web/src/lib/types.ts se separó de functions/src/engine/types.ts en '${nombre}'`,
      );
      return;
    }
    assert.deepEqual(
      camposDeInterface(front, nombre, TIPOS_DEL_FRONT),
      camposDeInterface(motor, nombre, TIPOS_DEL_MOTOR),
      `apps/web/src/lib/types.ts se separó de functions/src/engine/types.ts en '${nombre}': ` +
        "copiá el campo del original tal cual está allá, no lo reescribas acá.",
    );
  });
}

// ── El total, que en el motor es un tipo mapeado ────────────────────────────

/**
 * `TotalesNutrientes` no se puede comparar campo a campo de un lado al otro: en
 * el motor es `{ [K in keyof SumaDeNutrientes]: number | null }` y en el front
 * está escrito a mano, porque el front no tiene la suma cruda (no viaja). Así
 * que se verifican las DOS mitades de esa igualdad por separado: que el motor
 * siga mapeando lo que decimos que mapea, y que el front tenga esos mismos ocho
 * nombres, los ocho en `number | null`.
 */
test("TotalesNutrientes: el motor sigue mapeando la suma cruda a `number | null`", () => {
  assert.equal(
    aliasDeTipo(motor, "TotalesNutrientes", TIPOS_DEL_MOTOR),
    "{ [K in keyof SumaDeNutrientes]: number | null }",
    "el motor cambió la forma del total y el front lo tiene escrito a mano: hay que rehacer " +
      "TotalesNutrientes en apps/web/src/lib/types.ts",
  );
});

test("TotalesNutrientes: los ocho nombres de la suma del motor, los ocho nullables", () => {
  const delMotor = camposDeInterface(motor, "SumaDeNutrientes", TIPOS_DEL_MOTOR).map(
    (campo) => (campo.split(":")[0] as string).trim(),
  );
  const esperados = delMotor.map((nombre) => `${nombre}: number | null`);
  assert.equal(esperados.length, 8, "la suma del motor dejó de tener ocho valores");
  assert.deepEqual(
    camposDeInterface(front, "TotalesNutrientes", TIPOS_DEL_FRONT),
    esperados,
    "los ocho valores del total viajan nullables desde la card 6.1 (la compuerta cierra el " +
      "payload entero): el front tiene que declararlos así, o vuelve a abrirse la DT-20.",
  );
});

// ── Per100g: su original no es el motor, es el catálogo ─────────────────────

test("Per100g: el front copia la ficha del catálogo, no una parecida", () => {
  assert.deepEqual(
    camposDeInterface(front, "Per100g", TIPOS_DEL_FRONT),
    camposDeInterface(catalogo, "Per100g", TIPOS_DEL_CATALOGO),
    "apps/web/src/lib/types.ts se separó de kb/src/types.ts en 'Per100g'",
  );
});

// ── El atajo que el front se permite: `OpcionalAusente` ─────────────────────

/**
 * El motor escribe la unión de los cuatro opcionales INLINE, adentro de
 * `EngineTotals.opcionales_ausentes`. El front la copia inline (por el candado
 * de arriba) y además le pone nombre, porque `AvisoParcial` recorre esas claves.
 * Ese nombre es el único agregado del front sobre el contrato, y se verifica
 * acá: si el motor suma un quinto opcional, las dos listas se separan.
 */
test("OpcionalAusente nombra exactamente los opcionales que el motor declara", () => {
  const campo = camposDeInterface(motor, "EngineTotals", TIPOS_DEL_MOTOR).find((c) =>
    c.startsWith("opcionales_ausentes:"),
  );
  assert.ok(campo, "EngineTotals ya no declara 'opcionales_ausentes'");
  const union = /Record<(.+), string>/.exec(campo);
  assert.ok(union, `no pude leer la unión de opcionales en: ${campo}`);
  assert.equal(
    aliasDeTipo(front, "OpcionalAusente", TIPOS_DEL_FRONT),
    (union[1] as string).trim(),
    "el alias del front y la unión del motor se separaron",
  );
});
