# NutriScann — instrucciones del proyecto

Una foto del plato → un reporte nutricional visual con una recomendación en una
línea. Dos interacciones de UX; arquitectura seria detrás.

**Documentación (toda dentro del repo, versionada):**
- `docs/PLAN.md` — plan maestro: alcance, arquitectura y fases. **SSOT.**
- `docs/DEUDAS.md` — lo que falta, con dueño. Se cierra editando la fila, no borrándola.
- Este archivo — reglas y convenciones de trabajo.

## Mecánica de sesión: toda fase abre con un Bloque 0

**Una sesión = una fase. Toda fase arranca con un Bloque 0 de investigación, y
recién con lo medido se definen las cards.** Nunca al revés.

El Bloque 0 no es leer el plan: es **medir la realidad** — abrir los datos, contar
filas, correr el código, mirar el esquema. El plan dice qué queremos; el Bloque 0
dice con qué contamos de verdad. Cuando los dos difieren, gana lo medido y las
cards se redefinen antes de escribir una línea.

Al abrir la sesión, Claude expone el resultado del Bloque 0 y la lista de cards
propuesta, y **espera el OK de Tomás antes de ejecutar**. Recién ahí se avanza
card por card ("perf" = seguir con la siguiente).

**Por qué:** planificar sobre supuestos produce cards que hay que rehacer. Una
suposición cuesta barata cuando se mide antes y cara cuando se descubre a mitad
de la implementación.

## Reglas duras

1. **Nada hardcodeado.** Umbrales, textos de la interfaz y reglas de recomendación
   viven en Firestore (`config/app`) y se editan sin desplegar. Los valores en el
   código son solo arranque en frío y la respuesta declara cuándo se usaron.
2. **El modelo identifica, la base de datos cuantifica.** El LLM nunca devuelve
   calorías ni macros: su esquema de salida no tiene esos campos. Los números
   salen de `foods/` y de aritmética. Cada valor del reporte es trazable a su
   fuente USDA.
3. **La fuente de verdad del catálogo es `kb/`, no Firestore.** Firestore es una
   copia derivada. El catálogo se edita en el repo y se publica con el seed; nunca
   a mano en la consola.
4. **Secretos en Secret Manager.** La API key de Anthropic jamás en el repo ni en
   el navegador. El cliente nunca llama a Anthropic: llama a nuestro backend.
5. **Un solo camino a producción:** merge a `main` → GitHub Actions. Nada de
   `firebase deploy` a mano salvo emergencia declarada.
6. **Un alimento retirado se marca `deprecated`, no se borra.** El re-seed es un
   re-escaneo, no un DELETE.

## Stack

| Pieza | Elección |
|---|---|
| Frontend | React 19 + Vite + Tailwind 4, PWA mobile-first → Firebase Hosting |
| Backend | Cloud Functions v2, Node 22, TypeScript, región `europe-west1` |
| Datos | Firestore (nativo) + Cloud Storage para las fotos |
| Modelo | `claude-sonnet-5` con salida estructurada (`output_config.format`) |
| Proyecto | `nutriscann-f809e` |

## Gotchas

- **Sonnet 5 rechaza `temperature` y `top_p`** con error 400. No los incluyas en
  ninguna llamada. Tampoco `budget_tokens` — la profundidad se controla con
  `output_config.effort`.
- **Sin workspaces de npm.** Cada paquete instala lo suyo (`npm run install:all`).
  El hoisting de workspaces rompe el empaquetado de Cloud Functions.
- **Cloud Functions y Secret Manager requieren plan Blaze.** Hosting y Firestore
  funcionan en Spark.
- Los .zip de USDA (1,1 GB) viven en la carpeta padre del repo, fuera de git.
  `kb/sources.json` los declara con su sha256.

## Comandos

```bash
npm run install:all   # instalar todo
npm run dev           # frontend en local
npm run lint          # chequeo de tipos (web + functions)
npm run build         # compilar ambos
npm run emulators     # suite local de Firebase
```

## Convenciones de trabajo

Branch por fase (`fase/NN-descripcion`), commits atómicos, QA al cierre.
**Merge a `main` solo con OK explícito de Tomás.**
Explicar en cristiano: Tomás no es técnico.

Lo que se descubre y queda fuera de alcance va a `docs/DEUDAS.md` con dueño,
no a un comentario `TODO` en el código.
