# Registro de deudas — NutriScann

Lo que sabemos que falta, decidido conscientemente y con dueño. Una deuda que no
está escrita no es una decisión: es un olvido.

Cada deuda se cierra editando su fila a ✅ con la fecha, nunca borrándola: el
registro también sirve para ver qué se destrabó y cuándo.

| id | estado | título | dueño |
|---|---|---|---|
| DT-1 | ✅ cerrada 31/08 (WS04) | Activar el plan Blaze del proyecto: **activado por Tomás** y verificado (`billingEnabled: true`, cuenta `0151E4-2765DB-FC9340`) | Tomás |
| DT-2 | 🔴 abierta (destrabada por DT-1) | Cargar la API key de Anthropic en Secret Manager | Claude + Tomás (la key la carga Tomás) |
| DT-3 | 🔴 abierta (destrabada por DT-1) | Inicializar Cloud Storage y desplegar sus reglas | Claude |
| DT-4 | ✅ cerrada 31/08 (WS04) | Presupuesto de GCP: **creado** — "NutriScann — presupuesto mensual", €10/mes, alertas al 50 % y 90 %, acotado al proyecto | Tomás + Claude |
| DT-5 | 🟡 diferida | Íconos de la PWA (el manifiesto los declara vacíos) | Claude (Fase 3) |
| DT-6 | 🟡 diferida → **v2** | Recalibrar la regla de azúcares (totales vs libres) y el sodio con datos reales de uso; resolver en la UI el caso "el tag acusa y el texto absuelve". *Reencuadrada 31/08: la v1 no muestra recomendaciones (decisión Tomás), así que esta calibración pertenece al esquema de recomendación de la v2* | Claude (v2) |
| DT-7 | ✅ cerrada 30/08 (WS03) | Desambiguar los pares FNDDS/SR de nombre casi igual: **ejecutada** — censo de 137 pares (`kb/selection/dt7.pairs.json`), 8 fusiones, 27 renames bajo "el nombre nunca miente", con candado de regresión. Lo que quedó ambiguo pasó a DT-8 | Tomás + Claude |
| DT-8 | ✅ cerrada 31/08 (WS04) | **7 pares resueltos por decisión de Tomás** (registro completo en `dt7.pairs.json`): los 2 parmesanos se conservan (diferencia real de sodio; de paso se corrigió la porción errónea de 100 g de fdc-171247 → 5 g) · puré de papa fusionado al casero · pepinillos sin cambio (asunto del matcher, Fase 2) · mantequilla NFS conservada bajo la política DT-13 · frijoles y croquetas duplicados idénticos fusionados con herencia de vocabulario | Tomás + Claude |
| DT-9 | 🟡 diferida | Censo de duplicados **intra-fuente**: eran 36 grupos con `per_100g` idéntico dentro del mismo dataset; **la DT-8 ya fusionó 2 de ellos** (frijoles, croquetas) — quedan ~34. La DT-7 solo cubrió los cruzados | Claude (WS05+) |
| DT-10 | 🟡 diferida | Rendimientos de cocción sin fuente suficiente: curado de **lomo** (el par medido es de jamón, 0,784), verdura asada (5 pares en 2 familias que se contradicen) y `hervido` (publicado 1,113 con dispersión 0,71–1,47; ninguna receta lo usa — la que lo necesite declara el suyo). Cada uno desbloquea fichas concretas | Claude |
| DT-11 | 🟡 diferida | **Pulpa de açaí congelada** y **lomo embuchado**: sin derivación defendible (derivar la pulpa del polvo sería elegir la dilución que dé el número esperado). Se resuelven con la cola de curación y uso real | Claude (runtime) |
| DT-12 | 🟡 diferida | El CI corre los candados en frío pero **no** el circuito del emulador del seed (necesita el emulador de Firestore + Java en el runner) | Claude |
| DT-13 | ✅ cerrada 31/08 (WS04) | **Política de genéricos decidida por Tomás y ejecutada**: los nombres quedan matcheables; toda ficha genérica (marcadores NFS / "NS as to" de USDA) lleva `generic: true` (339 fichas — el matcher de la Fase 2 les baja la confianza) y las de sodio ≥ 400 mg/100 g un caveat generado por regla declarativa con su valor real (101 fichas). Regla en `kb/curation/genericos.dt13.json`, candado bidireccional en el build. El censo real resultó mayor que el enunciado original (101 caveats, no 4 casos) | Tomás + Claude |
| DT-14 | 🟡 diferida | Los **9 gemelos de confianza 0,5** (milanesa, cocido madrileño, callos, patatas bravas…) son candidatos naturales a ficha por **receta compuesta** (mecanismo 1.7): pasar de aproximación con reserva a receta real | Claude (WS04+) |
| DT-15 | ✅ cerrada 31/08 (WS04, card 2.1) | El matcher resuelve las colisiones declaradas, verificado adversarialmente: familia "Pastel" (especificidad por tokens), cruce "Catsup" (índices EN/ES separados, el mejor candidato gana y el inglés solo desempata), pepinillos (guarda con excepción "dulces"), "chorizo"/"Bife de chorizo" (guarda de runtime + barrido de 1.022 fichas con determinante: 0 desvíos). Lo que queda de recall difuso (plurales, tokens desordenados) vive en **DT-17** | Claude |
| DT-16 | 🟡 diferida | Alias "Callos" duplicado en `fdc-2706162` (aparece a confianza 1,0 y 0,5 en la misma ficha). Preexistente en `main` desde la Fase 1, detectado por el Q/A de la WS04 | Claude (WS05+) |
| DT-17 | 🟢 núcleo ejecutado 01/09 (WS05, card 2.6) | **El recall EN/ES se ejecutó**: visión bilingüe (`food_es` en el schema), variantes de índice para los marcadores USDA, cobertura por núcleo (el piso 0,30 no se movió), plurales plegados y la regla crudo/cocido preguntada a los datos (entre cruda y cocida gana la cocida solo si la cruda tiene más calorías). Sobre los 17 términos grabados: 5 → 14 matches, cero fichas mal elegidas; barrido de 90 términos: +24 matches, 0 perdidos. Lo que queda vive en DT-26 (curación) y en el texto original: recall y robustez del matching difuso (hallazgos menores del Q/A de la card 2.1, todos con falla cerrada — van a curación, no inventan): **plurales/singulares no matchean** ("pepinillo", "chorizos" → sin match; el hueco de recall más caro en español) · tokens desordenados pueden confundir ("carne pastel" → Tarta a confianza 0,3) · sin techo de gramos (1e12 g se reporta sin reserva — poner un límite de cordura en el endpoint o el engine) · `interpretarVision` (2.2) colapsa "no estimó" y "gramos imposibles" en 0 antes del motor, así que la distinción fina de F5 del engine no puede dispararse desde el pipeline real (las dos salidas son honestas; es granularidad perdida, no un error) · **un término multi-palabra que CONTIENE un alias exacto no dispara la vía del alias** (medido en el primer E2E real, 01/09: "spaghetti carbonara" no encontró el alias "Carbonara" a 0,5 de la ficha correcta; el difuso llegó a la MISMA ficha pero mostró 12 % en vez de ~42 % — el resultado es correcto, la confianza que ve el usuario está injustamente baja) | Claude (v1.1, con datos de la cola de curación) |
| DT-18 | ✅ cerrada 01/09 (WS05, card 2.5) | **`copy` gobernado por el seeder**: `config/copy.json` nace con las 18 claves (5 de la Fase 0 + 13 nuevas), byte a byte con el arranque en frío del front; máscara de 4 → 5 campos, el campo se publica ENTERO (una clave agregada a mano en la consola desaparece en la corrida siguiente — regla 3). Verificado E2E: el pie pasó de "arranque en frío" a "Firestore". ⚠️ Al primer seed real, `scanning_steps` cambia 2 de 3 pasos respecto de lo publicado a mano en la Fase 0 (gana el texto del repo) | Claude |
| DT-19 | 🟡 diferida | Los platos **compuestos** salen con `name_es: null` — el reporte muestra el término de la visión en inglés ("Chicken and pepper skewer"). Decidir el mecanismo del nombre en español (¿la visión lo devuelve bilingüe? ¿se compone de los nombres ES de los ingredientes?) | Claude (Fase 3) |
| DT-20 | 🟡 diferida | La copia de tipos del front (`apps/web/src/lib/types.ts`) no tiene candado contra `functions/src/engine/types.ts` — puede quedar vieja en silencio, a diferencia de las copias de `functions/src/kb/` que sí comparan byte a byte | Claude (WS05) |
| DT-21 | 🟡 diferida | **Los textos son rioplatenses y el mercado inicial es España**: 6 de las 18 claves de `config/copy.json` voseán ("Sacá", "¿Probás", "Revisá", "Acá"). Es una pasada de copy — decisión de producto de Tomás — y gracias a DT-18 se hace editando `config/copy.json` + seed, sin desplegar | Tomás + Claude |
| DT-22 | 🟡 diferida | **Regla dura 1 rota fuera de `copy`**: ~15 textos de usuario hardcodeados en componentes del front (los 5 pares de `BadgeDeMatch`, etiquetas de nutrientes de `AvisoParcial`, "Confianza" y la explicación de ficha genérica en `ItemDelPlato`, "Sin números para este plato" en `PantallaReporte`). Cambiarlos exige deploy. Detectado por el censo de DT-18; requiere tocar `apps/web` | Claude (Fase 3) |
| DT-23 | 🟡 diferida | `report_macros_title` ("De dónde vienen esas calorías") solo se renderiza en el caso borde "sin totales": o le falta lugar en el reporte normal, o el nombre promete más de lo que hace | Claude (Fase 3) |
| DT-24 | 🟡 diferida | **La cola de curación no distingue "no lo tengo" de "no lo supe encontrar"**: en el test de 10 platos, 22 de los 30 términos encolados tenían ficha directa en el catálogo. Con el recall de la card 2.6 el ruido debería bajar; medir de nuevo y, si persiste, anotar en el candidato si el catálogo tenía algo parecido | Claude (v1.1) |
| DT-25 | 🟡 diferida | **`termino_es` no viaja al expediente**: el motor usa el nombre en español de la visión para matchear (card 2.6) pero `EngineItem`/`persistencia.ts` solo guardan `termino_en` — el scan no registra qué dijo la visión en español. Además alimenta a DT-19 (nombre ES de los compuestos) | Claude (WS06) |
| DT-26 | 🟡 diferida | **Huecos de curación en español que el motor nuevo destapó**: falta el alias "Lentejas" (el nombre es "Lentejas cocidas con sal y grasa" → 14 % en vez de 85 %) · "croquetas" gana el alias `Croqueta` de Buñuelo (0,6) sobre "Croquetas de papa" · no hay ficha de limón entero (`lemon` cae en Tarta de limón) · `tortilla, corn` resuelve a Tortilla de trigo (única regresión de la card 2.6; USDA la llama `Tortilla, NFS`) · `bread roll` da Pan en vez de Panecillo (se arregla con un alias) · los nombres USDA de 3+ segmentos (`Spinach, fresh, cooked, fat added…`) siguen fuera del alcance de las variantes. Todo se arregla en `kb/curation/`, nunca en el motor | Tomás + Claude (curación) |

---

## DT-1 · Activar el plan Blaze del proyecto ✅ (31/08/2026)

**Cerrada.** Tomás activó Blaze el 31/08/2026; verificado con `gcloud billing projects
describe` (`billingEnabled: true`). El orden de destrabe previsto se cumplió: DT-4
(presupuesto) se creó el mismo día. Quedan DT-2 y DT-3, y ampliar el objetivo del
pipeline de deploy. Lo que sigue es el registro original de la deuda.

**Qué falta.** El proyecto `nutriscann-f809e` está en plan Spark (`billingEnabled: false`).
Cloud Functions, Secret Manager y Cloud Storage requieren **Blaze** (pago por uso).

**Qué bloquea.** Todo el backend. Sin esto no hay motor de análisis: la Fase 2 no puede
desplegarse y la pantalla de fundaciones seguirá diciendo "Backend no disponible".
La **Fase 1 (base de conocimiento) NO está bloqueada** — se puede construir entera,
porque el catálogo se compila en el repo y Firestore ya existe.

**Por qué no lo hizo Claude.** Vincular una cuenta de facturación es una decisión con
consecuencias económicas: la toma Tomás, no un agente.

**Cómo se destraba.** Consola de Firebase → Configuración del proyecto → Uso y facturación
→ Modificar plan → Blaze, y vincular la cuenta `0151E4-2765DB-FC9340` (ya abierta).

**Costo esperado.** Prácticamente cero con el volumen inicial: el nivel gratuito de Blaze
cubre de sobra el uso de desarrollo. Lo que sí cuesta es la API de Anthropic, ~$0,01 por
análisis, y eso se factura aparte.

**Al destrabarse, en orden:** DT-4 (presupuesto, primero) → DT-2 → DT-3 → desplegar
`health` → ampliar el objetivo del pipeline a `hosting,firestore,storage,functions`
(la línea ya está comentada en `.github/workflows/deploy.yml`).

---

## DT-2 · API key de Anthropic en Secret Manager 🔴

El código ya la declara (`ANTHROPIC_API_KEY` en `functions/src/runtime.ts`) y ninguna
función la usa todavía. Se carga con `firebase functions:secrets:set ANTHROPIC_API_KEY`.
Depende de DT-1.

---

## DT-3 · Inicializar Cloud Storage 🔴

`storage.rules` está escrito y verificado en revisión, pero nunca se desplegó: el bucket
no existe. Se inicializa una vez desde la consola de Firebase. Depende de DT-1.
Hasta entonces, el pipeline no incluye `storage` entre sus objetivos.

---

## DT-4 · Presupuesto de GCP con alertas ✅ (31/08/2026)

**Cerrada el mismo día que DT-1, como estaba previsto** ("un proyecto que puede
facturar sin techo declarado es un riesgo evitable"). Creado vía `gcloud billing
budgets create`: **"NutriScann — presupuesto mensual", €10/mes, alertas al 50 % y
al 90 %**, filtrado solo al proyecto `nutriscann-f809e` (los otros presupuestos de
la cuenta quedaron intactos). Las alertas llegan por correo a los administradores
de la cuenta de facturación.

---

## DT-5 · Íconos de la PWA 🟡

`manifest.webmanifest` declara `"icons": []`. La app se instala igual, pero sin ícono
propio. Se resuelve en la Fase 3, cuando exista identidad visual definitiva.
