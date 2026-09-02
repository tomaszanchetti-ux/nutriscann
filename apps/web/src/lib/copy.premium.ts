/**
 * Los textos de la VITRINA premium (card 3.3): el segundo CTA del reporte, la
 * sección Perfil con sus funcionalidades bloqueadas, el modal que las explica y
 * la sección Premium con los tres planes.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ POR QUÉ ESTOS TEXTOS ESTÁN EN EL CÓDIGO Y NO EN `config/app` (DT-22)
 *
 * La regla dura 1 del proyecto dice que todo texto que el usuario lee vive en
 * Firestore y se cambia sin desplegar. Estos todavía no: la fuente de verdad de
 * `copy` es `config/copy.json`, que publica el seeder de `kb/seed`, y ese seeder
 * tiene un CANDADO —un test con la lista de claves fija— que hace que sumar una
 * clave sea un cambio de las dos puntas. La card 3.3 se ejecutó en paralelo con
 * otra que estaba tocando `kb/`, así que agregar claves ahí en el mismo momento
 * era pisar trabajo ajeno.
 *
 * Por eso están TODOS acá, agrupados en un solo módulo y en un solo lugar: la
 * migración a `config/copy.json` es mover este archivo, no cazar literales por
 * los componentes. Esa mudanza es parte de la **DT-22**, que la card 3.1 (o la
 * 3.5, con el seed real) ya tiene asignada.
 *
 * Hasta entonces, cambiar un precio o un cupo acá exige desplegar. Está dicho,
 * no supuesto.
 * ---------------------------------------------------------------------------
 *
 * LA REGLA DE COMUNICACIÓN DE LOS CUPOS (Tomás, 01/09/2026, `docs/PLAN.md` §6.7):
 * el cupo que se comunica es SIEMPRE el MENSUAL, nunca un "X al día". Un "3 al
 * día" gratuito promete 90 al mes potenciales y deja al plan de 40 pareciendo
 * menos. El tope diario existe, pero es anti-ráfaga interno: no es la promesa.
 *
 * Y no se menciona publicidad como algo que un plan quita, porque NO HAY
 * publicidad en ningún plan (decisión del 01/09/2026). Se dice como un hecho de
 * la app, no como un beneficio de pagar.
 *
 * Español de España, sin voseo (DT-21).
 *
 * ---------------------------------------------------------------------------
 * WS08 — LA EXCEPCIÓN, Y ES A PROPÓSITO: la sección «Funcionalidades Premium»
 * (`escalonesV2`, al final de este archivo) NO trae sus textos escritos acá. Los
 * LEE de `config/copy.json` a través de `CopyDeLaApp`, como el resto de la app,
 * porque son todas frases fijas y no había motivo para nacer ya en deuda. Este
 * archivo se queda con la ESTRUCTURA de esa sección —qué tarjeta es cuál, cuál
 * va destacada, cuál lleva el disclaimer, a qué etiqueta de la lista de espera
 * apunta cada botón y qué plan sella cada tarjeta—, que es lo que no es texto.
 * ---------------------------------------------------------------------------
 */
import type { CopyDeLaApp } from "./config";

// ---------------------------------------------------------------------------
// La navegación
// ---------------------------------------------------------------------------

export const COPY_NAVEGACION = {
  escaneo: "Escanear",
  perfil: "Perfil",
  premium: "Premium",
  /** Etiqueta accesible de la barra entera. */
  aria: "Secciones de CaliScan",
} as const;

/** El "atrás" que toda sección tiene, siempre. */
export const TEXTO_VOLVER = "Volver";

// ---------------------------------------------------------------------------
// El segundo CTA del reporte
// ---------------------------------------------------------------------------

export const COPY_CTA_PREMIUM = {
  /** Mismo tamaño que "Escanear otro plato", distinto color. */
  etiqueta: "Pasarte a Premium",
} as const;

// La línea que iba debajo de los dos CTAs ("Guarda este plato, mira tus
// tendencias y recibe tu plan del día.") se sacó en el Q/A de la WS08: el
// reporte tenía que terminar en los dos botones y nada más. Lo que prometía se
// dice entero, y mejor, en la vitrina a la que ese botón lleva.

// ---------------------------------------------------------------------------
// La sección Perfil — lo que existe, se ve y todavía no se puede tocar
// ---------------------------------------------------------------------------

export interface FuncionalidadBloqueada {
  /** Clave estable, para las `key` de React y para el Q/A. */
  id: string;
  titulo: string;
  descripcion: string;
  /** Qué plan la abre. Sale tal cual del §6.7; acá no se inventa ninguno. */
  plan: string;
  /** Los campos que se verán como lista, sin formulario real en la v1. */
  campos?: readonly string[];
  /** Una advertencia honesta, cuando la funcionalidad la necesita. */
  advertencia?: string;
}

export const COPY_PERFIL = {
  titulo: "Tu perfil",
  /**
   * EL AVISO, DESTACADO (Q/A de la WS08). Antes decía «Nada de esto está
   * disponible aún» en gris chico, y era la frase menos útil de la pantalla:
   * contaba lo que NO se puede hacer sin decir cómo se puede. Ahora dice el
   * precio de entrada, y se dibuja como un cartel, no como una nota al pie.
   */
  aviso: "Disponible solo con los planes Premium y Premium Gold",
  pieDeSeccion: "Toca cualquiera para ver qué plan la abre.",
  cta: "Ver los planes",
  /** El segundo CTA: el mismo formulario de la vitrina, sin plan concreto. */
  ctaListaDeEspera: "Lista de espera",
} as const;

/**
 * Las cuatro funcionalidades que la sección Perfil muestra bloqueadas. El tipo
 * es el de la interfaz —no el literal— para que `campos` y `advertencia` sean
 * opcionales de verdad al recorrer la lista.
 *
 * UNA LÍNEA POR TARJETA (Q/A de la WS08). Antes eran párrafos que justificaban
 * cada función; ahora dicen QUÉ es, en el mismo vocabulario que la vitrina
 * ("sugerencia", "plan según rutina"). Cuatro tarjetas con cuatro párrafos se
 * leen como un folleto y se saltan enteras; cuatro líneas se leen. Lo que se
 * quiso explicar de más está en el modal y en la pantalla de planes, que es
 * adonde lleva tocarlas.
 */
export const FUNCIONALIDADES_BLOQUEADAS: readonly FuncionalidadBloqueada[] = [
  {
    id: "perfil_personal",
    titulo: "Perfil personal",
    descripcion: "Tus datos, para calcular tus calorías y tus macros del día.",
    plan: "Premium",
    campos: [
      "Sexo",
      "Edad",
      "Altura",
      "Peso",
      "Actividad deportiva",
      "Objetivo",
      "Comidas del día",
      "Elección alimentaria",
      "Intolerancias",
    ],
    // Corta, pero no se va: es la única frase de la app que acota el alcance de
    // las intolerancias, y eso no es relleno legal.
    advertencia: "Informativo, no médico: las alergias graves quedan fuera.",
  },
  {
    id: "historial",
    titulo: "Historial completo",
    descripcion: "Todos tus platos guardados, no solo el último.",
    plan: "Premium",
  },
  {
    id: "tendencias",
    titulo: "Tendencias",
    descripcion: "Cómo se mueven tus calorías y tus macros semana a semana.",
    // WS08: pasa de "Premium Gold" a "Premium". Las tendencias son parte del
    // escalón ACCESIBLE de la v2 (ver `escalonesV2`), y Gold las sigue teniendo
    // porque incluye todo lo del Premium: nadie pierde nada y la app deja de
    // decir dos cosas distintas en dos pantallas. Decisión de producto: si se
    // revierte, se revierte también la viñeta `v2_premium_punto_3`.
    plan: "Premium",
  },
  {
    id: "plan_diario",
    titulo: "Plan de dieta diario",
    descripcion: "Sugerencia de comidas del día según tu rutina.",
    plan: "Premium Gold",
  },
];

// ---------------------------------------------------------------------------
// El modal que explica una funcionalidad bloqueada
// ---------------------------------------------------------------------------

export const COPY_MODAL_PREMIUM = {
  titulo: "Esto llega con Premium",
  /** El cuerpo nombra la funcionalidad que se tocó: el modal no es genérico. */
  cuerpo: (funcionalidad: string) =>
    `«${funcionalidad}» forma parte de los planes de pago. Escanear un plato seguirá siendo gratis; Premium es lo que recuerda, compara y planifica por ti.`,
  cta: "Ver los planes",
  cerrar: "Ahora no",
  /** Etiqueta accesible del aspa. */
  aria_cerrar: "Cerrar",
} as const;

// ---------------------------------------------------------------------------
// La sección Premium — los tres planes cerrados del §6.7
// ---------------------------------------------------------------------------

export interface PlanPremium {
  id: string;
  nombre: string;
  /** El número grande. */
  precio: string;
  /** Qué significa ese número. Nunca un precio a secas. */
  periodo: string;
  /** El cupo, SIEMPRE mensual. */
  cupo: string;
  /** La frase que resume el plan en una línea. */
  resumen: string;
  incluye: readonly string[];
  /** El texto del botón. En la v1 ninguno cobra nada. */
  cta: string;
  /**
   * Con qué etiqueta se apunta a la lista de espera desde esta tarjeta. Los
   * planes que no tienen botón activo —el gratuito— no la llevan.
   */
  listaDeEspera?: PlanDeListaDeEspera;
  /** `true` = el plan que el usuario ya tiene: el botón ni siquiera promete. */
  actual?: boolean;
  /** `true` = el plan destacado, el que trae el diferenciador. */
  destacado?: boolean;
  /** El sello de arriba, cuando lo hay. */
  sello?: string;
}

export const COPY_PREMIUM = {
  titulo: "Nuestros Planes",
  // El subtítulo que explicaba por qué el cupo separa un plan del siguiente
  // ("Mirar una foto y reconocer lo que hay en el plato cuesta dinero de
  // verdad…") se sacó en el Q/A de la WS08: la pantalla empieza por las
  // tarjetas, que es lo que se viene a ver. Lo que decía sigue dicho, en su
  // sitio, en `nota_cupo`, al pie.
  nota_cupo:
    "Todos los cupos son mensuales: el número que ves es el que tienes cada mes. Hay un límite diario interno para evitar ráfagas, pero lo que se te garantiza es el mensual.",
  nota_ads: "En CaliScan no hay publicidad. En ningún plan, tampoco en el gratuito.",
  nota_pagos:
    "Los pagos todavía no están abiertos. Esta pantalla es la vitrina de lo que viene: no se te va a cobrar nada ni se te van a pedir datos de pago.",
  /**
   * El diferenciador de Gold, escrito una vez y destacado en su tarjeta: es lo
   * único que no se puede comprar en el plan anual (§6.7).
   */
  diferenciador: {
    titulo: "Plan de dieta diario según tu rutina",
    detalle:
      "Carga tus datos personales y rutina diaria para obtener sugerencias alimentarias customizadas según tu perfil",
  },
} as const;

/**
 * Los tres planes, tal cual quedaron cerrados en `docs/PLAN.md` §6.7. No se
 * agrega ni una viñeta que no esté ahí: esta pantalla es una vitrina, y una
 * vitrina que promete de más es una mentira con mejor tipografía.
 */
export const PLANES: readonly PlanPremium[] = [
  {
    id: "gratuito",
    nombre: "Gratuito",
    precio: "0 €",
    periodo: "para siempre",
    cupo: "15 fotos al mes",
    resumen: "El reporte completo de cada plato que fotografíes.",
    incluye: [
      "Calorías, macros y el desglose de cada alimento",
      "Cada número trazable a su fuente en la base nutricional",
      "Sin publicidad",
    ],
    cta: "Tu plan actual",
    actual: true,
  },
  {
    id: "premium_anual",
    nombre: "Premium",
    precio: "12 €",
    periodo: "al año, en un solo pago",
    cupo: "40 fotos al mes",
    resumen: "Casi tres veces el cupo, y nada de lo que escaneas se pierde.",
    // La cuarta viñeta dice LO MISMO, letra por letra, que el título de la
    // tarjeta de «Funcionalidades Premium» que hay más abajo en la pantalla
    // (`v2_premium_titulo`). Es a propósito: quien lee el plan aquí arriba y
    // luego ve el recuadro de abajo tiene que reconocerlo, no descubrir algo
    // nuevo. Si ese título cambia, esta línea cambia con él (Q/A, 02/09/2026).
    incluye: [
      "Todo lo del plan Gratuito",
      "40 fotos al mes",
      "Historial completo",
      "Fichas, recetas y tendencias",
    ],
    cta: "Lista de espera",
    listaDeEspera: "premium",
    sello: "Un pago al año",
  },
  {
    id: "premium_gold",
    nombre: "Premium Gold",
    precio: "4,99 €",
    periodo: "al mes",
    cupo: "150 fotos al mes",
    resumen: "Plan completo para alinear tus comidas con tu rutina diaria",
    incluye: [
      "Todo lo del Premium",
      "150 fotos al mes",
      "Sugerencia de dietas diarias según rutina",
      "Armado de perfil personal completo",
    ],
    cta: "Lista de espera",
    listaDeEspera: "gold",
    destacado: true,
    sello: "El plan completo",
  },
];

// ---------------------------------------------------------------------------
// La LISTA DE ESPERA (Q/A de la WS08)
// ---------------------------------------------------------------------------

/**
 * QUÉ CAMBIÓ Y POR QUÉ. Hasta ahora los dos planes de pago tenían un botón
 * `disabled` que decía "Muy pronto": honesto, pero mudo. Se convierte en un
 * botón que sí hace algo —apuntarse— y que además le devuelve al proyecto la
 * única señal que esta vitrina puede dar antes de que existan los pagos: quién
 * los quiere.
 *
 * SIGUE SIN COBRAR NADA y sigue sin pedir datos de pago. Se piden tres cosas y
 * ninguna es sensible: nombre, apellidos y un correo para avisar. Lo que se
 * promete es exactamente eso, y está escrito en el propio formulario.
 *
 * LOS DOS APELLIDOS EN UN SOLO CAMPO: en España son dos y se escriben juntos.
 * Partirlos en dos casillas obliga a rellenar dos veces algo que se dice de un
 * tirón, y deja fuera a quien tiene uno solo. El placeholder lo sugiere.
 */
export const COPY_LISTA_DE_ESPERA = {
  titulo: "Lista de espera",
  entrada: "Te avisamos en cuanto se abran los pagos.",
  nombre: "Nombre",
  nombre_placeholder: "María",
  apellidos: "Apellidos",
  apellidos_placeholder: "García Ruiz",
  correo: "Correo electrónico",
  correo_placeholder: "maria@correo.com",
  enviar: "Apuntarme",
  enviando: "Apuntando…",
  privacidad: "Solo usaremos tu correo para avisarte del lanzamiento.",
  exito: "Estás en la lista. Te avisaremos.",
  cerrar: "Cerrar",
  aria_cerrar: "Cerrar",
  /** Validación mínima y honesta: se dice qué falta, no "revisa el formulario". */
  error_nombre: "Escribe tu nombre.",
  error_apellidos: "Escribe tus apellidos.",
  error_correo: "Ese correo no parece válido.",
  /** Cuando el que falla somos nosotros, se dice así y no se culpa al usuario. */
  error_envio: "No pudimos guardarte en la lista. Prueba de nuevo en un momento.",
} as const;

/**
 * DESDE DÓNDE se abrió el formulario. Viaja al documento tal cual, y es todo lo
 * que la lista sabe de intención: no hay embudo, no hay eventos y no se está
 * midiendo nada más.
 *
 *   `premium` · `gold`  — el botón de esa tarjeta de la vitrina.
 *   `perfil`            — el CTA de la sección Perfil, que no elige plan.
 */
export type PlanDeListaDeEspera = "premium" | "gold" | "perfil";

// ---------------------------------------------------------------------------
// «Funcionalidades Premium» — los dos escalones de la v2 (WS08)
// ---------------------------------------------------------------------------

/**
 * QUÉ ES ESTA SECCIÓN Y POR QUÉ EXISTE.
 *
 * La vitrina vendía bien lo que la v1 ya hace —el cupo de fotos y el historial—
 * y callaba lo único que de verdad separa a un plan de pago de una app gratis
 * de calorías: lo que viene después. Se muestran los dos escalones, en el orden
 * en que se suben:
 *
 *   1. EL ACCESIBLE — fichas con su fuente USDA, recetas por categoría
 *      (antes / después de entrenar) y tendencias por semana y por mes.
 *   2. EL ALTO — el plan personalizado de 1 semana, 15 días o 1 mes, según el
 *      objetivo, el entrenamiento y el perfil.
 *
 * TRES REGLAS DURAS, y las tres se ven en el código de abajo:
 *
 *   · SIN PRECIO. Ninguno de los dos trae un número. La escalera de precios es
 *     la de `PLANES` (0 € · 12 €/año · 4,99 €/mes, con 15 · 40 · 150 fotos AL
 *     MES) y esta sección no la toca ni la duplica: cada tarjeta dice a cuál de
 *     esos planes se sumará, y eso ocupa el lugar donde iría el precio.
 *   · LA CONVERSIÓN ES LA LISTA DE ESPERA. Los dos botones abren el MISMO
 *     formulario que los planes de arriba y guardan la misma etiqueta
 *     (`premium` / `gold`): no hay un segundo circuito ni un segundo evento.
 *   · OBJETIVOS DE FORMA FÍSICA Y NADA MÁS: bajar de peso, tonificar, ganar masa
 *     muscular. Ninguna condición médica se nombra —ni como ejemplo—, y la
 *     tarjeta que habla de objetivos lleva pegado el `disclaimer` que ya existe
 *     ("no es consejo médico"), que es el mismo del pie y no un texto nuevo.
 *
 * Los TEXTOS salen de `config/copy.json` (claves `v2_*`): se cambian sin
 * desplegar. Acá vive solo la forma.
 */
export interface EscalonV2 {
  /** Clave estable, para las `key` de React y para el Q/A. */
  id: string;
  /**
   * El sello de arriba: el NOMBRE DEL PLAN al que se sumará esta funcionalidad
   * —el mismo que muestra su tarjeta en la escalera de precios—. No es un texto
   * publicado: sale de `PLANES` (ver `nombreDelPlan`).
   */
  sello: string;
  /** Qué trae, no cómo se llama el plan: es lo que se compra. */
  titulo: string;
  /** A qué plan de la escalera se suma. Ocupa el lugar del precio. */
  vinculo: string;
  resumen: string;
  puntos: readonly string[];
  cta: string;
  /** La etiqueta con la que se guarda el alta. La misma de `PLANES`. */
  listaDeEspera: PlanDeListaDeEspera;
  /** `true` = el escalón alto: se dibuja destacado, como Gold arriba. */
  destacado?: boolean;
  /** `true` = habla de objetivos personales, así que lleva el disclaimer. */
  conDisclaimer?: boolean;
}

/**
 * El nombre del plan que abre un escalón, leído de `PLANES` por la MISMA
 * etiqueta con la que el botón da el alta en la lista de espera.
 *
 * Hasta el Q/A del 02/09/2026 las dos tarjetas compartían un sello publicado
 * («Próximamente», la clave `v2_badge`). Ahora cada una lleva el nombre de su
 * plan —«Premium» y «Premium Gold»—, así que el sello dejó de ser texto y pasó a
 * ser estructura: no se escribe dos veces algo que ya está en `PLANES`, y el
 * sello no puede quedar diciendo un plan distinto del que el botón apunta.
 */
function nombreDelPlan(etiqueta: PlanDeListaDeEspera): string {
  const plan = PLANES.find((candidato) => candidato.listaDeEspera === etiqueta);
  // Los dos escalones apuntan a planes que existen en `PLANES`. Si alguien
  // borrara uno, la tarjeta muestra la etiqueta cruda —fea y a la vista— antes
  // que inventar el nombre de un plan que ya no está.
  return plan === undefined ? etiqueta : plan.nombre;
}

/**
 * Arma los dos escalones con los textos ya publicados. Es una función y no una
 * constante porque `copy` llega de Firestore en tiempo de ejecución: congelarla
 * al importar el módulo dejaría la sección con el arranque en frío para siempre.
 */
export function escalonesV2(copy: CopyDeLaApp): readonly EscalonV2[] {
  return [
    {
      id: "v2_premium",
      sello: nombreDelPlan("premium"),
      titulo: copy.v2_premium_titulo,
      vinculo: copy.v2_premium_vinculo,
      resumen: copy.v2_premium_resumen,
      puntos: [copy.v2_premium_punto_1, copy.v2_premium_punto_2, copy.v2_premium_punto_3],
      cta: copy.v2_cta,
      listaDeEspera: "premium",
    },
    {
      id: "v2_gold",
      sello: nombreDelPlan("gold"),
      titulo: copy.v2_gold_titulo,
      vinculo: copy.v2_gold_vinculo,
      resumen: copy.v2_gold_resumen,
      puntos: [copy.v2_gold_punto_1, copy.v2_gold_punto_2, copy.v2_gold_punto_3],
      cta: copy.v2_cta,
      listaDeEspera: "gold",
      destacado: true,
      // Habla de objetivos personales: acá el disclaimer no es letra chica de
      // relleno, es la frase que dice que esto orienta y no prescribe.
      conDisclaimer: true,
    },
  ];
}
