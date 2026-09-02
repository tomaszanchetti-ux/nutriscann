/* =============================================================================
 * GENERADO desde kb/src/transforms.ts — NO EDITAR.
 *
 * Esto es una COPIA. La fuente de verdad es `kb/src/transforms.ts` y se edita allá.
 *
 * Por qué hay una copia en vez de un import: el repo NO USA WORKSPACES DE NPM
 * (regla del proyecto). El hoisting de workspaces rompe el empaquetado de Cloud
 * Functions, que se despliega con su propio `node_modules` y solo puede requerir
 * lo que esté dentro de `functions/`. Un import a `../../kb/src` compila en local
 * y explota en la nube.
 *
 * Cómo se evita que las dos copias se separen: hay un candado que las compara
 * BYTE A BYTE en `functions/src/kb/copias.test.ts`. Si alguien edita una y no la
 * otra, el test falla y la CI no pasa. Todo lo que está debajo del centinela es
 * el archivo original, sin una coma de diferencia — el candado lo exige.
 *
 * Para regenerarla: copiar `kb/src/transforms.ts` debajo del centinela, tal cual.
 * =============================================================================
 */
// ---8<--- COPIA BYTE A BYTE DEL ORIGINAL — TODO LO QUE SIGUE ES kb/src/<archivo> ---8<---
/**
 * La matemática de las recetas compuestas (card 1.7).
 *
 * TODO ESTE ARCHIVO ES PURO: no lee archivos, no toca el reloj, no consulta la
 * red. Recibe ingredientes ya resueltos y una transformación ya leída, y
 * devuelve números. La razón es la Fase 2: el motor va a componer platos que
 * nadie anticipó —una foto con arroz, pollo y verdura que no tiene ficha— y va a
 * necesitar exactamente esta función EN RUNTIME. Si la matemática viviera pegada
 * a la lectura de `curation/`, habría que reimplementarla del otro lado y las dos
 * copias se irían separando. La decisión se separa de la lectura.
 *
 * El modelo, en una línea:
 *
 *     entrada     = Σ gramos de los ingredientes
 *     aceite      = entrada × absorción de la transformación
 *     peso_final  = (entrada + aceite) × factor de peso   [o el rendimiento declarado]
 *     nutriente_k = (Σ nutriente_k del ingrediente + el del aceite) / peso_final × 100
 *
 * El agua que se evapora NO es un ingrediente: la representa el factor de peso.
 * El agua que se queda en el plato (el caldo de un guiso, el agua de un gazpacho)
 * SÍ es un ingrediente, y entra apuntando a la ficha de agua del catálogo
 * (`fdc-2710707`) porque pesa y diluye. Ojo: esa ficha NO es un cero — USDA le
 * mide 4 mg de sodio por 100 g, y acá se usan sus valores reales como los de
 * cualquier otro ingrediente. Meter el agua dentro del factor de peso escondería
 * en un número lo que la receta puede decir en una línea, y además perdería ese
 * sodio.
 */
import { OPTIONAL_KEYS, REQUIRED_KEYS } from "./nutrients";
import type { Per100g } from "./types";

/** Las ocho claves de `per_100g`, en el orden en que se escriben. */
const PER_100G_KEYS = [...REQUIRED_KEYS, ...OPTIONAL_KEYS];

/**
 * Una transformación de cocción, declarativa y reutilizable.
 *
 * Cada campo lleva su fuente porque la regla de la card es que una
 * transformación sin fuente defendible NO se inventa: si no hay número que se
 * pueda medir contra los datasets, la receta que la necesite queda bloqueada.
 */
export interface CookingTransform {
  id: string;
  /** Cuánto pesa el resultado por cada gramo que entró (ya sumado el aceite). */
  factor_peso: number;
  /** Aceite absorbido, en % del peso de los ingredientes. 0 si no fríe. */
  aceite_absorbido_pct: number;
  /** Ficha del catálogo con la que se cuantifica ese aceite. */
  aceite_ref: string | null;
}

/** Un ingrediente ya resuelto: cuántos gramos y con qué valores se cuantifica. */
export interface ResolvedIngredient {
  ref: string;
  grams: number;
  per_100g: Per100g;
}

export interface DerivationInput {
  ingredientes: ResolvedIngredient[];
  transform: CookingTransform;
  /** Aceite de la transformación, ya resuelto. Obligatorio si absorbe. */
  aceite?: Per100g | null;
  /** Rendimiento que la receta declara a mano, pisando el de la transformación. */
  rendimiento_declarado?: number | null;
}

export interface Derivation {
  per_100g: Per100g;
  peso_entrada_g: number;
  aceite_absorbido_g: number;
  peso_final_g: number;
  /** De dónde salió el peso final: la transformación o la propia receta. */
  rendimiento_de: "transformacion" | "receta";
}

/** Redondeo estable a tres decimales: el archivo se commitea y se diffea. */
function redondear(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Deriva los valores por 100 g de una receta. Determinística y total: los mismos
 * ingredientes en el mismo orden dan el mismo byte.
 *
 * Un nutriente opcional que le falte a UN ingrediente sale `null` para toda la
 * receta. No se asume cero: que la ficha de la almendra no declare azúcares no
 * quiere decir que la almendra no tenga; sumar como si fuera cero inventaría una
 * precisión que no existe. Los cuatro obligatorios nunca son `null` —ninguna
 * ficha del catálogo entra sin ellos— así que la receta siempre cuantifica.
 */
export function derivarReceta(input: DerivationInput): Derivation {
  const { ingredientes, transform } = input;

  const pesoEntrada = ingredientes.reduce((sum, i) => sum + i.grams, 0);
  if (pesoEntrada <= 0) throw new Error("una receta sin gramos no se puede derivar");

  const aceiteG = redondear((pesoEntrada * transform.aceite_absorbido_pct) / 100);
  if (aceiteG > 0 && (input.aceite === undefined || input.aceite === null)) {
    throw new Error(
      `la transformación ${transform.id} absorbe aceite y no se resolvió su ficha (${String(transform.aceite_ref)})`,
    );
  }

  const declarado = input.rendimiento_declarado ?? null;
  const pesoFinal =
    declarado === null ? redondear((pesoEntrada + aceiteG) * transform.factor_peso) : redondear(declarado);
  if (pesoFinal <= 0) throw new Error("el peso final de una receta tiene que ser > 0");

  const per100g = {} as Per100g;
  for (const key of PER_100G_KEYS) {
    let total = 0;
    let conocido = true;
    for (const ing of ingredientes) {
      const value = ing.per_100g[key];
      if (value === null || value === undefined) {
        conocido = false;
        break;
      }
      total += (value * ing.grams) / 100;
    }
    if (conocido && aceiteG > 0 && input.aceite) {
      const value = input.aceite[key];
      if (value === null || value === undefined) conocido = false;
      else total += (value * aceiteG) / 100;
    }
    const resultado = conocido ? redondear((total / pesoFinal) * 100) : null;
    if (resultado === null && REQUIRED_KEYS.includes(key as (typeof REQUIRED_KEYS)[number])) {
      throw new Error(`la receta no pudo derivar ${key}: un ingrediente no lo declara`);
    }
    per100g[key] = resultado as never;
  }

  return {
    per_100g: per100g,
    peso_entrada_g: redondear(pesoEntrada),
    aceite_absorbido_g: aceiteG,
    peso_final_g: pesoFinal,
    rendimiento_de: declarado === null ? "transformacion" : "receta",
  };
}

/**
 * Cuánto se apartó el peso final de la suma de lo que entró.
 *
 * Lo usa el candado de rendimiento. Se mide contra el peso de los ingredientes
 * SIN el aceite: el aceite es materia que se suma, no agua que se va, y contarlo
 * como rendimiento haría que una fritura pareciera que "ganó agua".
 */
export function desvioDeRendimiento(derivation: Derivation): number {
  const esperado = derivation.peso_entrada_g + derivation.aceite_absorbido_g;
  return derivation.peso_final_g / esperado;
}
