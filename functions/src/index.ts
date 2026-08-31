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
import { loadConfig } from "./config";
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
 * Cuerpo: `{ image_base64, media_type, owner_id? }`.
 * Respuesta: `{ scan_id, is_food, items, totals, meta }` — `items` y `totals`
 * son EXACTAMENTE los del motor, sin reformatear.
 *
 * `cors: true` porque la PWA la llama desde otro origen (Hosting, o Vite en
 * local). El secreto se declara acá y solo acá: `health` no lo ve.
 *
 * Límite conocido (Q/A WS04): un cuerpo que NO es JSON válido lo rechaza el
 * body-parser de Express ANTES de que este handler exista — ese 400 sale como
 * HTML sin cabeceras CORS. El front no puede llegar ahí (siempre manda
 * JSON.stringify); quien depure con curl verá ese 400 "pelado" y no es un
 * fallo de CORS del endpoint.
 */
export const analyze = onRequest({ cors: true, secrets: [ANTHROPIC_API_KEY] }, async (req, res) => {
  const respuesta = await manejarAnalyze(
    { method: req.method, body: req.body },
    {
      cliente: clienteDeVision,
      indice: () => obtenerIndice(getFirestore()),
      config: loadConfig,
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
