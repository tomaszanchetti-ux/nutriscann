/**
 * NutriScann — punto de entrada del backend.
 *
 * Dos funciones:
 *   `health`   diagnóstico público: ¿responde el backend, alcanza Firestore y
 *              qué versión del catálogo está publicada?
 *   `analyze`  el motor: una foto entra, un reporte nutricional sale.
 *
 * ESTE ARCHIVO ES EL ADAPTADOR Y NADA MÁS. Acá viven las tres cosas que no se
 * pueden testear sin la nube —leer el secreto, hablar con Firestore, contestar
 * un `res`— y ninguna decisión. La lógica de `analyze` está en `analyze/`, entra
 * por parámetros y se prueba entera con un modelo falso.
 */
import { randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

// El import trae el secreto y, de paso, corre `setGlobalOptions` (región,
// memoria, timeout). Por eso alcanza con este único import de `./runtime`.
import { ANTHROPIC_API_KEY, anthropicWorkspaceId } from "./runtime";
import { appCheckExigido, loadConfig } from "./config";
import { crearVerificador, usaEmuladorDeAuth } from "./auth/identidad";
import { crearVerificadorDeAppCheck } from "./appcheck/procedencia";
import { devolverCredito, reservarCupo } from "./cupo/persistencia";
import { obtenerIndice } from "./analyze/catalogo";
import { manejarAnalyze } from "./analyze/handler";
import { guardarScan, registrarCuracion } from "./analyze/persistencia";
import { crearClienteDeVision, type ClienteDeVision } from "./analyze/vision";

initializeApp();

/** Versión del backend. La estampan las respuestas para poder auditar qué corre. */
const BACKEND_VERSION = "0.1.0";

/**
 * Diagnóstico público: dice si el backend responde, si alcanza Firestore y qué
 * versión del catálogo nutricional está publicada.
 *
 * Es público a propósito: no revela nada sensible y sirve de sonda de despliegue.
 */
export const health = onRequest({ cors: true }, async (_req, res) => {
  const startedAt = Date.now();

  try {
    const { config, source } = await loadConfig();

    res.status(200).json({
      status: "ok",
      backend_version: BACKEND_VERSION,
      kb_version: config.kb_version,
      kb_status: config.kb_version ? "publicado" : "pendiente de la Fase 1",
      config_source: source,
      region: process.env.FUNCTION_REGION ?? "europe-west1",
      // En producción es SIEMPRE false. Se publica para que un despliegue que
      // arrancara apuntando al emulador de Auth —o sea, aceptando tokens sin
      // firma— se vea en la sonda y no en un incidente.
      auth_emulator: usaEmuladorDeAuth(),
      // EN QUÉ MODO ESTÁ APP CHECK (card 4.4), leído del mismo `config/app` que
      // gobierna el circuito. Se publica por el mismo motivo que la línea de
      // arriba: el interruptor se edita en la consola de Firebase sin desplegar,
      // así que "¿está bloqueando ahora mismo?" no se puede contestar mirando el
      // repo. Acá se contesta desde afuera, sin credenciales y en un segundo —
      // que es justo lo que hace falta el día que haya que apagarlo con prisa.
      app_check_enforced: appCheckExigido(config),
      latency_ms: Date.now() - startedAt,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("health falló", err);
    res.status(503).json({
      status: "error",
      backend_version: BACKEND_VERSION,
      message: "El backend responde pero no pudo leer su configuración.",
    });
  }
});

/**
 * El cliente de Anthropic de esta instancia, construido la PRIMERA VEZ QUE SE
 * USA y no cuando se carga el módulo.
 *
 * La diferencia importa: `ANTHROPIC_API_KEY.value()` solo tiene valor dentro de
 * una función que declaró el secreto, y leerlo al cargar el módulo lo haría
 * también en `health`, que no lo declara. El envoltorio perezoso además deja que
 * un secreto ausente falle DENTRO del circuito de `analyze`, donde hay un código
 * de error y un mensaje en español, en vez de en el arranque.
 */
let clienteReal: ClienteDeVision | null = null;
const clienteDeVision: ClienteDeVision = {
  messages: {
    create: (params) => {
      if (clienteReal === null) {
        const key = ANTHROPIC_API_KEY.value();
        if (key.length === 0) throw new Error("ANTHROPIC_API_KEY vacía: el secreto no llegó a la función");
        clienteReal = crearClienteDeVision(key, anthropicWorkspaceId());
      }
      return clienteReal.messages.create(params);
    },
  },
};

/**
 * `POST /analyze` — una foto entra, un reporte nutricional sale.
 *
 * Cabecera: `Authorization: Bearer <idToken de Firebase>`. OBLIGATORIA desde la
 * card 4.2: el dueño del scan es el `uid` de ese token y nada más.
 * Cabecera: `X-Firebase-AppCheck: <token>`. Desde la card 4.4 se verifica
 * siempre; que sea OBLIGATORIA o no lo decide `config/app.app_check_enforced`,
 * que arranca en `false` (observación: se anota y no se bloquea).
 * Cuerpo: `{ image_base64, media_type }`. Un `owner_id` que llegue se ignora.
 * Respuesta: `{ scan_id, is_food, items, totals, meta, quota }` — `items` y
 * `totals` son EXACTAMENTE los del motor, sin reformatear.
 *
 * `cors: true` porque la PWA la llama desde otro origen (Hosting, o Vite en
 * local). El secreto se declara acá y solo acá: `health` no lo ve.
 *
 * CORS Y LA CABECERA `Authorization` (comprobado, no supuesto — card 4.2): una
 * cabecera que no es "simple" hace que el navegador mande un preflight `OPTIONS`
 * con `Access-Control-Request-Headers: authorization`, y si la respuesta no la
 * devuelve en `Access-Control-Allow-Headers` el POST no sale nunca — un fallo
 * que en local no aparece (Vite hace de proxy) y en producción rompe todo. Acá
 * no hay que hacer nada, y está VERIFICADO en `analyze/cors.test.ts`:
 * `firebase-functions` construye el middleware como `cors({ origin: true })` sin
 * `allowedHeaders`, y el paquete `cors` en ese caso REFLEJA lo que el preflight
 * pidió. El test lo ejerce contra la copia de `cors` que este paquete tiene
 * instalada, así que si una actualización cambiara ese default, se entera acá.
 * La card 4.4 agregó `X-Firebase-AppCheck`, que tampoco es "simple" y viaja por
 * el mismo preflight: no hizo falta tocar nada porque lo que hay es un reflejo y
 * no una lista blanca, y eso está comprobado en `appcheck/procedencia.test.ts`.
 *
 * Límite conocido (Q/A WS04): un cuerpo que NO es JSON válido lo rechaza el
 * body-parser de Express ANTES de que este handler exista — ese 400 sale como
 * HTML sin cabeceras CORS. El front no puede llegar ahí (siempre manda
 * JSON.stringify); quien depure con curl verá ese 400 "pelado" y no es un
 * fallo de CORS del endpoint.
 */
export const analyze = onRequest({ cors: true, secrets: [ANTHROPIC_API_KEY] }, async (req, res) => {
  const respuesta = await manejarAnalyze(
    { method: req.method, body: req.body, headers: req.headers },
    {
      cliente: clienteDeVision,
      indice: () => obtenerIndice(getFirestore()),
      config: loadConfig,
      // El Admin SDK ya respeta `FIREBASE_AUTH_EMULATOR_HOST` por su cuenta: no
      // hay ninguna rama de "modo local" en este circuito.
      verificarToken: crearVerificador(),
      // La procedencia (card 4.4). Se inyecta SIEMPRE, en los dos modos: en
      // observación también se verifica —lo que cambia es que el resultado se
      // anota en vez de rechazar—, porque una semana de logs que no verifican
      // nada no diría nada.
      verificarAppCheck: crearVerificadorDeAppCheck(),
      reservarCupo: (entrada) => reservarCupo(getFirestore(), entrada),
      devolverCupo: async (entrada) => {
        await devolverCredito(getFirestore(), entrada);
      },
      nuevoScanId: () => randomUUID(),
      persistir: async (datos) => {
        const db = getFirestore();
        await guardarScan(db, datos);
        await registrarCuracion(db, datos.resultado.curation_candidates, {
          scan_id: datos.scan_id,
          owner_id: datos.owner_id,
        });
      },
      advertir: (mensaje, detalle) => logger.warn(mensaje, detalle),
    },
  );

  res.status(respuesta.status).json(respuesta.body);
});
