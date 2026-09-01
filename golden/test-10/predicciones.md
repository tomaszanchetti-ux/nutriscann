# Predicciones — card 2.4 · test fundamental de confianza

Escritas **antes** de bajar ninguna foto y antes de llamar al backend.
Catálogo consultado: `kb/build/foods.canonical.json` (1.022 fichas, kb 3.0.0+b2b227e1).
Motor leído: `functions/src/engine/{match,analyze,constants,normalize}.ts`.

## Cómo funciona la cascada (lo que condiciona cada predicción)

1. **Exacto EN** contra `names.en` normalizado → `confianza_match = 1,0`.
2. **Exacto ES** contra `names.es` (confianza 1,0) o un alias curado (0,5–1,0).
3. **Difuso** por secuencia de palabras, dos direcciones, techo `0,6 × cobertura × conf_término`,
   cobertura mínima 0,30.
4. Ficha `generic: true` → **× 0,85**.
5. `confidence` final mostrada = `confianza_visión × confianza_match`.

**El sesgo que atraviesa todo el test:** el prompt de visión (`analyze/vision.ts`)
le pide al modelo el **inglés genérico de USDA** y le prohíbe explícitamente el
nombre de plato regional ("preferí `beef steak, grilled` antes que `bife de
chorizo`"). O sea: el catálogo curó 1.768 términos en español y el prompt empuja
al modelo a no usarlos nunca. Esa tensión es lo que este test mide.

**Hueco medido de antemano:** en el catálogo **no existe ninguna ficha con la
palabra "breast"** (0 de 1.022). El propio prompt de visión pone `"chicken
breast, grilled"` como ejemplo de lo que debe devolver el modelo. No lo pongo en
la muestra para no gastar una llamada en un resultado ya conocido, pero queda
anotado como hallazgo del Bloque 0.

---

## Los 10 platos

### 01 · Manzana entera (camino EXACTO, alimento simple)
- **Visión debería decir:** `apple, raw` / `apple`, ~150–200 g, conf ≥ 0,9.
- **Ficha esperada:** `fdc-2709215` — *Manzana cruda* (`Apple, raw`, 61 kcal/100 g, no genérica).
- **Vía:** exacto EN (1,0). Riesgo: si dice `apple` a secas, no hay `Apple` suelto → difuso dirección B contra `apple raw` (cobertura 5/9 = 0,56 → 0,33) o contra `apple baked`. **Que un "apple" pelado caiga a difuso sería el hallazgo.**
- **kcal plausibles:** 180 g × 0,61 = **~110 kcal** (rango 70–140).

### 02 · Croissant (camino EXACTO, nombre que es el mismo en los dos idiomas)
- **Visión debería decir:** `croissant`, ~60–70 g, conf ≥ 0,9.
- **Ficha esperada:** `fdc-2707678` — *Croissant* (`Croissant`, 406 kcal/100 g, no genérica, alias *Medialuna*).
- **Vía:** exacto EN (1,0) → conf final ≈ 0,9.
- **kcal plausibles:** 65 g × 4,06 = **~265 kcal** (rango 200–330).

### 03 · Paella (ALIAS / vocabulario español)
- **Visión debería decir:** `paella` (no tiene nombre genérico inglés), ~300–400 g, conf 0,8–0,95.
- **Ficha esperada:** `fdc-2706723` — *Paella* (`Paella, NFS`, 169 kcal/100 g, **genérica**).
- **Vía:** exacto EN si dice `paella, NFS` (improbable) o exacto ES contra `names.es` = 1,0; luego × 0,85 por genérica → **conf_match 0,85**. Riesgo real: que diga `seafood rice dish` o `spanish rice with seafood` → difuso o sin match.
- **kcal plausibles:** 350 g × 1,69 = **~590 kcal** (rango 400–800).

### 04 · Tortilla de patatas (ALIAS curado — el caso que el prompt sabotea)
- **Visión debería decir:** el prompt la empuja a `spanish potato omelette` o `potato omelet`.
- **Ficha esperada:** `manual-tortilla-de-patatas` — *Tortilla de patatas* (136 kcal/100 g, no genérica; `names.en` = `Spanish potato omelette (tortilla de patatas)`; alias *Tortilla española*, *Tortilla de papas*).
- **Vía predicha:** **difuso, no exacto.** `spanish potato omelette` es el principio de `spanish potato omelette tortilla de patatas` (44 caracteres normalizados) → cobertura ≈ 0,52 → conf_match ≈ **0,31**. Si dijera `tortilla de patatas` sería exacto ES 1,0.
- **Riesgo de error real:** que caiga en `fdc-2707198` *Huevo revuelto o tortilla* (185 kcal, genérica) → ficha peor y +36 % de kcal.
- **kcal plausibles:** 200 g × 1,36 = **~270 kcal** (rango 200–400).

### 05 · Lasaña (DIFUSO multi-palabra, familia carbonara)
- **Visión debería decir:** `lasagna with meat sauce`, `lasagna, beef` o `baked pasta with meat and cheese`.
- **Ficha esperada:** `fdc-2708755` — *Lasaña con carne y espinaca* (207 kcal/100 g, alias `Lasaña~0,8`).
- **Vía predicha:** **ninguna vía limpia.** No existe el término suelto `lasagna` en el índice: la dirección A necesita que `lasagna with meat and spinach` esté dentro de la consulta, y la B que la consulta sea el principio de ese nombre. `lasagna with meat sauce` no cumple ninguna → **sin match → composición o `no_catalogado`**. Es exactamente el agujero DT-17 de la carbonara.
- **kcal plausibles:** 300 g × 2,07 = **~620 kcal** (rango 400–800).

### 06 · Risotto (DIFUSO multi-palabra, alias con reserva 0,5)
- **Visión debería decir:** `risotto with mushrooms` / `rice, risotto`.
- **Ficha esperada (la única disponible):** `fdc-2708405` — *Arroz blanco cocido con mantequilla* (147 kcal/100 g, alias `Risotto~0,5`).
- **Vía predicha:** difuso dirección A — `risotto` (7 car.) dentro de `risotto with mushrooms` (22 car.) → cobertura 0,32 → `0,6 × 0,32 × 0,5` ≈ **0,10**. Con visión 0,85 → **conf final ≈ 8 %**, con la ficha razonable. Réplica exacta del hallazgo carbonara.
- **kcal plausibles:** 250 g × 1,47 = **~370 kcal** (real de un risotto de hongos: 350–500).

### 07 · Bife con papas fritas y ensalada (COMBINADO, varios ítems)
- **Visión debería decir:** 3+ ítems — `beef steak, grilled` (~180 g), `potato, french fries` (~120 g), `lettuce/tomato salad` (~80 g).
- **Fichas esperadas:** `fdc-2705824` *Bife* (229 kcal, genérica) · `fdc-2709456` *Papas fritas* (225 kcal, genérica) · lechuga/tomate sueltos.
- **Vía:** mezcla. `beef steak, grilled` no es `Beef, steak, NFS` → difuso; `potato, french fries` tampoco es `Potato, french fries, NFS` → difuso dirección B (cobertura 20/26 = 0,77 → 0,46 × 0,85 = 0,39).
- **kcal plausibles totales:** 180×2,29 + 120×2,25 + 80×0,25 ≈ **~700 kcal** (rango 550–950).

### 08 · Lentejas guisadas (COMODÍN — el martes español)
- **Visión debería decir:** `lentils, cooked` / `lentil stew with chorizo`.
- **Ficha esperada:** `fdc-2707423` — *Lentejas cocidas con sal y grasa* (`Lentils, NFS`, 166 kcal/100 g, **genérica**, alias `Lentejas con chorizo~0,6`).
- **Vía:** difuso dirección B si dice `lentils cooked` (`lentils nfs` no lo contiene… en realidad ninguna de las dos direcciones cierra limpio) → riesgo alto de caer en `fdc-172420` *Lentejas crudas* (352 kcal/100 g). **Ese sí sería un error no forzado caro: el doble de calorías.**
- **kcal plausibles:** 350 g × 1,66 = **~580 kcal** (rango 350–700).

### 09 · Arepa rellena (NO CATALOGADA — verificado)
- **Verificación:** `arepa` = **0 coincidencias** en 1.022 fichas; `corn cake` = 0; `rice cake` = 0. Lo más cercano es `Polenta` (`Cornmeal mush`).
- **Visión debería decir:** `arepa, corn cake` o `cornmeal cake with cheese`.
- **Resultado esperado por diseño:** `match: "no_catalogado"`, `confidence: 0`, `nutrients: null`, y una entrada en `curation_candidates` con motivo `sin_match`.
- **Salvedad honesta:** si la visión devuelve `components` (harina de maíz + queso), el motor **compone** el plato (`match: "compuesto"`, confianza × 0,8) en vez de declararlo sin ficha. Las dos salidas son correctas por diseño; anoto cuál sale.
- **kcal plausibles si compusiera:** ~250 g × 2,0 = **~500 kcal**.

### 10 · NO COMIDA (una bicicleta / un objeto)
- **Resultado esperado:** `is_food: false`, `items: []`, `totals: null`. Sin excepciones, sin ítems inventados.
- **Riesgo:** que el modelo vea un objeto marrón y alucine comida. El prompt es explícito ("no inventás alimentos que no ves").

---

## Lo que este test quiere responder

1. ¿Cuántas de las 10 fichas elegidas son **correctas**, más allá del número que se muestra?
2. ¿La **confianza baja predice el error**, o el sistema acierta mucho más de lo que confiesa?
   La hipótesis previa (carbonara: ficha correcta al 12 %) dice lo segundo.
3. ¿Cuántos platos **no llegan a ninguna ficha** por el hueco DT-17 (término multi-palabra
   que contiene un alias, o alias que el prompt le prohíbe usar al modelo)?
