# Predicciones — golden set de 30 platos (la vara del test de mercado)

Escritas **contra el catálogo, no contra la implementación**:
`kb/build/foods.canonical.json`, kb `3.0.0+b2b227e1`, **1.022 fichas**, solo lectura.
**No se leyó `functions/src/engine` en esta ronda** (hay otro agente modificándolo).
Todo lo que sigue dice *qué ficha existe y debería ganar*, no *qué haría el matcher
de hoy*. Cero llamadas al endpoint y cero llamadas a la API de Anthropic para
escribir esto.

**Los 30 = los 10 del test previo (revalidados y corregidos) + 20 nuevos.**

## Lo que ya sabemos y condiciona cada predicción

Del informe previo (`../golden-test/informe.md`), medido sobre 17 ítems reales:

1. **Cero fichas mal elegidas.** El motor prefiere callarse antes que inventar.
2. **Pero 12 de 17 ítems (71 %) salieron sin dato, y 10 de esos 12 SÍ están en el
   catálogo.** El problema no es el error: es el silencio.
3. **Cuatro causas separadas:** (A) el prompt de visión le prohíbe al modelo los
   1.768 términos españoles que el catálogo curó; (B) el sufijo USDA (`NFS`,
   `NS as to fat`) rompe la igualdad exacta; (C) el piso de cobertura 0,30 castiga a
   la visión por describir bien — `coleslaw, cabbage and carrot salad` **contiene**
   el nombre exacto `coleslaw` y aun así se descarta; (D) singular contra plural
   (`lime, raw` no llega a `Limes, raw`).
4. **La trampa de abrir el recall sin cuidado:** `lentils` a secas resuelve a
   *Lentejas CRUDAS* (352 kcal/100 g) en vez de las cocidas (166). El doble.

Por eso, en este set, **cada plato lleva su criterio de éxito escrito por
adelantado**, y en los platos donde existe un gemelo peligroso el ❌ no es "no
encontró": es "encontró el equivocado y lo mostró con confianza".

## Cómo se leen los tres símbolos

- ✅ **acierto** — la ficha es la correcta (o el `no_catalogado` es honesto porque el
  hueco es real) y el total de kcal cae en el rango.
- 🟡 **aproximado razonable** — otra ficha de la misma familia nutricional, o cobertura
  parcial **declarada** (`completo: false`). Cuenta como aprobado con reserva.
- ❌ **fallo** — ficha semánticamente falsa, o un total incompleto presentado como si
  fuera el total del plato, o comida inventada donde no la hay.

---

# Parte 1 · Los 10 del test previo, revalidados

Se conservan los platos y las fotos. **Se corrigen las predicciones donde el informe
mostró que eran ingenuas**, y se les agrega el criterio de éxito que antes no tenían.

### 01 · Manzana entera — simple · fácil
- **Predicción previa: cumplida** (`apple, raw` → exacto, 97 %). Se mantiene tal cual.
- **Ítems:** `apple, raw` · ES *manzana*.
- **Ficha:** `fdc-2709215` *Manzana cruda* (61 kcal/100 g).
- **kcal:** 180 g × 0,61 = **110** · rango **70–140**.
- **✅** ficha 2709215, 70–140 kcal. **🟡** otra manzana del catálogo. **❌** no_catalogado.

### 02 · Croissant — simple · fácil
- **Predicción previa: cumplida** (exacto, 95 %). Se mantiene.
- **Ítems:** `croissant`. **Ficha:** `fdc-2707678` *Croissant* (406 kcal/100 g).
- **kcal:** 70 g × 4,06 = **284** · rango **200–330**.
- **✅** 2707678, 200–330. **🟡** otra bollería de hojaldre. **❌** no_catalogado.

### 03 · Paella — español · media → **predicción corregida**
- **Lo que erré:** predije que la visión diría `paella` a secas. Dijo
  `rice, cooked, seafood paella style` y el sistema no matcheó nada. **La visión
  describe, no nombra.** La predicción correcta no es sobre el término, es sobre si
  el sistema sabe llegar a la ficha desde una frase que *contiene* la palabra.
- **Ítems esperables:** `rice, cooked, seafood paella style` / `paella, seafood` /
  `saffron rice with shrimp and mussels` · ES *paella*.
- **Ficha:** `fdc-2706723` *Paella* (`Paella, NFS`, 169 kcal/100 g, genérica).
- **kcal:** 350 g × 1,69 = **590** · rango **400–800**.
- **✅** llega a 2706723 desde la frase descriptiva, 400–800 kcal. **🟡** descompone en
  arroz + marisco con ≥3 fichas y total 400–800. **❌** no_catalogado (repetir el
  resultado previo = DT-17 sin resolver).

### 04 · Tortilla de patatas — español · media → **predicción corregida (para el lado bueno)**
- **Lo que erré:** predije difuso ~31 %. Salió **exacto al 90 %**, porque la visión
  escribió `Spanish potato omelette (tortilla de patatas)`, que es literalmente el
  `names.en` de la ficha manual. **Hallazgo: una ficha curada cuyo `names.en` incluye
  el nombre regional entre paréntesis es la que el modelo tiende a escribir entera.**
  Esa hipótesis se vuelve a probar en el plato 27.
- **Ficha:** `manual-tortilla-de-patatas` *Tortilla de patatas* (136 kcal/100 g).
- **kcal:** 450 g (tortilla entera) × 1,36 = **612** · rango **450–750**.
- **✅** ficha manual, 450–750. **🟡** `fdc-2707198` *Huevo revuelto o tortilla* (185)
  con confianza < 50 %. **❌** 2707198 con confianza alta (+36 % de kcal), o no_catalogado.

### 05 · Lasaña — compuesto servido · media
- **Predicción previa: cumplida** (sin match). **Ahora el criterio se endurece**: que
  no matchee ya no es "predicho", es fallo.
- **Ítems:** `lasagna with meat sauce and spinach ricotta` · ES *lasaña*.
- **Ficha:** `fdc-2708755` *Lasaña con carne y espinaca* (207 kcal/100 g, alias `Lasaña` 0,8).
- **kcal:** 350 g × 2,07 = **725** · rango **450–850**.
- **✅** 2708755, 450–850. **🟡** composición pasta + carne + queso con ≥3 fichas.
  **❌** no_catalogado.

### 06 · Risotto de hongos — media → **predicción corregida (erré el ítem, no la vía)**
- **Lo que erré:** predije que la visión diría `risotto with mushrooms`. Dijo
  `yellow rice, cooked (saffron/turmeric seasoned)`: **no vio risotto, vio arroz
  amarillo**. Mi ficha esperada (*Arroz blanco con mantequilla*, alias `Risotto` 0,5)
  era la equivocada para lo que el modelo realmente reporta.
- **Ficha correcta a la luz de eso:** `fdc-2708419` *Arroz amarillo cocido*
  (`Yellow rice, cooked, NS as to fat`, 88 kcal/100 g, genérica) — **existe y el
  sistema no llegó**. Segunda opción: `fdc-2708405` *Arroz blanco cocido con
  mantequilla* (147).
- **kcal:** 320 g × 0,88 = **282** por la ficha; un risotto de hongos real ronda
  **350–500**. Rango aceptado **250–520** (la horquilla ancha es honesta: la ficha
  subestima un risotto).
- **✅** 2708419 o 2708405, 250–520. **🟡** composición arroz + hongos + queso.
  **❌** no_catalogado.

### 07 · Bife con papas y ensalada — compuesto servido · media
- **Predicción previa:** los ítems se predijeron bien; erré al asumir que el difuso
  cerraría. Ninguno de los 5 llegó a ficha salvo el kétchup.
- **Ítems reales (5):** `beef steak, grilled` 180 g · `french fries, fried` 180 g ·
  `coleslaw, cabbage and carrot salad` 120 g · `ketchup` 40 g · `gravy, brown sauce` 40 g.
- **Fichas:** `fdc-2705824` *Bife* (229) · `fdc-2709456` *Papas fritas* (225) ·
  `fdc-2709815` *Coleslaw / Ensalada de repollo con mayonesa* (117, **nombre exacto**) ·
  `fdc-2709733` *Kétchup* (109) · `fdc-2707149` *Salsa de carne* (`Gravy, NFS`, 53).
- **kcal:** 180×2,29 = 412 · 180×2,25 = 405 · 120×1,17 = 140 · 40×1,09 = 44 ·
  40×0,53 = 21 → **1.022** · rango **750–1.250**.
- **✅** ≥4 de 5 con ficha, total 750–1.250. **🟡** 3 de 5 con `completo:false` explícito.
  **❌** repetir el resultado previo (**43,6 kcal**, solo el kétchup) o cualquier total
  < 400 mostrado como total del plato.

### 08 · Lentejas guisadas — compuesto servido · difícil
- **Predicción previa: cumplida**, y el riesgo crudo/cocido que anoté sigue vivo.
- **Ítems (mesa puesta, 5):** `lentil stew with meat` 400 g · `bread roll, white` 80 g ·
  `crackers, saltine` 30 g · `tortilla, corn` 25 g · `lime, raw` 40 g.
- **Fichas:** `fdc-2707423` *Lentejas cocidas con sal y grasa* (166, genérica, alias
  `Lentejas con chorizo` 0,6) · `fdc-2707595` *Panecillo* (279) · `fdc-2708143`
  *Galletas saltinas* (416) · tortilla de maíz **no catalogada** (solo la de trigo) ·
  `fdc-168155` *Lima cruda* (30).
- **kcal:** 400×1,66 = 664 · 80×2,79 = 223 · 30×4,16 = 125 · 40×0,30 = 12 →
  **1.024** · rango **750–1.250**.
- **✅** ≥3 de 5 con ficha, total 750–1.250. **🟡** las lentejas con ficha y el resto
  declarado incompleto. **❌ el fallo caro y explícito: `fdc-172420` *Lentejas crudas*
  (352 kcal/100 g).** Serían 1.408 kcal solo del guiso: **el doble de la realidad.**

### 09 · Arepa rellena — no catalogada · difícil
- **Predicción previa: cumplida.** Verificado de nuevo sobre las 1.022: `arepa` = 0,
  `corn cake` = 0, `rice cake` = 0.
- **✅** `match: "no_catalogado"`, `confidence: 0`, `nutrients: null` y entrada en la
  cola de curación. **🟡** compone desde harina de maíz + queso con `confianza × 0,8`
  y total 400–600. **❌** cualquier ficha concreta con confianza alta.

### 10 · NO comida (bicicleta) — negativo · fácil
- **Predicción previa: cumplida** (`is_food: false`, 312 bytes).
- **✅** `is_food: false`, `items: []`, `totals: null`. **❌** cualquier ítem.
- Es el negativo **fácil** del set; los tres nuevos (28–30) son los difíciles.

---

# Parte 2 · Los 20 nuevos

## 2.1 · Seis platos simples (11–16)

### 11 · Plátano entero — simple · **fácil**
- **Ítems:** `banana, raw` / `bananas, raw` · ES *plátano* / *banana*.
- **Ficha:** `fdc-173944` *Banana cruda* (`Bananas, raw`, 89 kcal/100 g, porción 118 g,
  alias *Plátano*, *Banana*, *Guineo*).
- **Riesgo anotado:** el `names.en` está en **plural**. Si la visión dice
  `banana, raw` (singular, que es lo más probable), es el mismo hueco D que hundió a
  `lime, raw` en el test previo. El alias español *Banana* sí cierra.
- **kcal:** 120 g × 0,89 = **107** · rango **85–160**.
- **✅** 173944, 85–160. **🟡** `fdc-2709225` *Banana al horno* (161) con confianza
  reservada. **❌** no_catalogado — sería el plural mordiendo otra vez, en la fruta más
  fotografiada del mundo.

### 12 · Naranja en gajos — simple · **media**
- **Ítems:** `orange, raw` / `orange segments` · ES *naranja*.
- **Ficha:** `fdc-169097` *Naranja cruda* (`Oranges, raw, all commercial varieties`,
  47 kcal/100 g, alias *Naranja*).
- **Riesgo anotado:** el `names.en` lleva cola USDA (`, all commercial varieties`), o
  sea la causa B. La única vía limpia es el **alias español**, que es justo lo que el
  prompt de visión le prohíbe usar al modelo. Este plato mide esa contradicción sobre
  un alimento trivial.
- **kcal:** 150 g de pulpa × 0,47 = **70** · rango **45–100**.
- **✅** 169097, 45–100. **🟡** `fdc-2709172` *Naranja en lata* (46) — kcal casi
  idénticas, ficha discutible. **❌** mandarina/otra fruta, o no_catalogado.

### 13 · Dos huevos fritos — simple · **media**
- **Ítems:** `egg, fried` ×2 o `fried eggs` ~110 g.
- **Ficha:** `fdc-2707155` *Huevo frito* (`Egg, whole, fried, NS as to fat`,
  185 kcal/100 g, genérica, porción 55 g).
- **Riesgo anotado:** sufijo `NS as to fat` (causa B) + tres hermanas casi idénticas
  (`Huevo cocido` 176, `Huevo al horno` 185, `Huevo crudo` 143).
- **kcal:** 2 × 55 g = 110 g × 1,85 = **204** · rango **140–300** (el techo contempla
  el aceite de la sartén, que la ficha genérica no cuenta).
- **✅** 2707155 o 2707162, 140–300. **🟡** `fdc-2707153` *Huevo cocido* (176, −5 %).
  **❌** `fdc-2707152` *Huevo crudo* (143) — un huevo frito no es un huevo crudo — o
  no_catalogado.

### 14 · Queso manchego en lonchas — simple · **difícil (gemelo de confianza 0,5)**
- **Ítems:** `cheese, manchego` / `cheese, hard, sheep's milk` / `cheese, aged, sliced`.
- **Verificado sobre las 1.022: no existe ficha de manchego.** El único puente es el
  alias **`Queso manchego` con confianza 0,5** sobre `fdc-2705730` *Queso parmesano en
  trozo* (412 kcal/100 g). La alternativa honesta es `fdc-2705704` *Queso*
  (`Cheese, NFS`, 381).
- **La cuenta nutricional:** manchego curado real ≈ **390 kcal/100 g**. Parmesano
  sobreestima un 6 %; *Queso, NFS* subestima un 2 %. **Las dos son nutricionalmente
  defendibles. Lo que no es defendible es escribirle "Queso parmesano" a un manchego
  con confianza alta:** un usuario español lo ve al instante y deja de creerle a todo
  lo demás. Esta es la diferencia entre acertar el número y acertar el producto.
- **kcal:** 60 g (5–6 lonchas) × 3,9 = **235** · rango **160–300**.
- **✅** `fdc-2705704` *Queso*, o `fdc-2705730` **con confianza ≤ 50 %** (la reserva del
  alias respetada), 160–300 kcal. **🟡** no_catalogado — honesto, el hueco es real.
  **❌** `fdc-2705730` *Queso parmesano* mostrado con **confianza > 60 %**.

### 15 · Dos tostadas con manteca — simple · **fácil-media**
- **Ítems:** `bread, white, toasted` ~60 g · `butter` ~10 g.
- **Fichas:** `fdc-2707592` *Pan tostado* (`Bread, NS as to major flour, toasted`,
  293 kcal/100 g, genérica) · `fdc-173410` *Mantequilla con sal* (717 kcal/100 g).
- **kcal:** 60 × 2,93 = 176 · + 10 × 7,17 = 72 → **248** · rango **170–330**.
- **Por qué está en el set:** la manteca es un ítem de **10 gramos que pesa el 29 % de
  las calorías**. Es el caso donde ignorar un ítem chico rompe el total.
- **✅** las 2 fichas, 170–330. **🟡** solo el pan (176 kcal) con `completo:false`.
  **❌** `fdc-2708331` *Tostada francesa* (273) — no es lo mismo — o no_catalogado.

### 16 · Jamón serrano en plato — simple · **difícil (alias 0,8 + gemelo caro)**
- **Ítems:** `ham, prosciutto` / `ham, dry-cured, sliced` / `serrano ham` ·
  ES *jamón serrano*.
- **Ficha:** `fdc-2705879` *Jamón crudo* (`Ham, prosciutto`, 195 kcal/100 g, alias
  *Prosciutto* 1,0 · *Jamón curado* · **`Jamón serrano` 0,8**).
- **El gemelo caro:** `fdc-2705878` *Jamón* (`Ham`, **117 kcal/100 g**) — que es jamón
  **cocido**. Elegirlo pierde **el 40 % de las calorías** y confunde York con serrano.
- **kcal:** 80 g (10–12 lonchas finas) × 1,95 = **156** · rango **100–220**.
- **✅** 2705879, 100–220. **🟡** 2705878 con confianza < 50 %. **❌** 2705878 con
  confianza alta, o no_catalogado.

## 2.2 · Ocho platos compuestos servidos (17–24) — el punto débil medido

Acá la visión devuelve 3–7 ítems y **cada uno tiene que encontrar ficha**. El fallo
característico del test previo fue devolver un total de 43,6 kcal para un plato de
700. En este bloque el ❌ está definido sobre eso: **un total incompleto presentado
como el total.**

### 17 · Pollo con arroz y verduras — compuesto · **media** (3 ítems)
- **Ítems:** `chicken thigh, roasted, skin eaten` ~120 g · `rice, white, cooked`
  ~150 g · `peas and carrots, cooked` ~90 g.
- **Fichas:** `fdc-2705930` *Pollo con piel* (196, genérica) — o `fdc-2705935` *Pollo
  asado al spiedo* (164) · `fdc-2708403` *Arroz blanco cocido* (129, genérica) ·
  `fdc-2709962` *Arvejas cocidas con sal y grasa* (98) + `fdc-2709670` *Zanahorias
  frescas cocidas con grasa* (72).
- **kcal:** 120×1,96 = 235 · 150×1,29 = 194 · 90×0,95 ≈ 86 → **515** · rango **400–650**.
- **✅** los 3 ítems con ficha, 400–650. **🟡** 2 de 3 con `completo:false` declarado.
  **❌** ≤1 ficha, o un total < 300 presentado como total.

### 18 · Huevos rotos con jamón — compuesto + **receta del catálogo** · **difícil**
- **Ítems:** o bien 1 (`huevos rotos` / `broken eggs over fried potatoes`) o bien 3
  (`fried eggs` · `french fries` · `serrano ham`).
- **Ficha ideal:** **`receta-huevos-rotos`** *Huevos rotos* (212,8 kcal/100 g, porción
  360 g, `names.en` = `Broken eggs over fried potatoes (huevos rotos)`, alias *Huevos
  estrellados*) para el conjunto huevo+patata, **más** `fdc-2705879` *Jamón crudo*
  aparte.
- **Camino alternativo aceptable:** `fdc-2707155` *Huevo frito* + `fdc-2709456` *Papas
  fritas* + `fdc-2705879` *Jamón crudo*.
- **kcal vía receta:** 360 × 2,128 = 766 · + 60 g jamón × 1,95 = 117 → **883**.
  **Vía composición:** 110×1,85 + 200×2,25 + 60×1,95 = 204+450+117 = **771**.
  Rango **700–1.050**.
- **Por qué está en el set:** es el plato que prueba si **las 9 recetas compuestas del
  catálogo sirven de algo**. Si `receta-huevos-rotos` no gana acá, no va a ganar nunca.
- **✅** la receta **o** la composición de 3, 700–1.050. **🟡** 2 de 3 con
  `completo:false`. **❌** un solo ítem con ficha y un total < 400 como total del plato.

### 19 · Hamburguesa con papas fritas — compuesto · **media** (2 ítems + entorno)
- **Ítems del plato del frente:** `hamburger` / `cheeseburger` ~200 g ·
  `french fries` ~150 g.
- **Fichas:** `fdc-2706920` *Hamburguesa* (`Hamburger, NFS`, 288, genérica, alias
  *Burger*) — o `fdc-2706888` *Hamburguesa con queso* (296) · `fdc-2709456` *Papas
  fritas* (225, genérica, alias *Patatas fritas*).
- **kcal:** 200×2,88 = 576 · + 150×2,25 = 338 → **914** · rango **700–1.200**.
- **Encuadre:** hay una segunda hamburguesa, un vaso de cola y salsas al fondo. **Si
  los suma, el total puede llegar a ~1.600 y sigue siendo correcto** (ver `fotos.md`).
- **✅** las 2 fichas, 700–1.200 (o hasta 1.700 si cuenta la mesa entera).
  **🟡** una sola ficha con `completo:false`. **❌** total < 400 como total del plato.

### 20 · Ensalada mixta — compuesto · **difícil** (6–7 ítems, sin ficha del conjunto)
- **Ítems:** `lettuce, raw` 100 g · `tomato, raw` 80 g · `sweet corn, canned` 50 g ·
  `carrot, shredded, raw` 30 g · `egg, hard-boiled` 60 g · `tuna, canned` (o
  `beef, cold, sliced`) 60 g · `beet, pickled` 20 g · aliño de aceite ~15 g.
- **Verificado: no existe ninguna ficha "ensalada mixta" ni "garden salad" en las
  1.022.** Las únicas ensaladas del catálogo son de repollo, de papa, de arvejas y de
  cangrejo. **El único camino honesto es la composición.**
- **Fichas:** `fdc-2709789` *Lechuga cruda* (20) · `fdc-2709719` *Tomate crudo* (20) ·
  `fdc-2709916` *Maíz de lata cocido con grasa* (88) · `fdc-170393` *Zanahorias crudas*
  (41) · `fdc-2707153` *Huevo cocido* (176) · `fdc-2706309` *Atún* (85) ·
  `fdc-169966` *Remolacha de lata* (31) · `fdc-2710186` *Aceite de oliva* (900).
- **kcal:** 20+16+44+12+106+51+6 = 255 · + 15 g de aceite = 135 → **390** ·
  rango **250–500**.
- **El detalle que importa:** el aliño es **el 35 % de las calorías de una ensalada**.
  Un sistema que devuelve "255 kcal" para esto no está midiendo la ensalada.
- **✅** ≥5 ítems con ficha, 250–550. **🟡** 3–4 con ficha y `completo:false`.
  **❌** una sola ficha "ensalada" genérica que tape los 7 ingredientes, o total < 150.

### 21 · Cocido madrileño — compuesto + regional · **difícil** (6–7 ítems)
- **Ítems:** `chickpeas, cooked` 150 g · `cabbage, cooked` 80 g · `chorizo` 40 g ·
  `pork belly, cooked` 50 g · `blood sausage` 40 g · `chicken, boiled` 70 g.
- **Fichas:** `fdc-2707414` *Garbanzos cocidos con sal y grasa* (211, genérica, alias
  **`Cocido madrileño` 0,5** y `Garbanzos guisados` 1,0) · `fdc-2709890` *Repollo verde
  cocido con grasa* (55) · `fdc-2706179` *Chorizo fresco* (341, alias `Chorizo` 0,6) ·
  `fdc-2705887` *Tocino de cerdo cocido* (484) · `fdc-2706173` *Morcilla* (379) ·
  `fdc-2705938` *Pollo guisado* (156).
- **kcal:** 317 + 44 + 136 + 242 + 152 + 109 → **1.000** · rango **800–1.300**.
  Un cocido completo es así de calórico; el rango no es un error de tipeo.
- **La trampa específica:** existe el alias `Cocido madrileño` (0,5) que colapsa **todo
  el plato en la ficha de los garbanzos**. Si el motor toma ese atajo, devuelve
  150 g × 2,11 = **317 kcal**: **un tercio del plato**, y sin ninguna carne contada.
- **✅** ≥4 ítems con ficha, 800–1.300. **🟡** la ficha única de garbanzos vía alias,
  con la reserva del 0,5 visible y `completo:false`. **❌** esos ~317 kcal presentados
  con confianza alta como el total del cocido.

### 22 · Desayuno completo — compuesto · **difícil** (6 ítems)
- **Lo que se ve** (variante de buffet, no el *full english* de manual):
  `scrambled eggs` 90 g · `baked beans in tomato sauce` 150 g · `ham, sliced` 50 g ·
  `sausages, frankfurter type` 60 g · `bread, rye` 60 g · `cucumber, raw` 60 g.
- **Fichas:** `fdc-2707198` *Huevo revuelto o tortilla* (185, genérica) ·
  **`baked beans` = 0 coincidencias en el catálogo**; lo más cercano es `fdc-2707351`
  *Frijoles en lata sin grasa* (136) → 🟡 legítimo, no ✅ · `fdc-2705878` *Jamón* (117,
  acá **sí** es el cocido, y es la ficha correcta) · `fdc-2706166` *Hot dog* (310) o
  `fdc-2706190` *Salchicha* (325) · `fdc-2707591` *Pan* (267) · `fdc-168409` *Pepino
  crudo* (15,9).
- **kcal:** 167 + 204 + 59 + 195 + 160 + 10 → **795** · rango **600–1.000**.
- **Simetría deliberada con el plato 16:** el mismo `fdc-2705878` *Jamón* que allá es
  el error es acá el acierto. **La ficha correcta depende del plato, no del término.**
- **✅** ≥5 ítems con ficha, 600–1.000. **🟡** 4 ítems + las alubias en no_catalogado
  (hueco real). **❌** ≤3 fichas, o total < 350.

### 23 · Salmón a la plancha con guarnición — compuesto · **difícil** (7 ítems, y un hueco de catálogo verificado)
- **Ítems:** `salmon, grilled/seared` 150 g · `potato, grilled` 90 g · `coleslaw` 60 g ·
  `tomato, raw` 20 g · `bread, toasted` 40 g · `apple, raw, sliced` 40 g ·
  `brown sauce / gravy` 40 g.
- **Verificado: `salmon` da UNA sola coincidencia en las 1.022, y es `fdc-2706850`
  *Lomi salmón* (60 kcal/100 g), un plato hawaiano de salmón crudo con tomate.**
  **No hay salmón a la plancha en el catálogo.**
- **Fichas honestas:** salmón → **no_catalogado**, o `fdc-2706225` *Pescado al horno*
  (208) como sustituto genérico 🟡 · `fdc-2709403` *Papa asada con cáscara* (126) ·
  `fdc-2709815` *Coleslaw* (117) · `fdc-2709719` *Tomate crudo* (20) · `fdc-2707592`
  *Pan tostado* (293) · `fdc-2709215` *Manzana cruda* (61) · `fdc-2707149` *Salsa de
  carne*.
- **kcal:** 300 (salmón a 2,0) + 113 + 70 + 4 + 117 + 24 + 50 → **678** · rango **500–900**.
- **El error no forzado que este plato caza:** que `salmon, grilled` caiga por difuso
  en ***Lomi salmón*, 60 kcal/100 g** — **un tercio** de las calorías de un salmón a la
  plancha (≈ 208). Es el gemelo más caro de todo el set de 30.
- **✅** salmón en no_catalogado **o** con una ficha de pescado de 170–270 kcal/100 g,
  + ≥3 guarniciones con ficha, total 500–900 o `completo:false` explícito.
  **🟡** salmón sin ficha y solo 2 guarniciones con ficha. **❌ *Lomi salmón* elegido
  para el salmón, con cualquier confianza**, o total < 250 como total.

### 24 · Espaguetis con albóndigas — compuesto · **media** (y otro hueco verificado)
- **Ítems:** `spaghetti, cooked` ~200 g · `meatballs in tomato sauce` ~150 g ·
  `tomato sauce` ~50 g.
- **Verificado: no existe ficha de pasta cocida sola.** `Pasta, NFS` = 0 coincidencias;
  `spaghetti, cooked` = 0. Lo único que hay es `fdc-2708828` *Pasta con salsa*
  (125 kcal/100 g, genérica, alias `Espaguetis a la boloñesa` 0,8) y `fdc-2709141`
  *Plato congelado de espaguetis con albóndigas* (113).
- **Fichas:** el camino limpio es la ficha única **`fdc-2708828` *Pasta con salsa*** para
  el conjunto pasta+salsa, más **`fdc-2706467` *Albóndigas con salsa*** (186, genérica,
  alias `Albóndigas` 0,8).
- **kcal:** vía plato entero 400 g × 1,25 = **500**; vía composición
  316 (pasta) + 279 (albóndigas) + 40 (salsa) = **635**. Rango **450–750**.
- **✅** 2708828 y/o 2706467, 450–750. **🟡** solo las albóndigas con ficha y la pasta
  en no_catalogado, con `completo:false`. **❌** `fdc-2709141` *Plato congelado* elegido
  para un plato casero — ficha semánticamente falsa —, o total < 250.

## 2.3 · Tres platos españoles del vocabulario curado (25–27)

### 25 · Gazpacho — español · **media**
- **Ítems:** `gazpacho` / `soup, gazpacho` / `cold tomato soup` · ES *gazpacho*.
- **Ficha:** `fdc-2710106` *Gazpacho* (`Soup, gazpacho`, 26 kcal/100 g, porción 245 g,
  alias `Gazpacho` 0,8). El `names.es` **es** `Gazpacho`, así que el exacto español
  cierra a 1,0 si el modelo escribe la palabra.
- **kcal:** 250 g × 0,26 = **65** · rango **50–90**.
- **Límite del catálogo, declarado por adelantado:** un gazpacho andaluz real lleva pan
  y aceite de oliva y anda en **65–90 kcal/100 g**; la ficha USDA es una sopa de
  hortalizas sin aceite, a 26. **Esto es un límite de la ficha, no un error del motor**,
  y el rango de éxito está fijado sobre lo que dice la ficha. Queda anotado como
  candidato de curación.
- **✅** 2710106, 50–90. **🟡** `manual-salmorejo` (83) — plato hermano.
  **❌** no_catalogado, o una sopa de tomate caliente.

### 26 · Croquetas — español · **difícil (gemelo 0,6 con trampa de kcal)**
- **Ítems:** `croquettes, fried` / `ham croquettes` / `fritter, fried` · ES *croquetas*.
- **El puente que existe:** alias **`Croqueta` con confianza 0,6** sobre `fdc-2708024`
  ***Buñuelo*** (`Fritter, plain`, **378 kcal/100 g**) — que es un **frito dulce**, no
  una croqueta de bechamel. El otro candidato es `fdc-2709511` *Croquetas de papa*
  (`Potato tots`, 237, genérica, alias *Croquetas de patata*).
- **La cuenta:** croqueta de jamón real ≈ **240 kcal/100 g**. Dos croquetas ≈ 70 g →
  **168 kcal** reales. Vía *Buñuelo*: 70 × 3,78 = **265 kcal, +58 %**.
  Vía *Croquetas de papa*: 70 × 2,37 = **166 kcal**, correcto.
- **✅** `fdc-2709511` *Croquetas de papa*, 130–220 kcal — o no_catalogado honesto.
  **🟡** `fdc-2708024` *Buñuelo* **con confianza ≤ 50 %** y kcal 200–300.
  **❌ "Buñuelo" mostrado con confianza > 60 %.** Llamarle buñuelo a una croqueta es un
  error que cualquier español ve de un vistazo, y ese es el punto.

### 27 · Bocadillo de calamares — español + **receta del catálogo** · **difícil**
- **Ítems:** `fried calamari sandwich` / `squid sandwich on baguette` /
  `bocadillo de calamares` (+ `beer` ×2 en el encuadre).
- **Ficha:** **`receta-bocadillo-de-calamares`** *Bocadillo de calamares*
  (251,3 kcal/100 g, porción 220 g, alias *Bocata de calamares*).
- **La hipótesis que este plato prueba:** su `names.en` es
  `Fried calamari sandwich (bocadillo de calamares)` — **exactamente la misma forma**
  que la ficha de la tortilla de patatas, que en el test previo matcheó **exacto al
  90 %** porque el modelo escribió el nombre completo con el regional entre
  paréntesis. Si eso se repite acá, deja de ser anécdota y pasa a ser **una regla de
  curación**: `names.en` = *nombre genérico inglés (nombre regional)*.
- **Descomposición alternativa aceptable:** `fdc-2706334` *Calamares rebozados* (234,
  alias *Rabas*, `Calamares a la romana` 0,8) + pan.
- **kcal:** 220 × 2,513 = **553** · rango **450–700**. Cada caña de 250 ml suma ~110 kcal
  si las cuenta: hasta ~770 con las dos, y sería correcto.
- **✅** la receta, 450–700. **🟡** composición calamares + pan con total 400–750, o la
  receta con confianza < 40 %. **❌** no_catalogado, o `fdc-2707026` *Sándwich de
  pescado rebozado **con queso*** con confianza alta (le inventa el queso).

## 2.4 · Tres negativos difíciles (28–30)

**Por qué la bicicleta no alcanzaba.** Una bici no se parece a la comida en nada, y el
modelo la rechazó con 312 bytes de respuesta. Eso midió que el modelo no alucina; no
midió **dónde está el borde**. Estos tres están puestos justo en el borde, en orden
creciente de discutibilidad, y para cada uno se declara por adelantado qué se
considera correcto **y por qué**.

### 28 · Comida de plástico en vitrina — negativo · **difícil**
- **Qué es:** dos réplicas de resina de *honey toast* japonés en una vitrina
  iluminada, emplatadas, con cartelitos de precio en yenes y flores artificiales.
- **Comportamiento esperado: `is_food: false`, `items: []`, `totals: null`.**
  Motivo: **no hay nada comestible en la escena.** Un total de calorías sobre una
  réplica de plástico es un número inventado, aunque el objeto se llame "tostada".
- **Por qué es difícil:** las réplicas están *diseñadas* para pasar por comida, están
  servidas en plato, y el prompt de visión no dice nada sobre réplicas. Las señales
  disponibles son los cartelitos de precio, el reflejo del vidrio y las flores de
  plástico — todas contextuales, ninguna sobre el alimento.
- **🟡** `is_food: true` con los ítems identificados **pero confianza de visión < 0,5**:
  el modelo vio pan y crema y no tiene cómo saber que es resina; la duda declarada es
  una respuesta defendible.
- **❌** `is_food: true` con confianza alta y un total de calorías en firme.

### 29 · Plato vacío con cubiertos — negativo · **difícil**
- **Qué es:** plato blanco vacío, tenedor y cuchillo, fondo liso, cenital.
- **Comportamiento esperado: `is_food: false`, `items: []`, `totals: null`.**
- **Por qué importa más que los otros dos:** es **el negativo más probable en
  producción** — la foto sacada antes de que llegue el plato, o después de comer. Un
  usuario lo va a hacer sin querer en la primera semana.
- **🟡** `is_food: true` con `items: []` y `totals: null` — contradictorio pero inocuo.
- **❌** cualquier ítem inventado (el riesgo real: leer el brillo del plato como comida
  clara), **o un `totals: 0 kcal` presentado como una medición**. "Cero calorías" y "no
  hay comida" son cosas distintas y el usuario no las distingue.

### 30 · Comida en envase cerrado — negativo · **el más discutible de los tres**
- **Qué es:** una caja de cartón **cerrada** de *"The Tasty Food Co. — Tandoori Chicken
  Sandwich, 120 g"* sobre la bandeja de un avión, con **fotos impresas de alimentos en
  la tapa** (ajíes, tomate, manzana, romero), una servilleta y un vaso vacío. **La
  comida real no se ve por ningún lado.**
- **Comportamiento esperado (lo que contamos como correcto): `is_food: false`.**
  No hay comida visible que medir; hay un envase y unas ilustraciones.
- **🟡, y arguiblemente mejor producto que el ✅:** `is_food: true` con **un solo** ítem
  leído de la etiqueta (`sandwich, tandoori chicken`, 120 g — **el peso está impreso en
  la caja**) y confianza de visión ≤ 0,6. Sería honesto y útil: el modelo leyó la
  etiqueta, no midió el plato. Si sale así, **es una decisión de producto a tomar, no
  un bug**, y hay que anotarla como tal.
- **❌ el fallo que este caso existe para cazar:** que devuelva **los alimentos de las
  fotos impresas** —ají, tomate, manzana, romero— como ítems del plato. Sería el
  sistema comiéndose una ilustración, y es el mismo fallo que tendría con una carta de
  restaurante con fotos.

---

# Los criterios AGREGADOS del test

Estos son los números que convierten las 30 respuestas en un veredicto. **Se fijan
antes de correr nada.** Se calculan sobre los **27 platos de comida** (01–09, 11–27) y
sus ítems; los 3 negativos (10, 28–30) más el 10 previo se cuentan aparte.

## Los cinco números

| # | Métrica | Cómo se cuenta | Apto para mercado | Zona de duda | No apto |
|---|---|---|---|---|---|
| **1** | **Ítems con ficha correcta** | ítems ✅ ÷ ítems totales devueltos por la visión | **≥ 75 %** | 60–75 % | < 60 % |
| **2** | **Platos con kcal en rango** | platos cuyo total cae en el rango declarado, o que declaran `completo:false` habiendo cuantificado ≥ 70 % de los gramos | **≥ 80 % (22 de 27)** | 65–80 % | < 65 % |
| **3** | **Fichas equivocadas con confianza alta** | ítems ❌ con `confidence` ≥ 0,60 | **0. Sin excepciones.** | — | ≥ 1 |
| **4** | **Negativos bien manejados** | de los 4 (10, 28, 29, 30): ✅ o 🟡 | **4 de 4, con ≥ 3 en ✅** | 3 de 4 | ≤ 2, o cualquier ❌ |
| **5** | **Silencio sobre comida catalogada** | ítems en `no_catalogado` cuyo alimento **sí** existe en las 1.022 | **≤ 10 %** de los ítems | 10–25 % | > 25 % |

**El número 3 es una condición dura, no una métrica.** Un solo "Queso parmesano" al
80 % sobre un manchego, o un solo "Lomi salmón" sobre un salmón a la plancha, y el
test no es apto para mercado por más que los otros cuatro números den bien. La razón
es de producto, no de estadística: **el activo que el test previo demostró que existe
—cero fichas mal elegidas en 17 ítems— es lo único que hoy hace creíble al sistema.**
Se puede vivir con un producto que a veces calla; no se puede vivir con uno que a
veces miente con seguridad.

**El número 5 es el que este test viene a mover.** En el test previo fue del **59 %**
(10 de 17 ítems eran alimentos catalogados que el motor no encontró). Bajarlo a ≤ 10 %
es la definición operativa de "DT-17 resuelta".

## Tres cláusulas de honestidad, para que el resultado no se pueda maquillar

1. **Un total incompleto presentado como total es ❌, aunque cada ficha individual sea
   correcta.** El caso del test previo —43,6 kcal para un plato de bife con papas—
   tenía 4 de 5 fichas *bien identificadas por la visión*: lo que falló fue el número
   de portada. La métrica 2 se mide sobre el total, no sobre los ítems.
2. **Los platos con varios platos en cuadro (07, 08, 19, 23, 27) se juzgan con el
   rango ampliado de `fotos.md`.** Ítems de más no son errores.
3. **Sin repetición: cada foto se analiza una vez.** Este test **no mide estabilidad**
   entre corridas del modelo, y ninguna conclusión puede afirmar nada sobre eso. Si se
   quiere medir estabilidad, hay que correr `runner.sh` dos veces contra el mismo motor
   y comparar — son 60 llamadas, y es otro test.

## Composición del set, para leer los porcentajes con contexto

| Grupo | Platos | Dificultad |
|---|---|---|
| Simples | 01, 02, 11, 12, 13, 14, 15, 16 (8) | 3 fáciles · 3 medias · 2 difíciles |
| Compuestos servidos | 05, 07, 08, 17, 18, 19, 20, 21, 22, 23, 24 (11) | 4 medias · 7 difíciles |
| Españoles / regionales | 03, 04, 25, 26, 27 (5) | 3 medias · 2 difíciles |
| No catalogado por diseño | 06, 09 (2) | 2 difíciles |
| Negativos | 10, 28, 29, 30 (4) | 1 fácil · 3 difíciles |

**11 de los 30 son compuestos servidos** — deliberadamente sobrerrepresentados,
porque es donde el test previo midió el 100 % del daño. Si el motor nuevo arregla los
simples y no los compuestos, estos criterios lo van a decir.

## Huecos del catálogo verificados al escribir estas predicciones

No son fallos del motor; son fichas que **no existen** en las 1.022 y que el test va a
volver a tocar. Se anotan acá para que la cola de curación no los confunda con
problemas de matching:

- **`salmon` a la plancha** — la única coincidencia es *Lomi salmón* (plato crudo hawaiano).
- **`pasta cocida` sola** — no hay `Pasta, NFS` ni `spaghetti, cooked`; solo *Pasta con salsa*.
- **`baked beans`** — 0 coincidencias; lo más cercano son los frijoles en lata.
- **`ensalada mixta` / `garden salad`** — 0 coincidencias.
- **queso manchego** — solo como alias de confianza 0,5 sobre el parmesano.
- **croqueta de bechamel** — solo como alias de confianza 0,6 sobre el buñuelo dulce.
- **limón entero** — solo el jugo (`fdc-167747`), no la fruta.
- **`breast`** — 0 de 1.022 fichas, ya anotado en el test previo y todavía abierto.
