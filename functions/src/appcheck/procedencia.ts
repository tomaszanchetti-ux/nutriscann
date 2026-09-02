/**
 * DE DÓNDE VIENE ESTE PEDIDO. La tercera puerta, y la última que quedaba abierta.
 *
 * ---------------------------------------------------------------------------
 * QUÉ PROBLEMA CIERRA, Y POR QUÉ NO LO CERRABAN LAS OTRAS DOS
 *
 * La card 4.2 puso que hay que tener cuenta; la 4.3, que cada cuenta tiene un
 * cupo. Las dos miran A QUIÉN se le cobra. Ninguna mira DESDE DÓNDE llama: con
 * una cuenta de correo gratis y un token válido en la mano, un script puede
 * llamar al endpoint desde una terminal —quince fotos al mes, y a repetir con
 * otra cuenta— y cada foto la paga nuestra API key de Anthropic.
 *
 * App Check es lo que distingue «esto viene de nuestra PWA, abierta en un
 * navegador de verdad» de «esto viene de un `curl`». El navegador le pide a
 * reCAPTCHA Enterprise una prueba de que es un navegador y no un robot, Firebase
 * la canjea por un token firmado, y el token viaja en la cabecera
 * `X-Firebase-AppCheck`. Acá se verifica esa firma. Un `curl` no tiene forma de
 * fabricarla: no hay navegador que le resuelva el desafío.
 *
 * NO REEMPLAZA A LAS OTRAS DOS Y NO SE SOLAPA CON ELLAS. Son tres preguntas
 * distintas —quién sos, cuánto te queda, desde dónde llamás— y hacen falta las
 * tres. App Check no sabe quién es nadie; la identidad no sabe desde dónde
 * llaman.
 *
 * ---------------------------------------------------------------------------
 * DOS MODOS, Y EL INTERRUPTOR NO ESTÁ EN EL CÓDIGO
 *
 * Encender un candado nuevo de golpe en una app que ya está viva es la forma
 * más rápida de dejar afuera a los usuarios de verdad: los teléfonos con la
 * versión vieja cacheada no mandan la cabecera, y esos pedidos son legítimos.
 *
 * Por eso hay dos modos y el que manda es un campo de `config/app`
 * (`app_check_enforced`, ver `config.ts`), no una constante de este archivo:
 *
 *   OBSERVACIÓN (`false`, el arranque en frío)  se verifica igual y el resultado
 *      se ANOTA en el log, pero no bloquea nada. Es lo que deja mirar una semana
 *      de tráfico real y saber cuántos pedidos llegan sin cabecera antes de
 *      cerrar la puerta.
 *   BLOQUEO (`true`)  el pedido sin cabecera o con una firma que no verifica se
 *      responde 403 y no llega ni a validar el cuerpo.
 *
 * Se enciende editando un campo en la consola de Firebase, sin desplegar, y se
 * apaga igual. El cambio tarda a lo sumo un minuto en verse (la caché de
 * `loadConfig`). Esa marcha atrás de un minuto es la red de seguridad de todo
 * esto: si el bloqueo resultara estar echando a gente de verdad, se apaga sin
 * esperar un despliegue.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ LO QUE EL ADMIN SDK **NO** NOS DEJA DISTINGUIR, Y HAY QUE SABERLO
 *
 * `verifyToken()` levanta el mismo error (`invalid-argument`) para dos cosas que
 * no se parecen en nada: «este token está mal firmado» y «no pudimos bajar las
 * claves públicas de Google para comprobarlo». Está comprobado leyendo el
 * paquete instalado: `firebase-admin/lib/app-check/token-verifier.js`, en
 * `mapJwtErrorToAppCheckError`, el último `return` mete en `invalid-argument`
 * todo lo que no sea «vencido», y ahí cae también el `KEY_FETCH_ERROR` de
 * `utils/jwt.js`.
 *
 * O sea: NO se puede escribir «si la culpa es de la red, dejalo pasar», porque
 * desde acá una caída de Google y un token falsificado se ven idénticos. Lo
 * único que sí se distingue —y por eso es lo que se hace— es que la
 * verificación NO CONTESTE: si tarda más de `MS_MAXIMOS_DE_VERIFICACION`, el
 * resultado es `indeterminada`, que no bloquea NUNCA, ni en modo bloqueo. Un
 * cuelgue nuestro no puede convertirse en una app muerta; para el resto está el
 * interruptor.
 *
 * ---------------------------------------------------------------------------
 * SEPARACIÓN DECISIÓN / IO, hermana de `auth/identidad.ts`
 *
 * Acá viven el parseo de la cabecera y la decisión (puras, se prueban con una
 * tabla) y el TIPO del verificador; la llamada real al Admin SDK es
 * `crearVerificadorDeAppCheck()`, entra por `Dependencias` y en los tests se
 * reemplaza por una función. El camino completo sigue corriendo sin red.
 */
import { getAppCheck } from "firebase-admin/app-check";

import { resolverTexto } from "../analyze/errores";
import type { CabecerasDelPedido } from "../auth/identidad";

/**
 * La cabecera en la que viaja el token. La elige Firebase, no nosotros: es la
 * que mandan sus propios SDK de cliente y la que espera su backend.
 */
export const CABECERA_APP_CHECK = "x-firebase-appcheck";

/**
 * Cuánto se espera a que la verificación conteste antes de darla por
 * `indeterminada`.
 *
 * Tres segundos son muchísimo para lo que esto hace: la firma se comprueba EN
 * MEMORIA contra unas claves públicas que el SDK cachea, así que solo la
 * primera verificación de una instancia fría sale a la red. El número no está
 * para ajustar la latencia —no la ajusta—; está para que un cuelgue de esa
 * única llamada no deje al pedido esperando hasta que se agote el timeout de la
 * función entera.
 */
export const MS_MAXIMOS_DE_VERIFICACION = 3_000;

/** Lo que devuelve un verificador cuando el token verifica. */
export interface AppVerificada {
  /** El `appId` de la app de Firebase que pidió el token. */
  app_id: string;
}

/** Verifica un token de App Check. Lanza si no verifica. IO, inyectado. */
export type VerificadorDeAppCheck = (token: string) => Promise<AppVerificada>;

/**
 * De dónde vino el pedido, en cuatro estados y ni uno más.
 *
 * La diferencia entre `ausente` y `rechazada` no es cosmética: la primera es lo
 * que manda un teléfono con la versión vieja cacheada (y también un `curl`), y
 * la segunda es un token que existe pero no verifica. En la semana de
 * observación son las dos cifras que hay que mirar por separado, porque
 * significan cosas distintas: si `ausente` no baja a cero, todavía hay
 * clientes viejos vivos y encender el bloqueo los echaría.
 */
export type ResultadoDeAppCheck =
  | { estado: "valida"; app_id: string }
  | { estado: "ausente" }
  | { estado: "rechazada"; motivo: string }
  | { estado: "indeterminada"; motivo: string };

/**
 * Saca el token de la cabecera `X-Firebase-AppCheck`. Puro.
 *
 * Insensible a mayúsculas por el mismo motivo que su hermana de `identidad.ts`:
 * Express ya las entrega en minúscula, pero este módulo también lo llaman los
 * tests y algún día otro adaptador, y una cabecera que está pero no se
 * encuentra sería un 403 imposible de diagnosticar.
 */
export function extraerTokenDeAppCheck(cabeceras: CabecerasDelPedido): string | null {
  for (const [clave, valor] of Object.entries(cabeceras)) {
    if (clave.toLowerCase() !== CABECERA_APP_CHECK) continue;
    // Repetida llega como array: vale la primera. Dos tokens distintos son un
    // pedido ambiguo, no una elección nuestra (mismo criterio que Authorization).
    const texto = Array.isArray(valor) ? valor[0] : valor;
    if (typeof texto === "string" && texto.trim().length > 0) return texto.trim();
  }
  return null;
}

/**
 * Mira de dónde viene el pedido. NUNCA lanza: devuelve uno de los cuatro
 * estados y deja que la decisión la tome quien sabe si el bloqueo está
 * encendido.
 *
 * `verificar` es opcional a propósito y su ausencia NO es un rechazo: significa
 * que en este montaje no hay quién verifique (un test, o un adaptador al que se
 * le olvidó inyectarlo). Eso es un problema nuestro, no del que llama, así que
 * cae en `indeterminada` —que no bloquea— y se grita en el log. Fallar cerrado
 * ahí sería apagar la app entera por un cable suelto del backend.
 */
export async function comprobarProcedencia(
  cabeceras: CabecerasDelPedido,
  verificar: VerificadorDeAppCheck | undefined,
  msMaximos: number = MS_MAXIMOS_DE_VERIFICACION,
): Promise<ResultadoDeAppCheck> {
  const token = extraerTokenDeAppCheck(cabeceras);
  if (token === null) return { estado: "ausente" };

  if (verificar === undefined) {
    return { estado: "indeterminada", motivo: "no hay verificador de App Check inyectado" };
  }

  let app: AppVerificada | typeof SE_ACABO_EL_TIEMPO;
  try {
    app = await conTiempoLimite(verificar(token), msMaximos);
  } catch (err) {
    // Acá cae TODO lo que el SDK considera un token que no sirve. Ver el aviso
    // de arriba: una caída de las claves públicas de Google entra por esta misma
    // rama y no hay forma de distinguirla. Por eso el modo observación existe.
    return { estado: "rechazada", motivo: describir(err) };
  }

  if (app === SE_ACABO_EL_TIEMPO) {
    return { estado: "indeterminada", motivo: `la verificación no contestó en ${msMaximos} ms` };
  }
  if (typeof app.app_id !== "string" || app.app_id.trim().length === 0) {
    return { estado: "rechazada", motivo: "el token verificó pero no trae un `app_id` usable" };
  }
  return { estado: "valida", app_id: app.app_id.trim() };
}

// ---------------------------------------------------------------------------
// La decisión (pura)
// ---------------------------------------------------------------------------

/** Qué hacer con lo que se encontró. */
export interface VeredictoDeProcedencia {
  /** ¿Se corta el pedido acá? */
  bloquea: boolean;
  /**
   * Qué escribir en el log:
   *   `silencio` no hay nada que contar (todo bien);
   *   `aviso`    el pedido no trae una procedencia buena — es LA cifra de la
   *              semana de observación, y lo que justifica el 403 cuando el
   *              bloqueo está encendido;
   *   `alarma`   no pudimos comprobarlo y el problema es NUESTRO. Nunca bloquea,
   *              y por eso mismo hay que verlo: en modo bloqueo, una alarma
   *              repetida significa que la puerta está abierta de par en par.
   */
  nivel: "silencio" | "aviso" | "alarma";
}

/**
 * La regla entera, en una función pura de dos entradas.
 *
 * Está separada de `comprobarProcedencia` a propósito, y es el mismo corte que
 * el resto del backend hace en todos lados (decisión aparte de la lectura): el
 * interruptor se puede probar con una tabla de cuatro por dos, sin red, sin
 * emulador y sin poder equivocarse. Un test que rompa esta tabla dice
 * exactamente qué combinación cambió.
 */
export function decidirProcedencia(
  resultado: ResultadoDeAppCheck,
  exigido: boolean,
): VeredictoDeProcedencia {
  switch (resultado.estado) {
    case "valida":
      return { bloquea: false, nivel: "silencio" };
    case "indeterminada":
      // NUNCA bloquea, ni con el bloqueo encendido. Es la única promesa dura de
      // este archivo: un fallo de nuestra infraestructura no puede echar de la
      // app a quien sí tenía derecho a entrar.
      return { bloquea: false, nivel: "alarma" };
    case "ausente":
    case "rechazada":
      return { bloquea: exigido, nivel: "aviso" };
  }
}

// ---------------------------------------------------------------------------
// El error, y el 403
// ---------------------------------------------------------------------------

/**
 * El código de error del bloqueo.
 *
 * ⚠️ VIVE ACÁ Y NO EN `analyze/errores.ts`, y es TEMPORAL. La lista `ERRORES`
 * de aquel archivo es la casa de todos los códigos del endpoint y ahí tiene que
 * terminar este también; está fuera del territorio de esta card (lo escribe otro
 * agente en paralelo), así que la definición se declara acá con la MISMA forma
 * —`status`, `clave_copy`, `texto_en_frio`— y el reporte de la card dice
 * exactamente qué fila hay que agregar. Cuando se integre, este bloque se borra
 * y `respuestaDeAppCheck` pasa a ser `respuestaDeError("app_check_invalido", …)`.
 */
export const CODIGO_APP_CHECK = "app_check_invalido" as const;

/**
 * 403 y no 401, y la diferencia importa: un 401 le dice al usuario «volvé a
 * entrar», y volver a entrar acá no arregla nada. Lo que falla no es quién es,
 * es desde dónde llama. Tampoco es 429: no se quedó sin nada.
 *
 * El texto en frío está en español de España y sin voseo (regla DT-21), como los
 * dos que estrenó la card 4.2. No nombra a App Check ni a reCAPTCHA: a la
 * persona que lo lea no le sirve saberlo, y a quien esté probando el endpoint
 * con un script, menos.
 */
export const DEFINICION_APP_CHECK = {
  status: 403,
  clave_copy: "error_app_check",
  texto_en_frio: "No hemos podido verificar que este acceso venga de la app. Ábrela desde tu navegador o actualízala e inténtalo de nuevo.",
} as const;

/** El cuerpo del 403, con la misma forma que `CuerpoDeError` de `errores.ts`. */
export interface CuerpoDeErrorDeAppCheck {
  error: {
    code: typeof CODIGO_APP_CHECK;
    message_es: string;
    copy_source: "config" | "cold-start-default";
  };
}

/**
 * El error que corta el circuito. Lleva adentro el resultado que lo motivó para
 * que quien lo atrapa pueda anotarlo sin volver a mirar la cabecera.
 */
export class ErrorDeAppCheck extends Error {
  readonly resultado: ResultadoDeAppCheck;

  constructor(resultado: ResultadoDeAppCheck) {
    super(`${CODIGO_APP_CHECK}: ${resultado.estado}`);
    this.name = "ErrorDeAppCheck";
    this.resultado = resultado;
  }
}

/**
 * El 403 armado, con su texto resuelto contra el copy publicado.
 *
 * Usa el `resolverTexto` de `errores.ts` —el mismo que el resto de los errores—
 * para que el día que la clave `error_app_check` se publique en `config/app.copy`
 * este texto se cambie sin desplegar, igual que todos los demás.
 */
export function respuestaDeAppCheck(copy: Record<string, string>): {
  status: number;
  body: CuerpoDeErrorDeAppCheck;
} {
  const texto = resolverTexto(
    DEFINICION_APP_CHECK.clave_copy,
    DEFINICION_APP_CHECK.texto_en_frio,
    copy,
  );
  return {
    status: DEFINICION_APP_CHECK.status,
    body: {
      error: {
        code: CODIGO_APP_CHECK,
        message_es: texto.message_es,
        copy_source: texto.copy_source,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// El IO de verdad
// ---------------------------------------------------------------------------

/**
 * El verificador real: el Admin SDK contra la firma de Firebase App Check.
 *
 * Sin `{ consume: true }` a propósito. Esa opción activa la protección contra
 * REPETICIÓN —marca el token como gastado— y cuesta una llamada de red al
 * backend de App Check en CADA análisis, además de obligar al navegador a
 * resolver un desafío de reCAPTCHA nuevo cada vez. Con el TTL de 24 h que tiene
 * configurada la app eso agotaría en días el umbral gratuito de 10.000
 * evaluaciones al mes. Lo que compra —que un token robado no se pueda usar dos
 * veces— ya lo cubren la identidad y el cupo: el que repita un token ajeno
 * necesita además el ID token de esa persona, y gasta el cupo de ella.
 */
export function crearVerificadorDeAppCheck(): VerificadorDeAppCheck {
  return async (token: string) => {
    const decodificado = await getAppCheck().verifyToken(token);
    return { app_id: decodificado.appId };
  };
}

// ---------------------------------------------------------------------------
// Andamiaje
// ---------------------------------------------------------------------------

/** El testigo de que se acabó el tiempo. Un símbolo: no se puede confundir. */
const SE_ACABO_EL_TIEMPO = Symbol("app-check-sin-respuesta");

/**
 * Espera una promesa como mucho `ms` milisegundos.
 *
 * El temporizador se limpia SIEMPRE —también cuando gana la promesa—: una
 * función de Cloud Functions que se queda con temporizadores vivos puede
 * mantenerse despierta después de contestar, y eso se paga.
 */
async function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T | typeof SE_ACABO_EL_TIEMPO> {
  let temporizador: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<typeof SE_ACABO_EL_TIEMPO>((resolver) => {
        temporizador = setTimeout(() => resolver(SE_ACABO_EL_TIEMPO), ms);
      }),
    ]);
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
}

function describir(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
