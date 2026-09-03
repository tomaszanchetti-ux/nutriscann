/* =============================================================================
 * COPIA DE CONTRATO — el original vive en `functions/src/engine/types.ts`.
 *
 * Por qué hay una copia y no un import: el repo NO USA WORKSPACES DE NPM (regla
 * del proyecto, ver CLAUDE.md). `apps/web` y `functions` son dos paquetes que
 * instalan lo suyo; un `import` a `../../functions/src` compilaría en local y se
 * rompería en el build de Vite y en el empaquetado de Cloud Functions.
 *
 * Qué se copió: SOLO los tipos que el front necesita para dibujar el reporte.
 * Los tipos de ENTRADA del motor (`VisionResult`, `VisionItem`) no están acá a
 * propósito: el navegador nunca los ve, manda una foto y recibe un reporte.
 *
 * ---------------------------------------------------------------------------
 * AHORA HAY CANDADO (DT-20, card 3.1).
 *
 * Hasta la card 3.1 esta copia no tenía nada que la atara al original, y se
 * separó de verdad y en silencio: la card 6.1 del motor hizo que los ocho
 * nutrientes del total pudieran viajar en `null` (la compuerta cierra el payload
 * entero) y acá seguía escrito `kcal: number`. En runtime no se rompía —el
 * render ya se escondía detrás de `macro_pct !== null`— pero el contrato mentía,
 * y una pantalla que se dibuja contra un tipo que miente falla el día que el
 * dato llega.
 *
 * El candado vive en `kb/seed/src/contrato-front.test.ts` (`npm --prefix kb/seed
 * test`) y compara, tipo por tipo y campo por campo, ESTE archivo contra
 * `functions/src/engine/types.ts` — más `Per100g` contra `kb/src/types.ts`, que
 * es su origen real. No compara bytes porque esta copia es un SUBCONJUNTO con
 * sus propios comentarios: compara la lista de campos y el texto de cada tipo,
 * que es lo que de verdad tiene que coincidir.
 *
 * Si ese test falla: se copia el campo del original tal cual está allá. No se
 * "arregla" acá inventando una forma parecida.
 * ---------------------------------------------------------------------------
 * Origen: functions/src/engine/types.ts + kb/src/types.ts (Per100g).
 * Alineado el 01/09/2026 (card 3.1) contra el motor de la WS07: `termino_es`
 * siempre presente (DT-25), `identidad_respaldada` (DT-37) y los ocho valores
 * del total nullables + la marca de la compuerta (card 6.1). Realineado el
 * 03/09/2026 (card 6.2): la compuerta se fue, esa marca se fue con ella, y el
 * total se publica siempre.
 * ========================================================================== */

/** Valores por 100 g. Origen: `kb/src/types.ts` → `Per100g`. */
export interface Per100g {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sat_fat_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
}

/** Los mismos ocho valores, ya escalados a los gramos del plato. */
export type Per100gEscalado = Per100g;

/**
 * Cómo se llegó a la ficha (o a la falta de ficha).
 *
 * Espejo de `functions/src/engine/types.ts`. Los cuatro sellos de la card 5.3
 * son los escalones que el motor bajó cuando el NOMBRE del alimento no llegó a
 * ninguna ficha: un sustituto que escribió la curación, la ficha que representa
 * a su grupo, la que representa a su familia, o una composición a la que le
 * faltaba un ingrediente menor. Los cuatro dan número; los cuatro lo dan con
 * menos confianza que un nombre, y por eso se muestran distinto.
 */
export type TipoDeMatch =
  | "exacto"
  | "alias"
  | "difuso"
  | "sustituto"
  | "cabeza_subfamilia"
  | "cabeza_familia"
  | "compuesto"
  | "compuesto_parcial"
  | "no_catalogado";

/** Un ingrediente resuelto dentro de un plato compuesto en runtime. */
export interface ComponenteDelPlato {
  termino_en: string;
  grams: number;
  food_id: string;
  name_es: string | null;
  source_ref: string;
  match: TipoDeMatch;
  confidence_match: number;
  generic: boolean;
  /**
   * ESTE INGREDIENTE NO SE ENCONTRÓ POR SU NOMBRE (card 5.3). Solo cuando la
   * ficha que se usó es un sustituto declarado o la que representa a su grupo.
   */
  reemplazo?: { por: "sustituto" | "cabeza_subfamilia" | "cabeza_familia"; motivo: string };
}

/** Un ingrediente que se vio y no se pudo resolver, con los gramos que pesaba. */
export interface ComponenteFaltante {
  termino_en: string;
  grams: number;
}

/** La cuenta de una composición, entera y a la vista. */
export interface Composicion {
  metodo: string;
  componentes: ComponenteDelPlato[];
  /**
   * EL COMPONENTE PEOR IDENTIFICADO DEL PLATO (card 6.1). Ver el original en
   * `functions/src/engine/types.ts`: la confianza del compuesto pasó a ser un
   * promedio ponderado por gramos, y este campo es la contrapartida — el
   * eslabón más débil dejó de decidir la confianza, pero no dejó de verse.
   */
  eslabon_mas_debil: { termino_en: string; name_es: string | null; confidence_match: number };
  peso_entrada_g: number;
  aceite_absorbido_g: number;
  aceite_ref: string | null;
  peso_final_g: number;
  rendimiento_de: "transformacion" | "receta";
  /** La composición no tiene todo el plato adentro (card 5.3). */
  parcial?: true;
  /** Los ingredientes que se vieron y no se resolvieron. */
  faltantes?: ComponenteFaltante[];
  /** Cuántos gramos del plato representan esos faltantes. */
  gramos_faltantes?: number;
  /** Los gramos a los que se escaló el `per_100g` de lo resuelto. */
  gramos_del_plato?: number;
}

export interface EngineItem {
  termino_en: string;
  /**
   * EL MISMO TÉRMINO EN ESPAÑOL, TAL COMO LO EMITIÓ LA VISIÓN (DT-25).
   *
   * SIEMPRE PRESENTE, y vale `""` cuando la visión no dijo nada en español. No
   * es el término que ganó el match —eso lo cuenta `motivo`— pero es lo mejor
   * que hay para nombrar un alimento SIN ficha: hasta acá esos se mostraban en
   * inglés porque era lo único que llegaba.
   */
  termino_es: string;
  food_id: string | null;
  name_es: string | null;
  name_en: string | null;
  source_ref: string | null;
  grams: number;
  /** vision × matching × factores. Es la que se le muestra al usuario. */
  confidence: number;
  confidence_vision: number;
  confidence_match: number;
  match: TipoDeMatch;
  /** Solo cuando vale `true`: la ficha mide el promedio de una familia. */
  generic?: true;
  /**
   * LA FICHA NOMBRA LO QUE LA VISIÓN DESCRIBIÓ (DT-37). Solo cuando vale `true`.
   *
   * No es una confianza: es la segunda puerta de la compuerta del total. Un
   * plato de confianza baja puede publicar total si alguna ficha nombra de
   * verdad lo que se describió.
   */
  identidad_respaldada?: true;
  /**
   * `true` cuando la visión devolvió gramos inutilizables: la ficha se
   * identificó (`food_id` presente) pero no se cuantificó (`nutrients: null`).
   */
  grams_no_estimados?: true;
  caveats?: string[];
  per_100g: Per100g | null;
  nutrients: Per100gEscalado | null;
  motivo: string;
  composicion?: Composicion;
}

/**
 * LOS OCHO VALORES DEL TOTAL, Y LOS OCHO PUEDEN SER `null`.
 *
 * En el motor esto es un tipo mapeado sobre `SumaDeNutrientes` (la suma cruda,
 * que no viaja). Acá se escribe campo por campo porque el front no tiene la
 * suma cruda — el candado verifica que los ocho nombres sean los mismos y que
 * los ocho estén en `number | null`.
 *
 * Card 6.2: un `null` acá significa una sola cosa, "la fuente no declara este
 * valor" — hasta esta card podía significar además "la compuerta del total
 * cerró", con una marca aparte que lo decía, y esa segunda lectura se fue con
 * la compuerta: el total se publica siempre.
 */
export interface TotalesNutrientes {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sat_fat_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
}

/**
 * El reparto calórico: los tres suman 100 y ninguno sale de 0..100 (card 5.1).
 *
 * Cada uno es su parte de las calorías que APORTAN LOS MACROS (`P×4+C×4+F×9`),
 * no de las kcal de la ficha. Lo que la ficha declara de más o de menos viaja
 * aparte, en los tres campos de abajo, y no deforma el anillo.
 */
export interface PorcentajesDeMacros {
  protein: number;
  carbs: number;
  fat: number;
  /** Las kcal de la ficha que los macros no explican, con signo. */
  kcal_fuera_de_macros: number;
  /** Lo mismo en porcentaje de las kcal de la fuente. La banana da −10,9. */
  diferencia_pct: number;
  /**
   * Por qué existe esa diferencia, o `null` cuando es ruido de redondeo. El
   * umbral lo decide el motor: acá no se compara contra ningún número, se
   * dibuja la letra chica si vino escrita.
   */
  motivo_de_la_diferencia: string | null;
}

/** Las cuatro claves opcionales que pueden faltar, con el motivo de la falta. */
export type OpcionalAusente = "fiber_g" | "sat_fat_g" | "sugars_g" | "sodium_mg";

export interface EngineTotals {
  /** Viaja SIEMPRE que haya algo que sumar (card 6.2): el total ya no se apaga. */
  nutrients: TotalesNutrientes;
  opcionales_ausentes: Partial<Record<"fiber_g" | "sat_fat_g" | "sugars_g" | "sodium_mg", string>>;
  macro_pct: PorcentajesDeMacros | null;
  macro_pct_motivo: string | null;
  grams_total: number;
  grams_cuantificados: number;
  items_incluidos: number;
  items_sin_datos: number;
  /** `true` solo si todos los items del escaneo aportaron números (cobertura de masa). */
  completo: boolean;
}

// ---------------------------------------------------------------------------
// El sobre del endpoint — contrato fijado por el orquestador de la WS04.
// Origen: la card 2.2 (`POST analyze`). No está en el archivo de tipos del
// motor porque el motor no sabe de HTTP: `items` y `totals` son su salida tal
// cual, y el resto es lo que agrega el endpoint. Por eso el candado NO lo mira.
// ---------------------------------------------------------------------------

export interface MetaDelScan {
  model: string;
  kb_version: string;
  /** El total del endpoint, de punta a punta. */
  latency_ms: number;
  /** Cuánto de ese total se fue en el modelo. Aditivo: sirve para calibrar. */
  model_latency_ms: number;
  tokens_in: number;
  tokens_out: number;
}

export interface RespuestaDeAnalisis {
  /** `null` cuando no hubo escaneo que guardar (la foto no era comida). */
  scan_id: string | null;
  /** `false` cuando la foto no es comida: `items` viene vacío. */
  is_food: boolean;
  items: EngineItem[];
  /** `null` si NINGÚN item pudo cuantificarse. */
  totals: EngineTotals | null;
  meta: MetaDelScan;
  /** Solo cuando `is_food` es false: el texto simpático que redactó el backend. */
  message_es?: string;
  /**
   * ¿Quedó escrito el expediente? Si la persistencia falla, el análisis ya se
   * pagó y se devuelve igual — pero nadie tiene que suponer que se guardó, así
   * que la pantalla lo dice en el pie del reporte.
   */
  persisted: boolean;
}

/** El cuerpo de un error del backend: un código estable y un texto en español. */
/**
 * El bloque `quota` que acompaña al 429 `cupo_agotado` (contrato WS09 §2).
 *
 * ES OPCIONAL POR CONTRATO, y el front está escrito para que lo sea de verdad:
 * sin él se muestra el `message_es` del backend y nada más. Cuando viene, es lo
 * que deja decir "has usado 15 de 15 fotos este mes" y "se renueva el 1 de
 * octubre", que es lo que de verdad quiere saber quien se quedó sin cupo.
 *
 * `ambito` distingue los dos frenos del §6.7: el cupo del MES, que es la promesa
 * que se comunica, y el tope del DÍA, que es solo anti-ráfaga interno.
 *
 * `se_renueva` es una fecha `YYYY-MM-DD` cortada en Europe/Madrid (contrato §3),
 * no un instante: se muestra tal cual, sin convertir de zona horaria.
 */
export interface CupoDelBackend {
  ambito: "mes" | "dia";
  usados: number;
  limite: number;
  se_renueva?: string;
}

export interface ErrorDelBackend {
  /** `copy_source` declara de dónde salió el texto: "config" o "cold-start-default". */
  error: {
    code: string;
    message_es: string;
    copy_source?: string;
    /** Solo en el 429. Ver `CupoDelBackend`: opcional de verdad. */
    quota?: CupoDelBackend;
  };
}
