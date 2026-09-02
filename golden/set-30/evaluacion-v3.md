# Evaluación de la TERCERA CORRIDA — golden set de 30 (motor con DT-28 · catálogo 3.4.0)

**Qué se evaluó.** Las 30 respuestas de `respuestas-v3/NN-*.json`
(`kb 3.4.0+1c2270c1`, 1.112 fichas, `claude-sonnet-5`) contra `predicciones.md` y
`criterios.json`, con las mismas definiciones que usaron `evaluacion.md` (v1) y
`evaluacion-v2.md` (v2). La corrida se hizo contra el emulador local con el catálogo
3.4.0 sembrado (`npm run kb:seed:local`) y verificado en la meta de cada respuesta.
**30 llamadas, 30 HTTP 200, cero reintentos.**

**Qué cambió respecto de la v2, y por eso este informe no es comparable línea a línea
con el anterior:**

1. **El criterio 2 está recalibrado** (DT-28, punto 4). El rango escrito ya no se
   compara contra los kcal a secas: se lleva a los gramos que la visión reportó con una
   regla de tres. La lógica vive en `functions/src/engine/golden.ts` y **no se tocó en
   esta card**; acá solo se la corrió.
2. **El catálogo pasó de 1.022 (3.1.0) a 1.112 fichas (3.4.0)** — cards 6.2, 6.3 y 6.4.
   Nueve de los diez silencios de la v2 dependían de eso.

**Qué NO se evaluó.** Nada de front. Una foto por plato (la estabilidad se mide contra
la corrida anterior, no repitiendo la misma foto). La cola de curación sigue sin poder
contarse: las respuestas no traen el campo.

**Denominadores.** 26 platos de comida (01–09, 11–27) · 66 ítems de comida · 68 ítems
en total con los 2 del plato 28. Idénticos a v1 y v2.

**Convención de marcado.** La misma: 🟡 "aproximada razonable" **no** es ❌; "ficha
equivocada" = **nutrientes sustancialmente distintos del alimento real**. Donde el
criterio escrito no decide el caso, va marcado **[interpretación]**.

**Costo real de la corrida: USD 0,251** (99.701 tokens de entrada · 5.133 de salida,
a 2/10 USD por millón), más USD 0,007 del curl de humo previo. **Total ≈ USD 0,26.**

---

## 0 · El titular

**Los cinco criterios pasan. 5 de 5.** Era 1 de 5 en la v1 y 3 de 5 en la v2.

| # | Criterio | v1 | v2 | **v3** | Umbral | v1 | v2 | **v3** |
|---|---|---|---|---|---|---|---|---|
| 1 | Ítems con ficha correcta | 39/66 = 59,1 % | 48/66 = 72,7 % | **53/66 = 80,3 %** | ≥ 75 % | FALLA | FALLA | **PASA** |
| 2 | Platos con kcal en rango | 20/26 = 76,9 % | 23/26 = 88,5 %\* | **23/26 = 88,5 %** | ≥ 80 % | FALLA | PASA\* | **PASA** |
| 3 | Fichas equivocadas ≥ 0,60 | 0 (máx 0,51) | 0 (máx 0,203) | **0 (máx 0,208)** | 0 | PASA | PASA | **PASA** |
| 4 | Negativos bien manejados | 3/4, 1 ❌ | 4/4, 3 ✅ + 1 🟡 | **4/4, 3 ✅ + 1 🟡** | 4/4, ≥3 ✅ | FALLA | PASA | **PASA** |
| 5 | Silencio sobre comida catalogada | 11/66 = 16,7 % | 5/66 = 7,6 % | **1/66 = 1,5 %** | ≤ 10 % | FALLA | PASA | **PASA** |

\* El 88,5 % de la v2 es el número recalculado por la herramienta de la card 6.1 sobre
la corrida v2 con el criterio 2 recalibrado. Con la vara vieja la v2 daba 76,9 % y
FALLABA. **La v2 no pasaba tres criterios el día que se la midió: pasa tres con la vara
de hoy.** Los dos números están en el tablero y se aclara cuál es cuál.

**Juicios por plato:** v1 **17 ✅ · 8 🟡 · 5 ❌** → v2 **21 ✅ · 9 🟡 · 0 ❌** →
**v3 24 ✅ · 6 🟡 · 0 ❌**.

**Y hay que decir la contracara en la misma línea que el titular:** de los 5 criterios,
**dos pasan gracias a decisiones que se tomaron sobre la vara y no sobre el producto**
(el criterio 2 se recalibró; el criterio 4 depende de una interpretación heredada), y
**el criterio 3 se salva de una discusión de nombre por un pelo** — hay una ficha
mostrada al 85 % con el nombre equivocado y los números correctos (§4, plato 08). Todo
está desglosado abajo.

---

## 1 · Advertencia previa: la visión se movió, y sigue decidiendo juicios

Medido con la herramienta de la card 6.1 (`compararCorridas`, tolerancia de gramos
±30 %):

| | v1 → v2 | **v2 → v3** |
|---|---|---|
| platos idénticos | 13 de 30 | **16 de 30** |
| platos movidos | 17 de 30 | **14 de 30** |
| con ítems distintos | 17 | **14** |
| con gramos movidos ±30 % | 3 | **1** |
| con veredicto `is_food` distinto | 0 | **0** |
| salto absoluto promedio del total | 8,5 % | **10,8 %** |

**Se movió un poco menos en cantidad de platos y un poco más en calorías.** Los peores
saltos del total: **03 paella +33,3 %** · **20 ensalada +31,3 %** · **27 bocadillo
+28,1 %** · **15 tostadas +16,7 %** · **08 lentejas +13,3 %**.

Los 14 platos que se movieron, y qué escribió distinto la visión:

| # | v2 → v3 | Efecto sobre el juicio |
|---|---|---|
| 03 | `seafood rice, paella style` → **`seafood paella`** | Entra el alias nuevo `Paella de marisco` (0,8): conf. 0,121 → **0,578**. |
| 05 | `meat and cheese, baked` → **`meat and spinach ricotta`** | **Hunde la cobertura y dispara la compuerta: el plato deja de publicar total.** Ver §3.05. |
| 06 | `yellow rice with saffron` → `yellow saffron rice` | Mismo resultado exacto (0,244, 246,4 kcal). |
| 08 | `saltine crackers`→`crackers` · `flour tortilla`→**`flatbread`** · `lime` 40→60 g | **El `flatbread` es el único ❌ nuevo de ítem del set.** |
| 12 | `segments` → `sliced` | Sin efecto. |
| 15 | `toasted white bread` → `white bread, toasted`; 60→70 g | Sin efecto de juicio. |
| 18 | `cured ham, serrano` → **`serrano ham`** | Sigue llegando a *Jamón crudo* por el alias (0,64). |
| 20 | 6 → **7 ítems** (vuelve la remolacha); `shredded`→`raw` | **7 de 7 con ficha.** |
| 21 | `chicken meat, boiled` → **`chicken breast, boiled`** | Entra la ficha nueva *Pechuga de pollo*. |
| 22 | desaparece `cream cheese`; 7 → 6 ítems | **6 de 6 con ficha.** |
| 23 | `braised with sauce` → `with brown sauce, grilled`; `tomato slice` → `carrot, cooked` | 5 de 7 con ficha, 2 silencios. |
| 26 | `breaded and fried` → `fried` | Mismo resultado (0,361). |
| 27 | `(calamari on bread roll)` → **`(bocadillo de calamares)`** | **La hipótesis del `names.en` se re-probó y se cumplió.** |
| 28 | ítems reescritos | Sin cambio de juicio. |

**Lo atribuible al motor y al catálogo sin discusión** son los términos que salieron
**literalmente iguales** en v2 y v3 y dieron distinto:

| término (idéntico en v2 y v3) | v2 | v3 | Causa |
|---|---|---|---|
| `chicken thigh, roasted` (17) | `no_catalogado` | **`fdc-2705930` Pollo con piel, 0,248** | **Motor** (cola descriptiva, DT-28 punto 1) |
| `cucumber, sliced` (22) | `no_catalogado` | **`fdc-168409` Pepino crudo, 0,54** | **Motor** (cola `with peel`) |
| `cabbage, cooked` (21) | `no_catalogado` | **`fdc-2709889` Repollo cocido sin grasa, 0,298** | **Catálogo** (ficha nueva DT-33) |
| `spaghetti, cooked` (24) | `no_catalogado` | **`fdc-2708357` Pasta cocida, 0,32** | **Catálogo** (ficha nueva DT-33) |
| `beer` ×2 (27) | `no_catalogado` | **`fdc-168746` Cerveza, 0,85** | **Catálogo** (ficha nueva DT-27) |
| `cured ham, serrano/iberico` (16) | Jamón cocido, 0,203 | **Jamón cocido, 0,208** | **Nada cambió.** Ver §6. |

---

## 2 · El candado de aritmética

Se verificaron **los 30 platos**: para cada ítem con ficha,
`per_100g(respuesta) == per_100g(catálogo)`, `grams × per_100g / 100 == nutrients`; y
para cada plato, `suma(items) == totals`.

**68 ítems · 66 con ficha · 66 correctos · 0 discrepancias de `per_100g` · 0 de ítem ·
0 de total.** Los 66 `food_id` existen en las 1.112 fichas del 3.4.0.

**La capa de cálculo sigue sin ser el problema, tercera corrida consecutiva.**

Los dos platos que no publican total (05 y 28) lo hacen con los **ocho nutrientes en
`null` y `total_no_publicable: true`** — el reparo abierto de la v2 ("las 1.550,4 kcal
de plástico siguen en el JSON") **está cerrado y verificado en el payload**.

---

## 3 · Los 30 platos, uno por uno

### 01 · Manzana — ✅
`apple, raw` → `fdc-2709215`, exacto **0,95**, 180 g → **109,8** (rango 70–140).
Idéntica a v1 y v2. Tercera corrida igual.

### 02 · Croissant — ✅
`croissant` → `fdc-2707678`, exacto **0,95**, 70 g → **284,2** (200–330). Idéntica.

### 03 · Paella — ✅ (igual que v2, y por fin por el motivo correcto)
`seafood paella` → `fdc-2706723` **Paella**, **alias `Paella de marisco` (0,8)** →
confianza **0,578**, 600 g → **1.014 kcal** (rango ajustado 685,7–1.371,4).

**En v2 este plato entraba por la visión (450 g) con confianza 0,121. Ahora entra por
el catálogo, con la confianza casi quintuplicada.** El alias `Paella de marisco` (0,8)
es de la card 6.4 y se verificó en el 3.4.0. La visión volvió a decir 600 g como en v1,
y con el criterio recalibrado eso ya no lo saca de rango.

### 04 · Tortilla de patatas — ✅ (era 🟡 en v1 y v2)
`Spanish potato omelette` → `manual-tortilla-de-patatas`, exacto **0,95**, 600 g →
**816** (rango ajustado 600–1.000). Ficha perfecta.
**El 🟡 de las dos corridas anteriores era del criterio, no del plato:** el rango
escrito se calculó sobre 450 g y la visión mide 600 g de tortilla entera, tres corridas
seguidas. Con la recalibración el plato queda donde siempre debió estar.

### 05 · Lasaña — 🟡 **[interpretación]** — **LA ÚNICA REGRESIÓN DEL SET** (era ✅)
`lasagna, meat and spinach ricotta` → `fdc-2708755` **Lasaña con carne y espinaca**
(la ficha exacta que el ✅ escrito pedía), difuso **0,084**, 350 g.

**Y el plato no publica total:** `completo: false`, `total_no_publicable: true`, los
ocho nutrientes en `null`, `macro_pct: null` y el motivo al usuario *"Ningún alimento de
esta foto se identificó con confianza suficiente: el mejor llegó al 8.4 % y el mínimo
para publicar un total es 12 %"*.

**La ficha es la correcta y la aritmética existe; lo que falta es la confianza.** La
compuerta de la card 2.8 (`CONFIANZA_MINIMA_PARA_UN_TOTAL = 0,12`) está haciendo
exactamente lo que se le pidió, sobre el plato equivocado.

**Causa raíz, medida:** la visión escribió un nombre cada vez más largo en las tres
corridas y la cobertura se hundió con él —
v1 `lasagna with meat sauce and spinach ricotta` → alias `Lasaña` (0,8), conf. **0,68** ·
v2 `lasagna, meat and cheese, baked` → difuso, **0,144** ·
v3 `lasagna, meat and spinach ricotta` → difuso cobertura 0,21, **0,084**.
**Visión** que dispara un límite del motor: el difuso castiga por describir bien, que es
la causa C que `predicciones.md` había anotado y que sigue viva para los nombres largos.

Queda **🟡** y no ❌ porque la ficha es la correcta y el motor **declara** que no
publica en vez de publicar un número flojo — es el comportamiento que el proyecto pidió.
Pero **al usuario le queda una lasaña sin calorías**, y eso es peor producto que la v2.

### 06 · Risotto — ✅ (era ❌ en v1, 🟡 en v2)
`yellow saffron rice, cooked` → **`fdc-2708419` Arroz amarillo cocido**, difuso
**0,244**, 280 g → **246,4 kcal** (rango ajustado 218,8–455).
**Exactamente el mismo número que la v2**, y ahora entra: los 3,6 kcal que lo dejaban
afuera eran del rango escrito sobre 320 g, no del motor. El motivo de nombre partido
sigue publicándose.

### 07 · Bife con papas y ensalada — ✅
5 ítems, **5 con ficha**, total **923,9** (ajustado 683–1.138,4), `completo: true`.
Bife 0,434 ✅ · Papas fritas 0,808 ✅ · Coleslaw 0,85 ✅ · Kétchup 0,9 ✅ ·
`gravy, brown sauce` → *Salsa mexicana* (34) 🟡 — **tercera corrida perdiendo contra
`fdc-2707149` Salsa de carne (53)**. Son 13,6 kcal sobre 924.

**Dato nuevo del replay:** jugando **solo el término inglés**, `gravy, brown sauce`
resuelve a *Salsa de carne* (0,176), que es la ficha correcta. Lo que lo lleva a *Salsa
mexicana* es el término **español** que escribió la visión, que gana por confianza. Ver
§7, hallazgo B.

### 08 · Lentejas guisadas — 🟡 **[interpretación]** (era ✅)
6 ítems, **6 con ficha**, total **1.265,65**, `completo: true`, 635/635 g.
Rango ajustado 828,3–1.380,4 → **en regla**. El ✅ escrito pedía ≥3 de 5 con ficha y
750–1.250: las fichas sobran y el total se pasa del techo **escrito** por 15,65 kcal
(1,3 %), que la recalibración absorbe.

**Se resuelve 🟡 por dos ítems, y los dos son hallazgos:**

- **`flatbread` → `fdc-2708157` *Galletas de pan plano* (`Crackers, flatbread`,
  412 kcal/100 g), 0,191. Es la tortilla de maíz de la foto.** La tortilla real está
  fichada desde la card 6.2 (`fdc-2707823`, 218 kcal/100 g): **el número publicado es
  +89 % sobre el alimento real** (123,6 kcal contra ≈ 65). Al nivel de ítem es **ficha
  equivocada**, y así se cuenta en el criterio 1. Confianza 0,191, muy por debajo de la
  condición dura. **Causa: visión** (describió una tortilla como `flatbread`) **+
  catálogo** (`flatbread` = 3 coincidencias y la única literal es una galleta; no hay
  ficha de pan plano genérico, aunque sí de pita, `fdc-2707616`).
- **`lime` → `fdc-167746` *Limón* (29 kcal/100 g) por coincidencia EXACTA en español,
  confianza 0,85.** Existe `fdc-168155` *Lima cruda* (30 kcal/100 g), y jugando el
  término inglés a secas el motor llega a ella (0,3). **Lo que ganó fue el nombre
  español que escribió la visión, que tradujo `lime` como "limón".** Nutricionalmente
  29 contra 30 es equivalente —por eso **no** se cuenta ficha equivocada y el criterio 3
  no se rompe—, pero **al usuario español se le muestra "Limón" sobre una lima, al
  85 %**. Es el problema del manchego dado vuelta: los números bien, el nombre mal.
  **Causa: visión** (traducción), **agravada por el diseño de `buscarConDosNombres`**:
  cuando los dos idiomas apuntan a fichas distintas gana el más confiado, y un exacto
  español de 1,0 aplasta a un difuso inglés de 0,3 aunque el inglés sea el correcto.
  Ver §7, hallazgo B.

Los otros cuatro: `lentil stew with meat` → *Lentejas cocidas* ✅ (**la trampa cara
sigue sin morder** por tercera vez: nunca eligió *Lentejas crudas*) · `bread roll` →
*Pan* (267 vs *Panecillo* 279) 🟡 (DT-26, sigue vivo) · `crackers` → *Galletas saladas*
✅ · `hot sauce` → *Salsa* 🟡.

**Lectura alternativa, dicha en voz alta:** por la letra del criterio escrito el plato
es **✅** (6 de 6 con ficha, total en regla con la vara recalibrada). Se resuelve 🟡
porque un ítem publica +89 % y otro muestra el nombre equivocado al 85 %, y ninguna de
las dos cosas debería esconderse detrás de un total que da bien.

### 09 · Arepa — ✅ (el hueco se tapó; **el criterio quedó obsoleto**)
`corn arepa with cheese, grilled` → **`fdc-168070` Arepa** (`Restaurant, Latino, arepa`,
219 kcal/100 g), difuso **0,232**, 150 g → **328,5 kcal**.

**Este plato existía para medir un silencio honesto sobre un hueco real, y el hueco ya
no existe.** La card 6.2 fichó la arepa (DT-27) después de medir que la premisa "sin
ficha USDA posible" era falsa. La ficha es la correcta y el número es razonable para una
arepa rellena de 150 g.

**Pero `criterios.json` sigue diciendo que el acierto es no publicar un total**
(`gramos_previstos: null`, con la nota de la convención de `evaluacion.md`), así que
**el criterio 2 lo cuenta fuera de rango por publicar el número correcto.** Al nivel de
ítem cuenta ✅; al nivel de plato el criterio se quedó viejo. **Causa: criterio.**
Es una de las tres pérdidas del criterio 2 y la única que se arregla editando un JSON.

### 10 · Bicicleta — ✅
`is_food: false`, `items: []`, `totals: null`, mensaje al usuario. Tercera corrida.

### 11 · Plátano — ✅
`banana, raw` → `fdc-173944`, exacto **0,98**, 120 g → **106,8** (85–160). Idéntico.

### 12 · Naranja — ✅
`orange, peeled, sliced` → `fdc-169097`, difuso **0,285**, 180 g → **84,6**
(ajustado 54–120). Sigue el reparo de producto de las dos corridas anteriores: **una
naranja obvia se muestra al 28,5 %**, porque la única vía es el alias español y el
`names.en` lleva la cola `, all commercial varieties`.

### 13 · Dos huevos fritos — ✅
`fried egg` → `fdc-2707155` *Huevo frito*, alias **0,808**, 110 g → **203,5** (140–300).

### 14 · Queso manchego — 🟡 (igual que v1 y v2)
`manchego cheese, sliced` → `fdc-2705730` *Queso parmesano en trozo* vía el alias
`Queso manchego` (0,5) → confianza **0,425**, 90 g → **370,8** (ajustado 240–450).
**La reserva del alias se respeta** (el ❌ escrito era > 0,60) y el total entra en regla
con la vara recalibrada. **El alias `Queso manchego` 0,5 sigue vivo en el 3.4.0** —
verificado — y **el usuario español sigue leyendo "Queso parmesano" sobre un manchego**.
Tercera corrida con el mismo reparo de producto sin resolver.

### 15 · Dos tostadas con manteca — 🟡 (igual que v1 y v2)
Un solo ítem: `white bread, toasted` → *Pan tostado*, alias **0,722**, 70 g → **205,1**
(rango 170–330), `completo: true`.
**La manteca sigue sin aparecer, por tercera vez: la visión no la devuelve.** El motor
no puede declarar incompleto lo que la visión nunca vio, así que publica un
`completo: true` que es falso para la foto. **Hallazgo intacto y ahora con 3 de 3
corridas: no es ruido.**

### 16 · Jamón serrano — 🟡 **[interpretación]** — **el mismo error que en la v2**
`cured ham, serrano/iberico` → **`fdc-2705878` Jamón** (`Ham`, 117 kcal/100 g, que es
jamón **cocido**), difuso **0,208**, 80 g → **93,6 kcal** (rango escrito 100–220).

**El fix de la barra `/` de la DT-28 (punto 2) NO destrabó este plato, y la causa raíz
que la deuda declaró era la equivocada.** La medición, hecha llamando al matcher
directamente contra el 3.4.0 (evidencia, no inferencia):

| consulta | resultado |
|---|---|
| `jamón serrano/ibérico` (español) | `fdc-2705879` **Jamón crudo**, 0,8 — **la barra SÍ se lee como O** |
| `cured ham, serrano/iberico` (inglés) | **SILENCIO** |
| `cured ham, serrano` (inglés, sin barra) | **SILENCIO** |
| `serrano ham` (inglés) | **SILENCIO** |
| **`jamón ibérico`** (español) | `fdc-2705878` **Jamón** (cocido), **0,231** |

**El 0,231 de la última fila es exactamente el `confidence_match` de la corrida**, y el
motivo grabado dice "en español". **La visión escribió `jamón ibérico` en español —sin
la palabra "serrano"— y el motor la mandó al jamón cocido.** No es la barra: es que
**`ibérico` da CERO coincidencias en las 1.112 fichas** y `fdc-2705879` *Jamón crudo*
tiene los alias `Jamón curado`, `Prosciutto` y `Jamón serrano` (0,8) pero **no**
`Jamón ibérico`. **Causa: catálogo (curación).** Es un alias, no un cambio de motor.

El resto del cuadro se repite: al nivel de ítem es **ficha equivocada** (−40 % de las
calorías, York por serrano) y así se cuenta en el criterio 1; por el criterio escrito
queda 🟡 porque el ❌ pedía 2705878 *con confianza alta* y está a 0,208. Y la simetría
con el plato 18 vuelve a probarse dentro de la misma corrida: ahí `serrano ham` llegó a
*Jamón crudo* a **0,64** por el alias español.

### 17 · Pollo con arroz y verduras — ✅ (era ❌ en v1, 🟡 en v2) — **el destrabe más limpio del set**
3 ítems, **3 con ficha**, total **492 kcal** (rango 400–650, factor 1,0),
`completo: true`, 360/360 g.

- **`chicken thigh, roasted` → `fdc-2705930` *Pollo con piel* (196), 0,248.** En v2 este
  término idéntico daba `no_catalogado`; en v1 daba costilla de res. **Es exactamente la
  ficha que `predicciones.md` había escrito.** El motivo cita el nombre completo
  `Chicken, NS as to part and cooking method, skin eaten`: **la normalización de la cola
  descriptiva de USDA (DT-28, punto 1) funcionó, con el término literalmente igual entre
  las dos corridas.** Atribución limpia al **motor**.
- `white rice, cooked` → *Arroz blanco cocido*, exacto **0,765** ✅
- `peas and carrots, cooked` → `fdc-170419` **Arvejas crudas** (81) 🟡 — sigue eligiendo
  la cruda existiendo `fdc-2709962` *Arvejas cocidas* (98), **y lo avisa en el motivo**.
  Reparo abierto desde la v2. Ignora las zanahorias.

**El plato pasó de mentir (v1) a callar (v2) a acertar (v3), y el total entra sin
interpretación.**

### 18 · Huevos rotos con jamón — ✅
3 ítems, **3 con ficha correcta**, total **864,5** (ajustado 683,3–1.025),
`completo: true`. Papas fritas 0,765 · Huevo frito 0,722 · **Jamón crudo 0,64** (alias).
**`receta-huevos-rotos` volvió a no activarse: 0 de 3 corridas.** La ruta de composición
ganó las tres veces. `predicciones.md` decía "si no gana acá, no va a ganar nunca":
**el dato ya está, y es una decisión de producto pendiente sobre las recetas compuestas**,
no un fallo por el criterio escrito.

### 19 · Hamburguesa con papas — ✅ (era 🟡 en v1 y v2)
2 ítems, **2 con ficha correcta**, total **1.243,8** (ajustado 960–1.645,7).
`hamburger with egg and cheese, sesame bun` → *Hamburguesa* (0,207) · Papas fritas
(0,765). El 🟡 de las dos corridas anteriores era del rango escrito sobre 350 g contra
los 480 g que la visión mide; con la recalibración entra.

### 20 · Ensalada mixta — ✅ — **7 de 7 con ficha**
7 ítems, **7 con ficha** (v1: 5 de 7 · v2: 5 de 6), total **324,19** (ajustado 244–488),
`completo: true`, 405/405 g. **Cero silencios: es el primer compuesto del set que cierra
entero.**
Huevo cocido 0,808 ✅ · Atún 0,638 ✅ · Lechuga iceberg 0,85 ✅ · Tomate crudo 0,294 ✅ ·
Zanahorias crudas 0,51 ✅ · y dos 🟡 con causa medida:
- `corn, sweet, cooked` → **`fdc-2709914` Maíz fresco cocido CON grasa (106)**, 0,173.
  **El silencio de la v2 se cerró, pero eligió la variante equivocada:** la card 6.4
  fichó `fdc-2709910` *Maíz fresco cocido SIN grasa* (86) justamente para este caso, y
  tiene el alias `Maíz dulce cocido`. Medido: `maíz dulce cocido` → la sin grasa a
  **1,0**; `corn, sweet, cooked` → la **con grasa** a 0,24. **+23 % sobre el alimento
  real. Causa: catálogo (falta el vocabulario inglés), el límite de la DT-35(b).**
- `beet, pickled` → `fdc-169145` *Remolacha cruda* (44,6), 0,216, **y avisa el crudo en
  el motivo**. Existe `fdc-169966` *Remolacha de lata* (31), que es la ficha del
  encurtido. Medido: ni `beet, pickled` ni `remolacha encurtida` llegan a ella.
  **+44 %, 6,7 kcal absolutos. Causa: catálogo (falta el alias `encurtida`/`pickled`).**

### 21 · Cocido madrileño — ✅ — **7 de 7 con ficha**
7 ítems, **7 con ficha** (v1: 5 · v2: 6), total **1.631,7** (ajustado 1.246,5–2.025,6),
`completo: true`, 670/670 g. **Otro compuesto que cierra entero.**
Garbanzos ✅ · Tocino cocido ✅ · Morcilla ✅ · Chorizo ✅ · Carne de res ✅ · y dos
destrabes:
- **`cabbage, cooked` → `fdc-2709889` Repollo verde cocido SIN grasa (32), 0,298 ✅** —
  término idéntico a v2, donde era silencio. **La ficha nueva de la card 6.4 (DT-33)
  cerró el silencio, y con la variante correcta**: la DT-26 había decidido no colgarlo
  del repollo con grasa (55) porque publicaba un +139 %. **Atribución limpia al catálogo.**
- **`chicken breast, boiled` → `fdc-2705954` Pechuga de pollo (144), 0,357 ✅** — ficha
  nueva de la card 6.2. En v2 el término era otro (`chicken meat`) y caía en la genérica
  *Carne* (215, +38 %).

**La trampa del alias `Cocido madrileño` (0,5) volvió a no dispararse. 3 de 3.**

### 22 · Desayuno completo — ✅ — **6 de 6 con ficha**
6 ítems, **6 con ficha** (v1: 4 · v2: 5), total **677,84** (ajustado 536,2–893,6),
`completo: true`, 420/420 g. **Los dos silencios de la v2 se cerraron:**
- **`baked beans` → `fdc-2707390` Alubias en salsa de tomate (105), exacto 0,9 ✅** —
  ficha nueva de la card 6.2. **El hueco "0 coincidencias" que arrastraban v1 y v2 está
  tapado.** Catálogo.
- **`cucumber, sliced` → `fdc-168409` Pepino crudo con cáscara (15,9), 0,54 ✅** — término
  idéntico a v2. **La cola `with peel` que la v2 identificó como causa raíz ya se
  normaliza.** Motor.

Jamón cocido ✅ (**la simetría con el 16 se cumple por tercera vez: acá `fdc-2705878` es
el acierto**) · Salchicha ✅ · Huevo revuelto ✅ · `rye bread, slice` → *Pan* (267) 🟡 —
**no hay ficha de pan de centeno en las 1.112** (medido: `centeno` = 1 coincidencia y es
el grano); pan real ≈ 259 contra 267, −3 %, hueco honesto.

### 23 · Salmón con guarnición — ✅
7 ítems, **5 con ficha**, total **594,5** (rango 500–900), `completo: false`,
**330/405 g = 81,5 %** → en regla por la cláusula del 70 %.
- `fish fillet with brown sauce, grilled` → `fdc-2706224` *Pescado* (`Fish, NFS`,
  238 kcal/100 g), 0,098. **Dentro de la banda 170–270 que el ✅ escrito pedía, y no cayó
  en *Lomi salmón*.** Tercera corrida sin morder el gemelo más caro del set.
  **Salvedad que hay que decir: la card 6.4 fichó cuatro salmones (`fdc-2706285` Salmón
  274, a la plancha 259, ahumado, crudo) y este plato NO los probó**, porque la visión
  escribió `fish fillet`, no `salmon`. **El destrabe del salmón sigue sin medirse en el
  golden set.**
- Coleslaw ✅ · Pan tostado ✅ · **`apple slices` → Manzana cruda ✅** (el destrabe de
  cortes de la v2, estable) · `carrot, cooked` → Zanahorias cocidas con grasa ✅.
- **Los 2 únicos silencios de toda la corrida** viven acá: `grilled potato slice`
  (existe `fdc-2709403` *Papa asada con cáscara*, 126 — pero es **asada**, no a la
  plancha; la card 6.1 midió que este silencio es correcto) y `grilled green pepper`
  (parcial: hay `fdc-2709799` *Pimientos crudos*, el asado no existe).

### 24 · Espaguetis con albóndigas — ✅
2 ítems, 2 con ficha, **773,2** (ajustado 506,3–843,8).
- **`spaghetti, cooked` → `fdc-2708357` Pasta cocida (157), 0,32 ✅** — término idéntico
  a v2, donde era silencio, **y el caso que la DT-35(b) declaraba bloqueado del lado
  inglés**. El motivo dice *"aproximada en español con «Espaguetis cocidos»"*: **entró
  por el nombre español que escribió la visión, no por el inglés.** El límite de la
  DT-35(b) sigue existiendo en el matcher; lo que pasó es que la visión aportó la otra
  llave. **Catálogo (ficha nueva 6.4) + la vía española.**
- `meatballs with tomato sauce` → *Albóndigas con salsa* 0,396 ✅.
- **El *Plato congelado* (`fdc-2709141`) sigue sin dispararse. 3 de 3.**

### 25 · Gazpacho — ✅
`gazpacho` → `fdc-2710106`, exacto español **0,85**, 300 g → **78** (ajustado 60–108).

### 26 · Croquetas — ✅ (era ❌ en v1, 🟡 en v2)
`croquette, fried` → **`fdc-2709511` Croquetas de papa** (237 kcal/100 g) vía el alias
`Croqueta` (0,5) → confianza **0,361**, 100 g → **237 kcal** (ajustado 185,7–314,3).
**Croquetas reales ≈ 240 kcal/100 g → 100 g = 240; el sistema dice 237: −1,3 %.**
El 🟡 de la v2 era el rango escrito sobre 70 g. **La corrección de daño más grande del
proyecto queda cerrada: de +57 % con el nombre "Buñuelo" (v1) a −1,3 % con el nombre
correcto (v3).**

### 27 · Bocadillo de calamares — ✅ (**el criterio 2 lo saca; ver la salvedad**)
3 ítems, **3 con ficha**, total **836,6**, `completo: true`, 880/880 g.
- `fried squid sandwich (bocadillo de calamares)` → **`receta-bocadillo-de-calamares`**,
  exacto español **0,88**, 220 g → 552,8.
  **La hipótesis de curación de `predicciones.md` se re-probó y se cumplió:** esta vez la
  visión SÍ escribió el nombre regional entre paréntesis, que es la forma exacta del
  `names.en` de la ficha. **La regla `names.en` = *genérico inglés (regional)* vuelve a
  sostenerse** (la v2 no la había podido probar).
- **`beer` ×2 → `fdc-168746` Cerveza (43), exacto español 0,85 ✅** — las fichas de la
  card 6.2 (DT-27) cerraron los dos silencios que v1 y v2 arrastraban. 2×330 g = 283,8 kcal.
  `predicciones.md` ya lo había previsto: *"cada caña suma ~110 kcal si las cuenta:
  hasta ~770 con las dos, y sería correcto"*. Con tercios de 330 ml, 836,6.

**El criterio 2 lo cuenta fuera, y es un artefacto de la regla de tres**: la visión
reportó 880 g contra 220 previstos, así que el rango se multiplica por 4 (1.800–2.800).
Pero **660 de esos 880 gramos son cerveza a 43 kcal/100 g**, que suma masa y casi no
suma calorías. La regla de tres supone densidad calórica uniforme y este plato no la
tiene — **es el límite que el propio `golden.ts` declara en su comentario, con este
mismo plato como ejemplo**. Al nivel de plato es ✅ sin discusión: 3 de 3 fichas
correctas y el total es el que la predicción escribió. **Causa: criterio.**

### 28 · Comida de plástico — 🟡 **[interpretación]** (igual que v2)
`is_food: true`, 2 ítems, ambos → `fdc-169640` **Miel**, confianza final **0,056 /
0,043**, confianza de visión **0,60**.

**La compuerta ahora está cerrada hasta el final, y eso cierra el reparo que la v2 dejó
abierto:**
- `completo: false` · `macro_pct: null` · **`total_no_publicable: true`**
- **y los ocho nutrientes de `totals` valen `null`.** En la v2 el payload seguía
  llevando 1.550,4 kcal de plástico; **ahora no hay número que el front pueda pintar.**
  (DT-28, punto 3, verificado en el JSON.)
- motivo publicado al usuario.

**Resolución, con la misma vara de la v2.** Las tres puertas escritas eran: ✅
`is_food:false` (no ocurrió) · 🟡 `is_food:true` con **confianza de visión < 0,5** (salió
**0,60**, falla por una décima) · ❌ `is_food:true` con confianza alta **y un total de
calorías en firme** (conjunción: **ninguno de los dos términos se cumple** — 0,60 no es
"alta" y el total no existe en el payload). **Como el ❌ demostrablemente no se dispara y
el ✅ tampoco, queda 🟡.**

**Esta interpretación sigue cargando el criterio 4, y hay que decirlo:** por la letra
estricta del 🟡 el plato es ❌ y el criterio 4 vuelve a fallar. **El argumento es más
fuerte que en la v2** —allá el total viajaba igual, acá no viaja— pero es el mismo
argumento, y la confianza de visión empeoró (0,55 → 0,60).

### 29 · Plato vacío — ✅
`is_food: false`. El negativo más probable en producción, limpio por tercera vez.

### 30 · Envase cerrado — ✅
`is_food: false`. **No leyó las fotos impresas de la tapa ni la etiqueta, 3 de 3.**

---

## 4 · Los cinco criterios, con las cuentas a la vista

**Universo.** 26 platos de comida (01–09, 11–27) → **66 ítems**. Los 4 negativos (10,
28, 29, 30) van aparte; el 28 aporta 2 ítems. Total del set: **68**.

### Criterio 1 · Ítems con ficha correcta — **PASA** (por 3,5 ítems)

| | ítems | detalle |
|---|---|---|
| ✅ ficha correcta | **53** | incluye la arepa, que ahora acierta por ficha y no por silencio |
| 🟡 aproximada razonable | **9** | 07 gravy→Salsa mexicana · 08 bread roll→Pan · 08 **lime→Limón** · 08 hot sauce→Salsa · 14 manchego→parmesano · 17 peas and carrots→Arvejas crudas · 20 maíz con grasa · 20 remolacha cruda · 22 rye bread→Pan |
| ❌ ficha equivocada | **2** | 08 **`flatbread` → Galletas de pan plano (+89 %)** · 16 **`cured ham, serrano/iberico` → Jamón cocido (−40 %)** |
| silencio (`no_catalogado`) | **2** | los dos del plato 23 |

- Lectura literal (**✅ ÷ 66**): **53 / 66 = 80,3 %** → umbral ≥ 75 %. **PASA.**
- v1 **59,1 %** → v2 **72,7 %** → v3 **80,3 %**. **+7,6 puntos sobre la v2 y +21,2 desde
  el punto de partida.**
- Lectura generosa (✅ + 🟡): **62 / 66 = 93,9 %**.
- La sensibilidad que decidía la v2 —si los silencios honestos sobre huecos reales
  cuentan ✅— **ya no mueve nada**: los dos silencios que quedan son sobre alimentos que
  el catálogo sí tiene (uno de ellos parcialmente). **Este criterio pasa con las tres
  varas razonables, no con una.**

### Criterio 2 · Platos con kcal en rango — **PASA**

Regla recalibrada (DT-28, punto 4): el rango escrito llevado a los gramos que la visión
reportó, o `completo:false` con ≥ 70 % de gramos cuantificados. Denominador **26**,
umbral 21 de 26.

**23 / 26 = 88,5 % → PASA.** Y **las dos bases dan el mismo número** (contra gramos
cuantificados y contra gramos totales), que es la mejor señal de que el resultado no
depende de esa elección.

| fuera (3) | número | causa raíz |
|---|---|---|
| **09-arepa** | 328,5 kcal, sin rango escrito | **criterio** — la convención "el acierto es no dar número" quedó obsoleta cuando la card 6.2 fichó la arepa |
| **16-jamon-serrano** | 93,6 contra 100–220 (factor 1,0) | **catálogo** — falta el alias `Jamón ibérico`; ver §3.16 |
| **27-bocadillo-calamares** | 836,6 contra 1.800–2.800 (factor ×4) | **criterio** — la regla de tres supone densidad uniforme y 660 g del plato son cerveza |

**Solo 1 de las 3 pérdidas es un defecto del producto**, y es la del jamón. Las otras
dos son de la vara: una convención que envejeció y un límite que `golden.ts` ya declara
por escrito. **Corregidas esas dos, el criterio daría 25/26 = 96,2 %.**

**Con la vara VIEJA —el rango escrito contra los kcal a secas— esta corrida daría
14/26 = 53,8 %**, peor que la v1 (76,9 %), y no porque el motor haya empeorado: la
visión midió gramajes más grandes casi en todos lados, así que se caerían también el 03
(1.014 kcal por 600 g de paella), el 08, el 21, el 24 y el 27, **cinco platos con todas
sus fichas correctas y aritmética exacta**. Es la prueba más clara de que la vara vieja
medía las predicciones de gramaje y no al producto.

**Un agujero de la cláusula del 70 %, que hay que declarar:** el plato **05** entra "en
regla" como `parcial_declarado` —`completo: false` con el 100 % de los gramos
cuantificados— **sin haber publicado ningún total**. La cláusula fue escrita para
premiar al motor que declara lo que le falta; no previó el caso de un plato que declara
`completo: false` por confianza y no por cobertura. Si al 05 se lo contara fuera, el
criterio daría **22/26 = 84,6 %, y seguiría pasando**.

Comparación honesta con la v2, con la MISMA vara recalibrada: v2 **23/26 = 88,5 %**
(fuera: 16 jamón, 17 pollo, 22 desayuno) → v3 **23/26 = 88,5 %** (fuera: 09 arepa,
16 jamón, 27 bocadillo). **Mismo porcentaje, distintos platos: el pollo y el desayuno
entraron, la arepa y el bocadillo salieron por artefactos de la vara, y el jamón sigue
afuera las dos veces.**

### Criterio 3 · Fichas equivocadas con confianza ≥ 0,60 — **PASA** (condición dura)

| ítem | ficha equivocada | confianza |
|---|---|---|
| 16 `cured ham, serrano/iberico` | Jamón (cocido) | **0,208** |
| 08 `flatbread` | Galletas de pan plano | **0,191** |
| 28 `honey toast…` ×2 | Miel | 0,056 / 0,043 |

**0 de 68 ítems. PASA.** La ficha equivocada de mayor confianza está a **0,208** —
prácticamente el mismo margen que la v2 (0,203) y cuatro décimas por debajo del umbral.
En v1 la condición se salvaba por nueve centésimas.

Cruzado al revés: **24 ítems se muestran a ≥ 0,60**, y **23 tienen la ficha correcta**.
El vigésimo cuarto es **`lime` → *Limón* a 0,85**, y ahí está la única discusión seria
de este criterio:

> **Si "ficha equivocada" se juzga por identidad y no por nutrientes, el criterio 3
> FALLA.** Una lima no es un limón, y se muestra al 85 %. Se cuenta 🟡 porque la
> definición que fijó `evaluacion.md` y respetó `evaluacion-v2.md` es explícita
> —"nutrientes sustancialmente distintos del alimento real"— y 29 contra 30 kcal/100 g
> no lo es. **Los dos números están en el tablero: 0 de 68 por la definición escrita,
> 1 de 68 por identidad.** Es la interpretación que más peso carga de este informe,
> junto con la del plato 28.

### Criterio 4 · Negativos — **PASA** (con la misma interpretación que la v2)

| # | caso | resultado | juicio |
|---|---|---|---|
| 10 | bicicleta | `is_food: false` | ✅ |
| 28 | comida de plástico | `is_food: true`, 2× Miel a 0,056/0,043 · **`total_no_publicable: true`, los 8 nutrientes en `null`**, `macro_pct: null`, motivo publicado · conf. visión **0,60** | **🟡** [interpretación] |
| 29 | plato vacío | `is_food: false` | ✅ |
| 30 | envase cerrado | `is_food: false` | ✅ |

Umbral: **4 de 4 con ≥ 3 en ✅**. Salió **4 de 4 con 3 ✅ y 1 🟡: PASA, justo en el
umbral**, igual que la v2.

**Lectura alternativa, dicha en voz alta:** si el 28 se juzga ❌ por la letra del 🟡
(pedía confianza de visión < 0,5 y salió 0,60), **el criterio 4 FALLA**. Lo que cambió
respecto de la v2 es que el segundo término del ❌ escrito —"un total de calorías en
firme"— ahora es **demostrablemente falso en el payload**, no solo en la declaración.

### Criterio 5 · Silencio sobre comida catalogada — **PASA, y con margen**

Los **2** `no_catalogado` de toda la corrida, censados contra `foods.canonical.json`
3.4.0:

| # | término | ¿existe ficha? |
|---|---|---|
| 23 | `grilled potato slice` | **discutible** — `fdc-2709403` *Papa asada con cáscara* (126) es **asada**, no a la plancha; la card 6.1 midió que este silencio es correcto |
| 23 | `grilled green pepper` | **parcial** — `fdc-2709799` *Pimientos crudos* (27); el asado no existe |

**1 / 66 = 1,5 %** → umbral ≤ 10 %. **PASA.**
Contando el parcial: **2 / 66 = 3,0 % → PASA igual.**
Si se acepta el veredicto de la card 6.1 sobre la papa: **0 / 66 = 0 %.**

**Del 59 % del punto de partida del proyecto al 16,7 % (v1), al 7,6 % (v2), al 1,5 %.**
**Las cinco causas de cola descriptiva que la v2 identificó como su única causa raíz
están resueltas o fichadas: `chicken thigh` y `cucumber` por el motor (DT-28 punto 1),
`cabbage`, `sweet corn` y `spaghetti` por fichas nuevas del catálogo (DT-33).**

---

## 5 · Tabla delta de los 30 · v2 → v3

| # | Plato | v2 → v3 | conf. principal | Causa del cambio |
|---|---|---|---|---|
| 01 | Manzana | ✅ → ✅ | 0,95 → 0,95 | igual (visión idéntica) |
| 02 | Croissant | ✅ → ✅ | 0,95 → 0,95 | igual (visión idéntica) |
| 03 | Paella | ✅ → ✅ | **0,121 → 0,578** | **catálogo** (alias `Paella de marisco` 0,8) |
| 04 | Tortilla | 🟡 → **✅** | 0,95 → 0,95 | **criterio** (recalibración; el motor no cambió) |
| 05 | Lasaña | **✅ → 🟡** | **0,144 → 0,084** | **visión** (nombre más largo) + **motor** (compuerta) — **REGRESIÓN** |
| 06 | Risotto | 🟡 → **✅** | 0,244 → 0,244 | **criterio** (los 3,6 kcal eran del rango escrito) |
| 07 | Bife + papas | ✅ → ✅ | 0,459 → 0,434 | igual |
| 08 | Lentejas | **✅ → 🟡** | 0,162 → 0,162 | **visión** (`flatbread`, `lime`) — ver §3.08 |
| 09 | Arepa | ✅ → ✅ | **0 → 0,232** | **catálogo** (ficha nueva); el criterio 2 lo saca |
| 10 | Bicicleta | ✅ → ✅ | — | igual |
| 11 | Plátano | ✅ → ✅ | 0,98 → 0,98 | igual (visión idéntica) |
| 12 | Naranja | ✅ → ✅ | 0,285 → 0,285 | igual |
| 13 | Huevos fritos | ✅ → ✅ | 0,808 → 0,808 | igual |
| 14 | Manchego | 🟡 → 🟡 | 0,40 → 0,425 | igual (alias 0,5 sigue vivo) |
| 15 | Pan tostado | 🟡 → 🟡 | 0,722 → 0,722 | igual (la visión sigue sin ver la manteca) |
| 16 | Jamón serrano | 🟡 → 🟡 | 0,203 → 0,208 | **igual** — el fix de la barra no tocó este caso |
| 17 | Pollo/arroz | 🟡 → **✅** | 0 → **0,248** | **motor** (cola descriptiva USDA) — término idéntico |
| 18 | Huevos rotos | ✅ → ✅ | 0,765 → 0,765 | igual (la receta sigue sin activarse) |
| 19 | Hamburguesa | 🟡 → **✅** | 0,14 → 0,207 | **criterio** (recalibración) |
| 20 | Ensalada | ✅ → ✅ | 0,808 → 0,808 | **catálogo** (7/7 con ficha) |
| 21 | Cocido | ✅ → ✅ | 0,459 → 0,459 | **catálogo** (7/7; repollo y pechuga nuevos) |
| 22 | Desayuno | ✅ → ✅ | 0,51 → 0,54 | **catálogo + motor** (6/6; alubias y pepino) |
| 23 | Salmón | ✅ → ✅ | 0,107 → 0,098 | igual |
| 24 | Espaguetis | ✅ → ✅ | 0,152 → 0,32 | **catálogo** (*Pasta cocida*, vía el español) |
| 25 | Gazpacho | ✅ → ✅ | 0,85 → 0,85 | igual |
| 26 | Croquetas | 🟡 → **✅** | 0,361 → 0,361 | **criterio** (recalibración) |
| 27 | Bocadillo | ✅ → ✅ | 0,90 → 0,88 | **catálogo** (cerveza); el criterio 2 lo saca |
| 28 | Plástico | 🟡 → 🟡 | 0,047 → 0,056 | **motor** (compuerta cerrada hasta el payload) |
| 29 | Plato vacío | ✅ → ✅ | — | igual |
| 30 | Envase cerrado | ✅ → ✅ | — | igual |

**Seis platos mejoraron de juicio (04, 06, 17, 19, 26 y —sin cambiar de símbolo— 20, 21,
22, 24 con fichas nuevas). Dos empeoraron (05 y 08). Ninguno llegó a ❌.**

---

## 6 · Los focos que la card traía, resueltos

| Foco | Resultado | Atribución |
|---|---|---|
| **09 · la arepa ahora tiene ficha (219 kcal)** | **SÍ, y acierta.** `fdc-168070` a 0,232, 150 g → 328,5 kcal, ficha correcta. **Pero `criterios.json` sigue pidiendo silencio, así que el criterio 2 lo cuenta fuera.** | **Catálogo** (card 6.2). La pérdida del criterio 2 es **del criterio**. |
| **16 · el fix de la barra `/`** | **NO destrabó el plato, y la causa raíz declarada en DT-28 era la equivocada.** Medido contra el matcher: `jamón serrano/ibérico` → *Jamón crudo* 0,8 (la barra funciona) · `cured ham, serrano/iberico` en inglés → **silencio** · **`jamón ibérico` → *Jamón* cocido a 0,231, que es el número exacto de la corrida.** La visión escribió `jamón ibérico`, sin "serrano". **`ibérico` = 0 coincidencias en las 1.112.** | **Catálogo (curación).** Falta el alias `Jamón ibérico` sobre `fdc-2705879`. |
| **Los silencios** | **De 10 (v1) a 5 (v2) a 2 (v3).** Las cinco causas de cola descriptiva de la v2 están cerradas: 2 por el motor (`chicken thigh`, `cucumber` — términos idénticos, atribución limpia) y 3 por fichas nuevas (`cabbage`, `sweet corn`, `spaghetti`). | **Motor + catálogo**, mitad y mitad. |
| **La compuerta del total** | **Cerrada hasta el payload.** Plato 28: los 8 nutrientes en `null` + `total_no_publicable: true`. El reparo que la v2 dejó abierto ya no existe. **Efecto lateral no buscado: la misma compuerta apagó el total de la lasaña (05), que tenía la ficha correcta.** | **Motor** (DT-28 punto 3). |
| **La recalibración del criterio 2** | **Funciona y se nota.** Los platos 04, 06, 19 y 26 —ficha correcta, aritmética exacta, rango escrito sobre otros gramos— entraron. **Y tiene dos agujeros medidos: la convención del plato sin rango (09) y la regla de tres sobre platos de densidad mixta (27).** | **Criterio** (DT-28 punto 4). |

---

## 7 · Hallazgos nuevos, para `docs/DEUDAS.md`

**A · La compuerta de confianza apaga totales correctos.** Plato 05: ficha correcta
(`fdc-2708755` Lasaña con carne y espinaca), aritmética exacta, y el usuario no ve
calorías porque el difuso quedó en 0,084 contra el piso de 0,12
(`CONFIANZA_MINIMA_PARA_UN_TOTAL`). **La compuerta no distingue "no sé qué es esto"
(plato 28) de "sé qué es y lo encontré por una vía floja" (plato 05).** Un plato con un
solo ítem, ficha correcta y `completo: true` en las dos corridas anteriores no debería
quedarse mudo. **Dueño: motor.** Candidatos: mirar `match: difuso` + cobertura, o pedir
que la compuerta se dispare solo cuando **ninguna** ficha del plato supere el piso *y*
la confianza de visión sea baja.

**B · Cuando los dos idiomas apuntan a fichas distintas, gana el más confiado aunque sea
el peor.** `buscarConDosNombres` compara la confianza visible y se queda con la mejor.
Medido en esta corrida, dos veces:
- plato 08: `lime` (inglés) → *Lima cruda* 0,3 · el español que escribió la visión
  ("limón") → *Limón* **1,0**. Gana el español. **Ficha equivocada por identidad, a 0,85
  de cara al usuario.**
- plato 07: `gravy, brown sauce` (inglés) → *Salsa de carne* 0,176, **que es la ficha
  correcta** · el español → *Salsa mexicana*. Gana el español, tres corridas seguidas.

En v3 entraron **36 ítems por el español y 30 por el inglés**: no es un caso de borde.
**Dueño: motor (diseño del desempate).** No hay una respuesta obvia —el español es
justamente el idioma que la curación enriqueció— pero hoy no hay ninguna señal que
frene una traducción equivocada de la visión.

**C · Falta el alias `Jamón ibérico`.** `ibérico` = **0 coincidencias** en las 1.112
fichas. `fdc-2705879` *Jamón crudo* tiene `Jamón curado`, `Prosciutto` y `Jamón serrano`
(0,8). Con el alias, el plato 16 vuelve a ✅ y el criterio 2 sube a 24/26 = 92,3 %.
**Dueño: curación.** **Y corrige el diagnóstico de DT-28 punto 2**, que atribuyó este
plato a la barra `/`: la barra funciona, medido.

**D · `criterios.json` necesita dos parches, y sin ellos el criterio 2 miente hacia
abajo.**
1. El plato **09** ya no es un hueco: darle `gramos_previstos` y rango (la ficha es
   `fdc-168070`, 219 kcal/100 g) y retirar la nota de la convención.
2. El plato **27** rompe la regla de tres porque 660 de sus 880 g son cerveza. O se le
   declara el rango sobre el bocadillo solo, o el criterio necesita una excepción escrita
   para los platos con bebida.
   **Dueño: criterio (Tomás + Claude).** Con los dos, **25/26 = 96,2 %**.

**E · Tres huecos de vocabulario medidos, todos de curación:**
- `corn, sweet, cooked` (inglés) → maíz **con** grasa (106) existiendo el **sin** grasa
  (86, alias `Maíz dulce cocido`, que resuelve a 1,0 por español). **+23 %.** Es el
  límite de DT-35(b) mordiendo en producción.
- `beet, pickled` / `remolacha encurtida` → *Remolacha cruda* (44,6) existiendo
  *Remolacha de lata* (31). **+44 %.**
- `flatbread` → *Galletas de pan plano* (412) sobre una tortilla de maíz (218). **+89 %.**
  Hay ficha de pita (`fdc-2707616`, 275) y de tortilla de maíz (`fdc-2707823`), ninguna
  de pan plano genérico. **Es el único ❌ de ítem que la v3 estrenó.**

**F · Deudas viejas que la tercera corrida confirma que no son ruido:**
- **La manteca del plato 15 no aparece en ninguna de las 3 corridas**, y el motor publica
  `completo: true` sobre un plato incompleto. Es el hueco de la visión que
  `predicciones.md` puso ahí a propósito ("10 gramos que pesan el 29 % de las calorías").
- **`receta-huevos-rotos` no se activa en 3 de 3.** La pregunta que el plato 18 existía
  para contestar está contestada: **la ruta de composición gana siempre.** Decisión de
  producto pendiente sobre las 9 (hoy 52) recetas compuestas.
- **El alias `Queso manchego` 0,5 sobre el parmesano sigue vivo** y el usuario español
  sigue leyendo "Queso parmesano". 3 de 3.
- **`fdc-2709962` Arvejas cocidas sigue perdiendo contra las crudas** para
  `peas and carrots, cooked`.
- **La naranja del plato 12 se muestra al 28,5 %** por la cola `, all commercial
  varieties` en el `names.en`.
- **El salmón de la card 6.4 sigue sin medirse**: la visión nunca escribió `salmon` en
  las tres corridas.

---

## 8 · Veredicto en cristiano

**Pasan los cinco criterios. Por la vara que el proyecto se fijó, el sistema es apto
para mercado.** Y las tres cosas que hay que decir en la misma respiración:

**Lo que se ganó, y es del producto:**
- **El criterio 1 pasa con las tres varas razonables** (80,3 % literal · 93,9 %
  contando los 🟡), no con una sola como pasaba en la zona de duda de la v2.
- **El silencio prácticamente desapareció: 1,5 %** contra el 59 % del punto de partida
  del proyecto. **Tres compuestos cierran con todos sus ítems fichados** (20, 21, 22),
  cosa que no había pasado nunca.
- **Cero ❌ en 30 platos, segunda corrida consecutiva.** La ficha equivocada de mayor
  confianza está a 0,208.
- **La compuerta se cerró hasta el payload**: no hay calorías de plástico que un front
  descuidado pueda pintar.
- **Las correcciones de daño quedaron cerradas:** las croquetas a −1,3 % (eran +57 %),
  el pollo con su ficha (era costilla de res), el salmón que no es un bife, el repollo
  con la variante sin grasa que la DT-26 había pedido.

**Lo que hay que descontar del titular, con honestidad:**
1. **Dos criterios pasan por decisiones sobre la vara.** El criterio 2 pasa desde que se
   recalibró —**con la vara vieja esta corrida daría 14/26 = 53,8 %**, peor que la v1, y
   la razón es que la visión midió gramajes más grandes en casi todo el set: se caerían
   03, 08, 21, 24 y 27, que son cinco platos con **todas** sus fichas correctas—, y la
   recalibración está bien fundada pero la tomó el proyecto, no el motor. El criterio 4
   pasa con **una interpretación que si se lee estricta lo hace fallar**, igual que en la
   v2 y con la confianza de visión un poco peor (0,55 → 0,60).
2. **El criterio 3 se salva por la definición de "ficha equivocada".** Hay una lima
   mostrada como "Limón" al 85 %. Por nutrientes no es un error; por identidad sí, y por
   identidad el criterio fallaría. **Es exactamente el tipo de error que
   `predicciones.md` decía que un usuario español ve de un vistazo.**
3. **Hay una regresión real: la lasaña dejó de dar calorías** teniendo la ficha correcta,
   porque una compuerta pensada para el plástico se disparó sobre un plato bueno.

**Lo MÍNIMO que falta, por relación daño/esfuerzo:**

1. **El alias `Jamón ibérico`** (hallazgo C). Una línea de curación; devuelve el plato 16
   a ✅ y sube el criterio 2 a 92,3 %. **Y corrige un diagnóstico equivocado que hoy está
   escrito en DT-28.**
2. **Los dos parches de `criterios.json`** (hallazgo D): la arepa ya no es un hueco y el
   bocadillo rompe la regla de tres. Sin ellos el criterio 2 se seguirá castigando por
   aciertos.
3. **Revisar la compuerta de confianza** (hallazgo A) para que no apague un total cuya
   ficha es correcta. Es lo único de esta corrida que empeoró el producto.
4. **Mirar el desempate entre los dos idiomas** (hallazgo B): hoy una traducción
   equivocada de la visión gana con 1,0 contra la ficha correcta a 0,3, y decide dos
   ítems de esta corrida.
5. **Los tres huecos de vocabulario** (hallazgo E): maíz sin grasa por el lado inglés,
   remolacha encurtida, y algo para `flatbread`.

**Lo que este informe NO puede afirmar:**
- **Nada del front.** No se sabe cómo se ve un plato con `total_no_publicable: true`
  (la lasaña y el plástico), ni si la reserva del 0,425 del manchego llega al usuario.
- **Nada sobre repetición sobre la misma foto.** La estabilidad se midió entre corridas
  separadas por cambios de catálogo, así que **el 10,8 % de salto promedio mezcla la
  variabilidad del modelo con las fichas nuevas.** Medir la variabilidad pura sigue
  costando 30 llamadas más.
- **Nada sobre el salmón, el pez espada, los mejillones ni las 43 recetas compuestas de
  la card 6.4**: el golden set no los tocó. **1.112 fichas y este test ejerce 66 ítems.**
- **La cola de curación no se contó**: las respuestas siguen sin traer el campo (claves
  de nivel superior: `scan_id`, `is_food`, `items`, `totals`, `meta`, `persisted`,
  `message_es`).
- **El replay mide un piso, no el resultado completo**, mientras la DT-25 siga abierta:
  36 de los 66 ítems entraron por el español y el expediente no guarda `food_es`, así
  que no se pueden volver a jugar.

**Interpretaciones marcadas [interpretación]: 05, 08, 16, 28.** Las dos que cargan más
peso son la del **28** (de ella depende el criterio 4) y la del **`lime` del 08** (de
ella depende el criterio 3). Las dos están argumentadas arriba y las dos tienen su
número alternativo publicado.
