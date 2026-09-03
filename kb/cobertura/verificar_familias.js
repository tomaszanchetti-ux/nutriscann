#!/usr/bin/env node
/**
 * EL CANDADO DE LA TAXONOMÍA: cada ficha del catálogo está en EXACTAMENTE una
 * subfamilia de `kb/curation/familias.json`. Ni cero ni dos.
 *
 * Nació con el Bloque 0 de la Fase 5 (03/09/2026), que propuso la taxonomía
 * familia → subfamilia para que la visión pueda nombrar cada alimento con el
 * vocabulario del catálogo y el motor pueda caer siempre en una ficha cabeza.
 * La card 5.3 lo convierte en test de `functions/`; hasta entonces se corre a mano:
 *
 *   node kb/cobertura/verificar_familias.js
 *
 * QUÉ VERIFICA, y por qué cada cosa:
 *
 *   1. COBERTURA TOTAL Y SIN SOLAPE. Una ficha en dos subfamilias hace que la
 *      cascada del motor dependa del orden de recorrido, que es la peor clase de
 *      bug: no falla, elige mal en silencio. Una ficha en cero subfamilias es una
 *      ficha inalcanzable por familia, que es exactamente el agujero que este
 *      Bloque 0 vino a medir (la pizza de la producción del 02/09).
 *   2. IDS QUE EXISTEN. Un id que no está en el catálogo es una ficha renombrada
 *      o retirada, y la taxonomía tiene que enterarse al re-seed, no en runtime.
 *   3. LA CABEZA ESTÁ ADENTRO. Una subfamilia cuya cabeza pertenece a otra
 *      subfamilia respondería con una ficha de otro grupo: es el caso
 *      "pepperoni pizza" → embutido, escrito en la taxonomía en vez de en el
 *      matcher.
 *   4. NOMBRES E IDS BIEN FORMADOS, sin repetir, y `modo` y `metodo_por_defecto`
 *      dentro de sus listas cerradas.
 *   5. EL CENSO DE HUECOS. Las subfamilias sin cabeza NO son un error: son un
 *      hallazgo declarado, y cada una tiene que traer su `motivo`. Lo que sí es
 *      un error es una sin cabeza y sin motivo — eso es un olvido disfrazado.
 *
 * El script no arregla nada y no escribe nada: imprime lo que midió y sale con
 * código 1 si algún candado se rompe.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..", "..");
const CATALOGO = path.join(RAIZ, "kb", "build", "foods.canonical.json");
const TAXONOMIA = path.join(RAIZ, "kb", "curation", "familias.json");

const MODOS = new Set(["identificar", "componer"]);
const METODOS = new Set(["mezclado", "frito", "horneado", "horneado_masa", "plancha"]);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const catalogo = JSON.parse(fs.readFileSync(CATALOGO, "utf8"));
const taxonomia = JSON.parse(fs.readFileSync(TAXONOMIA, "utf8"));

const errores = [];
const avisos = [];
const fallo = (msg) => errores.push(msg);

const fichasDelCatalogo = new Map(catalogo.foods.map((f) => [f.id, f]));

// ---------------------------------------------------------------- 1 y 2
/** En cuántas subfamilias aparece cada id, y en cuáles. */
const apariciones = new Map();
const idsFamilia = new Set();
let nSub = 0;

for (const familia of taxonomia.familias) {
  if (!KEBAB.test(familia.id)) fallo(`familia con id que no es kebab-case: "${familia.id}"`);
  if (idsFamilia.has(familia.id)) fallo(`familia repetida: "${familia.id}"`);
  idsFamilia.add(familia.id);
  for (const campo of ["nombre_es", "nombre_en"]) {
    if (typeof familia[campo] !== "string" || familia[campo].length === 0) {
      fallo(`la familia "${familia.id}" no declara ${campo}`);
    }
  }
  if (!MODOS.has(familia.modo)) fallo(`la familia "${familia.id}" declara modo "${familia.modo}"`);

  const idsSub = new Set();
  for (const sub of familia.subfamilias) {
    nSub += 1;
    const clave = `${familia.id}/${sub.id}`;
    if (!KEBAB.test(sub.id)) fallo(`subfamilia con id que no es kebab-case: "${clave}"`);
    if (idsSub.has(sub.id)) fallo(`subfamilia repetida dentro de la familia: "${clave}"`);
    idsSub.add(sub.id);
    for (const campo of ["nombre_es", "nombre_en"]) {
      if (typeof sub[campo] !== "string" || sub[campo].length === 0) {
        fallo(`la subfamilia "${clave}" no declara ${campo}`);
      }
    }
    if (!MODOS.has(sub.modo)) fallo(`la subfamilia "${clave}" declara modo "${sub.modo}"`);
    if (!METODOS.has(sub.metodo_por_defecto)) {
      fallo(`la subfamilia "${clave}" declara metodo_por_defecto "${sub.metodo_por_defecto}", que no está en la tabla`);
    }

    for (const id of sub.fichas) {
      if (!fichasDelCatalogo.has(id)) fallo(`"${clave}" nombra la ficha "${id}", que no está en el catálogo`);
      if (!apariciones.has(id)) apariciones.set(id, []);
      apariciones.get(id).push(clave);
    }

    // ------------------------------------------------------------ 3 y 5
    if (sub.cabeza === null) {
      if (typeof sub.motivo !== "string" || sub.motivo.length === 0) {
        fallo(`"${clave}" no tiene cabeza y tampoco motivo: un hueco sin motivo es un olvido`);
      }
    } else if (!sub.fichas.includes(sub.cabeza)) {
      fallo(`la cabeza de "${clave}" es "${sub.cabeza}", que NO pertenece a esa subfamilia`);
    }
  }

  if (familia.cabeza !== null) {
    const todas = familia.subfamilias.flatMap((s) => s.fichas);
    if (!todas.includes(familia.cabeza)) {
      fallo(`la cabeza de la familia "${familia.id}" es "${familia.cabeza}", que no pertenece a ninguna de sus subfamilias`);
    }
  } else if (typeof familia.motivo !== "string" || familia.motivo.length === 0) {
    fallo(`la familia "${familia.id}" no tiene cabeza y tampoco motivo`);
  }
}

const enCero = [];
const enDos = [];
for (const [id] of fichasDelCatalogo) {
  const veces = (apariciones.get(id) ?? []).length;
  if (veces === 0) enCero.push(id);
  else if (veces > 1) enDos.push(`${id} → ${apariciones.get(id).join(", ")}`);
}
if (enCero.length > 0) fallo(`${enCero.length} fichas no están en ninguna subfamilia: ${enCero.slice(0, 10).join(", ")}${enCero.length > 10 ? "…" : ""}`);
if (enDos.length > 0) fallo(`${enDos.length} fichas están en más de una subfamilia: ${enDos.slice(0, 10).join(" | ")}`);

// ------------------------------------------------------ el rango declarado
if (taxonomia.familias.length < 40 || taxonomia.familias.length > 70) {
  fallo(`la taxonomía declara ${taxonomia.familias.length} familias; el rango acordado en el Bloque 0 es 40–70`);
}
if (taxonomia.kb_version_medida !== catalogo.kb_version) {
  avisos.push(`la taxonomía se midió contra ${taxonomia.kb_version_medida} y el catálogo de hoy es ${catalogo.kb_version}: hay que volver a correr el Bloque 0`);
}

// ------------------------------------------------------------- el informe
const sinCabeza = [];
const vacias = [];
const porModo = { identificar: 0, componer: 0 };
const porMetodo = {};
for (const familia of taxonomia.familias) {
  for (const sub of familia.subfamilias) {
    porModo[sub.modo] += 1;
    porMetodo[sub.metodo_por_defecto] = (porMetodo[sub.metodo_por_defecto] ?? 0) + 1;
    if (sub.cabeza === null) sinCabeza.push(`${familia.id}/${sub.id}`);
    if (sub.fichas.length === 0) vacias.push(`${familia.id}/${sub.id}`);
  }
}
const origen = taxonomia.origen_de_asignacion ?? {};
const porOrigen = {};
for (const v of Object.values(origen)) porOrigen[v] = (porOrigen[v] ?? 0) + 1;

console.log(`Catálogo:   ${catalogo.kb_version} · ${catalogo.foods.length} fichas`);
console.log(`Taxonomía:  ${taxonomia.criteria_version} · ${taxonomia.familias.length} familias · ${nSub} subfamilias`);
console.log(`Cobertura:  ${apariciones.size} fichas ubicadas · ${enCero.length} en ninguna · ${enDos.length} en más de una`);
console.log(`Modo:       identificar ${porModo.identificar} · componer ${porModo.componer}`);
console.log(`Método:     ${Object.entries(porMetodo).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`Origen:     ${Object.entries(porOrigen).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
console.log(`Sin cabeza: ${sinCabeza.length}${sinCabeza.length ? ` → ${sinCabeza.join(", ")}` : ""}`);
console.log(`Sin fichas: ${vacias.length}${vacias.length ? ` → ${vacias.join(", ")}` : ""}`);

for (const aviso of avisos) console.log(`AVISO · ${aviso}`);

if (errores.length > 0) {
  console.error(`\n${errores.length} candado(s) rotos:`);
  for (const e of errores) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log("\nTodos los candados pasan.");
