/**
 * El catálogo, traído de Firestore UNA VEZ por instancia caliente.
 *
 * Traer 1.022 fichas en cada request sería pagar la lectura entera del catálogo
 * por cada foto: la misma lectura, el mismo resultado, mil veces. Se hace una
 * sola vez y se comparte.
 *
 * LO QUE HACE QUE ESTO SEA CORRECTO Y NO SOLO RÁPIDO: se comparte la PROMESA, no
 * el resultado. Si dos requests llegan juntos a una instancia recién levantada,
 * el segundo se cuelga de la carga del primero en vez de disparar una segunda
 * lectura completa; y si la carga FALLA, la promesa se descarta para que el
 * request siguiente vuelva a intentar en vez de heredar el error para siempre.
 *
 * Sobre la frescura: una instancia caliente sirve el catálogo con el que
 * arrancó. Un re-seed se ve en las instancias nuevas y en las viejas cuando se
 * reciclan (minutos, en la práctica). Es la elección deliberada: el catálogo
 * cambia con un PR y un seed, no en el medio de un análisis, y cada scan estampa
 * la `kb_version` con la que se calculó — si dos scans salieron con catálogos
 * distintos, el expediente lo dice.
 */
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";

import { construirIndice, type CatalogIndex, type GuardaDeVocabulario } from "../engine";
import type { CanonicalFood } from "../kb/types";
import { ErrorDeAnalisis } from "./errores";

export const COLECCION_ALIMENTOS = "foods";
export const COLECCION_CONFIG = "config";
export const DOCUMENTO_META = "kb_meta";

/**
 * El piso de fichas que hace que un catálogo sea un catálogo.
 *
 * NO ES UNA PARANOIA, ES EL ÚNICO ERROR DE ESTA CARD QUE SE ROMPE HACIA
 * ADELANTE: con `foods/` a medias —un seed cortado por la mitad, una base
 * apuntada al proyecto equivocado— el motor no falla. Responde. Y responde que
 * el pollo con arroz no está catalogado, escribe "chicken" y "rice" en la cola
 * de curación, y el catálogo empieza a "aprender" alimentos que ya tiene. Un
 * 503 se arregla en cinco minutos; una cola de curación contaminada con comida
 * normal hay que auditarla a mano.
 *
 * El número sale de la medición: el catálogo canónico 3.0.0 tiene 1.022 fichas.
 * 900 deja lugar a una depuración razonable y no a media base.
 *
 * Es un piso MÁS ALTO que el del motor (`MINIMO_DE_FICHAS`, 100), y los dos
 * tienen sentido: el del motor es estructural —"esto no es un catálogo"— y vale
 * para cualquiera que lo use, fixtures incluidos; este es de ESTE despliegue,
 * que sabe cuántas fichas tiene que haber porque las sembró él.
 */
export const PISO_DE_FICHAS = 900;

/**
 * Trae las fichas y la versión, y arma el índice. Recibe la base por parámetro:
 * los tests le pasan la del emulador sin tocar el estado del módulo.
 */
export async function cargarIndice(db: Firestore): Promise<CatalogIndex> {
  const [alimentos, meta] = await Promise.all([
    db.collection(COLECCION_ALIMENTOS).get(),
    db.collection(COLECCION_CONFIG).doc(DOCUMENTO_META).get(),
  ]);

  if (alimentos.size < PISO_DE_FICHAS) {
    throw new ErrorDeAnalisis(
      "catalogo_no_disponible",
      `la colección \`foods\` trae ${alimentos.size} fichas y el piso es ${PISO_DE_FICHAS}: ` +
        "el catálogo no está sembrado, o lo está a medias. Analizar con esto llenaría la cola " +
        "de curación de alimentos que el catálogo YA tiene.",
    );
  }

  const kb_version = meta.exists ? (meta.data()?.["kb_version"] as unknown) : undefined;
  if (typeof kb_version !== "string" || kb_version.length === 0) {
    throw new ErrorDeAnalisis(
      "catalogo_no_disponible",
      "`config/kb_meta.kb_version` no está publicada: sin versión no hay trazabilidad del scan",
    );
  }

  // El documento de Firestore es la ficha canónica más `kb_version` (así lo
  // escribe `kb/seed`), y `construirIndice` ignora las claves que le sobran.
  const fichas = alimentos.docs.map((doc) => doc.data() as CanonicalFood);

  // Las guardas de vocabulario, que desde la DT-32 viajan con el catálogo. Acá
  // llegan por `config/kb_meta` y no por el archivo del repo, porque esta es la
  // única ruta del sistema que NO lee `foods.canonical.json`: arma las fichas
  // documento por documento. Es la misma lista que el build emitió y que el
  // candado 1 verificó — el seed la copia sin tocarla.
  const guardas = guardasPublicadas(meta.exists ? meta.data()?.["guardas"] : undefined);

  // `construirIndice` LANZA con menos de `MINIMO_DE_FICHAS` (100) activas. Es su
  // candado estructural y está bien que lance; lo que no puede pasar es que esa
  // excepción llegue al cliente como un 500 anónimo. Acá se traduce al mismo
  // 503 con mensaje en español que da el piso de este despliegue: para quien
  // mira la respuesta, "el catálogo no está" es un solo problema.
  let index: CatalogIndex;
  try {
    // Sin guardas publicadas NO se pasa una lista vacía: se deja el arranque en
    // frío del motor. Una base sembrada antes de la DT-32 tiene que responder
    // con las dos prohibiciones de siempre y no con ninguna — y el aviso de
    // abajo dice que le faltan diecinueve.
    index = construirIndice(fichas, kb_version, guardas === null ? {} : { guardas });
  } catch (err) {
    throw new ErrorDeAnalisis(
      "catalogo_no_disponible",
      `el motor rechazó el catálogo leído de Firestore: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // El segundo piso, sobre lo que el matcher puede USAR de verdad: las fichas
  // `deprecated` cuentan como documentos pero no entran al índice (regla dura 6).
  // Una deprecación masiva dejaría 1.022 documentos y un índice inservible.
  if (index.exactoEn.size < PISO_DE_FICHAS) {
    throw new ErrorDeAnalisis(
      "catalogo_no_disponible",
      `el índice quedó con ${index.exactoEn.size} términos activos de ${fichas.length} fichas ` +
        `y el piso es ${PISO_DE_FICHAS}: hay una deprecación masiva sin revisar.`,
    );
  }

  if (guardas === null) {
    // No aborta, y la decisión es deliberada: un catálogo sin guardas publicadas
    // sigue siendo un catálogo utilizable —el matcher responde con su arranque en
    // frío— y tumbar el análisis por esto sería cambiar un vocabulario incompleto
    // por un 503. Suena fuerte porque el síntoma es invisible desde afuera: los
    // reportes salen, con dieciocho prohibiciones menos de las declaradas.
    logger.warn("`config/kb_meta.guardas` no está publicada: el matcher corre con el arranque en frío", {
      kb_version,
      guardas_en_uso: index.guardas.length,
      remedio: "re-sembrar el catálogo (`npm run kb:seed`) con un build 3.8.0 o posterior",
    });
  }

  if (index.colisiones.length > 0) {
    // No aborta: el índice tiene una regla declarada de desempate (gana el
    // primero por orden de id) y el motor tiene que seguir respondiendo. Suena
    // acá para que se arregle en la curación, que es donde se arregla.
    logger.warn("el índice del catálogo tiene colisiones de vocabulario", {
      colisiones: index.colisiones.length,
      ejemplos: index.colisiones.slice(0, 5),
    });
  }

  logger.info("catálogo cargado", {
    kb_version,
    fichas: fichas.length,
    terminos_en: index.exactoEn.size,
    terminos_es: index.exactoEs.size,
    guardas: index.guardas.length,
  });

  return index;
}

/**
 * Las guardas tal como quedaron publicadas, o `null` si no hay ninguna usable.
 *
 * LA FRONTERA, con la misma regla que el resto de las lecturas del expediente:
 * lo que viene de Firestore se saneó una vez al escribirse pero se vuelve a leer
 * como si no. Una guarda a medio escribir NO se descarta en silencio ni tumba el
 * arranque: se descarta ELLA y las demás siguen, porque una prohibición rota no
 * es motivo para quedarse sin las otras veinte.
 *
 * `null` —y no `[]`— cuando no quedó ninguna: significa "acá no hay lista", que
 * es lo que hace que el llamador caiga al arranque en frío en vez de correr sin
 * ninguna guarda. Una base sembrada antes de la DT-32 no trae la clave.
 */
export function guardasPublicadas(crudo: unknown): GuardaDeVocabulario[] | null {
  if (!Array.isArray(crudo)) return null;
  const guardas: GuardaDeVocabulario[] = [];
  for (const item of crudo) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const g = item as Partial<GuardaDeVocabulario>;
    if (typeof g.termino !== "string" || g.termino.trim() === "") continue;
    if (!Array.isArray(g.prohibido_en) || g.prohibido_en.length === 0) continue;
    if (g.prohibido_en.some((id) => typeof id !== "string")) continue;
    const salvo = Array.isArray(g.salvo_si_contiene)
      ? g.salvo_si_contiene.filter((p): p is string => typeof p === "string")
      : undefined;
    guardas.push({
      termino: g.termino,
      prohibido_en: g.prohibido_en,
      ...(salvo === undefined || salvo.length === 0 ? {} : { salvo_si_contiene: salvo }),
      motivo: typeof g.motivo === "string" ? g.motivo : "",
    });
  }
  return guardas.length === 0 ? null : guardas;
}

/** La promesa compartida de la instancia. `null` = todavía no se pidió, o falló. */
let enVuelo: Promise<CatalogIndex> | null = null;

/**
 * El índice de esta instancia. La primera llamada lo carga; las demás esperan
 * esa misma carga.
 */
export function obtenerIndice(db: Firestore = getFirestore()): Promise<CatalogIndex> {
  if (enVuelo === null) {
    enVuelo = cargarIndice(db).catch((err: unknown) => {
      enVuelo = null; // un fallo no se hereda: el request siguiente reintenta
      throw err;
    });
  }
  return enVuelo;
}

/** Olvida el índice cargado. Existe para los tests; el runtime no la llama. */
export function reiniciarIndice(): void {
  enVuelo = null;
}
