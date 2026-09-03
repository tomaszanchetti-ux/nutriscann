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
 * un solo sitio.
 *
 * LA CUENTA Y LAS FOTOS (WS13, 03/09/2026, DT-59). Hasta la Fase 6 este texto
 * NO decía nada del tratamiento de las fotos ni de los datos, a propósito: no
 * había cuentas y no se guardaba ninguna foto, y prometer una política antes de
 * tiempo era prometer algo que nadie podía sostener. Las dos cosas cambiaron y
 * el texto cambió con ellas: desde la Fase 4 hay cuenta obligatoria (Google o
 * enlace por correo) y un cupo por plan; desde la card 6.0 la foto se guarda en
 * Cloud Storage (`scans/{owner}/{scan}.jpg`, la lee solo su dueño y el backend)
 * junto con lo que dijo el modelo (`vision`). Cada afirmación de las secciones
 * `tu_cuenta` y `tus_fotos` corresponde a algo que el código HACE hoy: si el
 * código cambia (retención, borrado en cascada, DT-60), esta página cambia en
 * el mismo movimiento, y ANTES de desplegar.
 *
 * LO QUE VIENE se cuenta con verbos de futuro y sin fechas: los pulgares por
 * ítem (card 6.7), las recetas nuestras y el idioma a elegir (v1.5, ver
 * `docs/PLAN_V2.md` §10). Ninguna de esas tres cambia lo que se hace con los
 * datos; el día que algo lo cambie —pagos, o que alguien que no seas tú pueda
 * ver algo tuyo— la página se reescribe primero.
 *
 * DOS COPIAS QUE TIENEN QUE DECIR LO MISMO: este módulo (la PWA) y
 * `apps/landing/terminos.html` (la landing pública). Se editan juntas.
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
  actualizado: "Última actualización: 3 de septiembre de 2026",
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
      "Los gramos son siempre aproximados. La app no pesa nada: estima la cantidad mirando la foto, y una foto no tiene ni profundidad ni báscula. Ese margen de error se arrastra entero al resultado: si la estimación se pasa un tercio, las calorías y los macronutrientes se pasan un tercio. Estamos midiendo cuánto se equivoca con platos de peso conocido, y en cuanto tengamos el número lo publicaremos aquí, con su cifra.",
      "Por eso la app te enseña siempre lo que sabe y lo que no: la confianza de cada alimento, si se usó una coincidencia exacta o la más parecida, y un aviso cuando el total no cubre el plato entero.",
      "Cuando no hay un dato fiable, CaliScan prefiere no dar el número antes que dar uno inventado. Un hueco es honesto; un número redondo que nadie midió, no.",
    ],
  },
  {
    id: "tu_cuenta",
    titulo: "Tu cuenta y tu cupo",
    parrafos: [
      "Para analizar un plato hace falta una cuenta. Entras con Google o con un enlace que te enviamos al correo; no hay contraseña que recordar.",
      "De ti guardamos lo mínimo para que la cuenta funcione: tu correo electrónico y un identificador interno. Nada más: ni nombre, ni edad, ni peso, ni objetivos. No te los pedimos porque no los necesitamos.",
      "Cada plan tiene un cupo de análisis al mes y otro al día. El número exacto lo ves siempre en la pantalla de planes. Cuando se agota, la app te lo dice y espera a que se renueve; una foto que no llegamos a analizar no cuenta.",
    ],
  },
  {
    id: "tus_fotos",
    titulo: "Qué hacemos con tus fotos",
    parrafos: [
      "Cuando analizas un plato, la foto viaja a nuestro servidor y de ahí al modelo de inteligencia artificial que reconoce los alimentos, un servicio externo de la empresa Anthropic. Lo usamos solo para eso: identificar qué hay en el plato y estimar cuánto. Según sus condiciones comerciales, ese proveedor no utiliza lo que le enviamos para entrenar sus modelos.",
      "La foto se guarda junto con su análisis: los alimentos reconocidos, los gramos estimados, los totales y la respuesta exacta del modelo. Es tu expediente. Solo tú lo ves desde tu cuenta y solo nuestro sistema lo lee. No lo compartimos con nadie, no lo vendemos y no lo usamos para mostrarte publicidad.",
      "¿Para qué lo guardamos? Para que puedas volver a tus análisis, y para mejorar el reconocimiento: cuando un plato sale mal, la única forma de arreglarlo es poder mirar la foto y lo que el modelo dijo de ella.",
      "Todo se almacena en servidores de Google Cloud en Europa y se conserva mientras tengas la cuenta. Si quieres que borremos tu cuenta y todo lo que hay en ella, escríbenos a soporte@caliscan.app y lo hacemos: fotos, análisis y correo, sin preguntas.",
    ],
  },
  {
    id: "tu_opinion",
    titulo: "Tu opinión sobre cada análisis",
    parrafos: [
      "Muy pronto podrás decirnos, plato a plato, si el análisis acertó: un pulgar arriba o abajo por cada alimento y por el total, y si algo salió mal, qué era o cuánto había en realidad.",
      "Esa opinión se guarda con el análisis y sirve para lo mismo que la foto: encontrar lo que falla y corregirlo. Es voluntaria, y no cambia tu cupo ni tu plan.",
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
    id: "lo_que_viene",
    titulo: "Lo que viene, y lo que cambiará aquí",
    parrafos: [
      "Las próximas versiones traen recetas escritas por nosotros, gratis y fuera de cualquier plan de pago; la app en español o en inglés, a tu elección; y los pulgares de arriba. Ninguna de esas tres cosas cambia lo que hacemos con tus datos.",
      "Cuando lleguen los pagos, o el día que alguien que no seas tú pueda ver algo tuyo, esta página cambiará antes, no después. Mientras tanto no prometemos aquí nada que no podamos sostener: preferimos una página corta y cierta a una larga y prestada.",
    ],
  },
];
