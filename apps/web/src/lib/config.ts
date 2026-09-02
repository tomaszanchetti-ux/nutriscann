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
 *
 * WS08 — 14 CLAVES NUEVAS (`v2_*`): la sección «Funcionalidades Premium» de la
 * vitrina premium. Es la primera parte de esa pantalla cuyos textos viven acá y
 * no en `copy.premium.ts`, porque son todas frases fijas. Lo que dicen —y las
 * reglas que no se pueden romper al editarlas: sin precio y objetivos solo de
 * forma física— está en `v2_note` de `config/copy.json`.
 *
 * Nacieron 17 y quedaron 14: el Q/A de Tomás (02/09/2026) sacó el párrafo de
 * entrada (`v2_intro`) y el pie de la sección (`v2_nota`), y convirtió el sello
 * (`v2_badge`) en estructura — cada tarjeta muestra el NOMBRE DE SU PLAN, que
 * sale de los planes de `copy.premium.ts` y no de un texto publicado.
 *
 * CARD 4.5 — 39 CLAVES NUEVAS Y 5 QUE SE VAN (DT-41 b y c), y el contrato deja
 * de ser solo de este archivo.
 *
 * ENTRARON `capture_tagline`, `report_cta_premium` y LA PANTALLA DE PLANES
 * ENTERA (`plans_*` y `plan_*`): los tres planes con su precio, su cupo y sus
 * viñetas vivían escritos en `copy.premium.ts`, así que cambiar 12 € por 15 €
 * exigía desplegar la PWA. Ahora el texto sale de acá y en aquel módulo se queda
 * la estructura — qué plan es el actual, cuál va destacado, a qué etiqueta de la
 * lista de espera apunta cada botón.
 *
 * SALIERON CINCO HUÉRFANAS: `donut_detail_title`, `report_others_title` y
 * `report_weight_label`, que el Q/A del 01/09 dejó sin pantalla, y
 * `donut_unexplained` y `donut_rest`, que se quedaron sin lector cuando el donut
 * volvió al anillo simple. Una clave que nadie lee no es inofensiva: promete que
 * editarla cambia algo.
 *
 * Y OJO CON EL CONTRATO: desde esta card `config/copy.json` tiene OCHO CLAVES
 * MÁS que esta interfaz —los mensajes de error del backend, que lee
 * `functions/src/analyze/errores.ts`—. El candado de `kb/seed/src/textos.test.ts`
 * ya no compara contra `CopyDeLaApp` a secas, sino contra la UNIÓN de los dos
 * lectores. Agregar acá un campo que nadie siembra sigue fallando igual.
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
  /** La línea que cierra la promesa, debajo del círculo de la captura. */
  capture_tagline: string;
  // — El aviso de instalación de la PWA (Q/A del 02/09, card 3.5) —
  install_title: string;
  install_ios_help: string;
  install_android_cta: string;
  scanning_title: string;
  report_kcal_label: string;
  report_macros_title: string;
  report_items_title: string;
  report_partial_title: string;
  report_cta: string;
  /** El segundo botón del reporte: el que lleva a la vitrina. */
  report_cta_premium: string;
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

  // — Nuevas de la WS08: la sección «Funcionalidades Premium» de la vitrina —
  //
  // Son los PRIMEROS textos de la vitrina premium que viajan por acá. El resto
  // sigue en `copy.premium.ts` hasta la card 3.5 (ver la cabecera de ese
  // archivo): esta sección entra bien porque es toda frases fijas, sin un solo
  // número armado con datos.
  //
  // NINGUNA de estas claves lleva un precio, y no es un olvido: los dos
  // escalones de la v2 se muestran SIN precio. La escalera que sí lo tiene
  // —0 € / 12 € al año / 4,99 € al mes, con 15 / 40 / 150 fotos al mes— es la de
  // los tres planes de `PLANES`, y esta sección no la toca.
  //
  // TAMPOCO lleva el sello de cada tarjeta: desde el Q/A del 02/09/2026 es el
  // nombre del plan al que apunta, y ese nombre ya vive en `PLANES`. Un texto
  // que se puede deducir de otro no se publica dos veces.
  v2_title: string;

  v2_premium_titulo: string;
  v2_premium_vinculo: string;
  v2_premium_resumen: string;
  v2_premium_punto_1: string;
  v2_premium_punto_2: string;
  v2_premium_punto_3: string;

  v2_gold_titulo: string;
  v2_gold_vinculo: string;
  v2_gold_resumen: string;
  v2_gold_punto_1: string;
  v2_gold_punto_2: string;
  v2_gold_punto_3: string;

  v2_cta: string;

  // — Nuevas de la card 4.5 (DT-41 b): LA PANTALLA DE PLANES ENTERA —
  //
  // Los tres planes vivían escritos en `PLANES` (`copy.premium.ts`), o sea que
  // cambiar 12 € por 15 € exigía desplegar la PWA. Ahora el TEXTO sale de acá y
  // en ese módulo se queda solo la ESTRUCTURA: cuál es el plan actual, cuál va
  // destacado y a qué etiqueta de la lista de espera apunta cada botón. Es el
  // mismo reparto que la sección `v2_` ya usaba desde la WS08.
  //
  // LA REGLA DE LOS CUPOS NO SE PUEDE ROMPER AL EDITARLOS (Tomás, 01/09/2026,
  // `docs/PLAN.md` §6.7): el cupo que se comunica es SIEMPRE el mensual, nunca
  // un "X al día". Y la publicidad se nombra como un hecho de la app —no la hay
  // en ningún plan—, jamás como un beneficio de pagar.
  plans_title: string;
  plans_note_quota: string;
  plans_note_ads: string;
  plans_note_payments: string;
  plans_gold_highlight_title: string;
  plans_gold_highlight_body: string;

  plan_free_name: string;
  plan_free_price: string;
  plan_free_period: string;
  plan_free_quota: string;
  plan_free_summary: string;
  plan_free_point_1: string;
  plan_free_point_2: string;
  plan_free_point_3: string;
  plan_free_cta: string;

  plan_premium_name: string;
  plan_premium_price: string;
  plan_premium_period: string;
  plan_premium_quota: string;
  plan_premium_summary: string;
  plan_premium_point_1: string;
  plan_premium_point_2: string;
  plan_premium_point_3: string;
  /** ⚠️ Dice lo mismo, letra por letra, que `v2_premium_titulo`. A propósito. */
  plan_premium_point_4: string;
  plan_premium_cta: string;
  plan_premium_badge: string;

  plan_gold_name: string;
  plan_gold_price: string;
  plan_gold_period: string;
  plan_gold_quota: string;
  plan_gold_summary: string;
  plan_gold_point_1: string;
  plan_gold_point_2: string;
  plan_gold_point_3: string;
  plan_gold_point_4: string;
  plan_gold_cta: string;
  plan_gold_badge: string;
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
  capture_tagline: "Y obtén el detalle nutricional de tu comida",
  install_title: "Lleva CaliScan en tu pantalla de inicio",
  install_ios_help: "En Safari: toca Compartir y elige «Añadir a pantalla de inicio».",
  install_android_cta: "Instalar aplicación",
  scanning_title: "Mirando tu plato",
  report_kcal_label: "calorías del plato",
  report_macros_title: "Componente nutricional de tu plato",
  report_items_title: "Qué hay en el plato",
  report_partial_title: "Este total es parcial",
  report_cta: "Escanear otro plato",
  report_cta_premium: "Pasarte a Premium",
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

  v2_title: "Funcionalidades Premium",

  v2_premium_titulo: "Fichas, recetas y tendencias",
  v2_premium_vinculo: "Llega al plan Premium",
  v2_premium_resumen: "Más contexto en cada plato, y la foto completa de cómo comes.",
  v2_premium_punto_1: "Fichas de alimentos con su fuente USDA, dato a dato.",
  v2_premium_punto_2: "Recetas por categoría: qué comer antes y después de entrenar.",
  v2_premium_punto_3: "Tendencias de tus comidas, por semana y por mes.",

  v2_gold_titulo: "Tu plan personalizado",
  v2_gold_vinculo: "Llega a Premium Gold",
  v2_gold_resumen:
    "Deja de improvisar: qué comer cada día, según lo que entrenas y hacia dónde vas.",
  v2_gold_punto_1: "Planes de 1 semana, 15 días o 1 mes.",
  v2_gold_punto_2: "Según tu objetivo: bajar de peso, tonificar o ganar masa muscular.",
  v2_gold_punto_3: "Ajustados a tu entrenamiento y a tu perfil.",

  v2_cta: "Lista de espera",

  plans_title: "Nuestros Planes",
  plans_note_quota:
    "Todos los cupos son mensuales: el número que ves es el que tienes cada mes. Hay un límite diario interno para evitar ráfagas, pero lo que se te garantiza es el mensual.",
  plans_note_ads: "En CaliScan no hay publicidad. En ningún plan, tampoco en el gratuito.",
  plans_note_payments:
    "Los pagos todavía no están abiertos. Esta pantalla es la vitrina de lo que viene: no se te va a cobrar nada ni se te van a pedir datos de pago.",
  plans_gold_highlight_title: "Plan de dieta diario según tu rutina",
  plans_gold_highlight_body:
    "Carga tus datos personales y rutina diaria para obtener sugerencias alimentarias customizadas según tu perfil",

  plan_free_name: "Gratuito",
  plan_free_price: "0 €",
  plan_free_period: "para siempre",
  plan_free_quota: "15 fotos al mes",
  plan_free_summary: "El reporte completo de cada plato que fotografíes.",
  plan_free_point_1: "Calorías, macros y el desglose de cada alimento",
  plan_free_point_2: "Cada número trazable a su fuente en la base nutricional",
  plan_free_point_3: "Sin publicidad",
  plan_free_cta: "Tu plan actual",

  plan_premium_name: "Premium",
  plan_premium_price: "12 €",
  plan_premium_period: "al año, en un solo pago",
  plan_premium_quota: "40 fotos al mes",
  plan_premium_summary: "Casi tres veces el cupo, y nada de lo que escaneas se pierde.",
  plan_premium_point_1: "Todo lo del plan Gratuito",
  plan_premium_point_2: "40 fotos al mes",
  plan_premium_point_3: "Historial completo",
  plan_premium_point_4: "Fichas, recetas y tendencias",
  plan_premium_cta: "Lista de espera",
  plan_premium_badge: "Un pago al año",

  plan_gold_name: "Premium Gold",
  plan_gold_price: "4,99 €",
  plan_gold_period: "al mes",
  plan_gold_quota: "150 fotos al mes",
  plan_gold_summary: "Plan completo para alinear tus comidas con tu rutina diaria",
  plan_gold_point_1: "Todo lo del Premium",
  plan_gold_point_2: "150 fotos al mes",
  plan_gold_point_3: "Sugerencia de dietas diarias según rutina",
  plan_gold_point_4: "Armado de perfil personal completo",
  plan_gold_cta: "Lista de espera",
  plan_gold_badge: "El plan completo",
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

/**
 * LOS UMBRALES NUMÉRICOS DE LA INTERFAZ (DT-41 a, card 4.5).
 *
 * Hermanos del `copy` y por el mismo motivo: son decisiones de producto que la
 * pantalla aplica, no constantes de programa, así que viven en `config/app` y se
 * cambian sin desplegar. Viajan en su PROPIO campo (`config/app.thresholds`) y
 * no dentro de `copy`, porque `copy` es un mapa de texto a texto y un número ahí
 * adentro rompería su contrato.
 *
 * La fuente de verdad es `config/thresholds.json`; esto es el ARRANQUE EN FRÍO,
 * espejado byte a byte con ese archivo. Y hay un tercer espejo, que es el que da
 * sentido a todo esto: `kb/seed/src/umbrales.test.ts` verifica que
 * `sodium_high_mg_per_100g` sea EXACTAMENTE el `umbral_sodio_mg` de la DT-13
 * (`kb/curation/genericos.dt13.json`). Hasta esta card el número estaba copiado
 * a mano en `ItemDelPlato.tsx` y subirlo en la curación no cambiaba la pantalla:
 * el catálogo avisaba por un alimento que la app no pintaba.
 */
export interface UmbralesDeLaApp {
  /**
   * Desde qué sodio POR 100 g un alimento se pinta como salado.
   *
   * Se mide sobre `per_100g` y NUNCA sobre el valor escalado: es la diferencia
   * entre "este alimento es salado" y "de este alimento hay mucho en el plato".
   */
  sodium_high_mg_per_100g: number;
}

/** Arranque en frío de los umbrales. Espejo de `config/thresholds.json`. */
export const UMBRALES_DE_ARRANQUE: UmbralesDeLaApp = {
  sodium_high_mg_per_100g: 400,
};

export type OrigenDeConfig = "firestore" | "arranque-en-frio";

export interface ConfigDeLaApp {
  copy: CopyDeLaApp;
  umbrales: UmbralesDeLaApp;
  scanning_steps: string[];
  origen: OrigenDeConfig;
  /** Qué pasó, cuando el origen es el arranque en frío. */
  detalle: string | null;
}

export const CONFIG_DE_ARRANQUE: ConfigDeLaApp = {
  copy: COPY_DE_ARRANQUE,
  umbrales: UMBRALES_DE_ARRANQUE,
  scanning_steps: PASOS_DE_ESCANEO_DE_ARRANQUE,
  origen: "arranque-en-frio",
  detalle: null,
};

/**
 * LOS UMBRALES VIGENTES, para quien no los recibe por props.
 *
 * `cargarConfig()` corre UNA vez, al montar la app, y deja acá lo que leyó. Es
 * una copia de lectura, no un segundo estado: nadie más la escribe, y todo lo
 * que la lee se dibuja mucho después (el reporte necesita una foto y un
 * escaneo). No reemplaza al paso por props —`ConfigDeLaApp.umbrales` está ahí
 * para eso, y es el camino preferido— sino que le da salida a los componentes
 * que quedan lejos del punto donde la configuración entra al árbol.
 *
 * Por qué existe: el umbral lo usa `ItemDelPlato`, que está tres niveles por
 * debajo de donde vive la configuración, y hacer bajar un valor tres pisos por
 * props para un único consumidor cuesta más de lo que aclara. El día que haya
 * varios, el paso por props ya está declarado y esta salida se retira.
 */
let umbralesVigentes: UmbralesDeLaApp = UMBRALES_DE_ARRANQUE;

/** Los umbrales que la app está usando: los publicados, o los de arranque. */
export function umbralesPublicados(): UmbralesDeLaApp {
  return umbralesVigentes;
}

// ---------------------------------------------------------------------------
// La API REST de Firestore envuelve cada valor en su tipo: un texto llega como
// `{ stringValue: "…" }`, un mapa como `{ mapValue: { fields: {…} } }` y un
// número como `{ integerValue: "400" }` o `{ doubleValue: 1.5 }` según cómo se
// escribió. Estas tres funciones desenvuelven SOLO lo que este archivo necesita
// —texto, número y mapa— y devuelven `null` ante cualquier otra forma. No es un
// decodificador general de Firestore y no pretende serlo.
// ---------------------------------------------------------------------------

type ValorRest = Record<string, unknown>;

function comoTexto(valor: unknown): string | null {
  if (typeof valor !== "object" || valor === null) return null;
  const texto = (valor as ValorRest).stringValue;
  return typeof texto === "string" ? texto : null;
}

/**
 * Un número, venga como `integerValue` (que Firestore manda COMO TEXTO, porque
 * un int64 no entra en un `number` de JSON) o como `doubleValue`.
 *
 * Se rechaza lo que no sea finito: un `NaN` o un infinito publicados dejarían la
 * comparación del umbral siempre en falso y nadie se enteraría.
 */
function comoNumero(valor: unknown): number | null {
  if (typeof valor !== "object" || valor === null) return null;
  const crudo = (valor as ValorRest).integerValue ?? (valor as ValorRest).doubleValue;
  if (typeof crudo !== "string" && typeof crudo !== "number") return null;
  const numero = Number(crudo);
  return Number.isFinite(numero) ? numero : null;
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

/** Se queda solo con los umbrales del contrato que llegaron como número finito. */
function fusionarUmbrales(publicado: Record<string, unknown> | null): {
  umbrales: UmbralesDeLaApp;
  leidos: number;
} {
  const umbrales = { ...UMBRALES_DE_ARRANQUE };
  if (publicado === null) return { umbrales, leidos: 0 };

  let leidos = 0;
  for (const clave of Object.keys(UMBRALES_DE_ARRANQUE) as (keyof UmbralesDeLaApp)[]) {
    const numero = comoNumero(publicado[clave]);
    if (numero !== null) {
      umbrales[clave] = numero;
      leidos += 1;
    }
  }
  return { umbrales, leidos };
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
 *
 * EL `origen` LO DECIDEN LOS TEXTOS, no los umbrales, y es a propósito: es lo
 * que muestra el pie de diagnóstico, y ahí "está usando defaults" significa que
 * lo que se LEE en pantalla no salió de la configuración. Un umbral que no llegó
 * cambia un color, no una palabra.
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
    const { umbrales } = fusionarUmbrales(comoMapa(documento.fields?.thresholds));
    const pasos = leerPasos(publicado);

    // La copia de lectura, para quien no recibe los umbrales por props. Se
    // escribe UNA vez, acá, y antes de que se dibuje cualquier reporte.
    umbralesVigentes = umbrales;

    return {
      copy,
      umbrales,
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
