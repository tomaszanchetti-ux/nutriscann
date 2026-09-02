/**
 * La puerta de CaliScan: la maquinaria de la identidad (card 4.1).
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTE ARCHIVO EXISTE, Y POR QUÉ ESTÁ SOLO
 *
 * Hasta la Fase 3 la app era anónima: cualquiera con la URL escaneaba contra
 * nuestra API key y el dueño de cada scan era el literal `anon-dev`. Desde esta
 * card el login es OBLIGATORIO (decisión de Tomás, 02/09/2026): sin sesión no se
 * escanea. No es un capricho de producto — es lo que hace que el cupo de fotos
 * tenga a quién contárselas y que cada plato tenga dueño.
 *
 * Todo lo que sabe de Firebase Auth está ACÁ. Los componentes no importan una
 * sola línea de `firebase/auth`: reciben y devuelven tipos de este archivo
 * (`Sesion`, `ResultadoDeEntrada`). Es la misma frontera que ya existe con el
 * backend en `api.ts` — quien mira una pantalla no debería tener que saber qué
 * SDK hay detrás.
 *
 * ---------------------------------------------------------------------------
 * LO QUE CUESTA, MEDIDO
 *
 * `firebase/auth` no es gratis: el bundle pasó de 85.536 a 114.095 bytes gzip
 * (+27,9 kB, +33 %) al encender esta card. Se midió con `npm run build` y
 * `gzip -c dist/assets/index-*.js | wc -c`, igual que las mediciones de
 * `firebase.ts` y `api.ts`.
 *
 * Y NO SE HIZO LO MISMO QUE CON FIRESTORE. Allá el SDK se cambió por `fetch` a
 * la API REST y se ahorraron 110 kB, porque lo que la app necesitaba era leer un
 * documento. Acá no aplica: el SDK de Auth no está para hacer una llamada, está
 * para SOSTENER una sesión —renovar el token antes de que venza, guardarlo donde
 * sobreviva a cerrar la PWA, canjear el código del enlace, dar la vuelta por el
 * `/__/auth/handler` de Google—. Reescribir eso a mano son cientos de líneas de
 * criptografía y de casos borde en las que un fallo no se ve: se ve el día que
 * alguien entra con la cuenta de otro. Los 27 kB se pagan.
 *
 * La palanca que SÍ queda, si algún día molestan: cargar el módulo en diferido
 * (`import()` dentro de la puerta), para que quien ya tiene sesión no descargue
 * el SDK hasta que haga falta. No se hizo en esta card porque sin sesión no hay
 * app: el 100 % de los arranques pasa por la puerta.
 * ------------------------------------------------------------------------- */
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  connectAuthEmulator,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";

import { firebaseApp } from "./firebase";

// ---------------------------------------------------------------------------
// El emulador
// ---------------------------------------------------------------------------

/**
 * ¿La identidad va al emulador de Auth en vez de al proyecto real?
 *
 * Es una variable SEPARADA de las de funciones y Firestore, con el mismo
 * criterio que ya explica `firebase.ts`: los tres casos existen por separado.
 * Probar el login contra el emulador —que deja entrar por enlace de correo SIN
 * mandar un correo real— mientras se lee la configuración publicada de verdad
 * es un caso legítimo, y atar las tres variables obligaría a apagar una para
 * usar la otra.
 *
 * Y hay un motivo extra que las otras dos no tienen: entrar de verdad manda
 * correos de verdad. Que haga falta escribir la variable a mano para NO mandarlos
 * sería exactamente al revés de lo que conviene.
 */
export const USA_EMULADOR_DE_AUTH = import.meta.env.VITE_AUTH_EMULATOR === "1";

/** Puerto del emulador de Auth. El de `firebase.json` es el 9099. */
const PUERTO_AUTH = import.meta.env.VITE_AUTH_EMULATOR_PORT ?? "9099";

/**
 * La instancia de Auth, con su persistencia declarada.
 *
 * POR QUÉ `initializeAuth` Y NO `getAuth`. `getAuth()` registra por defecto todo
 * lo que el SDK sabe hacer y elige la persistencia sola; acá las dos cosas se
 * dicen en voz alta porque las dos importan:
 *
 *   · `indexedDBLocalPersistence` primero y `browserLocalPersistence` de
 *     respaldo = LA SESIÓN SOBREVIVE A CERRAR LA APP. Es lo que hace que la PWA
 *     instalada en el teléfono no pida entrar cada vez que se abre. El respaldo
 *     no es un adorno: en el modo privado de algunos navegadores IndexedDB no
 *     está, y sin él la entrada fallaría en vez de degradarse.
 *   · `browserPopupRedirectResolver` es lo que hace funcionar el popup Y la
 *     redirección de Google. Con `initializeAuth` hay que pasarlo a mano: si
 *     falta, `signInWithPopup` falla con `auth/argument-error`.
 *
 * Se ejecuta UNA vez, al importar el módulo. Llamar a `initializeAuth` dos veces
 * sobre la misma app lanza, y por eso nadie más en el front toca `getAuth`.
 */
const auth = initializeAuth(firebaseApp, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});

if (USA_EMULADOR_DE_AUTH) {
  // Va inmediatamente después de inicializar y antes de cualquier otra cosa: el
  // SDK exige que el emulador se declare antes de la primera operación.
  //
  // `disableWarnings` apaga la BANDA AMARILLA que el SDK clava abajo de todo.
  // No es esconder nada: esa banda tapa la barra de navegación en un móvil, que
  // es justo lo que hay que mirar en el Q/A visual, y el aviso está igual en el
  // pie de diagnóstico ("Auth emulado"), que es donde ya viven los otros dos.
  connectAuthEmulator(auth, `http://127.0.0.1:${PUERTO_AUTH}`, { disableWarnings: true });
}

// ---------------------------------------------------------------------------
// Lo que el resto de la app ve
// ---------------------------------------------------------------------------

/**
 * La sesión, tal como la dibujan las pantallas.
 *
 * Es un subconjunto del `User` de Firebase a propósito: `correo` y `nombre` son
 * lo único que se muestra, y `foto` puede no venir nunca —el flujo del enlace
 * por correo no da ni nombre ni foto, y Google tampoco los da siempre—. Un tipo
 * que promete lo que a veces no llega termina en una pantalla vacía.
 */
export interface Sesion {
  uid: string;
  correo: string | null;
  nombre: string | null;
  foto: string | null;
}

function comoSesion(usuario: User | null): Sesion | null {
  if (usuario === null) return null;
  return {
    uid: usuario.uid,
    correo: usuario.email,
    nombre: usuario.displayName,
    foto: usuario.photoURL,
  };
}

/** Quién está dentro AHORA, sin esperar. `null` = nadie. */
export function usuarioActual(): Sesion | null {
  return comoSesion(auth.currentUser);
}

/**
 * Avisa cada vez que la sesión cambia y devuelve cómo dejar de escuchar.
 *
 * ⚠️ El primer aviso llega con `null` mientras el SDK todavía está leyendo la
 * sesión guardada. NO alcanza para decidir que no hay nadie: para eso está
 * `resolverEntradaPendiente()`, que espera a que Auth termine de arrancar. Sin
 * esa espera, a quien ya entró le parpadea la pantalla de login en la cara cada
 * vez que abre la app.
 */
export function observarSesion(alCambiar: (sesion: Sesion | null) => void): () => void {
  return onAuthStateChanged(auth, (usuario) => alCambiar(comoSesion(usuario)));
}

/** Cierra la sesión en este dispositivo. */
export async function salir(): Promise<void> {
  await signOut(auth);
}

/**
 * El token con el que el backend sabe quién llama.
 *
 * `null` = no hay nadie dentro. `forzar` pide uno nuevo aunque el guardado
 * parezca válido: es lo que se usa cuando el backend contesta 401 porque el
 * token venció con la foto ya en vuelo (ver `api.ts`).
 *
 * En el camino normal NO hace falta forzar: el SDK renueva solo cuando al token
 * le quedan menos de cinco minutos.
 */
export async function obtenerIdToken(forzar = false): Promise<string | null> {
  const usuario = auth.currentUser;
  if (usuario === null) return null;
  return usuario.getIdToken(forzar);
}

// ---------------------------------------------------------------------------
// Los errores
// ---------------------------------------------------------------------------

/**
 * Un fallo al entrar, con el código de Firebase intacto.
 *
 * El código viaja crudo (`auth/popup-blocked`, `auth/invalid-action-code`…) y la
 * pantalla decide qué decir: mismo reparto que con `ErrorDeAnalisis`, donde el
 * código es estable y el texto es cosa de quien dibuja. Acá el texto NO puede
 * venir del servidor —Firebase habla en inglés y para desarrolladores—, así que
 * lo escribe `copy.auth.ts`.
 */
export class ErrorDeEntrada extends Error {
  readonly codigo: string;
  constructor(codigo: string) {
    super(codigo);
    this.name = "ErrorDeEntrada";
    this.codigo = codigo;
  }
}

/** El `code` de un `FirebaseError`, o `"desconocido"` si lo que llegó no lo trae. */
function codigoDeFirebase(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const codigo = (err as { code?: unknown }).code;
    if (typeof codigo === "string") return codigo;
  }
  return "desconocido";
}

// ---------------------------------------------------------------------------
// Entrar con Google
// ---------------------------------------------------------------------------

/**
 * Cómo terminó un intento de entrar.
 *
 * `cancelado` NO es un error y por eso tiene su propio valor: cerrar la ventana
 * de Google es una decisión, no una falla, y merece una frase tranquila y no una
 * alarma roja.
 *
 * `redirigiendo` significa que la página está por irse a Google: no hay nada más
 * que hacer en este render, y la respuesta vuelve al arrancar de nuevo por
 * `resolverEntradaPendiente()`.
 */
export type ResultadoDeEntrada = "dentro" | "cancelado" | "redirigiendo";

/**
 * Los códigos en los que el popup NO es viable y hay que ir por redirección.
 *
 * Los tres pasan de verdad y ninguno es culpa del usuario: el navegador bloqueó
 * la ventana emergente, el entorno no soporta popups (webviews de Instagram o
 * de Gmail, algunas PWA instaladas) o el almacenamiento web está capado. En los
 * tres, insistir con el popup da el mismo error para siempre.
 *
 * `auth/popup-closed-by-user` NO está en la lista, y es la diferencia importante:
 * ahí el usuario cerró la ventana a propósito. Reintentar por redirección sería
 * arrastrarlo a Google contra su voluntad.
 */
const SE_RESUELVE_CON_REDIRECCION = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

/**
 * Entra con Google. Prueba el popup y cae a la redirección cuando no se puede.
 *
 * EL POPUP PRIMERO porque no tira la página: quien está en la app se queda en la
 * app, y si cambia de idea vuelve al mismo sitio. La redirección es el plan B, y
 * existe porque el popup falla de verdad en los sitios donde más se usa una PWA
 * —el navegador embebido de una red social, una PWA instalada en iPhone—.
 *
 * `prompt: "select_account"` hace que Google pregunte SIEMPRE con qué cuenta,
 * incluso si el navegador ya tiene una. Sin eso, quien tiene dos cuentas entra
 * con la que Google elija y no hay forma visible de cambiarla.
 */
export async function entrarConGoogle(): Promise<ResultadoDeEntrada> {
  const proveedor = new GoogleAuthProvider();
  proveedor.setCustomParameters({ prompt: "select_account" });

  try {
    await signInWithPopup(auth, proveedor);
    return "dentro";
  } catch (err) {
    const codigo = codigoDeFirebase(err);

    // Cerrar la ventana, o abrir una segunda que cancela la primera. Ninguna de
    // las dos es una falla que haya que contar como tal.
    if (codigo === "auth/popup-closed-by-user" || codigo === "auth/cancelled-popup-request") {
      return "cancelado";
    }

    if (SE_RESUELVE_CON_REDIRECCION.has(codigo)) {
      // A partir de acá la página se va. Lo que devuelva Google se recoge en el
      // próximo arranque, con `resolverEntradaPendiente()`.
      await signInWithRedirect(auth, proveedor);
      return "redirigiendo";
    }

    throw new ErrorDeEntrada(codigo);
  }
}

// ---------------------------------------------------------------------------
// Entrar con un enlace por correo
// ---------------------------------------------------------------------------

/**
 * Dónde se guarda el correo al que se mandó el enlace.
 *
 * Es `localStorage` y no una cookie porque es un dato de ESTE navegador y de
 * nadie más, y se borra en cuanto se usa.
 */
const CLAVE_DEL_CORREO = "caliscan:correo-del-enlace";

function recordarCorreo(correo: string): void {
  try {
    window.localStorage.setItem(CLAVE_DEL_CORREO, correo);
  } catch {
    // Modo privado, almacenamiento lleno o bloqueado por el navegador. No es
    // grave: sin el correo guardado, al volver del enlace se lo pedimos. Ese
    // camino existe igual —ver `completarEntradaPorEnlace`— porque el enlace se
    // puede abrir en otro navegador, donde este `localStorage` tampoco está.
  }
}

function correoGuardado(): string | null {
  try {
    return window.localStorage.getItem(CLAVE_DEL_CORREO);
  } catch {
    return null;
  }
}

function olvidarCorreo(): void {
  try {
    window.localStorage.removeItem(CLAVE_DEL_CORREO);
  } catch {
    // Si no se pudo guardar, tampoco hay nada que borrar.
  }
}

/**
 * Manda el enlace de entrada al correo indicado.
 *
 * `url` apunta al ORIGEN ACTUAL y no a una dirección escrita a mano: el mismo
 * build se sirve desde `app.caliscan.app`, desde el `localhost` del desarrollo y
 * desde donde haga falta mañana, y el enlace tiene que volver al sitio del que
 * salió. Una URL fija mandaría a producción a quien está probando en su máquina.
 *
 * `handleCodeInApp: true` es obligatorio en este flujo: dice que el enlace lo
 * completa la app, no una página de Firebase.
 *
 * ⚠️ El dominio del `url` tiene que estar en los dominios autorizados de Firebase
 * Auth, o esto falla con `auth/unauthorized-domain`.
 */
export async function enviarEnlaceDeCorreo(correo: string): Promise<void> {
  const limpio = correo.trim();
  try {
    await sendSignInLinkToEmail(auth, limpio, {
      url: `${window.location.origin}/`,
      handleCodeInApp: true,
    });
  } catch (err) {
    throw new ErrorDeEntrada(codigoDeFirebase(err));
  }
  // Se recuerda DESPUÉS de que el envío salió bien: guardar un correo al que
  // nunca se mandó nada dejaría a la app esperando un enlace que no existe.
  recordarCorreo(limpio);
}

/** ¿La URL con la que se abrió la app es un enlace de entrada? */
export function hayEnlaceDeEntrada(): boolean {
  return isSignInWithEmailLink(auth, window.location.href);
}

/**
 * Cómo terminó el regreso desde un enlace.
 *
 * `falta_el_correo` es EL CASO INTERESANTE y no un borde raro: el enlace llega
 * al correo, y el correo se abre a menudo en otro sitio —el navegador de la app
 * de Gmail, el escritorio, otro teléfono—. Ahí no existe el `localStorage` donde
 * guardamos la dirección, y Firebase EXIGE el correo para completar la entrada:
 * es lo que impide que alguien que intercepte el enlace entre con él.
 *
 * Fallar ahí sería castigar a la persona por una decisión del sistema operativo.
 * Se le pide el correo y se sigue.
 */
export type ResultadoDelEnlace =
  | { estado: "dentro" }
  | { estado: "falta_el_correo" }
  | { estado: "fallo"; codigo: string };

/**
 * Saca de la URL los parámetros del enlace (`oobCode`, `mode`, `apiKey`…).
 *
 * NO es cosmético. El código del enlace SIRVE UNA SOLA VEZ: si la dirección
 * queda como está, recargar la página vuelve a intentar entrar con un código ya
 * gastado y la app muestra "este enlace ya no sirve" a alguien que acaba de
 * entrar bien. Se limpia con `replaceState` para no dejar una entrada de más en
 * el historial: el botón "atrás" tiene que llevar a donde estaba antes, no a la
 * misma pantalla sin parámetros.
 */
function limpiarLaUrl(): void {
  const limpia = window.location.origin + window.location.pathname;
  window.history.replaceState(null, "", limpia);
}

/**
 * Tira el enlace que hay en la dirección y vuelve la app a un arranque limpio.
 *
 * Es la salida de quien se quedó atascado en "¿a qué correo lo pediste?" y no se
 * acuerda. Sin esto no habría ninguna: recargar volvería a la misma pantalla,
 * porque el `oobCode` sigue en la dirección. Un callejón sin salida en la puerta
 * de la app es lo peor que puede tener una puerta.
 */
export function descartarElEnlace(): void {
  olvidarCorreo();
  limpiarLaUrl();
}

/**
 * Completa la entrada con el enlace que trae la URL.
 *
 * `correoDicho` es el que la persona escribió cuando se lo pedimos; si no viene,
 * manda el que guardamos al enviar el enlace.
 */
export async function completarEntradaPorEnlace(correoDicho?: string): Promise<ResultadoDelEnlace> {
  if (!isSignInWithEmailLink(auth, window.location.href)) {
    return { estado: "fallo", codigo: "auth/invalid-action-code" };
  }

  const correo = (correoDicho ?? correoGuardado() ?? "").trim();
  if (correo === "") return { estado: "falta_el_correo" };

  try {
    await signInWithEmailLink(auth, correo, window.location.href);
    olvidarCorreo();
    limpiarLaUrl();
    return { estado: "dentro" };
  } catch (err) {
    const codigo = codigoDeFirebase(err);

    // LA URL SE LIMPIA SOLO CUANDO EL ENLACE YA NO SIRVE. Un código caducado o
    // gastado no revive: dejarlo en la dirección condena a la app a reintentarlo
    // en cada recarga. Un correo mal escrito, en cambio, NO gasta el código —el
    // servidor lo rechaza antes—, así que la dirección se conserva y la persona
    // puede corregir y entrar con el mismo enlace.
    if (codigo === "auth/invalid-action-code" || codigo === "auth/expired-action-code") {
      limpiarLaUrl();
    }
    return { estado: "fallo", codigo };
  }
}

// ---------------------------------------------------------------------------
// El arranque
// ---------------------------------------------------------------------------

/**
 * Lo que la app encontró al abrirse: nada, un enlace de correo a medio usar o el
 * regreso de una redirección a Google.
 */
export type EntradaPendiente =
  | { estado: "nada" }
  | { estado: "dentro" }
  | { estado: "falta_el_correo" }
  | { estado: "fallo"; codigo: string };

/**
 * El arranque se resuelve UNA SOLA VEZ, y esto no es una optimización.
 *
 * ⚠️ EL BUG QUE LO OBLIGÓ, cazado en el Q/A de esta card. El código del enlace
 * de correo SIRVE UNA SOLA VEZ. React en modo estricto monta cada efecto DOS
 * veces a propósito —para descubrir justo esta clase de fallos—, así que había
 * dos canjes del mismo código casi simultáneos: el primero entraba bien y el
 * segundo se estrellaba contra un código ya gastado. Como la persona ya estaba
 * dentro, el error no se veía… hasta que cerraba sesión y la pantalla de entrada
 * aparecía acusando un enlace caducado que había funcionado perfectamente.
 *
 * Y no es un problema solo del modo estricto: dos llamadas concurrentes desde
 * cualquier sitio harían lo mismo en producción. Guardar la promesa —no el
 * resultado— hace que la segunda llamada espere a la primera y reciba SU
 * respuesta, en vez de empezar un canje nuevo.
 */
let entradaEnCurso: Promise<EntradaPendiente> | null = null;

/**
 * Resuelve lo que haya quedado a medias antes de decidir si hay sesión.
 *
 * ES LO PRIMERO QUE CORRE Y HAY UN MOTIVO. La app arranca de tres maneras
 * distintas y las tres terminan acá:
 *
 *   1. abierta normalmente — no hay nada pendiente y solo hay que esperar a que
 *      Auth lea la sesión guardada;
 *   2. abierta desde el enlace del correo — el `oobCode` está en la URL y hay
 *      que canjearlo;
 *   3. de vuelta de Google por redirección — el resultado espera en el SDK.
 *
 * La espera final (`authStateReady`) es lo que evita el parpadeo: hasta que
 * Firebase no termina de decidir, la app no sabe si hay alguien dentro, y
 * mostrar el login en ese hueco es mostrárselo a quien ya entró.
 */
export function resolverEntradaPendiente(): Promise<EntradaPendiente> {
  entradaEnCurso ??= resolverUnaVez();
  return entradaEnCurso;
}

async function resolverUnaVez(): Promise<EntradaPendiente> {
  if (hayEnlaceDeEntrada()) {
    const resultado = await completarEntradaPorEnlace();
    await auth.authStateReady();
    return resultado.estado === "dentro" ? { estado: "dentro" } : resultado;
  }

  try {
    // Devuelve `null` cuando no venimos de ninguna redirección, que es el caso
    // normal. Su verdadero trabajo es dejar salir el ERROR que Google haya
    // devuelto: sin esta llamada, una redirección fallida es una app que vuelve
    // a la pantalla de entrada sin decir por qué.
    await getRedirectResult(auth);
  } catch (err) {
    await auth.authStateReady();
    return { estado: "fallo", codigo: codigoDeFirebase(err) };
  }

  await auth.authStateReady();
  return auth.currentUser !== null ? { estado: "dentro" } : { estado: "nada" };
}
