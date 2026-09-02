/**
 * El endpoint `analyze`, sin Express.
 *
 * Esta función recibe un pedido ya leído y devuelve `{ status, body }`. No
 * conoce `req` ni `res`, no construye el cliente de Anthropic y no llama a
 * `getFirestore()`: todo lo que hace IO entra por `Dependencias`. Es la misma
 * separación que sostiene el motor (decisión aparte de la lectura), corrida un
 * nivel para afuera — y es lo que permite que el test del camino completo
 * "foto → modelo → motor → persistencia" corra con un modelo falso y una base de
 * emulador, midiendo lo que quedó escrito en vez de confiar en que se escribió.
 *
 * EL CIRCUITO, en orden:
 *   1. quién es                     (IO: verificar el ID token ⇒ 401 si no)
 *   2. de dónde viene               (IO: verificar el token de App Check ⇒ 403)
 *   3. validar el pedido            (puro)
 *   4. reservar un crédito del cupo (IO: una transacción ⇒ 429 si no entra)
 *   5. índice del catálogo          (una vez por instancia caliente)
 *   6. visión                       (la ÚNICA llamada al modelo)
 *   7. `analizarEscaneo`            (puro: matching + aritmética + composición)
 *   8. persistir scan + curación    (IO)
 *
 * Los pasos 1, 2 y 4 los estrena la Fase 4 (cards 4.2, 4.4 y 4.3) y el orden
 * entre ellos está elegido, no heredado:
 *
 *   · el DUEÑO se verifica ANTES que nada, porque a quien no sabemos quién es no
 *     le contamos qué le pasa a su JSON;
 *   · la PROCEDENCIA va después de la identidad y ANTES del cupo. Después de la
 *     identidad porque un pedido sin sesión ya tiene su respuesta —el 401, que
 *     además le dice a la persona qué hacer— y no hace falta gastar una
 *     verificación más en él. Y antes del cupo porque si no, un pedido que se va
 *     a rechazar habría reservado un crédito que después hay que devolver: un
 *     camino de vuelta más, para nada.
 *   · el CRÉDITO se reserva ANTES de gastar plata en el modelo.
 *
 * Si el circuito se cae entre el 4 y el 6, el crédito vuelve; del 6 en adelante
 * ya está pagado (`CODIGOS_QUE_DEVUELVEN_EL_CREDITO`, más abajo, es la lista y
 * el porqué). El 403 de App Check no aparece en esa lista y no tiene por qué:
 * ocurre ANTES de la reserva, así que no hay nada que devolver.
 */
import { analizarEscaneo, type CatalogIndex, type EngineResult } from "../engine";
import { appCheckExigido, limitesDeCupo, type AppConfig } from "../config";
import { identificarDueño, type CabecerasDelPedido, type VerificadorDeToken } from "../auth/identidad";
import {
  ErrorDeAppCheck,
  comprobarProcedencia,
  decidirProcedencia,
  respuestaDeAppCheck,
  type CuerpoDeErrorDeAppCheck,
  type VerificadorDeAppCheck,
} from "../appcheck/procedencia";
import { momentoDelCupo, type Momento } from "../cupo/calendario";
import {
  fotoDelCupo,
  type FotoDelCupo,
  type LimitesDeCupo,
  type VeredictoDeCupo,
} from "../cupo/decision";
import {
  CLAVE_NO_ES_COMIDA,
  ErrorDeAnalisis,
  ErrorDeCupo,
  TEXTO_NO_ES_COMIDA_EN_FRIO,
  resolverTexto,
  respuestaDeError,
  type CodigoDeError,
  type CuerpoDeError,
} from "./errores";
import { MEDIA_TYPES, pedirVision, type ClienteDeVision, type MediaType, type OpcionesDeVision } from "./vision";

/**
 * QUÉ ERRORES DEVUELVEN EL CRÉDITO RESERVADO.
 *
 * El criterio es uno solo y se puede decir en una línea: **se devuelve lo que no
 * llegamos a pagar**. El crédito se reserva ANTES de llamar al modelo porque esa
 * llamada es la que cuesta dinero; si el circuito se cae antes de que el modelo
 * conteste —el modelo no responde, el catálogo no está, algo revienta del lado
 * nuestro— no se gastó nada y el crédito vuelve.
 *
 * Los dos casos que NO están en esta lista, y por qué:
 *
 *   `respuesta_ilegible`  el modelo SÍ contestó y esos tokens ya se facturaron.
 *                         Que su respuesta no se pudiera interpretar es un mal
 *                         resultado, no una llamada gratis.
 *   la foto que no es comida  ni siquiera es un error: es un 200. El modelo la
 *                         miró y dijo que no era comida, que es exactamente el
 *                         trabajo que se le pidió. Consume, como cualquier otro.
 *
 * Los errores de validación (`cuerpo_invalido`, `imagen_*`) y el `no_autenticado`
 * no necesitan estar acá: ocurren ANTES de la reserva, así que no hay nada que
 * devolver.
 */
export const CODIGOS_QUE_DEVUELVEN_EL_CREDITO: ReadonlySet<CodigoDeError> = new Set<CodigoDeError>([
  "modelo_no_disponible",
  "catalogo_no_disponible",
  "error_interno",
]);

/**
 * Techo del base64 que aceptamos: ~1,5 MB de imagen.
 *
 * El cliente comprime a ~1024 px y JPEG 80 antes de subir (§3 del plan), lo que
 * da entre 100 y 350 KB de base64. El techo está un orden de magnitud arriba: no
 * corta el uso normal y sí corta un envío que no puede venir de nuestra PWA.
 */
export const MAX_BASE64_CHARS = 2_000_000;

/** El pedido, ya leído. `body` es lo que sea que haya llegado. */
export interface PedidoDeAnalisis {
  method: string;
  body: unknown;
  /** Las cabeceras. De acá sale el `Authorization: Bearer <idToken>`. */
  headers?: CabecerasDelPedido;
}

export interface Dependencias {
  cliente: ClienteDeVision;
  /** El índice del catálogo. Se pide una vez por request y se resuelve al vuelo. */
  indice: () => Promise<CatalogIndex>;
  config: () => Promise<{ config: AppConfig }>;
  /** Verifica el ID token y devuelve el `uid`. El IO de Auth, inyectado. */
  verificarToken: VerificadorDeToken;
  /**
   * Verifica el token de App Check. El IO de la procedencia, inyectado.
   *
   * OPCIONAL, y su ausencia NO cierra la puerta: un montaje sin verificador cae
   * en `indeterminada`, que no bloquea nunca y grita en el log. La razón está
   * escrita entera en `appcheck/procedencia.ts` — fallar cerrado por un cable
   * suelto del backend apagaría la app para todos. Producción SIEMPRE lo
   * inyecta (`index.ts`).
   */
  verificarAppCheck?: VerificadorDeAppCheck;
  /** Reserva un crédito del cupo, o dice por qué no. Transacción, en Firestore. */
  reservarCupo: (entrada: {
    owner_id: string;
    momento: Momento;
    limites: LimitesDeCupo;
  }) => Promise<VeredictoDeCupo>;
  /** Devuelve el crédito reservado. Solo se llama en los casos de la lista de arriba. */
  devolverCupo: (entrada: { owner_id: string; momento: Momento }) => Promise<void>;
  /** Persiste el scan y la cola. Separada para poder medirla o suprimirla. */
  persistir: (datos: DatosAPersistir) => Promise<void>;
  nuevoScanId: () => string;
  /**
   * El reloj de la LATENCIA. Cuenta milisegundos, no fechas: los tests lo mueven
   * de a 100 para medir el `latency_ms` sin depender del reloj real.
   */
  ahora?: () => number;
  /**
   * El reloj del CALENDARIO, que es otra cosa: de acá sale en qué mes y en qué
   * día de Madrid cae este escaneo. Separado de `ahora` a propósito — un
   * contador de milisegundos falso no puede ser también una fecha.
   */
  fecha?: () => Date;
  opcionesDeVision?: OpcionesDeVision;
  /** Adónde van los avisos. Por defecto, a ningún lado (los tests no logean). */
  advertir?: (mensaje: string, detalle: Record<string, unknown>) => void;
}

export interface DatosAPersistir {
  owner_id: string;
  scan_id: string;
  resultado: EngineResult;
  meta: MetaDeRespuesta;
}

export interface MetaDeRespuesta {
  model: string;
  kb_version: string;
  /** El total del endpoint, de punta a punta. */
  latency_ms: number;
  /** Cuánto de ese total se fue en el modelo. Additivo: sirve para calibrar. */
  model_latency_ms: number;
  tokens_in: number;
  tokens_out: number;
}

export interface CuerpoDeAnalisis {
  scan_id: string | null;
  is_food: boolean;
  items: EngineResult["items"];
  totals: EngineResult["totals"];
  meta: MetaDeRespuesta;
  /** Solo cuando `is_food` es false: el texto simpático que ve el usuario. */
  message_es?: string;
  /**
   * ¿Quedó escrito el expediente? Additivo y honesto: si la persistencia falla,
   * el análisis ya se pagó y se devuelve igual, pero nadie tiene que suponer que
   * se guardó.
   */
  persisted: boolean;
  /**
   * CÓMO VA EL CUPO DESPUÉS DE ESTE ESCANEO. Additivo, y ya cobrado: `usados`
   * INCLUYE la foto que se acaba de analizar, así que un `mes: {usados: 15,
   * limite: 15}` significa «esta fue la última».
   *
   * La forma es la misma que la del bloque `quota` del 429 (§2 del contrato)
   * repetida para los dos tramos, sin el campo `ambito` —acá lo dice la clave—.
   * Así el front usa un solo componente para «te quedan N» y para «se te acabó»,
   * y no tiene que restar nada: los dos números vienen dados.
   *
   * Que el front lo muestre o no es decisión de otra card. El dato está.
   */
  quota: FotoDelCupo;
}

export interface RespuestaDeAnalisis {
  status: number;
  body: CuerpoDeAnalisis | CuerpoDeError | CuerpoDeErrorDeAppCheck;
}

// ---------------------------------------------------------------------------
// Validación del pedido (pura)
// ---------------------------------------------------------------------------

export interface EntradaValidada {
  image_base64: string;
  media_type: MediaType;
  /**
   * Lo que el cliente puso en `owner_id`, SOLO para el log. No decide nada: el
   * dueño sale del token (§1 del contrato de la WS09). Es `null` si no vino.
   */
  owner_id_del_cuerpo: string | null;
}

const PREFIJO_DATA_URI = /^data:image\/(jpeg|png|webp);base64,/;
const SOLO_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Valida el cuerpo del POST. Lanza `ErrorDeAnalisis` con el código exacto.
 *
 * Acepta el `data:` URI además del base64 pelado porque es lo que devuelve
 * `canvas.toDataURL()` en el navegador: rechazarlo obligaría a cada cliente a
 * cortar el prefijo, y ese corte hecho mal es un bug de una sola línea que se
 * descubre con una imagen ilegible en producción.
 */
export function validarEntrada(body: unknown): EntradaValidada {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ErrorDeAnalisis("cuerpo_invalido", "el cuerpo del pedido no es un objeto JSON");
  }
  const objeto = body as Record<string, unknown>;

  const crudo = objeto["image_base64"];
  if (typeof crudo !== "string" || crudo.length === 0) {
    throw new ErrorDeAnalisis("cuerpo_invalido", "falta `image_base64` o no es una cadena");
  }

  const media_type = objeto["media_type"];
  if (typeof media_type !== "string" || !(MEDIA_TYPES as readonly string[]).includes(media_type)) {
    throw new ErrorDeAnalisis(
      "cuerpo_invalido",
      `\`media_type\` tiene que ser uno de ${MEDIA_TYPES.join(", ")}`,
    );
  }

  // `owner_id` YA NO SE VALIDA, y eso es deliberado. El front dejó de mandarlo,
  // pero durante días va a haber teléfonos con la versión vieja cacheada que lo
  // sigan mandando (§1 del contrato). Rechazarlos con un 400 sería romperles la
  // app por un campo que ya no miramos: se descarta en silencio y se anota en el
  // log, que es la única forma de saber cuándo dejó de llegar.
  const owner = objeto["owner_id"];
  const owner_id_del_cuerpo = typeof owner === "string" && owner.trim().length > 0 ? owner.trim() : null;

  const sinPrefijo = crudo.replace(PREFIJO_DATA_URI, "").replace(/\s+/g, "");
  if (sinPrefijo.length > MAX_BASE64_CHARS) {
    throw new ErrorDeAnalisis(
      "imagen_muy_grande",
      `la imagen trae ${sinPrefijo.length} caracteres de base64 y el techo es ${MAX_BASE64_CHARS}`,
    );
  }
  if (sinPrefijo.length === 0 || sinPrefijo.length % 4 !== 0 || !SOLO_BASE64.test(sinPrefijo)) {
    throw new ErrorDeAnalisis("imagen_invalida", "`image_base64` no es base64 válido");
  }

  return { image_base64: sinPrefijo, media_type: media_type as MediaType, owner_id_del_cuerpo };
}

// ---------------------------------------------------------------------------
// El circuito
// ---------------------------------------------------------------------------

/** Corre el análisis entero y devuelve el par `{ status, body }`. Nunca lanza. */
export async function manejarAnalyze(
  pedido: PedidoDeAnalisis,
  deps: Dependencias,
): Promise<RespuestaDeAnalisis> {
  const ahora = deps.ahora ?? Date.now;
  const comenzo = ahora();
  let copy: Record<string, string> = {};
  let configPublicada: AppConfig | null = null;

  // Lo que hace falta para poder DEVOLVER el crédito si esto se cae: qué dueño y
  // qué período se reservaron, y si el modelo ya contestó (o sea, si ya se pagó).
  let reservado: { owner_id: string; momento: Momento } | null = null;
  let elModeloYaCobro = false;

  try {
    if (pedido.method.toUpperCase() !== "POST") {
      throw new ErrorDeAnalisis("metodo_no_permitido", `llegó un ${pedido.method}`);
    }

    // El copy se lee ANTES de poder fallar: un error que se responde con el
    // texto en frío teniendo la configuración a mano sería un error evitable.
    try {
      configPublicada = (await deps.config()).config;
      copy = configPublicada.copy ?? {};
    } catch {
      copy = {};
    }

    // 1. QUIÉN. Antes que el cuerpo: a quien no sabemos quién es no le contamos
    //    qué le pasa a su JSON. Sin token, token roto o token vencido ⇒ 401.
    const dueño = await identificarDueño(pedido.headers ?? {}, deps.verificarToken);

    // 2. DE DÓNDE VIENE. `comprobarProcedencia` no lanza nunca: mira y cuenta.
    //    Quien decide es `decidirProcedencia`, y lo que le da la orden es un
    //    campo de `config/app` —no una constante de este archivo—, así que el
    //    bloqueo se enciende y se apaga sin desplegar. Con el interruptor en
    //    `false` (el arranque en frío) esto solo ANOTA: no puede rechazar nada.
    const procedencia = await comprobarProcedencia(pedido.headers ?? {}, deps.verificarAppCheck);
    const veredictoDeProcedencia = decidirProcedencia(procedencia, appCheckExigido(configPublicada));
    if (veredictoDeProcedencia.nivel !== "silencio") {
      deps.advertir?.("App Check: el pedido no trae una procedencia verificada", {
        estado: procedencia.estado,
        nivel: veredictoDeProcedencia.nivel,
        bloquea: veredictoDeProcedencia.bloquea,
        uid: dueño.uid,
        ...("motivo" in procedencia ? { motivo: procedencia.motivo } : {}),
      });
    }
    if (veredictoDeProcedencia.bloquea) throw new ErrorDeAppCheck(procedencia);

    const entrada = validarEntrada(pedido.body);
    if (entrada.owner_id_del_cuerpo !== null) {
      // No rompe y no manda: solo queda anotado. Cuando este aviso deje de
      // aparecer en los logs es que ya no queda ningún cliente viejo cacheado.
      deps.advertir?.("llegó `owner_id` en el cuerpo: se ignora, el dueño sale del token", {
        owner_id_del_cuerpo: entrada.owner_id_del_cuerpo,
        uid_del_token: dueño.uid,
        coincide: entrada.owner_id_del_cuerpo === dueño.uid,
      });
    }

    // 3. CUÁNTO LE QUEDA. La reserva va ANTES del catálogo y ANTES del modelo:
    //    es la comprobación más barata que puede rebotar el pedido, y reservar
    //    después de pagar la llamada sería reservar tarde.
    const momento = momentoDelCupo((deps.fecha ?? (() => new Date()))());
    const limites = limitesDeCupo(configPublicada);
    const veredicto = await deps.reservarCupo({ owner_id: dueño.uid, momento, limites });
    if (!veredicto.entra) throw new ErrorDeCupo(veredicto.bloqueo);
    reservado = { owner_id: dueño.uid, momento };
    const cupo = fotoDelCupo(veredicto.consumo, limites, momento);

    const indice = await deps.indice();

    // La `kb_version` cruzada, que el motor deja explícitamente a esta card.
    // NO aborta: el scan estampa la versión CON LA QUE SE CALCULÓ, así que la
    // trazabilidad está a salvo igual. Lo que la diferencia delata es que uno de
    // los dos seeds no corrió (el catálogo y `config/app` los estampa el mismo
    // seeder), y eso hay que verlo en el log antes de que alguien compare dos
    // scans y no entienda por qué no dan lo mismo.
    const esperada = configPublicada?.kb_version ?? null;
    if (esperada !== null && esperada !== indice.kb_version) {
      deps.advertir?.("la kb_version del catálogo no es la que config/app espera", {
        catalogo: indice.kb_version,
        config_app: esperada,
      });
    }

    const { vision, meta: metaVision } = await pedirVision(
      deps.cliente,
      { image_base64: entrada.image_base64, media_type: entrada.media_type },
      deps.opcionesDeVision ?? {},
    );

    // El modelo contestó: a partir de acá el crédito está PAGADO y no vuelve,
    // pase lo que pase más abajo.
    elModeloYaCobro = true;

    const resultado = analizarEscaneo(vision, indice);

    const meta: MetaDeRespuesta = {
      model: metaVision.model,
      kb_version: resultado.kb_version,
      latency_ms: ahora() - comenzo,
      model_latency_ms: metaVision.latency_ms,
      tokens_in: metaVision.tokens_in,
      tokens_out: metaVision.tokens_out,
    };

    // La foto que no es comida: 200, ítems vacíos, copy simpático y NADA
    // escrito. No se persiste el scan a propósito (§7 del plan): no hubo
    // análisis que guardar y el expediente de una foto de un perro no le sirve
    // a nadie. `scan_id` viaja en `null` porque no hay documento que nombrar.
    if (!resultado.es_comida) {
      const texto = resolverTexto(CLAVE_NO_ES_COMIDA, TEXTO_NO_ES_COMIDA_EN_FRIO, copy);
      return {
        status: 200,
        body: {
          scan_id: null,
          is_food: false,
          items: [],
          totals: null,
          meta,
          message_es: texto.message_es,
          persisted: false,
          // CONSUME IGUAL, y por eso el cupo viaja también acá: el modelo miró
          // la foto y contestó lo que se le preguntó. No se persiste nada
          // (§7 del plan) porque no hay análisis que guardar, pero el crédito
          // se gastó y decirle al usuario que no sería mentirle.
          quota: cupo,
        },
      };
    }

    const scan_id = deps.nuevoScanId();
    let persisted = true;
    try {
      await deps.persistir({ owner_id: dueño.uid, scan_id, resultado, meta });
    } catch (err) {
      // El análisis ya se pagó: se devuelve igual, con `persisted: false` para
      // que nadie suponga que quedó escrito.
      persisted = false;
      deps.advertir?.("no se pudo persistir el scan", { scan_id, error: describir(err) });
    }

    return {
      status: 200,
      body: {
        scan_id,
        is_food: true,
        items: resultado.items,
        totals: resultado.totals,
        meta,
        persisted,
        quota: cupo,
      },
    };
  } catch (err) {
    // EL 403 DE APP CHECK SALE POR ACÁ Y NO POR `respuestaDeError`, y es
    // temporal: su código todavía no está en la lista cerrada de `errores.ts`
    // —ese archivo es territorio de otra card— así que se responde con la
    // definición que vive en `appcheck/procedencia.ts`, con la misma forma. El
    // día que la fila se integre, esta rama se borra y el código entra por el
    // camino de siempre.
    //
    // Va PRIMERO en el catch por una razón concreta: sin esto caería en el
    // `else` y se respondería un 500, que es exactamente lo que no puede pasar.
    // Y no hay crédito que devolver: esto se lanza antes de la reserva.
    if (err instanceof ErrorDeAppCheck) {
      deps.advertir?.("analyze rechazó el pedido: App Check exigido y no verificado", {
        estado: err.resultado.estado,
      });
      return respuestaDeAppCheck(copy);
    }

    const codigo: CodigoDeError = err instanceof ErrorDeAnalisis ? err.codigo : "error_interno";
    const detalle = err instanceof ErrorDeAnalisis ? err.detalle : describir(err);
    deps.advertir?.("analyze falló", { codigo, detalle });

    // El crédito vuelve solo si se reservó, si el modelo todavía no cobró y si
    // el error es de los nuestros. Que la devolución falle NO puede convertir un
    // 503 en un 500: se anota con el dueño y el período para poder arreglarlo a
    // mano, y el error original sigue su camino.
    if (reservado !== null && !elModeloYaCobro && CODIGOS_QUE_DEVUELVEN_EL_CREDITO.has(codigo)) {
      try {
        await deps.devolverCupo(reservado);
      } catch (errDeDevolucion) {
        deps.advertir?.("no se pudo devolver el crédito del cupo", {
          owner_id: reservado.owner_id,
          periodo: reservado.momento.mes,
          error: describir(errDeDevolucion),
        });
      }
    }

    return respuestaDeError(codigo, copy, err instanceof ErrorDeCupo ? err.bloqueo : undefined);
  }
}

function describir(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
