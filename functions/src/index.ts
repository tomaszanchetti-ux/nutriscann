/**
 * NutriScann — punto de entrada del backend.
 *
 * Fase 0: solo `health`. La función existe para probar que el andamiaje está
 * completo de punta a punta: despliegue, región, Firestore y configuración.
 * El motor de análisis (`analyze`) llega en la Fase 2.
 */
import { initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

import "./runtime";
import { loadConfig } from "./config";

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
