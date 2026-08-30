# NutriScann — Plan Maestro v1

> **Norte:** una app donde el usuario saca UNA foto de su plato y recibe un reporte nutricional visual (calorías, macros en pie chart, recomendación de una línea). UX de 2 interacciones. Arquitectura seria desde el día 1: nada hardcodeado, todo DB + APIs + endpoints.
>
> **Estado:** Fase 0 cerrada (salvo el plan Blaze, DT-1). **Fase 1 en curso:** Bloque 0 medido y cards definidas (30/08/2026). Última actualización: 30/08/2026.
>
> **Mecánica:** toda fase arranca midiendo (Bloque 0) y recién después define sus cards. Ver `CLAUDE.md`.
>
> **Repo:** `github.com/tomaszanchetti-ux/nutriscann` · clon local en `~/Documents/Proyectos Claudio/NutriScann/nutriscann`.
> **Proyecto Firebase:** `nutriscann-f809e` · app viva en https://nutriscann-f809e.web.app
> **Materiales fuente:** `~/Documents/Proyectos Claudio/NutriScann/datasets/` — datasets USDA + PDFs OPS/OMS.
> Para la Fase 1 se usan: **SR Legacy CSV** (base principal, ~7.800 alimentos + porciones), **Foundation Foods CSV 2026** (valores analíticos más nuevos, pisan a SR Legacy donde existan) y **Survey/FNDDS CSV 2024** (platos compuestos "como se comen" + pesos de porción → la joya para fotos de platos). Se descartan: Branded (productos envasados con código de barras, no aplica a foto de plato) y el CSV completo (redundante). El PDF **"Modelo de perfil de nutrientes" (OPS 2016)** alimenta las `recommendation_rules` de `config/` con umbrales citables; el manual OMS 1975 queda como referencia histórica (para targets v2 usamos fórmulas actuales).

---

## 1. Decisiones de arquitectura (las 7 que definen todo)

| # | Decisión | Elección | Por qué |
|---|----------|----------|---------|
| D1 | Plataforma | **PWA mobile-first** (web app instalable) | Cero fricción: no hay App Store, funciona en cualquier teléfono, la cámara se accede desde el navegador. Nativo queda para v3 si hace falta. |
| D2 | Frontend | **React + Vite + Tailwind** en **Firebase Hosting** | Stack que ya dominás de otros proyectos; deploy en segundos; Tailwind para el design system. |
| D3 | Backend | **Cloud Functions v2 (Node/TypeScript)** — endpoint `POST /analyze` | Serverless: pagás por uso (con tu volumen inicial, ~$0), escala solo, y la API key de Anthropic NUNCA toca el navegador. |
| D4 | LLM | **Claude Sonnet 5** (`claude-sonnet-5`) con **salida estructurada** (`output_config.format`) | Visión + JSON garantizado por schema (imposible que devuelva texto malformado). $2/$10 por millón de tokens. ⚠️ Sin `temperature` (lo rechaza con 400, ya lo sufriste en Arc One). |
| D5 | Base de conocimiento | **USDA FoodData Central** (dominio público, EE.UU.) curada a **~1.000 alimentos comunes** en Firestore | La OMS no publica una DB de nutrientes por alimento; la USDA sí, es EL estándar mundial, gratis y sin licencia. Se complementa con BEDCA (la tabla española) para platos locales si hace falta. |
| D6 | Anti-alucinación | **El LLM identifica, la DB cuantifica** (patrón "identify → ground → compose", ver §3) | El LLM es buenísimo reconociendo comida y pésimo recordando números exactos. Entonces: nunca le pedimos números de memoria. |
| D7 | Datos | **Firestore** con estructura preparada para workspaces v2 desde el día 1 | Los scans se guardan bajo un dueño (`owners/{id}/scans`) desde v1. Cuando llegue premium, el aislamiento por usuario ya existe — no hay migración dolorosa. |

**Secretos:** API key de Anthropic en **GCP Secret Manager**, inyectada a la Function como variable de entorno en deploy. Jamás en el repo, jamás en el cliente (misma regla que ya usás en Prode: secret manager antes de push).

**Repo:** `github.com/<tu-usuario>/nutriscann` (cuenta personal), monorepo:

```
nutriscann/
├── apps/web/          # PWA React
├── functions/         # Cloud Functions (analyze, config)
├── kb/                # Scripts de la base de conocimiento (descarga USDA, curación, seed)
├── firestore.rules    # Reglas de seguridad
└── .github/workflows/ # CI/CD → deploy automático en merge a main
```

---

## 2. Modelo de datos (Firestore)

```
foods/{foodId}                      ← LA BASE DE CONOCIMIENTO (~1.000 docs)
  name: "Pechuga de pollo, a la plancha"
  name_en: "Chicken breast, grilled"          # el LLM identifica en inglés → match más robusto
  aliases: ["pollo grillado", "suprema"]
  category: "carnes"
  per_100g: { kcal: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fiber_g: 0 }
  portion_hints: { "unidad mediana": 150, "filete": 120 }   # gramos típicos
  source: "USDA #171077"                       # trazabilidad: de dónde salió cada número

owners/{ownerId}/scans/{scanId}     ← ownerId = uid del usuario logueado (Google/email) desde v1
  created_at, image_ref (Storage), status: "processing" | "done" | "error"
  items: [ { food_id, name, grams_estimated, confidence, nutrients: {...} } ]
  totals: { kcal, protein_g, carbs_g, fat_g, protein_pct, carbs_pct, fat_pct }
  recommendation: { text, tag: "entrenamiento" | "recuperacion" | "liviana" | ... }
  meta: { model: "claude-sonnet-5", latency_ms, tokens_in, tokens_out }

config/app                          ← NADA HARDCODEADO: reglas de negocio en DB
  recommendation_rules: [ { if: "carbs_pct > 50", tag: "entrenamiento", ... } ]
  thresholds, copy de la UI, límites de rate (scans/día por dispositivo)
```

**Regla de oro:** cambiar una recomendación, un umbral o un texto = editar un documento en Firestore. Cero deploys.

---

## 3. El motor de análisis (el corazón del sistema)

Flujo del endpoint `POST /analyze` — patrón **identify → ground → compose**:

```
Foto → [1] Sonnet 5 (visión): "¿QUÉ hay en el plato y CUÁNTO?"
         → JSON estricto: [{ food: "grilled chicken breast", grams: 150, confidence: 0.9 }, ...]
         → acá el LLM hace SOLO lo que hace bien: reconocer y estimar porciones.
         → PROHIBIDO que devuelva calorías o macros: el schema ni siquiera tiene esos campos.

     → [2] Backend (determinístico): lookup de cada alimento en foods/
         → matching: exacto → alias → fuzzy. Los nutrientes salen de la DB, no del modelo.
         → matemática pura: gramos × valores_por_100g = totales. Un número, una fuente, trazable.
         → si un alimento NO está en la DB: se marca "no catalogado", el LLM da un fallback
           explícitamente etiquetado como estimación, y el alimento entra a una cola de
           curación para sumarlo a foods/ (el catálogo crece con el uso real).

     → [3] Sonnet 5 (texto, barato): "Con ESTOS números [los de la DB], escribí UNA
         recomendación según ESTAS reglas [las de config/]" → una frase, cálida y accionable.

     → Respuesta completa al cliente + persistencia del scan.
```

**Por qué esto mata la alucinación:** en el paso 1 el modelo no puede inventar números (el schema no se lo permite); en el paso 2 no hay modelo (es aritmética); en el paso 3 el modelo recibe los números ya calculados y solo redacta. Cada valor del reporte es rastreable a un documento de `foods/` con su fuente USDA.

**Detalles de implementación de la llamada:**
- SDK oficial `@anthropic-ai/sdk`, modelo `claude-sonnet-5`.
- Imagen: base64 en el content block `image` (comprimida en el cliente a ~1024px / JPEG 80% antes de subir → una imagen ≈ 1.100–1.600 tokens).
- Salida estructurada: `output_config: { format: {...} }` con schema estricto → el JSON valida siempre.
- Thinking adaptativo (default de Sonnet 5); para el paso 3 usar `output_config.effort: "low"` (es redacción, no razonamiento).
- Sin `temperature` / `top_p` (removidos en Sonnet 5 → error 400).
- Manejar `stop_reason` antes de leer contenido; reintentos con backoff ante 429/5xx.

**Costo por scan (estimado):** ~2.000 tokens de entrada + ~500 de salida ≈ **$0,01 por análisis**. 1.000 scans ≈ $10. El costo no es un tema en v1.

---

## 4. UX / UI — el contrato de las 2 interacciones

**Pantalla 1 — Captura.** Un botón grande, un mensaje ("¿Qué estás comiendo?"). Tap → cámara nativa. Nada más en pantalla.

**Transición — El escaneo (el momento mágico).** La foto queda de fondo y sobre ella:
- una línea de luz que barre la imagen de arriba a abajo (CSS puro, 60fps),
- una retícula sutil + puntos que "detectan" zonas del plato,
- micro-textos que rotan: "Identificando ingredientes…", "Consultando base nutricional…", "Calculando macros…" — que además son VERDAD (mapean a los pasos 1-2-3 del motor).
- La animación dura lo que dura la API (~3-6s): la espera ES el show.

**Pantalla 2 — El reporte.** Orden visual estricto:
1. **Calorías totales** — número gigante animado (count-up), con un anillo de progreso.
2. **Donut chart de macros** — proteína / carbohidratos / grasas, con % y gramos. Paleta fija y semántica: proteína = coral, carbos = ámbar, grasas = violeta (los mismos colores SIEMPRE, en el chart, en las cards y en la recomendación).
3. **La recomendación** — una card destacada con icono según el tag: 🏋️ "Alta en carbohidratos: ideal para un día de entrenamiento o desgaste físico."
4. Lista colapsada de ingredientes detectados (con gramos y confianza) — para el que quiere el detalle, invisible para el que no.
5. Un solo CTA: "Escanear otro plato".

**Sistema visual:** dark-mode-first (la comida fotografiada resalta sobre fondo oscuro), tipografía grande, esquinas redondeadas, glassmorphism sutil en las cards. Todo el copy sale de `config/` (editable sin deploy). Charts custom en SVG/Framer Motion — sin librería pesada de charting para un solo donut.

---

## 5. Fases de ejecución (una card por sesión, tu mecánica de siempre)

> Branch por fase (`epic/01-fundaciones`, etc.), micro-commits, QA al cierre de cada fase, merge a main solo con tu OK.

### Fase 0 — Fundaciones ✅ (casi cerrada — 29/08/2026)

**Hecho y verificado:**
- Repo `tomaszanchetti-ux/nutriscann` con el monorepo (`apps/web`, `functions`, `kb`) y `CLAUDE.md`.
- App desplegada y viva: **https://nutriscann-f809e.web.app**
- Firestore creado (multi-región `eur3`) con las reglas publicadas y **verificadas una por una** contra la API real: `foods` y `config` se leen pero no se escriben desde el cliente; `owners` ajenos y `curation_queue` quedan negados. Seis pruebas, seis resultados esperados.
- `config/app` sembrado: la app ya lee sus textos de la base, no del código.
- **CI/CD sin llaves** (Workload Identity Federation): GitHub Actions se autentica con un token efímero que solo vale para este repositorio. No hay ningún secreto de GCP guardado en GitHub.

**Pendiente — registrado como deuda, no como olvido:** el backend queda bloqueado hasta activar el plan Blaze. Ver **DT-1 a DT-4 en [DEUDAS.md](DEUDAS.md)**, con el orden exacto de destrabe. No bloquea la Fase 1.

**Sale del todo cuando:** la pantalla de fundaciones muestra "Todo conectado" — es decir, el navegador alcanza la función y la función alcanza Firestore.

### Fase 1 — Base de conocimiento (1-2 sesiones) ← **la próxima**

#### Bloque 0 — medido el 30/08/2026 ✅ (con verificación independiente de los números críticos)

| # | Medición | Resultado |
|---|---|---|
| 1 | Alimentos servibles (kcal + 4 macros completos) | **13.601** (SR 7.793 · FNDDS 5.431 · Foundation 377) — sobra 13× para el objetivo de ~1.000 |
| 2 | Solapamiento entre fuentes | **1,5%** — marginal; solo 18 alimentos están en los tres datasets |
| 3 | Usabilidad de FNDDS | **70,5% platos compuestos reales** (≥2 ingredientes), 99,3% con porción, descripciones en lenguaje de plato |
| 4 | Identificación de nutrientes | ⚠️ **NO estable**: FNDDS clava `nutrient_nbr` donde los otros usan `nutrient.id` (65/65 verificado) |
| 5 | Cobertura de porciones | SR 96,7% · FNDDS 99,3% · **Foundation 24,7%** |
| 6 | Candado de Atwater | Con tolerancia 10% + margen ±20 kcal descarta 0,5–2,8% → filtro sano. El alcohol (7 kcal/g) explica la mayoría de los fallos |
| 7 | Vocabulario español | ~968 descripciones = **glosario de ~650 términos** reutilizados 6,5× cada uno |

**Lo que la medición cambió del plan (gana lo medido):**

1. **La Fase 1 es selección y curación, no ingesta.** La materia prima sobra 13×.
2. **La precedencia SR < Foundation < FNDDS casi no se ejerce** (resolvería ~200 casos
   de 13.500). La decisión central es el *reparto de territorios*: **FNDDS gobierna los
   platos como se comen** (el caso de uso de una foto), **SR Legacy los ingredientes
   crudos**, y **Foundation se degrada a desempate puntual de valores** — no aporta
   entradas propias (24,7% de porciones, energía calculada por factores Atwater en 243
   de sus 469 alimentos, 65 descripciones duplicadas).
3. **Trampa mortal detectada:** FNDDS referencia nutrientes por `nutrient_nbr`, no por
   `nutrient.id`. Un mapeo único para los tres datasets no falla: **devuelve vacío en
   silencio** para la fuente más valiosa. → mapeo por dataset + test de aceptación que
   exige un mínimo de filas POR FUENTE, no solo "corrió sin excepción".
4. **Atwater afinado:** tolerancia 10% + margen absoluto ±20 kcal (salva a las verduras
   de la división chica) + el predictor suma 7 kcal/g de alcohol. Los residuales
   (salvados, cacao, polioles/edulcorantes) van marcados a curación manual, nunca
   descartados en silencio.
5. **Porciones FNDDS:** el 100% usa `measure_unit_id=9999` (unidad en texto libre). Se
   usa `gram_weight` directo con la descripción como etiqueta; `Quantity not specified`
   (la más frecuente) trae gramos reales y es el `portion_hint` por defecto.
6. **Bilingüe EN/ES en el catálogo, no en el endpoint** (decisión 30/08): `name_en`
   viene de USDA y es la clave de matching contra la visión; `name` (ES) y aliases salen
   de la curación, una sola vez. Nada se traduce en runtime.
7. **Esquema preparado para v2 y para las reglas OPS:** `per_100g` incluye además
   fibra, grasas saturadas, azúcares y sodio (opcionales, con provenance) — están
   gratis en los mismos CSVs y agregarlos después obligaría a re-correr todo.

#### Las cards de la Fase 1 (definidas sobre lo medido)

| Card | Qué entrega | Estado |
|---|---|---|
| **1.1 — Criterio de selección** | El reparto de territorios hecho lista: ~1.000 `fdc_id` candidatos con fuente y categoría, generado por criterio declarado (no a mano) | 🔵 en curso |
| **1.2 — Build del pipeline** | Script TS determinístico: CSVs → `foods.canonical.json` con provenance por campo, mapeo de nutrientes POR dataset, candado de Atwater afinado, tests de aceptación por fuente | ⚪ |
| **1.3 — Curación en español** | Glosario ~650 términos + composición + aliases + portion_hints (`kb/curation/*.json`) | ⚪ (‖ con 1.2) |
| **1.4 — Reglas de recomendación** | Umbrales citables del PDF OPS 2016 → `config/` | ⚪ (‖ con 1.2) |
| **1.5 — Seed a Firestore** | Publicación idempotente con `kb_version` (Firestore anda en Spark: DT-1 no bloquea) | ⚪ (tras 1.2) |
| **1.6 — Cobertura regional ES/AR/IT/PT-BR** | Medido 30/08 sobre 42 platos típicos: 19 match directo + 22 gemelo nutricional + 1 ausente (salmorejo). Promover ~24 `fdc_id` del universo a la selección + aliases regionales **validados por composición, no por nombre** (gotchas medidos: `Octopus` es pulpo rebozado, `Ribs, NFS` es 85% cerdo, `Ham croquette` no tiene bechamel) + campo de confianza por alias | ⚪ (tras 1.2+1.3) |

Las cards 1.2, 1.3 y 1.4 tocan carpetas disjuntas (`kb/src`, `kb/curation`, `config`) y
corren en paralelo con agentes distintos (mecánica multiagente WS02+, estrenada 30/08).

#### El pipeline

**Principio rector (aprendizaje Arc One): la tabla de Firestore se DERIVA — correcta por construcción, no por disciplina.** La fuente de verdad (SSOT) es el catálogo canónico versionado en git; Firestore es solo la copia de servicio. Nadie edita Firestore a mano, jamás.

Pipeline en `kb/` (cuatro capas):

```
[1] FUENTES CRUDAS (no van a git — 1,1 GB)
    kb/sources.json: manifiesto con nombre, fecha, sha256 y licencia de cada
    dataset USDA. Si un CSV cambia, el hash lo delata. Trazabilidad desde el origen.

[2] BUILD (script TS, determinístico y re-ejecutable)
    Parsea los CSVs → modelo canónico. Orden de precedencia declarado:
    SR Legacy < Foundation 2026 < FNDDS 2024 < curación manual.
    Cada CAMPO registra de qué fuente salió (provenance a nivel campo, no doc).
    Salida: kb/build/foods.canonical.json (~1.000 alimentos) — COMMITEADO:
    cada cambio del catálogo es un diff revisable en un PR, como el código.

[3] CURACIÓN (kb/curation/*.json — el vocabulario, declarativo)
    Nombres en español, aliases, portion_hints, overrides puntuales.
    "Se cura el vocabulario, se frena el error": los arreglos van acá,
    nunca al build ni a Firestore directo. El build los mezcla.

[4] SEED (idempotente → Firestore foods/)
    Upsert por id + kb_version (semver + hash del canónico) estampada en cada doc
    y en config/kb_meta. Un alimento que sale del catálogo se marca deprecated,
    NUNCA se borra (el re-seed es un re-escaneo, no un DELETE — regla Arc One).
```

**Candados del build (si fallan, no hay seed):** validación de schema · spot-checks dorados contra la fuente ("manzana ≈ 52 kcal/100g ✓") · **candado de Atwater**: kcal ≈ 4×proteína + 4×carbos + 9×grasa dentro de tolerancia — un alimento cuyas calorías no cierran con sus propios macros no entra al catálogo.

**Cola de curación (la conexión con runtime):** cuando el motor detecta un alimento no catalogado, lo escribe en `curation_queue/`. Revisión → nuevo archivo de curación → nueva versión del catálogo → re-seed. El catálogo crece con el uso real, siempre por la puerta del pipeline.

**Sale cuando:** `foods.canonical.json` commiteado con provenance por campo, candados pasando, `foods/` poblada con `kb_version`, y el seed re-ejecutado dos veces da el mismo resultado (prueba de idempotencia).

### Fase 2 — Motor de análisis (1-2 sesiones)
Cloud Function `analyze`: recepción de imagen → paso 1 (Sonnet 5 visión, schema estricto) → paso 2 (lookup + matching + aritmética) → paso 3 (recomendación desde reglas de `config/`) → persistencia del scan. Tests del matching y de la aritmética (puros, sin LLM — la decisión separada de la lectura, como en Arc One). Golden set: 10 fotos de platos conocidos con resultados esperados, para medir precisión antes de tocar UX.
**Sale cuando:** `curl` con una foto devuelve el JSON completo con números trazables a `foods/`.

### Fase 3 — Frontend (2 sesiones)
Sesión A: captura + compresión de imagen + animación de escaneo. Sesión B: pantalla de reporte (count-up, donut SVG, card de recomendación, lista colapsable) + PWA (manifest, instalable) + estados de error amables ("No pude reconocer el plato, ¿probás con más luz?").
**Sale cuando:** el flujo foto→reporte funciona en TU teléfono contra el backend real.

### Fase 4 — Hardening + salida a producción (1 sesión)
Firebase **App Check** (solo tu app puede llamar al endpoint) + **login real desde v1** (decisión 30/08: Google + email vía Firebase Auth, como en Prode — SIN perfil ni configuración en v1; el registro existe para saber quiénes son los usuarios y que cada uno sea dueño de sus scans) + rate limit desde `config/` (ej. 10 scans/día por usuario — es tu API key la que paga) + logging estructurado + presupuesto de facturación GCP con alertas + QA E2E con el golden set.
**Sale cuando:** URL pública, protegida, con costos acotados. **v1 VIVA.**

**Total estimado: 6-8 sesiones de trabajo.**

---

## 6. Roadmap v2 — Premium (misma arquitectura, cero refactor)

La v1 deja los cimientos exactos para esto; nada de lo anterior se tira:

1. ~~Auth real~~ **Ya existe desde v1** (decisión 30/08): el login Google/email llega en v1 y el `ownerId` es el uid real desde el primer scan — no hay migración de scans anónimos.
2. **Perfil** en `owners/{uid}/profile`: peso, altura, edad, sexo, deportes, frecuencia, objetivo (bajar/mantener/rendir). → TDEE y targets diarios de macros calculados por fórmula (Mifflin-St Jeor — determinística, no LLM).
3. **Aislamiento real por workspace:** ya existe estructuralmente (subcolecciones por owner desde v1); en v2 se endurece con security rules por uid + el contexto del perfil viaja SOLO en la llamada de ese usuario. Sin contaminación cruzada por construcción.
4. **Recomendación contextual:** el paso 3 del motor recibe además el perfil + el historial del día → "Vas 40g de proteína abajo de tu target; esta cena alta en proteína te viene perfecta."
5. **"Qué me conviene comer hoy":** endpoint `suggest` — perfil + calendario de entrenamiento + lo ya comido → sugerencia de dieta del día con platos y cantidades, grounded en `foods/` (el mismo patrón: el LLM compone, la DB cuantifica).
6. **Paywall:** Stripe + claim `premium` en el token de Firebase Auth; los endpoints v2 lo verifican server-side.

---

## 7. Riesgos y cómo los atajamos

| Riesgo | Mitigación |
|--------|-----------|
| Porciones mal estimadas (el problema #1 de TODAS las apps de este rubro) | `portion_hints` en la DB + mostrar confianza + v1.1: el usuario ajusta gramos con un slider y el reporte se recalcula al instante (matemática local, sin re-llamar al LLM). |
| Alimento no catalogado | Fallback etiquetado como estimación + cola de curación → el catálogo crece con el uso (el patrón de curación que ya validaste en Arc One). |
| Abuso del endpoint (tu API key paga) | App Check + rate limit + presupuesto GCP con alerta. Desde la Fase 4, no "después". |
| Foto que no es comida | El schema del paso 1 incluye `is_food: boolean` → respuesta simpática y no se cobra el análisis completo. |
| Regulatorio (consejo de salud) | Las recomendaciones son informativas/fitness, nunca médicas. Disclaimer en el footer. Sin diagnósticos. |

---

## 8. Primer paso concreto

Arrancar la **Fase 0**: decime "dale" y en esa sesión creo el repo, el proyecto Firebase, el pipeline y el esqueleto — y quedás con un deploy E2E funcionando el primer día.
