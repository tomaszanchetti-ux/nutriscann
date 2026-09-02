/**
 * Lectura y validación de los textos de la interfaz (`config/copy.json`).
 *
 * Hermano de `reglas.ts`, y por el MISMO motivo por el que aquel valida: un
 * texto que no llega no rompe nada visible. El front trae su arranque en frío
 * (`apps/web/src/lib/config.ts`), así que una clave mal tipeada acá deja la
 * pantalla igual de linda mostrando el valor viejo del código — o sea, la regla
 * dura n.º 1 rota **en silencio**, que es la forma más cara de romperla. Eso hay
 * que cazarlo antes de publicar.
 *
 * Por eso el archivo declara su lista CERRADA de claves (`keys`) y acá se
 * verifica que `copy` tenga exactamente esas: ni una de menos —un texto que la
 * interfaz espera y nunca se sembró— ni una de más —una clave que nadie lee y
 * que solo ensucia el documento—. Es el mismo candado que la lista cerrada de
 * `tags` en las reglas.
 *
 * Lo que este archivo NO hace: no opina sobre el contenido. No mide largos, no
 * corrige el idioma, no revisa la ortografía. Los textos son configuración: el
 * seed los publica tal cual y no los edita.
 *
 * DIFERENCIA IMPORTANTE con las reglas: de `recommendation_rules.json` se
 * publica el documento ENTERO; de este se publica **solo el objeto `copy`**.
 * `config/app.copy` es un mapa de texto a texto (así lo declara
 * `functions/src/config.ts`) y así lo lee el navegador clave por clave: meter
 * ahí adentro un `$schema_version` numérico rompería el contrato. Los metadatos
 * se quedan en el repo, que es donde sirven.
 */
import { readFileSync } from "node:fs";

import type { ValorJson } from "./valores";

/** El mapa que se publica: clave → texto. Nada más entra en `config/app.copy`. */
export type DocumentoTextos = Record<string, string>;

/** Lo que el seed necesita saber de los textos para publicarlos y reportarlos. */
export interface Textos {
  /** El mapa `copy` del archivo: exactamente esto se publica. */
  documento: DocumentoTextos;
  /** Las claves, ordenadas alfabéticamente. */
  claves: string[];
  /** Los pasos de la pantalla de espera, ya partidos. Solo para el reporte. */
  pasos: string[];
}

/** La clave, dentro de `copy`, donde viven los pasos de la espera. */
export const CLAVE_DE_PASOS = "scanning_steps";

/** Lo que separa un paso del siguiente en esa clave. Igual que en el front. */
export const SEPARADOR_DE_PASOS = "|";

function esObjeto(valor: ValorJson | undefined): valor is Record<string, ValorJson> {
  return valor !== null && valor !== undefined && typeof valor === "object" && !Array.isArray(valor);
}

/**
 * Los pasos de la espera, partidos como los parte el front.
 *
 * Se valida que ningún tramo quede vacío porque el front los DESCARTA en
 * silencio: un `"a||b"` se ve como dos pasos y nadie se entera de que había un
 * tercero mal escrito.
 */
function partirPasos(crudo: string, origen: string): string[] {
  const tramos = crudo.split(SEPARADOR_DE_PASOS);
  const pasos = tramos.map((paso) => paso.trim());
  if (pasos.some((paso) => paso === "")) {
    throw new Error(
      `${origen}: '${CLAVE_DE_PASOS}' tiene un tramo vacío entre separadores '${SEPARADOR_DE_PASOS}'. ` +
        "El front descarta los tramos vacíos sin avisar, así que un paso mal escrito " +
        "desaparecería de la pantalla de espera sin dejar rastro.",
    );
  }
  return pasos;
}

/**
 * Valida un documento de textos ya parseado (separado del disco para poder
 * testearlo construyendo cada escenario).
 */
export function interpretarTextos(crudo: unknown, origen: string): Textos {
  if (!esObjeto(crudo as ValorJson)) {
    throw new Error(`${origen}: el documento de textos no es un objeto JSON`);
  }
  const archivo = crudo as Record<string, ValorJson>;

  // ── La lista cerrada de claves ──────────────────────────────────────────
  const declaradas = archivo["keys"];
  if (!esObjeto(declaradas) || Object.keys(declaradas).length === 0) {
    throw new Error(
      `${origen}: falta 'keys' (o está vacío): es la lista cerrada de claves que la interfaz lee`,
    );
  }

  // ── Los textos ──────────────────────────────────────────────────────────
  const textos = archivo["copy"];
  if (!esObjeto(textos) || Object.keys(textos).length === 0) {
    throw new Error(
      `${origen}: falta 'copy' (o está vacío): es el mapa de textos que se publica`,
    );
  }

  const documento: DocumentoTextos = {};
  const claves = Object.keys(textos).sort();
  for (const clave of claves) {
    const valor = textos[clave];
    if (typeof valor !== "string") {
      throw new Error(
        `${origen}: copy['${clave}'] no es un texto. config/app.copy es un mapa de texto a ` +
          "texto y el navegador lee cada clave como stringValue: cualquier otra cosa se " +
          "ignora y la pantalla se queda con el arranque en frío.",
      );
    }
    if (valor.trim() === "") {
      throw new Error(
        `${origen}: copy['${clave}'] está vacío. Un texto vacío no borra nada: el front lo ` +
          "descarta y muestra el del arranque en frío, así que 'lo dejé vacío a propósito' " +
          "no es una forma de sacar un texto de la interfaz.",
      );
    }
    documento[clave] = valor;
  }

  // ── Que las dos listas coincidan, exactamente ───────────────────────────
  const esperadas = new Set(Object.keys(declaradas));
  const faltantes = [...esperadas].filter((clave) => !(clave in documento)).sort();
  if (faltantes.length > 0) {
    throw new Error(
      `${origen}: 'keys' declara ${faltantes.length} clave(s) que 'copy' no tiene: ` +
        `${faltantes.join(", ")}. La interfaz las espera y se quedaría con el arranque en frío.`,
    );
  }
  const sobrantes = claves.filter((clave) => !esperadas.has(clave));
  if (sobrantes.length > 0) {
    throw new Error(
      `${origen}: 'copy' trae ${sobrantes.length} clave(s) que 'keys' no declara: ` +
        `${sobrantes.join(", ")}. O es un nombre mal tipeado —y el texto nunca se leería—, ` +
        "o es un texto nuevo: en ese caso hay que declararlo en 'keys' Y agregar el campo a " +
        "CopyDeLaApp en apps/web/src/lib/config.ts, que es quien lo lee.",
    );
  }

  // ── Los pasos de la espera ──────────────────────────────────────────────
  const crudoDePasos = documento[CLAVE_DE_PASOS];
  const pasos = crudoDePasos === undefined ? [] : partirPasos(crudoDePasos, origen);

  return { documento, claves, pasos };
}

/** Lee `config/copy.json` de disco y lo valida. */
export function cargarTextos(ruta: string): Textos {
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch (error) {
    throw new Error(`No pude leer los textos en ${ruta}: ${(error as Error).message}`);
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (error) {
    throw new Error(`Los textos en ${ruta} no son JSON válido: ${(error as Error).message}`);
  }
  return interpretarTextos(crudo, ruta);
}
