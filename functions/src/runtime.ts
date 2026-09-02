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

/**
 * El workspace de Anthropic contra el que actúa la key. MEDIDO, no supuesto.
 *
 * Descubierto el 31/08 probando la key real: una key *identity-linked* hace que
 * la API rechace TODA llamada —incluso las gratuitas, como `GET /v1/models`—
 * con un 400 y este mensaje:
 *
 *   "anthropic-workspace-id is required when authenticating with an
 *    identity-linked API key; send the id of the workspace this request acts in."
 *
 * NO es un secreto (es un identificador, como el id de un proyecto de GCP), así
 * que NO va a Secret Manager: va como variable de entorno, en `functions/.env`.
 * Vacía por defecto — una key común no necesita la cabecera y mandarla vacía es
 * peor que no mandarla.
 *
 * POR QUÉ NO ES UN `defineString`, que sería lo idiomático: un parámetro con
 * `default: ""` se comporta como si no tuviera default y la CLI **pregunta el
 * valor por consola** al arrancar el emulador. Medido el 31/08: el emulador se
 * queda esperando en el prompt y las funciones no cargan. En CI, donde nadie
 * puede contestar, sería un deploy colgado. Una variable de entorno vacía es
 * simplemente vacía.
 */
export function anthropicWorkspaceId(): string {
  return process.env["ANTHROPIC_WORKSPACE_ID"] ?? "";
}

setGlobalOptions({
  region: REGION,
  maxInstances: 10,
  memory: "512MiB",
  timeoutSeconds: 60,
});
