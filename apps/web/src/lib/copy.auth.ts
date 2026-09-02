/**
 * Los textos de la puerta: la pantalla de entrada, la tarjeta de la cuenta en
 * Perfil y los dos estados nuevos del escaneo (sesión caducada y cupo agotado).
 *
 * ---------------------------------------------------------------------------
 * ⚠️ POR QUÉ ESTÁN ACÁ Y NO EN `config/app` (la regla dura 1)
 *
 * Mismo motivo, y con el mismo dueño, que `copy.premium.ts` y `copy.terminos.ts`:
 * la lista de claves de `config/copy.json` está CERRADA con candado
 * (`kb/seed/src/textos.test.ts` exige que las claves del repo sean exactamente
 * los campos de `CopyDeLaApp`), así que sumar un texto es un cambio de las dos
 * puntas y además de `kb/`, que esta card no toca — hay otra card trabajando ahí
 * en paralelo. El contrato de la WS09 lo dice con todas las letras (§5): los
 * textos nuevos de esta ola nacen en módulos locales del front, y la mudanza a
 * `config/copy.json` es la card 4.5, con su propio Q/A.
 *
 * Hasta entonces, cambiar una palabra de acá exige desplegar. Está dicho, no
 * supuesto. Y está TODO en un solo módulo justamente para que esa mudanza sea
 * mover un archivo y no cazar literales por las pantallas.
 *
 * Español de España, sin voseo (DT-21): "haz", "prueba", "tu cuenta".
 * ------------------------------------------------------------------------- */
import type { CupoDelBackend } from "./types";

// ---------------------------------------------------------------------------
// La pantalla de entrada
// ---------------------------------------------------------------------------

export const COPY_LOGIN = {
  /*
   * NO HAY CLAVE `titulo` (Q/A de Tomás, 02/09/2026). Decía "Entra para
   * escanear" —explicaba el trámite— y ahora el encabezado de la puerta ES el
   * logotipo de CaliScan, el mismo de la landing de la que viene el usuario. El
   * nombre accesible que oye un lector de pantalla sale del `<title>` del propio
   * SVG (`LogoCaliScan`), no de aquí: dejar la clave habría sido dejar un texto
   * que nadie dibuja, que es justo lo que la DT-41 (c) acaba de limpiar.
   */
  /**
   * EL ESLOGAN (escrito por Tomás, 02/09/2026).
   *
   * Abre por la promesa —comer mejor— y no por el mecanismo, y la línea de apoyo
   * recorre en tres tiempos lo que Tomás pidió que quedara claro: la foto (qué
   * hace el usuario), la ficha nutricional (qué recibe) y el progreso (para qué
   * sirve). El ritmo es a propósito: cada coma es uno de los tres.
   *
   * Y no firma nada que la v1 no haga. La app MIDE, todavía no aconseja: el
   * perfil, los objetivos y el plan llegan en la v2. Por eso el progreso se
   * nombra como POSIBILIDAD y no como una función —ningún "tu plan", ningún "tu
   * objetivo"—, que es lo que alguien podría venir a buscar esta tarde y no
   * encontrar.
   */
  entrada: "Comer mejor es posible",
  entrada_apoyo: "Una foto, una ficha nutricional, infinitas posibilidades de progresar",

  google: "Continuar con Google",
  /** Entre los dos caminos. Es una palabra sola porque es un separador, no un texto. */
  separador: "o",

  correo_etiqueta: "Tu correo electrónico",
  correo_placeholder: "nombre@correo.com",
  /**
   * "Entrar con correo electrónico" y no "con un enlace por correo" (Q/A de
   * Tomás): la etiqueta del botón dice CON QUÉ se entra —igual que la de
   * Google, su vecina—, y no cómo funciona por dentro. Que llegará un enlace se
   * cuenta en la pantalla siguiente, que es donde importa saberlo.
   */
  correo_cta: "Entrar con correo electrónico",
  correo_enviando: "Enviando el enlace…",

  /** Mientras la página se va a Google. Dura un parpadeo, pero el hueco existe. */
  redirigiendo: "Te llevamos a Google…",

  // — El enlace ya salió —
  /** Dos palabras: lo que pasó. El detalle —a qué correo, y qué hacer— va en el
   *  recuadro de debajo, que es el que se lee de verdad. (Q/A de Tomás.) */
  enviado_titulo: "Enlace enviado",
  /**
   * El correo se repite en pantalla A PROPÓSITO: es el único momento en que se
   * puede cazar una letra de más antes de quedarse esperando un correo que no
   * llega. Y por eso hay una salida para corregirlo, justo debajo.
   */
  enviado_cuerpo: (correo: string) =>
    `Toca el enlace que hemos enviado a ${correo} y entrarás. Puedes abrirlo aquí o en otro dispositivo.`,
  enviado_ayuda: "Si no lo ves, mira en la carpeta de spam. El enlace sirve una sola vez.",
  enviado_cambiar: "Usar otro correo",

  // — Volviendo del enlace —
  verificando_titulo: "Comprobando tu enlace",
  verificando_cuerpo: "Un momento, estamos comprobando el enlace que has abierto.",

  /**
   * EL CASO DE "ABIERTO EN OTRO NAVEGADOR". No se disculpa ni echa la culpa: dice
   * qué pasó y qué hace falta. Quien abre el correo en el móvil habiendo pedido
   * el enlace en el portátil no hizo nada mal.
   */
  pedir_titulo: "¿A qué correo lo pediste?",
  pedir_cuerpo:
    "Has abierto el enlace en un navegador distinto del que lo pidió, así que aquí no sabemos a quién se lo enviamos. Escribe el mismo correo y entras.",
  pedir_cta: "Entrar",
  pedir_comprobando: "Comprobando…",
  /** La salida cuando el enlace ya no sirve y hay que empezar de nuevo. */
  pedir_volver: "Pedir un enlace nuevo",

  // — Los errores, en el idioma de quien los lee —
  //
  // Ninguno dice "error" ni muestra un código de Firebase: `auth/invalid-email`
  // no le dice nada a quien está intentando entrar. El código sí se muestra,
  // chiquito y solo para los casos que no supimos traducir, igual que hace la
  // pantalla de error del escaneo.
  error_correo_invalido: "Ese correo no parece válido. Comprueba que esté bien escrito.",
  error_correo_vacio: "Escribe tu correo para que podamos enviarte el enlace.",
  error_enlace_caducado:
    "Este enlace ya no sirve: ha caducado o ya se ha usado. Pide uno nuevo y lo intentamos otra vez.",
  error_correo_no_coincide:
    "Ese no es el correo al que enviamos el enlace. Prueba con la dirección donde lo recibiste.",
  error_sin_red: "No hay conexión. Comprueba tu red y vuelve a intentarlo.",
  error_envio: "No hemos podido enviar el enlace. Vuelve a intentarlo en un momento.",
  error_demasiados_intentos:
    "Demasiados intentos seguidos. Espera un momento y vuelve a probarlo.",
  error_cuenta_deshabilitada: "Esta cuenta está deshabilitada. Escríbenos y lo miramos.",
  error_dominio_no_autorizado:
    "Desde esta dirección no se puede entrar. Abre CaliScan desde su dirección de siempre.",
  error_generico: "No hemos podido entrar. Vuelve a intentarlo en un momento.",

  /**
   * CERRAR LA VENTANA DE GOOGLE NO ES UN ERROR, y por eso este texto está aparte
   * de todos los de arriba: se dibuja en gris y en tono de nota, nunca en rojo.
   * Una alarma por una decisión de la persona es la app discutiendo con ella.
   */
  aviso_cancelado: "Has cerrado la ventana de Google. Cuando quieras, vuelve a intentarlo.",

  /**
   * Al pie, la letra chica de siempre: entrar no es comprar nada. Y recoge lo
   * que la cabecera soltó al quedarse con el eslogan — que aquí no hay ninguna
   * contraseña que inventar ni que recordar, que es la duda de quien ve dos
   * botones de entrada y ningún campo de contraseña.
   */
  pie: "Entrar es gratis y sin contraseñas. CaliScan no pide datos de pago.",
} as const;

/**
 * El código crudo de Firebase → la frase que lee una persona.
 *
 * Vive con los textos y no con la maquinaria a propósito: `auth.ts` no sabe
 * castellano y no tiene por qué. Lo que llega es `auth/invalid-email` y lo que
 * sale es una frase; los códigos que no están en la lista caen en el genérico y
 * la pantalla muestra el código chiquito, como ya hace la del escaneo, para que
 * un caso no previsto se pueda diagnosticar sin abrir la consola.
 */
const TEXTOS_POR_CODIGO: Record<string, string> = {
  "auth/invalid-email": COPY_LOGIN.error_correo_invalido,
  "auth/missing-email": COPY_LOGIN.error_correo_vacio,
  "auth/invalid-action-code": COPY_LOGIN.error_enlace_caducado,
  "auth/expired-action-code": COPY_LOGIN.error_enlace_caducado,
  "auth/network-request-failed": COPY_LOGIN.error_sin_red,
  "auth/too-many-requests": COPY_LOGIN.error_demasiados_intentos,
  "auth/user-disabled": COPY_LOGIN.error_cuenta_deshabilitada,
  "auth/unauthorized-domain": COPY_LOGIN.error_dominio_no_autorizado,
};

/** ¿Sabemos traducir este código, o hay que enseñar el código crudo al lado? */
export function conocemosElError(codigo: string): boolean {
  return codigo in TEXTOS_POR_CODIGO;
}

export function textoDeErrorDeEntrada(codigo: string): string {
  return TEXTOS_POR_CODIGO[codigo] ?? COPY_LOGIN.error_generico;
}

// ---------------------------------------------------------------------------
// La cuenta, en Perfil
// ---------------------------------------------------------------------------

export const COPY_CUENTA = {
  /**
   * Va como rótulo de la tarjeta, no solo como etiqueta accesible: es lo que
   * distingue el único bloque REAL de la pantalla de las cuatro vitrinas
   * bloqueadas que tiene debajo.
   *
   * No hay un texto para "sin nombre": cuando Google no lo da —o se entró por el
   * enlace del correo, que nunca lo da—, el renglón principal lo ocupa el correo
   * y no una frase de relleno. El correo ES la identidad; una frase que dice
   * "has entrado con este correo" encima del correo no añade nada y le roba el
   * sitio en un móvil.
   */
  titulo: "Tu cuenta",
  salir: "Cerrar sesión",
} as const;

// ---------------------------------------------------------------------------
// Los dos estados nuevos del escaneo (contrato de la WS09, §2)
// ---------------------------------------------------------------------------

/**
 * QUÉ TEXTO GANA, Y POR QUÉ.
 *
 * La casa tiene una regla vieja y buena: cuando el backend contesta, se muestra
 * SU `message_es` y no uno inventado acá — es el que sabe qué pasó. Estos textos
 * son para el otro caso: cuando el front detecta el problema por su cuenta (no
 * hay sesión antes de mandar la foto) o cuando la respuesta no trajo texto.
 *
 * Lo que sí es siempre nuestro son las SALIDAS —"Volver a entrar", "Ver los
 * planes"— y el detalle del cupo, que se arma con números y no es una frase.
 */
export const COPY_SESION = {
  titulo: "Tienes que volver a entrar",
  /** El 401 cuando el backend no llegó a hablar. */
  caducada: "Tu sesión ha caducado. Vuelve a entrar y lo intentamos otra vez.",
  /** La salida del 401: la primaria, porque es lo único que desbloquea. */
  volver_a_entrar: "Volver a entrar",
} as const;

/**
 * El bloque `quota` del 429 es OPCIONAL en el contrato: si no viene, se muestra
 * el mensaje del backend y nada más. Estas frases son el detalle que se suma
 * cuando SÍ viene — el "cuánto" y el "hasta cuándo", que es lo que de verdad
 * quiere saber quien se quedó sin fotos.
 */
export const COPY_CUPO = {
  /**
   * El título dice CUÁNDO vuelve a haber fotos, que es la única pregunta. Sin
   * el bloque `quota` no se puede decir si el freno fue el del mes o el del día,
   * así que ahí se dice lo que se sabe y nada más.
   */
  titulo: (ambito: "mes" | "dia" | null) =>
    ambito === "dia"
      ? "Ya no te quedan fotos por hoy"
      : ambito === "mes"
        ? "Ya no te quedan fotos este mes"
        : "Te has quedado sin fotos",
  usados: (usados: number, limite: number, ambito: "mes" | "dia") =>
    `Has usado ${usados} de ${limite} ${ambito === "mes" ? "fotos este mes" : "fotos hoy"}.`,
  se_renueva: (fecha: string) => `Tu cupo se renueva el ${fecha}.`,
  /**
   * La salida del 429. No promete comprar nada —la v1 es una vitrina con lista
   * de espera— pero es la única pantalla que responde a "y si quiero más".
   */
  ver_planes: "Ver los planes",
} as const;

/**
 * El detalle del cupo, en una línea: cuánto se usó y cuándo se renueva.
 *
 * `null` cuando el backend no mandó el bloque (es opcional por contrato). No es
 * un fallo: significa que la pantalla muestra el mensaje del backend y ya.
 */
export function notaDeCupo(cupo: CupoDelBackend | null): string | null {
  if (cupo === null) return null;
  const partes = [COPY_CUPO.usados(cupo.usados, cupo.limite, cupo.ambito)];
  if (cupo.se_renueva !== undefined) {
    partes.push(COPY_CUPO.se_renueva(fechaEnEspanol(cupo.se_renueva)));
  }
  return partes.join(" ");
}

/**
 * "2026-10-01" → "1 de octubre".
 *
 * SE PARTE A MANO Y NO CON `new Date("2026-10-01")` a propósito: esa forma la
 * interpreta el navegador como medianoche UTC, y en un huso al oeste de Londres
 * la fecha mostrada se corre un día hacia atrás. El corte del cupo es a
 * medianoche de Madrid (contrato §3) y el texto tiene que decir el día que dice
 * el backend, no el que salga de una conversión de zona horaria.
 *
 * Si lo que llega no tiene esa forma, se devuelve tal cual: una fecha rara es
 * mejor que un "Invalid Date" en la cara del usuario.
 */
export function fechaEnEspanol(iso: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (partes === null) return iso;
  const [, anio, mes, dia] = partes;
  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" }).format(fecha);
}
