# Evaluación de la RE-CORRIDA — golden set de 30 (motor 2.8 · catálogo 3.1.0)

**Qué se evaluó.** Las 30 respuestas de `respuestas-v2/NN-*.json`
(`kb 3.1.0+47b8c77d`, `claude-sonnet-5`) contra `predicciones.md`, con las **mismas
definiciones** que usó `evaluacion.md` sobre la corrida anterior. **Cero llamadas al
endpoint y cero llamadas a ninguna API**: todo sale de los JSON en disco y de
`kb/build/foods.canonical.json` (solo lectura, versión verificada: `3.1.0+47b8c77d`,
1.022 fichas).

**Qué NO se evaluó.** Nada de front. Una foto por plato: **este test sigue sin medir
estabilidad entre corridas del modelo**. La cola de curación de Firestore sigue sin
poder contarse (las respuestas no traen el campo).

**Denominadores.** Se mantiene la corrección del informe anterior: son **26 platos de
comida** (01–09, 11–27), no 27. El umbral del criterio 2 es **21 de 26**.

**Convención de marcado.** Igual que el antecesor: 🟡 "aproximada razonable" **no** es
❌; "ficha equivocada" = **nutrientes sustancialmente distintos del alimento real**.
Donde el criterio escrito no decide el caso, va marcado **[interpretación]**.

---

## 0 · Advertencia previa: la visión se movió, y contamina el delta

La visión no es determinística. De los 30 platos, **10 devolvieron ítems y gramos
idénticos** (01, 02, 09, 10, 11, 14, 25, 26, 29, 30) y **12 cambiaron
sustancialmente** — ítem distinto o gramos ±20 % o más:

| # | Qué cambió la visión | Efecto sobre el juicio |
|---|---|---|
| 03 | 600 g → **450 g**, `seafood paella` → `seafood rice, paella style` | **El plato entra en rango por la visión, no por el motor.** |
| 05 | `meat and spinach` → `meat and cheese, baked` | Misma ficha, pero pierde la vía alias: conf. **0,68 → 0,144**. |
| 06 | `with mushrooms` → `with saffron`; 300 → 280 g | El nombre sigue **partido** igual: el test estructural se conserva. |
| 07 | fries 150→200, coleslaw 100→120, gravy 30→**50** g | +90 g de plato. |
| 08 | `pita bread` → `flour tortilla`; **`lime, halved` → `lime`** | **Contamina el foco de "cortes": la visión sacó el modificador sola.** |
| 16 | `Serrano ham, cured` → **`cured ham, serrano/iberico`**; 80→90 g | Causa directa de la única regresión del set (ver §3). |
| 17 | `mixed vegetables (…)` → `peas and carrots, cooked` | Otro alimento, otra ficha candidata. |
| 20 | 7 → 6 ítems (**desaparece la remolacha**); `sweet corn, canned` → `cooked` | Denominador distinto. |
| 21 | `chicken breast` → `chicken meat`; `pork meatball` → **`blood sausage`**; garbanzos 180→150 g | Plato reescrito a medias. |
| 22 | 6 → **7 ítems** (aparece `cream cheese`); `whole grain bread` → `rye bread` | Sube el conteo de fichas. |
| 23 | `coleslaw with mayonnaise and tomato` se **parte en dos ítems**; desaparece `carrot slices` | Menos silencios por menos ítems. |
| 28 | `cookie` → `chocolate, mille-feuille style`; conf. de visión **0,70 → 0,55** | Decide el criterio 4 (ver §3). |

**Lo que sí es atribuible al motor sin discusión** son los casos donde el **término es
literalmente el mismo** entre las dos corridas y el resultado cambió. Hay tres, y son
los que sostienen las conclusiones de este informe:

| término (idéntico en v1 y v2) | v1 | v2 |
|---|---|---|
| `apple slices` (plato 23) | `no_catalogado` | **`fdc-2709215` Manzana cruda, 0,36** |
| `carrot, shredded` (plato 20) | `no_catalogado` | **`fdc-170393` Zanahorias crudas, 0,54** |
| `croquette, breaded and fried` (plato 26) | **Buñuelo** (378), 0,51 | **Croquetas de papa** (237), 0,361 |

---

## 1 · El candado de aritmética

Se verificaron **los 30 platos**: para cada ítem con ficha,
`per_100g(respuesta) == per_100g(catálogo)` y `grams × per_100g / 100 == nutrients`;
y para cada plato, `suma(items) == totals`.

**58 ítems con ficha · 58 correctos · 0 discrepancias · 0 discrepancias de total.**
Los 58 `food_id` existen en las 1.022 fichas del 3.1.0.

Único caso que merece nota, y **no es un error**: `manual-tortilla-de-patatas` no
declara `sat_fat_g`, `sugars_g` ni `sodium_mg` en el catálogo. La respuesta propaga
`null` y lo dice en `totals.opcionales_ausentes` con texto al usuario
("La fuente no declara este valor… Un total parcial no es un total"). Es el
comportamiento correcto.

**La capa de cálculo sigue sin ser el problema.**

---

## 2 · Los 30 platos, uno por uno

### 01 · Manzana — ✅
Idéntica a v1. `apple, raw` → `fdc-2709215`, exacto **0,95**, 180 g → **109,8**
(rango 70–140).

### 02 · Croissant — ✅
Idéntica a v1. Exacto **0,95**, 70 g → **284,2** (200–330).

### 03 · Paella — ✅ (era 🟡)
`seafood rice, paella style` → `fdc-2706723` **Paella**, difuso **0,121**,
**450 g → 760,5 kcal** (rango 400–800). **Ficha correcta y total en rango: el ✅
escrito se cumple entero.**

**Honestidad: el plato entra por la visión, no por el motor.** En v1 la ficha ya era la
correcta y el total se iba a 1.014 porque la visión midió 600 g; ahora midió 450. La
confianza incluso **bajó** (0,185 → 0,121).

### 04 · Tortilla de patatas — 🟡 (igual que v1)
`Spanish potato omelette` → `manual-tortilla-de-patatas`, **exacto 0,95**, 600 g →
**816** (rango 450–750). Ficha perfecta, rango excedido un 9 % por gramaje
(600 g de tortilla entera contra 450 predichos). Misma vara que v1.

### 05 · Lasaña — ✅ (igual que v1)
`lasagna, meat and cheese, baked` → `fdc-2708755`, difuso **0,144**, 350 g →
**724,5** (450–850).

**Regresión de confianza, no de juicio: 0,68 → 0,144.** En v1 la visión escribió
`meat and spinach` y ganó el alias `Lasaña` (0,8); ahora escribió `meat and cheese` y
solo alcanza el difuso. La ficha es la misma. Causa: **visión**.

### 06 · Risotto — 🟡 **[interpretación]** (era ❌) — **el foco del delta**
`yellow rice with saffron, cooked` → **`fdc-2708419` Arroz amarillo cocido**, difuso
**0,244**, 280 g → **246,4 kcal**.

**El motor encontró el arroz amarillo. El nombre partido ya no lo mata.** El motivo lo
dice con todas las letras y es texto nuevo: *"las palabras del nombre del catálogo
están todas en lo que se identificó, pero separadas: lo que quedó en el medio no está
explicado por esta ficha (cobertura 0.64)"*. La causa C del informe previo **está
resuelta**.

Queda 🟡 y no ✅ **por 3,6 kcal**: el rango escrito era 250–520 y salió 246,4. El rango
se había calculado sobre 320 g y la visión midió 280 (280 × 0,88 = 246,4, aritmética
exacta). Se resuelve 🟡 **para no cambiar la vara con la que el antecesor juzgó 03, 04,
14 y 19** — el rango escrito manda —, pero **la ficha es exactamente la que el ✅
pedía**, y eso es lo que el plato existía para medir.

### 07 · Bife con papas y ensalada — ✅ (igual que v1)
5 ítems, **5 con ficha**, total **1.063,2** (rango 750–1.250), `completo: true`.
Bife 0,459 ✅ · Papas fritas 0,808 ✅ · Coleslaw 0,85 ✅ · Kétchup 0,9 ✅ ·
`gravy, brown sauce` → *Salsa mexicana* (34) 🟡 — sigue sin llegar a
`fdc-2707149` *Salsa de carne* (53), como en v1. Son 17 kcal sobre 1.063.

### 08 · Lentejas guisadas — ✅ (igual que v1, y mejor)
6 ítems, **6 con ficha** (en v1 eran 5 de 6), total **1.117,5** (750–1.250),
`completo: true`, 595/595 g.
- `lentil stew with beef` → *Lentejas cocidas* (0,162) ✅ — **la trampa cara sigue sin
  morder**: no eligió `fdc-172420` *Lentejas crudas*.
- `flour tortilla` → *Tortilla de trigo* (0,425) ✅ — ítem nuevo de la visión, bien resuelto.
- **`lime` → `fdc-168155` Lima cruda (0,255) ✅ — el silencio de v1 se cerró.**
  **Salvedad: la visión escribió `lime` a secas; en v1 había escrito `lime, halved`.
  Este caso NO prueba que el motor normalice el corte.**
- `bread roll` → *Pan* (267 vs *Panecillo* 279) 🟡 · `saltine crackers` → *Galletas
  saladas* (510 vs *saltinas* 416) 🟡 · `hot sauce` → *Salsa* (109) 🟡.

### 09 · Arepa rellena — ✅ (idéntica a v1)
`no_catalogado`, `confidence: 0`, `totals: null`, y se **niega a componer**.
Hueco real re-verificado en el 3.1.0: `arepa` = **0 coincidencias**.

### 10 · Bicicleta — ✅
`is_food: false`.

### 11 · Plátano — ✅ (idéntico)
`banana, raw` → exacto **0,98**, 106,8 (85–160).

### 12 · Naranja — ✅ (igual)
`orange, peeled, segments` → `fdc-169097`, difuso **0,285**, **84,6** (45–100).
Sigue el reparo de producto: una naranja obvia se muestra al **28,5 %**.

### 13 · Dos huevos fritos — ✅ (igual)
`fdc-2707155` *Huevo frito*, alias **0,808**, 110 g → **203,5** (140–300).

### 14 · Queso manchego — 🟡 (igual que v1)
`fdc-2705730` *Queso parmesano en trozo* vía alias `Queso manchego` (0,5) →
confianza **0,40** (era 0,375), 90 g → **370,8** (rango 160–300).
La reserva del alias se respeta (el ❌ era > 0,60). Rango excedido por gramaje.
**El alias `Queso manchego` 0,5 sigue vivo en el 3.1.0** — verificado — y el usuario
español sigue leyendo "Queso parmesano" sobre un manchego, ahora al 40 %.

### 15 · Dos tostadas con manteca — 🟡 (igual que v1)
Un solo ítem: `toasted white bread` → *Pan tostado*, alias **0,722**, 60 g →
**175,8** (rango 170–330), `completo: true`.
**La manteca sigue sin aparecer: la visión no la devuelve.** El motor no puede declarar
incompletitud sobre lo que la visión nunca vio. Hallazgo intacto.

### 16 · Jamón serrano — 🟡 **[interpretación]** — **LA ÚNICA REGRESIÓN DEL SET**
`cured ham, serrano/iberico` → **`fdc-2705878` Jamón** (`Ham`, **117 kcal/100 g**, que
es jamón **cocido**), difuso **0,203**, 90 g → **105,3 kcal** (rango 100–220).

**En v1 este plato era ✅**: `Serrano ham, cured` → `fdc-2705879` *Jamón crudo* (195)
vía el alias `Jamón serrano` (0,8), confianza 0,72, 156 kcal.

**Es exactamente el "gemelo caro" que `predicciones.md` describió: pierde el 40 % de las
calorías y confunde York con serrano.** Por el criterio escrito queda **🟡** (el ❌ era
2705878 *con confianza alta*; está a 0,203). Pero al nivel de ítem es **ficha
equivocada**, y así se cuenta en el criterio 1.

**Causa, medida dentro de la misma corrida:** en el **plato 18** la visión escribió
`cured ham, serrano` y el motor **sí** llegó a *Jamón crudo* por el alias, a **0,64**.
La única diferencia es el `/iberico` del plato 16. **El separador `/` rompe el alias.**
Es visión que dispara un límite del motor, no catálogo: el alias `Jamón serrano` (0,8)
sigue intacto en `fdc-2705879`, verificado.

### 17 · Pollo con arroz y verduras — 🟡 **[interpretación]** (era ❌) — **foco del delta**
Total **290,7 kcal** (rango 400–650), `completo: false`, 270/400 g = **67,5 %**.
- **`chicken thigh, roasted` → `no_catalogado`.** **El pollo dejó de ser costilla de
  res.** Verificado en el catálogo: `fdc-169510` ya **no** tiene el alias `Asado`; hoy
  tiene `Tira de asado` con confianza 0,8. **El alias tóxico está extirpado.**
- `white rice, cooked` → *Arroz blanco cocido*, exacto **0,782** ✅
- `peas and carrots, cooked` → `fdc-170419` **Arvejas crudas** (81) 🟡 — existe
  `fdc-2709962` *Arvejas cocidas* (98) y el motor eligió la cruda; **avisa el crudo en
  el motivo**. Ignora las zanahorias.

Se resuelve **🟡** porque el 🟡 escrito describe el caso al pie de la letra ("2 de 3 con
`completo:false` declarado"). **El reparo honesto: 290,7 kcal para un plato que ronda
515 es −44 %**, y el 67,5 % cuantificado **no** alcanza la cláusula del 70 %, así que
este plato **cae fuera del criterio 2**. Cambió el defecto de sitio: antes mentía, ahora
calla.

### 18 · Huevos rotos con jamón — ✅ (igual que v1)
3 ítems, **3 con ficha correcta**, total **835** (700–1.050), `completo: true`.
Papas fritas 0,765 · Huevo frito 0,722 · **Jamón crudo 0,64** (vía alias).
**`receta-huevos-rotos` volvió a no activarse: 0 de 2 corridas.** La ruta de composición
ganó otra vez. Dato sobre las 9 recetas compuestas, no fallo por el criterio escrito.

### 19 · Hamburguesa con papas — 🟡 (igual que v1)
2 ítems, **2 con ficha correcta**, total **1.301,4** (rango 700–1.200; el techo de 1.700
estaba condicionado a contar la mesa entera, y **no la contó**). Misma vara que v1.

### 20 · Ensalada mixta — ✅ (igual que v1, y mejor matching)
6 ítems, **5 con ficha**, total **246,9**, `completo: false`, **330/380 g = 86,8 %**.
El total queda **3,1 kcal por debajo** del piso 250, pero la cláusula agregada del
criterio 2 (`completo:false` con ≥ 70 % cuantificado) lo pone **en regla sin
interpretación** — es la misma resolución que el antecesor aplicó al plato 21.
- **`carrot, shredded` → `fdc-170393` Zanahorias crudas (0,54): el silencio de v1 se
  cerró con el término idéntico.** Atribución limpia al motor.
- `lettuce, iceberg, shredded` → **`fdc-169248` Lechuga iceberg cruda** (0,54) — ficha
  **más precisa** que la genérica *Lechuga cruda* de v1.
- `tuna, canned` → *Atún* subió de **0,118 a 0,722** (vía alias).
- `sweet corn, cooked` → **silencio** (`fdc-2709916` existe).
- La remolacha desapareció: **la visión no la devolvió**.

### 21 · Cocido madrileño — ✅ (igual que v1)
7 ítems, **6 con ficha** (en v1 eran 5), total **1.456,8** (rango 800–1.300),
`completo: false`, **500/620 g = 80,6 %** → **en regla por la cláusula del 70 %**.
**La trampa del alias `Cocido madrileño` (0,5) volvió a no dispararse.**
Garbanzos ✅ · Tocino cocido ✅ · **Morcilla ✅ (ítem nuevo)** · Chorizo ✅ ·
Carne de res ✅ · `chicken meat, boiled` → **`fdc-2705819` Carne** (`Meat, NFS`, 215)
🟡 — existe *Pollo guisado* (156): **+38 %**, aunque en absoluto son 53 kcal sobre
1.457 y el nombre "Carne" no afirma otra especie · `cabbage, cooked` → **silencio**
(`fdc-2709890` existe).

### 22 · Desayuno completo — ✅ (era 🟡)
7 ítems, **5 con ficha**, total **676,9** (rango 600–1.000), `completo: false`,
295/485 g. El ✅ escrito pedía ≥5 con ficha y 600–1.000: **se cumple**.
Pan ✅ · Huevo revuelto ✅ · Salchicha ✅ · **Jamón cocido ✅ (la simetría con el 16
vuelve a cumplirse: acá `fdc-2705878` es el acierto)** · Queso crema ✅ (ítem nuevo).
Silencios: `baked beans` (**hueco real re-verificado: 0 coincidencias**) y
`cucumber, sliced` (`fdc-168409` existe).

### 23 · Salmón con guarnición — ✅ (era ❌) — **foco del delta**
7 ítems, **5 con ficha**, total **590,5** (rango 500–900 ✓), `completo: false`,
320/410 g = 78 %.
- **`fish fillet, braised with sauce` → `fdc-2706224` Pescado (`Fish, NFS`,
  238 kcal/100 g), 0,107. El salmón dejó de ser un bife.** Verificado en el catálogo:
  `fdc-2705824` *Bife* ya **no** tiene el alias `Filete`; solo `Bistec`. **Alias tóxico
  extirpado.** El ✅ escrito pedía "una ficha de pescado de 170–270 kcal/100 g": 238 cae
  dentro. Tampoco cayó en *Lomi salmón*.
- **`apple slices` → `fdc-2709215` Manzana cruda (0,36): el silencio de v1 se cerró con
  el término idéntico.** Es la prueba más limpia de que el corte ya no mata el match.
- `coleslaw` ✅ 0,6 · `toasted bread` ✅ 0,595 · `tomato slice` → *Tomate cocido* (50)
  🟡 (es una rodaja cruda; 10 kcal absolutos).
- **De 4 silencios en v1 a 2**: `grilled potato slice` (`fdc-2709403` existe) y
  `green chili pepper, grilled` (parcial: hay pimientos crudos, no asados).

El ✅ escrito pedía ≥3 guarniciones con ficha (hubo 4) y total 500–900 (590,5).
**Se cumple entero, sin interpretación.**

### 24 · Espaguetis con albóndigas — ✅ (igual)
2 ítems, 2 con ficha, **684,2** (450–750). *Pasta con salsa* 0,152 + *Albóndigas con
salsa* **0,396** (subió de 0,150). El *Plato congelado* sigue sin dispararse.

### 25 · Gazpacho — ✅ (igual)
`fdc-2710106`, alias **0,85** (era 0,90), 300 g → **78** (50–90).

### 26 · Croquetas — 🟡 **[interpretación]** (era ❌) — **foco del delta**
`croquette, breaded and fried` → **`fdc-2709511` Croquetas de papa** (`Potato tots`,
237 kcal/100 g) vía alias `Croqueta` (0,5) → confianza **0,361**, 110 g → **260,7 kcal**.

**Las croquetas son croquetas.** Verificado en el catálogo 3.1.0: `fdc-2708024`
*Buñuelo* tiene hoy **`aliases.es: []`** y `fdc-2709511` *Croquetas de papa* recibió
`Croqueta` (0,5) y `Croquetas` (0,5). **El alias se movió exactamente como el informe
anterior recomendaba.**

Queda 🟡 y no ✅ solo por el rango escrito: el ✅ pedía *Croquetas de papa* **y**
130–220 kcal, y salieron 260,7 — porque el rango se calculó sobre 70 g y la visión midió
110 g. **Contra la realidad el número es casi exacto: croquetas reales ≈ 240 kcal/100 g
→ 110 g = 264 kcal; el sistema dice 260,7, un −1,3 %.** En v1 decía 415,8 (+57 %) con
el nombre "Buñuelo" encima. **La corrección de daño más grande del delta.**

### 27 · Bocadillo de calamares — ✅ (igual)
`fried squid sandwich (calamari on bread roll)` → **`receta-bocadillo-de-calamares`**,
**0,90**, 260 g → **653,31** (450–700). Más dos `beer` en silencio honesto
(**cerveza = 0 coincidencias, re-verificado**).

**Salvedad sobre la "regla de curación" del informe anterior:** esta vez la visión **no**
escribió el nombre regional entre paréntesis (dijo `(calamari on bread roll)`), así que
**la hipótesis `names.en` = *genérico inglés (regional)* no se re-probó en esta
corrida.** El match llegó igual, por el nombre español. La regla sigue siendo plausible,
pero el 2 de 2 del informe previo no se convirtió en 3 de 3.

### 28 · Comida de plástico — 🟡 **[interpretación]** (era ❌) — **foco del delta**
`is_food: **true**`, 2 ítems, ambos → `fdc-169640` **Miel**, confianza de visión
**0,55** (era 0,70), confianza final **0,047 / 0,048** (era 0,088).

**La compuerta del total se encendió:**
- `completo: **false**` (era `true`)
- `macro_pct: **null**` (era un desglose)
- y un motivo escrito para el usuario: *"Ningún alimento de esta foto se identificó con
  confianza suficiente: el mejor llegó al 4.8 % y el mínimo para publicar un total es
  12 %. […] sumarlos y llamar a eso 'el total del plato' sería afirmar algo que el
  análisis no sostiene."*

**Reparo que hay que decir sin adornos: `totals.nutrients.kcal` sigue valiendo 1.550,4
en el payload.** La compuerta apaga la **declaración** (`completo`, `macro_pct`) y
publica el motivo; **no borra el número del JSON**. Si el front lo pinta igual, el
defecto sobrevive — **y el front no se evaluó en este test, así que no se afirma nada
sobre eso.**

**Resolución.** Las tres puertas escritas eran: ✅ `is_food:false` (no ocurrió) ·
🟡 `is_food:true` con **confianza de visión < 0,5** (salió 0,55, falla por 5
centésimas) · ❌ `is_food:true` con confianza alta **y un total de calorías en firme**
(conjunción: **ninguno de los dos términos se cumple** — 0,55 no es "alta" y el total
está explícitamente declarado como no publicable). **Como el ❌ demostrablemente no se
dispara y el ✅ tampoco, queda 🟡.**

**Esta es la interpretación que más peso carga de todo el informe: de ella depende el
criterio 4.** Si se juzga por la letra estricta del 🟡 (0,55 ≥ 0,5) el plato es ❌ y el
criterio 4 vuelve a fallar. Los dos números están en el tablero.

### 29 · Plato vacío — ✅
`is_food: false`. El negativo más probable en producción, limpio otra vez.

### 30 · Envase cerrado — ✅
`is_food: false`. No leyó las fotos impresas de la tapa ni la etiqueta.

---

## 3 · Los cinco criterios, con las cuentas a la vista

**Universo.** 26 platos de comida (01–09, 11–27) → **66 ítems** devueltos por la visión
(idéntico a v1). Los 4 negativos (10, 28, 29, 30) van aparte. Total del set: 68 ítems.

### Criterio 1 · Ítems con ficha correcta — **FALLA** (por 2,3 puntos)

| | ítems | detalle |
|---|---|---|
| ✅ ficha correcta | **48** | incluye el arepa (silencio honesto sobre hueco real), como contó el antecesor |
| 🟡 aproximada razonable | **8** | 07 gravy→Salsa mexicana · 08 bread roll→Pan · 08 saltine crackers→Galletas saladas · 08 hot sauce→Salsa · 14 manchego→parmesano · 17 peas and carrots→Arvejas crudas · 21 chicken meat→Carne · 23 tomato slice→Tomate cocido |
| ❌ ficha equivocada | **1** | **16 `cured ham, serrano/iberico` → Jamón cocido (−40 %)** |
| silencio (`no_catalogado`) | **9** | ver criterio 5 |

- Lectura literal (**✅ ÷ 66**): **48 / 66 = 72,7 %** → umbral ≥ 75 %. **FALLA**, en el
  **borde superior** de la zona de duda. Faltan **1,5 ítems**.
- v1 era **39 / 66 = 59,1 %**. **+13,6 puntos.**

**Dos sensibilidades que hay que poner, porque son materiales:**
1. **Si los silencios honestos sobre huecos reales contaran ✅** (el antecesor solo se lo
   concedió al arepa, pero `baked beans` y `beer` ×2 son huecos igual de verificados):
   **51 / 66 = 77,3 % → PASARÍA.** La diferencia es una convención de conteo, no del motor.
2. Lectura generosa (**✅ + 🟡**): **56 / 66 = 84,8 % → PASARÍA** (en v1 era 72,7 % y
   fallaba). **Este criterio ya no falla con cualquier vara; falla solo con la más
   estricta de las tres.**

### Criterio 2 · Platos con kcal en rango — **FALLA**

Regla: total en el rango declarado **o** `completo:false` con ≥ 70 % de gramos
cuantificados. Denominador **26**.

| en regla (20) | fuera (6) |
|---|---|
| 01 · 02 · **03** · 05 · 07 · 08 · 09\* · 11 · 12 · 13 · 15 · **16** · 18 · **20**† · **21**† · **22** · **23** · 24 · 25 · 27 | **04** 816 / 450–750 · **06** 246,4 / 250–520 · **14** 370,8 / 160–300 · **17** 290,7 / 400–650 · **19** 1.301,4 / 700–1.200 · **26** 260,7 / 130–220 |

\* El 09 no tiene rango: su comportamiento correcto era no dar número (convención del antecesor).
† Entran por la cláusula del 70 %: 20 con **86,8 %**, 21 con **80,6 %**.

**20 / 26 = 76,9 %** → umbral ≥ 80 % (21 de 26). **FALLA.**
**Es el MISMO porcentaje que v1** — pero no son los mismos platos: **entró el 03**
(paella, por gramaje de la visión) y **salió el 17** (pollo, porque el pollo ahora calla
y el 67,5 % cuantificado no llega a la cláusula del 70 %).

**Sensibilidad, que acá es casi todo el criterio [interpretación]:** de los 6 fuera,
**5 tienen la ficha correcta y aritmética impecable**:
- **04** (816): 600 g de tortilla reales → correcto para esos gramos.
- **14** (370,8): manchego real 90 g ≈ 351 → **+6 %**.
- **19** (1.301,4): 280 g de hamburguesa + 220 g de papas → correcto para esos gramos.
- **26** (260,7): croquetas reales 110 g ≈ 264 → **−1,3 %**.
- **06** (246,4): falla el piso **por 3,6 kcal (1,4 %)**; el número es exacto para la
  ficha y los gramos, y `predicciones.md` ya declaraba que "la ficha subestima un risotto".

**Solo el 17 falla por un motivo real** (−44 % del plato porque el pollo quedó mudo).
Juzgado contra los gramos que la visión efectivamente midió, el criterio daría
**25 / 26 = 96,2 %**. **Este criterio sigue midiendo las predicciones de gramaje tanto
como al motor, y ahora todavía más que en v1** (5 de 6 contra 4 de 6).

### Criterio 3 · Fichas equivocadas con confianza ≥ 0,60 — **PASA** (condición dura)

| ítem | ficha equivocada | confianza |
|---|---|---|
| 16 `cured ham, serrano/iberico` | Jamón (cocido) | **0,203** |
| 28 `honey toast…` ×2 | Miel | **0,047 / 0,048** |

**0 de 68 ítems. PASA.**

**Y el margen se abrió mucho.** En v1 la condición se salvaba **por 9 centésimas** (el
*Buñuelo* a 0,51). Ahora **la ficha equivocada de mayor confianza está a 0,203** —
**cuatro décimas de margen**. Los tres ❌ de v1 (0,196 · 0,095 · **0,51**) desaparecieron
y el único nuevo entra por abajo.

Cruzado al revés: **20 ítems se muestran a ≥ 0,60 y los 20 tienen ficha correcta o
nutricionalmente equivalente** (el único 🟡 de ese grupo es `bread roll` → *Pan*, 267 vs
279 = −4 %). **Cero equivocadas por encima del 60 %, igual que en v1, pero ahora sin
que nada roce el umbral.**

### Criterio 4 · Negativos — **PASA** (era FALLA) — **con una interpretación cargando el peso**

| # | caso | resultado | juicio |
|---|---|---|---|
| 10 | bicicleta | `is_food: false` | ✅ |
| 28 | comida de plástico | `is_food: true`, 2× Miel a 0,047 · **`completo: false`**, `macro_pct: null`, motivo publicado · conf. visión **0,55** | **🟡** [interpretación] |
| 29 | plato vacío | `is_food: false` | ✅ |
| 30 | envase cerrado | `is_food: false` | ✅ |

Umbral: **4 de 4 con ≥ 3 en ✅**. Salió **4 de 4 con 3 ✅ y 1 🟡: PASA, justo en el
umbral.**

**Lectura alternativa, dicha en voz alta:** si el 28 se juzga ❌ por la letra del 🟡
(pedía confianza de visión < 0,5 y salió 0,55), **el criterio 4 vuelve a FALLAR**.
El argumento para el 🟡 es que el ❌ escrito era una **conjunción** ("confianza alta **y**
un total en firme") y **el segundo término ya no se cumple de ninguna manera**: la
respuesta se niega explícitamente a publicar el total. La compuerta de la card 2.8 hizo
exactamente lo que el informe anterior pedía en su punto 2.

### Criterio 5 · Silencio sobre comida catalogada — **PASA** (era FALLA)

Los **10** `no_catalogado`, censados **uno por uno contra `foods.canonical.json` 3.1.0**:

| # | término | ¿existe ficha? |
|---|---|---|
| 09 | `corn arepa with cheese, grilled` | **NO** — `arepa` = 0 coincidencias |
| 17 | `chicken thigh, roasted` | **SÍ** `fdc-2705930` Pollo con piel (196) / `fdc-2705935` (164) |
| 20 | `sweet corn, cooked` | **SÍ** `fdc-2709914` Maíz fresco cocido (106) / `fdc-2709916` (88) |
| 21 | `cabbage, cooked` | **SÍ** `fdc-2709890` Repollo verde cocido (55) |
| 22 | `baked beans, canned in tomato sauce` | **NO** — 0 coincidencias |
| 22 | `cucumber, sliced` | **SÍ** `fdc-168409` Pepino crudo con cáscara (15,9) |
| 23 | `grilled potato slice` | **SÍ** `fdc-2709403` Papa asada con cáscara (126) |
| 23 | `green chili pepper, grilled` | **parcial** — `fdc-2709799` Pimientos crudos (27); asado no existe |
| 27 | `beer` ×2 | **NO** — cerveza = 0 coincidencias |

**5 / 66 = 7,58 %** → umbral ≤ 10 %. **PASA.**
Contando el parcial: **6 / 66 = 9,09 % → PASA igual.**

**De 16,7 % a 7,6 %. Y desde el punto de partida del proyecto (59 %), −51 puntos.**

**Los 5 silencios que quedan tienen UNA sola causa raíz, y es distinta de la de v1.**
En v1 la causa era *"el término trae un modificador de corte que la ficha no lleva"*
(`sliced`, `shredded`, `slices`). **Eso está resuelto** —`apple slices` y
`carrot, shredded`, con el término idéntico, ahora matchean. La causa que queda es **la
inversa**: **el nombre de la ficha trae una cola descriptiva de USDA que el término no
tiene**, y la cobertura se hunde:

| término | nombre de la ficha que no alcanza |
|---|---|
| `chicken thigh, roasted` | `Chicken, NS as to part **and cooking method, skin eaten**` |
| `sweet corn, cooked` | `Corn, canned, cooked, **fat added, NS as to fat type**` |
| `cabbage, cooked` | `Cabbage, **green**, cooked, **fat added, NS as to fat type**` |
| `cucumber, sliced` | `Cucumber, **with peel**, raw` |
| `grilled potato slice` | `Potato, roasted, **from fresh, peel eaten, NS as to fat**` |

**5 de 5.** El motor ya sabe sacar los marcadores `NFS` y `NS as to fat` (lo dice en los
motivos de los platos 04, 17 y 23); **no** sabe sacar `fat added, NS as to fat type`,
`with peel`, `from fresh, peel eaten`, `NS as to part and cooking method`.

---

## 4 · Tablero final — v1 → v2

| # | Criterio | v1 | v2 | Umbral | v1 | v2 |
|---|---|---|---|---|---|---|
| 1 | Ítems con ficha correcta | 39/66 = **59,1 %** | **48/66 = 72,7 %** | ≥ 75 % | FALLA | **FALLA** |
| 2 | Platos con kcal en rango | 20/26 = **76,9 %** | **20/26 = 76,9 %** | ≥ 80 % | FALLA | **FALLA** |
| 3 | Fichas equivocadas ≥ 0,60 | 0 de 68 (máx **0,51**) | **0 de 68 (máx 0,203)** | 0 | PASA | **PASA** |
| 4 | Negativos bien manejados | **3/4**, 1 ❌ | **4/4, 3 ✅ + 1 🟡** | 4/4, ≥3 ✅ | FALLA | **PASA** |
| 5 | Silencio sobre comida catalogada | 11/66 = **16,7 %** | **5/66 = 7,6 %** | ≤ 10 % | FALLA | **PASA** |

**Juicios por plato:** v1 **17 ✅ · 8 🟡 · 5 ❌** → v2 **21 ✅ · 9 🟡 · 0 ❌**.
**Los cinco ❌ desaparecieron. No apareció ninguno nuevo.**

---

## 5 · Tabla delta de los 30

| # | Plato | v1 → v2 | conf. principal | Causa del cambio |
|---|---|---|---|---|
| 01 | Manzana | ✅ → ✅ | 0,95 → 0,95 | igual (visión idéntica) |
| 02 | Croissant | ✅ → ✅ | 0,95 → 0,95 | igual (visión idéntica) |
| 03 | Paella | 🟡 → **✅** | 0,185 → 0,121 | **visión** (600 → 450 g mete el total en rango) |
| 04 | Tortilla | 🟡 → 🟡 | 0,95 → 0,95 | igual (gramaje) |
| 05 | Lasaña | ✅ → ✅ | **0,68 → 0,144** | **visión** (pierde la vía alias; misma ficha) |
| 06 | Risotto | ❌ → **🟡** | 0 → **0,244** | **motor** (nombre partido ya matchea) · falla el piso por 3,6 kcal |
| 07 | Bife + papas | ✅ → ✅ | 0,434 → 0,459 | igual |
| 08 | Lentejas | ✅ → ✅ | 0,162 → 0,162 | **motor+visión** (6/6 con ficha; la lima matchea pero sin el `halved`) |
| 09 | Arepa | ✅ → ✅ | 0 → 0 | igual (hueco real) |
| 10 | Bicicleta | ✅ → ✅ | — | igual |
| 11 | Plátano | ✅ → ✅ | 0,98 → 0,98 | igual (visión idéntica) |
| 12 | Naranja | ✅ → ✅ | 0,285 → 0,285 | igual |
| 13 | Huevos fritos | ✅ → ✅ | 0,825 → 0,808 | igual |
| 14 | Manchego | 🟡 → 🟡 | 0,375 → 0,40 | igual (alias 0,5 sigue vivo) |
| 15 | Pan tostado | 🟡 → 🟡 | 0,722 → 0,722 | igual (la visión sigue sin ver la manteca) |
| 16 | Jamón serrano | **✅ → 🟡** | **0,72 → 0,203** | **visión + motor** (`/iberico` rompe el alias) — **REGRESIÓN** |
| 17 | Pollo/arroz | ❌ → **🟡** | 0,196 → 0 (silencio) | **catálogo** (alias `Asado` extirpado) |
| 18 | Huevos rotos | ✅ → ✅ | 0,765 → 0,765 | igual (la receta sigue sin activarse) |
| 19 | Hamburguesa | 🟡 → 🟡 | 0,207 → 0,14 | igual (gramaje) |
| 20 | Ensalada | ✅ → ✅ | 0,808 → 0,808 | **motor** (`carrot, shredded` matchea; lechuga más precisa) |
| 21 | Cocido | ✅ → ✅ | 0,459 → 0,459 | **visión** (6/7 con ficha; aparece la morcilla) |
| 22 | Desayuno | 🟡 → **✅** | 0,51 → 0,51 | **visión** (aparece el queso crema → 5 fichas) |
| 23 | Salmón | ❌ → **✅** | 0,095 → 0,107 | **catálogo** (alias `Filete` extirpado) **+ motor** (`apple slices`) |
| 24 | Espaguetis | ✅ → ✅ | 0,152 → 0,152 | igual |
| 25 | Gazpacho | ✅ → ✅ | 0,90 → 0,85 | igual |
| 26 | Croquetas | ❌ → **🟡** | 0,51 → 0,361 | **catálogo** (`Croqueta` migrado a *Croquetas de papa*) |
| 27 | Bocadillo | ✅ → ✅ | 0,88 → 0,90 | igual (pero la hipótesis `names.en` no se re-probó) |
| 28 | Plástico | ❌ → **🟡** | 0,088 → 0,047 | **motor** (compuerta del total) + visión (0,70 → 0,55) |
| 29 | Plato vacío | ✅ → ✅ | — | igual |
| 30 | Envase cerrado | ✅ → ✅ | — | igual |

---

## 6 · Los focos del delta, uno por uno

| Foco | Resultado | Atribución |
|---|---|---|
| **17 · ¿el pollo dejó de ser costilla de res?** | **SÍ.** `chicken thigh, roasted` → `no_catalogado`. `fdc-169510` ya no tiene el alias `Asado`; hoy es `Tira de asado` (0,8). | **Catálogo.** Limpio: el término de la visión es idéntico al de v1. |
| **23 · ¿el salmón dejó de ser bife?** | **SÍ.** → `fdc-2706224` *Pescado* (238 kcal/100 g), dentro de la banda 170–270 que el ✅ pedía. `fdc-2705824` *Bife* ya no tiene el alias `Filete`. | **Catálogo.** El término cambió un poco (`sauteed`→`braised`), pero el alias tóxico está verificablemente borrado. |
| **26 · ¿croquetas → Croquetas de papa?** | **SÍ.** `fdc-2708024` *Buñuelo* tiene `aliases.es: []`; `fdc-2709511` recibió `Croqueta` 0,5. 260,7 kcal contra 264 reales: **−1,3 %** (antes +57 %). | **Catálogo.** **Término idéntico a v1: atribución limpia.** |
| **28 · ¿el plástico sigue con `is_food: true`?** | **SÍ, sigue en `true`.** | Visión. No cambió. |
| **28 · ¿la compuerta apagó el total?** | **SÍ, la declaración:** `completo: false`, `macro_pct: null` y un motivo publicado al usuario. **NO el payload:** `totals.nutrients.kcal` sigue valiendo **1.550,4**. Los ítems se muestran igual. | **Motor** (card 2.8). Reparo abierto abajo. |
| **06 · ¿el risotto encontró el arroz amarillo?** | **SÍ.** `fdc-2708419` *Arroz amarillo cocido* a 0,244. El motivo documenta la capacidad nueva de nombre partido. Se queda a **3,6 kcal** del piso del rango escrito. | **Motor.** La visión cambió el modificador (hongos→azafrán) pero la forma del nombre partido es la misma. |
| **Silencios de cortes (`apple slices` y familia)** | **RESUELTOS.** `apple slices` y `carrot, shredded` — **términos idénticos a v1** — ahora matchean. También `tomato slice`, `lettuce, iceberg, shredded`, `ham, sliced`. **Lo que NO se resolvió es otra cosa**: las fichas con cola descriptiva USDA (`fat added, NS as to fat type`, `with peel`, `NS as to part and cooking method`) — 5 de 5 silencios restantes. | **Motor**, con atribución limpia en 2 casos. |
| **Cero regresiones ✅ → ❌** | **CUMPLIDO: ninguna.** No hay ni un ❌ en toda la corrida. | — |

---

## 7 · Regresiones

**Una sola de juicio, y ninguna a ❌.**

| # | Regresión | Causa |
|---|---|---|
| **16** | ✅ → 🟡. *Jamón crudo* (195, alias 0,8, conf. 0,72) → ***Jamón* cocido** (117, difuso, conf. 0,203). **−40 % de calorías**, y es exactamente el gemelo caro que la predicción había marcado. | **Visión + motor.** La visión escribió `cured ham, serrano/iberico` en vez de `Serrano ham, cured`. **El alias `Jamón serrano` (0,8) sigue intacto en el catálogo, verificado**, y **en el plato 18 de esta misma corrida el término `cured ham, serrano` sí llegó a *Jamón crudo* a 0,64**. La única diferencia es el `/`. |

**Regresiones de confianza sin cambio de juicio (todas por visión, misma ficha):**
05 lasaña **0,68 → 0,144** · 03 paella 0,185 → 0,121 · 19 hamburguesa 0,207 → 0,14 ·
25 gazpacho 0,90 → 0,85 · 26 croquetas 0,51 → 0,361 (acá **es sano**: la ficha correcta
se muestra con más reserva que la equivocada de antes).

**Silencio nuevo:** el pollo del plato 17. Antes daba una ficha falsa (costilla de res),
ahora calla. **Es una mejora en veracidad y un empeoramiento en cobertura**, y arrastra
al plato 17 fuera del criterio 2.

---

## 8 · Veredicto en cristiano

**Pasan 3 de 5 criterios (antes 1 de 5). Todavía no es apto para mercado por la vara
que se fijó, pero el sistema dejó de mentir.**

**Lo que se arregló, y es sustancial:**
- **Los tres alias tóxicos están extirpados y verificados en el catálogo.** Los tres ❌
  que dependían de ellos (17, 23, 26) desaparecieron. **La corrección de daño más grande:
  las croquetas pasaron de +57 % a −1,3 % contra la realidad.**
- **La condición dura (criterio 3) ya no se salva por nueve centésimas: se salva por
  cuatro décimas.** La peor ficha equivocada del set está a 0,203.
- **El criterio 5 pasa** (7,6 %), y el criterio 4 pasa **con una interpretación**.
- **Cero ❌ en 30 platos.**

**Lo que falla, y de quién es la culpa:**

1. **Criterio 2 (76,9 %) — el criterio está mal calibrado, no el motor.** De los 6 platos
   fuera de rango, **5 tienen la ficha correcta y aritmética exacta** y se salen porque la
   visión midió gramos distintos de los que se predijeron; uno de esos 5 falla **por
   3,6 kcal**. Contra los gramos que la visión efectivamente reportó el criterio daría
   96,2 %. **Solo el plato 17 falla por un motivo real.** Este criterio, tal como está
   escrito, mide las predicciones de gramaje tanto como al producto.
2. **Criterio 1 (72,7 %) — motor, y le faltan 1,5 ítems.** Está en el borde superior de la
   zona de duda y **pasa con dos de las tres varas razonables** (77,3 % si los silencios
   honestos sobre huecos reales cuentan ✅ como se le concedió al arepa; 84,8 % contando
   los 🟡). Lo que lo baja son **9 silencios**, y **5 tienen una sola causa de motor**:
   la cola descriptiva de USDA en el nombre de la ficha.
3. **La regresión del plato 16 — visión que dispara un límite del motor.** El `/` de
   `serrano/iberico` rompe el alias. El plato 18 de la misma corrida prueba que el alias
   funciona sin la barra.

**Lo MÍNIMO que falta, por relación daño/esfuerzo:**

1. **Normalizar la cola descriptiva de USDA en el nombre de la ficha antes de matchear**
   (`fat added, NS as to fat type`, `with peel`, `from fresh, peel eaten`,
   `NS as to part and cooking method`). El motor ya hace esto con `NFS` y `NS as to fat`.
   **Arregla 5 de los 9 silencios y con eso el criterio 1 sube a ~80 % y el plato 17
   vuelve a rango** (el pollo es uno de los cinco). Es **el único cambio que mueve dos
   criterios a la vez.**
2. **Tokenizar `/` como separador** en el término de la visión. Arregla la regresión del
   16 y cualquier `X/Y` futuro. Barato y acotado.
3. **Cerrar la compuerta hasta el final:** cuando `completo:false` por confianza
   insuficiente, **`totals.nutrients` no debería viajar con el número** (o el front no
   debe pintarlo). Hoy 1.550,4 kcal de plástico siguen en el JSON. **Sin esto, el
   criterio 4 depende de que el front se porte bien, y el front no se midió.**
4. **Recalibrar el criterio 2 antes de la próxima corrida:** juzgar el total contra los
   gramos que la visión reporta, no contra los predichos. Si no, el criterio va a seguir
   fallando por razones que no son del producto.
5. **Menor:** `fdc-2707149` *Salsa de carne* sigue perdiendo contra *Salsa mexicana* para
   `gravy`; `fdc-2709962` *Arvejas cocidas* pierde contra las crudas; el alias
   `Queso manchego` 0,5 sobre el parmesano sigue vivo (contenido, pero visible al usuario).

**Con los puntos 1 y 2 hechos, la lectura razonable es que 4 de 5 criterios pasan y el
criterio 2 queda como lo que es: una vara que hay que reescribir.** Eso es
**interpretación**, no medición: solo una corrida nueva lo puede confirmar.

---

## 9 · Salvedades de honestidad

- **Sin repetición: una foto por plato, una vez.** Este informe **no dice nada** sobre
  estabilidad entre corridas. Y sin embargo el delta **demuestra** que la variabilidad de
  visión es grande: **12 de 30 platos cambiaron ítems o gramos de forma sustancial** sobre
  las **mismas fotos**, y al menos 3 juicios (03, 22 y la regresión del 16) los decidió
  esa variabilidad, no el motor. **Medir estabilidad ya no es opcional para leer estos
  números.**
- **La cola de curación no se contó.** Las respuestas siguen sin traer
  `curation_candidates`; las claves de nivel superior son `scan_id`, `is_food`, `items`,
  `totals`, `meta`, `persisted` y `message_es`. No se afirma ningún conteo.
- **Nada del front se evaluó.** En particular, **no se sabe si el front muestra las
  1.550,4 kcal del plato 28** pese a `completo: false`.
- **Interpretaciones marcadas [interpretación]:** 06, 16, 17, 26, 28 (más la convención
  del 09 y la del arepa en el criterio 1). **La del 28 es la que carga más peso: de ella
  depende que el criterio 4 pase.** Se argumenta arriba y se da el resultado alternativo.
- **El criterio 1 depende de una convención de conteo** que el antecesor fijó (solo el
  arepa cuenta ✅ entre los silencios honestos). Con la convención simétrica pasaría.
  Se reportan los tres números.
- **Los focos 17 y 23 tienen la visión ligeramente cambiada**; la atribución al catálogo
  se sostiene igual porque los alias borrados se verificaron **directamente sobre
  `foods.canonical.json` 3.1.0**, no por inferencia desde la respuesta.
- **El foco de "cortes" está parcialmente contaminado**: `lime, halved` → `lime` fue la
  visión, no el motor. La atribución al motor se sostiene sobre `apple slices` y
  `carrot, shredded`, **términos idénticos entre las dos corridas**.
