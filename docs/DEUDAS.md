# Registro de deudas — NutriScann

Lo que sabemos que falta, decidido conscientemente y con dueño. Una deuda que no
está escrita no es una decisión: es un olvido.

Cada deuda se cierra editando su fila a ✅ con la fecha, nunca borrándola: el
registro también sirve para ver qué se destrabó y cuándo.

| id | estado | título | dueño |
|---|---|---|---|
| DT-1 | 🔴 abierta | Activar el plan Blaze del proyecto | Tomás |
| DT-2 | 🔴 abierta | Cargar la API key de Anthropic en Secret Manager | Claude (tras DT-1) |
| DT-3 | 🔴 abierta | Inicializar Cloud Storage y desplegar sus reglas | Claude (tras DT-1) |
| DT-4 | 🟡 diferida | Presupuesto de GCP con alertas de gasto | Tomás (junto con DT-1) |
| DT-5 | 🟡 diferida | Íconos de la PWA (el manifiesto los declara vacíos) | Claude (Fase 3) |
| DT-6 | 🟡 diferida | Recalibrar la regla de azúcares (totales vs libres) y el sodio con datos reales de uso; resolver en la UI el caso "el tag acusa y el texto absuelve" | Claude (Fases 2-3) |
| DT-7 | ✅ cerrada 30/08 (WS03) | Desambiguar los pares FNDDS/SR de nombre casi igual: **ejecutada** — censo de 137 pares (`kb/selection/dt7.pairs.json`), 8 fusiones, 27 renames bajo "el nombre nunca miente", con candado de regresión. Lo que quedó ambiguo pasó a DT-8 | Tomás + Claude |
| DT-8 | 🔴 abierta | **7 pares ambiguos de la DT-7** esperan decisión de producto: 4 cruzados (parmesano rallado, puré de papa, pepinillos dulces, mantequilla NFS) + 3 duplicados intra-FNDDS con valores idénticos. Evidencia en `dt7.pairs.json` | Tomás (WS04) |
| DT-9 | 🟡 diferida | Censo de duplicados **intra-fuente**: 36 grupos con `per_100g` idéntico dentro del mismo dataset. La DT-7 solo cubrió los cruzados | Claude (WS04+) |
| DT-10 | 🟡 diferida | Rendimientos de cocción sin fuente suficiente: curado de **lomo** (el par medido es de jamón, 0,784), verdura asada (5 pares en 2 familias que se contradicen) y `hervido` (publicado 1,113 con dispersión 0,71–1,47; ninguna receta lo usa — la que lo necesite declara el suyo). Cada uno desbloquea fichas concretas | Claude |
| DT-11 | 🟡 diferida | **Pulpa de açaí congelada** y **lomo embuchado**: sin derivación defendible (derivar la pulpa del polvo sería elegir la dilución que dé el número esperado). Se resuelven con la cola de curación y uso real | Claude (runtime) |
| DT-12 | 🟡 diferida | El CI corre los candados en frío pero **no** el circuito del emulador del seed (necesita el emulador de Firestore + Java en el runner) | Claude |
| DT-13 | 🔴 abierta | **Naming de los genéricos NFS** (`Frijoles`, `Mantequilla`, `Queso`, `Salchicha`): traen sal/grasa que el nombre no declara, pero son los que debe matchear una foto genérica. Política de producto, no de curación | Tomás (Fase 2) |
| DT-14 | 🟡 diferida | Los **9 gemelos de confianza 0,5** (milanesa, cocido madrileño, callos, patatas bravas…) son candidatos naturales a ficha por **receta compuesta** (mecanismo 1.7): pasar de aproximación con reserva a receta real | Claude (WS04+) |
| DT-15 | 🟡 diferida | El matching de la Fase 2 debe resolver las colisiones de vocabulario declaradas (p. ej. "Pastel" a secas es alias de Tarta; el pastel brasileño vive en "Pastel brasileño" a 0,6) | Claude (Fase 2) |

---

## DT-1 · Activar el plan Blaze del proyecto 🔴

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

## DT-4 · Presupuesto de GCP con alertas 🟡

Antes de que exista tráfico real conviene un presupuesto con alerta por correo. Está
previsto en la Fase 4, pero **el momento correcto para crearlo es junto con DT-1**:
un proyecto que puede facturar sin techo declarado es un riesgo evitable.

---

## DT-5 · Íconos de la PWA 🟡

`manifest.webmanifest` declara `"icons": []`. La app se instala igual, pero sin ícono
propio. Se resuelve en la Fase 3, cuando exista identidad visual definitiva.
