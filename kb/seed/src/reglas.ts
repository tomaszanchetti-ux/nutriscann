/**
 * Lectura y validación del documento de reglas de recomendación.
 *
 * A diferencia del catálogo —donde el seed es deliberadamente agnóstico del
 * esquema— acá SÍ se valida, y por una razón concreta que está escrita en
 * `config/README.md` §4.3: la interfaz elige ícono y color a partir del `tag`,
 * así que un tag mal escrito **no rompe nada visible, se degrada en silencio**.
 * Eso hay que detectarlo antes de publicar, no después.
 *
 * Lo que se valida es exactamente eso: la lista CERRADA de tags, la forma
 * mínima de cada regla y que los identificadores de las condiciones existan.
 * Nada más. Los umbrales, las plantillas y las citas son configuración: el seed
 * los publica tal cual y no opina.
 *
 * IMPORTANTE — lo que este archivo NO hace: no interpreta la gramática del
 * campo `if`. La sintaxis y la semántica de evaluación las implementa el motor
 * (`config/README.md` §3 y §4). Acá el chequeo es LÉXICO: se sacan los nombres
 * que parecen identificadores y se verifica que estén en la lista permitida.
 * Alcanza para cazar un `sodium_per_kcal` mal tipeado; no pretende decir si la
 * expresión es sintácticamente válida.
 */
import { readFileSync } from "node:fs";

import type { ValorJson } from "./valores";

/** El documento entero, tal como se publica. La forma del JSON manda. */
export type DocumentoReglas = Record<string, ValorJson>;

/** Lo que el seed necesita saber del documento para reportarlo. */
export interface Reglas {
  /** El documento completo: se publica tal cual, sin recortar. */
  documento: DocumentoReglas;
  /** La lista cerrada de tags válidos. */
  tags: string[];
  /** Los ids de las reglas, en el orden del archivo. */
  ids: string[];
  /** El tag que se usa cuando ninguna regla dispara. */
  fallbackTag: string;
}

/** Un identificador que puede aparecer en un `if`: `sat_fat_pct`, `kcal`, … */
const IDENTIFICADOR = /[A-Za-z_][A-Za-z_0-9]*/g;

function esObjeto(valor: ValorJson | undefined): valor is Record<string, ValorJson> {
  return valor !== null && valor !== undefined && typeof valor === "object" && !Array.isArray(valor);
}

/** Un texto no vacío, o `null` con el motivo por el que no lo es. */
function textoNoVacio(valor: ValorJson | undefined): string | null {
  if (typeof valor !== "string" || valor.trim() === "") return null;
  return valor;
}

/**
 * Valida un documento de reglas ya parseado (separado del disco para poder
 * testearlo construyendo cada escenario).
 */
export function interpretarReglas(crudo: unknown, origen: string): Reglas {
  if (!esObjeto(crudo as ValorJson)) {
    throw new Error(`${origen}: el documento de reglas no es un objeto JSON`);
  }
  const documento = crudo as DocumentoReglas;

  // ── La lista cerrada de tags ────────────────────────────────────────────
  const tagsCrudos = documento["tags"];
  if (!Array.isArray(tagsCrudos) || tagsCrudos.length === 0) {
    throw new Error(`${origen}: falta 'tags' (o está vacío): es la lista cerrada de tags válidos`);
  }
  const tags: string[] = [];
  for (const [indice, tag] of tagsCrudos.entries()) {
    const texto = textoNoVacio(tag);
    if (texto === null) throw new Error(`${origen}: tags[${indice}] no es un texto`);
    if (tags.includes(texto)) throw new Error(`${origen}: el tag '${texto}' aparece dos veces`);
    tags.push(texto);
  }

  // ── Los identificadores que una condición puede nombrar ─────────────────
  const evaluacion = documento["evaluation"];
  if (!esObjeto(evaluacion)) {
    throw new Error(`${origen}: falta 'evaluation': ahí vive el contrato del motor`);
  }
  const permitidosCrudos = evaluacion["identifiers_allowed"];
  if (!Array.isArray(permitidosCrudos) || permitidosCrudos.length === 0) {
    throw new Error(`${origen}: falta 'evaluation.identifiers_allowed' (o está vacío)`);
  }
  const permitidos = new Set<string>();
  for (const [indice, nombre] of permitidosCrudos.entries()) {
    const texto = textoNoVacio(nombre);
    if (texto === null) {
      throw new Error(`${origen}: evaluation.identifiers_allowed[${indice}] no es un texto`);
    }
    permitidos.add(texto);
  }

  // ── Las reglas ──────────────────────────────────────────────────────────
  const reglasCrudas = documento["rules"];
  if (!Array.isArray(reglasCrudas) || reglasCrudas.length === 0) {
    throw new Error(`${origen}: falta 'rules' (o está vacío): un set sin reglas no se publica`);
  }
  const ids: string[] = [];
  reglasCrudas.forEach((regla, indice) => {
    const donde = `${origen}: rules[${indice}]`;
    if (!esObjeto(regla)) throw new Error(`${donde} no es un objeto`);

    const id = textoNoVacio(regla["id"]);
    if (id === null) throw new Error(`${donde}: falta 'id'`);
    if (ids.includes(id)) throw new Error(`${origen}: el id de regla '${id}' aparece dos veces`);
    ids.push(id);

    const condicion = textoNoVacio(regla["if"]);
    if (condicion === null) throw new Error(`${origen}: la regla '${id}' no tiene condición 'if'`);
    for (const nombre of condicion.match(IDENTIFICADOR) ?? []) {
      if (!permitidos.has(nombre)) {
        throw new Error(
          `${origen}: la regla '${id}' nombra '${nombre}', que no está en ` +
            "evaluation.identifiers_allowed. Un identificador que el motor no conoce no se " +
            "publica: la regla nunca dispararía y el error no se vería en ningún lado.",
        );
      }
    }

    const prioridad = regla["priority"];
    if (typeof prioridad !== "number" || !Number.isFinite(prioridad)) {
      throw new Error(`${origen}: la regla '${id}' no tiene 'priority' numérica`);
    }

    const tag = textoNoVacio(regla["tag"]);
    if (tag === null) throw new Error(`${origen}: la regla '${id}' no tiene 'tag'`);
    if (!tags.includes(tag)) {
      throw new Error(
        `${origen}: la regla '${id}' usa el tag '${tag}', que no está en la lista cerrada ` +
          `tags [${tags.join(", ")}]. La interfaz elige ícono y color por el tag: uno mal ` +
          "escrito se degrada en silencio, y por eso se frena acá.",
      );
    }

    const plantillas = regla["templates"];
    if (!esObjeto(plantillas) || textoNoVacio(plantillas["es"]) === null) {
      throw new Error(`${origen}: la regla '${id}' no tiene 'templates.es'`);
    }
  });

  // ── El fallback ─────────────────────────────────────────────────────────
  const fallbackTag = textoNoVacio(documento["fallback_tag"]);
  if (fallbackTag === null) throw new Error(`${origen}: falta 'fallback_tag'`);
  if (!tags.includes(fallbackTag)) {
    throw new Error(
      `${origen}: el fallback_tag '${fallbackTag}' no está en la lista cerrada tags ` +
        `[${tags.join(", ")}]`,
    );
  }
  const fallbackPlantillas = documento["fallback_templates"];
  if (!esObjeto(fallbackPlantillas) || textoNoVacio(fallbackPlantillas["es"]) === null) {
    throw new Error(`${origen}: falta 'fallback_templates.es'`);
  }

  return { documento, tags, ids, fallbackTag };
}

/** Lee `config/recommendation_rules.json` de disco y lo valida. */
export function cargarReglas(ruta: string): Reglas {
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch (error) {
    throw new Error(`No pude leer las reglas en ${ruta}: ${(error as Error).message}`);
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (error) {
    throw new Error(`Las reglas en ${ruta} no son JSON válido: ${(error as Error).message}`);
  }
  return interpretarReglas(crudo, ruta);
}
