/**
 * Cliente del backend de CaliScan.
 *
 * Toda llamada al servidor pasa por acá — la app nunca arma URLs sueltas.
 */
import { cabeceraDeAppCheck } from "./appcheck";
import { obtenerIdToken, usuarioActual } from "./auth";
import { COPY_SESION } from "./copy.auth";
import { functionUrl } from "./firebase";
import {
  RESPUESTA_DE_FIXTURE,
  respuestaDeFixtureCompleta,
  respuestaDeFixtureSinTotal,
} from "./fixtures/scan.fixture";
import type { ImagenComprimida } from "./imagen";
import type { CupoDelBackend, ErrorDelBackend, RespuestaDeAnalisis } from "./types";

export interface HealthReport {
  status: "ok" | "error";
  backend_version: string;
  kb_version: string | null;
  kb_status: string;
  config_source: "firestore" | "cold-start-defaults";
  region: string;
  latency_ms: number;
  checked_at: string;
}

/** Pregunta al backend si está vivo y qué versión del catálogo publica. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthReport> {
  let res: Response;
  try {
    res = await fetch(functionUrl("health"), { signal });
  } catch (err) {
    // fetch solo lanza por fallas de red: sin conexión, DNS, o —lo más probable
    // durante la Fase 0— la función todavía no desplegada.
    if (signal?.aborted) throw err;
    throw new Error(
      "No hay respuesta en la dirección del backend. Revisa tu conexión, o que la función esté desplegada.",
    );
  }

  if (!res.ok) {
    throw new Error(`El backend respondió con un error ${res.status}.`);
  }
  return (await res.json()) as HealthReport;
}

// ---------------------------------------------------------------------------
// El análisis de una foto
// ---------------------------------------------------------------------------

/**
 * ¿La app trabaja con el fixture en vez de llamar al backend?
 *
 * Existe porque el front (card 2.3) y el endpoint (card 2.2) se construyeron EN
 * PARALELO contra el mismo contrato: sin esta rama, mirar el reporte era esperar
 * a que el backend estuviera terminado. Se enciende con `VITE_ANALYZE_FIXTURE=1`
 * en `apps/web/.env.local` y se apaga borrando esa línea — ver
 * `apps/web/.env.local.example`.
 *
 * Es explícita, como la del emulador, y NO depende del modo dev de Vite: correr
 * en local contra el backend de verdad tiene que seguir siendo lo normal.
 *
 * LA CARD 3.2 LE SUMÓ TRES MODOS MÁS, y por un motivo concreto: los estados de
 * la espera y del error no se pueden mirar a voluntad contra un backend que
 * anda bien. `lento` deja ver el barrido entero y la rotación de los tres pasos;
 * `error` muestra la pantalla de error con su reintento; `no_es_comida` muestra
 * el 200 sin números. Ninguno agrega código al camino real: la misma rama que ya
 * existía, con más valores en vez de uno, apagada salvo que alguien escriba la
 * variable a mano. El pie de la pantalla avisa en amarillo cuál está activo.
 *
 * LA CARD 3.1 LE SUMÓ DOS MÁS, por el mismo motivo y para el donut de doble
 * anillo: `completo` muestra el total con sus tres subdivisiones dibujadas y
 * `sin_total` muestra el plato que no tiene números. Son los dos estados que el
 * plato del fixture —un total parcial, con dos subdivisiones sin medir— no puede
 * mostrar, y contra un backend real dependen de qué salga en la foto.
 *
 * ⚠️ POR QUÉ ESTO SE ESCRIBE CON COMPARACIONES SUELTAS Y NO CON UN MAPA. Vite
 * reemplaza `import.meta.env.VITE_ANALYZE_FIXTURE` por su valor literal en el
 * build (`undefined` cuando nadie la declaró), así que esta cadena se pliega a
 * `null` en tiempo de compilación, `USA_FIXTURE_DE_ANALISIS` queda en `false`
 * constante y el empaquetador BORRA la rama entera — con el fixture adentro.
 * Un `MODOS[...]` no se puede plegar, y entonces el plato de mentira (7,6 kB de
 * JSON) viaja a producción. Se midió: con el mapa el bundle pasó de 241,5 a
 * 249,1 kB. Si esta parte se toca, hay que volver a mirar el tamaño.
 *
 * ⚠️ Y LOS PLATOS DERIVADOS SON FUNCIONES, NO CONSTANTES, por lo mismo. La card
 * 3.1 los escribió primero como constantes de módulo (`const X = armarPlato()`)
 * y el empaquetador no pudo borrarlas —una llamada podría tener efectos—, así
 * que el fixture entero volvió a producción: el bundle saltó de 257,7 a 269,0
 * kB. Adentro de una función solo se las llama desde esta rama, que se pliega a
 * `false`, y el módulo entero se va. Medido después del arreglo: 263,1 kB, sin
 * una sola cadena del fixture adentro.
 *
 * LA CARD 4.1 LE SUMÓ DOS MÁS, por el mismo motivo de siempre: los dos estados
 * que la identidad trae —`sin_sesion` (el 401) y `sin_cupo` (el 429)— tampoco se
 * pueden mirar a voluntad contra un backend que anda bien. El segundo, encima,
 * exigiría gastar quince fotos de verdad para verlo una vez.
 *
 * ⚠️ Y HAY UNA DIFERENCIA CON LOS OTROS MODOS QUE HAY QUE DECIR: los textos de
 * `error` y `no_es_comida` son copias byte a byte de `functions/src/analyze/
 * errores.ts`, porque una demo que inventa su propio texto no es demo de nada.
 * Estos dos NO pueden serlo todavía: los textos de `no_autenticado` y
 * `cupo_agotado` los está escribiendo la card 4.2 en este mismo momento (contrato
 * de la WS09, §2). `sin_sesion` usa el texto PROPIO del front —el que se muestra
 * cuando no hay ni sesión que mandar, y que sí es real— y `sin_cupo` usa un
 * texto de relleno marcado como tal. El día que el backend esté escrito, el de
 * `sin_cupo` se copia de allá igual que los otros dos. Declarado, no olvidado.
 */
export type ModoDeDemo =
  | "reporte"
  | "completo"
  | "sin_total"
  | "lento"
  | "no_es_comida"
  | "error"
  | "sin_sesion"
  | "sin_cupo";

const MODO_PEDIDO = import.meta.env.VITE_ANALYZE_FIXTURE;

/** El modo pedido por `VITE_ANALYZE_FIXTURE`, o `null` = hablar con el backend. */
export const MODO_DE_DEMO: ModoDeDemo | null =
  // El "1" histórico se conserva: es lo que dice `.env.local.example` desde la
  // card 2.3 y lo que puede haber en la máquina de cualquiera.
  MODO_PEDIDO === "1" || MODO_PEDIDO === "reporte"
    ? "reporte"
    : MODO_PEDIDO === "completo"
      ? "completo"
      : MODO_PEDIDO === "sin_total"
        ? "sin_total"
        : MODO_PEDIDO === "lento"
          ? "lento"
          : MODO_PEDIDO === "error"
            ? "error"
            : MODO_PEDIDO === "no_es_comida"
              ? "no_es_comida"
              : MODO_PEDIDO === "sin_sesion"
                ? "sin_sesion"
                : MODO_PEDIDO === "sin_cupo"
                  ? "sin_cupo"
                  : null;

export const USA_FIXTURE_DE_ANALISIS = MODO_DE_DEMO !== null;

/** Cuánto simula tardar el fixture, para que la pantalla de espera se vea. */
const DEMORA_DEL_FIXTURE_MS = 2600;

/** Lo que tarda el modo `lento`: alcanza para ver el barrido y los tres pasos. */
const DEMORA_LENTA_MS = 14000;

/** La demora del modo activo. `VITE_ANALYZE_FIXTURE_MS` la pisa, si se declara. */
function demoraDeLaDemo(modo: ModoDeDemo): number {
  const pedida = Number(import.meta.env.VITE_ANALYZE_FIXTURE_MS);
  if (Number.isFinite(pedida) && pedida > 0) return pedida;
  return modo === "lento" ? DEMORA_LENTA_MS : DEMORA_DEL_FIXTURE_MS;
}

/**
 * Un error del análisis con su código estable.
 *
 * `codigo` es el `error.code` del backend cuando el backend contestó, y uno
 * nuestro cuando la falla fue de este lado (`sin_red`, `imagen_ilegible`,
 * `respuesta_ilegible`). El texto ya viene en español y listo para mostrar.
 */
export class ErrorDeAnalisis extends Error {
  readonly codigo: string;
  /**
   * El bloque `quota` del 429, cuando el backend lo mandó (contrato WS09 §2: es
   * OPCIONAL). Es lo que deja decir "has usado 15 de 15 y se renueva el 1 de
   * octubre" en vez de solo "te quedaste sin fotos".
   */
  readonly cupo: CupoDelBackend | null;
  constructor(codigo: string, mensaje: string, cupo: CupoDelBackend | null = null) {
    super(mensaje);
    this.name = "ErrorDeAnalisis";
    this.codigo = codigo;
    this.cupo = cupo;
  }
}

function esErrorDelBackend(cuerpo: unknown): cuerpo is ErrorDelBackend {
  if (typeof cuerpo !== "object" || cuerpo === null) return false;
  const error = (cuerpo as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const { code, message_es } = error as { code?: unknown; message_es?: unknown };
  return typeof code === "string" && typeof message_es === "string";
}

/**
 * Lee el bloque `quota` SIN confiar en que venga ni en que venga entero.
 *
 * El contrato lo declara opcional, así que la ausencia es normal y no un fallo:
 * sin él se muestra el `message_es` y ya. Y se comprueba campo por campo porque
 * un `usados` que llegara como texto pintaría "has usado undefined de 15".
 */
function leerCupo(cuerpo: ErrorDelBackend): CupoDelBackend | null {
  const cupo = cuerpo.error.quota;
  if (typeof cupo !== "object" || cupo === null) return null;
  const { ambito, usados, limite } = cupo;
  if (ambito !== "mes" && ambito !== "dia") return null;
  if (typeof usados !== "number" || typeof limite !== "number") return null;
  return {
    ambito,
    usados,
    limite,
    se_renueva: typeof cupo.se_renueva === "string" ? cupo.se_renueva : undefined,
  };
}

export interface OpcionesDeAnalisis {
  signal?: AbortSignal;
}

/**
 * Manda la foto ya comprimida a `analyze` y devuelve el reporte.
 *
 * El contrato (WS04, actualizado por el de la WS09 §1):
 *   POST { image_base64, media_type }  ·  Authorization: Bearer <idToken>
 *                                      ·  X-Firebase-AppCheck: <token>
 *   200  { scan_id, is_food, items, totals, meta }
 *   ≠200 { error: { code, message_es, quota? } }
 *
 * La cabecera de App Check (card 4.4) PUEDE FALTAR y el pedido sale igual: en
 * local está apagada y en producción reCAPTCHA puede fallar. Qué hace el backend
 * cuando falta lo decide un interruptor de `config/app`; hoy solo lo anota.
 *
 * `owner_id` YA NO VIAJA. Hasta la Fase 3 el dueño del scan era un literal que
 * mandaba el navegador —y que el navegador podía inventarse—; desde la card 4.1
 * el dueño es el `uid` del token verificado del lado del servidor, que es la
 * única forma de que "mis platos" signifique algo. El backend ignora el campo si
 * un cliente viejo cacheado en un teléfono lo sigue mandando durante unos días.
 */
export async function analizarFoto(
  imagen: ImagenComprimida,
  opciones: OpcionesDeAnalisis = {},
): Promise<RespuestaDeAnalisis> {
  // La guarda es el booleano constante, no `MODO_DE_DEMO !== null`: es lo que
  // deja que el empaquetador se lleve puesta esta rama cuando nadie la encendió.
  if (USA_FIXTURE_DE_ANALISIS && MODO_DE_DEMO !== null) {
    await new Promise((listo) => setTimeout(listo, demoraDeLaDemo(MODO_DE_DEMO)));

    if (MODO_DE_DEMO === "error") {
      // El texto es EL MISMO que el backend manda para este código (ver
      // `functions/src/analyze/errores.ts`, `modelo_no_disponible`): una demo de
      // la pantalla de error que inventa su propio texto no es una demo de nada.
      //
      // ⚠️ Por eso la pasada de España (DT-21, card 3.4) NO lo tocó, aunque
      // vosea: corregirlo acá lo separaría del texto real y la demo pasaría a
      // mentir. Se corrige el día que se corrija el del backend — que hoy no se
      // puede hacer sin desplegar, porque su clave de copy no está entre las 47
      // de `config/copy.json`. Declarado, no olvidado.
      throw new ErrorDeAnalisis(
        "modelo_no_disponible",
        "El servicio de análisis está ocupado. Prueba de nuevo en un momento.",
      );
    }

    if (MODO_DE_DEMO === "sin_sesion") {
      // El 401 del contrato (§2). El texto es el PROPIO del front —el mismo que
      // se muestra cuando ni siquiera hay sesión que mandar— y no una copia del
      // del backend, que todavía no está escrito. En producción, cuando el
      // backend contesta, gana el suyo.
      throw new ErrorDeAnalisis("no_autenticado", COPY_SESION.caducada);
    }

    if (MODO_DE_DEMO === "sin_cupo") {
      // El 429 del contrato (§2), con su bloque `quota` completo: 15 al mes es
      // el cupo del plan gratuito (`docs/PLAN.md` §6.7) y el 1 de octubre es el
      // corte del mes siguiente en Europe/Madrid.
      //
      // ⚠️ EL TEXTO ES DE RELLENO Y ESTÁ DICHO: el de verdad lo escribe la card
      // 4.2 en `functions/src/analyze/errores.ts` y hay que copiarlo acá tal cual
      // cuando exista, como ya se hizo con `modelo_no_disponible` y
      // `error_not_food`. Hasta entonces, esta demo enseña la PANTALLA bien y el
      // texto solo aproximado.
      throw new ErrorDeAnalisis(
        "cupo_agotado",
        "Has agotado tu cupo de análisis. Espera a que se renueve para analizar más fotos.",
        { ambito: "mes", usados: 15, limite: 15, se_renueva: "2026-10-01" },
      );
    }

    if (MODO_DE_DEMO === "no_es_comida") {
      // La forma exacta del 200 sin comida que arma el handler: sin scan_id,
      // sin items, sin totales y sin persistir.
      //
      // ⚠️ El texto es el ARRANQUE EN FRÍO del backend (`errores.ts`,
      // `TEXTO_NO_ES_COMIDA_EN_FRIO`), y por eso la pasada de España tampoco lo
      // tocó: es una copia byte a byte de otro archivo. En producción casi nunca
      // se ve, porque su clave —`error_not_food`— SÍ está entre las 47 de
      // `config/copy.json` y el backend manda la publicada, que ya está
      // corregida.
      return {
        ...RESPUESTA_DE_FIXTURE,
        scan_id: null,
        is_food: false,
        items: [],
        totals: null,
        message_es: "Eso no parece un plato de comida. ¿Probamos con otra foto?",
        persisted: false,
      };
    }

    // Los dos estados del donut que el plato del fixture no muestra (card 3.1):
    // el total COMPLETO, con las tres subdivisiones del anillo exterior
    // dibujadas, y el plato SIN TOTAL, donde no hay anillo que dibujar y se
    // muestra el motivo que escribió el motor.
    if (MODO_DE_DEMO === "completo") return respuestaDeFixtureCompleta();
    if (MODO_DE_DEMO === "sin_total") return respuestaDeFixtureSinTotal();

    return RESPUESTA_DE_FIXTURE;
  }

  return mandarAlBackend(imagen, opciones, false);
}

/**
 * El envío de verdad. Separado de `analizarFoto` porque puede correr DOS veces:
 * ver el reintento del 401, más abajo.
 *
 * `conTokenNuevo` es lo que evita que ese reintento se vuelva un bucle.
 */
async function mandarAlBackend(
  imagen: ImagenComprimida,
  opciones: OpcionesDeAnalisis,
  conTokenNuevo: boolean,
): Promise<RespuestaDeAnalisis> {
  /**
   * EL TOKEN, QUE ES LO QUE DICE QUIÉN LLAMA (contrato WS09 §1).
   *
   * En el camino normal no hace falta pedir uno nuevo: el SDK lo renueva solo
   * cuando le quedan menos de cinco minutos de vida. Se fuerza únicamente en el
   * reintento de más abajo.
   */
  const token = await obtenerIdToken(conTokenNuevo);
  if (token === null) {
    // No hay sesión: se corta ACÁ y no se sube la foto. Subir cuatro megas para
    // que el servidor conteste 401 es gastar los datos del móvil de alguien para
    // nada. Como el backend no llegó a hablar, el texto lo pone el front.
    throw new ErrorDeAnalisis("no_autenticado", COPY_SESION.caducada);
  }

  /**
   * LA PROCEDENCIA, QUE ES OTRA COSA QUE EL TOKEN (card 4.4).
   *
   * El `Authorization` de arriba dice QUIÉN llama; esta cabecera dice DESDE
   * DÓNDE: que el pedido sale de nuestra PWA en un navegador de verdad y no de
   * un script con una cuenta gratis.
   *
   * Se pide DESPUÉS del token y justo antes del `fetch` a propósito: es lo
   * último que puede tardar, y así el corte por falta de sesión —que no gasta
   * datos del móvil— ya ocurrió.
   *
   * Puede venir vacía y eso NO es un error: en local está apagada, y en
   * producción puede fallar reCAPTCHA. `cabeceraDeAppCheck` no lanza nunca. Qué
   * pasa entonces lo decide el backend, con un interruptor que vive en
   * `config/app` y no en este código.
   */
  const procedencia = await cabeceraDeAppCheck();

  let res: Response;
  try {
    res = await fetch(functionUrl("analyze"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...procedencia,
      },
      body: JSON.stringify({
        image_base64: imagen.image_base64,
        media_type: imagen.media_type,
      }),
      signal: opciones.signal,
    });
  } catch (err) {
    if (opciones.signal?.aborted) throw err;
    throw new ErrorDeAnalisis(
      "sin_red",
      "No hay respuesta en la dirección del backend. Revisa tu conexión, o que la función esté desplegada.",
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch {
    throw new ErrorDeAnalisis(
      "respuesta_ilegible",
      `El backend respondió ${res.status} y el cuerpo no era JSON.`,
    );
  }

  if (!res.ok) {
    /**
     * UN 401 SE REINTENTA UNA VEZ, CON UN TOKEN NUEVO, Y NO ES UN PARCHE.
     *
     * El caso pasa de verdad: la foto tarda unos segundos en comprimirse y
     * subirse, y si el token vencía justo en esa ventana el servidor la rechaza
     * cuando ya llegó entera. Mandar a la persona de vuelta al login por eso
     * sería tirarle el plato a la basura por un reloj.
     *
     * Es seguro y es barato: el 401 se contesta ANTES de mirar la foto, así que
     * el reintento no gasta una llamada al modelo ni consume cupo. Y se hace una
     * sola vez —`conTokenNuevo` lo garantiza— y solo si sigue habiendo sesión:
     * si la persona cerró sesión, no hay token nuevo que pedir.
     */
    if (res.status === 401 && !conTokenNuevo && usuarioActual() !== null) {
      return mandarAlBackend(imagen, opciones, true);
    }

    // El backend manda el texto en español: se muestra ESE, no uno inventado
    // acá. Si no vino con la forma esperada, se dice el código HTTP y nada más.
    if (esErrorDelBackend(cuerpo)) {
      throw new ErrorDeAnalisis(cuerpo.error.code, cuerpo.error.message_es, leerCupo(cuerpo));
    }
    throw new ErrorDeAnalisis("http_" + res.status, `El backend respondió con un error ${res.status}.`);
  }

  return cuerpo as RespuestaDeAnalisis;
}
