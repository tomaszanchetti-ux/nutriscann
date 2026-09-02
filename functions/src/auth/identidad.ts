/**
 * Quién hizo este escaneo. La respuesta sale del TOKEN y de ningún otro lado.
 *
 * Hasta la Fase 4 el dueño de un scan salía del cuerpo del pedido
 * (`owner_id`), con un `DUEÑO_PROVISORIO` de desarrollo detrás. Eso significaba
 * que cualquiera con la URL del endpoint podía escribir bajo el dueño que
 * quisiera —o leer el cupo de otro gastándoselo—, porque el backend creía lo que
 * le decían. Ahora el dueño es el `uid` de un ID token de Firebase VERIFICADO
 * con el Admin SDK, y el `owner_id` del cuerpo no decide nada.
 *
 * SEPARACIÓN DECISIÓN / IO, igual que en el resto del backend: acá viven el
 * parseo de la cabecera (puro, se prueba con una tabla) y el TIPO del
 * verificador; la llamada real al Admin SDK es `crearVerificador()`, se inyecta
 * por `Dependencias` y en los tests se reemplaza por una función. Así el test
 * del camino completo sigue corriendo sin red.
 *
 * EL EMULADOR DE AUTH NO SE CONFIGURA ACÁ. El Admin SDK mira
 * `FIREBASE_AUTH_EMULATOR_HOST` por su cuenta: si está puesta, `verifyIdToken`
 * acepta los tokens sin firma que emite el emulador y no sale a buscar las
 * claves públicas de Google. No hay ninguna rama `if (esLocal)` en este archivo
 * y no tiene que haberla — una rama así es la que un día se cuela en producción.
 * Lo único que se agrega es `usaEmuladorDeAuth()`, que NO decide nada: se
 * publica en `/health` para que, si alguna vez un despliegue arranca con esa
 * variable puesta, se vea en la sonda en vez de descubrirse con un incidente.
 *
 * FALLA CERRADA: cualquier problema verificando —token vencido, firma mala, o
 * incluso que no se puedan traer las claves públicas— es un 401. Un 401 de más
 * le pide al usuario que vuelva a entrar; un 200 de más deja pasar a cualquiera.
 * El motivo real viaja al log, nunca al cliente.
 */
import { getAuth } from "firebase-admin/auth";

import { ErrorDeAnalisis } from "../analyze/errores";

/** El dueño, ya verificado. Lo único que el resto del backend necesita saber. */
export interface DueñoVerificado {
  uid: string;
}

/** Verifica un ID token y devuelve su dueño. Lanza si no verifica. */
export type VerificadorDeToken = (idToken: string) => Promise<DueñoVerificado>;

/** Las cabeceras del pedido, tal como las entrega Express (nombres en minúscula). */
export type CabecerasDelPedido = Record<string, string | string[] | undefined>;

/** La variable de entorno que el Admin SDK mira para hablarle al emulador. */
export const VARIABLE_EMULADOR_AUTH = "FIREBASE_AUTH_EMULATOR_HOST";

const ESQUEMA_BEARER = /^Bearer[ \t]+(\S.*)$/i;

/**
 * ¿Este proceso está apuntando al emulador de Auth?
 *
 * No cambia nada del circuito: lo lee el Admin SDK, no nosotros. Existe para
 * poder DECIRLO en `/health`.
 */
export function usaEmuladorDeAuth(entorno: NodeJS.ProcessEnv = process.env): boolean {
  const host = entorno[VARIABLE_EMULADOR_AUTH];
  return typeof host === "string" && host.length > 0;
}

/**
 * Saca el token de `Authorization: Bearer <idToken>`. Puro.
 *
 * La búsqueda de la cabecera es insensible a mayúsculas aunque Express ya las
 * entregue en minúscula: este módulo también lo llama el test y algún día lo
 * llamará otro adaptador, y una cabecera que existe pero no se encuentra sería
 * un 401 imposible de diagnosticar.
 */
export function extraerToken(cabeceras: CabecerasDelPedido): string | null {
  const cruda = buscarCabecera(cabeceras, "authorization");
  if (cruda === null) return null;
  const partido = ESQUEMA_BEARER.exec(cruda.trim());
  if (partido === null) return null;
  const token = partido[1]?.trim() ?? "";
  return token.length > 0 ? token : null;
}

function buscarCabecera(cabeceras: CabecerasDelPedido, nombre: string): string | null {
  for (const [clave, valor] of Object.entries(cabeceras)) {
    if (clave.toLowerCase() !== nombre) continue;
    // Una cabecera repetida llega como array. Vale la primera: dos
    // `Authorization` distintas son un pedido ambiguo, no una elección nuestra.
    const texto = Array.isArray(valor) ? valor[0] : valor;
    if (typeof texto === "string" && texto.length > 0) return texto;
  }
  return null;
}

/**
 * El dueño del pedido, o un `no_autenticado`.
 *
 * Los tres casos que el §2 del contrato manda al mismo 401 —falta la cabecera,
 * el token no verifica, el token venció— se distinguen en el `detalle`, que va
 * al log. Al cliente le llega el mismo código y el mismo texto, porque para él
 * la acción es la misma: volver a entrar.
 */
export async function identificarDueño(
  cabeceras: CabecerasDelPedido,
  verificar: VerificadorDeToken,
): Promise<DueñoVerificado> {
  const token = extraerToken(cabeceras);
  if (token === null) {
    throw new ErrorDeAnalisis(
      "no_autenticado",
      "falta la cabecera `Authorization: Bearer <idToken>` o no tiene esa forma",
    );
  }

  let dueño: DueñoVerificado;
  try {
    dueño = await verificar(token);
  } catch (err) {
    throw new ErrorDeAnalisis("no_autenticado", `el token no verifica: ${describir(err)}`);
  }

  if (typeof dueño.uid !== "string" || dueño.uid.trim().length === 0) {
    throw new ErrorDeAnalisis("no_autenticado", "el token verificó pero no trae un `uid` usable");
  }
  return { uid: dueño.uid.trim() };
}

/**
 * El verificador de verdad: el Admin SDK contra Firebase Auth.
 *
 * `verifyIdToken` sin `checkRevoked` a propósito. Pedir revocación cuesta una
 * lectura del registro de usuarios en CADA análisis, y lo que compra es cerrar
 * una ventana de como mucho una hora —lo que dura un ID token— para una cuenta
 * que acaba de ser deshabilitada. Con el cupo del §3 esa ventana vale, en el
 * peor caso, tres escaneos. Si algún día hay que cerrarla, se cambia acá y en
 * ningún otro lado.
 */
export function crearVerificador(): VerificadorDeToken {
  return async (idToken: string) => {
    const decodificado = await getAuth().verifyIdToken(idToken);
    return { uid: decodificado.uid };
  };
}

function describir(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
