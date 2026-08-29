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

/** URL base de las Cloud Functions v2 desplegadas en este proyecto. */
export function functionUrl(name: string): string {
  return `https://${FUNCTIONS_REGION}-${PROJECT_ID}.cloudfunctions.net/${name}`;
}
