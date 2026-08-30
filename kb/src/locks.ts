/**
 * Los candados del build.
 *
 * Si falla uno, el build NO escribe salida y termina con error. La regla es
 * deliberada: un catálogo mutilado que se publica es peor que un build que no
 * corre, porque el error se descubre en el reporte de un usuario y no acá.
 *
 * Cada candado está escrito como una función pura sobre el catálogo ya armado:
 * la DECISIÓN queda separada de la LECTURA de los CSVs y se puede testear sin
 * tocar un solo archivo de USDA.
 */
import type { BuildStats } from "./canonical";
import { ALIAS_CONFIDENCE_SCALE, type CanonicalFood, type Catalog, type FoodSource } from "./types";

export interface LockResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  failures: string[];
}

/**
 * Mínimos por fuente. El porqué de los dos primeros está en `lockPerSource`.
 *
 * `manual` pide 1 por una razón distinta: la curación manual no puede fallar en
 * silencio. Es un solo archivo JSON leído de forma tolerante —si desaparece, si
 * cambia de nombre, si alguien lo deja vacío— y sin este piso el catálogo se
 * publicaría sin el salmorejo y sin ninguna otra entrada manual, con los cinco
 * candados en verde. Un piso de 1 convierte esa desaparición en una explosión.
 */
export const MINIMUM_BY_SOURCE: Record<FoodSource, number> = {
  usda_fndds: 600,
  usda_sr_legacy: 250,
  manual: 1,
  receta: 1,
};

/** Atwater: 10 % relativo Y ±20 kcal absolutos. Hay que fallar los dos. */
export const ATWATER_RELATIVE_TOLERANCE = 0.1;
export const ATWATER_ABSOLUTE_TOLERANCE_KCAL = 20;

/**
 * Los alimentos de curación manual NO tienen el brazo absoluto: solo el 10 %.
 *
 * El brazo de ±20 kcal existe por una razón concreta y medida: en una lechuga de
 * 15 kcal el porcentaje se dispara por nada, y esas lechugas vienen de USDA. En
 * un alimento manual el brazo absoluto es puro regalo — a 83 kcal, ±20 kcal es
 * un 24 % de margen efectivo. Son pocos, los escribió una persona a mano y son
 * los únicos números del catálogo que nadie midió en un laboratorio: es
 * exactamente donde la tolerancia tiene que apretar más, no menos.
 */
export const ATWATER_MANUAL_RELATIVE_TOLERANCE = 0.1;

/**
 * Rango de cordura de la densidad calórica de una receta derivada.
 *
 * El piso son 15 kcal/100 g —por debajo está el agua y los caldos, que no son
 * platos— y el techo 900, que es el aceite puro: ninguna receta puede salir más
 * densa que su ingrediente más denso posible. No es un rango fino a propósito:
 * es una red contra el error de un orden de magnitud (un gramo tipeado como cien,
 * un peso final dividido cuando había que multiplicar), no contra un plato raro.
 */
export const RECIPE_KCAL_MIN = 15;
export const RECIPE_KCAL_MAX = 900;

/**
 * Cuánto puede apartarse el peso final de una receta del peso de lo que entró.
 *
 * El rango sale de lo medido en `cooking.transforms.json`: el factor más chico de
 * la tabla es 0,757 (plancha) y el más grande 1,049 (hervido), con p10/p90 entre
 * 0,690 y 1,368. Se toma 0,50–1,50, que deja pasar cualquier transformación
 * declarada más un margen, y frena un rendimiento declarado a mano que sea un
 * error de tipeo. Una evaporación que se coma más de la mitad del plato no es
 * una cocción: es una equivocación.
 */
export const RECIPE_YIELD_MIN = 0.5;
export const RECIPE_YIELD_MAX = 1.5;

/** Cuánto puede desviarse Atwater en una receta, donde cierra POR CONSTRUCCIÓN. */
export const RECIPE_ATWATER_TOLERANCE = 0.1;

/** Cuánto puede desviarse un caso dorado de su valor de referencia. */
export const GOLDEN_TOLERANCE = 0.15;

export interface GoldenCheck {
  fdc_id: number;
  /** Qué alimento es, en criollo. */
  label: string;
  /** Valor de referencia conocido y por qué es ese. */
  reference: string;
  expected: { kcal: number; protein_g?: number; carbs_g?: number; fat_g?: number };
  /** Aclaración cuando el alimento elegido no es literalmente el de la referencia. */
  note?: string;
}

/**
 * Los cinco casos dorados, apuntados a `fdc_id` que están de verdad en la
 * selección. Un valor conocido de memoria (la manzana ronda las 52 kcal) no
 * prueba que USDA esté bien —eso no es discutible acá— sino que el pipeline
 * leyó la columna correcta: si el mapeo de nutrientes se corriera un lugar,
 * la manzana saldría con 0,3 kcal y este candado lo grita.
 */
export const GOLDEN_CHECKS: GoldenCheck[] = [
  {
    fdc_id: 171689,
    label: "Manzana cruda sin cáscara (SR Legacy)",
    reference: "manzana cruda PELADA ≈ 48 kcal/100 g",
    expected: { kcal: 48 },
    note:
      "Apunta a la manzana PELADA y su referencia es la de la manzana pelada. " +
      "La nota anterior decía que la selección no traía la manzana con cáscara: " +
      "era falsa —fdc-2709215 está en el catálogo— y además comparaba la pelada " +
      "contra las 52 kcal de la entera, gastando 8 de los 15 puntos de tolerancia " +
      "en un error de referencia. El caso con cáscara es el de abajo.",
  },
  {
    fdc_id: 2709215,
    label: "Manzana cruda con cáscara (FNDDS)",
    reference:
      "manzana cruda CON cáscara ≈ 61 kcal/100 g — Foundation 2026 la mide en " +
      "cinco variedades (58,9 · 60,0 · 61,0 · 61,8 · 64,7; media 61,3)",
    expected: { kcal: 61 },
    note:
      "El par de la anterior: con cáscara contra sin cáscara, cada una contra SU " +
      "referencia. La referencia sale de Foundation, un dataset que el build solo " +
      "usa para pisar valores puntuales y que NO pisa a este alimento (su kcal " +
      "tiene provenance usda_fndds): el caso dorado compara dos fuentes " +
      "independientes, no un valor contra sí mismo. Las 52 kcal de la manzana " +
      "clásica son de SR Legacy 2018; Foundation la volvió a medir y le dio 61.",
  },
  {
    fdc_id: 173944,
    label: "Banana cruda (SR Legacy)",
    reference: "banana cruda ≈ 89 kcal/100 g y ≈ 23 g de carbohidratos",
    expected: { kcal: 89, carbs_g: 22.8 },
  },
  {
    fdc_id: 2707153,
    label: "Huevo entero cocido (FNDDS)",
    reference: "huevo entero ≈ 155 kcal/100 g y ≈ 12,6 g de proteína",
    expected: { kcal: 155, protein_g: 12.6 },
    note:
      "La selección no tiene huevo crudo (143 kcal): el candidato más cercano es " +
      "el huevo cocido sin especificar método, que incluye la grasa de cocción.",
  },
  {
    fdc_id: 2708403,
    label: "Arroz blanco cocido (FNDDS)",
    reference: "arroz blanco cocido ≈ 130 kcal/100 g",
    expected: { kcal: 130 },
  },
  {
    fdc_id: 2710186,
    label: "Aceite de oliva (FNDDS)",
    reference: "aceite de oliva ≈ 884 kcal/100 g y 100 g de grasa",
    expected: { kcal: 884, fat_g: 100 },
  },
];

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Candado 1 — el esquema. Ningún alimento entra sin sus cuatro macros. */
export function lockSchema(catalog: Catalog, stats: BuildStats): LockResult {
  const failures: string[] = [];

  for (const item of stats.unresolved) {
    failures.push(
      `fdc-${item.fdc_id} (${item.source}, "${item.description}") sin ${item.missing.join(", ")}`,
    );
  }
  for (const stale of stats.staleAliases) {
    failures.push(
      `${stale.id} lleva el alias "${stale.alias}" con confianza 1,0, y ese es el nombre ` +
        `ANTERIOR de ${stale.renombrada}, que la DT-7 renombró porque mentía sobre su ` +
        "composición: el nombre viejo entraría por la ventana",
    );
  }
  for (const fallo of stats.recipeFailures) {
    failures.push(`la receta ${fallo.id} no se pudo derivar: ${fallo.motivo}`);
  }
  for (const fdcId of stats.orphanRegionalAliases) {
    failures.push(
      `aliases.regional.json apunta a fdc-${fdcId}, que no está en la selección: ` +
        "el alias no falla, simplemente no matchea nunca",
    );
  }

  const seen = new Set<string>();
  for (const food of catalog.foods) {
    const problems = validateFood(food);
    if (seen.has(food.id)) problems.push("id duplicado");
    seen.add(food.id);
    for (const problem of problems) failures.push(`${food.id}: ${problem}`);
  }

  return {
    id: "1-esquema",
    name: "Validación de esquema",
    passed: failures.length === 0,
    detail: `${catalog.foods.length} alimentos validados, ${failures.length} problemas`,
    failures,
  };
}

/** Los chequeos de forma de un alimento. Devuelve la lista de problemas. */
export function validateFood(food: CanonicalFood): string[] {
  const problems: string[] = [];
  const esManual = food.source === "manual";
  const esReceta = food.source === "receta";

  // El id declara de dónde viene el alimento con solo mirarlo: `fdc-<n>` es de
  // USDA, `manual-<algo>` lo escribió la curación. Los dos espacios de nombres
  // no se pisan, así que un id nunca es ambiguo.
  if (esManual) {
    if (!/^manual-[a-z0-9-]+$/.test(food.id)) problems.push("el id manual no tiene la forma manual-<algo>");
    if (food.source_ref.trim() === "" || food.source_ref.startsWith("USDA FDC #")) {
      problems.push("un alimento manual no puede declarar una referencia USDA");
    }
  } else if (esReceta) {
    if (!/^receta-[a-z0-9-]+$/.test(food.id)) problems.push("el id de receta no tiene la forma receta-<algo>");
    if (food.source_ref.startsWith("USDA FDC #")) {
      problems.push("un alimento derivado de receta no puede declarar una referencia USDA");
    }
    problems.push(...validateRecipeFood(food));
  } else {
    if (!/^fdc-\d+$/.test(food.id)) problems.push("el id no tiene la forma fdc-<fdc_id>");
    if (food.source !== "usda_fndds" && food.source !== "usda_sr_legacy") {
      problems.push(`fuente desconocida: ${String(food.source)}`);
    }
    if (!food.source_ref.startsWith("USDA FDC #")) problems.push("source_ref sin referencia USDA");
  }

  if (typeof food.names.en !== "string" || food.names.en.trim() === "") {
    problems.push("names.en vacío");
  }
  if (food.names.es !== null && (typeof food.names.es !== "string" || food.names.es.trim() === "")) {
    problems.push("names.es debe ser texto o null");
  }
  if (!Array.isArray(food.aliases.es)) problems.push("aliases.es no es una lista");
  else {
    for (const alias of food.aliases.es) {
      if (typeof alias === "string") {
        if (alias.trim() === "") problems.push("aliases.es con un alias vacío");
        continue;
      }
      if (alias === null || typeof alias !== "object" || typeof alias.alias !== "string") {
        problems.push("aliases.es: cada alias es texto o { alias, confidence }");
        continue;
      }
      if (!(ALIAS_CONFIDENCE_SCALE as readonly number[]).includes(alias.confidence)) {
        problems.push(
          `aliases.es: la confianza de "${alias.alias}" (${String(alias.confidence)}) ` +
            `está fuera de la escala declarada (${ALIAS_CONFIDENCE_SCALE.join(", ")})`,
        );
      }
    }
  }
  if (food.receta !== undefined && !esReceta) {
    // Simetría con `caveats`: el bloque `receta` es la trazabilidad de un valor
    // derivado. En un alimento que USDA midió no describe nada — describiría una
    // cuenta que el build no hizo.
    problems.push("el bloque receta solo puede existir en un alimento de source `receta`");
  }
  if (food.caveats !== undefined) {
    if (!esManual && !esReceta) {
      // Un caveat es lo que la fuente NO dice. Los alimentos de USDA no tienen
      // dónde declararlo —el build los arma de los CSVs— así que un caveat en
      // uno de ellos es un valor que entró por una puerta que no existe.
      problems.push("caveats solo puede existir en un alimento de curación manual o de receta");
    } else if (!Array.isArray(food.caveats) || food.caveats.length === 0) {
      problems.push("caveats, si existe, es una lista NO vacía (si no hay caveats, no va la clave)");
    } else if (food.caveats.some((c) => typeof c !== "string" || c.trim() === "")) {
      problems.push("caveats debe ser una lista de textos");
    }
  }
  if (typeof food.category !== "string" || food.category.trim() === "") {
    problems.push("category vacía");
  }

  for (const key of ["kcal", "protein_g", "carbs_g", "fat_g"] as const) {
    const value = food.per_100g[key];
    if (!isNumber(value)) problems.push(`per_100g.${key} no es un número finito`);
    else if (value < 0) problems.push(`per_100g.${key} es negativo`);
  }
  for (const key of ["fiber_g", "sat_fat_g", "sugars_g", "sodium_mg"] as const) {
    const value = food.per_100g[key];
    if (value === null) continue;
    if (!isNumber(value)) problems.push(`per_100g.${key} no es un número finito ni null`);
    else if (value < 0) problems.push(`per_100g.${key} es negativo`);
  }

  if (!isNumber(food.default_portion_g) || food.default_portion_g <= 0) {
    problems.push("default_portion_g no es un número > 0");
  }
  for (const hint of food.portion_hints) {
    if (!isNumber(hint.grams) || hint.grams <= 0) problems.push("portion_hints con gramos inválidos");
    if (typeof hint.label_en !== "string" || hint.label_en.trim() === "") {
      problems.push("portion_hints con label_en vacío");
    }
    if (hint.label_es !== null && (typeof hint.label_es !== "string" || hint.label_es.trim() === "")) {
      problems.push("portion_hints.label_es debe ser texto o null");
    }
  }
  for (const [field, origin] of Object.entries(food.provenance)) {
    const conocido =
      ["usda_sr_legacy", "usda_foundation", "usda_fndds", "curation"].includes(origin) ||
      // `manual/<origen>`: el origen viaja pegado al provenance para que un valor
      // de una etiqueta comercial no se confunda con uno de laboratorio.
      origin === "receta" ||
      /^manual\/[a-z0-9-]+$/.test(origin);
    if (!conocido) problems.push(`provenance.${field} con origen desconocido: ${origin}`);
  }
  if (food.deprecated !== false && food.deprecated !== true) problems.push("deprecated no es booleano");
  return problems;
}

/**
 * Los chequeos propios de una ficha derivada de receta (card 1.7).
 *
 * Tres cosas que la aritmética no puede garantizar sola:
 *  - la trazabilidad: sin `receta` en el documento, el valor no se puede rehacer;
 *  - el rendimiento: que el peso final no se haya ido a cualquier lado;
 *  - la cordura: que la densidad calórica sea la de un alimento.
 *
 * Atwater no está acá: cierra POR CONSTRUCCIÓN —los macros y las calorías salen
 * de las mismas fichas y de la misma división— y lo cubre el candado 3 como a
 * cualquier otro alimento, más un test que lo fija como invariante.
 */
export function validateRecipeFood(food: CanonicalFood): string[] {
  const problems: string[] = [];
  const receta = food.receta;
  if (receta === undefined) {
    problems.push("un alimento de receta tiene que traer su receta: sin ella el valor no se puede rehacer");
    return problems;
  }
  if (receta.ingredientes.length === 0) problems.push("la receta no declara ingredientes");
  for (const ing of receta.ingredientes) {
    if (typeof ing.ref !== "string" || ing.ref.trim() === "") problems.push("un ingrediente sin ref no se puede rehacer");
    if (!isNumber(ing.grams) || ing.grams <= 0) problems.push(`el ingrediente ${ing.ref} no declara gramos > 0`);
  }
  const suma = receta.ingredientes.reduce((s, i) => s + i.grams, 0);
  if (Math.abs(suma - receta.peso_entrada_g) > 0.01) {
    problems.push(`el peso de entrada (${receta.peso_entrada_g} g) no es la suma de los ingredientes (${suma} g)`);
  }
  const esperado = receta.peso_entrada_g + receta.aceite_absorbido_g;
  const rendimiento = esperado > 0 ? receta.peso_final_g / esperado : 0;
  if (rendimiento < RECIPE_YIELD_MIN || rendimiento > RECIPE_YIELD_MAX) {
    problems.push(
      `el rendimiento es ${rendimiento.toFixed(3)} (${receta.peso_final_g} g de ${esperado} g), ` +
        `fuera del rango de cordura ${RECIPE_YIELD_MIN}–${RECIPE_YIELD_MAX}`,
    );
  }
  const kcal = food.per_100g.kcal;
  if (isNumber(kcal) && (kcal < RECIPE_KCAL_MIN || kcal > RECIPE_KCAL_MAX)) {
    problems.push(
      `la densidad calórica es ${kcal} kcal/100 g, fuera del rango de cordura ` +
        `${RECIPE_KCAL_MIN}–${RECIPE_KCAL_MAX}`,
    );
  }
  return problems;
}

/**
 * Candado 2 — aceptación POR FUENTE.
 *
 * Es el candado que existe por la trampa del Bloque 0: FNDDS referencia los
 * nutrientes por `nutrient_nbr` y los otros por `nutrient.id`. Con un mapeo
 * único el join de FNDDS devuelve vacío SIN LANZAR NADA y el build emitiría un
 * catálogo de 300 alimentos tan campante. Exigir un piso por fuente convierte
 * ese fallo silencioso en una explosión.
 */
export function lockPerSource(catalog: Catalog): LockResult {
  const counts: Record<string, number> = { usda_fndds: 0, usda_sr_legacy: 0, manual: 0, receta: 0 };
  for (const food of catalog.foods) counts[food.source] = (counts[food.source] ?? 0) + 1;

  const failures: string[] = [];
  for (const [source, minimum] of Object.entries(MINIMUM_BY_SOURCE)) {
    const got = counts[source] ?? 0;
    if (got < minimum) failures.push(`${source}: ${got} alimentos resueltos, se exigen ${minimum}`);
  }
  return {
    id: "2-por-fuente",
    name: "Aceptación por fuente",
    passed: failures.length === 0,
    detail: Object.entries(counts)
      .map(([source, got]) => `${source}=${got}/${MINIMUM_BY_SOURCE[source as FoodSource]}`)
      .join(" · "),
    failures,
  };
}

/** Calorías que predicen los macros del propio alimento (Atwater + alcohol). */
export function atwaterPrediction(food: CanonicalFood, alcoholG: number): number {
  return (
    4 * food.per_100g.protein_g +
    4 * food.per_100g.carbs_g +
    9 * food.per_100g.fat_g +
    7 * alcoholG
  );
}

/**
 * Candado 3 — Atwater, defensa en profundidad.
 *
 * La selección ya filtró por este criterio; el build lo vuelve a correr porque
 * los overrides de Foundation pisan valores DESPUÉS de esa selección y podrían
 * mezclar una energía de una campaña con macros de otra. El alcohol suma
 * 7 kcal/g al predictor: sin eso, el vino y la cerveza fallan sin tener nada
 * malo.
 */
export function lockAtwater(catalog: Catalog, alcohol: Map<string, number>): LockResult {
  const failures: string[] = [];
  let worst = { id: "", deviation: 0 };

  for (const food of catalog.foods) {
    const predicted = atwaterPrediction(food, alcohol.get(food.id) ?? 0);
    const kcal = food.per_100g.kcal;
    const deviation = Math.abs(kcal - predicted);
    const relative = kcal > 0 ? deviation / kcal : Number.POSITIVE_INFINITY;
    if (deviation > worst.deviation) worst = { id: food.id, deviation };
    const falla =
      food.source === "manual"
        ? relative > ATWATER_MANUAL_RELATIVE_TOLERANCE
        : deviation > ATWATER_ABSOLUTE_TOLERANCE_KCAL && relative > ATWATER_RELATIVE_TOLERANCE;
    if (falla) {
      failures.push(
        `${food.id} "${food.names.en}": ${kcal} kcal declaradas vs ` +
          `${predicted.toFixed(1)} predichas (desvío ${deviation.toFixed(1)} kcal, ` +
          `${(relative * 100).toFixed(1)} %` +
          (food.source === "manual" ? ", curación manual: solo el 10 % relativo" : "") +
          ")",
      );
    }
  }
  return {
    id: "3-atwater",
    name: "Coherencia de Atwater",
    passed: failures.length === 0,
    detail:
      `tolerancia ${ATWATER_RELATIVE_TOLERANCE * 100} % y ±${ATWATER_ABSOLUTE_TOLERANCE_KCAL} kcal ` +
      `(curación manual: solo ${ATWATER_MANUAL_RELATIVE_TOLERANCE * 100} % relativo) · ` +
      `peor desvío ${worst.deviation.toFixed(1)} kcal (${worst.id || "n/d"})`,
    failures,
  };
}

/** Candado 4 — los casos dorados. */
export function lockGolden(catalog: Catalog): LockResult {
  const byId = new Map(catalog.foods.map((food) => [food.id, food]));
  const failures: string[] = [];
  const lines: string[] = [];

  for (const check of GOLDEN_CHECKS) {
    const food = byId.get(`fdc-${check.fdc_id}`);
    if (food === undefined) {
      failures.push(`${check.label}: fdc-${check.fdc_id} no está en el catálogo`);
      continue;
    }
    const parts: string[] = [];
    for (const [field, expected] of Object.entries(check.expected)) {
      const got = food.per_100g[field as keyof typeof food.per_100g];
      if (typeof got !== "number") {
        failures.push(`${check.label}: ${field} sin valor`);
        continue;
      }
      const relative = Math.abs(got - expected) / expected;
      parts.push(`${field} ${got} vs ${expected} (${(relative * 100).toFixed(1)} %)`);
      if (relative > GOLDEN_TOLERANCE) {
        failures.push(
          `${check.label}: ${field} = ${got}, se esperaba ${expected} ±${GOLDEN_TOLERANCE * 100} % ` +
            `(desvío ${(relative * 100).toFixed(1)} %)`,
        );
      }
    }
    lines.push(`${check.label} → ${parts.join(", ")}`);
  }
  return {
    id: "4-dorados",
    name: "Casos dorados",
    passed: failures.length === 0,
    detail: lines.join(" | "),
    failures,
  };
}

/** Candado 5 — idempotencia: dos corridas del pipeline, el mismo archivo. */
export function lockIdempotence(first: string, second: string): LockResult {
  const passed = first === second;
  return {
    id: "5-idempotencia",
    name: "Idempotencia",
    passed,
    detail: passed
      ? `dos corridas completas del pipeline, ${first.length} bytes idénticos`
      : `las dos corridas difieren (${first.length} vs ${second.length} bytes)`,
    failures: passed ? [] : ["el build no es determinístico: dos corridas dieron archivos distintos"],
  };
}
