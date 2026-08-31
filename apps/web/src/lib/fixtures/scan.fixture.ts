/**
 * Una respuesta REAL del contrato de `analyze`, para poder mirar el reporte sin
 * backend.
 *
 * De dónde salieron estos números: NO están inventados. Se construyó una
 * `VisionResult` de un plato español plausible y se la pasó por el MOTOR REAL
 * (`functions/lib/engine`) contra el catálogo real
 * `kb/build/foods.canonical.json` (versión 3.0.0+b2b227e1, 1.022 alimentos).
 * Cada kcal de acá abajo es `per_100g` de una ficha de USDA por los gramos del
 * plato, con su `source_ref` al lado — la misma aritmética que va a correr en
 * producción.
 *
 * El plato elegido ejercita los cuatro caminos del matching a la vez, que es
 * exactamente lo que el Q/A visual tiene que poder mirar:
 *
 *   1. `exacto`        — Tortilla de patatas (ficha manual, CINCO caveats:
 *                          la letra chica más larga del catálogo)
 *   2. `difuso`        — "cheese" → Queso, NFS: ficha GENÉRICA (promedio de una
 *                          familia) y confianza baja, 0,248
 *   3. `compuesto`     — brocheta de pollo y pimiento compuesta en runtime con
 *                          dos fichas y el método "plancha"
 *   4. `no_catalogado` — "picos camperos": SIN números, con su explicación
 *
 * Y el total sale `completo: false` con `items_sin_datos: 1` y tres
 * `opcionales_ausentes` (la tortilla no declara saturadas, azúcares ni sodio),
 * que es el aviso honesto que el reporte tiene que mostrar.
 *
 * Se enciende con `VITE_ANALYZE_FIXTURE=1` en `apps/web/.env.local`. Ver
 * `apps/web/.env.local.example`.
 *
 * Regenerarlo: correr el motor compilado contra el catálogo, como se hizo acá.
 * Si el catálogo cambia de versión, estos números quedan viejos — no es un
 * problema para lo que el fixture existe (mirar la PANTALLA), pero conviene
 * saberlo antes de usarlo como golden set: el golden set de verdad es la card
 * 2.4.
 */
import type { RespuestaDeAnalisis } from "../types";

export const RESPUESTA_DE_FIXTURE: RespuestaDeAnalisis = {
  "scan_id": "scan_fixture_tortilla_0001",
  "is_food": true,
  "items": [
    {
      "termino_en": "Spanish potato omelette (tortilla de patatas)",
      "food_id": "manual-tortilla-de-patatas",
      "name_es": "Tortilla de patatas",
      "name_en": "Spanish potato omelette (tortilla de patatas)",
      "source_ref": "Agregadores nutricionales (FatSecret, Fitia y similares), recogidos el 30/08/2026 — punto medio del rango publicado",
      "grams": 180,
      "confidence": 0.92,
      "confidence_vision": 0.92,
      "confidence_match": 1,
      "match": "exacto",
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
      "termino_en": "cheese",
      "food_id": "fdc-2705704",
      "name_es": "Queso",
      "name_en": "Cheese, NFS",
      "source_ref": "USDA FDC #2705704",
      "grams": 30,
      "confidence": 0.248,
      "confidence_vision": 0.81,
      "confidence_match": 0.306,
      "match": "difuso",
      "generic": true,
      "caveats": [
        "Ficha genérica: los valores son el promedio de una familia de productos, no la medición de uno solo. Los 964 mg de sodio por 100 g son ese promedio, y el de la variante del plato puede ser muy distinto."
      ],
      "per_100g": {
        "kcal": 381,
        "protein_g": 20.7,
        "carbs_g": 4.33,
        "fat_g": 31.26,
        "fiber_g": 0,
        "sat_fat_g": 17.763,
        "sugars_g": 2.08,
        "sodium_mg": 964
      },
      "nutrients": {
        "kcal": 114.3,
        "protein_g": 6.21,
        "carbs_g": 1.299,
        "fat_g": 9.378,
        "fiber_g": 0,
        "sat_fat_g": 5.329,
        "sugars_g": 0.624,
        "sodium_mg": 289.2
      },
      "motivo": "Coincidencia aproximada en inglés con \"Cheese, NFS\": lo que se identificó es el principio del nombre del catálogo (cobertura 0.6). La ficha es genérica (promedio de una familia): la confianza baja un 15 %."
    },
    {
      "termino_en": "chicken and pepper skewer",
      "food_id": null,
      "name_es": null,
      "name_en": null,
      "source_ref": null,
      "grams": 143.83,
      "confidence": 0.503,
      "confidence_vision": 0.74,
      "confidence_match": 0.68,
      "match": "compuesto",
      "caveats": [
        "Plato compuesto en el momento con 2 ingredientes del catálogo y el método \"plancha\": los valores por 100 g salen de fichas reales, pero la proporción de cada ingrediente la estimó la foto.",
        "Alguno de los ingredientes es una ficha genérica: su valor es el promedio de una familia."
      ],
      "per_100g": {
        "kcal": 161.162,
        "protein_g": 24.589,
        "carbs_g": 2.774,
        "fat_g": 5.803,
        "fiber_g": 0.501,
        "sat_fat_g": 1.452,
        "sugars_g": 1.752,
        "sodium_mg": 311.826
      },
      "nutrients": {
        "kcal": 231.799,
        "protein_g": 35.366,
        "carbs_g": 3.99,
        "fat_g": 8.346,
        "fiber_g": 0.721,
        "sat_fat_g": 2.088,
        "sugars_g": 2.52,
        "sodium_mg": 448.499
      },
      "motivo": "El catálogo no tiene este plato: se compuso con 2 fichas y el método \"plancha\". La cuenta entera está en \"composicion\".",
      "composicion": {
        "metodo": "plancha",
        "componentes": [
          {
            "termino_en": "Chicken, NS as to part, rotisserie, skin not eaten",
            "grams": 130,
            "food_id": "fdc-2705937",
            "name_es": "Pollo asado al spiedo sin piel",
            "source_ref": "USDA FDC #2705937",
            "match": "exacto",
            "confidence_match": 0.85,
            "generic": true
          },
          {
            "termino_en": "Peppers, sweet, red, raw",
            "grams": 60,
            "food_id": "fdc-2709801",
            "name_es": "Pimiento rojo crudo",
            "source_ref": "USDA FDC #2709801",
            "match": "exacto",
            "confidence_match": 1,
            "generic": false
          }
        ],
        "peso_entrada_g": 190,
        "aceite_absorbido_g": 0,
        "aceite_ref": null,
        "peso_final_g": 143.83,
        "rendimiento_de": "transformacion"
      }
    },
    {
      "termino_en": "picos camperos",
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
      "kcal": 590.899,
      "protein_g": 52.376,
      "carbs_g": 24.189,
      "fat_g": 32.124,
      "fiber_g": 2.881,
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
      "protein": 35.5,
      "carbs": 16.4,
      "fat": 48.9,
      "sin_explicar": -0.8
    },
    "macro_pct_motivo": null,
    "grams_total": 378.83,
    "grams_cuantificados": 353.83,
    "items_incluidos": 3,
    "items_sin_datos": 1,
    "completo": false
  },
  "meta": {
    "model": "claude-sonnet-5",
    "kb_version": "3.0.0+b2b227e1",
    "latency_ms": 4180,
    "model_latency_ms": 3620,
    "tokens_in": 1487,
    "tokens_out": 512
  },
  "persisted": true
};
