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
  /** "1" ⇒ `config/app` se lee del emulador de Firestore, no del proyecto real. */
  readonly VITE_FIRESTORE_EMULATOR?: string;
  /** Puerto del emulador de Firestore. Por defecto el 8080 de `firebase.json`. */
  readonly VITE_FIRESTORE_EMULATOR_PORT?: string;
  /**
   * "1" ⇒ `analyze` devuelve el fixture guardado en vez de llamar al backend.
   * Es para mirar el REPORTE sin backend; ver `src/lib/fixtures/scan.fixture.ts`.
   */
  readonly VITE_ANALYZE_FIXTURE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
