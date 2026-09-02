# Evaluación del golden set de 30 — ¿apto para mercado?

**Qué se evaluó.** Las 30 respuestas reales del backend (`respuestas/NN-*.json`,
`kb 3.0.0+b2b227e1`, `claude-sonnet-5`, las 30 HTTP 200) contra `predicciones.md`,
escritas antes de correr. **Cero llamadas al endpoint y cero llamadas a ninguna API
para escribir esto**: todo salió de los JSON en disco y de
`kb/build/foods.canonical.json` (solo lectura).

**Qué NO se evaluó.** Nada de front. Una foto por plato, sin repetición: **este test
no mide estabilidad entre corridas** y ninguna conclusión de acá afirma nada sobre eso.
La cola de curación real (Firestore) **no se pudo contar** — ver §7.

**Convención de marcado.** Donde el criterio escrito en `predicciones.md` no decide el
caso real, la resolución va marcada **[interpretación]** y con su razón. Hay 8.

---

## 0 · Un error de aritmética en `predicciones.md` que hay que corregir

`predicciones.md` dice "se calculan sobre los **27 platos de comida** (01–09, 11–27)"
y fija el umbral 2 en "≥ 80 % (**22 de 27**)". Pero 01–09 son 9 y 11–27 son 17:
**son 26 platos de comida, no 27.** La propia tabla de composición del documento suma
8 + 11 + 5 + 2 = 26, más 4 negativos = 30. Es un desliz de conteo, no de diseño.

**Todos los porcentajes de acá abajo usan el denominador correcto: 26 platos.**
El umbral del criterio 2 pasa a ser **21 de 26** (80,8 %).

---

## 1 · El candado de aritmética

Se pedía verificar un plato al azar. Se verificaron **los 30**, que sale igual de barato:
para cada ítem con ficha, `grams × per_100g(catálogo) / 100 == nutrients`, y para cada
plato, `suma(items) == totals`.

**52 ítems con ficha · 52 correctos · 0 discrepancias.** Los 52 `food_id` existen en las
1.022 fichas, y los `per_100g` que devuelve la respuesta son idénticos a los del catálogo.

El plato desarrollado, **21 · Cocido madrileño**:

| ítem | ficha | g | per_100g | kcal |
|---|---|---|---|---|
| `chickpeas, cooked` | `fdc-2707414` Garbanzos cocidos | 180 | 211 | 379,8 |
| `chorizo sausage, cooked` | `fdc-2706179` Chorizo fresco | 60 | 341 | 204,6 |
| `beef shank, boiled` | `fdc-2705822` Carne de res | 90 | 231 | 207,9 |
| `pork belly, boiled` | `fdc-2705885` Tocino cocido | 80 | 484 | 387,2 |
| `pork meatball, boiled` | `fdc-2705862` Cerdo | 70 | 192 | 134,4 |
| | | **480 / 670 g** | | **1.313,9** |

`totals.kcal` = 1.313,9 ✓ · `grams_cuantificados` 480 ✓ · `grams_total` 670 ✓ ·
`items_incluidos` 5, `items_sin_datos` 2 ✓ · `completo: false` ✓.

**La capa de cálculo no es el problema. Nada de lo que sigue es un error de aritmética.**

---

## 2 · Los 30 platos, uno por uno

### 01 · Manzana — ✅
`apple, raw` → `fdc-2709215` Manzana cruda, **exacto, 0,95**, 180 g → **109,8 kcal**
(rango 70–140). Idéntico al test previo.

### 02 · Croissant — ✅
`croissant` → `fdc-2707678`, **exacto, 0,95**, 70 g → **284,2** (rango 200–330).

### 03 · Paella — 🟡 **[interpretación]**
`seafood paella` → `fdc-2706723` **Paella, la ficha predicha**, difuso, **0,185**,
600 g → **1.014 kcal** (rango 400–800).

El criterio escrito exigía las dos cosas: ficha 2706723 **y** 400–800 kcal. La ficha es
la correcta —**esto es DT-17 resuelta en el caso que la abrió**— pero el total se va del
rango. La causa es de gramaje, no de ficha: la predicción supuso una ración de 350 g y
la visión midió **la paellera entera, 600 g** (`fotos.md` del test previo ya avisaba que
la 03 es "una paella en la paellera, no emplatada"). 600 g × 1,69 = 1.014 es aritmética
correcta sobre una lectura defendible de la foto. **No es ✅ (el rango escrito manda) y
no es ❌ (el ❌ escrito era `no_catalogado`, que no ocurrió): queda 🟡.**

### 04 · Tortilla de patatas — 🟡 **[interpretación]**
`spanish tortilla, potato omelette` → `manual-tortilla-de-patatas`, alias, **0,95**,
600 g → **816 kcal** (rango 450–750).

Misma mecánica que el 03: **ficha perfecta**, rango excedido un 9 % porque la visión
estimó 600 g de tortilla entera contra los 450 predichos. El ❌ escrito
(`fdc-2707198` con confianza alta, o `no_catalogado`) no se disparó. 🟡.

### 05 · Lasaña — ✅
`lasagna, meat and spinach` → `fdc-2708755` Lasaña con carne y espinaca, alias, **0,68**,
350 g → **724,5** (rango 450–850). **Era ❌ en el test previo.**

### 06 · Risotto de hongos — ❌
`yellow rice with mushrooms, cooked` → **`no_catalogado`**, `totals: null`.
El criterio escrito era explícito: **❌ no_catalogado**.

**Es el único plato del set que no se movió ni un milímetro entre los dos tests.** Y es
un silencio sobre comida catalogada: `fdc-2708419` *Arroz amarillo cocido*
(`Yellow rice, cooked, NS as to fat`, 88 kcal/100 g) existe y estaba nombrada en la
predicción. El motor **sí** sabe sacar los marcadores USDA (lo hace en los platos 17, 23
y 08, y lo dice en el motivo). Lo que lo mata es el modificador intercalado:
normalizado, la ficha es `yellow rice cooked` y la visión dijo
`yellow rice with mushrooms cooked` — **el nombre está pero partido en dos, y el difuso
solo sabe de secuencias contiguas de palabras.** Es la causa C del informe previo, viva.

### 07 · Bife con papas y ensalada — ✅
5 ítems, **5 con ficha**, total **920,5 kcal** (rango 750–1.250), `completo: true`.
- `beef steak, grilled` → `fdc-2705824` **Bife** (0,434) ✅
- `french fries` → `fdc-2709456` Papas fritas (0,808) ✅
- `coleslaw` → `fdc-2709815` **exacto** (0,85) ✅
- `ketchup` → `fdc-2709733` (0,95) ✅
- `gravy, brown sauce` → `fdc-2709736` **Salsa mexicana** (0,139) 🟡

**Es el arreglo más grande del test: el mismo plato devolvía 43,6 kcal (solo el kétchup)
en la corrida anterior.** El único reparo es el `gravy`: cayó en *Salsa mexicana*
(`Salsa, NFS`, 34 kcal/100 g) en vez de *Salsa de carne* (`Gravy, NFS`, 53). Es otra
salsa, pero del mismo orden nutricional y son **6 kcal de diferencia sobre un plato de
920** — por el estándar del test ("aproximada razonable ≠ equivocada") es 🟡, no ❌.

### 08 · Lentejas guisadas — ✅
6 ítems, **5 con ficha**, total **1.119,15 kcal** (rango 750–1.250),
`completo: false`, 555/595 g = **93 % cuantificado**. Criterio: ≥3 de 5 con ficha.
- `lentil stew with meat` → `fdc-2707423` **Lentejas COCIDAS** (0,162) ✅ —
  **la trampa cara del set no mordió**: no eligió `fdc-172420` *Lentejas crudas*
  (352 kcal/100 g), que habría duplicado el plato.
- `bread roll` → `fdc-2707591` *Pan* (267) en vez de *Panecillo* (279) 🟡
- `crackers` → `fdc-2708132` *Galletas saladas* (510) en vez de *saltinas* (416) 🟡
- `pita bread` → `fdc-2707591` *Pan* 🟡 (no hay pita en el catálogo)
- `lime, halved` → **`no_catalogado`** — `fdc-168155` *Lima cruda* existe. Silencio.
- `hot sauce` → `fdc-2710177` *Salsa* (`Sauce, NFS`, 109) 🟡 — sobreestima una salsa
  picante (~15 kcal/100 g) por 7×, pero son **21,8 kcal absolutos**.

### 09 · Arepa rellena — ✅
`corn arepa with cheese, grilled` → `no_catalogado`, `confidence: 0`, `nutrients: null`,
`totals: null`, motivo escrito, y **se negó a componer** ("componer con los ingredientes
que sí están daría un valor por 100 g de otro plato"). Hueco real verificado.

### 10 · Bicicleta — ✅
`is_food: false`, sin ítems, con `message_es`. 16 tokens de salida.

### 11 · Plátano — ✅
`banana, raw` → `fdc-173944` Banana cruda, **exacto, 0,98**, 120 g → **106,8**
(rango 85–160).

**El riesgo del plural no mordió: `banana, raw` llegó a `Bananas, raw` por vía EXACTA.**
La causa D del informe previo (singular contra plural) **está resuelta**. Lo que queda
—y se ve en `lime, halved` del plato 08— no es el plural: es el modificador que la ficha
no tiene.

### 12 · Naranja — ✅
`orange, peeled, raw` → `fdc-169097` Naranja cruda, difuso, **0,285**, 180 g → **84,6**
(rango 45–100). Ficha correcta y kcal en rango. La cola USDA
(`, all commercial varieties`) ya no bloquea, pero la confianza que el usuario ve para
una naranja obvia es **28,5 %** (la visión estaba al 95 %).

### 13 · Dos huevos fritos — ✅
`fried egg` → `fdc-2707155` Huevo frito, alias, **0,825**, 120 g → **222** (rango 140–300).
No cayó en *Huevo crudo*, que era el ❌ escrito.

### 14 · Queso manchego — 🟡 **[interpretación]**
`manchego cheese, sliced` → `fdc-2705730` **Queso parmesano en trozo** vía el alias
`Queso manchego` (confianza declarada 0,5) → **confianza final 0,375**, 90 g → **370,8**
(rango 160–300).

**La reserva del alias se respetó exactamente como se pidió**: el criterio ✅ admitía
2705730 **con confianza ≤ 50 %**, y salió 0,375. El ❌ era mostrarlo **> 60 %**, y no
ocurrió. El rango se pasa otra vez por gramaje (90 g de lonchas contra los 60 predichos;
90 g de manchego real ≈ 351 kcal, la medida está a +6 %). **🟡: la ficha es
nutricionalmente defendible y la reserva es visible.**

Reparo de producto, no de test: **el usuario español lee "Queso parmesano en trozo"
sobre un manchego.** Está al 37,5 %, pero está.

### 15 · Dos tostadas con manteca — 🟡 **[interpretación]**
**Un solo ítem**: `toasted bread, white` → `fdc-2707592` Pan tostado, alias, **0,722**,
60 g → **175,8** (rango 170–330). `completo: true`, 60/60 g.

**La manteca no aparece: la visión no la devolvió.** El criterio 🟡 escrito pedía
"solo el pan (176 kcal) **con `completo:false`**", y salió con `completo: true`. Ese
`true` es correcto desde el motor (cuantificó todo lo que la visión le pasó) y engañoso
desde el usuario: la realidad son ~248 kcal y muestra 175,8, **−29 %**.

Se resuelve 🟡 y no ❌ porque **(a)** el número cae dentro del rango escrito 170–330,
**(b)** el ❌ escrito (*Tostada francesa* o `no_catalogado`) no se disparó, y **(c)** la
pérdida nace en la visión, no en el matching. **Queda anotado como hallazgo separado: el
motor no puede declarar incompletitud sobre lo que la visión nunca vio.** Es el hueco de
`completo` que este plato existía para encontrar, y lo encontró.

### 16 · Jamón serrano — ✅
`Serrano ham, cured` → `fdc-2705879` **Jamón crudo** vía alias `Jamón serrano` (0,8),
**0,72**, 80 g → **156** (rango 100–220). **El gemelo caro no se disparó**:
`fdc-2705878` *Jamón* (cocido, 117) habría perdido el 40 % de las calorías.

### 17 · Pollo con arroz y verduras — ❌ **[interpretación]**
Total **542,7 kcal** (rango 400–650 ✓), `completo: false`, 270/380 g = 71 %.
- `chicken thigh, roasted` → **`fdc-169510` Costilla de res a la parrilla** (291 kcal/100 g)
  vía el alias `Asado` (0,8). Confianza final **0,196**. 120 g → 349,2 kcal.
- `white rice, cooked` → `fdc-2708403` Arroz blanco cocido, **exacto**, 0,765 ✅
- `mixed vegetables (peas, carrots, potatoes), cooked` → `no_catalogado`
  (`fdc-2710016`/`2710017` *Verduras mixtas cocidas* existen).

Por el conteo escrito esto era 🟡 (2 de 3 con ficha + `completo:false`). **Se resuelve ❌
porque el conteo del plato no mira si la ficha es correcta, y el marco general de
`predicciones.md` sí: "❌ = ficha semánticamente falsa".** Le puso **costilla de vaca a un
muslo de pollo**: otra especie, +49 % de kcal contra la ficha predicha (196 vs 291).

**Es el primer error no forzado de identificación del proyecto** — en 17 ítems del test
previo hubo cero. Está al 19,6 %, así que **no viola la condición dura** (criterio 3).

### 18 · Huevos rotos con jamón — ✅
3 ítems, **3 con ficha**, total **752** (rango 700–1.050), `completo: true`.
Papas fritas (0,765) + Huevo frito (0,32) + Jamón crudo (0,68).

El criterio aceptaba explícitamente "la receta **o** la composición de 3". Ganó la
composición: **`receta-huevos-rotos` no se activó.** No es fallo por el criterio escrito,
pero sí un dato sobre las 9 recetas compuestas del catálogo: la que este plato existía
para probar no ganó, y ganó la ruta alternativa.

### 19 · Hamburguesa con papas — 🟡 **[interpretación]**
2 ítems, **2 con ficha correcta**, total **1.368,9** (rango 700–1.200).
`hamburger with egg and cheese, sesame bun` → `fdc-2706920` Hamburguesa (0,207), 280 g →
806,4 · `french fries` → `fdc-2709456` (0,765), 250 g → 562,5.

El criterio ✅ ampliaba el techo "**hasta 1.700 si cuenta la mesa entera**". **No contó la
mesa**: contó una sola hamburguesa y unas papas, con gramajes generosos (280 g y 250 g
contra 200 y 150 predichos). Como la ampliación estaba condicionada y la condición no se
cumplió, el total queda fuera del rango aplicable → 🟡, **con la misma vara que 03, 04 y
14**. Las dos fichas son las correctas.

### 20 · Ensalada mixta — ✅
7 ítems, **5 con ficha**, total **263,7** (rango 250–550), `completo: false`,
325/400 g = 81 %. Criterio ✅: ≥5 ítems con ficha, 250–550. **Se cumple.**
Huevo cocido (0,808) · Atún (0,118) · Lechuga cruda (0,291) · Tomate crudo (0,27) ·
Remolacha cruda (0,216, 🟡: la encurtida sería `fdc-169966`, 31 vs 44,6) ·
`sweet corn, canned` y `carrot, shredded` en silencio, **teniendo ficha los dos**.

Dos cosas buenas que no estaban en la predicción: **no colapsó los 7 ingredientes en una
ficha genérica de "ensalada"** (el ❌ escrito), y **avisa el crudo/cocido en el motivo**
("OJO: la ficha es la del alimento CRUDO y lo que se identificó no dijo que lo estuviera").

Salvedad honesta: el aliño —**el 35 % de las calorías de una ensalada**— no lo devolvió
la visión, así que las 263,7 kcal son correctas sobre lo que se vio y bajas sobre el plato.

### 21 · Cocido madrileño — ✅
7 ítems, **5 con ficha**, total **1.313,9** (rango 800–1.300), `completo: false`,
480/670 g = **71,6 %**.

El total se pasa del techo por **14 kcal (1 %)**, pero el criterio agregado 2 dice
textualmente: en rango "**o que declaran `completo:false` habiendo cuantificado ≥ 70 % de
los gramos**". 71,6 % ≥ 70 % → **cuenta en regla, sin interpretación.**

**Y la trampa específica del plato no se disparó**: el alias `Cocido madrileño` (0,5)
podía colapsar todo el plato en los garbanzos y devolver ~317 kcal. **Descompuso en 7
ítems.** Garbanzos ✅ · Chorizo fresco ✅ · Tocino cocido ✅ (484, la ficha predicha) ·
Carne de res 🟡 · Cerdo 🟡 · `cabbage, cooked` y `chicken breast, boiled` en silencio,
**teniendo ficha los dos** (`fdc-2709890` y `fdc-2705938` *Pollo guisado*).

### 22 · Desayuno completo — 🟡
6 ítems, **4 con ficha**, total **624,4** (rango 600–1.000), `completo: false`,
280/510 g = 55 %. Criterio ✅ pedía ≥5 con ficha; 🟡 pedía "4 ítems + las alubias en
`no_catalogado`". **Salió eso, más un silencio de más** (`cucumber, sliced`, con
`fdc-168409` *Pepino crudo* en el catálogo). → 🟡, por el criterio escrito.

**La simetría deliberada con el plato 16 funcionó, y es el mejor resultado conceptual del
test:** el mismo `fdc-2705878` *Jamón* (117 kcal, cocido) que en el 16 habría sido el
error, acá **es el acierto** — y en el 16 eligió `fdc-2705879` *Jamón crudo* (195).
**La ficha correcta dependió del plato, no del término.**
`baked beans` en silencio es honesto: hueco real verificado (0 coincidencias).

### 23 · Salmón con guarnición — ❌ **[interpretación]**
7 ítems, **3 con ficha**, total **566** (rango 500–900 ✓), `completo: false`,
280/425 g = 66 %.
- `fish fillet, sauteed with brown sauce` → **`fdc-2705824` Bife** (`Beef, steak, NFS`,
  229 kcal/100 g) vía el alias español **`Filete`**. Confianza final **0,095**.
  150 g → 343,5 kcal.
- `coleslaw with mayonnaise and tomato` → `fdc-2709815` ✅ (0,33) · `toasted bread` →
  `fdc-2707592` ✅ (0,595)
- **Cuatro silencios**: `grilled potato slice` (`fdc-2709403` existe) ·
  `apple slices` (**`fdc-2709215` existe — y este mismo motor la matcheó exacta al 95 % en
  el plato 01**) · `carrot slices, cooked` (`fdc-2709670` existe) ·
  `grilled green chili pepper` (hay pimientos crudos, no asados).

El ❌ escrito era nominal —"*Lomi salmón* elegido para el salmón"— y **no ocurrió**: la
visión ni siquiera dijo "salmon". Pero el fallo que el plato existía para cazar sí
ocurrió, en una familia peor: **le puso carne de vaca a un filete de pescado**, y ninguna
de las tres puertas escritas (✅ / 🟡 / ❌) describe eso. Se resuelve **❌** por el marco
general (ficha semánticamente falsa) y porque el ✅ pedía ≥3 guarniciones con ficha y hubo 2.

**Reparo honesto en contra de mi propio ❌:** en kcal, *Bife* (229/100 g) y un salmón a la
plancha (~208/100 g) están a un 10 % — **el número casi no miente; lo que miente es el
nombre.** Lo marco ❌ igual, porque "Bife" sobre un salmón es indefendible como producto y
porque el perfil de grasas no es el mismo, pero el lector tiene que saber que el daño
calórico acá es chico. La confianza es **0,095**: no viola la condición dura.

### 24 · Espaguetis con albóndigas — ✅
2 ítems, **2 con ficha**, total **702,8** (rango 450–750), `completo: true`.
`fdc-2708828` *Pasta con salsa* (0,152) + `fdc-2706467` *Albóndigas con salsa* (0,150):
**exactamente el camino limpio que la predicción marcó**. El ❌ escrito
(`fdc-2709141` *Plato congelado*, ficha semánticamente falsa para un plato casero)
**no se disparó**. Salvedad menor: la salsa se cuenta dos veces (las dos fichas la
incluyen), y aun así el total cae en rango.

### 25 · Gazpacho — ✅
`gazpacho` → `fdc-2710106`, alias, **0,90**, 300 g → **78** (rango 50–90).
La confianza más alta de todo el bloque español. El vocabulario curado funciona cuando la
visión escribe la palabra sola.

### 26 · Croquetas — ❌ **[interpretación]**
`croquette, breaded and fried` → **`fdc-2708024` Buñuelo** (`Fritter, plain`, 378 kcal/100 g,
un frito **dulce**) vía el alias `Croqueta` (0,6) → confianza final **0,51**,
110 g → **415,8 kcal**.

Cae en la grieta exacta entre las dos puertas escritas:
- El 🟡 pedía **dos** cosas: *Buñuelo* con confianza **≤ 0,50** **y** kcal 200–300.
  **Falla las dos**: 0,51 y 415,8.
- El ❌ pedía confianza **> 0,60**. **0,51 no llega**, por 9 centésimas.

Se resuelve **❌** porque falla íntegro el único 🟡 disponible, y porque el daño está
medido: croquetas de jamón reales ≈ 240 kcal/100 g → 110 g = **264 kcal**. El sistema
muestra **415,8: +57 %**, con el nombre "Buñuelo" encima.

**Y hay que decirlo con todas las letras: este ❌ no rompe el criterio 3.** Está a 0,51.
La condición dura del test se salva por nueve centésimas, no por diseño.

### 27 · Bocadillo de calamares — ✅
`fried squid sandwich (bocadillo de calamares)` → **`receta-bocadillo-de-calamares`**,
alias, **0,88**, 260 g → **653,31** (rango 450–700). Más dos `beer` en silencio honesto
(**cerveza = 0 coincidencias en las 1.022**, verificado).

**La hipótesis del plato se confirmó, y es el hallazgo más accionable del test.** Su
`names.en` es `Fried calamari sandwich (bocadillo de calamares)` — la misma forma que la
tortilla del plato 04 (`Spanish potato omelette (tortilla de patatas)`), que también
matcheó al 0,95. **2 de 2. Deja de ser anécdota: `names.en` = *nombre genérico inglés
(nombre regional)* es una regla de curación**, porque es literalmente lo que el modelo
tiende a escribir.

Salvedad: `completo: false` con 260/890 g = 29 % cuantificado — pero **los 630 g que
faltan son cerveza**. El denominador de gramos mezcla líquidos con comida y arruina la
señal de completitud en cualquier plato con bebida.

### 28 · Comida de plástico — ❌
**`is_food: true`**, 2 ítems, ambos → **`fdc-169640` Miel** (`Honey`, 304 kcal/100 g),
confianza de visión **0,70**, confianza final 0,088.
Total **1.550,4 kcal**, **`completo: true`**, 510/510 g.

- El ✅ era `is_food: false`. No.
- El 🟡 admitía `is_food: true` **con confianza de visión < 0,5**. Salió **0,70**. No.
- El ❌ era "`is_food: true` con confianza alta **y un total de calorías en firme**".

**[interpretación]** "confianza alta" es ambiguo entre la de visión (0,70) y la final
(0,088). Se resuelve por el lado del usuario, que es lo que el producto afirma:
**1.550,4 kcal con `completo: true` y `grams_cuantificados == grams_total` es un total en
firme**, y está calculado sobre **dos réplicas de resina en una vitrina**. Agravante que
la predicción no anticipó: la ficha es **Miel** para una tostada con crema batida — tomó
una palabra del nombre del postre (`honey toast`) y le puso los 304 kcal/100 g de la miel
pura a 510 g de plástico.

**Este es el ❌ que rompe el criterio 4.**

### 29 · Plato vacío — ✅
`is_food: false`. **El negativo más probable en producción, resuelto.** No leyó el brillo
del plato como comida y no devolvió `0 kcal` como medición.

### 30 · Envase cerrado — ✅
`is_food: false`. **No leyó las fotos impresas de la tapa.** El fallo que este caso existía
para cazar —devolver ají, tomate, manzana y romero de las ilustraciones— **no ocurrió**, y
tampoco leyó la etiqueta ("Tandoori Chicken Sandwich, 120 g"), que habría sido el 🟡.
El negativo más discutible del set salió limpio.

---

## 3 · Los cinco criterios agregados, con las cuentas a la vista

**Universo.** 26 platos de comida (01–09, 11–27) → **66 ítems devueltos por la visión**.
Vías: **8 exacto · 16 alias · 26 difuso · 16 `no_catalogado`**.
Los 4 negativos (10, 28, 29, 30) se cuentan aparte, en el criterio 4.

### Criterio 1 · Ítems con ficha correcta — **FALLA**

| | ítems | detalle |
|---|---|---|
| ✅ ficha correcta | **39** | |
| 🟡 aproximada razonable | **9** | 07 gravy→Salsa mexicana · 08 bread roll→Pan · 08 crackers→Galletas saladas · 08 pita→Pan · 08 hot sauce→Salsa · 14 manchego→parmesano · 20 remolacha cruda vs de lata · 21 beef shank→Carne de res · 21 pork meatball→Cerdo |
| ❌ ficha equivocada | **3** | 17 `chicken thigh`→**Costilla de res** · 23 `fish fillet`→**Bife** · 26 `croquette`→**Buñuelo** |
| silencio (`no_catalogado`) | **15** | + el arepa, que cuenta ✅ por ser hueco real |

- Lectura literal del criterio (**✅ ÷ total**): **39 / 66 = 59,1 %** → umbral ≥ 75 %.
  **FALLA**, y cae por una décima en la banda "no apto" (< 60 %).
- Lectura generosa (**✅ + 🟡**, ya que el set define 🟡 como "aprobado con reserva"):
  **48 / 66 = 72,7 %** → **FALLA igual**, zona de duda (60–75 %).

**Se falla con cualquiera de las dos varas**, así que el resultado no depende de esa
ambigüedad.

### Criterio 2 · Platos con kcal en rango — **FALLA**

Regla escrita: total dentro del rango declarado **o** `completo:false` con ≥ 70 % de los
gramos cuantificados. Denominador corregido: **26 platos**.

| en regla (20) | fuera (6) |
|---|---|
| 01 · 02 · 05 · 07 · 08 · 09* · 11 · 12 · 13 · 15 · 16 · 17 · 18 · 20 · **21**† · 22 · 23 · 24 · 25 · 27 | **03** 1.014 / 400–800 · **04** 816 / 450–750 · **06** sin total · **14** 370,8 / 160–300 · **19** 1.368,9 / 700–1.200 · **26** 415,8 / 130–220 |

\* **[interpretación]** El 09 (arepa) no tiene rango declarado para su ✅: su
comportamiento correcto **era** no dar número. Se cuenta en regla.
† El 21 entra por la segunda cláusula, no por el rango (1.313,9 con 71,6 % cuantificado).

**20 / 26 = 76,9 %** → umbral ≥ 80 % (21 de 26). **FALLA**, zona de duda (65–80 %).

Robustez: si se excluyen del denominador los 2 platos "no catalogado por diseño" (06 y 09),
queda **19 / 24 = 79,2 %** — **sigue fallando**.

**Sensibilidad, que es la parte importante [interpretación]:** de los 6 fuera de rango,
**4 (03, 04, 14, 19) tienen la ficha correcta y aritmética impecable, y se salen solo
porque la visión midió más gramos que los que yo predije.** Si se juzgaran contra los
gramos que la visión efectivamente reportó, entrarían los cuatro y el criterio daría
**24 / 26 = 92,3 %, que PASA**. Los dos que fallan por motivo real son **06** (no dio
ningún número) y **26** (ficha equivocada). **Este criterio está midiendo mis
predicciones de gramaje tanto como el motor, y hay que decirlo.**

### Criterio 3 · Fichas equivocadas con confianza ≥ 0,60 — **PASA** (condición dura)

Los 3 ítems ❌ del set de comida, con su confianza final:

| ítem | ficha equivocada | confianza |
|---|---|---|
| 17 `chicken thigh, roasted` | Costilla de res a la parrilla | **0,196** |
| 23 `fish fillet, sauteed…` | Bife | **0,095** |
| 26 `croquette, breaded and fried` | Buñuelo | **0,510** |

Y los 2 del negativo 28 (`honey toast` → Miel): **0,088** cada uno.

**0 de 5 llegan a 0,60. El criterio PASA: cero fichas equivocadas con confianza alta,
sobre 68 ítems.**

Cruzado al revés, que es la lectura que importa: **20 de los 66 ítems se muestran a ≥ 0,60,
y los 20 tienen ficha correcta o nutricionalmente equivalente. Cero equivocadas por
encima del 60 %.** El activo del test previo —"cuando el sistema muestra un número con
confianza, ese número no miente"— **sigue en pie, y ahora sobre 20 ítems en vez de 4.**

**El margen, sin maquillar: el *Buñuelo* está a 0,51. Nueve centésimas.** Cualquier
recalibración que suba las confianzas de la vía alias rompe este criterio.

### Criterio 4 · Negativos — **FALLA**

| # | caso | resultado | juicio |
|---|---|---|---|
| 10 | bicicleta | `is_food: false` | ✅ |
| 28 | comida de plástico | `is_food: true`, 2× Miel, **1.550,4 kcal, `completo: true`**, conf. visión 0,70 | **❌** |
| 29 | plato vacío | `is_food: false` | ✅ |
| 30 | envase cerrado | `is_food: false` | ✅ |

**3 de 4, y uno es ❌.** El umbral era 4 de 4 con ≥ 3 en ✅; la tabla del criterio manda a
"no apto" ante **cualquier ❌**. **FALLA.**

Lo que sí hay que reconocer: **los dos negativos que más importaban salieron limpios.**
El 29 es el que va a ocurrir en la primera semana de cualquier usuario, y el 30 era el más
difícil por diseño (fotos impresas en la tapa) y no picó.

### Criterio 5 · Silencio sobre comida catalogada — **FALLA**

Los 16 `no_catalogado`, censados **uno por uno contra `foods.canonical.json`**
(no de memoria):

| # | término | ¿existe ficha? |
|---|---|---|
| 06 | `yellow rice with mushrooms, cooked` | **SÍ** `fdc-2708419` Arroz amarillo cocido (88) |
| 08 | `lime, halved` | **SÍ** `fdc-168155` Lima cruda (30) |
| 09 | `corn arepa with cheese, grilled` | NO — hueco real |
| 17 | `mixed vegetables (…), cooked` | **SÍ** `fdc-2710016` / `2710017` Verduras mixtas cocidas (86 / 68) |
| 20 | `sweet corn, canned` | **SÍ** `fdc-2709916` Maíz de lata cocido (88) |
| 20 | `carrot, shredded` | **SÍ** `fdc-170393` Zanahorias crudas (41) |
| 21 | `cabbage, cooked` | **SÍ** `fdc-2709890` Repollo verde cocido (55) |
| 21 | `chicken breast, boiled` | **SÍ** `fdc-2705938` Pollo guisado (156) — `breast` sigue en 0 fichas |
| 22 | `baked beans in tomato sauce` | NO — hueco real |
| 22 | `cucumber, sliced` | **SÍ** `fdc-168409` Pepino crudo con cáscara (15,9) |
| 23 | `grilled potato slice` | **SÍ** `fdc-2709403` / `2709409` Papa asada (126) |
| 23 | `grilled green chili pepper` | **parcial** — `fdc-2709799` Pimientos crudos (27); asado no existe |
| 23 | `apple slices` | **SÍ** `fdc-2709215` Manzana cruda (61) |
| 23 | `carrot slices, cooked` | **SÍ** `fdc-2709670` Zanahorias cocidas (72) |
| 27 | `beer` ×2 | NO — cerveza = 0 coincidencias |

**11 / 66 = 16,7 %** → umbral ≤ 10 %. **FALLA**, zona de duda (10–25 %).
Contando el parcial: 12 / 66 = 18,2 %.

**Pero comparado con el punto de partida, es el número que más se movió del test:
del 59 % (10 de 17) al 16,7 %. Bajó 42 puntos.**

**Y los 11 silencios tienen una sola causa raíz, no cuatro.** Diez de los once son
"**ingrediente correcto + un modificador de corte o cocción que la ficha no lleva**":
`shredded`, `sliced`, `grilled`, `cooked`, `halved`, `with mushrooms`. El caso que lo
prueba sin discusión: **`apple, raw` matchea exacto al 95 % en el plato 01, y
`apple slices` cae a `no_catalogado` en el plato 23. Misma fruta, mismo motor, misma
corrida.** El undécimo (`chicken breast`) es vocabulario: `breast` sigue dando 0 de 1.022,
ya anotado en el test previo y todavía abierto.

---

## 4 · Tablero final

| # | Criterio | Cuenta | Umbral | Resultado |
|---|---|---|---|---|
| 1 | Ítems con ficha correcta | 39 / 66 = **59,1 %** (con 🟡: 48/66 = 72,7 %) | ≥ 75 % | **FALLA** |
| 2 | Platos con kcal en rango | 20 / 26 = **76,9 %** | ≥ 80 % (21/26) | **FALLA** |
| 3 | Fichas equivocadas con conf. ≥ 0,60 | **0** de 68 ítems (máx. 0,51) | 0 | **PASA** |
| 4 | Negativos bien manejados | **3 / 4**, con 1 ❌ (el 28) | 4/4, ≥3 en ✅ | **FALLA** |
| 5 | Silencio sobre comida catalogada | 11 / 66 = **16,7 %** | ≤ 10 % | **FALLA** |

Juicios por plato: **17 ✅ · 8 🟡 · 5 ❌** sobre 30.

---

## 5 · Los cinco ❌, con su causa raíz separada

| # | Plato | Qué pasó | Causa raíz |
|---|---|---|---|
| **06** | Risotto | `yellow rice with mushrooms, cooked` → `no_catalogado`, con `fdc-2708419` en el catálogo | **Matching.** El nombre de la ficha (`yellow rice cooked`) está dentro de la frase pero **partido** por `with mushrooms`; el difuso solo compara secuencias contiguas. Causa C del informe previo, intacta. **Único plato que no se movió entre los dos tests.** |
| **17** | Pollo, arroz y verduras | `chicken thigh, roasted` → **Costilla de res** (0,196) | **Catálogo (alias tóxico).** El alias `Asado` (confianza 0,8) cuelga de `fdc-169510`, una costilla **de vaca**. Cualquier término que contenga "roasted/asado" puede caer ahí. No es la visión: `chicken thigh, roasted` es una descripción correcta. |
| **23** | Salmón | `fish fillet, …` → **Bife** (0,095) | **Catálogo (alias tóxico) + hueco real.** El alias español `Filete` cuelga de `fdc-2705824` *Beef, steak, NFS*. En español "filete" es de carne **y** de pescado, y el catálogo solo tiene una acepción. Agravado porque **no hay salmón a la plancha en las 1.022** (solo *Lomi salmón*): el hueco fuerza al difuso a raspar el fondo. |
| **26** | Croquetas | alias `Croqueta` (0,6) → **Buñuelo**, 0,51, **+57 % de kcal** | **Catálogo (alias tóxico).** Una croqueta de bechamel no es un frito dulce. **`fdc-2709511` *Croquetas de papa* (237) existe y es mucho mejor**, pero no tiene el alias que gana. |
| **28** | Comida de plástico | `is_food: true`, 2× **Miel**, **1.550,4 kcal con `completo: true`** | **Visión + falta de una compuerta.** El modelo no tiene forma de saber que es resina y la predicción lo admitía (por eso el 🟡 pedía conf. de visión < 0,5); vino a 0,70. Lo grave no es la duda mal calibrada: es que **una confianza final de 0,088 igual produce un total de portada marcado `completo: true`**. |

**Tres de los cinco ❌ son la misma cosa: un alias español de baja confianza que apunta a
otra familia de alimento.** No es un problema de visión ni de umbrales: son tres filas del
catálogo. Es la clase de defecto más barata de arreglar de todo este informe.

**Ninguno de los cinco es "predicción ingenua".** Los cuatro casos donde mi predicción fue
ingenua (03, 04, 14, 19 — gramaje) están marcados 🟡, no ❌, y declarados como tales.

---

## 6 · Antes y después, sobre los 10 platos repetidos

| # | Plato | Test de 10 (motor viejo) | Golden set de 30 (motor nuevo) | |
|---|---|---|---|---|
| 01 | Manzana | ✅ exacto 0,97 · 109,8 | ✅ exacto 0,95 · 109,8 | = |
| 02 | Croissant | ✅ exacto 0,95 · 284,2 | ✅ exacto 0,95 · 284,2 | = |
| 03 | Paella | ❌ `no_catalogado` | 🟡 **Paella** difuso 0,185 · 1.014 | ▲ **ficha resuelta** |
| 04 | Tortilla | ✅ exacto 0,90 · 612 (450 g) | 🟡 alias 0,95 · 816 (600 g) | = ficha, ▼ gramaje |
| 05 | Lasaña | ❌ `no_catalogado` | ✅ **Lasaña** alias 0,68 · 724,5 | ▲ **resuelto** |
| 06 | Risotto | ❌ `no_catalogado` | ❌ `no_catalogado` | **sin cambio** |
| 07 | Bife + papas | ❌ 4 de 5 sin ficha · **43,6 kcal** | ✅ **5 de 5 con ficha · 920,5 kcal** | ▲▲ **el arreglo más grande** |
| 08 | Lentejas | 1 de 5 con ficha · **124,8 kcal** | ✅ **5 de 6 con ficha · 1.119,2 kcal** | ▲▲ y **no cayó en las crudas** |
| 09 | Arepa | ✅ `no_catalogado` honesto | ✅ `no_catalogado` honesto | = |
| 10 | Bicicleta | ✅ `is_food: false` | ✅ `is_food: false` | = |

**Vías sobre esos mismos 10 platos:**

| | ítems | exacto | alias | difuso | `no_catalogado` |
|---|---|---|---|---|---|
| Antes | 17 | 4 | 0 | 1 | **12 (71 %)** |
| Ahora | 18 | 5 | 4 | 6 | **3 (17 %)** |

**El silencio pasó del 71 % al 17 % en los mismos platos, sin que apareciera ni una ficha
equivocada con confianza alta.** El motor nuevo hizo lo que se le pidió.

**Lo que la comparación también dice, y es incómodo:** la corrida vieja tenía 4 ítems
por encima del 70 % y ninguna ficha mala. La nueva tiene 20 ítems por encima del 60 % y
ninguna ficha mala **pero 3 fichas malas abajo, entre 0,095 y 0,51**. Antes el sistema no
se equivocaba porque no contestaba. Ahora contesta, y en el 4,5 % de los ítems (3 de 66)
contesta mal — en voz baja, pero contesta.

---

## 7 · La cola de curación — lo que se pudo medir y lo que no

**No se pudo contar.** Las 30 respuestas **no traen ningún campo `curation_candidates`**.
Las claves de nivel superior son exactamente `scan_id`, `is_food`, `items`, `totals`,
`meta`, `persisted` y (en los negativos) `message_es`. La cola se escribe del lado del
servidor, en `curation_queue` de Firestore, como documentó el informe previo; leerla
requiere una llamada, y este encargo prohíbe llamadas. **Así que no hay un conteo real de
la cola en este informe, y no se afirma ninguno.**

**Lo que sí se puede medir es el material del que se alimenta**, que son los ítems
`no_catalogado` (motivo `sin_match`), ya censados en el criterio 5:

| | términos | |
|---|---|---|
| **"No lo supe encontrar"** (hay ficha) | **11** | `yellow rice…` · `lime, halved` · `mixed vegetables…` · `sweet corn, canned` · `carrot, shredded` · `cabbage, cooked` · `chicken breast, boiled` · `cucumber, sliced` · `grilled potato slice` · `apple slices` · `carrot slices, cooked` |
| Variante cercana | 1 | `grilled green chili pepper` |
| **"No lo tengo"** (hueco real) | **4** | `corn arepa…` · `baked beans…` · `beer` ×2 |

**11 de 16 = 73 % de lo que entraría a la cola es "no lo supe encontrar".**

**El dato que hay que leer dos veces: en el test previo la proporción era 22 de 30 = 73 %.
Es idéntica.** El motor mejoró muchísimo en matching y **la relación señal/ruido de la
cola no mejoró nada**, porque la cola sigue sin distinguir las dos cosas. Quien lea esta
cola como "qué le falta al catálogo" va a fichar once alimentos que ya están —manzana,
zanahoria, pepino, papa, maíz, repollo, lima— en vez de arreglar una regla de matching.
Es la misma deuda del informe anterior, sin tocar.

Salvedad: **este conteo es una cota inferior de la cola real.** El informe previo mostró
que la cola también registra componentes de composición (`componente_sin_match`) y
deduplica con un contador `veces`; 12 ítems `no_catalogado` produjeron allá **30**
documentos. Acá 16 ítems producirían **más** de 16 documentos, no 16.

---

## 8 · Los casos mirados con lupa, en una línea cada uno

| Caso | Qué se temía | Qué pasó |
|---|---|---|
| **14 · manchego → ¿parmesano?** | parmesano a > 60 % | **Contenido.** Parmesano **a 0,375**, la reserva del alias 0,5 respetada al pie de la letra. |
| **26 · croquetas → ¿buñuelo dulce?** | buñuelo a > 60 % | **Ocurrió a 0,51.** Falla el 🟡 (pedía ≤0,50 y 200–300 kcal; dio 0,51 y 415,8) y esquiva el ❌ duro por 9 centésimas. |
| **23 · salmón → ¿Lomi salmón?** | *Lomi salmón*, 60 kcal | **No fue Lomi: fue *Bife*.** Peor de nombre, casi igual de kcal (229 vs ~208/100 g). A 0,095. |
| **06 · risotto** | repetir el silencio | **Lo repitió.** Único plato idéntico entre los dos tests. |
| **21 · cocido** | el alias `Cocido madrileño` (0,5) colapsa el plato en garbanzos → ~317 kcal | **No colapsó.** 7 ítems, 5 con ficha, 1.313,9 kcal. |
| **22 · desayuno** | ≤3 fichas o total < 350 | 4 fichas, 624,4 kcal. **La simetría con el 16 se cumplió**: *Jamón* cocido acá, *Jamón crudo* allá. |
| **20 · ensalada** | una ficha "ensalada" genérica tapando 7 ingredientes | **No la tapó.** 7 ítems, 5 con ficha, y avisa el crudo/cocido en el motivo. |
| **28 · plástico** | `is_food: true` con total en firme | **Ocurrió**: 1.550,4 kcal, `completo: true`, ficha **Miel**. |
| **29 · plato vacío** | inventar comida, o `0 kcal` como medición | **Limpio.** `is_food: false`. |
| **30 · envase cerrado** | leer los alimentos de **las fotos impresas** de la tapa | **No los leyó.** `is_food: false`. Tampoco leyó la etiqueta (que habría sido 🟡). |

---

## 9 · Lo mínimo que falta

Ordenado por relación daño/esfuerzo, no por gusto:

1. **Tres filas del catálogo** (arregla los ❌ 17, 23 y 26, que son 3 de los 5):
   - `fdc-169510` *Costilla de res*: sacar o acotar el alias **`Asado`** (0,8).
   - `fdc-2705824` *Bife*: sacar o acotar el alias **`Filete`** (hoy 1,0 implícito), que
     en español también es de pescado.
   - `fdc-2708024` *Buñuelo*: sacar el alias **`Croqueta`** (0,6) y pasarlo a
     `fdc-2709511` *Croquetas de papa* (237 kcal/100 g), que ya existe y da el número
     correcto.
2. **Una compuerta de totales** (arregla el ❌ 28 y el reparo del 15): **no publicar un
   total con `completo: true` cuando ningún ítem llega a un mínimo de confianza.** Hoy dos
   ítems al 0,088 producen "1.550,4 kcal" marcado como completo.
3. **Normalizar el modificador de corte/cocción antes de matchear** (arregla 10 de los 11
   silencios, y con eso el criterio 5): `sliced`, `shredded`, `grilled`, `cooked`,
   `halved`, `slices`. La prueba de que es eso y no otra cosa: `apple, raw` → exacto 0,95,
   `apple slices` → `no_catalogado`, en la misma corrida.
4. **Permitir el nombre partido en el difuso** (arregla el ❌ 06): hoy
   `yellow rice with mushrooms cooked` no alcanza a `yellow rice cooked` porque el match
   exige palabras contiguas.
5. **Etiquetar la cola de curación** con `hay_ficha_candidata: sí/no`, o la cola seguirá
   proponiendo fichar manzanas y zanahorias que ya están.

**Regla de curación que este test deja probada (2 de 2, platos 04 y 27):** para todo plato
regional, escribir `names.en` como **`nombre genérico en inglés (nombre regional)`**. Es
lo que el modelo tiende a escribir entero, y matchea a 0,88–0,95 — contra el 0,15–0,50 de
casi todo lo demás.

---

## 10 · Salvedades de honestidad

- **Sin repetición: cada foto se analizó una vez.** Nada de este informe dice nada sobre
  la estabilidad del modelo entre corridas. Medirla es otro test (60 llamadas).
- **La cola de curación no se contó** (§7). El 73 % es sobre los ítems `no_catalogado` de
  las respuestas, que es el material de la cola, no la cola.
- **Nada del front se evaluó.** Todo esto es la respuesta del endpoint.
- **8 juicios son interpretación mía**, marcados **[interpretación]** en su lugar:
  03, 04, 14, 15, 17, 19, 23, 26 (más la resolución del 09 y la de "confianza alta" en el 28).
  Los seis primeros los tuve que decidir porque el criterio escrito no cubría el caso real;
  los del 17, 23 y 26 los decidí **en contra** del conteo del plato, aplicando el marco
  general ("❌ = ficha semánticamente falsa").
- **El criterio 2 mide, en parte, mis predicciones de gramaje.** Está cuantificado arriba:
  76,9 % con los gramos predichos, 92,3 % con los gramos que la visión midió. Los dos
  números están puestos; ninguno se esconde.
- **El ❌ del plato 23 es discutible en kcal**: *Bife* (229/100 g) y salmón a la plancha
  (~208/100 g) están a un 10 %. Lo marqué ❌ por el nombre y por el perfil de grasas, no
  por las calorías, y queda dicho.
- **El denominador de gramos mezcla líquidos con comida** (visto en el 27: 29 % de
  completitud porque faltan dos cervezas). Cualquier lectura de `grams_cuantificados /
  grams_total` en platos con bebida está distorsionada.
