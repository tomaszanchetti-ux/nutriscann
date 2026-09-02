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
 *
 * ---------------------------------------------------------------------------
 * DT-40 (a) CERRADA (card 4.5, 02/09/2026). Dos cosas, en un solo movimiento:
 *
 *   1. LAS OCHO CLAVES DE ESTE ARCHIVO YA ESTÁN PUBLICADAS. `error_bad_request`,
 *      `error_bad_image`, `error_image_too_big`, `error_model_unavailable`,
 *      `error_catalog_unavailable`, `error_internal`, `error_unauthenticated` y
 *      `error_quota_exhausted` viven ahora en `config/copy.json`, así que
 *      corregir cualquiera de estos textos ya NO exige desplegar. Antes no
 *      estaban en esa lista y este archivo era la única fuente: la regla dura 1
 *      rota justo en las pantallas donde algo ya había salido mal.
 *
 *   2. EL ESPAÑOL. Cuatro textos voseaban («Probá», «¿Probás», «más chica») y
 *      uno decía «pedido» donde en España se dice «petición». Es la pasada de
 *      DT-21 llegando hasta acá: una corrección, no un cambio de estilo.
 *
 * EL CANDADO, que es lo que hace que esto no se vuelva a abrir solo:
 * `kb/seed/src/textos.test.ts` lee ESTE archivo, junta las `clave_copy` que
 * declara con los campos de `CopyDeLaApp` del front, y exige que la lista de
 * `config/copy.json` sea exactamente esa unión. Un error nuevo con una clave que
 * nadie sembró, o una clave sembrada que ya nadie busca, frenan el seed.
 *
 * DOS TEXTOS SON COMPARTIDOS con el front y ahora dicen LO MISMO, letra por
 * letra: `error_unreadable` y `error_not_food` tienen su arranque en frío acá y
 * en `apps/web/src/lib/config.ts`. Que un mismo código dijera dos frases
 * distintas según quién contestara primero no era una variante: era un bug de
 * copy que solo se ve cuando Firestore no responde, o sea el día peor. Ese
 * espejo también lo verifica el candado.
 * ------------------------------------------------------------------------- */

import type { BloqueoDeCupo } from "../cupo/decision";

/** Los códigos de error del endpoint. Lista cerrada. */
export type CodigoDeError =
  | "metodo_no_permitido"
  | "no_autenticado"
  | "cupo_agotado"
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
 * Todos los errores del usuario declaran su clave, y las nueve claves —las ocho
 * de acá más `error_not_food`, más abajo— están publicadas en `config/copy.json`
 * desde la card 4.5: cambiar cualquiera de estos textos se hace en un PR de
 * configuración y una corrida del seed, sin desplegar las Functions.
 *
 * `metodo_no_permitido` es la única excepción y no es un descuido: un 405 lo ve
 * quien llama al endpoint a mano, nunca un usuario, así que su texto no es copy
 * de producto y no se publica. Su `clave_copy` es `null` y eso lo dice.
 */
export const ERRORES: Record<CodigoDeError, DefinicionDeError> = {
  metodo_no_permitido: {
    status: 405,
    clave_copy: null,
    texto_en_frio: "Este endpoint solo acepta POST.",
  },
  // Los dos códigos que estrena la WS09 (§2 del contrato). Nacieron ya en
  // ESPAÑOL DE ESPAÑA, sin voseo (§4 del contrato, regla DT-21), y desde la
  // card 4.5 el resto del archivo también.
  no_autenticado: {
    status: 401,
    clave_copy: "error_unauthenticated",
    texto_en_frio: "Tu sesión no es válida o ha caducado. Vuelve a entrar e inténtalo de nuevo.",
  },
  cupo_agotado: {
    status: 429,
    // Un texto solo para los DOS ámbitos, a propósito: el detalle de cuál se
    // agotó y hasta cuándo viaja en el bloque `quota`, que es dato y no prosa.
    // Dos textos exigirían dos claves de copy y el §5 del contrato cierra la
    // lista en las que ya están.
    clave_copy: "error_quota_exhausted",
    texto_en_frio: "Has agotado tu cupo de análisis. Espera a que se renueve para analizar más fotos.",
  },
  cuerpo_invalido: {
    status: 400,
    // «petición» y no «pedido»: en España un pedido es lo que se encarga en una
    // tienda.
    clave_copy: "error_bad_request",
    texto_en_frio: "No pude leer la petición: falta la imagen o el formato no es el esperado.",
  },
  imagen_invalida: {
    status: 400,
    // Aquí la foto se HACE, no se saca (misma corrección que `capture_cta` en la
    // pasada de DT-21).
    clave_copy: "error_bad_image",
    texto_en_frio: "Esa imagen no se puede leer. Prueba a hacer la foto de nuevo.",
  },
  imagen_muy_grande: {
    status: 413,
    // «más ligera» y no «más chica»: se habla de lo que PESA el archivo, que es
    // lo que rebotó, y no del tamaño del plato.
    clave_copy: "error_image_too_big",
    texto_en_frio: "La foto es demasiado pesada. Prueba con una más ligera.",
  },
  modelo_no_disponible: {
    status: 503,
    clave_copy: "error_model_unavailable",
    texto_en_frio: "El servicio de análisis está ocupado. Prueba de nuevo en un momento.",
  },
  respuesta_ilegible: {
    status: 502,
    // BYTE A BYTE con `COPY_DE_ARRANQUE.error_unreadable` del front y con lo
    // publicado en `config/copy.json`: es la misma clave y no puede decir dos
    // cosas distintas según quién conteste primero.
    clave_copy: "error_unreadable",
    texto_en_frio: "No pude reconocer el plato. Prueba con más luz.",
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

/**
 * Lo que se dice cuando la foto no es comida y `config/app.copy` no lo dice.
 *
 * BYTE A BYTE con `COPY_DE_ARRANQUE.error_not_food` del front y con lo publicado
 * en `config/copy.json`, por el mismo motivo que `error_unreadable`.
 */
export const TEXTO_NO_ES_COMIDA_EN_FRIO =
  "Eso no parece un plato de comida. ¿Probamos con otra foto?";

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

/**
 * El `cupo_agotado`, que además del código lleva CUÁL tramo se agotó.
 *
 * Es un `ErrorDeAnalisis` y no un tipo aparte para que el `catch` único del
 * handler lo siga atrapando sin una rama nueva; lo que agrega es el bloque
 * `quota` del §2 del contrato, que el cuerpo del 429 publica tal cual.
 */
export class ErrorDeCupo extends ErrorDeAnalisis {
  readonly bloqueo: BloqueoDeCupo;

  constructor(bloqueo: BloqueoDeCupo) {
    super("cupo_agotado", `agotado el cupo del ${bloqueo.ambito}: ${bloqueo.usados}/${bloqueo.limite}`);
    this.name = "ErrorDeCupo";
    this.bloqueo = bloqueo;
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
    /**
     * Solo en el 429. OPCIONAL para el front (§2 del contrato): si no viene,
     * muestra el `message_es` y ya. Viene para que pueda decir «te quedan 0 de
     * 15, vuelves el 1 de octubre» sin tener que deducirlo de un texto.
     */
    quota?: BloqueoDeCupo;
  };
}

/** El cuerpo `{ error: { code, message_es } }` de la respuesta, con su HTTP. */
export function respuestaDeError(
  codigo: CodigoDeError,
  copy: Record<string, string>,
  quota?: BloqueoDeCupo,
): { status: number; body: CuerpoDeError } {
  const definicion = ERRORES[codigo];
  const texto = resolverTexto(definicion.clave_copy, definicion.texto_en_frio, copy);
  return {
    status: definicion.status,
    body: {
      error: {
        code: codigo,
        message_es: texto.message_es,
        copy_source: texto.copy_source,
        ...(quota === undefined ? {} : { quota }),
      },
    },
  };
}
