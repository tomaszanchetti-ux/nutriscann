#!/usr/bin/env node
/**
 * replay-vision.js — el golden de 30 fotos, re-jugado con la SALIDA CRUDA de la
 * visión v6, OFFLINE, sin llamar a ningún modelo.
 *
 * `informe.js` re-juega "respuestas" grabadas por `golden.ts` (un formato
 * propio, sin componentes). Este script es otro: lee directamente los 31 JSON
 * de `golden/set-30/vision-v6/` —lo que devolvió Sonnet ese día, `vision.items`
 * con sus `components`— y los pasa por `analizarEscaneo` (el motor entero, con
 * la composición on-demand incluida). Existe porque la card 6.1 necesitaba medir
 * el efecto de ponderar por gramos SOBRE COMPUESTOS, y el golden grabado con
 * `golden.ts` no trae `components` en su formato.
 *
 * Por cada ítem de cada foto imprime: la foto, el nombre, su `food_id` (el de
 * la ficha que ganó; en un compuesto no hay UNA ficha, así que va "—" y la
 * traza está en sus componentes), si es compuesto, su confianza, sus kcal, y el
 * eslabón más débil cuando lo hay (card 6.1). Si el ítem es un compuesto,
 * además imprime UNA FILA POR COMPONENTE con su propio `food_id`, su match y su
 * confianza — sin esto, un cambio de ficha con la misma confianza y las mismas
 * kcal redondeadas (como el de la lombarda de la card 6.3: crudo → cocido,
 * mismo 0,6) pasaba inadvertido en un diff que solo mira el ítem. Al final, el
 * total del plato (o "SIN TOTAL" si la compuerta cerró).
 *
 * Uso:
 *   cd functions && npm run build            # compila esta rama
 *   node golden/bin/replay-vision.js
 *   node golden/bin/replay-vision.js --tsv > /tmp/branch.tsv
 *
 * PARA COMPARAR CONTRA OTRA RAMA (por ejemplo `main`, el baseline de la card
 * 6.1): compilar esa rama en OTRO working tree y apuntar `--lib` a su
 * `functions/lib/engine`. El catálogo que se usa es el de ESE mismo working
 * tree (mismo mecanismo que `testing.js`: resuelve la raíz del repo desde
 * `--lib`), así que si las dos ramas comparten `kb/build/foods.canonical.json`
 * —medido: idéntico entre esta rama y `main` al cerrar la card 6.1— lo único
 * que cambia entre las dos corridas es el motor.
 *
 *   git worktree add /tmp/wt-main main
 *   (cd /tmp/wt-main/functions && npm install && npm run build)
 *   node golden/bin/replay-vision.js --lib=/tmp/wt-main/functions/lib/engine --tsv > /tmp/main.tsv
 *   git worktree remove --force /tmp/wt-main
 *
 * EL "DIFF" ES `diff` A SECAS, NO UN MODO DEL SCRIPT: con `--tsv` cada fila
 * —ítem o componente— trae su `food_id` en una columna propia, así que
 *
 *   diff /tmp/main.tsv /tmp/branch.tsv
 *
 * ya distingue "cambió la ficha" (columna `food_id` distinta) de "cambió el
 * número" (columnas `confianza`/`kcal` distintas) sin tener que leer nada más.
 *
 * Requiere `functions/lib` compilado (`cd functions && npm run build`) — el de
 * esta rama por defecto, o el que diga `--lib`. La lógica NO vive acá: vive en
 * `functions/src/engine/analyze.ts`. Este archivo es la línea de comandos y la
 * lectura de los JSON, nada más.
 */
"use strict";

const path = require("node:path");
const fs = require("node:fs");

const RAIZ = path.resolve(__dirname, "..", "..");
const CARPETA_GOLDEN = path.join(RAIZ, "golden", "set-30", "vision-v6");

const args = process.argv.slice(2);
const tsv = args.includes("--tsv");
const libOverride = (args.find((a) => a.startsWith("--lib=")) ?? "").split("=")[1];
const LIB = libOverride ? path.resolve(libOverride) : path.join(RAIZ, "functions", "lib", "engine");

if (!fs.existsSync(path.join(LIB, "analyze.js"))) {
  console.error(`Falta compilar el motor en ${LIB}. Corré:  cd functions && npm run build`);
  process.exit(2);
}

const { analizarEscaneo } = require(path.join(LIB, "analyze.js"));
const { indiceReal } = require(path.join(LIB, "testing.js"));

const index = indiceReal();

const archivos = fs
  .readdirSync(CARPETA_GOLDEN)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .sort();

if (archivos.length === 0) {
  console.error(`No hay JSON en ${CARPETA_GOLDEN}.`);
  process.exit(2);
}

/** `null`/`undefined` → "—", para no confundir "no aplica" con "cero" ni con vacío. */
const txt = (v) => (v === null || v === undefined || v === "" ? "—" : String(v));
/** Igual que `txt`, pero para números, con los decimales que pida. */
const fmt = (v, decimales = 1) => (v === null || v === undefined ? "—" : Number(v).toFixed(decimales));

const filas = [];

for (const archivo of archivos) {
  const foto = archivo.replace(/\.json$/, "");
  const data = JSON.parse(fs.readFileSync(path.join(CARPETA_GOLDEN, archivo), "utf8"));
  const vision = data.vision;
  if (!vision || typeof vision !== "object") {
    filas.push({ foto, tipo: "aviso", aviso: "el JSON no trae `vision`" });
    continue;
  }

  const resultado = analizarEscaneo(vision, index);

  if (!resultado.es_comida) {
    filas.push({ foto, tipo: "aviso", aviso: "la visión dijo que no es comida" });
    continue;
  }

  for (const item of resultado.items) {
    const compuesto = item.match === "compuesto" || item.match === "compuesto_parcial";
    const eslabon = item.composicion?.eslabon_mas_debil ?? null;
    filas.push({
      foto,
      tipo: "item",
      nombre: item.termino_es || item.termino_en,
      // En un compuesto no hay UNA ficha —`food_id` sale `null` del motor
      // (la traza está en `composicion.componentes`, una fila por debajo)—,
      // así que acá se ve "—" y no un `null` que se confunda con "no matcheó".
      food_id: item.food_id,
      compuesto,
      match: item.match,
      confianza: item.confidence,
      kcal: item.nutrients?.kcal ?? null,
      eslabon: eslabon
        ? `"${eslabon.termino_en}" → ${eslabon.name_es ?? "sin nombre en español"} @ ${eslabon.confidence_match}`
        : null,
    });

    // UNA FILA POR COMPONENTE, solo si el ítem es un compuesto. Es la única
    // forma de ver un cambio de ficha entre dos corridas cuando la confianza y
    // las kcal del ítem no se movieron lo suficiente como para notarlo — el
    // caso medido es la lombarda de la foto 20 (card 6.3): mismo 0,6 de
    // confianza, ficha distinta (crudo en vez de cocido).
    if (compuesto && item.composicion) {
      for (const c of item.composicion.componentes) {
        filas.push({
          foto,
          tipo: "componente",
          nombre: `  └ ${c.termino_en}`,
          food_id: c.food_id,
          match: c.match,
          confianza: c.confidence_match,
          grams: c.grams,
        });
      }
    }
  }

  filas.push({
    foto,
    tipo: "total",
    kcal_total: resultado.totals?.nutrients.kcal ?? null,
    sin_total: resultado.totals === null || resultado.totals.total_no_publicable === true,
  });
}

if (tsv) {
  console.log(["foto", "tipo", "nombre", "food_id", "compuesto", "match", "confianza", "kcal", "eslabon_mas_debil"].join("\t"));
  for (const f of filas) {
    if (f.tipo === "total") {
      console.log(
        [f.foto, "total", "TOTAL", "—", "—", "—", "—", f.sin_total ? "SIN_TOTAL" : fmt(f.kcal_total), "—"].join("\t"),
      );
      continue;
    }
    if (f.tipo === "aviso") {
      console.log([f.foto, "aviso", `AVISO: ${f.aviso}`, "—", "—", "—", "—", "—", "—"].join("\t"));
      continue;
    }
    if (f.tipo === "componente") {
      console.log(
        [f.foto, "componente", f.nombre, txt(f.food_id), "—", f.match, fmt(f.confianza, 3), "—", "—"].join("\t"),
      );
      continue;
    }
    console.log(
      [
        f.foto,
        "item",
        f.nombre,
        txt(f.food_id),
        f.compuesto ? "sí" : "no",
        f.match,
        fmt(f.confianza, 3),
        fmt(f.kcal),
        f.eslabon ?? "—",
      ].join("\t"),
    );
  }
} else {
  console.log(`golden set-30 · vision-v6 · motor de ${LIB}`);
  console.log("-".repeat(78));
  let fotoActual = null;
  for (const f of filas) {
    if (f.foto !== fotoActual) {
      fotoActual = f.foto;
      console.log(f.foto);
    }
    if (f.tipo === "aviso") {
      console.log(`  ⚠ ${f.aviso}`);
      continue;
    }
    if (f.tipo === "total") {
      console.log(`  TOTAL: ${f.sin_total ? "SIN TOTAL" : `${fmt(f.kcal_total)} kcal`}`);
      continue;
    }
    if (f.tipo === "componente") {
      console.log(`  ${f.nombre.padEnd(32)} ${txt(f.food_id).padEnd(16)} ${f.match} · confianza ${fmt(f.confianza, 3)}`);
      continue;
    }
    console.log(
      `  ${f.compuesto ? "[compuesto]" : "[simple]   "} ${(f.nombre ?? "").padEnd(30)} ${txt(f.food_id).padEnd(16)} ` +
        `confianza ${fmt(f.confianza, 3)} · ${fmt(f.kcal)} kcal${f.eslabon ? ` · eslabón más débil: ${f.eslabon}` : ""}`,
    );
  }
  console.log("-".repeat(78));
}
