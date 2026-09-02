/**
 * Los errores del endpoint `analyze`, con su código, su HTTP y su texto.
 *
 * REGLA DURA 1 DEL PROYECTO, aplicada a los mensajes de error: el texto que ve
 * el usuario vive en `config/app.copy` y se edita sin desplegar. Lo que hay en
 * este archivo NO es la configuración: es el ARRANQUE EN FRÍO — lo mínimo para
 * que la app diga algo sensato el día que el documento no exista o Firestore no
 * responda. Por eso cada error declara su `clave_copy` y su `texto_en_frio`, y
 * la respuesta estampa `copy_source` para que "está usando el default" nunca se
 * confunda con "está configurado" (el mismo patrón que `config.ts` con `source`).
 *
 * El código (`code`) es para el front y para los logs: es estable, en inglés
 * chico y no cambia aunque cambie el texto. El texto (`message_es`) es para la
 * persona y puede cambiar sin tocar el código.
 */

/** Los códigos de error del endpoint. Lista cerrada. */
export type CodigoDeError =
  | "metodo_no_permitido"
  | "cuerpo_invalido"
  | "imagen_invalida"
  | "imagen_muy_grande"
  | "modelo_no_disponible"
  | "respuesta_ilegible"
  | "catalogo_no_disponible"
  | "error_interno";

export interface DefinicionDeError {
  /** El HTTP con el que se responde. */
  status: number;
  /** La clave que se busca en `config/app.copy`. `null` = este error no es del usuario. */
  clave_copy: string | null;
  /** Lo que se dice si la clave no está publicada. */
  texto_en_frio: string;
}

/**
 * Las dos claves que el contrato de la card nombra (`error_not_food`,
 * `error_unreadable`) están acá con su texto en frío. Las demás también declaran
 * clave: publicar un texto nuevo en `config/app.copy` no necesita un deploy.
 */
export const ERRORES: Record<CodigoDeError, DefinicionDeError> = {
  metodo_no_permitido: {
    status: 405,
    clave_copy: null,
    texto_en_frio: "Este endpoint solo acepta POST.",
  },
  cuerpo_invalido: {
    status: 400,
    clave_copy: "error_bad_request",
    texto_en_frio: "No pude leer el pedido: falta la imagen o el formato no es el esperado.",
  },
  imagen_invalida: {
    status: 400,
    clave_copy: "error_bad_image",
    texto_en_frio: "Esa imagen no se puede leer. Probá sacar la foto de nuevo.",
  },
  imagen_muy_grande: {
    status: 413,
    clave_copy: "error_image_too_big",
    texto_en_frio: "La foto es demasiado pesada. Probá con una más chica.",
  },
  modelo_no_disponible: {
    status: 503,
    clave_copy: "error_model_unavailable",
    texto_en_frio: "El servicio de análisis está ocupado. Probá de nuevo en un momento.",
  },
  respuesta_ilegible: {
    status: 502,
    clave_copy: "error_unreadable",
    texto_en_frio: "No pude reconocer el plato. ¿Probás con más luz o desde más cerca?",
  },
  catalogo_no_disponible: {
    status: 503,
    clave_copy: "error_catalog_unavailable",
    texto_en_frio: "La base nutricional no está disponible en este momento.",
  },
  error_interno: {
    status: 500,
    clave_copy: "error_internal",
    texto_en_frio: "Algo falló de nuestro lado. Ya quedó registrado.",
  },
};

/** La clave del copy para la foto que no es comida. No es un error: es un 200. */
export const CLAVE_NO_ES_COMIDA = "error_not_food";

/** Lo que se dice cuando la foto no es comida y `config/app.copy` no lo dice. */
export const TEXTO_NO_ES_COMIDA_EN_FRIO =
  "Eso no parece un plato de comida. Probá con una foto de lo que estás por comer.";

/**
 * El error que viaja por todo el endpoint. Lleva su código adentro para que
 * quien lo atrapa no tenga que adivinar el HTTP ni el texto.
 */
export class ErrorDeAnalisis extends Error {
  readonly codigo: CodigoDeError;
  /** Lo que se escribe en el log; nunca viaja al cliente. */
  readonly detalle: string;

  constructor(codigo: CodigoDeError, detalle: string) {
    super(`${codigo}: ${detalle}`);
    this.name = "ErrorDeAnalisis";
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export interface TextoResuelto {
  message_es: string;
  /** De dónde salió el texto: de la configuración publicada o del arranque en frío. */
  copy_source: "config" | "cold-start-default";
}

/**
 * Resuelve un texto contra el `copy` publicado, con su default en frío.
 * Pura: recibe el copy, no lo lee.
 */
export function resolverTexto(
  clave: string | null,
  textoEnFrio: string,
  copy: Record<string, string>,
): TextoResuelto {
  if (clave !== null) {
    const publicado = copy[clave];
    if (typeof publicado === "string" && publicado.trim().length > 0) {
      return { message_es: publicado, copy_source: "config" };
    }
  }
  return { message_es: textoEnFrio, copy_source: "cold-start-default" };
}

export interface CuerpoDeError {
  error: {
    code: CodigoDeError;
    message_es: string;
    copy_source: "config" | "cold-start-default";
  };
}

/** El cuerpo `{ error: { code, message_es } }` de la respuesta, con su HTTP. */
export function respuestaDeError(
  codigo: CodigoDeError,
  copy: Record<string, string>,
): { status: number; body: CuerpoDeError } {
  const definicion = ERRORES[codigo];
  const texto = resolverTexto(definicion.clave_copy, definicion.texto_en_frio, copy);
  return {
    status: definicion.status,
    body: { error: { code: codigo, message_es: texto.message_es, copy_source: texto.copy_source } },
  };
}
