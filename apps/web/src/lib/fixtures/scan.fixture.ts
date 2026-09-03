/**
 * TRES RESPUESTAS REALES DEL CONTRATO DE `analyze`, para poder mirar el reporte
 * sin backend.
 *
 * NINGÚN NÚMERO DE ESTE ARCHIVO ESTÁ ESCRITO A MANO, Y AHORA ADEMÁS ESO SE PUEDE
 * VOLVER A HACER. Los tres bloques de abajo son lo que devolvió el MOTOR REAL
 * (`functions/lib/engine`) al recibir tres entradas de visión, contra el catálogo
 * real `kb/build/foods.canonical.json`. Cada kcal es el `per_100g` de una ficha
 * por los gramos del plato, con su `source_ref` al lado — la misma aritmética que
 * corre en producción.
 *
 *   Motor:     Fase 5 (`fase/05-motor-responde`) — cuatro sellos de match nuevos
 *              (card 5.3) y el reparto de macros que suma 100 (card 5.1).
 *   Catálogo:  3.8.0+843ecb80, 1.115 fichas.
 *   Entradas:  las tres de `regenerar.cjs`, en este mismo directorio.
 *
 * CÓMO SE REGENERA (dos comandos, desde la raíz del repo):
 *
 *     npm --prefix functions run build
 *     cd functions && NODE_PATH=node_modules node ../apps/web/src/lib/fixtures/regenerar.cjs
 *
 * El script pisa los tres bloques marcados `// >>> GENERADO: …` y no toca nada
 * más de este archivo. La vez anterior no había script: la fixture se armó a mano
 * una tarde y después el motor cambió dos veces sin que nadie pudiera rehacerla
 * sin repetir la tarde — por eso quedó mostrando un reparto de macros viejo y
 * ninguno de los sellos nuevos. Si el motor o el catálogo vuelven a cambiar, esto
 * son dos comandos.
 *
 * ---------------------------------------------------------------------------
 * QUÉ MUESTRA CADA UNO
 *
 * (1) `RESPUESTA_DE_FIXTURE` — LA MESA COMPARTIDA (`VITE_ANALYZE_FIXTURE=1`).
 *
 *     Un mediodía de tapeo para tres o cuatro, 965 g y 1.548,9 kcal. No es un
 *     plato: es un BANCO DE PRUEBA con forma de mesa, y está dicho — nueve
 *     alimentos en una foto es mucho para un almuerzo, pero es lo que hace falta
 *     para que los NUEVE sellos de `TipoDeMatch` salgan de un solo escaneo y el
 *     Q/A visual los pueda mirar todos en la misma pantalla:
 *
 *       exacto             Tortilla de patatas      180 g   244,8 kcal
 *       cabeza_subfamilia  Pizza con carne          150 g   420,0 kcal   ← nuevo
 *       compuesto          ensalada mixta           300 g   240,0 kcal
 *       compuesto_parcial  montadito de pringá      105 g   248,9 kcal   ← nuevo
 *       sustituto          Queso crema               40 g   140,0 kcal   ← nuevo
 *       cabeza_familia     Almejas                   90 g   128,7 kcal   ← nuevo
 *       alias              Jamón crudo               50 g    97,5 kcal
 *       difuso             Aceitunas                 25 g    29,0 kcal
 *       no_catalogado      —                         25 g   sin números
 *
 *     Los cuatro caminos nuevos, en cristiano:
 *
 *       · La PIZZA es la de producción del 02/09/2026, la que se fue sin números.
 *         Ahora la visión declara su familia (`pizza/con-carne`) y esa subfamilia
 *         tiene una ficha que la representa: responde ella, y el motivo aclara
 *         que es la del GRUPO y no la de este plato.
 *       · El MONTADITO se compuso con 2 de sus 3 ingredientes: los 5 g de epazote
 *         no están en el catálogo. Como es minoritario (5 g de 105), el motor
 *         responde con la densidad de lo que sí resolvió y lo escribe todo —
 *         `composicion.faltantes`, `gramos_faltantes` y un caveat propio.
 *       · El MASCARPONE no lo mide USDA. La curación declaró por escrito cuál es
 *         la ficha más cercana (queso crema) y el motivo viaja en el `motivo`.
 *       · Las ZAMBURIÑAS no llegan a ninguna ficha y "plato de marisco" tampoco
 *         tiene una que la represente: contesta la familia entera (Almejas). Es
 *         el último recurso antes de no dar número, y así está redactado.
 *
 *     El total sale `completo: false` con `items_sin_datos: 1` (los picos) y tres
 *     `opcionales_ausentes` — la tortilla es la única ficha del catálogo que no
 *     declara saturadas, azúcares ni sodio, así que esos tres totales salen
 *     `null` y con su explicación. `macro_pct` reparte 23,5 / 29,5 / 47,0, que
 *     suma 100,0 exacto, con la diferencia contra las kcal de las fichas en
 *     +1,2 kcal (0,1 %): ruido de redondeo, sin letra chica.
 *
 *     Y LLEVA ADENTRO, A PROPÓSITO, EL CASO QUE DEMUESTRA LA REGLA DEL SODIO:
 *     la ensalada aporta 203,3 mg al plato y el platito de aceitunas solo 183,8,
 *     pero la salada es la aceituna (735 mg/100 g contra 68) y es la única de las
 *     dos que se pinta como tal. Por eso las aceitunas son 25 g y no 40: el aviso
 *     se mide sobre `per_100g` y nunca sobre lo escalado, y sin este par la
 *     pantalla no tenía dónde enseñarlo. Ver `ItemDelPlato.tsx`.
 *
 * (2) `respuestaDeFixtureCompleta()` — EL PLATO DE FRUTA
 *     (`VITE_ANALYZE_FIXTURE=completo`).
 *
 *     Plátano 230 g (exacto, 204,7 kcal) y cerezas 90 g (difuso, 56,7 kcal). Las
 *     dos fichas declaran LOS OCHO valores, así que el total sale `completo:
 *     true` y el anillo exterior del donut puede dibujar sus tres subdivisiones
 *     de verdad: saturadas dentro de las grasas, azúcares y fibra dentro de los
 *     hidratos.
 *
 *     Y ES EL CASO DE LA LETRA CHICA que la card 5.1 hizo posible: la fruta
 *     declara menos calorías de las que dan 4/4/9 sobre sus macros —USDA usa
 *     factores propios más bajos y la fibra cuenta aparte—, así que
 *     `kcal_fuera_de_macros` es −28,7 kcal, `diferencia_pct` −11 %, y como pasa
 *     el umbral del 5 % el motor escribe `motivo_de_la_diferencia` para que la
 *     pantalla lo muestre. Antes de la 5.1 esto se publicaba como "carbs 102,7 %".
 *     El reparto es 4,8 / 92,3 / 2,9 y suma 100,0.
 *
 * (3) `respuestaDeFixtureSinTotal()` — SIN TOTAL, HONESTAMENTE
 *     (`VITE_ANALYZE_FIXTURE=sin_total`).
 *
 *     Un solo alimento y sin ficha. Cuando NINGÚN ítem se pudo cuantificar el
 *     motor devuelve `totals: null` —"un plato sin un solo número no tiene
 *     totales, tiene una cola de curación"—: no hay donut que dibujar, hay el
 *     alimento con su explicación.
 *
 * ---------------------------------------------------------------------------
 * DOS ACLARACIONES SOBRE LO QUE NO ES DEL MOTOR
 *
 *   · `curation_candidates` NO ESTÁ ACÁ, y no es un olvido: el motor lo devuelve,
 *     pero el backend no se lo manda al front (ver `handler.ts` — el payload
 *     lleva `items`, `totals`, `meta` y `persisted`, y nada más). `regenerar.cjs`
 *     los imprime por consola para poder mirarlos: la mesa produce cuatro.
 *   · Los números de `meta` que no son `kb_version` —latencias y tokens— son de
 *     relleno y está dicho: en esta cadena no hay modelo que medir. `kb_version`
 *     sí lo devuelve el motor, con el catálogo que de verdad usó.
 *
 * Se enciende con `VITE_ANALYZE_FIXTURE=1` en `apps/web/.env.local`. Los modos y
 * lo que muestra cada uno están en `apps/web/.env.local.example`.
 * ------------------------------------------------------------------------- */
import type { RespuestaDeAnalisis } from "../types";

export const RESPUESTA_DE_FIXTURE: RespuestaDeAnalisis =
// >>> GENERADO: reporte
{
  "scan_id": "scan_fixture_mesa_0001",
  "is_food": true,
  "items": [
    {
      "termino_en": "Spanish potato omelette (tortilla de patatas)",
      "termino_es": "tortilla de patatas",
      "food_id": "manual-tortilla-de-patatas",
      "name_es": "Tortilla de patatas",
      "name_en": "Spanish potato omelette (tortilla de patatas)",
      "source_ref": "Agregadores nutricionales (FatSecret, Fitia y similares), recogidos el 30/08/2026 — punto medio del rango publicado",
      "grams": 180,
      "confidence": 0.92,
      "confidence_vision": 0.92,
      "confidence_match": 1,
      "match": "exacto",
      "identidad_respaldada": true,
      "caveats": [
        "Rangos publicados, no una medición: 126–147 kcal · proteínas 5–7 g · hidratos 9–12 g · grasas 7–9 g · fibra 0,8–1,6 g. El valor es el punto medio.",
        "El número depende mucho de la receta: cuánto aceite absorbe la patata y si lleva cebolla.",
        "Sin dato de grasas saturadas, azúcares ni sodio: quedan en null, que no es cero.",
        "Atwater cierra al 1,5 % (138 kcal predichas contra 136 declaradas).",
        "Se fichó a mano porque USDA no la tiene: su `Egg omelet with potatoes` es 81,8 % huevo y 8,2 % papa, y da 2,97 g de hidratos contra los ~10 de una tortilla."
      ],
      "per_100g": {
        "kcal": 136,
        "protein_g": 6,
        "carbs_g": 10.5,
        "fat_g": 8,
        "fiber_g": 1.2,
        "sat_fat_g": null,
        "sugars_g": null,
        "sodium_mg": null
      },
      "nutrients": {
        "kcal": 244.8,
        "protein_g": 10.8,
        "carbs_g": 18.9,
        "fat_g": 14.4,
        "fiber_g": 2.16,
        "sat_fat_g": null,
        "sugars_g": null,
        "sodium_mg": null
      },
      "motivo": "Coincidencia exacta con el nombre en inglés del catálogo (\"Spanish potato omelette (tortilla de patatas)\")."
    },
    {
      "termino_en": "pizza with ham and mushrooms",
      "termino_es": "pizza de jamón y champiñones",
      "food_id": "fdc-2708649",
      "name_es": "Pizza con carne",
      "name_en": "Pizza with meat other than pepperoni, from restaurant or fast food, NS as to type of crust",
      "source_ref": "USDA FDC #2708649",
      "grams": 150,
      "confidence": 0.361,
      "confidence_vision": 0.85,
      "confidence_match": 0.425,
      "match": "cabeza_subfamilia",
      "generic": true,
      "identidad_respaldada": true,
      "caveats": [
        "Ficha genérica: los valores son el promedio de una familia de productos, no la medición de uno solo. Los 570 mg de sodio por 100 g son ese promedio, y el de la variante del plato puede ser muy distinto."
      ],
      "per_100g": {
        "kcal": 280,
        "protein_g": 11.5,
        "carbs_g": 30.62,
        "fat_g": 12.35,
        "fiber_g": 2.3,
        "sat_fat_g": 5.033,
        "sugars_g": 3.32,
        "sodium_mg": 570
      },
      "nutrients": {
        "kcal": 420,
        "protein_g": 17.25,
        "carbs_g": 45.93,
        "fat_g": 18.525,
        "fiber_g": 3.45,
        "sat_fat_g": 7.55,
        "sugars_g": 4.98,
        "sodium_mg": 855
      },
      "motivo": "El catálogo no tiene este alimento por su nombre, pero se declaró como \"Pizza con carne\" (Pizza) y esa subfamilia responde con \"Pizza con carne\". Es la ficha que representa al grupo, no la de este plato: dentro de un mismo grupo los valores varían. La ficha es genérica (promedio de una familia): la confianza baja un 15 %."
    },
    {
      "termino_en": "mixed salad",
      "termino_es": "ensalada mixta",
      "food_id": null,
      "name_es": "ensalada mixta",
      "name_en": null,
      "source_ref": null,
      "grams": 300,
      "confidence": 0.538,
      "confidence_vision": 0.9,
      "confidence_match": 0.598,
      "match": "compuesto",
      "caveats": [
        "Plato compuesto en el momento con 5 ingredientes del catálogo y el método \"mezclado\": los valores por 100 g salen de fichas reales, pero la proporción de cada ingrediente la estimó la foto.",
        "El ingrediente peor identificado es \"tomato, raw\" → Tomate crudo, al 33 %.",
        "Alguno de los ingredientes es una ficha genérica: su valor es el promedio de una familia."
      ],
      "per_100g": {
        "kcal": 80,
        "protein_g": 4.826,
        "carbs_g": 2.8,
        "fat_g": 5.543,
        "fiber_g": 0.862,
        "sat_fat_g": 1.1,
        "sugars_g": 1.264,
        "sodium_mg": 67.781
      },
      "nutrients": {
        "kcal": 240,
        "protein_g": 14.478,
        "carbs_g": 8.4,
        "fat_g": 16.629,
        "fiber_g": 2.586,
        "sat_fat_g": 3.3,
        "sugars_g": 3.792,
        "sodium_mg": 203.343
      },
      "motivo": "El catálogo no tiene este plato: se compuso con 5 fichas y el método \"mezclado\". La cuenta entera está en \"composicion\".",
      "composicion": {
        "metodo": "mezclado",
        "componentes": [
          {
            "termino_en": "lettuce, raw",
            "grams": 120,
            "food_id": "fdc-2709789",
            "name_es": "Lechuga cruda",
            "source_ref": "USDA FDC #2709789",
            "match": "exacto",
            "confidence_match": 1,
            "generic": false
          },
          {
            "termino_en": "tomato, raw",
            "grams": 100,
            "food_id": "fdc-2709719",
            "name_es": "Tomate crudo",
            "source_ref": "USDA FDC #2709719",
            "match": "difuso",
            "confidence_match": 0.327,
            "generic": false
          },
          {
            "termino_en": "egg, hard-boiled",
            "grams": 50,
            "food_id": "fdc-2707153",
            "name_es": "Huevo cocido",
            "source_ref": "USDA FDC #2707153",
            "match": "alias",
            "confidence_match": 0.85,
            "generic": true
          },
          {
            "termino_en": "tuna, canned",
            "grams": 40,
            "food_id": "fdc-2706309",
            "name_es": "Atún",
            "source_ref": "USDA FDC #2706309",
            "match": "alias",
            "confidence_match": 0.85,
            "generic": true
          },
          {
            "termino_en": "olive oil",
            "grams": 10,
            "food_id": "fdc-2710186",
            "name_es": "Aceite de oliva",
            "source_ref": "USDA FDC #2710186",
            "match": "exacto",
            "confidence_match": 1,
            "generic": false
          }
        ],
        "eslabon_mas_debil": {
          "termino_en": "tomato, raw",
          "name_es": "Tomate crudo",
          "confidence_match": 0.327
        },
        "peso_entrada_g": 320,
        "aceite_absorbido_g": 0,
        "aceite_ref": null,
        "peso_final_g": 320,
        "rendimiento_de": "transformacion",
        "gramos_del_plato": 300
      }
    },
    {
      "termino_en": "montadito de pringa",
      "termino_es": "montadito de pringá",
      "food_id": null,
      "name_es": "montadito de pringá",
      "name_en": null,
      "source_ref": null,
      "grams": 105,
      "confidence": 0.092,
      "confidence_vision": 0.78,
      "confidence_match": 0.118,
      "match": "compuesto_parcial",
      "caveats": [
        "Faltó 5 g de un ingrediente que el catálogo no tiene (\"epazote leaves\"), sobre 105 g vistos. El plato se calculó con la densidad de los ingredientes que sí están: es una estimación de lo que falta, no una medición.",
        "Plato compuesto en el momento con 2 ingredientes del catálogo y el método \"mezclado\": los valores por 100 g salen de fichas reales, pero la proporción de cada ingrediente la estimó la foto.",
        "El ingrediente peor identificado es \"pork stew meat, cooked\" → Cerdo, al 14 %.",
        "Ficha genérica: los valores son el promedio de una familia de productos, no la medición de uno solo. Los 450 mg de sodio por 100 g son ese promedio, y el de la variante del plato puede ser muy distinto.",
        "Alguno de los ingredientes es una ficha genérica: su valor es el promedio de una familia."
      ],
      "per_100g": {
        "kcal": 237,
        "protein_g": 16.514,
        "carbs_g": 29.52,
        "fat_g": 5.622,
        "fiber_g": 1.38,
        "sat_fat_g": 1.703,
        "sugars_g": 3.204,
        "sodium_mg": 409.2
      },
      "nutrients": {
        "kcal": 248.85,
        "protein_g": 17.34,
        "carbs_g": 30.996,
        "fat_g": 5.903,
        "fiber_g": 1.449,
        "sat_fat_g": 1.788,
        "sugars_g": 3.364,
        "sodium_mg": 429.66
      },
      "motivo": "El catálogo no tiene este plato: se compuso con 2 fichas y el método \"mezclado\", sin 1 ingrediente(s) que el catálogo no tiene (5 g de 105 g). La cuenta entera está en \"composicion\".",
      "composicion": {
        "metodo": "mezclado",
        "componentes": [
          {
            "termino_en": "bread, white",
            "grams": 60,
            "food_id": "fdc-2707591",
            "name_es": "Pan",
            "source_ref": "USDA FDC #2707591",
            "match": "difuso",
            "confidence_match": 0.232,
            "generic": true
          },
          {
            "termino_en": "pork stew meat, cooked",
            "grams": 40,
            "food_id": "fdc-2705862",
            "name_es": "Cerdo",
            "source_ref": "USDA FDC #2705862",
            "match": "difuso",
            "confidence_match": 0.145,
            "generic": true
          }
        ],
        "eslabon_mas_debil": {
          "termino_en": "pork stew meat, cooked",
          "name_es": "Cerdo",
          "confidence_match": 0.145
        },
        "peso_entrada_g": 100,
        "aceite_absorbido_g": 0,
        "aceite_ref": null,
        "peso_final_g": 100,
        "rendimiento_de": "transformacion",
        "parcial": true,
        "faltantes": [
          {
            "termino_en": "epazote leaves",
            "grams": 5
          }
        ],
        "gramos_faltantes": 5,
        "gramos_del_plato": 105
      }
    },
    {
      "termino_en": "mascarpone",
      "termino_es": "mascarpone",
      "food_id": "fdc-173418",
      "name_es": "Queso crema",
      "name_en": "Cheese, cream",
      "source_ref": "USDA FDC #173418",
      "grams": 40,
      "confidence": 0.44,
      "confidence_vision": 0.8,
      "confidence_match": 0.55,
      "match": "sustituto",
      "identidad_respaldada": true,
      "per_100g": {
        "kcal": 350,
        "protein_g": 6.15,
        "carbs_g": 5.52,
        "fat_g": 34.44,
        "fiber_g": 0,
        "sat_fat_g": 20.213,
        "sugars_g": 3.76,
        "sodium_mg": 314
      },
      "nutrients": {
        "kcal": 140,
        "protein_g": 2.46,
        "carbs_g": 2.208,
        "fat_g": 13.776,
        "fiber_g": 0,
        "sat_fat_g": 8.085,
        "sugars_g": 1.504,
        "sodium_mg": 125.6
      },
      "motivo": "El catálogo no tiene este alimento y la curación declaró un sustituto: \"Queso crema\". USDA no mide el mascarpone (cero coincidencias). El queso crema (350 kcal/100 g) es el gemelo nutricional declarado en el Bloque 0, punto d."
    },
    {
      "termino_en": "variegated scallops a la plancha",
      "termino_es": "zamburiñas a la plancha",
      "food_id": "fdc-2706339",
      "name_es": "Almejas",
      "name_en": "Clams, NFS",
      "source_ref": "USDA FDC #2706339",
      "grams": 90,
      "confidence": 0.179,
      "confidence_vision": 0.7,
      "confidence_match": 0.255,
      "match": "cabeza_familia",
      "generic": true,
      "per_100g": {
        "kcal": 143,
        "protein_g": 16.14,
        "carbs_g": 6.74,
        "fat_g": 5.2,
        "fiber_g": 0.1,
        "sat_fat_g": 0.912,
        "sugars_g": 0.05,
        "sodium_mg": 199
      },
      "nutrients": {
        "kcal": 128.7,
        "protein_g": 14.526,
        "carbs_g": 6.066,
        "fat_g": 4.68,
        "fiber_g": 0.09,
        "sat_fat_g": 0.821,
        "sugars_g": 0.045,
        "sodium_mg": 179.1
      },
      "motivo": "El catálogo no tiene este alimento por su nombre y su subfamilia (\"Plato de marisco\") tampoco tiene una ficha que la represente, así que responde la familia entera con \"Almejas\". Es el último recurso antes de no dar número: dentro de una familia los valores varían mucho más que dentro de una subfamilia. La ficha es genérica (promedio de una familia): la confianza baja un 15 %."
    },
    {
      "termino_en": "serrano ham",
      "termino_es": "jamón serrano",
      "food_id": "fdc-2705879",
      "name_es": "Jamón crudo",
      "name_en": "Ham, prosciutto",
      "source_ref": "USDA FDC #2705879",
      "grams": 50,
      "confidence": 0.72,
      "confidence_vision": 0.9,
      "confidence_match": 0.8,
      "match": "alias",
      "identidad_respaldada": true,
      "per_100g": {
        "kcal": 195,
        "protein_g": 27.8,
        "carbs_g": 0.3,
        "fat_g": 8.32,
        "fiber_g": 0,
        "sat_fat_g": 2.78,
        "sugars_g": 0,
        "sodium_mg": 2695
      },
      "nutrients": {
        "kcal": 97.5,
        "protein_g": 13.9,
        "carbs_g": 0.15,
        "fat_g": 4.16,
        "fiber_g": 0,
        "sat_fat_g": 1.39,
        "sugars_g": 0,
        "sodium_mg": 1347.5
      },
      "motivo": "Coincidencia exacta con un alias en español (\"Jamón serrano\", confianza declarada 0.8)."
    },
    {
      "termino_en": "green olives",
      "termino_es": "aceitunas verdes",
      "food_id": "fdc-2710088",
      "name_es": "Aceitunas",
      "name_en": "Olives, NFS",
      "source_ref": "USDA FDC #2710088",
      "grams": 25,
      "confidence": 0.248,
      "confidence_vision": 0.85,
      "confidence_match": 0.292,
      "match": "difuso",
      "generic": true,
      "caveats": [
        "Ficha genérica: los valores son el promedio de una familia de productos, no la medición de uno solo. Los 735 mg de sodio por 100 g son ese promedio, y el de la variante del plato puede ser muy distinto."
      ],
      "per_100g": {
        "kcal": 116,
        "protein_g": 0.84,
        "carbs_g": 6.04,
        "fat_g": 10.9,
        "fiber_g": 1.6,
        "sat_fat_g": 2.279,
        "sugars_g": 0,
        "sodium_mg": 735
      },
      "nutrients": {
        "kcal": 29,
        "protein_g": 0.21,
        "carbs_g": 1.51,
        "fat_g": 2.725,
        "fiber_g": 0.4,
        "sat_fat_g": 0.57,
        "sugars_g": 0,
        "sodium_mg": 183.75
      },
      "motivo": "Coincidencia aproximada en español con \"Aceitunas\": el nombre del catálogo está dentro de lo que se identificó (cobertura 0.57). La ficha es genérica (promedio de una familia): la confianza baja un 15 %."
    },
    {
      "termino_en": "picos camperos",
      "termino_es": "picos camperos",
      "food_id": null,
      "name_es": null,
      "name_en": null,
      "source_ref": null,
      "grams": 25,
      "confidence": 0,
      "confidence_vision": 0.51,
      "confidence_match": 0,
      "match": "no_catalogado",
      "per_100g": null,
      "nutrients": null,
      "motivo": "El catálogo no tiene este alimento y no se pudo componer (La visión no declaró ingredientes visibles.) Se declara sin números: un valor sin ficha no sería trazable a ninguna fuente."
    }
  ],
  "totals": {
    "nutrients": {
      "kcal": 1548.85,
      "protein_g": 90.964,
      "carbs_g": 114.16,
      "fat_g": 80.798,
      "fiber_g": 10.135,
      "sat_fat_g": null,
      "sugars_g": null,
      "sodium_mg": null
    },
    "opcionales_ausentes": {
      "sat_fat_g": "La fuente no declara este valor para: Tortilla de patatas. Un total parcial no es un total.",
      "sugars_g": "La fuente no declara este valor para: Tortilla de patatas. Un total parcial no es un total.",
      "sodium_mg": "La fuente no declara este valor para: Tortilla de patatas. Un total parcial no es un total."
    },
    "macro_pct": {
      "protein": 23.5,
      "carbs": 29.5,
      "fat": 47,
      "kcal_fuera_de_macros": 1.2,
      "diferencia_pct": 0.1,
      "motivo_de_la_diferencia": null
    },
    "macro_pct_motivo": null,
    "grams_total": 965,
    "grams_cuantificados": 940,
    "items_incluidos": 8,
    "items_sin_datos": 1,
    "completo": false
  },
  "meta": {
    "model": "claude-sonnet-5",
    "kb_version": "3.8.0+843ecb80",
    "latency_ms": 5240,
    "model_latency_ms": 4610,
    "tokens_in": 1633,
    "tokens_out": 894
  },
  "persisted": true
}
// <<< FIN: reporte
;

export function respuestaDeFixtureCompleta(): RespuestaDeAnalisis {
  return (
// >>> GENERADO: completo
{
  "scan_id": "scan_fixture_fruta_0002",
  "is_food": true,
  "items": [
    {
      "termino_en": "banana, raw",
      "termino_es": "plátano",
      "food_id": "fdc-173944",
      "name_es": "Banana cruda",
      "name_en": "Bananas, raw",
      "source_ref": "USDA FDC #173944",
      "grams": 230,
      "confidence": 0.95,
      "confidence_vision": 0.95,
      "confidence_match": 1,
      "match": "exacto",
      "identidad_respaldada": true,
      "per_100g": {
        "kcal": 89,
        "protein_g": 1.09,
        "carbs_g": 22.84,
        "fat_g": 0.33,
        "fiber_g": 2.6,
        "sat_fat_g": 0.112,
        "sugars_g": 12.23,
        "sodium_mg": 1
      },
      "nutrients": {
        "kcal": 204.7,
        "protein_g": 2.507,
        "carbs_g": 52.532,
        "fat_g": 0.759,
        "fiber_g": 5.98,
        "sat_fat_g": 0.258,
        "sugars_g": 28.129,
        "sodium_mg": 2.3
      },
      "motivo": "Coincidencia exacta con el nombre en inglés del catálogo (\"Bananas, raw\")."
    },
    {
      "termino_en": "cherries, raw",
      "termino_es": "cerezas",
      "food_id": "fdc-171719",
      "name_es": "Cerezas dulces crudas",
      "name_en": "Cherries, sweet, raw",
      "source_ref": "USDA FDC #171719",
      "grams": 90,
      "confidence": 0.17,
      "confidence_vision": 0.85,
      "confidence_match": 0.2,
      "match": "difuso",
      "per_100g": {
        "kcal": 63,
        "protein_g": 1.06,
        "carbs_g": 16.01,
        "fat_g": 0.2,
        "fiber_g": 2.1,
        "sat_fat_g": 0.038,
        "sugars_g": 12.82,
        "sodium_mg": 0
      },
      "nutrients": {
        "kcal": 56.7,
        "protein_g": 0.954,
        "carbs_g": 14.409,
        "fat_g": 0.18,
        "fiber_g": 1.89,
        "sat_fat_g": 0.034,
        "sugars_g": 11.538,
        "sodium_mg": 0
      },
      "motivo": "Coincidencia aproximada en español con \"Cerezas dulces crudas\": lo que se identificó es el principio del nombre del catálogo (cobertura 0.33). OJO: la ficha es la del alimento CRUDO y lo que se identificó no dijo que lo estuviera; el catálogo no tiene la versión cocida de este alimento, y crudo y cocido no dan los mismos valores."
    }
  ],
  "totals": {
    "nutrients": {
      "kcal": 261.4,
      "protein_g": 3.461,
      "carbs_g": 66.941,
      "fat_g": 0.939,
      "fiber_g": 7.87,
      "sat_fat_g": 0.292,
      "sugars_g": 39.667,
      "sodium_mg": 2.3
    },
    "opcionales_ausentes": {},
    "macro_pct": {
      "protein": 4.8,
      "carbs": 92.3,
      "fat": 2.9,
      "kcal_fuera_de_macros": -28.7,
      "diferencia_pct": -11,
      "motivo_de_la_diferencia": "Con los factores 4/4/9 los macronutrientes suman más calorías de las que declara la fuente. Pasa sobre todo con la fruta y las legumbres, donde la fuente calcula las calorías con factores propios más bajos, y con la fibra, que cuenta aparte."
    },
    "macro_pct_motivo": null,
    "grams_total": 320,
    "grams_cuantificados": 320,
    "items_incluidos": 2,
    "items_sin_datos": 0,
    "completo": true
  },
  "meta": {
    "model": "claude-sonnet-5",
    "kb_version": "3.8.0+843ecb80",
    "latency_ms": 3120,
    "model_latency_ms": 2680,
    "tokens_in": 1487,
    "tokens_out": 214
  },
  "persisted": true
}
// <<< FIN: completo
  );
}

export function respuestaDeFixtureSinTotal(): RespuestaDeAnalisis {
  return (
// >>> GENERADO: sin_total
{
  "scan_id": "scan_fixture_sin_total_0003",
  "is_food": true,
  "items": [
    {
      "termino_en": "picos camperos",
      "termino_es": "picos camperos",
      "food_id": null,
      "name_es": null,
      "name_en": null,
      "source_ref": null,
      "grams": 25,
      "confidence": 0,
      "confidence_vision": 0.51,
      "confidence_match": 0,
      "match": "no_catalogado",
      "per_100g": null,
      "nutrients": null,
      "motivo": "El catálogo no tiene este alimento y no se pudo componer (La visión no declaró ingredientes visibles.) Se declara sin números: un valor sin ficha no sería trazable a ninguna fuente."
    }
  ],
  "totals": null,
  "meta": {
    "model": "claude-sonnet-5",
    "kb_version": "3.8.0+843ecb80",
    "latency_ms": 2980,
    "model_latency_ms": 2540,
    "tokens_in": 1487,
    "tokens_out": 96
  },
  "persisted": true
}
// <<< FIN: sin_total
  );
}
