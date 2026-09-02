/**
 * ¿Deja pasar `cors: true` la cabecera `Authorization` en el preflight?
 *
 * POR QUÉ ESTE TEST EXISTE. Desde la card 4.2 el POST a `/analyze` lleva
 * `Authorization: Bearer <idToken>`. Esa cabecera NO es de las "simples" del
 * estándar CORS, así que el navegador deja de mandar el POST directo y manda
 * primero un `OPTIONS` preguntando «¿puedo mandar `authorization`?». Si la
 * respuesta no la nombra en `Access-Control-Allow-Headers`, el POST no sale
 * NUNCA y el error que se ve es un fallo de red sin cuerpo y sin código.
 *
 * Y es exactamente el tipo de cosa que NO se descubre en local: en desarrollo la
 * PWA habla con el emulador a través del proxy de Vite, o sea desde el mismo
 * origen, y sin cruce de origen no hay preflight. Rompería en producción, el día
 * del despliegue, para todos a la vez.
 *
 * QUÉ SE COMPROBÓ. `firebase-functions` construye el middleware exactamente como
 * `cors({ origin })` —`node_modules/firebase-functions/lib/v2/providers/https.js`,
 * en el `onRequest`— sin pasarle `allowedHeaders`. Y el paquete `cors`, cuando
 * no le dan `allowedHeaders`, REFLEJA el `Access-Control-Request-Headers` del
 * preflight (su `lib/index.js`: «.headers wasn't specified, so reflect the
 * request headers»). O sea: no hay nada que arreglar, y este test lo ejerce
 * contra la copia de `cors` que ESTE paquete tiene instalada, así que si una
 * actualización cambiara ese default, se entera acá y no en producción.
 */
import assert from "node:assert/strict";
import test from "node:test";
import cors from "cors";

/** Un `res` de mentira: solo necesita juntar cabeceras y saber que terminó. */
function respuestaFalsa(): {
  res: Record<string, unknown>;
  cabeceras: Map<string, string>;
  terminada: () => boolean;
} {
  const cabeceras = new Map<string, string>();
  let terminada = false;
  const res = {
    statusCode: 200,
    setHeader: (nombre: string, valor: string) => cabeceras.set(nombre.toLowerCase(), String(valor)),
    getHeader: (nombre: string) => cabeceras.get(nombre.toLowerCase()),
    end: () => {
      terminada = true;
    },
  };
  return { res, cabeceras, terminada: () => terminada };
}

/** Corre el middleware tal como lo arma `onRequest({ cors: true })`. */
async function preflight(pide: string): Promise<Map<string, string>> {
  const middleware = cors({ origin: true }) as unknown as (
    req: unknown,
    res: unknown,
    siguiente: () => void,
  ) => void;
  const { res, cabeceras } = respuestaFalsa();
  const req = {
    method: "OPTIONS",
    headers: {
      origin: "https://nutriscann-f809e.web.app",
      "access-control-request-method": "POST",
      "access-control-request-headers": pide,
    },
  };
  await new Promise<void>((resolver) => {
    // En un preflight el middleware contesta él mismo y no llama a `siguiente`.
    (res as { end: () => void }).end = () => resolver();
    middleware(req, res, () => resolver());
  });
  return cabeceras;
}

test("el preflight devuelve `Authorization` en Access-Control-Allow-Headers", async () => {
  const cabeceras = await preflight("authorization,content-type");
  const permitidas = (cabeceras.get("access-control-allow-headers") ?? "").toLowerCase();

  assert.match(permitidas, /authorization/, "sin esto el POST autenticado no sale del navegador");
  assert.match(permitidas, /content-type/, "y el JSON tampoco");
  assert.equal(
    cabeceras.get("access-control-allow-origin"),
    "https://nutriscann-f809e.web.app",
    "`origin: true` refleja el origen que preguntó",
  );
});

test("lo que devuelve es un REFLEJO de lo que el navegador pidió", async () => {
  // Este es el mecanismo, y saberlo importa: no hay una lista blanca escrita en
  // ningún lado. Si algún día `firebase-functions` empezara a pasar
  // `allowedHeaders`, este test cambiaría de resultado y habría que declarar
  // `authorization` a mano.
  const cabeceras = await preflight("x-lo-que-sea");
  assert.equal(cabeceras.get("access-control-allow-headers"), "x-lo-que-sea");
});
