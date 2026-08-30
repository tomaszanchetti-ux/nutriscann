/**
 * Lectura y validación del catálogo canónico.
 *
 * Deliberadamente flaco: el seed NO conoce el esquema de un alimento. Solo
 * exige lo que necesita para publicar — que haya `kb_version`, que haya
 * `foods[]`, y que cada alimento tenga un `id` usable como nombre de documento
 * en Firestore. Todo lo demás viaja tal cual.
 *
 * El catálogo lo compila otro paquete (`kb/`) y está creciendo: alimentos
 * regionales nuevos, un formato distinto de aliases. Un validador que
 * enumerara campos convertiría cada mejora del catálogo en un seed roto.
 */
import { readFileSync } from "node:fs";

import type { ValorJson } from "./valores";

/** Un alimento: un objeto JSON con `id`, y lo que sea que traiga además. */
export type AlimentoCrudo = Record<string, ValorJson> & { id: string };

export interface Catalogo {
  kb_version: string;
  foods: AlimentoCrudo[];
  /** El resto del encabezado (`generated_from`, etc.), por si hace falta reportarlo. */
  encabezado: Record<string, ValorJson>;
}

/**
 * Un `id` inválido no se descubre a mitad del seed: se descubre antes de la
 * primera escritura. Firestore prohíbe `/`, `.`, `..` y los nombres
 * `__reservados__`.
 */
export function validarId(id: unknown): string | null {
  if (typeof id !== "string") return "el id no es un texto";
  if (id === "") return "el id está vacío";
  if (id.includes("/")) return "el id contiene una barra";
  if (id === "." || id === "..") return "el id es '.' o '..'";
  if (/^__.*__$/.test(id)) return "el id usa el formato reservado __x__";
  if (Buffer.byteLength(id, "utf8") > 1500) return "el id supera los 1500 bytes";
  return null;
}

/** Parsea y valida un catálogo ya leído (separado del disco para poder testearlo). */
export function interpretarCatalogo(crudo: unknown, origen: string): Catalogo {
  if (crudo === null || typeof crudo !== "object" || Array.isArray(crudo)) {
    throw new Error(`${origen}: el catálogo no es un objeto JSON`);
  }
  const objeto = crudo as Record<string, ValorJson>;
  const version = objeto["kb_version"];
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error(`${origen}: falta 'kb_version' (o no es un texto)`);
  }
  const foods = objeto["foods"];
  if (!Array.isArray(foods)) {
    throw new Error(`${origen}: falta 'foods' (o no es una lista)`);
  }
  if (foods.length === 0) {
    // Un catálogo vacío deprecaría TODA la colección. Nunca es lo que se quiso.
    throw new Error(`${origen}: el catálogo no tiene alimentos; se aborta antes de tocar nada`);
  }

  const alimentos: AlimentoCrudo[] = [];
  const vistos = new Set<string>();
  foods.forEach((alimento, indice) => {
    if (alimento === null || typeof alimento !== "object" || Array.isArray(alimento)) {
      throw new Error(`${origen}: el alimento #${indice} no es un objeto`);
    }
    const objetoAlimento = alimento as Record<string, ValorJson>;
    const problema = validarId(objetoAlimento["id"]);
    if (problema) throw new Error(`${origen}: alimento #${indice}: ${problema}`);
    const id = objetoAlimento["id"] as string;
    if (vistos.has(id)) throw new Error(`${origen}: el id '${id}' aparece dos veces`);
    vistos.add(id);
    alimentos.push(objetoAlimento as AlimentoCrudo);
  });

  const encabezado: Record<string, ValorJson> = {};
  for (const [clave, valor] of Object.entries(objeto)) {
    if (clave === "foods") continue;
    encabezado[clave] = valor;
  }

  return { kb_version: version, foods: alimentos, encabezado };
}

/** Lee `foods.canonical.json` de disco y lo valida. */
export function cargarCatalogo(ruta: string): Catalogo {
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch (error) {
    throw new Error(`No pude leer el catálogo en ${ruta}: ${(error as Error).message}`);
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (error) {
    throw new Error(`El catálogo en ${ruta} no es JSON válido: ${(error as Error).message}`);
  }
  return interpretarCatalogo(crudo, ruta);
}
