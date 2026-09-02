/**
 * La lista de espera: validar tres campos y escribir un documento (WS08).
 *
 * ---------------------------------------------------------------------------
 * QUÉ ES Y QUÉ NO ES
 *
 * Es lo único de la vitrina premium que ESCRIBE. Hasta acá la app solo leía
 * (`config/app`) y llamaba al backend (`analyze`); esta es la primera vez que el
 * navegador crea un documento, y por eso la puerta se abre lo justo:
 *
 *   · una sola colección, `waitlist`;
 *   · solo `create` — el cliente no puede leer la lista, ni corregir lo que
 *     escribió, ni borrarlo. Quien se apunta no puede ver quién más está;
 *   · cinco campos de texto y ninguno más, verificados por `firestore.rules`.
 *
 * NO es un sistema de cuentas ni el principio de uno. No hay `uid`, no hay
 * sesión y no se guarda nada del escaneo: es una lista de correos para avisar de
 * un lanzamiento, y eso es exactamente lo que el formulario promete.
 *
 * POR QUÉ REST Y NO EL SDK. El mismo motivo, medido, que la lectura de
 * `config/app`: `firebase/firestore` pesa ~110 kB gzip y esta app se abre desde
 * un teléfono con la cámara en la mano. Ver `firestoreColeccionUrl()`.
 * ------------------------------------------------------------------------- */
import { firestoreColeccionUrl } from "./firebase";
import { COPY_LISTA_DE_ESPERA, type PlanDeListaDeEspera } from "./copy.premium";

/** La colección. El mismo nombre está en `firestore.rules`; si cambia, cambia allá. */
export const COLECCION = "waitlist";

/** Lo que el formulario recoge, tal cual lo escribió la persona. */
export interface AltaDeListaDeEspera {
  nombre: string;
  apellidos: string;
  correo: string;
  plan: PlanDeListaDeEspera;
}

/** Qué campo está mal y qué decirle a quien lo escribió. */
export interface ErrorDeCampo {
  campo: "nombre" | "apellidos" | "correo";
  mensaje: string;
}

/**
 * La validación, MÍNIMA Y HONESTA.
 *
 * Tres reglas y ninguna más: que el nombre esté, que los apellidos estén y que
 * el correo tenga forma de correo. No se comprueba que el dominio exista —eso no
 * se puede desde el navegador—, no se rechazan nombres "raros" y no se pide un
 * largo mínimo: un formulario que discute con el usuario sobre cómo se llama es
 * un formulario que se abandona. La única verdad que este archivo puede
 * garantizar es que el correo TIENE FORMA de correo, y eso es lo que verifica.
 *
 * El patrón es a propósito el simple —algo, arroba, algo, punto, algo— y no una
 * expresión de las que circulan con cuarenta líneas: esas rechazan direcciones
 * válidas, que es el único error de verdad caro acá.
 */
const FORMA_DE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * ¿Esto tiene forma de correo?
 *
 * Se exporta desde la card 4.1 porque la pantalla de entrada valida lo mismo, y
 * dos reglas distintas para el mismo campo terminan en un correo que la lista de
 * espera acepta y el login rechaza (o al revés). Una sola regla, en un solo
 * sitio, con el criterio de arriba: simple a propósito.
 */
export function tieneFormaDeCorreo(correo: string): boolean {
  return FORMA_DE_CORREO.test(correo.trim());
}

export function validar(alta: AltaDeListaDeEspera): ErrorDeCampo | null {
  if (alta.nombre.trim() === "") {
    return { campo: "nombre", mensaje: COPY_LISTA_DE_ESPERA.error_nombre };
  }
  if (alta.apellidos.trim() === "") {
    return { campo: "apellidos", mensaje: COPY_LISTA_DE_ESPERA.error_apellidos };
  }
  if (!tieneFormaDeCorreo(alta.correo)) {
    return { campo: "correo", mensaje: COPY_LISTA_DE_ESPERA.error_correo };
  }
  return null;
}

/** El error de escritura, con el detalle técnico guardado para la consola. */
export class ErrorDeAlta extends Error {
  constructor(public readonly detalle: string) {
    super(COPY_LISTA_DE_ESPERA.error_envio);
    this.name = "ErrorDeAlta";
  }
}

/**
 * Escribe el alta en `waitlist`. Devuelve el id del documento creado.
 *
 * LA FECHA VIAJA COMO TEXTO ISO y no como timestamp del servidor: crear un
 * documento por REST no aplica transformaciones de campo, así que un
 * `serverTimestamp` exigiría un `commit` armado a mano para ganar muy poco. Es
 * una fecha declarada por el cliente y hay que leerla como tal — Firestore
 * guarda además su propio `createTime` en el documento, que sí es del servidor y
 * es el que manda si alguna vez discrepan.
 */
export async function apuntarse(alta: AltaDeListaDeEspera): Promise<string> {
  const cuerpo = {
    fields: {
      nombre: { stringValue: alta.nombre.trim() },
      apellidos: { stringValue: alta.apellidos.trim() },
      correo: { stringValue: alta.correo.trim() },
      plan: { stringValue: alta.plan },
      fecha: { stringValue: new Date().toISOString() },
    },
  };

  let res: Response;
  try {
    res = await fetch(firestoreColeccionUrl(COLECCION), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
  } catch (err) {
    throw new ErrorDeAlta(err instanceof Error ? err.message : "sin red");
  }

  if (!res.ok) {
    // El cuerpo del error de Firestore dice si fue una regla o una malformación.
    // No se le muestra a nadie —no significa nada para quien se está apuntando—
    // pero se conserva para el Q/A.
    const detalle = await res.text().catch(() => "");
    throw new ErrorDeAlta(`Firestore respondió ${res.status}: ${detalle.slice(0, 300)}`);
  }

  const documento = (await res.json()) as { name?: string };
  const ruta = documento.name ?? "";
  return ruta.slice(ruta.lastIndexOf("/") + 1);
}
