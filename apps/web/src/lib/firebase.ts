/**
 * Inicialización de Firebase en el cliente.
 *
 * La configuración llega por variables de entorno de Vite: el mismo build sirve
 * para cualquier proyecto (staging, producción) cambiando el entorno, sin tocar
 * el código.
 */
import { initializeApp, type FirebaseOptions } from "firebase/app";

import { encenderAppCheck } from "./appcheck";

const options: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const firebaseApp = initializeApp(options);

/**
 * App Check se enciende ACÁ, en la línea siguiente a `initializeApp`, y no donde
 * se usa (card 4.4).
 *
 * El orden lo pide el SDK: App Check tiene que estar activado antes de que se
 * use cualquier otro servicio de Firebase. Poniéndolo acá el orden queda
 * garantizado por el orden de los módulos —quien importe `./firebase` ya lo
 * encuentra encendido— en vez de depender de que nadie mueva un import. En
 * particular, corre antes que el `initializeAuth` de `auth.ts`, que importa este
 * archivo.
 *
 * No lanza y no devuelve nada: si App Check no se puede montar, la app arranca
 * igual y las llamadas van sin procedencia. Ver `appcheck.ts`.
 */
encenderAppCheck(firebaseApp);

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

/**
 * ¿La lectura de `config/app` va al emulador de Firestore?
 *
 * Es una variable SEPARADA de la de funciones, y no la misma, porque los dos
 * casos existen por separado: probar el backend desplegado leyendo la config
 * real es lo normal, y levantar solo el emulador de Firestore para editar
 * textos sin tocar producción también. Atarlas obligaría a apagar una para
 * usar la otra.
 */
export const USA_EMULADOR_DE_FIRESTORE = import.meta.env.VITE_FIRESTORE_EMULATOR === "1";

/** Puerto del emulador de Firestore. El de `firebase.json` es el 8080. */
const PUERTO_FIRESTORE = import.meta.env.VITE_FIRESTORE_EMULATOR_PORT ?? "8080";

/**
 * La URL REST de un documento de Firestore.
 *
 * POR QUÉ REST Y NO EL SDK. Lo único que el navegador lee de Firestore es
 * `config/app`: un documento chiquito, público por las reglas, una vez por
 * arranque. Traer `firebase/firestore` para eso costaba **110 kB gzip** medidos
 * —el bundle pasaba de 92 a 202 kB— en una app que se abre desde un teléfono
 * con la cámara en la mano. Un `fetch` a la API REST hace lo mismo con cero
 * bytes de dependencia, y es el mismo criterio con el que está escrito el seed
 * del catálogo ("REST sin dependencias", `kb/seed/README.md`).
 *
 * La lectura va SIN credenciales: las reglas de `firestore.rules` declaran
 * `allow read: if true` para `config/{docId}`, así que la API key alcanza. Nada
 * de esto abre una puerta nueva — es exactamente el permiso que el SDK usaría.
 */
export function firestoreDocUrl(coleccion: string, documento: string): string {
  const ruta = `v1/projects/${PROJECT_ID}/databases/(default)/documents/${coleccion}/${documento}`;
  if (USA_EMULADOR_DE_FIRESTORE) {
    return `http://127.0.0.1:${PUERTO_FIRESTORE}/${ruta}`;
  }
  return `https://firestore.googleapis.com/${ruta}?key=${encodeURIComponent(options.apiKey ?? "")}`;
}

/**
 * La URL REST de una COLECCIÓN, para CREAR un documento con id automático
 * (`POST` con `{ fields: … }`).
 *
 * Mismo criterio que su hermana de arriba, y por el mismo motivo medido: traer
 * `firebase/firestore` solo para escribir un documento de cinco textos costaría
 * ~110 kB gzip en una PWA que se abre desde un teléfono. Un `fetch` hace lo
 * mismo con cero bytes de dependencia.
 *
 * La escritura va SIN credenciales, igual que la lectura de `config/app`: quien
 * decide si entra o no es `firestore.rules`, que para `waitlist/{id}` permite
 * solo `create` y valida la forma del documento. La API key no es un permiso —
 * identifica al proyecto—, así que esto no abre ninguna puerta que las reglas no
 * hayan abierto antes.
 */
export function firestoreColeccionUrl(coleccion: string): string {
  const ruta = `v1/projects/${PROJECT_ID}/databases/(default)/documents/${coleccion}`;
  if (USA_EMULADOR_DE_FIRESTORE) {
    return `http://127.0.0.1:${PUERTO_FIRESTORE}/${ruta}`;
  }
  return `https://firestore.googleapis.com/${ruta}?key=${encodeURIComponent(options.apiKey ?? "")}`;
}
