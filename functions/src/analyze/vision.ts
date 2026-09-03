/**
 * Paso 1 del motor: la ÚNICA llamada al modelo de todo el sistema.
 *
 * Acá el modelo hace lo único que hace bien y nada más: MIRAR. Dice qué ve y
 * cuántos gramos calcula; los números nutricionales salen después, de `foods/`.
 *
 * REGLA DURA 2, escrita en el esquema: `ESQUEMA_VISION` no tiene ni `kcal` ni
 * macros. No es que el backend los descarte — es que la salida estructurada
 * (`output_config.format`) hace que el modelo no pueda emitirlos. La regla no es
 * una intención: es una imposibilidad.
 *
 * GOTCHAS DEL MODELO (documentados en CLAUDE.md, y por qué este archivo se ve
 * más pelado que el ejemplo típico del SDK):
 *   - Sonnet 5 RECHAZA `temperature`, `top_p` y `budget_tokens` con un 400. No
 *     están y no pueden estar.
 *   - El prefill de la respuesta también fue removido: la forma de la salida se
 *     fija con el esquema, no poniéndole palabras en la boca al modelo.
 *
 * SEPARACIÓN DECISIÓN / IO: la función recibe el cliente por parámetro
 * (`ClienteDeVision`) y no lo construye. Los tests le pasan uno falso y miden el
 * circuito entero —reintentos, `stop_reason`, JSON roto— sin gastar un token.
 */
import Anthropic from "@anthropic-ai/sdk";

import type { Preparacion, VisionComponent, VisionItem, VisionResult } from "../engine";
import { COOKING_TRANSFORMS } from "../kb/cooking.transforms";
import type { Familia, Subfamilia } from "../kb/familias";
import { FAMILIAS, IDS_FAMILIA_SUBFAMILIA } from "../kb/familias";
import { ErrorDeAnalisis } from "./errores";

/** El modelo. Está en `CLAUDE.md` y en el §D4 del plan; no se elige por request. */
export const MODELO_VISION = "claude-sonnet-5";

/**
 * Techo de la respuesta. Un plato con muchos ingredientes ronda los 600 tokens
 * de JSON; 4.096 deja margen de sobra sin que un modelo desbocado corra el
 * timeout de la función.
 */
export const MAX_TOKENS_VISION = 4096;

/**
 * Cuántos alimentos como mucho se aceptan de un escaneo.
 *
 * El motor no limita la cantidad de items a propósito (lo dice su docstring: el
 * contrato de negocio es de esta card). El techo existe porque un plato real no
 * tiene 200 ingredientes: una lista así es un modelo desbocado o una foto de un
 * bufé, y cada item de más es una búsqueda en el índice, un item en la respuesta
 * y una fila en el expediente. 40 es holgado —una paella con todo declarado no
 * pasa de 15— y acota el peor caso. Se CORTA, no se rechaza: los primeros 40
 * items de un escaneo desbocado siguen siendo un reporte útil.
 */
export const MAX_ITEMS = 40;

/**
 * Cómo se lee cada método de cocción, para que el modelo sepa qué está eligiendo.
 *
 * El TIPO es la lista: `Record<Preparacion, string>` obliga a que estén los ocho
 * de `engine/types.ts` y ninguno más — si mañana la tabla de cocción gana un
 * noveno, esto no compila hasta que alguien escriba qué significa. La glosa es
 * texto; la LISTA nunca se escribe a mano (ver `PREPARACIONES`).
 */
const GLOSA_DE_PREPARACION: Record<Preparacion, string> = {
  crudo: "sin cocinar (fruta, verdura cruda, jamón crudo)",
  mezclado: "mezclado o servido sin una cocción propia que se distinga; es el caso general",
  frito: "frito en aceite abundante (rebozados, patatas fritas, croquetas)",
  horneado: "al horno o asado, en seco",
  plancha: "a la plancha, parrilla o sartén con poco aceite",
  hervido: "hervido, guisado en agua o al vapor (legumbre, pasta, arroz, verdura)",
  horneado_masa: "masa horneada (pan, pizza, bollería, empanada, tarta)",
  cocido_cebolla: "pochado o sofrito lento en aceite (cebolla, sofrito, pimiento confitado)",
};

/**
 * Los OCHO métodos de cocción, en el orden de la tabla de cocción.
 *
 * SALEN DE `COOKING_TRANSFORMS`, no de una lista escrita acá. Hasta la Fase 5
 * eran cinco copiados a mano y el Bloque 0 midió lo que costaba: faltaban
 * `crudo`, `hervido` y `cocido_cebolla`, así que 24 subfamilias de verdura,
 * legumbre y patata declaraban `mezclado` (factor 1,000) y una lenteja hervida
 * se componía sin el agua que gana (1,113). Que la lista salga de la tabla es lo
 * que garantiza que el enum y el rendimiento no se separen nunca.
 */
export const PREPARACIONES: readonly Preparacion[] = Object.keys(COOKING_TRANSFORMS) as Preparacion[];

/**
 * La taxonomía escrita para el modelo: 46 familias, 191 subfamilias, un renglón
 * por familia.
 *
 * Se GENERA desde `FAMILIAS` (que a su vez se genera desde la curación). Escribir
 * estos renglones a mano sería tener dos vocabularios que se separan en silencio:
 * el del enum del esquema y el de la explicación del prompt.
 *
 * POR QUÉ ES COMPACTA (card 5.2, retoque). La primera versión gastaba un renglón
 * por subfamilia con el id, el nombre en español y el nombre en inglés:
 * `pizza/con-carne = Pizza con carne | Meat pizza`. Medido con `count_tokens`:
 * 6.288 tokens, y con el prompt entero adentro el prefijo de sistema saltó de
 * 2.292 a 16.111 — un escaneo en frío pasó a costar 6,4× más. La forma de abajo
 * mide 2.105 (−67 %) y dice lo mismo, porque los ids YA SON español legible:
 *
 *     pizza: calzone; cobertura; con-carne; con-queso; sin-queso
 *
 * Tres decisiones, cada una con su razón:
 *   · EL NOMBRE EN INGLÉS NO VA. El modelo elige un id, no traduce; para nombrar
 *     en inglés ya tiene `food_en`, que es texto libre.
 *   · EL NOMBRE EN ESPAÑOL VA SOLO DONDE EL ID NO SE EXPLICA SOLO (60 de 191,
 *     con `id=Nombre`). El criterio no es a ojo: se comparan las palabras del id
 *     —más las del id de la familia y su nombre— contra las del `nombre_es`, y si
 *     alguna de las dos partes aporta algo que la otra no tiene, el nombre viaja.
 *     Así `arroz/cocido` va pelado y `verdura/cocida=Verdura cocida sin grasa` no,
 *     porque el "sin grasa" es lo que la distingue de `verdura/cocida-con-grasa`.
 *     Lo mismo con la familia: `otras-aves (Pavo y otras aves)`, porque un pavo
 *     no se encuentra buscando "otras aves".
 *   · EL MARCADOR `[descomponer]` PASÓ A SER UN `*`, explicado una vez en la
 *     cabecera. Son las 11 subfamilias en modo `componer` —ensaladas, bocadillos,
 *     tacos—, donde el número lo carga la suma de los ingredientes y no una ficha
 *     promedio (medido: el plato de salmón respondido por identidad da 1.049 kcal
 *     contra 595 reales, +76 %).
 *
 * El separador entre subfamilias es `; ` y no `, ` porque hay nombres con coma
 * adentro (`especia-y-sal=Especia, sal y vinagre`) y la lista tiene que poder
 * leerse sin ambigüedad.
 */
const PALABRAS_VACIAS = new Set(["y", "o", "de", "del", "la", "el", "los", "las", "con", "sin", "en", "a", "al", "para", "u", "e"]);

/** Las palabras con contenido de un texto, sin tildes ni signos. */
function palabrasDe(texto: string): string[] {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0 && !PALABRAS_VACIAS.has(p));
}

/** Dos palabras dicen lo mismo si comparten los primeros 5 caracteres (cocido/cocida). */
function mismaPalabra(a: string, b: string): boolean {
  return a.startsWith(b.slice(0, Math.min(5, b.length))) || b.startsWith(a.slice(0, Math.min(5, a.length)));
}

function algunaDice(palabra: string, conocidas: Iterable<string>): boolean {
  for (const otra of conocidas) if (mismaPalabra(palabra, otra)) return true;
  return false;
}

/** ¿El id de la familia dice todo lo que dice su nombre? Si no, el nombre viaja. */
export function familiaSeExplicaSola(familia: Familia): boolean {
  const delId = palabrasDe(familia.id);
  return palabrasDe(familia.nombre_es).every((p) => algunaDice(p, delId));
}

/**
 * ¿El id de la subfamilia se entiende solo, leído debajo de su familia?
 *
 * Se pregunta en las dos direcciones a propósito: el nombre no puede aportar una
 * palabra que el id no tenga (o el modelo se pierde el matiz), y el id no puede
 * aportar una que el nombre no tenga (o el id significa otra cosa que el nombre).
 */
export function subfamiliaSeExplicaSola(familia: Familia, sub: Subfamilia): boolean {
  const delNombre = palabrasDe(sub.nombre_es);
  const conocidas = new Set([
    ...palabrasDe(sub.id),
    ...palabrasDe(familia.id),
    ...(familiaSeExplicaSola(familia) ? [] : palabrasDe(familia.nombre_es)),
  ]);
  return (
    delNombre.every((p) => algunaDice(p, conocidas)) &&
    palabrasDe(sub.id).every((p) => algunaDice(p, delNombre))
  );
}

export const LISTA_DE_SUBFAMILIAS: string = FAMILIAS.map((familia) => {
  const cabeza = familiaSeExplicaSola(familia) ? familia.id : `${familia.id} (${familia.nombre_es})`;
  const subs = familia.subfamilias.map((sub) => {
    const marca = sub.modo === "componer" ? "*" : "";
    const nombre = subfamiliaSeExplicaSola(familia, sub) ? "" : `=${sub.nombre_es}`;
    return `${sub.id}${marca}${nombre}`;
  });
  return `${cabeza}: ${subs.join("; ")}`;
}).join("\n");

/** Los tres formatos de imagen que aceptamos. Son los que manda la PWA. */
export type MediaType = "image/jpeg" | "image/png" | "image/webp";
export const MEDIA_TYPES: readonly MediaType[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * El esquema de salida: es `VisionResult` de `engine/types.ts`, exacto.
 *
 * Restricciones de la salida estructurada que explican la forma de abajo:
 * `additionalProperties: false` es obligatorio en todo objeto; los campos
 * opcionales se declaran NO poniéndolos en `required` (los tipos nulables
 * `["string","null"]` no están soportados); `minimum`/`maximum` tampoco, así que
 * los rangos se piden en la descripción y se SANEAN en `interpretarVision` — un
 * rango que el esquema no puede exigir lo tiene que exigir el código.
 *
 * EL ENUM DE 191 IDS VIVE UNA SOLA VEZ, en `$defs`, y lo apuntan con `$ref` el
 * ítem y el componente. Antes estaba escrito DOS VECES y esa copia costaba 2.756
 * tokens de los 7.538 del esquema (medido con `count_tokens`): 2.756 tokens
 * pagados en cada escaneo en frío para repetir una lista que ya estaba. Con
 * `$defs` el esquema mide 4.054, y el prefijo entero 8.361 (16.088 antes: −48 %).
 *
 * Que `$defs`/`$ref` estén soportados NO se dio por bueno leyendo la
 * documentación: un esquema que la API rechaza es un 400 en producción, no un
 * test en rojo. Se verificó con UNA llamada real a `claude-sonnet-5` el 03/09 —
 * respondió `end_turn` con `pollo/pechuga` y `arroz/cocido`, o sea que el enum
 * referenciado sigue restringiendo de verdad—. Los esquemas recursivos SÍ están
 * fuera de alcance; este no lo es (`$defs.subfamilia` no se referencia a sí mismo).
 *
 * Y LAS DESCRIPCIONES SON CORTAS A PROPÓSITO. Antes cada campo repetía en el
 * esquema lo que el prompt ya explica tres párrafos más arriba, en la misma
 * llamada. La división es: el PROMPT enseña —los ejemplos, las reglas de
 * desempate, los dos caminos a la ficha—, el ESQUEMA restringe y recuerda en una
 * línea. La excepción está abajo, en `is_food`: ahí los contraejemplos se
 * repiten a propósito, porque la corrida v6 midió que sin ellos el modelo acepta
 * una foto de comida de plástico.
 */
export const ESQUEMA_VISION = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "items"],
  $defs: {
    /** La lista CERRADA de 191, escrita una sola vez. La apuntan el ítem y el componente. */
    subfamilia: { type: "string", enum: IDS_FAMILIA_SUBFAMILIA },
  },
  properties: {
    is_food: {
      type: "boolean",
      // LOS CONTRAEJEMPLOS SE NOMBRAN, no se dejan solo en el prompt. La corrida
      // v6 los perdió por un rato: al acortar esta descripción se cayó "comida de
      // plástico", y la foto 28 —un expositor de comida falsa que la v5 rechazaba—
      // pasó a `is_food: true` con dos tostadas inventadas. El prompt seguía
      // diciéndolo en su punto 1; no alcanzó. Cuestan 67 tokens y son la única
      // defensa contra un reporte nutricional de una foto que no es comida.
      description:
        "¿La foto muestra comida o bebida? Un envase con la etiqueta legible SÍ lo es. Una persona, " +
        "un paisaje, una pantalla, COMIDA DE PLÁSTICO o de exposición, un plato vacío o una foto " +
        "ilegible son false.",
    },
    items: {
      type: "array",
      description: "Un elemento por alimento distinguible. Vacío si is_food es false.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["food_en", "food_es", "grams", "confidence", "familia_subfamilia", "components"],
        properties: {
          food_en: {
            type: "string",
            description: 'El alimento en inglés genérico de USDA ("chicken breast, grilled"). Sin marcas.',
          },
          food_es: {
            type: "string",
            description: 'EL MISMO alimento en español de España, con su nombre corto y común ("paella").',
          },
          // OBLIGATORIO, y la razón está medida: el 02/09 en producción el modelo
          // escribió "pizza with ham and mushrooms" y ninguna de las CINCO fichas
          // de pizza del catálogo se alcanzó, porque el término "pizza" a secas no
          // existe como nombre. Un campo de texto libre ya lo tenemos —es
          // `food_en`/`food_es`—; el valor de este es que la respuesta caiga en una
          // lista CERRADA que el motor conoce byte a byte. Es el RESPALDO del
          // término, nunca su reemplazo: pisar el término exacto con la cabeza de
          // familia llevaría el atún en lata de 85 a 238 kcal (Bloque 0, punto c).
          familia_subfamilia: {
            $ref: "#/$defs/subfamilia",
            description: 'La subfamilia del catálogo, "familia/subfamilia": la MÁS ESPECÍFICA que aplique.',
          },
          grams: {
            type: "number",
            description: "Gramos de la porción VISIBLE, mayor que 0.",
          },
          confidence: {
            type: "number",
            description: "Entre 0 y 1: la confianza en la IDENTIFICACIÓN, no en los gramos.",
          },
          // La lista es CERRADA y son los OCHO de `Preparacion` en engine/types,
          // que salen de la tabla de cocción. Importa que sea el esquema el que la
          // cierre: el motor degrada un método desconocido a "mezclado" en
          // silencio, así que un noveno valor no rompería nada — daría un número
          // calculado con el rendimiento equivocado. "Sin preparación declarada" se
          // dice OMITIENDO el campo y no mandando null: la salida estructurada no
          // soporta tipos nulables (`["string","null"]`), y por eso `preparation`
          // no está en `required`.
          preparation: {
            type: "string",
            enum: PREPARACIONES,
            description: "El método de cocción, SOLO si se ve. Omitir el campo si no se distingue.",
          },
          // OBLIGATORIO desde la Fase 5, y vacío en un alimento simple. Antes decía
          // "solo cuando el plato no tiene un nombre obvio", y el resultado medido
          // fue que la composición disparó CERO veces en los 204 ítems del golden.
          // Que estén siempre convierte la composición en un respaldo disponible en
          // vez de una excepción que nunca ocurre.
          components: {
            type: "array",
            description:
              "Los ingredientes visibles con sus gramos. VACÍO si el alimento es simple o la receta no se ve.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["food_en", "food_es", "grams"],
              properties: {
                food_en: { type: "string", description: "El ingrediente en inglés genérico de USDA." },
                food_es: { type: "string", description: "El mismo ingrediente en español de España." },
                grams: { type: "number", description: "Gramos de ese ingrediente dentro del plato." },
                familia_subfamilia: {
                  $ref: "#/$defs/subfamilia",
                  description: "La subfamilia del ingrediente. Opcional, pero ponela siempre que la sepas.",
                },
              },
            },
          },
          // La etiqueta de un envase es el dato más preciso de toda la foto: dice el
          // producto y muchas veces el peso. Hasta la Fase 5 se tiraba, y encima el
          // esquema declaraba que un envase cerrado NO era comida — un pan de
          // centeno en su paquete salió `is_food: false`. Solo el NOMBRE impreso:
          // las calorías de la etiqueta no entran (regla dura 2), los números salen
          // del catálogo.
          etiqueta_del_envase: {
            type: "string",
            description:
              "El nombre del producto impreso en el envase, cuando se lee. Nunca sus valores nutricionales.",
          },
        },
      },
    },
  },
} as const;

/**
 * Las instrucciones del paso 1. El modelo identifica; la base de datos cuantifica.
 *
 * Está en castellano rioplatense a propósito: es un texto INTERNO, no lo lee
 * ningún usuario. Lo que ve el usuario sale del catálogo y de `config/app`.
 *
 * Es largo (9,1 KB, casi la mitad de ellos la taxonomía) y es IDÉNTICO en todas
 * las llamadas: por eso viaja como bloque de sistema con `cache_control` —
 * ver `pedirVision`.
 */
export const PROMPT_VISION = [
  "Sos el paso de VISIÓN de una app de nutrición. Mirás la foto de un plato y decís QUÉ hay y CUÁNTO.",
  "",
  "Del otro lado hay una base de 1.115 fichas con trazabilidad a USDA. Vos no calculás ni un número",
  "nutricional: solo nombrás y estimás gramos. A la ficha se llega por DOS caminos y usás LOS DOS:",
  "  · EL PRECISO — `food_en` y `food_es`, el nombre corto y común: cuando acierta da la ficha exacta.",
  "  · EL RESPALDO — `familia_subfamilia`, de una lista CERRADA de 191: cuando el nombre no llega a",
  "    ninguna ficha, la subfamilia garantiza que el plato tenga un número igual.",
  "Los dos son obligatorios y ninguno reemplaza al otro.",
  "",
  "Lo que hacés:",
  "",
  "1. `is_food`. true si hay comida o bebida, INCLUIDO un envase con la etiqueta legible. false si es",
  "   una persona, un paisaje, una pantalla, comida de plástico, un plato vacío o una foto que no se",
  "   entiende; con false, `items` va vacío.",
  "",
  "2. Los nombres. Nombrás cada alimento distinguible DOS VECES, en `food_en` y en `food_es`. Son los",
  "   dos idiomas de la base y con los dos se busca:",
  '   · `food_en`: el término común de USDA FoodData Central ("beef steak, grilled", "white rice, cooked").',
  '   · `food_es`: el mismo alimento como lo llamaría alguien en España ("bife", "arroz blanco cocido",',
  '     "paella", "tortilla de patatas", "lasaña", "papas fritas"). El nombre CORTO Y COMÚN del plato.',
  "   Son del MISMO alimento: no pongas el plato en uno y un ingrediente en el otro. Y siempre el",
  '   nombre corto antes que una descripción: "coleslaw", no "coleslaw, cabbage and carrot salad".',
  "",
  "3. `familia_subfamilia`. Un id de la lista de abajo, con la forma `familia/subfamilia`. Dos reglas:",
  "   · Elegí SIEMPRE la subfamilia MÁS ESPECÍFICA que aplique. Dentro de una misma familia el número",
  "     cambia muchísimo: una verdura cruda son 30 kcal/100 g y la misma verdura cocida con grasa, 86.",
  "   · Ante la duda entre dos, elegí la MÁS GENÉRICA DE LA MISMA FAMILIA. Equivocar la familia es el",
  "     error caro; equivocar la subfamilia dentro de la familia correcta, no tanto.",
  '   Ejemplo del caso que nos rompió en producción: una pizza de jamón y champiñones es "pizza/con-carne".',
  "",
  "4. `grams`. Los gramos de la porción VISIBLE, a partir del tamaño aparente y de referencias de la",
  "   foto (el plato, los cubiertos, un vaso). Si el envase trae el peso impreso, ese es el número.",
  "",
  "5. `confidence`. Entre 0 y 1: cuánto confiás en la IDENTIFICACIÓN, no en los gramos.",
  "",
  "6. `preparation`. Solo si el método de cocción se VE; si no se distingue omitís el campo, y lo que",
  "   vos no ves lo pone la subfamilia con su método por defecto. Los ocho valores:",
  ...PREPARACIONES.map((metodo) => `   · ${metodo}: ${GLOSA_DE_PREPARACION[metodo]}`),
  "",
  "7. `components`. SIEMPRE que el plato tenga más de un ingrediente que se distinga, los declarás uno",
  "   por uno con sus gramos, y los gramos de los ingredientes suman aproximadamente los del plato.",
  "   A cada ingrediente le ponés también su `familia_subfamilia` cuando la sepas.",
  "   Va VACÍO (`[]`, no lo omitas) en dos casos:",
  "   · un alimento simple: una manzana, una loncha de queso, un vaso de leche;",
  "   · un plato con la receta escondida, donde los ingredientes NO se ven por separado: una croqueta,",
  "     una lasaña, una paella, un guiso. Ahí lo que importa es nombrar bien el plato entero, y no",
  "     inventar una receta que la foto no muestra.",
  "   En las subfamilias marcadas con `*` —ensaladas, bocadillos, tacos, platos combinados— la",
  "   descomposición es lo que da el número bueno: ahí no la saltees.",
  "",
  "8. Envases. Si la foto es un producto envasado y la etiqueta se lee, ESO ES COMIDA: `is_food` true,",
  "   `etiqueta_del_envase` con el nombre impreso tal cual, `food_en`/`food_es` con el producto, su",
  "   `familia_subfamilia`, y los gramos que declare el envase. La etiqueta es la fuente más precisa",
  "   que hay en la foto; no la desperdicies.",
  "",
  "Lo que NO hacés, nunca:",
  "- No estimás calorías ni ningún valor nutricional, tuyo ni copiado de una etiqueta: esos números",
  "  salen de la base, y tu esquema de salida ni siquiera tiene esos campos.",
  "- No inventás alimentos que no ves. Si la foto no es comida, `is_food` es false y `items` va vacío.",
  "- No agrupás el plato entero en un solo item genérico si podés nombrar sus partes.",
  "",
  "LAS 191 SUBFAMILIAS. Un renglón por familia: `familia: sub; sub; sub`. El id que va en",
  "`familia_subfamilia` es `familia/sub` (ejemplo: `pizza/con-carne`). Un `*` marca las que hay que",
  "DESCOMPONER en `components`. Donde el id solo no alcanza va su nombre después de un `=`.",
  "",
  LISTA_DE_SUBFAMILIAS,
].join("\n");

// ---------------------------------------------------------------------------
// El cliente, inyectado
// ---------------------------------------------------------------------------

/**
 * Lo único que este archivo necesita de Anthropic.
 *
 * Es una interfaz mínima a propósito: un test que quiera simular un 529 o un
 * `stop_reason` raro escribe cuatro líneas, no un doble del SDK entero.
 */
export interface ClienteDeVision {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/** Timeout de UNA llamada. La función tiene 60 s: tres intentos entran holgados. */
export const TIMEOUT_LLAMADA_MS = 45_000;

/**
 * Las cabeceras extra de la llamada. Hoy es una sola y condicional.
 *
 * `anthropic-workspace-id` va SOLO si hay un workspace declarado: una key común
 * no la necesita, y mandarla vacía es peor que no mandarla. Una key
 * *identity-linked*, en cambio, hace que la API rechace toda llamada sin ella
 * (ver `ANTHROPIC_WORKSPACE_ID` en `runtime.ts`).
 *
 * Es una función y no un objeto para poder testear la decisión sin construir un
 * cliente: qué cabeceras se mandan es lo que importa, no cómo se guardan.
 */
export function cabecerasDeVision(workspaceId: string): Record<string, string> {
  const limpio = workspaceId.trim();
  return limpio.length > 0 ? { "anthropic-workspace-id": limpio } : {};
}

/**
 * El cliente real. `maxRetries: 0` a propósito: los reintentos los hace
 * `pedirVision` con su propia política, y dos capas de backoff superpuestas
 * darían un peor caso de minutos dentro de una función de 60 segundos.
 */
export function crearClienteDeVision(apiKey: string, workspaceId = ""): ClienteDeVision {
  return new Anthropic({
    apiKey,
    maxRetries: 0,
    timeout: TIMEOUT_LLAMADA_MS,
    defaultHeaders: cabecerasDeVision(workspaceId),
  });
}

// ---------------------------------------------------------------------------
// Reintentos
// ---------------------------------------------------------------------------

/** Reintentos ANTE FALLAS TRANSITORIAS. 2 reintentos = 3 intentos como mucho. */
export const MAX_REINTENTOS = 2;
/** Espera del primer reintento; el segundo espera el doble. */
export const BACKOFF_BASE_MS = 500;

/** ¿Vale la pena volver a intentar? Solo 429, 529 y 5xx, más las fallas de red. */
export function esTransitorio(err: unknown): boolean {
  if (err instanceof Anthropic.APIConnectionError) return true;
  const status = (err as { status?: unknown }).status;
  if (typeof status !== "number") return false;
  return status === 429 || status === 529 || status >= 500;
}

export interface OpcionesDeVision {
  /** Inyectable para que los tests no esperen de verdad. */
  esperar?: (ms: number) => Promise<void>;
  /** Inyectable para que la latencia medida sea determinística en los tests. */
  ahora?: () => number;
  maxReintentos?: number;
}

const esperarDeVerdad = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// La llamada
// ---------------------------------------------------------------------------

export interface EntradaDeVision {
  image_base64: string;
  media_type: MediaType;
}

export interface MetaDeVision {
  model: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  /**
   * Tokens ESCRITOS al caché de prompt en esta llamada (el prompt de sistema, la
   * primera vez). Se cobran a 2× porque el TTL es de 1 hora (con el de 5 minutos
   * serían 1,25×). Si aparece en toda llamada en vez de solo en la primera, el
   * prefijo está variando y el caché no sirve para nada.
   */
  tokens_cache_write: number;
  /** Tokens LEÍDOS del caché (a 0,1×). Es la medida de que el caché funciona. */
  tokens_cache_read: number;
  /** Cuántas veces se llamó al modelo. 1 en el camino feliz. */
  intentos: number;
  stop_reason: string | null;
}

export interface ResultadoDeVision {
  vision: VisionResult;
  meta: MetaDeVision;
}

/**
 * Le pide al modelo que mire la imagen y devuelve un `VisionResult` saneado.
 *
 * Lanza `ErrorDeAnalisis` y nada más: `modelo_no_disponible` si el servicio no
 * responde ni después de los reintentos, `respuesta_ilegible` si respondió pero
 * lo que dijo no se puede usar.
 */
export async function pedirVision(
  cliente: ClienteDeVision,
  entrada: EntradaDeVision,
  opciones: OpcionesDeVision = {},
): Promise<ResultadoDeVision> {
  const esperar = opciones.esperar ?? esperarDeVerdad;
  const ahora = opciones.ahora ?? Date.now;
  const maxReintentos = opciones.maxReintentos ?? MAX_REINTENTOS;

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model: MODELO_VISION,
    max_tokens: MAX_TOKENS_VISION,
    // EL SISTEMA VA CACHEADO. Desde la Fase 5 el prompt lleva las 191 subfamilias
    // adentro (4.307 tokens) y es BYTE POR BYTE EL MISMO en todos los escaneos:
    // es el caso de libro del caché de prefijo. Va como bloque con
    // `cache_control` en vez de como string suelto porque el string no admite el
    // marcador. Lo único que cambia entre llamadas es la imagen, y la imagen va
    // DESPUÉS del sistema en el orden de render (tools → system → messages), así
    // que no invalida nada.
    //
    // TTL DE 1 HORA, y la cuenta está hecha. La entrada del caché vale desde que
    // ARRANCA la llamada que la escribe o la lee, y una lectura refresca el reloj
    // gratis. Con el TTL de 5 minutos (el default) eso significa que el caché solo
    // sobrevive si entra un escaneo cada 5 minutos EN TODA LA APP; una app que
    // recién arranca no tiene ese tráfico, así que casi todo escaneo caía en frío
    // y pagaba el prefijo entero. Con el de 1 hora alcanza UN escaneo por hora
    // para que el siguiente salga caliente — y el caché es por PREFIJO, no por
    // usuario: el sistema es idéntico para todos, así que la foto de cualquiera
    // deja caliente la de todos los demás.
    //
    // Lo que cuesta: el write pasa de 1,25× a 2× el precio de entrada. Sobre
    // 8.361 tokens de prefijo y Sonnet 5 a 2 US$/M de entrada, el write sube de
    // 0,0209 a 0,0334 US$ y la lectura sigue costando 0,0017 (0,1×). El punto de
    // equilibrio del TTL de 1 hora son 3 llamadas sobre el mismo prefijo (2× +
    // 0,2× = 2,2× contra 3× sin caché): a 15 escaneos/mes por usuario y con el
    // caché compartido entre todos, se cruza el primer día.
    //
    // El mínimo cacheable de Sonnet 5 son 1.024 tokens y este prefijo los pasa
    // ocho veces. Se verifica con `tokens_cache_read` de la meta: si viene en cero
    // llamada tras llamada, algo está variando el prefijo.
    system: [{ type: "text", text: PROMPT_VISION, cache_control: { type: "ephemeral", ttl: "1h" } }],
    // Sin `temperature`, sin `top_p`, sin `budget_tokens`: Sonnet 5 los rechaza con 400.
    output_config: { format: { type: "json_schema", schema: ESQUEMA_VISION as unknown as Record<string, unknown> } },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: entrada.media_type, data: entrada.image_base64 },
          },
          { type: "text", text: "¿Qué hay en este plato y cuánto?" },
        ],
      },
    ],
  };

  const comenzo = ahora();
  let ultimoError: unknown = null;

  for (let intento = 1; intento <= maxReintentos + 1; intento += 1) {
    let respuesta: Anthropic.Message;
    try {
      respuesta = await cliente.messages.create(params);
    } catch (err) {
      ultimoError = err;
      if (!esTransitorio(err) || intento === maxReintentos + 1) {
        throw new ErrorDeAnalisis(
          "modelo_no_disponible",
          `la llamada al modelo falló en el intento ${intento}: ${describir(err)}`,
        );
      }
      await esperar(BACKOFF_BASE_MS * 2 ** (intento - 1));
      continue;
    }

    // EL `stop_reason` SE MIRA ANTES QUE EL CONTENIDO. Un `max_tokens` deja un
    // JSON cortado a la mitad que parsea distinto según dónde cayó el corte;
    // leerlo primero y preguntar después es cómo se descubre en producción.
    const stop = respuesta.stop_reason ?? null;
    if (stop !== "end_turn") {
      throw new ErrorDeAnalisis(
        "respuesta_ilegible",
        `el modelo terminó con stop_reason="${stop ?? "null"}" y la respuesta no se puede usar`,
      );
    }

    const texto = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const vision = interpretarVision(texto);
    return {
      vision,
      meta: {
        model: respuesta.model ?? MODELO_VISION,
        latency_ms: ahora() - comenzo,
        tokens_in: respuesta.usage.input_tokens,
        tokens_out: respuesta.usage.output_tokens,
        tokens_cache_write: respuesta.usage.cache_creation_input_tokens ?? 0,
        tokens_cache_read: respuesta.usage.cache_read_input_tokens ?? 0,
        intentos: intento,
        stop_reason: stop,
      },
    };
  }

  // Inalcanzable: el bucle sale por `return` o por `throw`. Está por el tipo.
  throw new ErrorDeAnalisis("modelo_no_disponible", `sin intentos disponibles: ${describir(ultimoError)}`);
}

function describir(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

// ---------------------------------------------------------------------------
// Saneo
// ---------------------------------------------------------------------------

/**
 * Convierte el texto del modelo en un `VisionResult` con los tipos garantizados.
 *
 * La salida estructurada garantiza la FORMA (el JSON valida contra el esquema),
 * pero el esquema no puede exigir rangos (`minimum`/`maximum` no están
 * soportados). Entonces el rango se exige acá: `confidence` se recorta a 0..1 y
 * `grams` negativos o no finitos se vuelven 0 —el motor ya sabe qué hacer con
 * un item de 0 gramos—. Un item sin `food_en` utilizable se descarta: nombrar
 * nada no es un alimento.
 *
 * Y lo que el esquema SÍ exige tampoco se da por hecho (Fase 5): la
 * `familia_subfamilia` se verifica contra la lista real y, si no está, se cae el
 * CAMPO y nunca el item —el alimento sigue teniendo sus dos nombres, que son el
 * camino preciso—; la `etiqueta_del_envase` se recorta y en blanco no viaja; y
 * `components` sale SIEMPRE como array, vacío incluido. Una salida vieja, un JSON
 * reparado a mano o un enum que se movió en un re-seed llegan igual por acá.
 */
export function interpretarVision(texto: string): VisionResult {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch (err) {
    throw new ErrorDeAnalisis("respuesta_ilegible", `el modelo no devolvió JSON: ${describir(err)}`);
  }

  if (crudo === null || typeof crudo !== "object" || Array.isArray(crudo)) {
    throw new ErrorDeAnalisis("respuesta_ilegible", "el modelo devolvió un JSON que no es un objeto");
  }

  const objeto = crudo as Record<string, unknown>;
  if (typeof objeto["is_food"] !== "boolean") {
    throw new ErrorDeAnalisis("respuesta_ilegible", "la respuesta del modelo no trae `is_food` booleano");
  }
  const is_food = objeto["is_food"];
  if (!is_food) return { is_food: false, items: [] };

  const crudos = Array.isArray(objeto["items"]) ? (objeto["items"] as unknown[]) : [];
  const items: VisionItem[] = [];
  for (const entrada of crudos) {
    if (items.length >= MAX_ITEMS) break;
    const item = interpretarItem(entrada);
    if (item !== null) items.push(item);
  }
  return { is_food: true, items };
}

function interpretarItem(entrada: unknown): VisionItem | null {
  if (entrada === null || typeof entrada !== "object" || Array.isArray(entrada)) return null;
  const objeto = entrada as Record<string, unknown>;

  const food_en = typeof objeto["food_en"] === "string" ? objeto["food_en"].trim() : "";
  const food_es = typeof objeto["food_es"] === "string" ? objeto["food_es"].trim() : "";
  // ALCANZA CON QUE HAYA UNO DE LOS DOS NOMBRES. El esquema pide los dos, pero
  // el item se descarta solo si no quedó NINGUNA forma de nombrar el alimento:
  // un plato que solo tiene nombre en español se busca igual, y el motor sabe
  // buscar con lo que haya (`buscarConDosNombres`).
  if (food_en.length === 0 && food_es.length === 0) return null;

  const item: VisionItem = {
    food_en,
    grams: numeroNoNegativo(objeto["grams"]),
    confidence: recortar01(objeto["confidence"]),
  };
  if (food_es.length > 0) item.food_es = food_es;

  // LA SUBFAMILIA SE DESCARTA SOLA, NUNCA EL ITEM. El esquema la cierra con un
  // enum, pero el saneo no puede confiar en eso: una salida vieja, un JSON
  // reparado a mano o un enum que se movió después de un re-seed llegan igual
  // acá. Si el valor no está en la lista, lo que se pierde es el RESPALDO —el
  // alimento sigue teniendo sus dos nombres, que son el camino preciso—.
  const familia = objeto["familia_subfamilia"];
  if (typeof familia === "string" && SUBFAMILIAS_VALIDAS.has(familia.trim())) {
    item.familia_subfamilia = familia.trim();
  }

  const etiqueta = typeof objeto["etiqueta_del_envase"] === "string" ? objeto["etiqueta_del_envase"].trim() : "";
  if (etiqueta.length > 0) item.etiqueta_del_envase = etiqueta;

  const preparation = objeto["preparation"];
  if (typeof preparation === "string" && (PREPARACIONES as readonly string[]).includes(preparation)) {
    item.preparation = preparation as Preparacion;
  }

  // `components` SIEMPRE ES UN ARRAY desde la Fase 5, vacío incluido. El motor
  // distingue "no hay ingredientes que sumar" de "no vinieron" mirando el largo,
  // no la existencia del campo, y así el expediente muestra un array vacío en vez
  // de un hueco: se ve que el modelo miró y no había nada que descomponer.
  const components = objeto["components"];
  item.components = (Array.isArray(components) ? components : [])
    .filter((c): c is Record<string, unknown> => c !== null && typeof c === "object" && !Array.isArray(c))
    .map((c) => {
      const componente: VisionComponent = {
        food_en: typeof c["food_en"] === "string" ? c["food_en"].trim() : "",
        grams: numeroNoNegativo(c["grams"]),
      };
      const es = typeof c["food_es"] === "string" ? c["food_es"].trim() : "";
      if (es.length > 0) componente.food_es = es;
      const suFamilia = c["familia_subfamilia"];
      if (typeof suFamilia === "string" && SUBFAMILIAS_VALIDAS.has(suFamilia.trim())) {
        componente.familia_subfamilia = suFamilia.trim();
      }
      return componente;
    })
    .filter((c) => c.food_en.length > 0 || (c.food_es ?? "").length > 0);

  return item;
}

/** Los 191 ids, en un Set: el saneo pregunta una vez por item y por componente. */
const SUBFAMILIAS_VALIDAS: ReadonlySet<string> = new Set(IDS_FAMILIA_SUBFAMILIA);

function numeroNoNegativo(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) return 0;
  return valor;
}

function recortar01(valor: unknown): number {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor));
}
