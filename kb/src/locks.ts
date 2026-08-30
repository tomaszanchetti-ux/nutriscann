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
import type { CanonicalFood, Catalog, FoodSource } from "./types";

export interface LockResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  failures: string[];
}

/** Mínimos por fuente. Ver `MINIMUM_BY_SOURCE` para el porqué del número. */
export const MINIMUM_BY_SOURCE: Record<FoodSource, number> = {
  usda_fndds: 600,
  usda_sr_legacy: 250,
};

/** Atwater: 10 % relativo Y ±20 kcal absolutos. Hay que fallar los dos. */
export const ATWATER_RELATIVE_TOLERANCE = 0.1;
export const ATWATER_ABSOLUTE_TOLERANCE_KCAL = 20;

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
    label: "Manzana cruda (SR Legacy — sin cáscara)",
    reference: "manzana cruda ≈ 52 kcal/100 g",
    expected: { kcal: 52 },
    note: "La selección no trae la manzana con cáscara; la pelada da 48 kcal.",
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
  if (!/^fdc-\d+$/.test(food.id)) problems.push("el id no tiene la forma fdc-<fdc_id>");
  if (food.source !== "usda_fndds" && food.source !== "usda_sr_legacy") {
    problems.push(`fuente desconocida: ${String(food.source)}`);
  }
  if (!food.source_ref.startsWith("USDA FDC #")) problems.push("source_ref sin referencia USDA");
  if (typeof food.names.en !== "string" || food.names.en.trim() === "") {
    problems.push("names.en vacío");
  }
  if (food.names.es !== null && (typeof food.names.es !== "string" || food.names.es.trim() === "")) {
    problems.push("names.es debe ser texto o null");
  }
  if (!Array.isArray(food.aliases.es)) problems.push("aliases.es no es una lista");
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
    if (!["usda_sr_legacy", "usda_foundation", "usda_fndds", "curation"].includes(origin)) {
      problems.push(`provenance.${field} con origen desconocido: ${origin}`);
    }
  }
  if (food.deprecated !== false && food.deprecated !== true) problems.push("deprecated no es booleano");
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
  const counts: Record<string, number> = { usda_fndds: 0, usda_sr_legacy: 0 };
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
    if (deviation > ATWATER_ABSOLUTE_TOLERANCE_KCAL && relative > ATWATER_RELATIVE_TOLERANCE) {
      failures.push(
        `${food.id} "${food.names.en}": ${kcal} kcal declaradas vs ` +
          `${predicted.toFixed(1)} predichas (desvío ${deviation.toFixed(1)} kcal, ` +
          `${(relative * 100).toFixed(1)} %)`,
      );
    }
  }
  return {
    id: "3-atwater",
    name: "Coherencia de Atwater",
    passed: failures.length === 0,
    detail:
      `tolerancia ${ATWATER_RELATIVE_TOLERANCE * 100} % y ±${ATWATER_ABSOLUTE_TOLERANCE_KCAL} kcal · ` +
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
