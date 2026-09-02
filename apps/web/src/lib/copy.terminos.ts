/**
 * El texto de los Términos y Condiciones (card 3.4).
 *
 * ---------------------------------------------------------------------------
 * ⚠️ POR QUÉ ESTE TEXTO ESTÁ EN EL CÓDIGO Y NO EN `config/app` (DT-22)
 *
 * Mismo motivo, y mismo lugar en la fila, que `copy.premium.ts`: la fuente de
 * verdad de `copy` es `config/copy.json`, y esa lista de claves está CERRADA con
 * un candado (`kb/seed/src/textos.test.ts` fija las 47 y el contrato exige que
 * sean exactamente los campos de `CopyDeLaApp`). Meter acá veinte párrafos
 * partidos en veinte claves nuevas no es cambiar un texto: es cambiar el
 * contrato de las dos puntas, y encima con un mapa de texto a texto que no tiene
 * convención de placeholders para las listas.
 *
 * Se agrupa entonces igual que los textos de la vitrina premium: TODO en un
 * módulo, en un solo lugar, para que la mudanza a `config/copy.json` sea mover
 * un archivo y no cazar literales por los componentes. Esa mudanza es parte de
 * la **DT-22**.
 *
 * Hasta entonces, corregir una coma de los T&C exige desplegar. Está dicho, no
 * supuesto — y para un texto que cambia una vez al año es el intercambio
 * correcto.
 * ---------------------------------------------------------------------------
 *
 * QUÉ DICE Y POR QUÉ. Los cuatro puntos los fijó Tomás en `docs/PLAN.md`
 * (card 3.4): no somos nutricionistas ni médicos · la app no reemplaza una
 * consulta profesional · los valores salen de bases de datos internacionales,
 * con USDA citada por su nombre · la app te ayuda a entender lo que comes.
 *
 * Lo demás que hay acá —qué precisión esperar, las alergias, los pagos— no es
 * relleno legal: es lo que la app ya declara en sus pantallas, dicho entero en
 * un solo sitio. Y lo que NO hay tampoco es casualidad: no se promete nada sobre
 * el tratamiento de las fotos ni de los datos, porque las cuentas de usuario
 * llegan en la Fase 4 y una política de privacidad escrita antes de tiempo sería
 * una promesa que hoy nadie puede sostener. Lo dice la última sección.
 *
 * Español de España, sin voseo (DT-21). Sin jerga legal impostada: cada título
 * es corto y cada párrafo se puede leer entero de una vez.
 */

/** Un bloque de los T&C: su título y sus párrafos. */
export interface SeccionDeTerminos {
  /** Clave estable, para las `key` de React y para el Q/A. */
  id: string;
  titulo: string;
  parrafos: readonly string[];
}

export const COPY_TERMINOS = {
  titulo: "Términos y condiciones",
  /** La frase que resume todo lo de abajo, para quien no va a leer todo lo de abajo. */
  entrada:
    "En una línea: CaliScan te ayuda a entender lo que comes. No te diagnostica, no te trata y no sustituye a un profesional.",
  actualizado: "Última actualización: 1 de septiembre de 2026",
  /** El enlace que lleva hasta aquí, en el pie de todas las pantallas. */
  enlace: "Términos y condiciones",
} as const;

export const SECCIONES_DE_TERMINOS: readonly SeccionDeTerminos[] = [
  {
    id: "que_es",
    titulo: "Qué es CaliScan",
    parrafos: [
      "Haces una foto de tu plato y la app reconoce los alimentos que ve y estima cuánto hay de cada uno. Con esos gramos calcula las calorías y los macronutrientes.",
      "El resultado es información para que entiendas lo que estás comiendo: un orden de magnitud fiable, no el análisis de un laboratorio. Sirve para hacerte una idea, para comparar platos y para saber por dónde andas. Para eso está hecha, y para nada más.",
    ],
  },
  {
    id: "no_somos_sanitarios",
    titulo: "No somos nutricionistas ni médicos",
    parrafos: [
      "CaliScan no es un servicio sanitario, y quienes la hacemos no somos médicos, dietistas ni nutricionistas.",
      "Nada de lo que leas en la app es un diagnóstico, un tratamiento ni una indicación clínica. Son números y lo que se puede decir con esos números.",
    ],
  },
  {
    id: "no_sustituye",
    titulo: "No sustituye una consulta profesional",
    parrafos: [
      "Si tienes una enfermedad, estás embarazada, tomas medicación, sigues una dieta pautada o quieres cambiar tu alimentación en serio, habla con un profesional sanitario. Usa CaliScan como una herramienta más, nunca como el criterio que decide.",
      "Y con las alergias, especial cuidado: la app identifica lo que cree ver en una foto y puede equivocarse. No la uses jamás para decidir si un plato es seguro para ti.",
    ],
  },
  {
    id: "de_donde_salen_los_numeros",
    titulo: "De dónde salen los números",
    parrafos: [
      "Los valores nutricionales no se los inventa nadie: salen de bases de datos nutricionales internacionales, públicas y consultables.",
      "La principal, con diferencia, es USDA FoodData Central, la base de datos del Departamento de Agricultura de los Estados Unidos. Cuando un plato de aquí no está en ninguna base, se compone sumando sus ingredientes, o se añade a mano dejando escrito de dónde salen sus valores.",
      "Cada alimento del informe lleva su origen a la vista, para que puedas comprobarlo tú mismo.",
    ],
  },
  {
    id: "que_precision_esperar",
    titulo: "Qué precisión esperar",
    parrafos: [
      "Hay dos cosas que se estiman, y las dos pueden fallar: qué hay en el plato y cuánto pesa. Un guiso mezclado, una foto a contraluz o una salsa que tapa la mitad dan peores resultados que un plato ordenado con buena luz.",
      "Por eso la app te enseña siempre lo que sabe y lo que no: la confianza de cada alimento, si se usó una coincidencia exacta o la más parecida, y un aviso cuando el total no cubre el plato entero.",
      "Cuando no hay un dato fiable, CaliScan prefiere no dar el número antes que dar uno inventado. Un hueco es honesto; un número redondo que nadie midió, no.",
    ],
  },
  {
    id: "planes_y_pagos",
    titulo: "Los planes y los pagos",
    parrafos: [
      "Hoy no se cobra nada. La pantalla de planes es la vitrina de lo que viene: no hay pagos abiertos, no se te piden datos de pago y ningún botón te va a cobrar por error.",
      "El día que eso cambie, lo verás escrito antes de pagar nada.",
    ],
  },
  {
    id: "este_texto_crece",
    titulo: "Este texto va a crecer",
    parrafos: [
      "CaliScan está en su primera versión. Cuando lleguen las cuentas de usuario y los pagos, esta página crecerá con lo que haga falta, empezando por qué se hace con tus fotos y con tus datos.",
      "Mientras tanto no prometemos aquí nada que no podamos sostener: preferimos una página corta y cierta a una larga y prestada.",
    ],
  },
];
