/**
 * Utilidades PARA LOS TESTS. No la usa el motor ni el endpoint.
 *
 * Está acá y no en el motor a propósito: es el único archivo de `functions/src`
 * que lee del disco, y lo hace para traer el catálogo real (`kb/build/foods.canonical.json`)
 * a los tests. Leer un archivo del repo en un test no rompe la regla de pureza —
 * la regla es que la LÓGICA no lea nada, y la lógica sigue recibiendo las fichas
 * ya cargadas por parámetro, exactamente como se las va a pasar la card 2.2
 * cuando vengan de Firestore.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Catalog, CanonicalFood, Per100g } from "../kb/types";
import { construirIndice, type CatalogIndex } from "./catalog";

/** La raíz del repo, desde `functions/lib/engine` o desde `functions/src/engine`. */
export function raizDelRepo(): string {
  return resolve(__dirname, "..", "..", "..");
}

let cache: Catalog | null = null;

/** El catálogo canónico real, leído una sola vez por proceso de test. */
export function catalogoReal(): Catalog {
  if (cache === null) {
    cache = JSON.parse(readFileSync(resolve(raizDelRepo(), "kb", "build", "foods.canonical.json"), "utf8")) as Catalog;
  }
  return cache;
}

/** El índice del catálogo real. */
export function indiceReal(): CatalogIndex {
  const catalogo = catalogoReal();
  return construirIndice(catalogo.foods, catalogo.kb_version);
}

/** Una ficha del catálogo real por id. Lanza si no está: el test miente si sigue. */
export function fichaReal(id: string): CanonicalFood {
  const ficha = catalogoReal().foods.find((f) => f.id === id);
  if (ficha === undefined) throw new Error(`el catálogo real no tiene ${id}`);
  return ficha;
}

/**
 * Una ficha inventada, para construir escenarios que el catálogo real no tiene.
 *
 * El escenario de un candado SE CONSTRUYE, nunca se busca en los datos: hoy el
 * catálogo no tiene ninguna ficha `deprecated` (medido: 0 de 1.022), y el test
 * de que una ficha retirada no matchea tiene que existir igual — justamente para
 * el día en que la primera se retire.
 */
export function indiceDeFixture(fichas: CanonicalFood[], kb_version = "test"): CatalogIndex {
  // `minimo_de_fichas: 1` es una DECLARACIÓN, no un atajo: este índice es de
  // dos fichas a propósito y quien lo lea tiene que ver que se sabía.
  return construirIndice(fichas, kb_version, { minimo_de_fichas: 1 });
}

export function fichaFalsa(parcial: Partial<CanonicalFood> & { id: string }): CanonicalFood {
  const per_100g: Per100g = {
    kcal: 100,
    protein_g: 10,
    carbs_g: 10,
    fat_g: 2,
    fiber_g: 1,
    sat_fat_g: 0.5,
    sugars_g: 1,
    sodium_mg: 10,
  };
  return {
    source: "manual",
    source_ref: `test/${parcial.id}`,
    names: { en: parcial.id, es: null },
    aliases: { es: [] },
    category: "Test",
    per_100g,
    portion_hints: [],
    default_portion_g: 100,
    provenance: {},
    deprecated: false,
    ...parcial,
  };
}
