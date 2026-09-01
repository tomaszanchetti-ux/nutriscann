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
 */

// ---------------------------------------------------------------------------
// La navegación
// ---------------------------------------------------------------------------

export const COPY_NAVEGACION = {
  escaneo: "Escanear",
  perfil: "Perfil",
  premium: "Premium",
  /** Etiqueta accesible de la barra entera. */
  aria: "Secciones de NutriScann",
} as const;

/** El "atrás" que toda sección tiene, siempre. */
export const TEXTO_VOLVER = "Volver";

// ---------------------------------------------------------------------------
// El segundo CTA del reporte
// ---------------------------------------------------------------------------

export const COPY_CTA_PREMIUM = {
  /** Mismo tamaño que "Escanear otro plato", distinto color. */
  etiqueta: "Pasarte a premium",
  /** La línea de abajo, para que el botón no sea un salto al vacío. */
  pie: "Guarda este plato, mira tus tendencias y recibe tu plan del día.",
} as const;

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
  entrada:
    "Hoy NutriScann mide el plato que tienes delante. Con perfil, además, lo lee en función de ti: de tu peso, de tu objetivo y de lo que ya has comido hoy.",
  aviso: "Nada de esto está disponible aún. Se ve para que sepas qué viene.",
  pieDeSeccion: "Toca cualquiera para ver qué plan la abre.",
  cta: "Ver los planes",
} as const;

/**
 * Las cuatro funcionalidades que la sección Perfil muestra bloqueadas. El tipo
 * es el de la interfaz —no el literal— para que `campos` y `advertencia` sean
 * opcionales de verdad al recorrer la lista.
 */
export const FUNCIONALIDADES_BLOQUEADAS: readonly FuncionalidadBloqueada[] = [
  {
    id: "perfil_personal",
    titulo: "Perfil personal",
    descripcion:
      "Con estos datos se calculan tus calorías y tus macros de cada día por fórmula, no a ojo. Ese número es el que convierte un plato en «te viene bien» o «te viene justo».",
    plan: "Con premium",
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
    advertencia:
      "Las intolerancias filtran con cuidado declarado: NutriScann es informativo, no médico. Las alergias graves quedan explícitamente fuera de su alcance.",
  },
  {
    id: "historial",
    titulo: "Historial completo",
    descripcion:
      "Todos tus platos escaneados, guardados y consultables cuando quieras — no solo el último.",
    plan: "Premium · 12 € al año",
  },
  {
    id: "tendencias",
    titulo: "Tendencias",
    descripcion:
      "Cómo se mueven tus calorías y tus macros semana a semana. Un plato suelto no dice nada; treinta sí.",
    plan: "Premium Gold",
  },
  {
    id: "plan_diario",
    titulo: "Plan de dieta diario",
    descripcion:
      "Un plan repartido solo entre las comidas que de verdad haces, ajustado a tu rutina de entrenamiento y a tu objetivo.",
    plan: "Premium Gold",
  },
];

// ---------------------------------------------------------------------------
// El modal que explica una funcionalidad bloqueada
// ---------------------------------------------------------------------------

export const COPY_MODAL_PREMIUM = {
  titulo: "Esto llega con premium",
  /** El cuerpo nombra la funcionalidad que se tocó: el modal no es genérico. */
  cuerpo: (funcionalidad: string) =>
    `«${funcionalidad}» forma parte de los planes de pago. Escanear un plato seguirá siendo gratis; premium es lo que recuerda, compara y planifica por ti.`,
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
  /** `true` = el plan que el usuario ya tiene: el botón ni siquiera promete. */
  actual?: boolean;
  /** `true` = el plan destacado, el que trae el diferenciador. */
  destacado?: boolean;
  /** El sello de arriba, cuando lo hay. */
  sello?: string;
}

export const COPY_PREMIUM = {
  titulo: "Los planes de NutriScann",
  entrada:
    "Mirar una foto y reconocer lo que hay en el plato cuesta dinero de verdad, y se paga por foto. Por eso lo que separa un plan del siguiente es el cupo.",
  nota_cupo:
    "Todos los cupos son mensuales: el número que ves es el que tienes cada mes. Hay un límite diario interno para evitar ráfagas, pero lo que se te garantiza es el mensual.",
  nota_ads: "En NutriScann no hay publicidad. En ningún plan, tampoco en el gratuito.",
  nota_pagos:
    "Los pagos todavía no están abiertos. Esta pantalla es la vitrina de lo que viene: no se te va a cobrar nada ni se te van a pedir datos.",
  cta_inerte: "Muy pronto",
  /**
   * El diferenciador de Gold, escrito una vez y destacado en su tarjeta: es lo
   * único que no se puede comprar en el plan anual (§6.7).
   */
  diferenciador: {
    titulo: "Plan de dieta diario según tu rutina",
    detalle:
      "Reparte el día entre las comidas que de verdad haces, con platos del propio catálogo y cantidades concretas, mirando tus entrenamientos, tu objetivo y lo que ya llevas comido. Solo en Gold.",
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
      "Cada número trazable a su ficha de la base nutricional",
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
    incluye: ["Todo lo del plan Gratuito", "40 fotos al mes", "Historial completo"],
    cta: "Muy pronto",
    sello: "Un pago al año",
  },
  {
    id: "premium_gold",
    nombre: "Premium Gold",
    precio: "4,99 €",
    periodo: "al mes",
    cupo: "150 fotos al mes",
    resumen: "El único plan que además te dice qué comer, no solo qué comiste.",
    incluye: [
      "Todo lo de Premium",
      "150 fotos al mes",
      "Plan de dieta diario según tu rutina",
      "Tendencias",
    ],
    cta: "Muy pronto",
    destacado: true,
    sello: "El plan completo",
  },
];
