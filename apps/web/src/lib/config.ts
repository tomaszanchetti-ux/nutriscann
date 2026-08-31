/**
 * La configuración de la interfaz, leída de Firestore.
 *
 * REGLA DURA 1 DEL PROYECTO: nada hardcodeado. Todo texto que el usuario lee
 * vive en `config/app` y se cambia sin desplegar. Las reglas de Firestore ya
 * permiten la lectura pública de `config/{docId}` (ver `firestore.rules`), así
 * que el navegador lo lee directo: no hace falta un endpoint para servir texto.
 *
 * Se lee por la API REST y no con el SDK de Firestore — el motivo, medido en
 * kilobytes, está en `firestoreDocUrl()` en `./firebase`.
 *
 * Los valores de este archivo NO son la configuración: son el ARRANQUE EN FRÍO,
 * lo mínimo para que la pantalla no salga vacía si el documento todavía no trae
 * un texto. Igual que en `functions/src/config.ts`, el resultado declara cuál de
 * los dos casos ocurrió (`origen`) para que "está usando defaults" nunca se
 * confunda con "está configurado" — y el pie de la pantalla lo muestra.
 *
 * ---------------------------------------------------------------------------
 * EL CONTRATO, MEDIDO CONTRA LO QUE HAY PUBLICADO (31/08/2026)
 *
 * `config/app.copy` es un `Record<string,string>` (mismo campo que lee el
 * backend en `functions/src/config.ts`) y la Fase 0 ya sembró CINCO claves:
 *
 *   capture_prompt · capture_cta · error_not_food · error_unreadable ·
 *   scanning_steps
 *
 * Esas cinco se usan con el nombre que YA TIENEN. No se renombró ninguna: un
 * texto publicado que deja de leerse porque el código le cambió el nombre es la
 * regla dura 1 rota en silencio.
 *
 * `scanning_steps` viaja como UN SOLO STRING con los pasos separados por `|`,
 * y no como lista, porque `copy` es un mapa de textos y una lista no entra ahí.
 * Se parte acá. La forma la fijó lo publicado, no esta card.
 *
 * Las demás claves de abajo son NUEVAS: las pide el reporte, que en la Fase 0
 * no existía. Hoy salen del arranque en frío. Sembrarlas es una deuda de la
 * card 2.3, declarada en su informe: el seeder de `kb/seed` gobierna cuatro
 * campos de `config/app` y `copy` NO es uno de ellos, así que el repo todavía
 * no tiene la fuente de verdad de estos textos.
 * ------------------------------------------------------------------------- */
import { firestoreDocUrl } from "./firebase";

/** Las claves de texto que la interfaz usa. Cambiar una acá es cambiar el contrato. */
export interface CopyDeLaApp {
  // — Ya publicadas en Firestore desde la Fase 0 —
  capture_prompt: string;
  capture_cta: string;
  error_not_food: string;
  error_unreadable: string;

  // — Nuevas de la card 2.3: hoy salen del arranque en frío —
  capture_help: string;
  scanning_title: string;
  report_kcal_label: string;
  report_macros_title: string;
  report_items_title: string;
  report_partial_title: string;
  report_cta: string;
  not_food_title: string;
  error_title: string;
  error_network: string;
  error_unexpected: string;
  error_cta: string;
  disclaimer: string;
}

export type ClaveDeCopy = keyof CopyDeLaApp;

/** La clave, dentro de `copy`, donde viven los pasos de la espera. */
const CLAVE_DE_PASOS = "scanning_steps";

/** Lo que separa un paso del siguiente en esa clave. */
const SEPARADOR_DE_PASOS = "|";

/**
 * Arranque en frío. No es la configuración: es lo que se muestra mientras la
 * configuración no llega. Las cuatro primeras están publicadas y estos valores
 * casi nunca se usan; las demás se usan siempre, hasta que se siembren.
 */
export const COPY_DE_ARRANQUE: CopyDeLaApp = {
  capture_prompt: "¿Qué estás comiendo?",
  capture_cta: "Sacar foto del plato",
  error_not_food: "Eso no parece un plato de comida. ¿Probamos con otra foto?",
  error_unreadable: "No pude reconocer el plato. ¿Probás con más luz?",

  capture_help: "Sacá la foto desde arriba, con el plato entero y buena luz.",
  scanning_title: "Mirando tu plato",
  report_kcal_label: "calorías del plato",
  report_macros_title: "De dónde vienen esas calorías",
  report_items_title: "Qué hay en el plato",
  report_partial_title: "Este total es parcial",
  report_cta: "Escanear otro plato",
  not_food_title: "Acá no veo comida",
  error_title: "No pude analizar la foto",
  error_network: "No hay respuesta del servidor. Revisá tu conexión y probá de nuevo.",
  error_unexpected: "Algo salió mal de este lado. Probá de nuevo en un momento.",
  error_cta: "Probar de nuevo",
  disclaimer:
    "Información nutricional orientativa, calculada sobre datos de USDA. No es consejo médico.",
};

/**
 * Los micro-textos de la espera, de arranque en frío. Son VERDAD: mapean a los
 * pasos reales del motor (visión → catálogo → aritmética), no a una animación
 * decorativa. Los publicados dicen casi lo mismo, y ganan ellos.
 */
export const PASOS_DE_ESCANEO_DE_ARRANQUE: string[] = [
  "Identificando ingredientes…",
  "Consultando la base nutricional…",
  "Calculando calorías y macros…",
];

export type OrigenDeConfig = "firestore" | "arranque-en-frio";

export interface ConfigDeLaApp {
  copy: CopyDeLaApp;
  scanning_steps: string[];
  origen: OrigenDeConfig;
  /** Qué pasó, cuando el origen es el arranque en frío. */
  detalle: string | null;
}

export const CONFIG_DE_ARRANQUE: ConfigDeLaApp = {
  copy: COPY_DE_ARRANQUE,
  scanning_steps: PASOS_DE_ESCANEO_DE_ARRANQUE,
  origen: "arranque-en-frio",
  detalle: null,
};

// ---------------------------------------------------------------------------
// La API REST de Firestore envuelve cada valor en su tipo: un texto llega como
// `{ stringValue: "…" }` y un mapa como `{ mapValue: { fields: {…} } }`. Estas
// dos funciones desenvuelven SOLO lo que este archivo necesita —texto y mapa de
// textos— y devuelven `null` ante cualquier otra forma. No es un decodificador
// general de Firestore y no pretende serlo.
// ---------------------------------------------------------------------------

type ValorRest = Record<string, unknown>;

function comoTexto(valor: unknown): string | null {
  if (typeof valor !== "object" || valor === null) return null;
  const texto = (valor as ValorRest).stringValue;
  return typeof texto === "string" ? texto : null;
}

function comoMapa(valor: unknown): Record<string, unknown> | null {
  if (typeof valor !== "object" || valor === null) return null;
  const mapa = (valor as ValorRest).mapValue;
  if (typeof mapa !== "object" || mapa === null) return null;
  const campos = (mapa as ValorRest).fields;
  return typeof campos === "object" && campos !== null ? (campos as Record<string, unknown>) : {};
}

/** Se queda solo con las claves del contrato que llegaron como texto no vacío. */
function fusionarCopy(publicado: Record<string, unknown> | null): {
  copy: CopyDeLaApp;
  leidas: number;
} {
  const copy = { ...COPY_DE_ARRANQUE };
  if (publicado === null) return { copy, leidas: 0 };

  let leidas = 0;
  for (const clave of Object.keys(COPY_DE_ARRANQUE) as ClaveDeCopy[]) {
    const texto = comoTexto(publicado[clave]);
    if (texto !== null && texto.trim() !== "") {
      copy[clave] = texto;
      leidas += 1;
    }
  }
  return { copy, leidas };
}

/** Parte `"uno|dos|tres"` en tres pasos. Vacío ⇒ `null`, y mandan los de arranque. */
function leerPasos(publicado: Record<string, unknown> | null): string[] | null {
  if (publicado === null) return null;
  const crudo = comoTexto(publicado[CLAVE_DE_PASOS]);
  if (crudo === null) return null;
  const pasos = crudo
    .split(SEPARADOR_DE_PASOS)
    .map((paso) => paso.trim())
    .filter((paso) => paso !== "");
  return pasos.length > 0 ? pasos : null;
}

/**
 * Lee `config/app`. Nunca rechaza: si Firestore no contesta, la app arranca con
 * los textos de arriba y lo dice. Un texto que no llegó no puede dejar al
 * usuario mirando una pantalla en blanco.
 */
export async function cargarConfig(signal?: AbortSignal): Promise<ConfigDeLaApp> {
  try {
    const res = await fetch(firestoreDocUrl("config", "app"), { signal });
    if (res.status === 404) {
      return { ...CONFIG_DE_ARRANQUE, detalle: "config/app todavía no existe" };
    }
    if (!res.ok) {
      return { ...CONFIG_DE_ARRANQUE, detalle: `Firestore respondió ${res.status}` };
    }

    const documento = (await res.json()) as { fields?: Record<string, unknown> };
    const publicado = comoMapa(documento.fields?.copy);
    const { copy, leidas } = fusionarCopy(publicado);
    const pasos = leerPasos(publicado);

    return {
      copy,
      scanning_steps: pasos ?? PASOS_DE_ESCANEO_DE_ARRANQUE,
      origen: leidas > 0 ? "firestore" : "arranque-en-frio",
      detalle:
        leidas > 0
          ? `${leidas} de ${Object.keys(COPY_DE_ARRANQUE).length} textos publicados`
          : "config/app existe pero no trae textos",
    };
  } catch (err) {
    return {
      ...CONFIG_DE_ARRANQUE,
      detalle: err instanceof Error ? err.message : "no se pudo leer config/app",
    };
  }
}
