/**
 * Compresión de la foto en el navegador, con canvas y nada más.
 *
 * Por qué acá y no en el servidor: la foto de un teléfono moderno pesa 3-6 MB y
 * viaja como base64 dentro del POST (la subida a Storage es la DT-3). Bajarla a
 * ~1024 px de lado mayor con JPEG 0,8 la deja en 100-250 KB — y, sobre todo,
 * deja la imagen en ~1.100-1.600 tokens de entrada del modelo, que es el número
 * con el que está calculado el costo por análisis en `docs/PLAN.md` §3.
 *
 * Cero dependencias: `createImageBitmap` + `<canvas>` son API del navegador.
 * `imageOrientation: "from-image"` es lo que respeta el EXIF de la cámara; sin
 * eso, media foto de teléfono llega rotada 90° y el modelo mira un plato de
 * costado.
 */

/** El lado mayor al que se reduce la foto, en píxeles. */
export const LADO_MAYOR_PX = 1024;

/** Calidad del JPEG. 0,8 es el punto donde deja de verse la pérdida. */
export const CALIDAD_JPEG = 0.8;

/** Lo que el backend necesita para armar el content block `image` de Anthropic. */
export interface ImagenComprimida {
  /** Base64 PELADO: sin el prefijo `data:image/jpeg;base64,`. */
  image_base64: string;
  media_type: "image/jpeg";
  ancho: number;
  alto: number;
  /** Tamaño aproximado del JPEG, en bytes. Solo para mostrarlo en el diagnóstico. */
  bytes: number;
}

export class ErrorDeImagen extends Error {}

/** Escala manteniendo la proporción; una foto ya chica NO se agranda. */
function medidaFinal(ancho: number, alto: number): { ancho: number; alto: number } {
  const lado = Math.max(ancho, alto);
  if (lado <= LADO_MAYOR_PX) return { ancho, alto };
  const factor = LADO_MAYOR_PX / lado;
  return { ancho: Math.round(ancho * factor), alto: Math.round(alto * factor) };
}

function canvasABlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ErrorDeImagen("El navegador no pudo generar el JPEG."))),
      "image/jpeg",
      CALIDAD_JPEG,
    );
  });
}

/** Bytes → base64 sin prefijo, sin librerías y sin reventar la pila con `apply`. */
async function blobABase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binario = "";
  const TRAMO = 0x8000;
  for (let i = 0; i < buffer.length; i += TRAMO) {
    binario += String.fromCharCode(...buffer.subarray(i, i + TRAMO));
  }
  return btoa(binario);
}

/**
 * Toma el archivo que devolvió la cámara y lo deja listo para el POST.
 * Lanza `ErrorDeImagen` cuando el archivo no es una imagen legible: es el único
 * caso en que la pantalla muestra `error_imagen` y no un error del servidor.
 */
export async function comprimirImagen(archivo: File): Promise<ImagenComprimida> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    throw new ErrorDeImagen("El archivo no es una imagen que el navegador sepa leer.");
  }

  const { ancho, alto } = medidaFinal(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = ancho;
  canvas.height = alto;

  const contexto = canvas.getContext("2d");
  if (!contexto) {
    bitmap.close();
    throw new ErrorDeImagen("El navegador no dio un contexto 2D para comprimir la foto.");
  }
  contexto.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  const blob = await canvasABlob(canvas);
  return {
    image_base64: await blobABase64(blob),
    media_type: "image/jpeg",
    ancho,
    alto,
    bytes: blob.size,
  };
}
