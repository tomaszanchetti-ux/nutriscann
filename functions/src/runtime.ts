/**
 * Constantes de despliegue y acceso a secretos.
 *
 * Todo lo que sea *configuración de infraestructura* vive acá (región, memoria,
 * timeouts). Todo lo que sea *configuración de negocio* (umbrales, copy, reglas
 * de recomendación) vive en Firestore, en `config/app` — nunca en el código.
 */
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

export const REGION = "europe-west1";

/**
 * La API key de Anthropic. Vive en GCP Secret Manager y se inyecta en runtime
 * solo a las funciones que la declaran. Nunca en el repo, nunca en el cliente.
 */
export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

setGlobalOptions({
  region: REGION,
  maxInstances: 10,
  memory: "512MiB",
  timeoutSeconds: 60,
});
