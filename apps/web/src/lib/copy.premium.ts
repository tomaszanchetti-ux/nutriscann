/**
 * La VITRINA premium (card 3.3): la sección Perfil con sus funcionalidades
 * bloqueadas, el modal que las explica y la sección Premium con los tres planes.
 *
 * ---------------------------------------------------------------------------
 * QUÉ SE MUDÓ A `config/app` Y QUÉ SIGUE ACÁ (DT-41 b, card 4.5)
 *
 * La regla dura 1 del proyecto dice que todo texto que el usuario lee vive en
 * Firestore y se cambia sin desplegar. La card 4.5 amplió la lista cerrada de
 * `config/copy.json` y con ella se fueron LA PANTALLA DE PLANES ENTERA (título,
 * las tres notas al pie, el recuadro destacado de Gold y los tres planes con su
 * precio, su cupo y sus viñetas) y el segundo CTA del reporte. Cambiar un precio
 * ya no exige desplegar, que era el punto.
 *
 * LO QUE SIGUE ACÁ SON DOS COSAS Y ESTÁN DECLARADAS:
 *
 *   1. LA ESTRUCTURA, que no es texto: qué plan es el actual, cuál va destacado,
 *      a qué etiqueta de la lista de espera apunta cada botón, qué tarjeta lleva
 *      el disclaimer. Eso no se edita en un PR de configuración; se programa.
 *   2. LOS TEXTOS DE LAS PANTALLAS QUE ESTA CARD NO PODÍA CABLEAR — el perfil,
 *      el modal, la navegación, el botón de volver y la lista de espera. No es
 *      que no encajen en el modelo: encajan. Es que sus componentes no reciben
 *      `copy`, y hacérselo llegar toca `App.tsx` y `lib/listaDeEspera.ts`, dos
 *      archivos fuera del alcance de la card. Está dicho, no supuesto, y el
 *      informe de la card lleva la lista exacta de qué falta cablear.
 *
 * Hasta entonces, cambiar una palabra de ESAS exige desplegar.
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
 * WS08 — LA SECCIÓN «Funcionalidades Premium» (`escalonesV2`, al final de este
 * archivo) fue la primera que nació así: sus textos se LEEN de `config/copy.json`
 * a través de `CopyDeLaApp` y acá vive solo su estructura. La card 4.5 aplicó ese
 * mismo reparto a los tres planes de arriba.
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

// El SEGUNDO CTA del reporte («Pasarte a Premium») vivía acá y desde la card 4.5
// es `report_cta_premium` en `config/copy.json`: se cambia sin desplegar, igual
// que el botón que tiene al lado.
//
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

// El título de la pantalla, sus tres notas al pie y el recuadro destacado de
// Gold viajan desde la card 4.5 en `config/copy.json` (`plans_*`). El subtítulo
// que explicaba por qué el cupo separa un plan del siguiente ("Mirar una foto y
// reconocer lo que hay en el plato cuesta dinero de verdad…") se había sacado ya
// en el Q/A de la WS08: la pantalla empieza por las tarjetas, que es lo que se
// viene a ver. Lo que decía sigue dicho, en su sitio, en `plans_note_quota`.

/**
 * Los tres planes, tal cual quedaron cerrados en `docs/PLAN.md` §6.7. No se
 * agrega ni una viñeta que no esté ahí: esta pantalla es una vitrina, y una
 * vitrina que promete de más es una mentira con mejor tipografía.
 *
 * DESDE LA CARD 4.5 (DT-41 b) EL TEXTO NO ESTÁ ACÁ: sale de `config/copy.json`
 * (claves `plan_*`), así que cambiar 12 € por 15 €, o 40 fotos por 50, es un PR
 * de configuración y una corrida del seed — no un despliegue de la PWA. Acá se
 * queda lo que NO es texto: qué plan es el actual, cuál va destacado y con qué
 * etiqueta se apunta cada botón a la lista de espera. Es el mismo reparto que
 * `escalonesV2` estrenó en la WS08, ahora también arriba.
 *
 * Es una función y no una constante por el mismo motivo que `escalonesV2`: el
 * copy llega de Firestore en tiempo de ejecución, y congelarlo al importar el
 * módulo dejaría la pantalla con el arranque en frío para siempre.
 */
export function planes(copy: CopyDeLaApp): readonly PlanPremium[] {
  return [
    {
      id: "gratuito",
      nombre: copy.plan_free_name,
      precio: copy.plan_free_price,
      periodo: copy.plan_free_period,
      cupo: copy.plan_free_quota,
      resumen: copy.plan_free_summary,
      incluye: [copy.plan_free_point_1, copy.plan_free_point_2, copy.plan_free_point_3],
      cta: copy.plan_free_cta,
      actual: true,
    },
    {
      id: "premium_anual",
      nombre: copy.plan_premium_name,
      precio: copy.plan_premium_price,
      periodo: copy.plan_premium_period,
      cupo: copy.plan_premium_quota,
      resumen: copy.plan_premium_summary,
      // La cuarta viñeta dice LO MISMO, letra por letra, que el título de la
      // tarjeta de «Funcionalidades Premium» que hay más abajo en la pantalla
      // (`v2_premium_titulo`). Es a propósito: quien lee el plan aquí arriba y
      // luego ve el recuadro de abajo tiene que reconocerlo, no descubrir algo
      // nuevo. Si ese título cambia, esta línea cambia con él (Q/A, 02/09/2026),
      // y ahora las dos se editan en el mismo archivo.
      incluye: [
        copy.plan_premium_point_1,
        copy.plan_premium_point_2,
        copy.plan_premium_point_3,
        copy.plan_premium_point_4,
      ],
      cta: copy.plan_premium_cta,
      listaDeEspera: "premium",
      sello: copy.plan_premium_badge,
    },
    {
      id: "premium_gold",
      nombre: copy.plan_gold_name,
      precio: copy.plan_gold_price,
      periodo: copy.plan_gold_period,
      cupo: copy.plan_gold_quota,
      resumen: copy.plan_gold_summary,
      incluye: [
        copy.plan_gold_point_1,
        copy.plan_gold_point_2,
        copy.plan_gold_point_3,
        copy.plan_gold_point_4,
      ],
      cta: copy.plan_gold_cta,
      listaDeEspera: "gold",
      destacado: true,
      sello: copy.plan_gold_badge,
    },
  ];
}

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
function nombreDelPlan(copy: CopyDeLaApp, etiqueta: PlanDeListaDeEspera): string {
  const plan = planes(copy).find((candidato) => candidato.listaDeEspera === etiqueta);
  // Los dos escalones apuntan a planes que existen arriba. Si alguien borrara
  // uno, la tarjeta muestra la etiqueta cruda —fea y a la vista— antes que
  // inventar el nombre de un plan que ya no está.
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
      sello: nombreDelPlan(copy, "premium"),
      titulo: copy.v2_premium_titulo,
      vinculo: copy.v2_premium_vinculo,
      resumen: copy.v2_premium_resumen,
      puntos: [copy.v2_premium_punto_1, copy.v2_premium_punto_2, copy.v2_premium_punto_3],
      cta: copy.v2_cta,
      listaDeEspera: "premium",
    },
    {
      id: "v2_gold",
      sello: nombreDelPlan(copy, "gold"),
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
