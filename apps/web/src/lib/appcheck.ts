/**
 * La prueba de que esto es la app y no un script (card 4.4).
 *
 * ---------------------------------------------------------------------------
 * QUÉ HACE, EN CRISTIANO
 *
 * El navegador le pide a reCAPTCHA Enterprise una prueba de que es un navegador
 * de verdad —sin cuadraditos ni semáforos: la evaluación es invisible y mira
 * cómo se comporta la página—, Firebase la canjea por un token firmado, y ese
 * token viaja en cada llamada a nuestro backend dentro de la cabecera
 * `X-Firebase-AppCheck`. Del otro lado se comprueba la firma
 * (`functions/src/appcheck/procedencia.ts`).
 *
 * Es la puerta que faltaba. La card 4.2 puso que hay que tener cuenta y la 4.3
 * que cada cuenta tiene un cupo, pero con una cuenta de correo gratis y un token
 * en la mano un script todavía podía llamar al endpoint desde una terminal, y
 * cada foto la paga nuestra API key. Esta cabecera es lo que un `curl` no puede
 * fabricar.
 *
 * ---------------------------------------------------------------------------
 * DOS REGLAS QUE NO SE NEGOCIAN
 *
 *   1. QUE NO HAYA TOKEN NO PUEDE ROMPER LA APP. Ni encender la app, ni sacar
 *      una foto, ni ver el reporte dependen de que reCAPTCHA conteste. Si algo
 *      falla —Google no responde, el navegador bloquea el script, el usuario
 *      tiene una extensión que lo corta— la llamada sale SIN la cabecera y el
 *      backend decide qué hacer con eso. Por eso acá no hay ni un `throw`: todo
 *      lo que puede fallar está envuelto y devuelve «no hay cabecera».
 *   2. NI HACERLA ESPERAR. Pedir el token tiene un límite de tiempo
 *      (`MS_MAXIMOS_PARA_EL_TOKEN`). Sin él, un reCAPTCHA que se cuelga dejaría
 *      la foto girando en la pantalla de espera hasta que el usuario cierre la
 *      app, que es peor que no tener App Check.
 *
 * ---------------------------------------------------------------------------
 * EL TTL DE 24 HORAS, Y POR QUÉ IMPORTA ACÁ
 *
 * La app está registrada en App Check con un TTL de 24 h, elegido para no gastar
 * el umbral gratuito de 10.000 evaluaciones al mes de reCAPTCHA (con 1 h, 400
 * personas activas lo agotarían). Eso tiene un efecto secundario bueno y hay que
 * decirlo: el token queda guardado en IndexedDB, así que una caída de reCAPTCHA
 * NO se nota mientras el token guardado siga vivo. `isTokenAutoRefreshEnabled`
 * hace que el SDK lo renueve solo, en segundo plano y antes de que caduque, en
 * vez de salir a buscarlo justo cuando alguien saca una foto.
 *
 * ---------------------------------------------------------------------------
 * EL INTERRUPTOR DE DESARROLLO, Y POR QUÉ NO SE USÓ EL «DEBUG TOKEN»
 *
 * `VITE_APP_CHECK` decide si esto se enciende (ver `.env` y
 * `.env.local.example`). En producción está en `1`; en local se apaga poniendo
 * cualquier otra cosa en `.env.local`.
 *
 * Firebase ofrece otro mecanismo para desarrollo —el DEBUG TOKEN: se pone una
 * bandera antes de inicializar, el SDK imprime un identificador en la consola y
 * uno lo registra en Firebase para que esa máquina reciba tokens buenos sin
 * pasar por reCAPTCHA—. Se evaluó y se descartó como mecanismo de todos los
 * días, por tres motivos:
 *
 *   · Es un SECRETO PERMANENTE. Un debug token registrado no caduca: si se
 *     filtra (una captura de pantalla, un repo, un log), abre la puerta desde
 *     cualquier sitio hasta que alguien se acuerde de revocarlo. Cambiar una
 *     variable de entorno no deja nada abierto.
 *   · Acá no hace falta. La clave de reCAPTCHA ya está acotada a `localhost`
 *     además de a los dominios de producción, así que poner `VITE_APP_CHECK=1`
 *     en la máquina de uno da tokens DE VERDAD contra el proyecto real. El
 *     debug token existe para cuando eso no se puede.
 *   · Y sobre todo: apagado, el circuito local reproduce EXACTAMENTE el caso que
 *     el modo observación del backend está ahí para medir —un pedido sin
 *     cabecera, que es lo que manda un teléfono con la versión vieja cacheada—.
 *     Con un debug token ese caso no se vería nunca en local.
 *
 * DÓNDE SÍ ES LA HERRAMIENTA CORRECTA, dicho para no perderlo: el ensayo previo
 * a encender el bloqueo en producción, si alguna vez hay que hacerlo desde un
 * entorno que no esté en la lista de dominios de la clave.
 */
import { initializeAppCheck, getToken, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";
import type { FirebaseApp } from "firebase/app";

/**
 * La clave de reCAPTCHA Enterprise. ES PÚBLICA por diseño —va en el HTML de
 * cualquier sitio que la use— y por eso vive en `apps/web/.env`, versionado,
 * junto a la identidad del proyecto Firebase. Lo que la protege no es el
 * secreto: es que está acotada a nuestros dominios.
 */
const CLAVE_RECAPTCHA = import.meta.env.VITE_APP_CHECK_SITE_KEY ?? "";

/**
 * ¿Se enciende App Check en este build?
 *
 * Variable EXPLÍCITA y no `import.meta.env.DEV`, con el mismo criterio que las
 * tres del emulador en `firebase.ts`: correr en local CON App Check encendido
 * contra el proyecto real es un caso legítimo (es como se ensaya antes de
 * encender el bloqueo), y atarlo al modo de Vite lo haría imposible.
 *
 * Sin clave no se enciende aunque la variable diga que sí: un
 * `initializeAppCheck` con la clave vacía falla igual, y es mejor que falle
 * apagado y en silencio que a mitad de la primera foto.
 */
export const APP_CHECK_ENCENDIDO =
  import.meta.env.VITE_APP_CHECK === "1" && CLAVE_RECAPTCHA.length > 0;

/**
 * Cuánto se espera el token antes de mandar la foto sin él.
 *
 * Cuatro segundos son mucho para el camino normal —el token está en IndexedDB y
 * se devuelve al instante— y poco para una espera de verdad. El número no está
 * para el caso bueno: está para que un reCAPTCHA colgado no deje la foto girando
 * en la pantalla hasta que la persona cierre la app.
 */
const MS_MAXIMOS_PARA_EL_TOKEN = 4_000;

/** El nombre de la cabecera. Lo elige Firebase, no nosotros. */
const CABECERA = "X-Firebase-AppCheck";

let appCheck: AppCheck | null = null;

/**
 * Enciende App Check. La llama `firebase.ts` INMEDIATAMENTE después de
 * `initializeApp`, y ese orden es el que pide el SDK: App Check tiene que estar
 * activado antes de que se use cualquier otro servicio de Firebase.
 *
 * Recibe la app por parámetro en vez de importarla para no crear un círculo
 * entre los dos archivos (`firebase.ts` → `appcheck.ts`, y nada de vuelta).
 *
 * NO LANZA NUNCA. Si `initializeAppCheck` falla —una clave mal escrita, un
 * navegador que bloquea el script de Google— la app arranca igual, sin
 * procedencia, y el backend lo anota. Que un candado no se pueda montar no
 * puede ser lo mismo que una app que no abre.
 */
export function encenderAppCheck(app: FirebaseApp): void {
  if (!APP_CHECK_ENCENDIDO) return;
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(CLAVE_RECAPTCHA),
      // El SDK renueva el token solo, en segundo plano, antes de que caduque.
      // Sin esto habría que salir a buscarlo justo cuando alguien saca una foto
      // —el peor momento— y cada 24 h una persona pagaría esa espera.
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    appCheck = null;
    // A la consola y no a la pantalla: es un problema de configuración nuestro,
    // no algo que el usuario pueda arreglar ni tenga que leer.
    console.warn("App Check no se pudo inicializar; las llamadas van sin procedencia", err);
  }
}

/**
 * La cabecera con el token de App Check, o un objeto vacío.
 *
 * Devuelve `{}` —y no lanza— en TODOS los casos en los que no hay token:
 * apagado por configuración, no se pudo inicializar, reCAPTCHA falló, o tardó
 * más de la cuenta. Quien la usa la esparce sobre las cabeceras que ya arma
 * (`{ ...await cabeceraDeAppCheck() }`) y no necesita saber nada de esto.
 *
 * Un `{}` no es un fallo silencioso: es el caso que el modo observación del
 * backend está midiendo. Lo que se pierde es la procedencia, no el análisis.
 */
export async function cabeceraDeAppCheck(): Promise<Record<string, string>> {
  if (appCheck === null) return {};
  try {
    const resultado = await conTiempoLimite(getToken(appCheck), MS_MAXIMOS_PARA_EL_TOKEN);
    if (resultado === null || typeof resultado.token !== "string" || resultado.token.length === 0) {
      return {};
    }
    return { [CABECERA]: resultado.token };
  } catch {
    // `getToken` lanza cuando reCAPTCHA no contesta, cuando el dominio no está
    // en la clave, o cuando el navegador bloqueó el script. Ninguna de esas
    // cosas es motivo para no analizar una foto: se manda sin cabecera.
    return {};
  }
}

/**
 * Espera una promesa como mucho `ms` milisegundos; `null` si se acabó el tiempo.
 *
 * El temporizador se limpia siempre, también cuando gana la promesa: un
 * temporizador vivo en una PWA que está en segundo plano es batería del teléfono
 * de alguien.
 */
async function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promesa,
      new Promise<null>((resolver) => {
        temporizador = setTimeout(() => resolver(null), ms);
      }),
    ]);
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
}
