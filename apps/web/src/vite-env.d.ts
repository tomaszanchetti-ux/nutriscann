/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FB_API_KEY: string;
  readonly VITE_FB_AUTH_DOMAIN: string;
  readonly VITE_FB_PROJECT_ID: string;
  readonly VITE_FB_STORAGE_BUCKET: string;
  readonly VITE_FB_MESSAGING_SENDER_ID: string;
  readonly VITE_FB_APP_ID: string;
  readonly VITE_FUNCTIONS_REGION?: string;
  /** "1" ⇒ las llamadas al backend van al emulador de funciones, no a producción. */
  readonly VITE_FUNCTIONS_EMULATOR?: string;
  /** Puerto del emulador de funciones. Por defecto el 5001 de `firebase.json`. */
  readonly VITE_FUNCTIONS_EMULATOR_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
