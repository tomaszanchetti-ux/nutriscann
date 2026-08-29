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
