/**
 * Lectura y validación de los umbrales de la interfaz (`config/thresholds.json`).
 *
 * Hermano de `textos.ts`, y por el MISMO motivo por el que aquel valida: un
 * umbral que no llega no rompe nada visible. El front trae su arranque en frío
 * (`apps/web/src/lib/config.ts`), así que un nombre mal tipeado acá deja la
 * pantalla pintando con el número viejo del código — la regla dura n.º 1 rota
 * **en silencio**, que es la forma más cara de romperla.
 *
 * Por eso el archivo declara su lista CERRADA de claves (`keys`) y acá se
 * verifica que `thresholds` tenga exactamente esas: ni una de menos —un umbral
 * que la interfaz espera y nunca se sembró— ni una de más —uno que nadie lee.
 *
 * LA DIFERENCIA CON LOS TEXTOS ES EL TIPO. `config/app.copy` es un mapa de texto
 * a texto; `config/app.thresholds` es un mapa de texto a NÚMERO. Por eso este
 * archivo rechaza lo que no sea un número finito, y a propósito NO acepta un
 * número escrito como texto (`"400"`): del otro lado el navegador lo lee como
 * `integerValue`/`doubleValue`, y un `stringValue` se descartaría sin avisar.
 *
 * Lo que este archivo NO hace: no opina sobre el VALOR. No dice si 400 mg es
 * mucho o poco. Los umbrales son configuración: el seed los publica tal cual.
 * Quien sí opina —y compara este número con el de la curación— es el candado de
 * `umbrales.test.ts`.
 */
import { readFileSync } from "node:fs";

import type { ValorJson } from "./valores";

/** El mapa que se publica: clave → número. Nada más entra en `config/app.thresholds`. */
export type DocumentoUmbrales = Record<string, number>;

/** Lo que el seed necesita saber de los umbrales para publicarlos y reportarlos. */
export interface Umbrales {
  /** El mapa `thresholds` del archivo: exactamente esto se publica. */
  documento: DocumentoUmbrales;
  /** Las claves, ordenadas alfabéticamente. */
  claves: string[];
}

function esObjeto(valor: ValorJson | undefined): valor is Record<string, ValorJson> {
  return valor !== null && valor !== undefined && typeof valor === "object" && !Array.isArray(valor);
}

/**
 * Valida un documento de umbrales ya parseado (separado del disco para poder
 * testearlo construyendo cada escenario).
 */
export function interpretarUmbrales(crudo: unknown, origen: string): Umbrales {
  if (!esObjeto(crudo as ValorJson)) {
    throw new Error(`${origen}: el documento de umbrales no es un objeto JSON`);
  }
  const archivo = crudo as Record<string, ValorJson>;

  // ── La lista cerrada de claves ──────────────────────────────────────────
  const declaradas = archivo["keys"];
  if (!esObjeto(declaradas) || Object.keys(declaradas).length === 0) {
    throw new Error(
      `${origen}: falta 'keys' (o está vacío): es la lista cerrada de umbrales que la interfaz lee`,
    );
  }

  // ── Los umbrales ────────────────────────────────────────────────────────
  const valores = archivo["thresholds"];
  if (!esObjeto(valores) || Object.keys(valores).length === 0) {
    throw new Error(
      `${origen}: falta 'thresholds' (o está vacío): es el mapa de umbrales que se publica`,
    );
  }

  const documento: DocumentoUmbrales = {};
  const claves = Object.keys(valores).sort();
  for (const clave of claves) {
    const valor = valores[clave];
    if (typeof valor !== "number" || !Number.isFinite(valor)) {
      throw new Error(
        `${origen}: thresholds['${clave}'] no es un número finito. config/app.thresholds es un ` +
          "mapa de texto a número y el navegador lee cada clave como integerValue o doubleValue: " +
          'cualquier otra cosa —un "400" entre comillas, incluido— se ignora y la pantalla se ' +
          "queda con el arranque en frío.",
      );
    }
    documento[clave] = valor;
  }

  // ── Que las dos listas coincidan, exactamente ───────────────────────────
  const esperadas = new Set(Object.keys(declaradas));
  const faltantes = [...esperadas].filter((clave) => !(clave in documento)).sort();
  if (faltantes.length > 0) {
    throw new Error(
      `${origen}: 'keys' declara ${faltantes.length} umbral(es) que 'thresholds' no tiene: ` +
        `${faltantes.join(", ")}. La interfaz los espera y se quedaría con el arranque en frío.`,
    );
  }
  const sobrantes = claves.filter((clave) => !esperadas.has(clave));
  if (sobrantes.length > 0) {
    throw new Error(
      `${origen}: 'thresholds' trae ${sobrantes.length} umbral(es) que 'keys' no declara: ` +
        `${sobrantes.join(", ")}. O es un nombre mal tipeado —y el umbral nunca se leería—, o es ` +
        "uno nuevo: en ese caso hay que declararlo en 'keys' Y agregar el campo a " +
        "UmbralesDeLaApp en apps/web/src/lib/config.ts, que es quien lo lee.",
    );
  }

  return { documento, claves };
}

/** Lee `config/thresholds.json` de disco y lo valida. */
export function cargarUmbrales(ruta: string): Umbrales {
  let texto: string;
  try {
    texto = readFileSync(ruta, "utf8");
  } catch (error) {
    throw new Error(`No pude leer los umbrales en ${ruta}: ${(error as Error).message}`);
  }
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (error) {
    throw new Error(`Los umbrales en ${ruta} no son JSON válido: ${(error as Error).message}`);
  }
  return interpretarUmbrales(crudo, ruta);
}
