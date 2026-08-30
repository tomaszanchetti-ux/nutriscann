/**
 * Capa 3 del pipeline: la curación (`kb/curation/*.json`).
 *
 * La curación la escribe otra card, en paralelo con esta. Por eso el build la
 * lee de forma TOLERANTE: si los archivos no existen o están a medias, el
 * catálogo sale igual con `names.es = null` en lo que falte y el build imprime
 * la lista de pendientes. Un catálogo sin traducir es un catálogo incompleto;
 * un build que no corre hasta que aparezca la traducción es un bloqueo.
 *
 * Lo que NO es tolerante es un archivo mal formado: si existe y no respeta el
 * contrato, el build avisa fuerte. Tolerar la ausencia no es tolerar la basura.
 *
 * Contrato acordado:
 *   names.es.json           { "<fdc_id>": { "name": "...", "aliases": ["..."] } }
 *   portions.overrides.json { "<fdc_id>": { "default_portion_g": N, "label_es": "..." } }
 *   aliases.regional.json   { "aliases": { "<fdc_id>": [{ "alias": "...", "confidence": N }] } }
 *   manual.foods.json       { "foods": [ { id, per_100g, ... } ] }
 *   cooking.transforms.json { "transforms": { "<metodo>": { factor_peso, ... } } }
 *   recipes.foods.json      { "recipes": [ { id, metodo, ingredientes, ... } ] }
 *
 * Las dos claves del override son independientes: se puede corregir solo los
 * gramos, solo la etiqueta en español, o las dos.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { OPTIONAL_KEYS, REQUIRED_KEYS } from "./nutrients";
import { CURATION_DIR } from "./sources";
import type { CookingTransform } from "./transforms";
import {
  ALIAS_CONFIDENCE_SCALE,
  type AliasWithConfidence,
  type Per100g,
  type PortionHint,
} from "./types";

export interface CuratedName {
  name: string;
  aliases: string[];
}

export interface CuratedPortion {
  /** Gramos de la porción por defecto. `null` = la curación no la cambia. */
  default_portion_g: number | null;
  /** Cómo se llama esa porción en español ("1 unidad mediana"). */
  label_es: string | null;
}

/**
 * Un alimento que USDA no tiene y que la curación declara entero.
 *
 * Es la precedencia MÁS ALTA del pipeline (`SR < Foundation < FNDDS < curación
 * manual`). Dos usos, uno solo camino: si el `id` coincide con un alimento del
 * catálogo, sus valores lo PISAN campo a campo; si no coincide con nadie, entra
 * como un alimento nuevo con su propio id (`manual-salmorejo`).
 */
export interface ManualFood {
  id: string;
  /** De dónde salió el dato ("etiqueta-comercial"). Viaja al provenance. */
  origen: string;
  source_ref: string;
  name_en: string;
  name_es: string;
  aliases: (string | AliasWithConfidence)[];
  category: string;
  per_100g: Per100g;
  portion_hints: PortionHint[];
  default_portion_g: number;
  /** Lo que la fuente NO dice, declarado en la propia entrada. */
  caveats: string[];
}

/**
 * Una receta compuesta: de qué está hecho un plato y cómo se cocina.
 *
 * No trae ni un solo valor nutricional: los deriva el build desde las fichas que
 * los `ref` apuntan. Es la diferencia con `manual.foods.json`, donde los números
 * se copian de una fuente externa — acá se calculan, y por eso se pueden rehacer.
 */
export interface Recipe {
  id: string;
  name_en: string;
  name_es: string;
  aliases: (string | AliasWithConfidence)[];
  category: string;
  metodo: string;
  ingredientes: { ref: string; grams: number }[];
  /** Peso final declarado por la receta, pisando el de la transformación. */
  rendimiento_declarado_g: number | null;
  /** Obligatorio si hay rendimiento declarado: el candado lo exige. */
  rendimiento_motivo: string | null;
  portion_hints: PortionHint[];
  default_portion_g: number;
  caveats: string[];
}

export interface Curation {
  names: Map<number, CuratedName>;
  portions: Map<number, CuratedPortion>;
  /** Aliases regionales con confianza (card 1.6), por fdc_id. */
  regionalAliases: Map<number, AliasWithConfidence[]>;
  /** Alimentos declarados a mano, en el orden del archivo. */
  manualFoods: ManualFood[];
  /** Métodos de cocción declarados (card 1.7), por id. */
  transforms: Map<string, CookingTransform>;
  /** Recetas compuestas, en el orden del archivo. */
  recipes: Recipe[];
  /** Archivos que se encontraron, para que el reporte diga qué se mezcló. */
  filesFound: string[];
  /** Problemas de forma en archivos que sí existen. */
  problems: string[];
}

function readJsonObject(path: string, problems: string[]): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    problems.push(`${path}: no es JSON válido (${(error as Error).message})`);
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    problems.push(`${path}: se esperaba un objeto { "<fdc_id>": {...} }`);
    return null;
  }
  return parsed as Record<string, unknown>;
}

/** Un número finito y positivo, o `null` con el problema anotado. */
function positive(value: unknown, label: string, problems: string[]): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    problems.push(`${label}: se esperaba un número > 0`);
    return null;
  }
  return parsed;
}

/** Lee la curación disponible. Nunca lanza por ausencia. */
export function loadCuration(dir: string = CURATION_DIR): Curation {
  const names = new Map<number, CuratedName>();
  const portions = new Map<number, CuratedPortion>();
  const regionalAliases = new Map<number, AliasWithConfidence[]>();
  const manualFoods: ManualFood[] = [];
  const transforms = new Map<string, CookingTransform>();
  const recipes: Recipe[] = [];
  const filesFound: string[] = [];
  const problems: string[] = [];

  const namesFile = join(dir, "names.es.json");
  if (existsSync(namesFile)) {
    filesFound.push("names.es.json");
    const raw = readJsonObject(namesFile, problems);
    for (const [key, value] of Object.entries(raw ?? {})) {
      const fdcId = Number(key);
      if (!Number.isInteger(fdcId)) {
        problems.push(`names.es.json: la clave "${key}" no es un fdc_id`);
        continue;
      }
      if (value === null || typeof value !== "object") {
        problems.push(`names.es.json[${key}]: se esperaba { name, aliases }`);
        continue;
      }
      const entry = value as { name?: unknown; aliases?: unknown };
      if (typeof entry.name !== "string" || entry.name.trim() === "") {
        problems.push(`names.es.json[${key}]: "name" ausente o vacío`);
        continue;
      }
      let aliases: string[] = [];
      if (entry.aliases !== undefined) {
        if (!Array.isArray(entry.aliases) || entry.aliases.some((a) => typeof a !== "string")) {
          problems.push(`names.es.json[${key}]: "aliases" debe ser una lista de textos`);
        } else {
          aliases = (entry.aliases as string[]).map((a) => a.trim()).filter((a) => a !== "");
        }
      }
      names.set(fdcId, { name: entry.name.trim(), aliases });
    }
  }

  const portionsFile = join(dir, "portions.overrides.json");
  if (existsSync(portionsFile)) {
    filesFound.push("portions.overrides.json");
    const raw = readJsonObject(portionsFile, problems);
    for (const [key, value] of Object.entries(raw ?? {})) {
      const fdcId = Number(key);
      if (!Number.isInteger(fdcId)) {
        problems.push(`portions.overrides.json: la clave "${key}" no es un fdc_id`);
        continue;
      }
      if (value === null || typeof value !== "object") {
        problems.push(`portions.overrides.json[${key}]: se esperaba un objeto`);
        continue;
      }
      const entry = value as { default_portion_g?: unknown; label_es?: unknown };

      let grams: number | null = null;
      if (entry.default_portion_g !== undefined && entry.default_portion_g !== null) {
        const parsed = Number(entry.default_portion_g);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          problems.push(
            `portions.overrides.json[${key}]: "default_portion_g" debe ser un número > 0`,
          );
        } else {
          grams = parsed;
        }
      }

      let labelEs: string | null = null;
      if (entry.label_es !== undefined && entry.label_es !== null) {
        if (typeof entry.label_es !== "string" || entry.label_es.trim() === "") {
          problems.push(`portions.overrides.json[${key}]: "label_es" debe ser un texto no vacío`);
        } else {
          labelEs = entry.label_es.trim();
        }
      }

      // Una entrada que no aporta ni gramos ni etiqueta no es un override.
      if (grams === null && labelEs === null) continue;
      portions.set(fdcId, { default_portion_g: grams, label_es: labelEs });
    }
  }

  // --- Aliases regionales con confianza (card 1.6) --------------------------
  const regionalFile = join(dir, "aliases.regional.json");
  if (existsSync(regionalFile)) {
    filesFound.push("aliases.regional.json");
    const raw = readJsonObject(regionalFile, problems);
    const bucket = raw?.["aliases"];
    if (raw !== null && (bucket === null || typeof bucket !== "object" || Array.isArray(bucket))) {
      problems.push('aliases.regional.json: se esperaba { "aliases": { "<fdc_id>": [...] } }');
    } else {
      for (const [key, value] of Object.entries((bucket ?? {}) as Record<string, unknown>)) {
        const fdcId = Number(key);
        if (!Number.isInteger(fdcId)) {
          problems.push(`aliases.regional.json: la clave "${key}" no es un fdc_id`);
          continue;
        }
        if (!Array.isArray(value)) {
          problems.push(`aliases.regional.json[${key}]: se esperaba una lista de aliases`);
          continue;
        }
        const parsed: AliasWithConfidence[] = [];
        for (const item of value) {
          if (item === null || typeof item !== "object" || Array.isArray(item)) {
            problems.push(`aliases.regional.json[${key}]: cada alias es { alias, confidence }`);
            continue;
          }
          const entry = item as { alias?: unknown; confidence?: unknown };
          if (typeof entry.alias !== "string" || entry.alias.trim() === "") {
            problems.push(`aliases.regional.json[${key}]: "alias" ausente o vacío`);
            continue;
          }
          const confidence = Number(entry.confidence);
          // La escala está declarada y es CERRADA: cuatro peldaños con nombre.
          // Un 0,73 no significa nada para nadie y abre la puerta a que cada
          // curación invente el suyo.
          if (!(ALIAS_CONFIDENCE_SCALE as readonly number[]).includes(confidence)) {
            problems.push(
              `aliases.regional.json[${key}]: la confianza de "${entry.alias}" es ${String(entry.confidence)}, ` +
                `fuera de la escala declarada (${ALIAS_CONFIDENCE_SCALE.join(", ")})`,
            );
            continue;
          }
          parsed.push({ alias: entry.alias.trim(), confidence });
        }
        if (parsed.length > 0) regionalAliases.set(fdcId, parsed);
      }
    }
  }

  // --- Alimentos de curación manual (precedencia máxima) --------------------
  const manualFile = join(dir, "manual.foods.json");
  if (existsSync(manualFile)) {
    filesFound.push("manual.foods.json");
    const raw = readJsonObject(manualFile, problems);
    const list = raw?.["foods"];
    if (raw !== null && !Array.isArray(list)) {
      problems.push('manual.foods.json: se esperaba { "foods": [ ... ] }');
    } else {
      for (const [index, item] of ((list ?? []) as unknown[]).entries()) {
        const food = parseManualFood(item, `manual.foods.json[${index}]`, problems);
        if (food !== null) manualFoods.push(food);
      }
    }
    const seen = new Set<string>();
    for (const food of manualFoods) {
      if (seen.has(food.id)) problems.push(`manual.foods.json: id repetido "${food.id}"`);
      seen.add(food.id);
    }
  }

  // --- Métodos de cocción (card 1.7) ---------------------------------------
  const transformsFile = join(dir, "cooking.transforms.json");
  if (existsSync(transformsFile)) {
    filesFound.push("cooking.transforms.json");
    const raw = readJsonObject(transformsFile, problems);
    const bucket = raw?.["transforms"];
    if (raw !== null && (bucket === null || typeof bucket !== "object" || Array.isArray(bucket))) {
      problems.push('cooking.transforms.json: se esperaba { "transforms": { ... } }');
    } else {
      for (const [id, value] of Object.entries((bucket ?? {}) as Record<string, unknown>)) {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          problems.push(`cooking.transforms.json[${id}]: se esperaba un objeto`);
          continue;
        }
        const entry = value as Record<string, unknown>;
        const factor = Number(entry["factor_peso"]);
        const absorcion = Number(entry["aceite_absorbido_pct"]);
        const ref = entry["aceite_ref"];
        if (!Number.isFinite(factor) || factor <= 0) {
          problems.push(`cooking.transforms.json[${id}]: "factor_peso" debe ser un número > 0`);
          continue;
        }
        if (!Number.isFinite(absorcion) || absorcion < 0) {
          problems.push(`cooking.transforms.json[${id}]: "aceite_absorbido_pct" debe ser >= 0`);
          continue;
        }
        // La fuente no es decoración: es la regla de la card. Una transformación
        // sin fuente escrita es un número inventado esperando a que alguien lo use.
        if (typeof entry["fuente"] !== "string" || (entry["fuente"] as string).trim() === "") {
          problems.push(`cooking.transforms.json[${id}]: falta "fuente"`);
          continue;
        }
        if (absorcion > 0 && (typeof ref !== "string" || !/^fdc-\d+$/.test(ref))) {
          problems.push(`cooking.transforms.json[${id}]: absorbe aceite y no declara "aceite_ref"`);
          continue;
        }
        transforms.set(id, {
          id,
          factor_peso: factor,
          aceite_absorbido_pct: absorcion,
          aceite_ref: typeof ref === "string" ? ref : null,
        });
      }
    }
  }

  // --- Recetas compuestas (card 1.7) ---------------------------------------
  const recipesFile = join(dir, "recipes.foods.json");
  if (existsSync(recipesFile)) {
    filesFound.push("recipes.foods.json");
    const raw = readJsonObject(recipesFile, problems);
    const list = raw?.["recipes"];
    if (raw !== null && !Array.isArray(list)) {
      problems.push('recipes.foods.json: se esperaba { "recipes": [ ... ] }');
    } else {
      for (const [index, item] of ((list ?? []) as unknown[]).entries()) {
        const recipe = parseRecipe(item, `recipes.foods.json[${index}]`, problems);
        if (recipe !== null) recipes.push(recipe);
      }
    }
    const seen = new Set<string>();
    for (const recipe of recipes) {
      if (seen.has(recipe.id)) problems.push(`recipes.foods.json: id repetido "${recipe.id}"`);
      seen.add(recipe.id);
    }
  }

  return { names, portions, regionalAliases, manualFoods, transforms, recipes, filesFound, problems };
}

/** Valida una receta entera. Exigente por el mismo motivo que la curación manual. */
function parseRecipe(item: unknown, label: string, problems: string[]): Recipe | null {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    problems.push(`${label}: se esperaba un objeto`);
    return null;
  }
  const raw = item as Record<string, unknown>;
  const before = problems.length;

  const id = typeof raw["id"] === "string" ? (raw["id"] as string).trim() : "";
  if (!/^receta-[a-z0-9-]+$/.test(id)) problems.push(`${label}: el id tiene que ser "receta-<algo>"`);

  const names = raw["names"] as { en?: unknown; es?: unknown } | undefined;
  const nameEn = typeof names?.en === "string" ? names.en.trim() : "";
  const nameEs = typeof names?.es === "string" ? names.es.trim() : "";
  if (nameEn === "" || nameEs === "") problems.push(`${label}: "names" necesita en y es`);
  const metodo = typeof raw["metodo"] === "string" ? (raw["metodo"] as string).trim() : "";
  if (metodo === "") problems.push(`${label}: falta "metodo"`);
  const category = typeof raw["category"] === "string" ? (raw["category"] as string).trim() : "";
  if (category === "") problems.push(`${label}: falta "category"`);

  const aliases: (string | AliasWithConfidence)[] = [];
  for (const alias of (Array.isArray(raw["aliases"]) ? raw["aliases"] : []) as unknown[]) {
    if (typeof alias === "string" && alias.trim() !== "") aliases.push(alias.trim());
    else problems.push(`${label}: alias inválido`);
  }

  const ingredientes: { ref: string; grams: number }[] = [];
  const rawIng = raw["ingredientes"];
  if (!Array.isArray(rawIng) || rawIng.length === 0) {
    problems.push(`${label}: "ingredientes" tiene que traer al menos uno`);
  } else {
    for (const ing of rawIng) {
      if (ing === null || typeof ing !== "object" || Array.isArray(ing)) {
        problems.push(`${label}: cada ingrediente es { ref, grams }`);
        continue;
      }
      const entry = ing as { ref?: unknown; grams?: unknown };
      const grams = Number(entry.grams);
      if (typeof entry.ref !== "string" || entry.ref.trim() === "") {
        problems.push(`${label}: ingrediente sin "ref"`);
        continue;
      }
      // Un ingrediente de 0 g no aporta nada y esconde un error de tipeo.
      if (!Number.isFinite(grams) || grams <= 0) {
        problems.push(`${label}: el ingrediente ${entry.ref} tiene que declarar gramos > 0`);
        continue;
      }
      ingredientes.push({ ref: entry.ref.trim(), grams });
    }
  }

  let rendimiento: number | null = null;
  let motivo: string | null = null;
  if (raw["rendimiento_declarado_g"] !== undefined && raw["rendimiento_declarado_g"] !== null) {
    const parsed = Number(raw["rendimiento_declarado_g"]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      problems.push(`${label}: "rendimiento_declarado_g" debe ser un número > 0`);
    } else {
      rendimiento = parsed;
      // Pisar la transformación es salirse de lo medido: exige decir por qué.
      const razon = raw["rendimiento_motivo"];
      if (typeof razon !== "string" || razon.trim() === "") {
        problems.push(`${label}: un rendimiento declarado a mano necesita "rendimiento_motivo"`);
      } else {
        motivo = razon.trim();
      }
    }
  }

  const portion_hints: PortionHint[] = [];
  for (const hint of (Array.isArray(raw["portion_hints"]) ? raw["portion_hints"] : []) as unknown[]) {
    if (hint === null || typeof hint !== "object") continue;
    const entry = hint as { grams?: unknown; label_en?: unknown; label_es?: unknown };
    const grams = positive(entry.grams, `${label}: portion_hints.grams`, problems);
    if (grams === null || typeof entry.label_en !== "string") continue;
    portion_hints.push({
      grams,
      label_en: entry.label_en.trim(),
      label_es: typeof entry.label_es === "string" && entry.label_es.trim() !== "" ? entry.label_es.trim() : null,
    });
  }
  if (portion_hints.length === 0) problems.push(`${label}: "portion_hints" no puede estar vacío`);
  const defaultPortion = positive(raw["default_portion_g"], `${label}: default_portion_g`, problems);

  const caveats: string[] = [];
  if (!Array.isArray(raw["caveats"]) || (raw["caveats"] as unknown[]).length === 0) {
    // Una ficha derivada SIEMPRE tiene algo que declarar: que es una receta
    // estándar y no una medición. Sin caveats, la ficha se lee como un dato duro.
    problems.push(`${label}: una receta tiene que declarar al menos un caveat`);
  } else {
    for (const caveat of raw["caveats"] as unknown[]) {
      if (typeof caveat === "string" && caveat.trim() !== "") caveats.push(caveat.trim());
      else problems.push(`${label}: "caveats" debe ser una lista de textos`);
    }
  }

  if (problems.length !== before || defaultPortion === null) return null;
  return {
    id, name_en: nameEn, name_es: nameEs, aliases, category, metodo, ingredientes,
    rendimiento_declarado_g: rendimiento, rendimiento_motivo: motivo,
    portion_hints, default_portion_g: defaultPortion, caveats,
  };
}

/**
 * Valida una entrada manual entera. Es EXIGENTE a propósito: la curación manual
 * tiene la precedencia más alta del pipeline, así que es el único lugar donde un
 * número escrito a mano puede terminar en el reporte de una persona. La tolerancia
 * del build vale para la ausencia de un archivo, no para un archivo mal escrito.
 */
function parseManualFood(
  item: unknown,
  label: string,
  problems: string[],
): ManualFood | null {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    problems.push(`${label}: se esperaba un objeto`);
    return null;
  }
  const raw = item as Record<string, unknown>;
  const before = problems.length;

  const text = (key: string): string => {
    const value = raw[key];
    if (typeof value !== "string" || value.trim() === "") {
      problems.push(`${label}: "${key}" ausente o vacío`);
      return "";
    }
    return value.trim();
  };

  const id = text("id");
  if (id !== "" && !/^manual-[a-z0-9-]+$/.test(id) && !/^fdc-\d+$/.test(id)) {
    problems.push(`${label}: el id "${id}" no es "manual-<algo>" ni "fdc-<fdc_id>"`);
  }
  const origen = text("origen");
  if (origen !== "" && !/^[a-z0-9-]+$/.test(origen)) {
    problems.push(`${label}: "origen" va en minúsculas y guiones ("etiqueta-comercial")`);
  }
  const source_ref = text("source_ref");
  const name_en = text("name_en");
  const name_es = text("name_es");
  const category = text("category");

  const aliases: (string | AliasWithConfidence)[] = [];
  const rawAliases = raw["aliases"];
  if (rawAliases !== undefined) {
    if (!Array.isArray(rawAliases)) {
      problems.push(`${label}: "aliases" debe ser una lista`);
    } else {
      for (const alias of rawAliases) {
        if (typeof alias === "string" && alias.trim() !== "") {
          aliases.push(alias.trim());
          continue;
        }
        if (alias !== null && typeof alias === "object" && !Array.isArray(alias)) {
          const entry = alias as { alias?: unknown; confidence?: unknown };
          const confidence = Number(entry.confidence);
          if (
            typeof entry.alias === "string" &&
            entry.alias.trim() !== "" &&
            (ALIAS_CONFIDENCE_SCALE as readonly number[]).includes(confidence)
          ) {
            aliases.push({ alias: entry.alias.trim(), confidence });
            continue;
          }
        }
        problems.push(`${label}: alias inválido (texto, o { alias, confidence } en la escala)`);
      }
    }
  }

  const rawPer100g = raw["per_100g"];
  const per_100g = {} as Per100g;
  if (rawPer100g === null || typeof rawPer100g !== "object" || Array.isArray(rawPer100g)) {
    problems.push(`${label}: "per_100g" ausente`);
  } else {
    const values = rawPer100g as Record<string, unknown>;
    for (const key of REQUIRED_KEYS) {
      const value = Number(values[key]);
      if (!Number.isFinite(value) || value < 0) {
        problems.push(`${label}: per_100g.${key} tiene que ser un número >= 0`);
        continue;
      }
      per_100g[key] = value;
    }
    for (const key of OPTIONAL_KEYS) {
      const value = values[key];
      // `null` es una respuesta: "la fuente no lo dice". Ausente, también.
      if (value === undefined || value === null) {
        per_100g[key] = null;
        continue;
      }
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        problems.push(`${label}: per_100g.${key} tiene que ser un número >= 0 o null`);
        continue;
      }
      per_100g[key] = parsed;
    }
  }

  const portion_hints: PortionHint[] = [];
  const rawHints = raw["portion_hints"];
  if (!Array.isArray(rawHints) || rawHints.length === 0) {
    problems.push(`${label}: "portion_hints" tiene que traer al menos una porción`);
  } else {
    for (const hint of rawHints) {
      if (hint === null || typeof hint !== "object" || Array.isArray(hint)) {
        problems.push(`${label}: cada porción es { grams, label_en, label_es }`);
        continue;
      }
      const entry = hint as { grams?: unknown; label_en?: unknown; label_es?: unknown };
      const grams = positive(entry.grams, `${label}: portion_hints.grams`, problems);
      if (grams === null) continue;
      if (typeof entry.label_en !== "string" || entry.label_en.trim() === "") {
        problems.push(`${label}: portion_hints.label_en ausente`);
        continue;
      }
      const labelEs =
        typeof entry.label_es === "string" && entry.label_es.trim() !== ""
          ? entry.label_es.trim()
          : null;
      portion_hints.push({ grams, label_en: entry.label_en.trim(), label_es: labelEs });
    }
  }

  const default_portion_g = positive(raw["default_portion_g"], `${label}: default_portion_g`, problems);

  const caveats: string[] = [];
  const rawCaveats = raw["caveats"];
  if (!Array.isArray(rawCaveats) || rawCaveats.some((c) => typeof c !== "string")) {
    problems.push(`${label}: "caveats" debe ser una lista de textos (vacía si no hay ninguno)`);
  } else {
    for (const caveat of rawCaveats as string[]) {
      if (caveat.trim() !== "") caveats.push(caveat.trim());
    }
  }

  if (problems.length !== before || default_portion_g === null) return null;
  return {
    id,
    origen,
    source_ref,
    name_en,
    name_es,
    aliases,
    category,
    per_100g,
    portion_hints,
    default_portion_g,
    caveats,
  };
}
