/* eslint-disable */
/**
 * REGENERA `scan.fixture.ts` CORRIENDO EL MOTOR DE VERDAD.
 *
 * Este archivo existe porque la vez anterior no existía: la fixture se armó a
 * mano una tarde, quedó escrita como "salió del motor real" y después el motor
 * cambió dos veces —la card 5.1 rehízo `macro_pct` y la 5.3 sumó cuatro sellos
 * de match— sin que nadie pudiera rehacerla sin repetir esa tarde. Con este
 * script, regenerarla es un comando.
 *
 * QUÉ HACE: define las TRES entradas de visión de abajo (las tres únicas cosas
 * escritas a mano en toda la cadena), se las pasa al motor compilado contra el
 * catálogo real de `kb/build/foods.canonical.json`, y pisa los tres bloques
 * marcados de `scan.fixture.ts` con lo que el motor devolvió, byte a byte. Ni un
 * solo número del reporte se escribe acá.
 *
 * CÓMO SE CORRE (desde la raíz del repo):
 *
 *     npm --prefix functions run build
 *     cd functions && NODE_PATH=node_modules node ../apps/web/src/lib/fixtures/regenerar.cjs
 *
 * El `cd functions` no es capricho: el motor compilado (`functions/lib`) importa
 * sus dependencias por nombre y `testing.js` ubica la raíz del repo relativa a
 * sí mismo. Sin `NODE_PATH` no encuentra `zod`.
 *
 * Imprime además los `curation_candidates` de cada escaneo, que el motor SÍ
 * devuelve pero el backend NO le manda al front (ver `handler.ts`: el payload
 * lleva `items`, `totals`, `meta` y `persisted`, y nada más). No están en la
 * fixture porque no están en el contrato; se imprimen para poder mirarlos.
 */
const { writeFileSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

const { indiceReal } = require(resolve(process.cwd(), "lib/engine/testing.js"));
const { analizarEscaneo } = require(resolve(process.cwd(), "lib/engine/analyze.js"));

const DESTINO = resolve(__dirname, "scan.fixture.ts");

// ---------------------------------------------------------------------------
// LAS TRES ENTRADAS. Lo único escrito a mano.
// ---------------------------------------------------------------------------

/**
 * LA MESA COMPARTIDA — el escaneo principal (`VITE_ANALYZE_FIXTURE=1`).
 *
 * Un mediodía de tapeo para tres o cuatro. No es un plato: es un BANCO DE
 * PRUEBA con forma de mesa, y está dicho — nueve alimentos en una foto es mucho
 * para un almuerzo y poco para cubrir los nueve caminos del matching de otra
 * manera. Cada ítem está acá por el sello que produce, y los nueve sellos de
 * `TipoDeMatch` salen de esta sola entrada.
 */
const MESA = {
  is_food: true,
  items: [
    // exacto — la ficha manual con CINCO caveats, y la única del catálogo que no
    // declara saturadas, azúcares ni sodio: es la que hace que el total salga
    // parcial y que `opcionales_ausentes` tenga las tres explicaciones.
    {
      food_en: "Spanish potato omelette (tortilla de patatas)",
      food_es: "tortilla de patatas",
      grams: 180,
      confidence: 0.92,
      familia_subfamilia: "huevo/revuelto-y-tortilla",
      components: [],
    },
    // cabeza_subfamilia — LA PIZZA REAL DEL 02/09/2026, con la familia que la
    // Fase 5 le enseñó a declarar. Con `pizza/con-carne` la subfamilia tiene
    // cabeza y contesta ella; sin la familia, este mismo ítem se compone.
    {
      food_en: "pizza with ham and mushrooms",
      food_es: "pizza de jamón y champiñones",
      grams: 150,
      confidence: 0.85,
      preparation: "horneado_masa",
      familia_subfamilia: "pizza/con-carne",
      components: [
        { food_en: "pizza dough, baked", food_es: "masa de pizza horneada", grams: 80 },
        { food_en: "mozzarella cheese, melted", food_es: "mozzarella fundida", grams: 35 },
        { food_en: "ham, sliced", food_es: "jamón en lonchas", grams: 20 },
        { food_en: "mushrooms, sliced", food_es: "champiñones laminados", grams: 15 },
      ],
    },
    // compuesto — familia en modo "componer": los cinco ingredientes resuelven,
    // así que el plato se arma entero con fichas reales.
    {
      food_en: "mixed salad",
      food_es: "ensalada mixta",
      grams: 300,
      confidence: 0.9,
      familia_subfamilia: "ensalada/verde",
      components: [
        { food_en: "lettuce, raw", food_es: "lechuga", grams: 120 },
        { food_en: "tomato, raw", food_es: "tomate", grams: 100 },
        { food_en: "egg, hard-boiled", food_es: "huevo cocido", grams: 50 },
        { food_en: "tuna, canned", food_es: "atún", grams: 40 },
        { food_en: "olive oil", food_es: "aceite de oliva", grams: 10 },
      ],
    },
    // compuesto_parcial — el mismo camino, pero con un ingrediente MINORITARIO
    // que el catálogo no tiene: 5 g de epazote sobre 105 g de montadito, muy por
    // debajo de `MASA_FALTANTE_MAXIMA` (25 %). El motor responde con la densidad
    // de lo que sí resolvió y lo declara en `faltantes` y en los caveats.
    {
      food_en: "montadito de pringa",
      food_es: "montadito de pringá",
      grams: 105,
      confidence: 0.78,
      familia_subfamilia: "bocadillo/bocadillo",
      components: [
        { food_en: "bread, white", food_es: "pan blanco", grams: 60 },
        { food_en: "pork stew meat, cooked", food_es: "carne de cerdo guisada", grams: 40 },
        { food_en: "epazote leaves", food_es: "hojas de epazote", grams: 5 },
      ],
    },
    // sustituto — uno de los dos que la curación declaró por escrito. USDA no
    // mide el mascarpone; el queso crema es el gemelo declarado, con su motivo.
    {
      food_en: "mascarpone",
      food_es: "mascarpone",
      grams: 40,
      confidence: 0.8,
      components: [],
    },
    // cabeza_familia — el último recurso con ficha: "plato de marisco" no tiene
    // cabeza propia, así que contesta la de la familia entera.
    {
      food_en: "variegated scallops a la plancha",
      food_es: "zamburiñas a la plancha",
      grams: 90,
      confidence: 0.7,
      familia_subfamilia: "marisco/plato",
      components: [],
    },
    // alias — un nombre español curado que NO es el nombre de la ficha, con su
    // confianza declarada (0,8) escrita en el motivo.
    {
      food_en: "serrano ham",
      food_es: "jamón serrano",
      grams: 50,
      confidence: 0.9,
      components: [],
    },
    // difuso — parecido, no igualdad: además la ficha es GENÉRICA (promedio de
    // una familia), que es el otro caveat que el reporte tiene que mostrar.
    //
    // LOS 25 g SON UNA DECISIÓN, no una porción cualquiera: son los que dejan el
    // plato con el caso que demuestra la regla del sodio (`ItemDelPlato.tsx`).
    // Con 25 g el platito de aceitunas aporta MENOS sodio al total que la
    // ensalada —183,8 mg contra 203,3— y sin embargo es el único de los dos que
    // se pinta como salado, porque el aviso se mide sobre `per_100g` (735 contra
    // 68) y no sobre lo que cae en el plato. Si esto se cambia, el caso se
    // pierde y hay que buscar otro.
    {
      food_en: "green olives",
      food_es: "aceitunas verdes",
      grams: 25,
      confidence: 0.85,
      components: [],
    },
    // no_catalogado — sin ficha y sin ingredientes que componer: el ítem viaja
    // SIN números y con la explicación. Baja `completo` en los totales.
    {
      food_en: "picos camperos",
      food_es: "picos camperos",
      grams: 25,
      confidence: 0.51,
      components: [],
    },
  ],
};

/**
 * EL PLATO DE FRUTA (`VITE_ANALYZE_FIXTURE=completo`).
 *
 * Dos alimentos cuyas fichas declaran LOS OCHO valores, así que el total sale
 * completo y el anillo exterior del donut puede dibujar sus tres subdivisiones
 * de verdad. Y de paso trae LA LETRA CHICA que la card 5.1 hizo posible: la
 * fruta declara menos calorías de las que dan 4/4/9 sobre sus macros —USDA usa
 * factores propios y la fibra cuenta aparte—, la diferencia pasa el umbral del
 * 5 % y el motor escribe el motivo. La banana sola da −10,9 %.
 */
const FRUTA = {
  is_food: true,
  items: [
    { food_en: "banana, raw", food_es: "plátano", grams: 230, confidence: 0.95, familia_subfamilia: "fruta/fresca", components: [] },
    { food_en: "cherries, raw", food_es: "cerezas", grams: 90, confidence: 0.85, familia_subfamilia: "fruta/fresca", components: [] },
  ],
};

/**
 * SIN TOTAL, HONESTAMENTE (`VITE_ANALYZE_FIXTURE=sin_total`).
 *
 * Un solo alimento, y sin ficha. Cuando NINGÚN ítem se pudo cuantificar el motor
 * devuelve `totals: null` — "un plato sin un solo número no tiene totales, tiene
 * una cola de curación"—: no hay donut que dibujar, hay el alimento con su
 * explicación.
 */
const SIN_TOTAL = {
  is_food: true,
  items: [{ food_en: "picos camperos", food_es: "picos camperos", grams: 25, confidence: 0.51, components: [] }],
};

// ---------------------------------------------------------------------------
// El envoltorio del handler. Lo único que NO sale del motor.
// ---------------------------------------------------------------------------

/**
 * `handler.ts` devuelve el `EngineResult` con cuatro cosas suyas alrededor:
 * `scan_id`, `is_food`, `meta` y `persisted`. `curation_candidates` NO viaja.
 *
 * Los números de `meta` son de relleno y está dicho: son latencias y tokens de
 * una corrida verosímil, no medidos, porque no hay modelo en esta cadena. Los
 * únicos que importan —los del reporte— salen todos del motor. `kb_version` sí
 * es el de verdad: lo devuelve el motor con el catálogo que usó.
 */
function comoLoDevuelveElHandler(scan_id, resultado, meta) {
  return {
    scan_id,
    is_food: resultado.es_comida,
    items: resultado.items,
    totals: resultado.totals,
    meta: { model: "claude-sonnet-5", kb_version: resultado.kb_version, ...meta },
    persisted: true,
  };
}

// ---------------------------------------------------------------------------

const indice = indiceReal();

const mesa = analizarEscaneo(MESA, indice);
const fruta = analizarEscaneo(FRUTA, indice);
const sinTotal = analizarEscaneo(SIN_TOTAL, indice);

const bloques = {
  reporte: comoLoDevuelveElHandler("scan_fixture_mesa_0001", mesa, {
    latency_ms: 5240,
    model_latency_ms: 4610,
    tokens_in: 1633,
    tokens_out: 894,
  }),
  completo: comoLoDevuelveElHandler("scan_fixture_fruta_0002", fruta, {
    latency_ms: 3120,
    model_latency_ms: 2680,
    tokens_in: 1487,
    tokens_out: 214,
  }),
  sin_total: comoLoDevuelveElHandler("scan_fixture_sin_total_0003", sinTotal, {
    latency_ms: 2980,
    model_latency_ms: 2540,
    tokens_in: 1487,
    tokens_out: 96,
  }),
};

// Los tres bloques se pisan entre marcas. Todo lo demás del archivo —la
// cabecera, los tipos, las funciones— queda intacto: este script escribe datos,
// no prosa.
let fuente = readFileSync(DESTINO, "utf8");
for (const [clave, valor] of Object.entries(bloques)) {
  const abre = `// >>> GENERADO: ${clave}`;
  const cierra = `// <<< FIN: ${clave}`;
  const desde = fuente.indexOf(abre);
  const hasta = fuente.indexOf(cierra);
  if (desde === -1 || hasta === -1 || hasta < desde) {
    throw new Error(`scan.fixture.ts no tiene las marcas del bloque «${clave}»`);
  }
  const cuerpo = JSON.stringify(valor, null, 2);
  fuente = `${fuente.slice(0, desde)}${abre}\n${cuerpo}\n${fuente.slice(hasta)}`;
}
writeFileSync(DESTINO, fuente);

// ---------------------------------------------------------------------------

console.log(`catálogo: ${mesa.kb_version}`);
for (const [nombre, r] of [["mesa", mesa], ["fruta", fruta], ["sin_total", sinTotal]]) {
  console.log(`\n── ${nombre} ──`);
  for (const it of r.items) {
    console.log(`  ${it.match.padEnd(18)} ${String(it.name_es ?? "—").padEnd(34)} ${it.grams} g  ${it.nutrients ? `${it.nutrients.kcal} kcal` : "sin números"}`);
  }
  const t = r.totals;
  if (t === null) {
    console.log("  totals: null");
  } else {
    console.log(`  total: ${t.nutrients.kcal} kcal · completo=${t.completo} · incluidos=${t.items_incluidos} sin_datos=${t.items_sin_datos}`);
    console.log(`  macro_pct: ${t.macro_pct ? `${t.macro_pct.protein}/${t.macro_pct.carbs}/${t.macro_pct.fat} (suma ${(t.macro_pct.protein + t.macro_pct.carbs + t.macro_pct.fat).toFixed(1)}) · fuera de macros ${t.macro_pct.kcal_fuera_de_macros} kcal = ${t.macro_pct.diferencia_pct} %` : "null"}`);
    if (t.macro_pct && t.macro_pct.motivo_de_la_diferencia) console.log(`  letra chica: ${t.macro_pct.motivo_de_la_diferencia}`);
    console.log(`  opcionales ausentes: ${Object.keys(t.opcionales_ausentes).join(", ") || "ninguno"}`);
  }
  console.log(`  curation_candidates (NO viajan al front): ${r.curation_candidates.map((c) => `${c.termino_en} [${c.motivo}]`).join(" · ") || "ninguno"}`);
}
console.log(`\nescrito: ${DESTINO}`);
