/**
 * Cliente del backend de NutriScann.
 *
 * Toda llamada al servidor pasa por acá — la app nunca arma URLs sueltas.
 */
import { functionUrl } from "./firebase";
import {
  RESPUESTA_DE_FIXTURE,
  respuestaDeFixtureCompleta,
  respuestaDeFixtureSinTotal,
} from "./fixtures/scan.fixture";
import type { ImagenComprimida } from "./imagen";
import type { ErrorDelBackend, RespuestaDeAnalisis } from "./types";

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
 */
export type ModoDeDemo =
  | "reporte"
  | "completo"
  | "sin_total"
  | "lento"
  | "no_es_comida"
  | "error";

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
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = "ErrorDeAnalisis";
    this.codigo = codigo;
  }
}

function esErrorDelBackend(cuerpo: unknown): cuerpo is ErrorDelBackend {
  if (typeof cuerpo !== "object" || cuerpo === null) return false;
  const error = (cuerpo as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return false;
  const { code, message_es } = error as { code?: unknown; message_es?: unknown };
  return typeof code === "string" && typeof message_es === "string";
}

export interface OpcionesDeAnalisis {
  owner_id?: string;
  signal?: AbortSignal;
}

/**
 * Manda la foto ya comprimida a `analyze` y devuelve el reporte.
 *
 * El contrato (fijado por el orquestador de la WS04):
 *   POST { image_base64, media_type, owner_id? }
 *   200  { scan_id, is_food, items, totals, meta }
 *   ≠200 { error: { code, message_es } }
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
        "El servicio de análisis está ocupado. Probá de nuevo en un momento.",
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
        message_es: "Eso no parece un plato de comida. Probá con una foto de lo que estás por comer.",
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

  let res: Response;
  try {
    res = await fetch(functionUrl("analyze"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_base64: imagen.image_base64,
        media_type: imagen.media_type,
        ...(opciones.owner_id ? { owner_id: opciones.owner_id } : {}),
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
    // El backend manda el texto en español: se muestra ESE, no uno inventado
    // acá. Si no vino con la forma esperada, se dice el código HTTP y nada más.
    if (esErrorDelBackend(cuerpo)) {
      throw new ErrorDeAnalisis(cuerpo.error.code, cuerpo.error.message_es);
    }
    throw new ErrorDeAnalisis("http_" + res.status, `El backend respondió con un error ${res.status}.`);
  }

  return cuerpo as RespuestaDeAnalisis;
}
