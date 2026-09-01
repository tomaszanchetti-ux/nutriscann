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
 *
 * (Card 2.5, DT-18: la fuente de verdad ya existe y es `config/copy.json`, que
 * el seeder publica. Este archivo es su ESPEJO BYTE A BYTE del lado del
 * arranque en frío: los dos cambian en el mismo commit, y
 * `kb/seed/src/textos.test.ts` verifica que las dos listas de CLAVES coincidan.
 * Los textos en sí no se comparan a propósito: editar una palabra en Firestore
 * no tiene que obligar a tocar la PWA.)
 *
 * CARD 3.1 — 29 CLAVES NUEVAS (DT-22). Los sellos de match, los nombres de los
 * nutrientes, las etiquetas de la card de ítem y los títulos de los dos
 * recuadros del reporte estaban ESCRITOS ADENTRO DE LOS COMPONENTES: cambiar
 * "Coincidencia aproximada" exigía desplegar la PWA. La línea de qué se movió y
 * qué no —frases fijas sí, frases armadas con datos no— está escrita en
 * `dt22_note` de `config/copy.json`, que es donde la va a leer quien edite.
 *
 * CARD 3.4 — LA PASADA DE ESPAÑA (DT-21). Los textos de abajo cambiaron de
 * palabras, no de claves: se fue el voseo ("Sacá"→"Haz", "Probás"→"Prueba",
 * "Acá"→"Aquí"), se hace una foto en vez de sacarla, y la jerga interna —"ficha",
 * "catálogo"— salió de los cinco tooltips de match y del cuerpo del reporte sin
 * totales: en pantalla eso se llama "la base nutricional", igual que en los
 * pasos de la espera. El detalle de qué se cambió y qué quedó pendiente vive en
 * `dt21_note` de `config/copy.json`; los dos archivos siguen espejados byte a
 * byte.
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

  // — Nuevas de la card 3.1 (DT-22): estaban escritas adentro de los componentes —
  //
  // Los nombres de los nutrientes son UNO SOLO para toda la app: el donut, los
  // dos recuadros y el aviso de total parcial dicen "Grasas saturadas" con las
  // mismas letras porque leen la misma clave. Antes había tres listas paralelas.
  nutrient_protein: string;
  nutrient_carbs: string;
  nutrient_fat: string;
  nutrient_fiber: string;
  nutrient_sat_fat: string;
  nutrient_sugars: string;
  nutrient_sodium: string;
  /** Lo que va donde iría un número que la fuente no declara. NUNCA un cero. */
  nutrient_no_data: string;

  donut_unexplained: string;
  donut_detail_title: string;
  donut_rest: string;

  match_exacto: string;
  match_exacto_ayuda: string;
  match_alias: string;
  match_alias_ayuda: string;
  match_difuso: string;
  match_difuso_ayuda: string;
  match_compuesto: string;
  match_compuesto_ayuda: string;
  match_no_catalogado: string;
  match_no_catalogado_ayuda: string;

  item_confidence_label: string;
  item_generic_badge: string;
  item_generic_note: string;
  item_source_label: string;

  report_no_totals_title: string;
  report_no_totals_body: string;
  report_others_title: string;
  report_weight_label: string;
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
  capture_cta: "Hacer foto del plato",
  error_not_food: "Eso no parece un plato de comida. ¿Probamos con otra foto?",
  error_unreadable: "No pude reconocer el plato. Prueba con más luz.",

  capture_help: "Haz la foto desde arriba, con el plato entero y buena luz.",
  scanning_title: "Mirando tu plato",
  report_kcal_label: "calorías del plato",
  report_macros_title: "Componente nutricional de tu plato",
  report_items_title: "Qué hay en el plato",
  report_partial_title: "Este total es parcial",
  report_cta: "Escanear otro plato",
  not_food_title: "Aquí no veo comida",
  error_title: "No pude analizar la foto",
  error_network: "No hay respuesta del servidor. Revisa tu conexión y prueba de nuevo.",
  error_unexpected: "Algo salió mal de este lado. Prueba de nuevo en un momento.",
  error_cta: "Probar de nuevo",
  disclaimer:
    "Información nutricional orientativa, calculada sobre datos de USDA. No es consejo médico.",

  nutrient_protein: "Proteínas",
  nutrient_carbs: "Hidratos de carbono",
  nutrient_fat: "Grasas",
  nutrient_fiber: "Fibra",
  nutrient_sat_fat: "Grasas saturadas",
  nutrient_sugars: "Azúcares",
  nutrient_sodium: "Sodio",
  nutrient_no_data: "sin dato",

  donut_unexplained: "Sin explicar",
  donut_detail_title: "Dentro de cada macronutriente",
  donut_rest: "El resto",

  match_exacto: "Coincidencia exacta",
  match_exacto_ayuda:
    "El nombre identificado en la foto coincide, letra por letra, con un alimento de la base nutricional.",
  match_alias: "Por sinónimo",
  match_alias_ayuda:
    "Se llegó al alimento por un sinónimo revisado a mano, con su propia confianza.",
  match_difuso: "Coincidencia aproximada",
  match_difuso_ayuda:
    "No hubo un nombre exacto: se usó el alimento más parecido de la base nutricional. Es una estimación, no una medición de ESTE plato.",
  match_compuesto: "Compuesto en el momento",
  match_compuesto_ayuda:
    "La base nutricional no tiene este plato: se sumó a partir de sus ingredientes visibles y del método de cocción.",
  match_no_catalogado: "No catalogado",
  match_no_catalogado_ayuda:
    "La base nutricional no tiene este alimento. No se muestran números: sin un dato de origen, no habría forma de decir de dónde sale.",

  item_confidence_label: "Confianza",
  item_generic_badge: "genérico",
  item_generic_note:
    "Ficha genérica: el valor es el promedio de una familia de productos, no la medición de este plato.",
  item_source_label: "Fuente",

  report_no_totals_title: "Sin números para este plato",
  report_no_totals_body:
    "Ninguno de los alimentos identificados está en la base nutricional, así que no hay nada que sumar. Abajo está lo que sí se reconoció.",
  report_others_title: "Del resto del análisis",
  report_weight_label: "Peso identificado",
};

/**
 * Los micro-textos de la espera, de arranque en frío. Son VERDAD: cada uno es un
 * paso REAL del circuito de `functions/src/analyze/handler.ts`, en su orden real
 * (ver el mapeo completo en la cabecera de `PantallaEscaneo`):
 *
 *   1. `pedirVision()`      — la única llamada al modelo: nombres, gramos y
 *                             confianza. Su schema NO tiene calorías.
 *   2. `buscarConDosNombres()` — cada alimento contra el catálogo: exacto →
 *                             alias → difuso, en español y en inglés.
 *   3. `escalar()` + `sumarTotales()` — gramos × valores por 100 g de la ficha,
 *                             y la compuerta que decide si hay total.
 *
 * SON TRES Y NO CUATRO, y no por gusto: `kb/seed/src/textos.test.ts` fija
 * `pasos.length === 3`. Sumar "Preparando la foto…" —que sería verdad mientras
 * el navegador la achica— es un cambio de las dos puntas, con ese candado.
 *
 * Espejo byte a byte de `config/copy.json`: los dos cambian en el mismo commit.
 */
export const PASOS_DE_ESCANEO_DE_ARRANQUE: string[] = [
  "Identificando qué hay en el plato y cuánto…",
  "Buscando cada alimento en la base nutricional…",
  "Calculando calorías y macros con esos gramos…",
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
