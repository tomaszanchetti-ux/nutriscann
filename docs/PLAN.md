# NutriScann — Plan Maestro v1

> **Norte:** una app donde el usuario saca UNA foto de su plato y recibe un reporte nutricional visual (calorías, macros en pie chart, recomendación de una línea). UX de 2 interacciones. Arquitectura seria desde el día 1: nada hardcodeado, todo DB + APIs + endpoints.
>
> **Estado (WS11, 03/09/2026) — Fase 5 «Números que cierran y motor que siempre responde», branch `fase/05-motor-responde` SIN merge.** Bloque 0: los 4 escaneos reales del 02/09 dieron tres fallos distintos (el 102 % de carbos era aritmética; la composición nunca disparaba; el canal inglés es el débil, no el español). Cards cerradas con Q/A: **5.1** el reparto del donut suma 100 por construcción (74 fichas publicaban >100 %); **Bloque 0 de familias** (46 familias / 191 subfamilias, `kb/curation/familias.json`, informe `kb/cobertura/familias.bloque0.md`, 94,6 % del catálogo alcanzable sin llamada extra); **5.2** la visión devuelve `familia_subfamilia` de una lista cerrada, descompone siempre y lee etiquetas de envase (golden 30 fotos: 47/53 en la subfamilia esperada); **retoque de costo**: prefijo 16.088 → 8.361 tokens, caché de 1 h, $0,108/usuario/mes a 15 escaneos calientes; **5.3** cascada nombre → sustituto → componer → cabeza de subfamilia → cabeza de familia → composición parcial, con el **candado de plausibilidad** para toda ficha construida (las 1.115 lo pasan). Golden re-jugado: 0 fichas cambiadas. La pizza del 02/09 sale con 401 kcal. 542 tests en functions, 126 en el seed. **Dónde retoma la WS12:** Q/A visual de Tomás sobre la fixture (`VITE_ANALYZE_FIXTURE=1` y `=completo`), merge con su OK, deploy por CI y re-seed de `config/copy.json` (114 claves); deudas nuevas DT-51…DT-58.
>
> **Estado:** Fases 0–2 cerradas. **Fase 3 CERRADA — WS08 (02/09/2026): CaliScan v1 DESPLEGADA EN PRODUCCIÓN.** La marca pasó a **CaliScan** (`caliscan.app`, comprado por Tomás en Cloudflare): la landing pública vive en **https://caliscan.app** (logo nuevo, planes espejados de la app, `terminos.html`) y la PWA en **https://app.caliscan.app** (rename completo, tarjeta Open Graph para WhatsApp, aviso de instalación iOS/Android, y el isotipo de la marca como ícono del teléfono — decisión de Tomás sobre el dispositivo real). Backend `analyze` + `health` ACTIVOS en europe-west1 (la key en Secret Manager verificada — DT-2 ✅; Storage en europe-west1 — DT-3 ✅); **catálogo 3.8.0 sembrado en producción** (1.118 escrituras, 3 deprecadas, dry-run previo) + configuración con **64 claves** de copy y las reglas de `waitlist` desplegadas. El Q/A visual de Tomás se ejecutó DOS veces en el día (multiagente, 12 commits): la vitrina quedó como «Funcionalidades Premium» con tags de plan y la card del ítem respira en el móvil. CI completo (verify + deploy de hosting×2, functions, firestore y storage en cada merge a `main`) — los 7 candados de permisos del primer deploy de functions quedaron abiertos de forma permanente. Tomás verificó la app instalada desde su teléfono; el primer escaneo real desde el móvil queda como apertura natural de la WS09. **La WS09 abre la Fase 4.** Ver «Dónde retoma la WS09». *(Registro WS07, superseded: cards 3.1–3.4 ejecutadas en multiagente.)* El repaso de la WS07 saldó DT-30, DT-37, DT-38 (salvo la cláusula del 70 %), DT-39 (núcleo), DT-32, DT-25, DT-20, DT-21, DT-22, DT-23 y DT-5 — y el torrezno pasó a panceta (etiqueta Carrefour, la mediana del mercado) por decisión de producto. Catálogo **3.8.0: 1.115 fichas + 21 guardas emitidas que MUERDEN en el matcher**; `termino_es` viaja al expediente (la corrida v4 podrá re-jugar el duelo de idiomas); criterio 2 de la v3: **25/26 = 96,2 %**. Front: escaneo mágico + vitrina premium + donut de doble anillo + T&C + íconos PWA + copy de España. **Branch `fase/02-motor-analisis` pusheada SIN merge** (merge solo con OK de Tomás). Ver "Dónde retoma la WS08".
>
> *(Registro WS05, superseded: el E2E real funciona y el motor aprendió a hablar.)* Primer análisis real de punta a punta (la carbonara de Tomás: 525 kcal trazables, scan persistido, reporte en pantalla, ~$0,007/scan). **Cards 2.5–2.8 cerradas con Q/A**: DT-18 (los 18 textos de la UI con fuente de verdad en `config/copy.json`, seeder con máscara de 5) · recall del matching EN/ES (visión bilingüe con `food_es`, variantes USDA, cobertura por núcleo, crudo/cocido — 5→14 matches sobre los 17 términos grabados) · curación quirúrgica (**catálogo 3.1.0**: los alias tóxicos `Filete`/`Asado`/`Croqueta` extirpados con guarda, 5 guardas de vocabulario) · compuerta del total (`CONFIANZA_MINIMA_PARA_UN_TOTAL=0.12`: la comida de plástico ya no firma 1.550 kcal como total), cortes que no cocinan, nombre partido. **240 tests en functions, 148 en kb.** **Golden set de 30 platos construido y corrido DOS veces** (predicciones antes, 5 criterios de mercado fijados por adelantado): v1 1/5 criterios → **v2 3/5, con CERO fichas equivocadas y 0❌ de 30 platos**. Falta poco y está medido: DT-28 (cola descriptiva USDA, tokenizar `/`, el payload de la compuerta, recalibrar criterio 2, estabilidad de visión). Ver "Dónde retoma la WS06". Última actualización: 01/09/2026.
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
  recommendation_rules: [ { if: "carbs_pct >= 55", tag: "entrenamiento", ... } ]
  thresholds, copy de la UI, límites de rate (scans/día por dispositivo)
```

**⚠️ Nota (31/08/2026):** el esquema de `foods/` de arriba es el boceto original; **el contrato real y vigente es `kb/src/types.ts` (`CanonicalFood`)** — `names.{en,es}` en vez de `name`/`name_en`, aliases con confianza (string u objeto), `portion_hints` como array con etiquetas bilingües, provenance por campo, `generic`, `caveats`, `receta`. Ante cualquier diferencia, gana `types.ts`.

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

     → [3 — SOLO v2, decisión 31/08/2026] Sonnet 5 (texto, barato): "Con ESTOS números
         [los de la DB], escribí UNA recomendación según ESTAS reglas [las de config/]".
         En la v1 este paso NO existe: el reporte muestra solo lo medido (calorías,
         macros, composición). El set de reglas v1 queda construido, publicado en
         config/ y dormido hasta la v2 (§6) — nada se tira.

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
2. **Donut chart de macros** — proteína / carbohidratos / grasas, con % y gramos. Paleta fija y semántica: proteína = coral, carbos = ámbar, grasas = violeta (los mismos colores SIEMPRE, en el chart y en las cards).
3. Lista colapsada de ingredientes detectados (con gramos, confianza y la letra chica de las fichas — los caveats) — para el que quiere el detalle, invisible para el que no.
4. Un solo CTA: "Escanear otro plato".

*(La card de recomendación que estaba acá pasó a la v2 — decisión 31/08/2026: la v1
muestra solo lo medido, sin consejos. Ver §6.)*

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
| **1.1 — Criterio de selección** | El reparto de territorios hecho lista: 975 `fdc_id` (675 FNDDS + 300 SR), criterio v2 por uso real en recetas | ✅ 30/08 |
| **1.2 — Build del pipeline** | Script TS determinístico: CSVs → `foods.canonical.json` con provenance por campo, mapeo POR dataset, 5 candados, 62 tests. Q/A: recomputación independiente 64/64 | ✅ 30/08 |
| **1.3 — Curación en español** | 975 nombres + glosario ~1.000 términos + 609 aliases regionales + 18 porciones curadas. Q/A con censo completo | ✅ 30/08 |
| **1.4 — Reglas de recomendación** | 3 umbrales OPS citados + 3 criterios propios declarados → `config/`. Q/A: citas verificadas palabra por palabra | ✅ 30/08 |
| **1.5 — Seed a Firestore** | `kb/seed/`: paquete propio sin dependencias, API REST, upsert con comparación profunda (2ª corrida = 0 escrituras), `deprecated` sin DELETE (garantía estructural), freno ante deprecación masiva (>10 % aborta). 48 tests + circuito de 10 pasos contra el emulador. Q/A adversarial aplicado | ✅ 30/08 (WS03) |
| **1.6 — Cobertura regional ES/AR/IT/PT-BR** | ⚠️ *Divergencia con lo planificado (la lista de la WS02 no se persistió; gana lo medido):* 42 platos → **10 directos + 26 gemelos + 6 ausentes**, no 19/22/1. Gemelos **validados por composición, no por nombre** (los gotchas se confirmaron: pulpo rebozado, ribs con barbacoa, croqueta sin bechamel). + **Barrido español ampliado: 39 platos más → 50 platos ES medidos, 1 solo ausente final (lomo embuchado)**. Aliases con confianza (escala cerrada 1,0/0,8/0,6/0,5) que viaja hasta el usuario. + **DT-7 ejecutada**: censo de 137 pares FNDDS/SR, 8 duplicados fusionados, 27 renames bajo "el nombre nunca miente" (Bacalao era frito; la Sidra era jugo; Maní tostado con sal). 6 fichas manuales (salmorejo por etiqueta; 4 por referencia web declarada; açaí solo "en polvo liofilizado" — la pulpa sería 3× menos y queda pendiente). Todo con Q/A adversarial en 3 pasadas (cero errores de dato) | ✅ 30/08 (WS03) |
| **1.7 — Recetas compuestas** | *"El sistema crea valores nutricionales a partir de recetas"* (directiva 30/08): `cooking.transforms.json` con rendimientos **medidos de los propios datasets** (mezclado 1,000 n=290; frito +6,5 % aceite n=117; horneado 0,759 n=193; horneado de masa 0,891 n=3; plancha 0,757), matemática pura en `transforms.ts` (la Fase 2 la reutiliza en runtime para componer platos no anticipados), 9 recetas derivadas sin tipear un número (migas, ajoblanco, merluza en salsa verde, gazpachuelo, escalivada, tarta de Santiago 438,7 kcal, bocadillo de calamares, huevos rotos, turrón) + primeras fichas de ingredientes sueltos (agua, sal, miel, huevo…). 3 derivaciones bloqueadas por honestidad (lomo embuchado, pulpa de açaí, y las que su rendimiento no tiene fuente) | ✅ 30/08 (WS03) |

Las cards 1.2, 1.3 y 1.4 tocan carpetas disjuntas (`kb/src`, `kb/curation`, `config`) y
corren en paralelo con agentes distintos (mecánica multiagente WS02+, estrenada 30/08).

**Insumo para la 1.6 — salmorejo (etiqueta comercial, foto de Tomás 30/08/2026):** por
100 ml — 83 kcal · grasas 6,1 g (saturadas 0,9) · hidratos 5,6 g (azúcares 2,5) ·
proteínas 0,8 g · sal 0,80 g (→ sodio ≈ 320 mg). Producto industrial con AOVE. Atwater
cierra al 3 % (80,5 vs 83). Caveats a declarar en la entrada: valores por 100 **ml**
(densidad ≈ 1, aceptable), sin dato de fibra, y provenance "etiqueta comercial", no USDA.
Entra como la primera entrada de **curación manual** (precedencia máxima del pipeline).

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

### Fase 2 — Motor de análisis ← **EN CURSO (WS04, 31/08/2026)**

Cloud Function `analyze` en DOS pasos (el paso 3 de recomendación pasó a la v2, decisión 31/08): recepción de imagen (base64 en el POST — Storage llega con DT-3) → paso 1 (Sonnet 5 visión, schema estricto sin campos de nutrientes) → paso 2 (lookup + matching + aritmética + composición on-demand vía `transforms.ts`) → persistencia del scan. Tests del matching y de la aritmética (puros, sin LLM — la decisión separada de la lectura, como en Arc One). Desarrollo 100 % local contra emuladores; deploy real al cierre (Blaze ya activo).

#### Bloque 0 — medido el 31/08/2026 ✅ (verificación en vivo de repo, catálogo, Firestore y facturación)

Hallazgos que redefinieron las cards: `config/app` en Firestore estaba vacío de reglas y sin versión (no existía seeder de config) · el `.gitignore` no cubría los archivos de la key · el front no podía apuntar al emulador · SDK de Anthropic 51 minors atrás · la estructura real del catálogo difiere del §2 de este plan (**el contrato verdadero es `kb/src/types.ts`**: `names.{en,es}`, aliases heterogéneos con confianza, `portion_hints[]`) · `names.en` 100 % único (clave primaria limpia del matching) · 0 colisiones exactas de alias — el riesgo del matching es difuso (familia "Pastel", "Catsup" EN↔ES, "chorizo"/"Bife de chorizo").

#### Las cards de la Fase 2 (definidas sobre lo medido)

| Card | Qué entrega | Estado |
|---|---|---|
| **2.0 — Cimientos** | `.gitignore` cubre los archivos de secretos · seeder de `config/` (valida antes de publicar, máscara de 4 campos, idempotente) · circuito local front→emulador (`VITE_FUNCTIONS_EMULATOR`) · `kb:seed:local` · SDK `@anthropic-ai/sdk` ^0.122.0 | ✅ 31/08, Q/A adversarial aplicado |
| **2.DT — Decisiones DT-8/DT-13** | Catálogo **3.0.0+b2b227e1, 1.022 alimentos**: 3 fusiones con herencia de vocabulario (0 términos perdidos, medido) · porción del parmesano SR corregida (100→5 g) · política de genéricos: `generic: true` (339) + caveat de sodio por regla declarativa (101) con candado bidireccional · guarda de vocabulario "chorizo" (rompe el build) | ✅ 31/08, Q/A adversarial aplicado |
| **2.1 — El corazón determinístico** | `functions/src/engine/`: la cascada de matching (exacto por `names.en` → alias con confianza → difuso por tokens con especificidad, el mejor candidato entre EN y ES gana y el inglés solo desempata; guardas chorizo/pepinillos; `generic` ×0,85) + aritmética honesta (null jamás 0, totales parciales declarados) + composición on-demand todo-o-nada con `transforms.ts` por copia derivada con candado byte a byte. 122 tests; las 9 recetas del catálogo recompuestas en runtime idénticas | ✅ 31/08, Q/A en 2 pasadas |
| **2.2 — La llamada al modelo** | La ÚNICA llamada (visión, `output_config.format` con schema sin campos de nutrientes — la regla dura 2 imposible de violar, no solo prohibida) + endpoint `analyze` con CORS probado, 413 al carácter, reintentos exactos (3 techo, 0 para errores definitivos), doble piso del catálogo, persistencia + cola de curación con dedupe entre escaneos. 56 tests propios (178 functions) | ✅ 31/08, Q/A aplicado |
| **2.3 — Front mínimo para Q/A visual** | Captura → compresión canvas → reporte de SOLO lo medido: kcal, donut que no normaliza a 100, confianza por item, letra chica desplegada, "total parcial" honesto. Config por REST sin SDK (76,6 kB gzip). Modo fixture con números del motor real, byte a byte | ✅ 31/08, Q/A aplicado |
| **2.4 — Golden set + Q/A E2E** | Superada por lo hecho en la WS05: E2E real (carbonara) + golden set de **30** platos (simples/compuestos/negativos) con predicciones previas y 5 criterios de mercado, corrido 2 veces. El set vive en el scratchpad de la sesión; **incorporarlo al repo es parte de DT-28** | ✅ 01/09 (WS05, ampliada) |
| **2.5 — DT-18: copy al seeder** | `config/copy.json` (18 claves byte a byte con el front) + seeder con máscara de 5 campos + circuito de emulador en 7 corridas. El pie del front pasó a "textos: Firestore" | ✅ 01/09, Q/A aplicado |
| **2.6 — Recall del matching EN/ES** | Visión bilingüe (`food_es`), variantes de índice USDA, cobertura por núcleo, plurales, regla crudo/cocido. 5→14 matches en los 17 términos; 0 fichas mal elegidas; 218 tests | ✅ 01/09, Q/A aplicado |
| **2.7 — Curación quirúrgica** | Catálogo **3.1.0**: `Filete`/`Asado` extirpados, `Croqueta`→Croquetas de papa, alias `Lentejas`, 5 guardas de vocabulario con test de mordida | ✅ 01/09, Q/A aplicado |
| **2.8 — Compuerta + cortes + nombre partido** | `CONFIANZA_MINIMA_PARA_UN_TOTAL=0.12` (el plástico no firma más totales) · cortes que no cocinan (`apple slices` matchea) · dirección C del difuso (solo rompe silencios, garantía medida). 240 tests | ✅ 01/09, Q/A aplicado |

**Decisiones de producto de la WS04:** v1 sin recomendaciones (solo lo medido) · límite de uso: **3 escaneos/día** en v1 (valor en `config/app`, editable sin deploy; baja a 1/día cuando exista premium — el mecanismo de conteo por usuario llega en la Fase 4 con el login) · la imagen viaja como base64 (Storage con DT-3).

**La WS06 (01/09/2026) cerró el backend** — la agenda de la WS05 cumplida entera y ampliada: cards 6.1 (DT-28) · 6.2 (DT-27) · 6.3 (censo mediterráneo + curación) · 6.4/6.4b (las fichas que faltaban: 44 de 48 platos) · 6.5 (**golden v3: 5/5**) · 6.6 (Fase 3 + tiers premium al plan).

**Dónde retoma la WS09 — la Fase 4 entera (hardening + salida pública):** la v1 está VIVA pero abierta: cualquiera con la URL puede escanear contra nuestra API key. La WS09 ejecuta la Fase 4 completa (§ Fase 4): **login real** (Google + **magic link** — decisión de Tomás del 02/09, reemplaza al "email" genérico) · **App Check** · **rate limit por usuario** desde `config/` (los cupos 15/40/150 por fin tienen a quién contarle las fotos; hoy `owner_id` es el provisorio `anon-dev`) · logging estructurado · QA E2E con el golden set. Abre con su Bloque 0 (medir el estado real del deploy: primer escaneo desde el teléfono de Tomás incluido) y con la cosecha pendiente: **DT-40** (errores del backend que vosean, fuera de la lista cerrada) y **DT-41** (umbral de sodio copiado, mudanza de `copy.premium.ts`/`copy.terminos.ts` a `config/`, claves huérfanas, maquinaria muerta del donut — el punto (d), las reglas de `waitlist`, ya salió con el deploy). **Sale cuando:** URL pública, protegida, con costos acotados — v1 VIVA para compartir sin miedo.

*(Registro WS08, cumplido: el repaso visual y el deploy definitivo — card 3.5.)* los ajustes del Q/A visual de Tomás (PDF del 01/09) quedaron EJECUTADOS en la propia WS07 (menos cosas y más útiles: pie reordenado con lo técnico solo-dev, macros en decreciente y enteros, sin secciones de desglose, sodio en la card de ítem con ámbar honesto, vitrina con las palabras de Tomás y **la LISTA DE ESPERA nueva** — modal nombre/apellidos/correo → colección `waitlist` con regla de solo-alta). Decisiones tomadas el 01/09: jamón 0,6 · cláusula del 70 % como está · T&C aprobados. **La WS08 abre con el repaso visual de Tomás sobre la instancia local y, con su OK, la card 3.5**: decisión de MARCA/dominio primero (`nutriscan.app` existe) · DT-2 (key) + DT-3 (Storage) + target del CI + seed real con OK de Tomás (catálogo 3.8.0 + 21 guardas, 47 claves de copy, scanning_steps + 4.º paso) + **deploy de `firestore.rules` (waitlist)** + la cosecha DT-41 + E2E desde el teléfono. **Sale cuando: la v1 VIVA en el dominio elegido, verificada desde el teléfono de Tomás.**

**Sale cuando:** `curl` con una foto devuelve el JSON completo con números trazables a `foods/`, y el circuito local entero (front + emulador) permite el Q/A visual de Tomás.

### Fase 3 — Frontend + deploy completo ✅ (CERRADA — WS07 + WS08, 02/09/2026)

Cards definidas el 01/09/2026 (WS06) a partir de los comentarios de front de Tomás
(PDF "Comentarios frontend (Fase 3)"), con su OK explícito:

| Card | Qué entrega |
|---|---|
| **3.1 — El reporte pulido** | Texto legal/disclaimer más chico y al final de la pantalla · evaluar "Del resto del análisis" (fibra, saturadas, azúcares, sodio) como colores adicionales del donut (mostrar las dos variantes, elige Tomás) · card de ítem sin el wording "ficha" y sin la línea de % visión/ficha (el resto tal cual, "golazo") · **cierra DT-20** (tipos del front alineados a `TotalesNutrientes` nullable + candado byte a byte), **DT-22** (los ~15 textos hardcodeados a `config/copy.json`) y **DT-23** (el título de macros huérfano) — misma zona de código |
| **3.2 — El escaneo mágico** | La animación del scanner que barre la foto, retícula, micro-textos que rotan y son verdad (mapean a los pasos reales del motor), estados de "cargando". La espera ES el show |
| **3.3 — CTAs + Premium teaser** | Doble CTA: "Escanear otro plato" tal cual + "Pasarte a premium" igual tamaño, distinto color · sección **Perfil** con funcionalidades premium visibles pero bloqueadas → modal simple que explica premium + CTA · sección **Premium** que muestra **los tiers cerrados del §6.7** (Gratuito 15/mes · €12/año 40/mes · Gold €4,99/mes 150/mes + plan diario). *(v1: vitrina — el pago real con Stripe es v2)* |
| **3.4 — T&C + identidad** | Sección de Términos y Condiciones (no somos nutricionistas ni médicos, no reemplaza consulta profesional, valores de bases internacionales con USDA citada, la app ayuda a entender lo que comés) · íconos de la PWA (**DT-5**) · pasada de copy España (**DT-21**, sin voseo — se edita `config/copy.json` + seed, sin deploy) |
| **3.5 — Deploy completo (cierre de fase)** | DT-2 (la key la carga Tomás) + DT-3 (Storage) + target completo del CI + **seed real del catálogo con OK de Tomás** (⚠️ 2 de 3 `scanning_steps` cambian vs. lo publicado a mano) + verificación E2E en producción desde el teléfono de Tomás |

⚠️ Antes de 3.4/3.5 conviene la decisión de marca: `nutriscan.app` existe y publica
contenido nutricional (detectada WS03, re-confirmada WS05).

**Sale cuando:** el flujo foto→reporte funciona en el teléfono de Tomás contra el
backend real, en producción.

### Fase 4 — Hardening + salida a producción (1 sesión)
Firebase **App Check** (solo tu app puede llamar al endpoint) + **login real desde v1** (decisión 30/08, afinada el 02/09: **Google + magic link** vía Firebase Auth, como en Prode — SIN perfil ni configuración en v1; el registro existe para saber quiénes son los usuarios y que cada uno sea dueño de sus scans) + rate limit desde `config/` (ej. 10 scans/día por usuario — es tu API key la que paga) + logging estructurado + presupuesto de facturación GCP con alertas + QA E2E con el golden set.
**Sale cuando:** URL pública, protegida, con costos acotados. **v1 VIVA.**

#### Bloque 0 — medido el 02/09/2026 (WS09) ✅

Medido contra las APIs de Google y contra la app viva, no contra el recuerdo:

| Qué se midió | Resultado |
|---|---|
| Landing, PWA, `analyze` y `health` | Todo en pie: `caliscan.app` y `app.caliscan.app` responden 200, las dos funciones ACTIVE en europe-west1, catálogo **3.8.0+843ecb80** publicado y configuración leída de Firestore |
| Reglas de `waitlist` | Desplegadas y **mordiendo**: un alta mal formada recibe 403 |
| **Firebase Auth** | **No estaba ni encendido**: la configuración de Identity Platform respondía `CONFIGURATION_NOT_FOUND`. Cero proveedores |
| **El endpoint `analyze`** | **Abierto al mundo**: invocador `allUsers`, CORS a cualquier origen, sin token y sin App Check |
| **El cupo** | **Existe en el papel y no en el código**: `max_scans_per_day: 10` está publicado en `config/app` y declarado en `AppConfig`, pero ningún camino del handler lo consulta. Nada frena a nadie |
| El dueño de un scan | Llega en el CUERPO del pedido con el valor provisorio `anon-dev`. Las reglas de Firestore ya exigen `request.auth.uid == ownerId` para leer, así que **la estructura definitiva ya existe: no hay migración, hay un valor distinto** |
| El bundle del front | 85.536 bytes gzip antes de tocar nada (la vara para medir lo que engorda el login) |
| `authDomain` | Apuntaba a `nutriscann-f809e.firebaseapp.com` mientras la app se sirve desde `app.caliscan.app`. Con dominios distintos, el login por redirección se rompe en Safari y en la PWA de iPhone (particionado de cookies de terceros). Verificado que `app.caliscan.app/__/auth/handler` responde 200 |

**El hallazgo que ordenó la sesión:** la v1 está viva y **cualquiera con la URL puede
gastar la API key de Tomás**. El login no es el objetivo en sí — es el mecanismo que
permite contarle las fotos a alguien. Por eso las cards van juntas y en este orden.

#### Las decisiones de Tomás (02/09/2026)

1. **La WS09 ejecuta la Fase 4 completa**, no solo el login.
2. **Login obligatorio**: sin cuenta no se escanea. Es lo único que hace que el cupo
   signifique algo, y destraba historial y tendencias de la v2 (§8 de `PLAN_V2.md`).
3. **Cupo de la v1: 15 escaneos por mes** (la garantía que se comunica, la misma
   escalera 15/40/150 de §6.7) **y 3 por día** como freno anti-ráfaga interno. El
   `max_scans_per_day: 10` publicado hoy baja a 3.

#### Las cards de la Fase 4 (definidas sobre lo medido)

| Card | Qué entrega | Estado |
|---|---|---|
| **4.0 — Encender la identidad** | Firebase Auth inicializado por API (no existía: la configuración respondía `CONFIGURATION_NOT_FOUND`) · entrada por enlace de correo habilitada · **Google habilitado por Tomás en la consola** con su cliente OAuth —lo único que la API no autoaprovisiona— y verificado por API · dominios autorizados (`caliscan.app`, `app.caliscan.app`, `localhost`) · correos en español | ✅ 02/09 |
| **4.1 — La puerta** | Pantalla de entrada (Google + enlace por correo) con sus seis estados · sesión que sobrevive a cerrar la PWA y sin parpadeo para quien ya entró · el enlace abierto en otro navegador pide el correo en vez de fallar, y un correo mal escrito **no gasta el código** · cuenta y cierre de sesión en Perfil · `authDomain` al dominio propio · el token en cada foto, con **un** reintento ante 401 (que no gasta modelo ni cupo) · **+28 kB gzip declarados** (85,5 → 114,2) | ✅ 02/09 |
| **4.2 — El backend deja de confiar en el cuerpo del pedido** | `analyze` verifica el token y saca el dueño de ahí; `DUEÑO_PROVISORIO` muere; un `owner_id` en el cuerpo ya no decide nada (se anota en el log por los teléfonos con la versión vieja cacheada); 401 `no_autenticado` **fallando cerrado** · preflight con `Authorization` verificado, no supuesto | ✅ 02/09 |
| **4.3 — El cupo que muerde** | Conteo transaccional en `owners/{uid}/usage/{YYYY-MM}` —una lectura, no treinta, y el día se resetea solo— con corte en Europe/Madrid · el crédito se reserva antes del modelo y **solo se devuelve lo que no llegamos a pagar** · 429 con lo que queda y cuándo se renueva · **15/mes y 3/día ya publicados en producción** · suite 364 → **430 tests**, candados probados por mutación (tres reservas simultáneas con un hueco dejan entrar una) | ✅ 02/09 |
| **4.4 — App Check** | Clave de reCAPTCHA Enterprise acotada a nuestros dominios, app registrada con token de 24 h (para no gastar las 10.000 evaluaciones gratuitas al mes) y verificación en `analyze` **en modo observación**: mira de dónde viene cada foto y lo anota, sin echar a nadie. El interruptor `app_check_enforced` vive en `config/app` — se enciende sin desplegar y la **marcha atrás está medida en 60 s** · un fallo NUESTRO nunca bloquea (cuatro estados, no dos) · +4,8 kB · 455 tests | ✅ 02/09 · bloqueo pendiente (DT-44) |
| **4.5 — Las deudas** | DT-40 (a) ✅ los 8 textos de error entran a la lista cerrada y dejan de vosear —y el candado ahora compara contra los DOS lectores, front y backend— · DT-41 (a) ✅ el umbral de sodio se publica y un test lo ata a la curación · DT-41 (b) 🟢 39 claves mudadas byte a byte, **la pantalla de planes entera: cambiar 12 € por 15 € ya no exige desplegar** · DT-41 (c) ✅ 5 claves huérfanas (2 más de las declaradas) · DT-41 (f) ✅ el anillo muerto podado (456 → 271 líneas) · **DT-40 (b) NO, con el motivo medido**: tiene tres puntas y mover la versión del catálogo obligaría a reescribir los 1.115 documentos de producción por un cambio de palabras | ✅ 02/09 |

**La Fase 4, cerrada el 02/09/2026 (WS10).** Los dos movimientos que quedaban se
hicieron en este orden:

1. **`config/app` sembrada en producción**: de 64 a **106 textos** y el umbral de
   sodio (400 mg/100 g) publicado. Los cupos (15/mes, 3/día) quedaron intactos
   porque están fuera de la máscara del seed, y la `kb_version` no se movió, así
   que **no se reescribió ni una de las 1.115 fichas**. De las 5 claves huérfanas
   que se retiraron, una —`donut_rest`— la leía todavía el front desplegado: se
   verificó que `fusionarCopy` parte de los textos del código y solo los pisa con
   lo que llega, así que cayó a su valor por defecto y no se vio nada.
2. **Merge a `main` (`7ed3b11`), que ES el despliegue.** Antes del merge:
   **756 tests en verde** (455 functions + 175 catálogo + 126 seed), tipos
   limpios, curación verificada y build OK. El despliegue salió en verde y se
   comprobó en vivo: la **puerta se ve en `app.caliscan.app`** (Google + enlace
   por correo, con el logotipo y el eslogan) y **`analyze` sin token devuelve
   401** — la v1 dejó de estar abierta al mundo.

**Lo que la WS10 encontró y no estaba escrito:** el CI **nunca corrió los tests de
`functions`** — 455 de los 756, justo los que cubren la Fase 4 entera. Hoy se
corrieron a mano; el candado que falta es **DT-48**. Y el bundle real quedó en
116,65 kB gzip contra los 114,2 declarados, por los dos commits visuales del
final: **DT-49**.

**El E2E desde el teléfono, ejecutado el 02/09/2026 a las 13:50 (Madrid). La v1
queda CERTIFICADA y la Fase 4 cerrada.** Lo que probó, con la evidencia al lado:

| Qué se probó | Evidencia |
|---|---|
| Login con Google en el teléfono | 1 cuenta dada de alta, proveedor `google.com` |
| El backend exige token | `no_autenticado` registrado ante una llamada sin cabecera → 401 |
| **El cupo muerde** | `"agotado el cupo del dia: 3/3"` · **HTTP 429 en 0,12 s** a la cuarta foto |
| El contador es honesto | `usados_dia: 3` · `usados_mes: 3` · `devueltos: 0` · `zona: Europe/Madrid` |
| Los escaneos se persisten | 2 documentos en `owners/{uid}/scans` |
| **App Check con un token REAL** | **Ninguna advertencia de procedencia en las tres peticiones.** El silencio prueba: la procedencia se comprueba ANTES del cupo y `advertir` está cableado a `logger.warn` (`index.ts:167`) — el mismo logger que sí escribió el mensaje del 429. **Es la primera vez que se ve un token emitido por nuestra clave de reCAPTCHA**, que es justo lo que la WS09 no pudo probar |

**El número que parecía no cuadrar, y cuadra:** 3 créditos consumidos y solo 2
escaneos guardados. La tercera foto **no era comida**: el handler devuelve 200 con
ítems vacíos, **no persiste nada a propósito** (§7) y **consume el crédito igual**,
porque el modelo miró la foto y contestó. La latencia lo confirma — 2,6 s contra
5,5 y 3,2 de las otras dos: se cortó antes de buscar en el catálogo.

**⚠️ La trampa que solo apareció en un teléfono real (y la razón por la que esta
fase no se cerró con el CI en verde).** El primer intento de entrar con Google
falló con **`Error 400: redirect_uri_mismatch`**. Causa: la card 4.1 movió el
`authDomain` a `app.caliscan.app` —con razón, porque con el dominio de Firebase la
redirección se rompe en Safari y en la PWA de iPhone—, pero **esa dirección de
retorno nunca se dio de alta en el cliente OAuth de Google**, que solo conocía
`nutriscann-f809e.firebaseapp.com`. Se comprobó preguntándole a Google por las dos
direcciones antes y después del arreglo. **No hay API que lo edite: es consola.**
Quedó escrito como **DT-50** porque vuelve a morder cada vez que se toque el
`authDomain` o se sume un dominio. Verificado también que la pantalla de
consentimiento está **En producción / Usuarios externos**: cualquiera puede entrar,
no solo los probadores.

**La v1 de CaliScan está viva, cerrada con llave y certificada en un teléfono
real.**

**Nota de facturación (WS09):** inicializar Auth por API dejó el proyecto como
**Identity Platform** (`subtype: IDENTITY_PLATFORM`), que tiene un umbral gratuito de
**50.000 usuarios activos por mes** en lugar del "gratis e ilimitado" del Firebase Auth
clásico. Para la escala de la v1 es indistinto —y el presupuesto de €10/mes con alertas
sigue puesto—, pero queda escrito para que nadie lo descubra en una factura.

**Total estimado: 6-8 sesiones de trabajo.**

---

## 6. Roadmap v2 — Premium (misma arquitectura, cero refactor)

La v1 deja los cimientos exactos para esto; nada de lo anterior se tira:

1. ~~Auth real~~ **Ya existe desde v1** (decisión 30/08): el login Google/email llega en v1 y el `ownerId` es el uid real desde el primer scan — no hay migración de scans anónimos.
2. **Perfil** en `owners/{uid}/profile` (lista definida por Tomás, 31/08/2026): sexo · edad **en rangos** (la fórmula usa el punto medio) · altura · peso · **actividad deportiva desglosada** (veces por día × días por semana × deportes elegidos de una lista cerrada — el tipo cambia el consejo: fuerza pide proteína, resistencia pide carbohidratos) · objetivo (bajar de peso / subir músculo / tonificar / …) · **comidas del día** (desayuno / almuerzo / merienda / cena, sí o no — el plan reparte solo entre las comidas que el usuario realmente hace) · **elección alimentaria** (vegano, vegetariano…) e **intolerancias** (lactosa, gluten…). Las intolerancias filtran con cuidado declarado: la app es informativa, no médica — las alergias severas quedan explícitamente fuera del alcance (un error ahí no es una mala sugerencia). → TDEE y targets diarios de macros calculados por fórmula (Mifflin-St Jeor — determinística, no LLM). Las marcas por ficha que el filtro necesita (origen animal, lácteo, gluten) se derivan por regla declarativa en la curación — misma maquinaria que los genéricos de la DT-13.
3. **Aislamiento real por workspace:** ya existe estructuralmente (subcolecciones por owner desde v1); en v2 se endurece con security rules por uid + el contexto del perfil viaja SOLO en la llamada de ese usuario. Sin contaminación cruzada por construcción.
4. **El esquema de recomendación (movido acá desde la v1, decisión 31/08/2026):** la v1 muestra solo lo medido; toda recomendación llega en v2 y **se deriva siempre de los nutrientes y calorías del plato** (principio de Tomás: todo se basa en eso). La base ya está construida y dormida: las 6 reglas v1 con umbrales OPS citados (`config/recommendation_rules.json`, publicadas por el seeder, DT-6 pendiente de calibrar). En v2 se enriquece con fuentes declaradas y citables, mismas reglas de honestidad que la OPS: **(a)** OMS — "Alimentación sana" (https://www.who.int/es/news-room/fact-sheets/detail/healthy-diet) · **(b)** Academia Española de Nutrición y Dietética — dieta del deportista (https://www.academianutricionydietetica.org/nutricion-deportiva/dieta-deportista/) · **(c)** Ministerio de Sanidad de España — pesos de raciones por grupo y frecuencias recomendadas, SENC 2004 (`datasets/alimentacionSaludable-ministerio-sanidad.pdf`) — la pieza clave para armar planes con raciones concretas. La recomendación contextual completa: perfil + historial del día → "Vas 40 g de proteína abajo de tu target; esta cena te viene perfecta", y **planes por perfil** repartidos entre las comidas declaradas, con platos del propio catálogo (el LLM compone, la DB cuantifica — como siempre).
5. **"Qué me conviene comer hoy":** endpoint `suggest` — perfil + calendario de entrenamiento + lo ya comido → sugerencia de dieta del día con platos y cantidades, grounded en `foods/` (el mismo patrón: el LLM compone, la DB cuantifica).
6. **Paywall:** Stripe + claim `premium` en el token de Firebase Auth; los endpoints v2 lo verifican server-side.

7. **Unit economics y esquema de tiers (definido por Tomás el 01/09/2026 — el alcance de premium se decide desde el negocio, margen objetivo 70 %):**
   - **Costo por foto (MEDIDO en el E2E real de la WS05):** ~$0,0075 — 2.733 tokens de entrada + 123 de salida a Sonnet 5 ($2/$10 por millón) ≈ $0,007, más ~$0,0002 de GCP (el 3 %). Número de planificación: **$0,01/foto**.
   - **Costo por plan de dieta diario (v2, estimado):** ~$0,025 con Sonnet 5 · **~$0,012 con Haiku 4.5 redactando** sobre los números ya calculados (el patrón de siempre) — el plan usa Haiku.
   - **Los tres tiers (todos los cupos en `config/`, ajustables sin deploy; cupo MENSUAL como garantía + tope diario como ráfaga):**
     · **La escalera habla sola: 15 → 40 → 150 fotos/mes.** ⚠️ El cupo que se comunica es el MENSUAL (un "3/día" gratuito promete 90/mes potenciales y deja al premium de 40 pareciendo menos — el error lo cazó Tomás el 01/09); el tope diario es solo anti-ráfaga interno.
     · **Gratuito:** cupo **15 fotos/mes** (tope de ráfaga 3/día) · peor caso €0,11/mes · es el funnel, no inventario publicitario.
     · **Premium €12/año (pago único):** cupo **40 fotos/mes** (ráfagas hasta 5/día) + historial completo · neto tras Stripe €0,96/mes · peor caso $0,30 → **margen 71 % garantizado**.
     · **Premium Gold €4,99/mes:** cupo **150 fotos/mes** (ráfagas hasta 15/día) + **plan de dieta diario según rutina** (el diferenciador — no entra en €12/año) + tendencias · neto €4,67 · peor caso $1,49 → **margen 70 % garantizado**, realista ~85 %.
   - **Sostener a los gratuitos (la cuenta honesta):** cada gratuito activo cuesta ~€0,08/mes realista (techo duro €0,11 por el cupo de 15). 1 Gold sostiene 6-8 gratuitos; 1 anual sostiene ~2. El 70 % del negocio ENTERO exige ~10-12 % de conversión; con la conversión típica de freemium (3-5 %) el margen total queda en ~25-40 % — rentable siempre (los cupos impiden lo negativo por diseño), y a escala chica el costo absoluto es ruido (1.000 gratuitos activos ≈ €100/mes peor caso).
   - **Ads: NO, en ningún tier (decisión 01/09/2026).** AdSense rechazaría la PWA por "thin content" (la lección del Prode); AdMob no sirve para PWAs (solo apps de store, vía TWA sería v2+); y el número no justifica: un gratuito genera €0,05-0,15/mes de ads — ruido hasta decenas de miles de activos. No se construye sitio web para ads. Candidata v2+: empaquetar TWA en Play Store + AdMob, condicionada a escala.
   - Palancas si el volumen crece: prompt caching del escaneo (~−25 %/foto), compresión de imagen ya hecha.

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
