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
  subfamilias: Subfamilia[];
}

/** La versión del catálogo con la que se midió la taxonomía. */
export const FAMILIAS_KB_VERSION = ${JSON.stringify(json.kb_version_medida)};

export const FAMILIAS: Familia[] = ${JSON.stringify(familias, null, 2)};

/** El id compuesto \`familia/subfamilia\`, que es el valor del enum de la visión. */
export function idCompuesto(familia: Familia, sub: Subfamilia): string {
  return \`\${familia.id}/\${sub.id}\`;
}

/** Los ${familias.reduce((n, f) => n + f.subfamilias.length, 0)} valores del enum, en el orden del JSON. */
export const IDS_FAMILIA_SUBFAMILIA: string[] = FAMILIAS.flatMap((f) => f.subfamilias.map((s) => idCompuesto(f, s)));
`;
fs.writeFileSync(path.join(RAIZ, "functions", "src", "kb", "familias.ts"), cuerpo);
console.log("escrito functions/src/kb/familias.ts:", familias.length, "familias,", familias.reduce((n, f) => n + f.subfamilias.length, 0), "subfamilias");
