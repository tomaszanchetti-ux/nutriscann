#!/usr/bin/env node
/**
 * informe.js — el golden set, medido OFFLINE, desde el repo.
 *
 * Tres medidas y ninguna llamada a nada:
 *
 *   1. REPLAY — vuelve a jugar contra el motor de hoy los términos que la visión
 *      escribió el día de la corrida. Mismo término, misma foto: lo que cambie es
 *      del motor y de nadie más.
 *   2. CRITERIO 2 — los kcal contra los gramos QUE LA VISIÓN REPORTÓ, no contra
 *      los que la predicción supuso (DT-28, punto 4).
 *   3. ESTABILIDAD — cuánto se movió la visión entre dos corridas sobre las
 *      mismas fotos (DT-28, punto 5).
 *
 * Uso (desde cualquier lado):
 *   node golden/bin/informe.js                       # v1 vs v2, el set de 30
 *   node golden/bin/informe.js respuestas respuestas-v2
 *   node golden/bin/informe.js --detalle             # además, fila por fila
 *   node golden/bin/informe.js --catalogo=/ruta/foods.canonical.json
 *
 * PARA ATRIBUIRLE UN CAMBIO AL MOTOR HAY QUE CLAVAR EL CATÁLOGO. Cada respuesta
 * grabada dice con qué `kb_version` se calculó (`meta.kb_version`). Si el replay
 * corre contra un catálogo posterior, lo que se ve es la suma de dos cosas —lo
 * que cambió el motor y lo que cambió la curación— y no se pueden separar. Con
 * `--catalogo` apuntando al catálogo de aquella corrida, lo único que se mueve es
 * el motor. El catálogo viejo se saca de git, no se guarda acá duplicado:
 *
 *   git show <commit>:kb/build/foods.canonical.json > /tmp/kb-de-la-corrida.json
 *   node golden/bin/informe.js --catalogo=/tmp/kb-de-la-corrida.json
 *
 * Requiere `functions/lib` compilado: `cd functions && npm run build`.
 * La lógica NO vive acá: vive en `functions/src/engine/golden.ts`, que se compila
 * con el resto del motor y tiene sus propios candados en `golden.test.ts`. Este
 * archivo es la línea de comandos y nada más.
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");

const RAIZ = path.resolve(__dirname, "..", "..");
const LIB = path.join(RAIZ, "functions", "lib", "engine");

if (!fs.existsSync(path.join(LIB, "golden.js"))) {
  console.error("Falta compilar el motor. Corré:  cd functions && npm run build");
  process.exit(2);
}

const golden = require(path.join(LIB, "golden.js"));
const { indiceReal } = require(path.join(LIB, "testing.js"));
const { construirIndice } = require(path.join(LIB, "catalog.js"));

const args = process.argv.slice(2);
const detalle = args.includes("--detalle");
const pinneado = (args.find((a) => a.startsWith("--catalogo=")) ?? "").split("=")[1];
const corridas = args.filter((a) => !a.startsWith("--"));
const nombreA = corridas[0] ?? "respuestas";
const nombreB = corridas[1] ?? "respuestas-v2";

const a = golden.corridaGrabada(nombreA);
const b = golden.corridaGrabada(nombreB);
const criterios = golden.criteriosDelSet();
const index = (() => {
  if (!pinneado) return indiceReal();
  const catalogo = JSON.parse(fs.readFileSync(pinneado, "utf8"));
  return construirIndice(catalogo.foods, catalogo.kb_version);
})();

/**
 * El aviso que evita leer mal todo lo de abajo: si el índice no es el catálogo con
 * el que se grabó la corrida, cualquier diferencia es la SUMA del motor y de la
 * curación, y no se pueden separar. Las dos corridas del set de 30 se grabaron con
 * catálogos distintos (v1 con el 3.0.0, v2 con el 3.1.0), así que este aviso se
 * enciende casi siempre y hay que hacerle caso.
 */
function avisarDesfase(nombre, corrida) {
  const versiones = golden.versionesDeLaCorrida(corrida);
  if (versiones.length === 1 && versiones[0] === index.kb_version) return;
  linea(
    `  ⚠ ${nombre} se grabó con ${versiones.join(" + ") || "un catálogo sin declarar"} y el índice es ` +
      `${index.kb_version}: lo que cambie acá es MOTOR + CURACIÓN, no solo motor.`,
  );
}

const linea = (t) => console.log(t);
const regla = () => linea("-".repeat(78));

linea(`golden set-30 · catálogo ${index.kb_version} · ${nombreA} (${a.length}) vs ${nombreB} (${b.length})`);
regla();

// --- 1 · replay --------------------------------------------------------------
linea("OJO CON EL REPLAY: las respuestas grabadas NO traen `food_es` (DT-25), así que solo se");
linea("puede volver a jugar la mitad inglesa. Los ítems que aquel día entraron por el nombre");
linea("español salen marcados `no_comparable_es` y no cuentan ni a favor ni en contra.");
regla();

const MARCAS = {
  destrabado: "+",
  perdido: "-",
  otra_ficha: "~",
  sigue_en_silencio: ".",
  no_comparable_es: "?",
  resuelto_igual: "=",
};

for (const [nombre, corrida] of [[nombreA, a], [nombreB, b]]) {
  const r = golden.replayDeCorrida(corrida, index);
  linea(
    `REPLAY ${nombre}: ${r.items} ítems · silencios grabados ${r.silencios_grabados} · ` +
      `DESTRABADOS ${r.destrabados} · perdidos ${r.perdidos} · otra ficha ${r.otra_ficha} · ` +
      `no comparables (entraron por el español) ${r.no_comparables}`,
  );
  avisarDesfase(nombre, corrida);
  for (const f of r.filas) {
    if (f.cambio === "resuelto_igual" || (!detalle && f.cambio === "no_comparable_es")) continue;
    const marca = MARCAS[f.cambio] ?? "?";
    linea(
      `  ${marca} ${f.plato.padEnd(26)} "${f.termino_en}"  ${f.food_id_grabado ?? "silencio"} -> ` +
        `${f.food_id_actual ?? "silencio"}${f.nombre_actual ? ` (${f.nombre_actual}, ${f.confianza_actual})` : ""}`,
    );
  }
  regla();
}

// --- 2 · criterio 2 ----------------------------------------------------------
for (const [nombre, corrida] of [[nombreA, a], [nombreB, b]]) {
  const escrito = golden.criterio2(corrida, criterios, { contra: "totales" });
  const c2 = golden.criterio2(corrida, criterios);
  linea(
    `CRITERIO 2 ${nombre}: ${c2.en_regla}/${c2.denominador} = ${c2.porcentaje} % ` +
      `(umbral ${criterios.umbral_criterio_2 * 100} %) → ${c2.pasa ? "PASA" : "FALLA"}`,
  );
  linea(
    `  contra los gramos TOTALES del plato en vez de los cuantificados: ` +
      `${escrito.en_regla}/${escrito.denominador} = ${escrito.porcentaje} %`,
  );
  for (const f of c2.filas) {
    if (f.veredicto === "fuera_de_rango" || detalle) {
      linea(`  ${f.veredicto === "fuera_de_rango" ? "✗" : "·"} ${f.plato.padEnd(26)} ${f.motivo}`);
    }
  }
  regla();
}

// --- 3 · estabilidad ---------------------------------------------------------
const e = golden.compararCorridas(a, b);
linea(
  `ESTABILIDAD DE LA VISIÓN ${nombreA} → ${nombreB}: ` +
    `${e.identicos} idénticos · ${e.movidos} movidos ` +
    `(ítems distintos ${e.con_items_distintos} · gramos ±${golden.TOLERANCIA_DE_GRAMOS * 100} % ${e.con_gramos_movidos} · ` +
    `veredicto ${e.con_veredicto_distinto})`,
);
linea(`  salto absoluto promedio del total: ${e.delta_kcal_promedio === null ? "—" : `${(e.delta_kcal_promedio * 100).toFixed(1)} %`}`);
for (const p of e.platos) {
  if (p.estable && !detalle) continue;
  const partes = [];
  if (p.aparecidos.length > 0) partes.push(`+[${p.aparecidos.join(" · ")}]`);
  if (p.desaparecidos.length > 0) partes.push(`-[${p.desaparecidos.join(" · ")}]`);
  for (const g of p.gramos_movidos) partes.push(`${g.termino_en} ${g.gramos_a}→${g.gramos_b} g`);
  for (const f of p.ficha_cambiada) partes.push(`ficha ${f.termino_en}: ${f.food_id_a} →`.concat(` ${f.food_id_b}`));
  if (p.cambio_de_veredicto) partes.push("is_food CAMBIÓ");
  const delta = p.delta_kcal === null ? "" : ` · total ${(p.delta_kcal * 100).toFixed(1)} %`;
  linea(`  ${p.estable ? "=" : "≠"} ${p.plato.padEnd(26)}${delta}`);
  for (const parte of partes) linea(`      ${parte}`);
}
regla();
