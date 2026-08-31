/**
 * Inicialización de Firebase en el cliente.
 *
 * La configuración llega por variables de entorno de Vite: el mismo build sirve
 * para cualquier proyecto (staging, producción) cambiando el entorno, sin tocar
 * el código.
 */
import { initializeApp, type FirebaseOptions } from "firebase/app";

const options: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const firebaseApp = initializeApp(options);

export const PROJECT_ID = options.projectId as string;
export const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION ?? "europe-west1";

/**
 * ¿Las llamadas van al emulador de funciones en vez de a producción?
 *
 * Es una variable EXPLÍCITA y no `import.meta.env.DEV` a secas: correr en
 * local y apuntar al backend real es un caso legítimo y frecuente (probar la
 * función ya desplegada desde la máquina de uno). Si la rama dependiera del
 * modo de Vite, ese caso dejaría de existir sin que nadie lo haya decidido.
 *
 * Se activa poniendo `VITE_FUNCTIONS_EMULATOR=1` en `apps/web/.env.local`
 * (ver `apps/web/.env.local.example`), que está fuera de git: la elección es
 * de cada máquina, no del repo.
 */
export const USA_EMULADOR_DE_FUNCIONES = import.meta.env.VITE_FUNCTIONS_EMULATOR === "1";

/** Puerto del emulador de funciones. El de `firebase.json` es el 5001. */
const PUERTO_EMULADOR = import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT ?? "5001";

/**
 * URL base de una Cloud Function v2 de este proyecto.
 *
 * Contra el emulador la forma de la URL es otra —el proyecto y la región van
 * en la ruta, no en el host— y por eso la rama vive acá, en el único lugar
 * donde se arman URLs del backend, y no en cada llamada.
 */
export function functionUrl(name: string): string {
  if (USA_EMULADOR_DE_FUNCIONES) {
    return `http://127.0.0.1:${PUERTO_EMULADOR}/${PROJECT_ID}/${FUNCTIONS_REGION}/${name}`;
  }
  return `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}
