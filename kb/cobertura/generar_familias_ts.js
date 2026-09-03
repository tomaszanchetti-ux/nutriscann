#!/usr/bin/env node
/**
 * Genera functions/src/kb/familias.ts desde kb/curation/familias.json.
 *
 * Por qué existe: una función desplegada solo puede requerir lo que viaja
 * adentro de functions/, y tsc no copia JSON a lib/. La taxonomía entra como
 * const de TypeScript, igual que la tabla de cocción. El candado de
 * functions/src/kb/copias.test.ts compara la copia contra el JSON clave por
 * clave: si alguien edita el JSON y no regenera, el test falla.
 *
 * Uso: node kb/cobertura/generar_familias_ts.js
 */
const fs = require("fs");
const path = require("path");
const RAIZ = path.resolve(__dirname, "..", "..");
const json = JSON.parse(fs.readFileSync(path.join(RAIZ, "kb", "curation", "familias.json"), "utf8"));

const familias = json.familias.map((f) => ({
  id: f.id,
  nombre_es: f.nombre_es,
  nombre_en: f.nombre_en,
  modo: f.modo,
  cabeza: f.cabeza ?? null,
  // Solo viaja cuando vale `true`, igual que `generic` en el catálogo: una clave
  // presente y en `false` en 45 de 46 familias sería ruido en el diff de cada
  // re-seed. Ver `aporta_alcohol` en el tipo.
  ...(f.aporta_alcohol === true ? { aporta_alcohol: true } : {}),
  subfamilias: f.subfamilias.map((s) => ({
    id: s.id,
    nombre_es: s.nombre_es,
    nombre_en: s.nombre_en,
    modo: s.modo,
    metodo_por_defecto: s.metodo_por_defecto,
    cabeza: s.cabeza ?? null,
    fichas: s.fichas,
  })),
}));

const sustitutos = (json.sustitutos ?? []).map((s) => ({
  terminos: s.terminos,
  ficha: s.ficha,
  motivo: s.motivo,
}));

const cuerpo = `/* =============================================================================
 * GENERADO desde kb/curation/familias.json — NO EDITAR.
 *
 * La fuente de verdad es ese JSON de curación (Bloque 0 de la Fase 5). Acá viaja
 * la proyección que el motor y la visión necesitan: familias, subfamilias con su
 * modo, método por defecto y ficha cabeza, y qué fichas pertenecen a cada una.
 * Se regenera con \`node kb/cobertura/generar_familias_ts.js\` y el candado de
 * \`copias.test.ts\` compara clave por clave contra el JSON.
 * =============================================================================
 */

export type ModoDeFamilia = "identificar" | "componer";

export interface Subfamilia {
  id: string;
  nombre_es: string;
  nombre_en: string;
  modo: ModoDeFamilia;
  /** Uno de los métodos de \`cooking.transforms.json\`. */
  metodo_por_defecto: string;
  /** La ficha que responde cuando se nombra la subfamilia y nada más específico matchea. \`null\` = hueco declarado. */
  cabeza: string | null;
  fichas: string[];
}

export interface Familia {
  id: string;
  nombre_es: string;
  nombre_en: string;
  modo: ModoDeFamilia;
  cabeza: string | null;
  /**
   * SUS FICHAS TIENEN CALORÍAS QUE NO VIENEN DE NINGÚN MACRONUTRIENTE. Solo
   * cuando vale \`true\` (hoy: \`bebida-alcoholica\`, y nada más).
   *
   * El etanol aporta 7 kcal/g y no es proteína, ni hidrato, ni grasa. Es la
   * excepción declarada del candado de plausibilidad (\`esPlausible\`): sin ella
   * las 16 fichas de esa familia —el destilado son 231 kcal/100 g con CERO
   * macros— quedarían marcadas como imposibles. Medido sobre las 1.115 fichas:
   * con la excepción no falla ninguna; sin ella fallan esas 16 y solo esas.
   */
  aporta_alcohol?: true;
  subfamilias: Subfamilia[];
}

/**
 * UN INGREDIENTE QUE EL CATÁLOGO NO NOMBRA, Y LA FICHA QUE LA CURACIÓN DECLARA
 * EN SU LUGAR.
 *
 * NO ES UN ALIAS, y la diferencia es la razón de que exista este tipo: un alias
 * afirma que la ficha SE LLAMA así, y el build lo verifica contra las guardas de
 * vocabulario. Un sustituto afirma otra cosa —"esto no lo mide nadie, y esta
 * ficha es lo más cerca que hay"— y por eso viaja con su motivo escrito y el
 * motor lo declara en los \`caveats\` del ítem en vez de callárselo.
 *
 * Formato en \`kb/curation/familias.json\` (sección \`sustitutos\`):
 *
 *     { "terminos": ["pizza dough", "masa de pizza"],
 *       "ficha": "fdc-2708674",
 *       "motivo": "USDA no mide la masa de pizza sola: …" }
 *
 * \`terminos\` son los nombres tal como los escribe la visión, en los dos
 * idiomas; se comparan por igualdad del texto normalizado, nunca por parecido:
 * un sustituto es una decisión escrita, y el parecido ya lo cubre el difuso.
 */
export interface Sustituto {
  terminos: string[];
  ficha: string;
  motivo: string;
}

/** La versión del catálogo con la que se midió la taxonomía. */
export const FAMILIAS_KB_VERSION = ${JSON.stringify(json.kb_version_medida)};

export const FAMILIAS: Familia[] = ${JSON.stringify(familias, null, 2)};

export const SUSTITUTOS: Sustituto[] = ${JSON.stringify(sustitutos, null, 2)};

/** El id compuesto \`familia/subfamilia\`, que es el valor del enum de la visión. */
export function idCompuesto(familia: Familia, sub: Subfamilia): string {
  return \`\${familia.id}/\${sub.id}\`;
}

/** Los ${familias.reduce((n, f) => n + f.subfamilias.length, 0)} valores del enum, en el orden del JSON. */
export const IDS_FAMILIA_SUBFAMILIA: string[] = FAMILIAS.flatMap((f) => f.subfamilias.map((s) => idCompuesto(f, s)));
`;
fs.writeFileSync(path.join(RAIZ, "functions", "src", "kb", "familias.ts"), cuerpo);
console.log(
  "escrito functions/src/kb/familias.ts:",
  familias.length,
  "familias,",
  familias.reduce((n, f) => n + f.subfamilias.length, 0),
  "subfamilias,",
  sustitutos.length,
  "sustitutos",
);
