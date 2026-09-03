/**
 * LA FOTO DEL ESCANEO: dónde se guarda, cómo se nombra y quién la sube.
 *
 * Hasta la card 6.0 la foto llegaba como base64 en el POST, se le mandaba al
 * modelo y se tiraba: el expediente guardaba `image_ref: null`. El costo se
 * midió el 03/09 calibrando gramos y confianza — para poder mirar QUÉ vio el
 * modelo en un escaneo real de producción hubo que reconstruir la visión a
 * mano, porque ni la foto ni la salida del modelo habían quedado guardadas.
 *
 * SEPARACIÓN DECISIÓN / IO, la de siempre. Este archivo tiene dos mitades:
 *   · lo PURO —la ruta, la extensión, la referencia `gs://`, el nombre del
 *     bucket— que se prueba sin nube;
 *   · el ALMACÉN real (`almacenEnBucket`), que es cuatro líneas sobre una
 *     interfaz mínima del bucket. El handler recibe un `AlmacenDeFotos` por
 *     `Dependencias`, igual que recibe `persistir`, así que ningún test toca
 *     Cloud Storage.
 */
import type { MediaType } from "./vision";

/**
 * El prefijo de la ruta. NO se elige acá: calza con la regla que ya está
 * desplegada en `storage.rules`,
 *
 *     match /scans/{ownerId}/{scanId}   // lee solo el dueño
 *
 * y por eso el objeto se llama `scans/{owner_id}/{scan_id}.{ext}`: el nombre
 * del archivo con su extensión es UN solo segmento de ruta, así que entra en el
 * `{scanId}` de la regla. Un objeto en `scans/{owner}/{scan}/foto.jpg` —dos
 * segmentos— caería en el `match /{allPaths=**}` que niega todo, y el dueño no
 * podría leer su propia foto.
 */
export const PREFIJO_DE_FOTOS = "scans";

/**
 * La extensión de cada formato aceptado.
 *
 * El TIPO es la lista: `Record<MediaType, string>` obliga a que estén los tres
 * de `vision.ts` y ninguno más. Si mañana la PWA manda un cuarto formato, esto
 * no compila hasta que alguien decida cómo se llama el archivo.
 */
export const EXTENSIONES: Record<MediaType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** `scans/{owner_id}/{scan_id}.{ext}` — la ruta del objeto dentro del bucket. */
export function rutaDeLaFoto(owner_id: string, scan_id: string, media_type: MediaType): string {
  return `${PREFIJO_DE_FOTOS}/${owner_id}/${scan_id}.${EXTENSIONES[media_type]}`;
}

/**
 * La referencia que se guarda en el expediente: `gs://<bucket>/<ruta>`.
 *
 * Se guarda la referencia COMPLETA y no solo la ruta a propósito: el día que el
 * bucket cambie de nombre —o que haya dos— un expediente con la ruta pelada no
 * diría dónde está su foto, y una foto que no se encuentra es una foto perdida.
 */
export function referenciaDeLaFoto(bucket: string, ruta: string): string {
  return `gs://${bucket}/${ruta}`;
}

/** Parte una referencia `gs://bucket/ruta`. `null` si no tiene esa forma. */
export function partirReferencia(referencia: string): { bucket: string; ruta: string } | null {
  const sinEsquema = referencia.startsWith("gs://") ? referencia.slice("gs://".length) : null;
  if (sinEsquema === null) return null;
  const corte = sinEsquema.indexOf("/");
  if (corte <= 0 || corte === sinEsquema.length - 1) return null;
  return { bucket: sinEsquema.slice(0, corte), ruta: sinEsquema.slice(corte + 1) };
}

// ---------------------------------------------------------------------------
// El bucket, resuelto desde el entorno
// ---------------------------------------------------------------------------

/**
 * El sufijo del bucket por defecto de Firebase Storage en un proyecto creado
 * desde octubre de 2024. Es una CONVENCIÓN de la plataforma, no configuración
 * de negocio: el nombre completo es `<projectId><sufijo>`.
 */
export const SUFIJO_DEL_BUCKET_POR_DEFECTO = ".firebasestorage.app";

/**
 * QUÉ BUCKET RECIBE LAS FOTOS. Sale del entorno, nunca de una constante.
 *
 * En Cloud Functions el runtime inyecta `FIREBASE_CONFIG`, un JSON que trae
 * `storageBucket`, y es de ahí que el Admin SDK saca el bucket por defecto
 * (`getStorage().bucket()` sin nombre usa `options.storageBucket`, y si está
 * vacío tira `storage/invalid-argument`). Esa es la fuente principal.
 *
 * POR QUÉ HAY UNA CASCADA Y NO SOLO ESO, medido el 03/09 con
 * `gcloud storage buckets list --project=nutriscann-f809e`: el proyecto tiene
 * UN solo bucket de fotos, `nutriscann-f809e.firebasestorage.app`
 * (europe-west1), y NO existe ningún `nutriscann-f809e.appspot.com`. Un
 * `FIREBASE_CONFIG` que trajera el nombre legado apuntaría a un bucket que no
 * existe y toda foto fallaría —sin romper el análisis, pero en silencio salvo
 * por el `image_error` del expediente—. Entonces:
 *
 *   1. `STORAGE_BUCKET`  el override explícito. Es la salida de emergencia: si
 *                        el despliegue resolviera mal, se arregla con una
 *                        variable de entorno y sin tocar el código.
 *   2. `FIREBASE_CONFIG.storageBucket`  lo que inyecta el runtime de Functions.
 *   3. `<projectId>` + el sufijo por defecto, con el projectId de
 *      `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` / `FIREBASE_CONFIG.projectId`.
 *
 * Devuelve `null` cuando no hay NADA de dónde sacarlo (una corrida local sin
 * entorno de Firebase). Quien llama decide qué hacer con eso; lo que no hace
 * esta función es inventar un nombre.
 */
export function nombreDelBucketDeFotos(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicito = (env["STORAGE_BUCKET"] ?? "").trim();
  if (explicito.length > 0) return explicito;

  const config = leerFirebaseConfig(env);

  const delConfig = typeof config["storageBucket"] === "string" ? config["storageBucket"].trim() : "";
  if (delConfig.length > 0) return delConfig;

  const delEntorno = (env["GCLOUD_PROJECT"] ?? env["GOOGLE_CLOUD_PROJECT"] ?? "").trim();
  const projectId =
    delEntorno.length > 0
      ? delEntorno
      : typeof config["projectId"] === "string"
        ? config["projectId"].trim()
        : "";
  if (projectId.length === 0) return null;

  return `${projectId}${SUFIJO_DEL_BUCKET_POR_DEFECTO}`;
}

/**
 * `FIREBASE_CONFIG` como objeto. Un JSON roto NO revienta: devuelve `{}`.
 *
 * Que una variable de entorno mal formada tire abajo la resolución del bucket
 * sería cambiar un problema chico —la foto no se guarda— por uno grande —el
 * escaneo no funciona—.
 */
function leerFirebaseConfig(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const crudo = (env["FIREBASE_CONFIG"] ?? "").trim();
  if (!crudo.startsWith("{")) return {};
  try {
    const parseado: unknown = JSON.parse(crudo);
    if (parseado === null || typeof parseado !== "object" || Array.isArray(parseado)) return {};
    return parseado as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// El almacén, inyectado
// ---------------------------------------------------------------------------

/** La foto tal como llegó en el POST, más a quién y a qué escaneo pertenece. */
export interface FotoDelEscaneo {
  owner_id: string;
  scan_id: string;
  media_type: MediaType;
  /** El base64 YA validado por `validarEntrada`, sin el prefijo `data:`. */
  image_base64: string;
}

/**
 * CÓMO TERMINÓ LA FOTO. Exactamente uno de los dos campos viene lleno.
 *
 * Existe como un par y no como un `string | null` suelto porque "no hay foto"
 * y "la foto falló por esto" no son lo mismo, y el expediente tiene que poder
 * decir la diferencia meses después.
 */
export interface ResultadoDeLaFoto {
  /** `gs://<bucket>/<ruta>` si se subió; `null` si no. */
  referencia: string | null;
  /** El motivo, en texto, si NO se subió; `null` si se subió. */
  error: string | null;
}

/**
 * Lo único que el circuito necesita saber de Cloud Storage.
 *
 * Es una interfaz mínima a propósito, por la misma razón que `ClienteDeVision`:
 * un test que quiera simular una subida lenta o un bucket caído escribe cuatro
 * líneas, no un doble del SDK de Storage entero.
 */
export interface AlmacenDeFotos {
  /** Sube la foto y devuelve su referencia `gs://`. Lanza si no pudo. */
  subir(foto: FotoDelEscaneo): Promise<string>;
  /** Borra un objeto ya subido, por su referencia `gs://`. Lanza si no pudo. */
  borrar(referencia: string): Promise<void>;
}

/** Lo que este archivo usa de un `File` de `@google-cloud/storage`. */
export interface ArchivoDelBucket {
  save(datos: Buffer, opciones: { contentType: string; resumable: boolean }): Promise<unknown>;
  delete(): Promise<unknown>;
}

/** Lo que este archivo usa de un `Bucket` de `@google-cloud/storage`. */
export interface BucketDeFotos {
  name: string;
  file(ruta: string): ArchivoDelBucket;
}

/**
 * El almacén real, sobre un bucket que se abre PEREZOSAMENTE.
 *
 * `abrirBucket` es una función y no un bucket ya construido por el mismo motivo
 * que el cliente de Anthropic se construye la primera vez que se usa
 * (`index.ts`): llamar a `getStorage()` al cargar el módulo lo haría también en
 * `health`, que no necesita Storage para nada.
 *
 * `resumable: false` es deliberado. Una foto de plato comprimida son ~200 KB y
 * la subida resumible arranca con un round-trip extra para pedir la sesión;
 * para un archivo chico y de un solo intento eso es latencia pagada de más
 * dentro de una función con 60 s de presupuesto.
 */
export function almacenEnBucket(abrirBucket: () => BucketDeFotos): AlmacenDeFotos {
  return {
    async subir(foto) {
      const bucket = abrirBucket();
      const ruta = rutaDeLaFoto(foto.owner_id, foto.scan_id, foto.media_type);
      await bucket.file(ruta).save(Buffer.from(foto.image_base64, "base64"), {
        contentType: foto.media_type,
        resumable: false,
      });
      return referenciaDeLaFoto(bucket.name, ruta);
    },

    async borrar(referencia) {
      const partes = partirReferencia(referencia);
      if (partes === null) throw new Error(`la referencia "${referencia}" no tiene la forma gs://bucket/ruta`);
      const bucket = abrirBucket();
      // CANDADO: nunca se borra en un bucket que no sea el nuestro. La
      // referencia viene de nuestro propio `subir`, pero un borrado es
      // irreversible y el chequeo cuesta una comparación de cadenas.
      if (partes.bucket !== bucket.name) {
        throw new Error(`la referencia apunta al bucket "${partes.bucket}" y este almacén es "${bucket.name}"`);
      }
      await bucket.file(partes.ruta).delete();
    },
  };
}
