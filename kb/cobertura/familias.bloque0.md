# La taxonomía familia → subfamilia — Bloque 0 de la Fase 5

**Medido el 03/09/2026 contra el catálogo `3.8.0+843ecb80` (1.115 fichas) y el
motor real compilado en `functions/lib`.** Todo número de este informe sale de un
script que se corrió; ninguno de una estimación.

- El borrador de la taxonomía: `kb/curation/familias.json`.
- El candado que lo verifica: `node kb/cobertura/verificar_familias.js`.

---

## Por qué existe este Bloque 0

El 02/09, en producción, Sonnet miró una pizza y escribió
*«pizza with ham and mushrooms» / «pizza de jamón y champiñones»*, más cuatro
ingredientes. El catálogo tiene **cinco fichas de pizza** y ninguna se alcanzó:
no existe el término «pizza» a secas. Y la composición tampoco salvó el plato,
porque **no hay ficha de masa de pizza**. El usuario vio un plato sin número.

La decisión de producto es que **no habrá una segunda llamada al modelo** para
elegir entre candidatos: encarece cada escaneo. Entonces la carga se mueve al
prompt: la visión tiene que nombrar cada alimento con **el vocabulario del
catálogo**, y el motor tiene que poder caer siempre en una ficha cabeza o
componer. Para eso hace falta una taxonomía, y hoy no existe. Esto la propone y
la mide.

**Lo que hay hoy como punto de partida son las 179 `category` de USDA**, y no
sirven: son desparejas (`Vegetables and Vegetable Products` tiene 81 fichas y
`Bananas` tiene 1), están en inglés y mezclan dos criterios distintos — las
anchas de SR Legacy con las finas de FNDDS.

---

## a. Cobertura: qué quedó y dónde

| | |
|---|---:|
| Familias | **46** |
| Subfamilias | **191** |
| Fichas ubicadas | **1.115 de 1.115** |
| Fichas en ninguna subfamilia | **0** |
| Fichas en más de una subfamilia | **0** |

**El candado pasa**: cada ficha está en exactamente una subfamilia. Lo verifica
`kb/cobertura/verificar_familias.js`, que además comprueba que la cabeza de cada
subfamilia le pertenezca, que los ids estén bien formados y que ninguna
subfamilia sin cabeza se quede sin motivo escrito. **La card 5.3 lo convierte en
test de `functions/`.**

### Cuánto de esto puede hacer el build solo

Cada ficha registra en `origen_de_asignacion` cómo se ubicó:

| Cómo se ubicó | Fichas | % |
|---|---:|---:|
| Su `category` de USDA alcanzó | 355 | 31,8 % |
| Hizo falta una regla sobre el nombre | 752 | 67,4 % |
| Decisión escrita a mano, ficha por ficha | 8 | 0,7 % |

**La lectura: un tercio del catálogo se clasifica solo con el dato de USDA; dos
tercios necesitan mirar el nombre.** Las reglas son deterministas y están
escritas (por ejemplo: en `Vegetables and Vegetable Products`, si el nombre trae
«juice» va a zumo, si trae «pickle» va a encurtido, si trae «canned» va a
conserva, y lo que queda es verdura cruda), así que **el build puede emitir esta
taxonomía sin intervención humana** salvo por ocho fichas sueltas. Eso es lo que
hace viable regenerarla en cada re-seed.

> **Una trampa medida por el camino, que vale para cualquiera que escriba estas
> reglas:** buscar `"raw"` como subcadena mete las **st-RAW-berries** en fruta
> fresca — «Fresas en lata» terminó junto a las fresas crudas. Las reglas
> comparan **palabra completa**, y eso salió de mirar el resultado, no de
> pensarlo.

### Las familias, por tamaño

| Fichas | Sub | Familia | | Fichas | Sub | Familia |
|---:|---:|---|---|---:|---:|---|
| 135 | 9 | Verdura | | 21 | 4 | Legumbre |
| 61 | 5 | Fruta | | 21 | 4 | Postre |
| 53 | 7 | Salsa y aliño | | 20 | 4 | Bebida alcohólica |
| 46 | 7 | Bocadillo y sándwich | | 19 | 2 | Alternativa vegetal |
| 40 | 4 | Zumo y batido | | 19 | 5 | Dulce y chocolate |
| 37 | 3 | Bollería y repostería | | 18 | 4 | Nata y crema |
| 36 | 7 | Pan | | 17 | 3 | Café e infusión |
| 35 | 6 | Pescado | | 17 | 5 | Plato mexicano |
| 35 | 6 | Queso | | 17 | 5 | Sopa y caldo |
| 30 | 3 | Frutos secos y semillas | | 17 | 4 | Yogur |
| 30 | 5 | Aperitivo salado | | 16 | 5 | Huevo |
| 29 | 3 | Cereal y grano | | 15 | 5 | Carne de vacuno |
| 29 | 6 | Patata y tubérculo | | 14 | 5 | Embutido y fiambre |
| 27 | 3 | Aceite y grasa | | 14 | 3 | Plato asiático |
| 26 | 4 | Pollo | | 13 | 4 | Guiso y cocido |
| 24 | 3 | Arroz | | 12 | 4 | Refresco y agua |
| 24 | 4 | Marisco | | 11 | 4 | Bebida deportiva y suplemento |
| 23 | 4 | Leche | | 10 | 2 | Pavo y otras aves |
| 23 | 4 | Pasta | | 10 | 5 | Pizza |
| 21 | 3 | Cereal de desayuno | | 9 | 4 | Carne de cerdo |
| | | | | 8 | 3 | Ensalada |
| | | | | 8 | 2 | Tortita y crepe |
| | | | | 7 | 2 | Casquería |
| | | | | 7 | 2 | Condimento |
| | | | | 6 | 3 | Cordero, conejo y caza |
| | | | | 5 | 2 | Empanada y masa rellena |

### Las 13 subfamilias sin cabeza — que son hallazgos, no olvidos

**Ninguna de las 46 familias se quedó sin cabeza.** De las 191 subfamilias, 178
(93,2 %) tienen una, y esas 178 cubren **1.055 de las 1.115 fichas (94,6 %)**.
Las 13 que no tienen se declaran con su motivo en el JSON:

| Subfamilia | Por qué no hay cabeza |
|---|---|
| **ensalada/verde** | **NINGUNA FICHA. El catálogo no tiene ensalada verde ni ensalada mixta**: la lechuga vive como verdura cruda. Es el hueco más caro para una app mediterránea. |
| **café e infusión → té** | **No hay ficha de té a secas.** Las ocho son té helado, té con leche, kombucha o bubble tea. |
| **sopa → crema y sopa espesa** | Solo hay crema de mariscos y sopa de maní. **Falta la crema de verduras**, que es la que se come (calabacín, calabaza, vichyssoise). |
| **fruta → fruta seca** | Papaya seca, caqui seco y açaí en polvo. **Faltan pasas, dátiles y orejones.** |
| **guiso → cocido y potaje** | Tres recetas con nombre propio (cocido montañés, escudella, pote gallego). **No hay cocido ni potaje genérico.** |
| **bocadillo → bocadillo** | La única ficha es el bocadillo de calamares. Un bocadillo se responde **componiendo** pan + relleno. |
| **bocadillo → sándwich de desayuno** | Siete fichas concretas, ninguna promedio. |
| pescado → plato de pescado | 14 platos con nombre propio; ninguno es el promedio. |
| marisco → plato de marisco | 9 platos con nombre propio; ídem. |
| ensalada → ensalada de verdura | Cuatro ensaladas con nombre propio. En modo `componer` la cabeza es el último recurso, así que no bloquea. |
| pan → plato hecho con pan | Migas y bruschetta. |
| casquería → plato de casquería | Morteruelo y riñones al Jerez. |
| condimento → otros condimentos | Es un cajón de sastre; un cajón de sastre no tiene promedio. |

### Modo y método por defecto

| `modo` | Subfamilias |
|---|---:|
| `identificar` — manda la ficha | **180** |
| `componer` — manda la suma gramo a gramo | **11** |

Las once en modo `componer` son: **ensalada verde**, **ensalada de verdura**,
**macedonia**, las **cinco de bocadillo y sándwich** (bocadillo, sándwich frío,
sándwich caliente, wrap y sándwich de desayuno), **taco y burrito**, **arroz con
guarnición** y **plato preparado congelado**. La ensalada con mayonesa se queda
en `identificar` a propósito: el aliño no se ve y es el que carga el número —117
kcal/100 g contra los 45 de la col cruda.

**El desbalance no es un descuido: es el hallazgo.** El catálogo está hecho de
ALIMENTOS y de PLATOS CON NOMBRE, y casi ninguna de sus fichas es una «reunión de
cosas separables». **La composición no vive en la subfamilia: vive en el PLATO**,
y el plato no es una ficha — es lo que la visión devuelve cuando emite varios
`items`. Está medido más abajo (punto c): en las cinco fotos de plato combinado
del golden, la visión ya devolvió los ingredientes por separado y el motor ya los
sumó. El campo `modo` sirve para el otro caso: cuando la visión nombra el PLATO
ENTERO («ensalada mixta») y hay que decidir si se responde con una ficha o se
exige la descomposición.

| `metodo_por_defecto` | Subfamilias |
|---|---:|
| `mezclado` (factor 1,000) | 143 |
| `horneado_masa` (0,891) | 16 |
| `frito` (+6,5 % de aceite) | 11 |
| `horneado` (0,759) | 11 |
| `plancha` (0,757) | 10 |

> **Un límite declarado:** la tabla `kb/curation/cooking.transforms.json` tiene
> **ocho** transformaciones, no cinco. Las tres que este campo no puede usar son
> `crudo` (1,000), `hervido` (1,113 — verduras y legumbres, que **ganan** agua) y
> `cocido_cebolla` (0,850). Para las 24 subfamilias de verdura, fruta, legumbre
> y patata, el método honesto sería `crudo` o `hervido`; se les puso
> `mezclado`, que tiene factor 1,000 y por lo tanto **no inventa nada** — pero
> tampoco corrige el agua que gana una legumbre al hervirse. **Recomendación:
> abrir el campo a los ocho métodos en la card 5.2**, que es donde el enum de
> `preparation` se toca de todos modos.

---

## b. Los huecos del matcher de hoy

**La pregunta medida:** si mañana la visión escribe el nombre de una familia o de
una subfamilia, ¿el motor de hoy llega a la ficha cabeza? Se corrió
`buscarConDosNombres(nombre_en, nombre_es)` contra el índice real para los 46
nombres de familia y los 191 de subfamilia.

| Adónde llegó | Familias (46) | Subfamilias (191) |
|---|---:|---:|
| **A la ficha cabeza** | **22 (48 %)** | **86 (45 %)** |
| A otra ficha de la misma subfamilia | — | 22 (12 %) |
| A la familia correcta, subfamilia equivocada | 7 (15 %) | 39 (20 %) |
| **A OTRA FAMILIA (grave)** | **6 (13 %)** | **9 (5 %)** |
| **A NADA** | **11 (24 %)** | **35 (18 %)** |

**Traducido: hoy el motor entiende poco más de la mitad del vocabulario que le
vamos a pedir a la visión que use.** Esto es exactamente lo que la card 5.3 tiene
que cerrar, y se cierra con curación de vocabulario (aliases y nombres), no con
código nuevo.

### Los 15 casos GRAVES: el nombre cae en otra familia

Son el caso «pepperoni pizza → embutido» escrito con otros nombres. Si la visión
dice esto y el motor no cambia, el usuario ve **otro alimento**:

| Nombre que dijimos | Adónde cae hoy | Nivel |
|---|---|---|
| **Verdura** | **Aceite vegetal** (aceite y grasa) | difuso 0,42 |
| **Arroz** | **Sopa de arroz** (sopa) | difuso 0,27 |
| **Postre** | **Dip dulce** (dulce) | difuso 0,38 |
| **Nata y crema** | **Queso crema** (queso) | difuso 0,25 |
| **Cereal y grano** | **Cereal** de desayuno | difuso 0,30 |
| **Casquería** / **Víscera** | **Carne** (vacuno) | difuso 0,24 |
| **Perrito caliente** | **Hot dog** — la salchicha sola, sin pan (embutido) | **alias 1,00** |
| **Carne de caza** | **Carne** (vacuno) | difuso 0,30 |
| **Sustituto de carne** | **Carne** (vacuno) | difuso 0,20 |
| **Masa rellena frita** | **Morcilla** (embutido) | difuso 0,60 |
| **Ensalada verde** | **Verduras de hoja cocidas con sal y grasa** | difuso 0,27 |
| **Empanadilla asiática** | **Empanadilla rellena** (empanada) | difuso 0,33 |
| **Costilla y rabo** | **Costillas de cerdo** (cerdo) | difuso 0,18 |
| **Néctar y bebida de fruta** | **Fruta** (fruta fresca) | difuso 0,17 |

El peor es **«perrito caliente» → «Hot dog»**, porque llega por **alias con
confianza 1,00**: el motor está seguro y está sirviendo la salchicha sin el pan
(310 kcal/100 g en vez de 295 con pan, pero sobre todo: otro alimento).

### Los 46 nombres que hoy no llegan a nada

**Familias mudas (11):** aceite y grasa · alternativa vegetal · bebida
alcohólica · bollería y repostería · condimento · dulce y chocolate · legumbre ·
plato asiático · plato mexicano · aperitivo salado · zumo y batido.

**Subfamilias mudas (35):** arroz cocido · arroz con guarnición · plato de arroz
· destilado y licor · bollería · té e infusión · plato de casquería · grano
cocido · grano crudo o seco · harina y almidón · otros condimentos · especia, sal
y vinagre · ensalada con mayonesa · ensalada de verdura · cocido y potaje ·
huevo revuelto y tortilla · bebida vegetal · legumbre cocida · legumbre en
conserva · plato de legumbre · legumbre cruda o seca · crustáceo · otras aves y
caza de pluma · bagel y muffin inglés · salteado asiático · otro plato mexicano ·
gelatina y sorbete · postre lácteo tradicional · chips de maíz y de verdura ·
polvo de proteína · verdura cocida sin grasa · verdura cocida con grasa ·
encurtido y fermentado · verdura frita o rebozada · plato de verdura.

**Que «legumbre», «arroz cocido» y «huevo revuelto y tortilla» no lleguen a nada
es la medida de cuánto trabajo de vocabulario queda.** Ninguno de estos 46
nombres es raro: son las palabras con las que se pide la comida.

---

## c. El uso real, vuelto a jugar

### Los 68 ítems del golden v3

Se tomó la ficha que **realmente ganó** en cada uno de los 68 ítems de las 30
fotos, se buscó su subfamilia y se comparó su kcal/100 g con la de la **cabeza**
de esa subfamilia.

| | Ítems |
|---|---:|
| Total | 68 |
| Sin ficha hoy (`no_catalogado`) | **2** |
| Ficha en subfamilia sin cabeza | 1 |
| **La cabeza queda dentro de ±20 %** | **42 (64 %)** |
| **La cabeza queda fuera de ±20 %** | **23 (35 %)** |

Desglosado por cómo llegó el término hoy:

| Nivel del match de hoy | Dentro de ±20 % | Fuera |
|---|---:|---:|
| `exacto` (el término ES el nombre de la ficha) | 8 | 5 |
| `alias` (la curación lo escribió) | 15 | 3 |
| **`difuso` (el motor está adivinando)** | **19** | **15** |

**La conclusión operativa, y es la más importante del informe: la cabeza es un
RESPALDO, no un reemplazo.** Los 31 ítems que hoy llegan por `exacto` o `alias`
ya tienen su ficha propia y la cabeza no debe tocarlos nunca — si se los
reemplazara, 8 de esos 31 empeorarían, algunos brutalmente:

- `tuna, canned` → hoy **Atún** (85 kcal). La cabeza de *pescado cocinado* es
  **Pescado** (238 kcal): **+180 %**.
- `ketchup` → hoy **Kétchup** (109). La cabeza de *salsa de tomate* es **Salsa de
  tomate en lata** (24): **−78 %**.
- `lettuce, iceberg, raw` → hoy **Lechuga iceberg** (14). La cabeza de *verdura
  cruda* es **Verdura cruda** (30): **+114 %**.
- `serrano ham` → hoy **Jamón crudo** (195). La cabeza de *jamón* es **Jamón**
  cocido (117): **−40 %**.

**Cuántos casos SALVA la cabeza: 21.** Son los 2 que hoy no tienen ficha ninguna
(`grilled potato slice` y `grilled green pepper`, los dos de la foto 23) más los
19 que hoy llegan **adivinando** (`difuso`) y cuya cabeza cae dentro del ±20 %:
el mismo número, pero llegado por un camino declarado en vez de por una
coincidencia de palabras.

**Cuántos EMPEORA: 15**, todos ellos entre los que hoy adivinan. Y mirándolos de
cerca, la mitad no son culpa de la cabeza sino de la **subfamilia equivocada**:

| Término | Hoy | Cabeza de su subfamilia | Desvío |
|---|---|---|---:|
| `peas and carrots, cooked` | Arvejas **crudas** 81 | Verdura cruda 30 | −63 % |
| `beet, pickled` | Remolacha **cruda** 45 | Verdura cruda 30 | −33 % |
| `cabbage, cooked` | Repollo cocido sin grasa 32 | Tomate cocido 50 | +56 % |
| `gravy, brown sauce` | **Salsa mexicana** 34 | Salsa 109 | +221 % |
| `coleslaw with mayonnaise` | Ensalada de repollo con mayonesa 117 | Ensalada de repollo 45 | −62 % |
| `chickpeas, cooked` | Garbanzos cocidos 211 | Alubias cocidas sin grasa 139 | −34 % |
| `lasagna, meat and spinach` | Lasaña con carne 207 | Pasta con salsa 125 | −40 % |

En cuatro de esos siete, **el término real pertenece a OTRA subfamilia que la que
la ficha de hoy dice**: unas arvejas cocidas son *verdura cocida con grasa* (86),
no *verdura cruda* (30); una remolacha encurtida es *encurtido* (40), no *verdura
cruda*; un `gravy` es *salsa de carne* (53), no *otras salsas* (109). **Es la
prueba de que el número lo carga la SUBFAMILIA, no la familia**: dentro de
«verdura», cruda contra cocida-con-grasa son 30 contra 86 kcal — casi el triple.

### Los cuatro escaneos de producción

| Término | Hoy | Subfamilia | Cabeza de esa subfamilia |
|---|---|---|---|
| `egg, hard-boiled` / huevo cocido | **Huevo cocido** 176, alias 1,00 | huevo/cocido | Huevo cocido 176 ✅ |
| `banana` / plátano | **Banana cruda** 89, alias 1,00 | fruta/fresca | Fruta 68 |
| **`pizza with ham and mushrooms`** | **SIN MATCH** | — | — |
| `cherries, raw` / cerezas | Cerezas dulces 63, difuso 0,20 | fruta/fresca | Fruta 68 |
| **`pizza dough, baked`** (componente) | **SIN MATCH** | — | — |
| `mozzarella cheese, melted` | Queso mozzarella 296, difuso 0,60 | queso/fresco | Ricota 148 |
| `ham, sliced` | Jamón 117, difuso 0,60 | embutido/jamon | Jamón 117 ✅ |
| `mushrooms, sliced` | Champiñones cocidos con grasa 66 | verdura/cocida-con-grasa | Verduras mixtas 86 |

**La pizza sigue rota y la taxonomía sola no la arregla.** La arregla en dos
pasos: (1) que la visión emita `familia: pizza` + `subfamilia: pizza-con-carne`
→ la cabeza es **Pizza con carne, 280 kcal/100 g**, y el plato deja de estar sin
número; (2) que la curación cree la ficha de masa de pizza para que la
composición también sea posible (ver punto d).

### Los cinco platos compuestos, uno por uno

Se comparó lo que salió (la suma de los ítems que la visión emitió por separado)
contra dos alternativas: responder cada ítem con la **cabeza** de su subfamilia,
y responder el **plato entero** como una sola identidad.

| Foto | Plato | Hoy (suma de ítems) | Si cada ítem usara su cabeza | Si se nombrara el PLATO ENTERO |
|---|---|---:|---:|---|
| 20 | Ensalada mixta | 405 g · **324 kcal** | 420 kcal (+30 %) | «ensalada mixta» → **SIN MATCH** |
| 07 | Bife combinado | 510 g · **924 kcal** | 848 kcal (−8 %) | «plato combinado de bife» → **SIN MATCH** |
| 22 | Desayuno inglés | 420 g · **678 kcal** | 722 kcal (+6 %) | «desayuno inglés» → **SIN MATCH** |
| 23 | Salmón con patatas | 405 g · **595 kcal** | 535 kcal (−10 %) | **Salmón a la plancha → 1.049 kcal (+76 %)** |
| 17 | Pollo, arroz y verduras | 360 g · **492 kcal** | 436 kcal (−11 %) | **Pollo con piel → 706 kcal (+43 %)** |

**El modo asignado (`componer`) es el correcto en los cinco, y está medido.** En
los dos casos donde el motor SÍ encuentra una ficha para el plato entero, esa
ficha es un desastre: aplicar la densidad del salmón a la plancha (259 kcal/100 g)
a los 405 g del plato entero —que incluyen patata, pan, ensalada y manzana— da
**1.049 kcal contra 595 reales, un 76 % de más**. Lo mismo con el pollo: +43 %.
En los otros tres el plato entero no tiene ficha y `identificar` directamente no
tendría respuesta.

Detalle por plato:

- **Ensalada mixta (componer ✅).** Siete ítems, cada uno con su ficha. La cabeza
  empeoraría el número (+30 %) porque *verdura cruda* (30) es más densa que la
  lechuga (14) y el tomate (20) que hay de verdad. **Lo que falta acá no es una
  cabeza: es la ficha de ensalada verde, que no existe.**
- **Bife combinado (componer ✅).** El único ítem realmente mal es `gravy, brown
  sauce` → **Salsa mexicana** (13,6 kcal en 40 g). Si la visión declarara
  `salsa-y-aderezo/carne`, la cabeza **Salsa de carne** (53) daría 21,2 kcal:
  mejor.
- **Desayuno inglés (componer ✅).** Cinco de seis ítems ya caen en la subfamilia
  correcta y su cabeza coincide con la ficha que ganó. Es el plato donde la
  taxonomía cambia menos, y eso también es información: el vocabulario del
  desayuno ya está curado.
- **Salmón con patatas (componer ✅, y el que más gana).** Dos ítems hoy quedan
  **sin número** (`grilled potato slice`, `grilled green pepper`) y las cabezas
  los resuelven (*patata hervida o al horno* 126 · *verdura cocida con grasa* 86).
  Además destapa un defecto: `fish fillet with brown sauce, grilled` cae en
  **Pescado** (`Fish, NFS`), que tiene **238 kcal/100 g, 14,5 g de grasa y 6,6 g
  de hidratos** — o sea, es un pescado REBOZADO disfrazado de promedio. Es el
  mismo caso que la DT-7 (`Bacalao` → `Bacalao rebozado`) y el punto 6 del
  `README` del censo. **Hallazgo para la curación: falta un genérico de pescado a
  la plancha.**
- **Pollo, arroz y verduras (componer ✅).** `peas and carrots, cooked` cae en
  **Arvejas crudas**; su subfamilia correcta es *verdura cocida con grasa*
  (cabeza 86). Los otros dos ítems ya caen en su cabeza exacta.

---

## d. Los componentes: qué ingredientes de base faltan

Se probaron contra el motor real **50 ingredientes de base** que la visión va a
nombrar al descomponer los 141 platos del censo y los platos compuestos del
golden, escritos como los emite el modelo (inglés de USDA + español de España).
Y para cada hueco se fue **a los datasets crudos** (`../datasets/extracted`) a
preguntar si USDA lo mide: es la lección 5 del censo —una pista con el alcance
declarado se convierte en un hallazgo; una sin alcance declarado se convierte en
una creencia.

**El resultado en una línea: de los 13 ingredientes que hoy no tienen NADA, NUEVE
existen medidos en USDA y lo único que falta es promoverlos.** Es exactamente lo
que le pasó a la card 6.4 con el salmón y el mejillón.

### Los 13 que hoy no encuentran nada

| Ingrediente | ¿USDA lo mide? | kcal/100 g medidos | Qué hacer |
|---|---|---:|---|
| **masa de pizza horneada** / **base de pizza** | **NO** (0 coincidencias con `pizza dough` ni `pizza crust` en los tres datasets) | — | **Sustituto declarado ya en el catálogo: `Pizza sin queso, masa fina` (276)**, que es masa + salsa. O receta propia. Es el hueco que rompió el escaneo de producción. |
| **hojaldre** / `puff pastry` | **SÍ** — SR 172738 `Puff pastry, frozen, ready-to-bake, baked` | **558** | Promover. Hoy cae en `Empanada` (291): **subestima un 48 %** |
| **masa filo** / `phyllo dough` | **SÍ** — SR 172791 | **299** | Promover. Hoy cae en `Empanada` (291): casualmente acierta |
| **panko** | **NO** por ese nombre | — | Sustituto: pan rallado (abajo) |
| **pan rallado** *(hoy cae en `Pan`, 267)* | **SÍ** — SR 174928 `Bread, crumbs, dry, grated, plain` | **395** | Promover. El pan de molde **subestima un 32 %** |
| **sofrito** | **SÍ** — SR 171174 `Sauce, sofrito, prepared from recipe` | **237** | Promover. Hoy cae en `Salsa` (109): **subestima un 54 %** |
| **pasta de tomate** | **SÍ** — SR 170459 | **82** | Promover. Hoy cae en `Salsa de tomate en lata` (24): **subestima un 71 %** |
| **arroz bomba** / **arroz arborio** | **NO** por esos nombres | — | **Alias a `Arroz blanco cocido` (129)** si se declara cocido. En crudo, alias a arroz crudo |
| **dátiles** | **SÍ** — FNDDS 2709203 `Date` | **282** | Promover |
| **orejones** | **SÍ** — FNDDS 2709197 `Apricot, dried` | **241** | Promover |
| **pasas** *(hoy caen en `Pan con pasas`, 270)* | **SÍ** — FNDDS 2709212 `Raisins` / 2709207 `Raisin` | **239** | Promover. Con las tres se cierra `fruta/seca`, que hoy no tiene cabeza |
| **té** / `tea, brewed` | **SÍ** — FNDDS 2710488 `Tea, hot, leaf, black` (y 8 más) | **1** | Promover. Cierra `cafe-e-infusion/te`, que hoy no tiene cabeza |
| **azafrán** / **levadura** / **tinta de calamar** | azafrán SR 170934 (310) y levadura SR 175042; tinta de calamar **NO** | — | **Irrelevantes para el número**: se usan en décimas de gramo |

### Los 10 que tienen ficha pero la EQUIVOCADA — que son peores

Son más peligrosos que los que no tienen nada, porque **dan un número con
apariencia de medido**:

| Ingrediente | Adónde cae hoy | kcal | Lo que debería ser | kcal |
|---|---|---:|---|---:|
| **caldo de pollo** / `chicken broth` | **Pollo con piel** | **196** | `Caldo` (ya en el catálogo) | **6** |
| **crema de verduras** | **Crema** (la nata) | **131** | **FNDDS 2710109 `Soup, cream of vegetable`** — existe y no está | **78** |
| **bechamel** / **salsa blanca** | `Salsa` | 109 | **FNDDS 2705703 `White sauce or gravy`** — existe y no está | **144** |
| **ensalada verde** / **ensalada mixta** | **Verduras de hoja COCIDAS con sal y grasa** | 58 | **FNDDS 2709792 `Mixed salad greens, raw`** (21) y **2709822 `Lettuce, salad with assorted vegetables, no dressing`** — existen y no están | **21 / 24** |
| **queso fresco** | **Queso** curado | **381** | **FNDDS 2705745 `Queso Fresco`** y **SR 172223** — existen y no están | **298 / 299** |
| **tomate frito** | `Salsa` | 109 | Receta: tomate + aceite, o alias a `pasta de tomate` | 82 |
| **pimentón** / `paprika` | **Pimiento rojo crudo** | 31 | Especia; irrelevante en gramos | — |
| **cebolla pochada** | Cebolla **cruda** | 38 | Cebolla cruda con el método `cocido_cebolla` (0,850) | — |
| **mascarpone** | `Queso` curado | 381 | **USDA no lo mide** (0 coincidencias). Sustituto declarado: queso crema (350) | 350 |
| **pan rallado** | `Pan` | 267 | SR 174928 (ver arriba) | **395** |

**Los cinco de la columna «existe y no está» son la conclusión del punto d**:
`Soup, cream of vegetable`, `White sauce or gravy`, `Mixed salad greens`,
`Lettuce salad with assorted vegetables` y `Queso Fresco`. **Con esas cinco
promociones más las cuatro de fruta seca y té se cierran cinco de las trece
subfamilias sin cabeza**, y las cinco están medidas por USDA desde antes de que
existiera este proyecto.

### Los que sí funcionan, y conviene saberlo

`aceite de oliva` (exacto, 900) · `harina de trigo` (alias, 364) · `parmesano
rallado` (exacto, 421) · `mozzarella` (exacto, 296) · `chorizo` (exacto, 341) ·
`espaguetis cocidos` y `macarrones cocidos` (alias → Pasta cocida, 157) ·
`patata frita` (alias, 225) · `patata cocida` (exacto, 126) · `ajo` (exacto,
143) · `azúcar`, `leche`, `mantequilla` (exactos).

### Y lo que dice el censo de los 141 platos

El censo (`kb/cobertura/censo.json`, misma versión de catálogo) ya mide 196
ingredientes de receta publicada: **45 `ok`, 96 por confianza injusta, 8 con
ficha equivocada y 47 ausentes**. De esos 47 ausentes, **32 son especias y
hierbas** (canela, comino, orégano, azafrán, laurel, romero…) que no mueven el
número, y los **15 que sí importan** son: bechamel, masa filo, panko, tomate
frito, pasta de tomate, puré instantáneo, arroz bomba, arroz arborio, rigatoni,
mascarpone, parmesano *(que sí existe pero no se alcanza por ese nombre)*, pasas,
orejones, gambones y morcillo de ternera. **Coincide con lo medido arriba: la
falta real es de MASAS, SALSAS BASE y FRUTA SECA.**

---
## e. Cuánto pesa esto en el esquema de la visión

| | |
|---|---:|
| Valores de `family` | **46** |
| Valores de `subfamily` | **191** |
| Máximo de subfamilias en una familia | 9 |
| Caracteres de todos los ids juntos | **3.405** (≈ 900–1.100 tokens) |

### Recomendación: **UN SOLO enum, con el par compuesto**

No dos enums (`family` de 46 y `subfamily` de 191) sino **uno de 191 valores con
la forma `familia/subfamilia`** (`pizza/con-carne`, `verdura/cocida-con-grasa`).
El motivo es que **dos enums independientes permiten un par incoherente** —
`family: "pescado"` con `subfamily: "frita"` — y el motor tendría que decidir
cuál de los dos creer, que es exactamente la clase de decisión que este Bloque 0
existe para evitar. Con el par compuesto, la familia se lee partiendo el string
por la barra y **no puede haber contradicción**.

**La subfamilia NO puede ir libre.** Un campo de texto libre es lo que ya
tenemos en `food_en` / `food_es`, y es lo que produjo el «pizza with ham and
mushrooms» que no matchea con nada. El valor entero de la taxonomía es que la
salida del modelo caiga en una lista **cerrada** que el motor conoce byte a byte.

**El coste está medido y es asumible:** 3,4 KB de esquema por llamada. Sobre un
prompt que ya manda una imagen de 170–370 KB en base64 (medido sobre
`golden/set-30/bodies-v3`), es ruido — y como el
esquema es idéntico en todos los escaneos, es el candidato perfecto para el
caché de prompt.

---

## f. Recomendación para la card 5.2 y la card 5.3

### 5.2 — Lo que la visión tiene que emitir

Cuatro cambios en `ESQUEMA_VISION` (`functions/src/analyze/vision.ts`), en orden
de importancia:

1. **`familia_subfamilia`: enum obligatorio de 191 valores**, el par compuesto.
   La visión deja de elegir palabras y elige de una lista. `food_en` y `food_es`
   **siguen existiendo y siguen siendo obligatorios**: son el camino preciso, y
   la taxonomía es el respaldo. No se reemplaza nada.
2. **`components` pasa a ser SIEMPRE obligatorio**, no «solo cuando el plato no
   tiene nombre obvio». Medido: en las cinco fotos de plato combinado la visión
   ya los emitió y el motor ya los usó — pero en la pizza de producción los
   emitió y la composición murió por un ingrediente. Que estén siempre convierte
   la composición en un respaldo disponible, no en una excepción.
3. **`etiqueta_del_envase`: campo de texto opcional.** Cuando en la foto hay un
   envase legible, ese texto es la fuente más precisa que existe (es lo que
   destrabó el torrezno en la card 6.4c). Hoy se tira.
4. **`preparation` se amplía a los ocho métodos** de `cooking.transforms.json`,
   sumando `crudo`, `hervido` y `cocido_cebolla`. Es el mismo cambio que pide el
   `metodo_por_defecto` del punto a.

### 5.3 — La cascada nueva del motor

```
1. TÉRMINO EXACTO      food_en / food_es contra el catálogo   → lo de hoy, intacto
2. SUBFAMILIA CABEZA   la cabeza de familia/subfamilia         → 178 de 191 subfamilias
3. FAMILIA CABEZA      la cabeza de la familia                 → las 46 tienen
4. COMPOSICIÓN         los components, con metodo_por_defecto  → si están todos
5. COMPOSICIÓN PARCIAL los components que sí resolvieron       → declarando qué faltó
6. SIN NÚMERO          y a la cola de curación
```

Con dos reglas que salen de lo medido y que no son negociables:

- **El orden importa y el nivel 1 gana siempre.** Está medido en el punto c: si
  la cabeza reemplazara al término exacto, 8 de 31 ítems empeorarían, uno de
  ellos un +180 % (`tuna, canned` → Pescado). La cabeza **solo baja al ruedo
  cuando el término no llegó**.
- **En las subfamilias con `modo: componer`, los pasos 4 y 5 van ANTES que el
  2 y el 3.** Medido: en el plato de salmón, responder por identidad da 1.049
  kcal contra 595 reales (+76 %).

**Y el paso 5 —la composición parcial— es el que faltaba.** Hoy el motor tiene
una regla dura y correcta («o están todos los ingredientes o no hay
composición»), pero su consecuencia es que **un solo ingrediente sin ficha deja
el plato entero sin número**: es literalmente lo que pasó con la masa de pizza.
Con la taxonomía la regla se puede relajar sin mentir, porque **cada ingrediente
que falta tiene una cabeza de subfamilia a la que caer**, y el reporte puede
decir cuáles usaron el respaldo.

### Cuánto del catálogo queda alcanzable sin una llamada extra al modelo

**El 94,6 % de las fichas (1.055 de 1.115) vive en una subfamilia que tiene
cabeza**, y las 46 familias tienen la suya. Es decir: **con `familia/subfamilia`
como enum, el 100 % de los escaneos recibe un número y el 94,6 % del catálogo es
alcanzable por el camino declarado, sin una sola llamada adicional al modelo.**
El 5,4 % restante son las 13 subfamilias sin cabeza, y esas se cierran con
**curación, no con código**. Y el punto d dice que es curación barata: siete de
las fichas que faltan **ya están medidas por USDA y solo hay que promoverlas**
(`Mixed salad greens`, `Lettuce salad with assorted vegetables`, `Tea, hot, leaf,
black`, `Soup, cream of vegetable`, `Raisins`, `Date`, `Apricot, dried`). La
única que USDA no tiene es **la masa de pizza**, y para esa hay un sustituto
declarado ya dentro del catálogo: `Pizza sin queso, masa fina` (276 kcal/100 g).

Lo que **no** queda resuelto y hay que decirlo: que la visión elija la subfamilia
correcta. La taxonomía garantiza que **haya** respuesta; que sea la respuesta
buena depende de que el modelo distinga *verdura cruda* de *verdura cocida con
grasa* (30 contra 86 kcal). **Eso se mide con el golden, y es el trabajo de la
card 5.4.**

---

## Deudas que este Bloque 0 deja escritas

| # | Qué | Dónde |
|---|---|---|
| 1 | **46 nombres de familia y subfamilia no llegan a ninguna ficha**, y 15 llegan a otra familia | card 5.3 · curación de vocabulario |
| 2 | **`Fish, NFS` (238 kcal) es un pescado rebozado disfrazado de promedio** | curación · falta un genérico de pescado a la plancha |
| 3 | **Siete fichas que USDA SÍ mide y el catálogo no tiene**, y bloquean cinco subfamilias: `Mixed salad greens` (21), `Lettuce salad with assorted vegetables` (24), `Tea, hot, leaf, black` (1), `Soup, cream of vegetable` (78), `Raisins` (239), `Date` (282), `Apricot, dried` (241) | selección · promoción |
| 4 | **La masa de pizza no existe ni en USDA.** Sustituto declarado: `Pizza sin queso, masa fina` (276), o receta propia | curación |
| 5 | **Cinco ingredientes de base medidos por USDA y sin promover**: hojaldre (558), masa filo (299), pan rallado (395), sofrito (237), pasta de tomate (82), `White sauce or gravy` (144), `Queso Fresco` (298) | selección · promoción |
| 6 | `metodo_por_defecto` está limitado a cinco de las ocho transformaciones medidas | card 5.2 |
| 7 | **«perrito caliente» llega por alias 1,00 a la salchicha sin pan** | guarda de vocabulario |
| 8 | `caldo de pollo` cae en **Pollo con piel** (196 kcal contra los 6 del caldo) | curación · alias |
| 9 | `queso fresco` cae en **Queso** curado (381 contra los 298 del `Queso Fresco` de FNDDS) | curación · alias |
