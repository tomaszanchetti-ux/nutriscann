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
   * "1" ⇒ el login va al emulador de Auth y NO al proyecto real. Es lo que deja
   * probar la entrada por enlace de correo sin mandarle un correo a nadie.
   */
  readonly VITE_AUTH_EMULATOR?: string;
  /** Puerto del emulador de Auth. Por defecto el 9099 de `firebase.json`. */
  readonly VITE_AUTH_EMULATOR_PORT?: string;
  /**
   * El modo de demo de `analyze`: en vez de llamar al backend, la app espera y
   * devuelve algo guardado. Valores: "1"/"reporte" (el fixture del reporte),
   * "lento" (lo mismo, pero con la espera larga para mirar el escaneo),
   * "completo", "sin_total", "error", "no_es_comida", "sin_sesion" (el 401) y
   * "sin_cupo" (el 429). Ver `src/lib/api.ts` y `src/lib/fixtures/scan.fixture.ts`.
   */
  readonly VITE_ANALYZE_FIXTURE?: string;
  /** Milisegundos que tarda el modo de demo. Pisa el valor por defecto. */
  readonly VITE_ANALYZE_FIXTURE_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
