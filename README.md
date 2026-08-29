# NutriScann

Sacá una foto de tu plato y conocé su valor nutricional al instante: calorías,
macronutrientes y una recomendación en una línea.

## Cómo funciona

El análisis pasa por tres etapas, y ninguna le pide números al modelo de memoria:

1. **Identificar** — Claude Sonnet 5 mira la foto y dice *qué* alimentos hay y
   *cuántos gramos*. Su esquema de salida no tiene campos de calorías: no puede
   inventarlas.
2. **Cuantificar** — el backend busca cada alimento en el catálogo nutricional
   (derivado de USDA FoodData Central) y hace la aritmética. Sin modelo de por
   medio. Cada número es trazable a su fuente.
3. **Recomendar** — con los números ya calculados y las reglas de negocio de la
   base de datos, el modelo redacta una sola frase accionable.

## Estructura

```
apps/web/     PWA: captura, animación de escaneo, reporte visual
functions/    Cloud Functions v2: el motor de análisis
kb/           Pipeline de la base de conocimiento (fuente de verdad del catálogo)
```

## Desarrollo

```bash
npm run install:all
npm run dev
```

Requiere Node 22+ y la CLI de Firebase autenticada.

## Documentación

- [`docs/PLAN.md`](docs/PLAN.md) — plan maestro: arquitectura, fases y roadmap.
- [`docs/DEUDAS.md`](docs/DEUDAS.md) — lo pendiente, con dueño y orden de destrabe.
- [`CLAUDE.md`](CLAUDE.md) — reglas y convenciones de trabajo.

## Estado

**Fase 0 — Fundaciones, cerrada.** La app está desplegada y el pipeline publica solo
en cada merge a `main`. El backend espera a que se active el plan Blaze del proyecto
(deuda DT-1). Sigue la **Fase 1**: la base de conocimiento.
