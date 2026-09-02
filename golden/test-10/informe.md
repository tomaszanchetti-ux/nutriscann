# Card 2.4 · Test fundamental de confianza — 10 platos reales, back-only

**Qué se midió.** 10 fotos reales de Wikimedia Commons contra el backend en el
emulador local (`kb 3.0.0+b2b227e1`, `claude-sonnet-5`). **10 llamadas, ninguna
falló, ninguna se reintentó** (techo autorizado: 14). 29.606 tokens, 3,7 s de
latencia media. Las predicciones se escribieron **antes** de bajar las fotos
(`predicciones.md`); el origen y la licencia de cada foto está en `fotos.md`.

**Qué NO se midió.** Nada de front: esto es la respuesta del endpoint, no lo que
ve el usuario. Un plato por foto, una foto por plato: no hay repetición, así que
no se mide la estabilidad del modelo entre corridas.

**Herramienta auxiliar.** Se replicó el matcher en Python
(`matcher.py`, réplica de `engine/{normalize,catalog,match}.ts` sobre
`kb/build/foods.canonical.json`) **solo lectura, sin tocar el repo**. Reproduce
la salida real del backend en los 17 términos, uno por uno, incluida la
confianza difusa de 0,31. Con esa réplica se corrieron los contrafácticos
—"¿qué habría pasado si la visión hubiera dicho el nombre de otra forma?"— sin
gastar una sola llamada más.

---

## 1 · La tabla de los 10

| # | Plato (foto) | Qué identificó la visión | g | conf visión | Ficha matcheada | Vía | conf ficha | **conf FINAL** | kcal | ¿Ficha correcta? | ¿kcal plausible? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | Manzana | `apple, raw` | 180 | 0,97 | Manzana cruda `fdc-2709215` | exacto | 1,00 | **97 %** | 109,8 | ✅ | ✅ (pred. ~110) |
| 02 | Croissant | `croissant` | 70 | 0,95 | Croissant `fdc-2707678` | exacto | 1,00 | **95 %** | 284,2 | ✅ | ✅ (pred. ~265) |
| 03 | Paella | `rice, cooked, seafood paella style` | 350 | 0,75 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha y no la encontró** | sin número |
| 04 | Tortilla de patatas | `Spanish potato omelette (tortilla de patatas)` | 450 | 0,90 | Tortilla de patatas `manual-tortilla-de-patatas` | exacto | 1,00 | **90 %** | 612 | ✅ | ✅ tortilla entera |
| 05 | Lasaña | `lasagna with meat sauce and spinach ricotta` | 350 | 0,85 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha y no la encontró** | sin número |
| 06 | Risotto de hongos | `yellow rice, cooked (saffron/turmeric seasoned)` | 320 | 0,75 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha y no la encontró** | sin número |
| 07 | Bife + papas + ensalada | `beef steak, grilled` | 180 | 0,90 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha** (Bife) | sin número |
| 07 | ” | `french fries, fried` | 180 | 0,95 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha** (Papas fritas) | sin número |
| 07 | ” | `coleslaw, cabbage and carrot salad` | 120 | 0,85 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha** (Coleslaw, exacta) | sin número |
| 07 | ” | `ketchup` | 40 | 0,90 | Kétchup `fdc-2709733` | exacto | 1,00 | **90 %** | 43,6 | ✅ | ✅ |
| 07 | ” | `gravy, brown sauce` | 40 | 0,60 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha** (Salsa de carne) | sin número |
| 08 | Lentejas guisadas | `lentil stew with meat` | 400 | 0,85 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha** (Lentejas cocidas) | sin número |
| 08 | ” | `bread roll, white` | 80 | 0,75 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha** (Panecillo) | sin número |
| 08 | ” | `crackers, saltine` | 30 | 0,70 | Galletas saltinas bajas en sodio `fdc-2708143` | difuso | 0,31 | **21,7 %** | 124,8 | 🟡 la única saltina del catálogo | ✅ 416 kcal/100 g es correcto |
| 08 | ” | `tortilla, corn` | 25 | 0,50 | — | **no_catalogado** | 0 | **0 %** | — | 🟡 el catálogo solo tiene la de trigo | sin número |
| 08 | ” | `lime, raw` | 40 | 0,85 | — | **no_catalogado** | 0 | **0 %** | — | ❌ **hay ficha** (Lima cruda) | sin número |
| 09 | Arepa rellena | `arepa, grilled, filled with cheese` | 150 | 0,85 | — | **no_catalogado** | 0 | **0 %** | — | ✅ **correcto: no está en el catálogo** | sin número |
| 10 | Bicicleta | — | — | — | — | `is_food: false` | — | — | — | ✅ | — |

**17 ítems sobre 9 fotos de comida.** Vías: **4 exacto · 1 difuso · 12 no_catalogado.**

### Totales de los dos platos con varios ítems (lo más delicado del informe)

| | kcal que devuelve el sistema | kcal reales aproximadas | `completo` | g cuantificados / g totales |
|---|---|---|---|---|
| 07 Bife + papas + ensalada | **43,6** (solo el kétchup) | ~700 | `false` | **40 / 560** |
| 08 Almuerzo de lentejas | **124,8** (solo las galletas) | ~600 | `false` | **30 / 575** |

El motor **no miente**: dice `completo: false`, `items_sin_datos: 4` y
`grams_cuantificados: 40` contra `grams_total: 560`. Toda la información para no
equivocarse está en la respuesta. Pero **el número de portada de un plato de
bife con papas es "43,6 kcal"**, y eso es 16 veces menos que la realidad.

---

## 2 · Distribución de confianzas, cruzada con la corrección real

Este es el punto del test, y el resultado **contradice la hipótesis previa**.

| Franja de confianza final | Ítems | Ficha correcta ✅ | Aproximada 🟡 | **Ficha equivocada ❌** |
|---|---|---|---|---|
| **> 70 %** | 4 | **4** | 0 | **0** |
| **40 – 70 %** | 0 | — | — | — |
| **1 – 40 %** | 1 | 0 | 1 | **0** |
| **exactamente 0 %** (`no_catalogado`) | 12 | 1 (arepa, correcta por diseño) | 1 | — (no eligió ninguna ficha) |

**La lectura, en una frase: cuando el sistema muestra un número, ese número no
miente ni una sola vez. El problema es que casi nunca muestra un número.**

- **La confianza alta es confiable al 100 %:** los 4 ítems por encima del 70 %
  tienen la ficha correcta. Cero falsos positivos.
- **La confianza baja no predijo ningún error**, porque no hubo errores de ficha
  que predecir. El único ítem de confianza baja (21,7 %) eligió la única galleta
  saltina que existe en el catálogo, con las calorías correctas; la reserva del
  21,7 % es honesta sobre lo único que falla ahí, que es el sodio.
- **El hallazgo carbonara no se replicó, y es peor:** en la carbonara el sistema
  llegaba a la ficha correcta y la mostraba al 12 % (acertaba más de lo que
  confesaba). Acá **ni siquiera llega a la ficha**. Pasó de "acierta y no lo
  confiesa" a "no contesta".
- **12 de 17 ítems (71 %) terminaron sin ningún dato nutricional.** Y de esos 12,
  **10 son alimentos que el catálogo SÍ tiene.**

---

## 3 · Los errores no forzados

**No hubo ni un solo caso de ficha MAL elegida.** En 17 ítems, el motor nunca
puso un alimento donde iba otro. La regla dura 2 y la cascada aguantan: el
sistema prefiere callarse antes que inventar. Eso es un activo real y hay que
decirlo antes que lo demás.

**El error no forzado de este test es el contrario: el silencio sobre comida que
está en el catálogo.** 10 de los 12 `no_catalogado` son alimentos catalogados.
Verificado uno por uno con la réplica del matcher:

| Lo que dijo la visión | Lo que el catálogo tiene | Qué habría dado si la visión lo nombraba así |
|---|---|---|
| `rice, cooked, seafood paella style` | Paella `fdc-2706723` | `paella` → **85 %** (exacto ES, genérica ×0,85) |
| `lasagna with meat sauce and spinach ricotta` | Lasaña con carne y espinaca `fdc-2708755` | `Lasaña` → **80 %** (alias) |
| `yellow rice, cooked (saffron/turmeric seasoned)` | Arroz amarillo cocido `fdc-2708419` | `Yellow rice, cooked, NS as to fat` → **85 %** |
| `beef steak, grilled` | Bife `fdc-2705824` | `bife` → **85 %** · `beef steak` → 36,5 % |
| `french fries, fried` | Papas fritas `fdc-2709456` | `papas fritas` → **85 %** |
| `coleslaw, cabbage and carrot salad` | Ensalada de repollo con mayonesa `fdc-2709815` | `coleslaw` → **100 %** (exacto) |
| `gravy, brown sauce` | Salsa de carne `fdc-2707149` | `gravy` → 28,3 % |
| `lentil stew with meat` | Lentejas cocidas `fdc-2707423` | `Lentils, NFS` → **85 %** |
| `bread roll, white` | Panecillo `fdc-2707595` | — |
| `lime, raw` | Lima cruda `fdc-168155` | `limes, raw` → **100 %** (exacto) |

### Las cuatro causas, separadas (porque se arreglan distinto)

**A · El prompt le prohíbe al modelo la palabra que el catálogo curó.**
`analyze/vision.ts` le pide "inglés genérico de USDA" y le dice explícitamente
que prefiera `beef steak, grilled` antes que `bife de chorizo`. El catálogo tiene
**1.768 términos curados en español** —`Paella`, `Lasaña`, `Risotto`,
`Papas fritas`, `Bife`— y el prompt empuja al modelo a no usar ninguno.
**Es una contradicción interna del producto**, no un límite del modelo: paella,
lasaña y risotto cayeron por esto.

**B · El sufijo de USDA rompe la igualdad exacta.** La visión nombra bien y el
catálogo también, pero la clave real lleva `NFS` / `NS as to fat` o invierte el
sustantivo. `beef steak grilled` (18 car.) contra `beef steak nfs` (14 car.): ni
uno contiene al otro, ni uno empieza con el otro. El difuso no puede tender ese
puente porque solo sabe de secuencias completas de palabras.

**C · El piso de cobertura castiga a la visión por describir bien.** El caso más
claro del test: `coleslaw, cabbage and carrot salad` **contiene la palabra
`coleslaw`, que es un nombre exacto del catálogo**. Pero la cobertura es
8/33 = **0,242**, por debajo del piso de 0,30, y el match se descarta. Es la misma
mecánica de la carbonara (DT-17), y tiene una consecuencia perversa:
**cuanto más descriptiva es la visión, peor matchea.** Es el hallazgo de diseño
más importante del test.

**D · Singular contra plural.** `lime, raw` no llega a `Limes, raw`; `limes, raw`
sí, y por vía exacta. Ya está declarado en DT-17 como "el hueco de recall más
caro en español" — acá se lo ve costando en inglés también.

### Un aviso sobre la solución fácil

Si la reacción es "que el modelo diga el nombre corto", **hay una trampa medida**:
`lentils` a secas resuelve a **Lentejas CRUDAS `fdc-172420`, 352 kcal/100 g** por
vía difusa, en lugar de las cocidas (166 kcal/100 g). **Más del doble de
calorías.** Lo mismo `lentejas` en español. Hoy ese error no se dispara porque el
sistema no matchea nada; al abrir el recall sin cuidado, se dispararía. El
crudo/cocido tiene que resolverse junto con DT-17, no después.

---

## 4 · Los casos `no_catalogado` y la foto que no es comida

**Los dos se comportaron exactamente como el diseño promete.**

**Arepa (09) — el único `no_catalogado` legítimo del test.** Verificado antes de
la foto: `arepa` = 0 coincidencias en 1.022 fichas, `corn cake` = 0. La respuesta
fue la correcta: `match: "no_catalogado"`, `confidence: 0`, `nutrients: null`,
`totals: null` y motivo escrito. **Sin números inventados.** La visión sí devolvió
ingredientes (`corn arepa, grilled`, `cheese, white, fresh`) y el motor **se negó
a componer** porque ninguno de los dos tiene ficha — la salvedad que anoté en la
predicción se resolvió por el lado conservador.

**La cola de curación funciona bien.** Se escribieron **30 documentos** en
`curation_queue` (Firestore del emulador, leído con token de owner), con
deduplicación entre escaneos comprobada: `white rice, cooked` quedó con
`veces: 2` porque apareció en la paella y en el risotto. Cada uno con
`termino_en`, `motivo` (`sin_match` / `componente_sin_match`), gramos,
`first_seen`, `last_scan_id`.

**Pero la cola está midiendo lo que no cree que mide.** Se revisaron los 30
términos uno por uno contra el catálogo:

| | Términos | Ejemplos |
|---|---|---|
| **Tienen ficha directa** | **22** | `spinach, cooked` · `shrimp, cooked` · `clams, cooked` · `tomato sauce` · `mozzarella cheese, melted` · `parsley, chopped` · `broth` · `ground beef, cooked` · `white rice, cooked` · `coleslaw…` · `lime, raw` |
| **Tienen una variante cercana** | **5** | `bell pepper, red/green, cooked` (el catálogo los tiene crudos) · `onion, sauteed` (cruda) · `cheese, white, fresh` (Queso, NFS) · `tortilla, corn` (solo la de trigo) |
| **Genuinamente ausentes** | **3** | `arepa, grilled, filled with cheese` · `corn arepa, grilled` · `lasagna noodles, cooked` |

**Solo 3 de 30 son un hueco real del catálogo.** Si alguien lee esta cola como
"qué le falta al catálogo", va a fichar 22 alimentos duplicados en vez de
arreglar el matching. La cola necesita distinguir **"no lo tengo"** de
**"no lo supe encontrar"**.

**Bicicleta (10) — impecable.** `is_food: false`, `items: []`, `totals: null`,
312 bytes de respuesta. El modelo no alucinó comida en una foto de una bici
atada a un farol, ni siquiera con adoquines marrones ocupando media imagen.

---

## 5 · Veredicto para el dueño, en 5 líneas

1. **La sección "Qué hay en el plato" NO está lista para mercado, pero no por lo
   que se temía:** en 17 alimentos el sistema **nunca eligió una ficha
   equivocada** — cero errores no forzados de identificación.
2. **El problema es el silencio: 12 de los 17 alimentos (71 %) salieron sin
   ningún dato, y 10 de esos 12 están en el catálogo.** Paella, lasaña, bife,
   papas fritas, coleslaw, lentejas y lima existen y el sistema no los encontró.
3. **La confianza que se muestra es fiable:** los 4 ítems por encima del 70 %
   eran correctos, 4 de 4. Un umbral mínimo de confianza no arregla nada acá,
   porque lo que falla no es un número bajo: es que no hay número.
4. **El riesgo concreto para el usuario son los totales:** un plato de bife con
   papas devolvió **43,6 kcal** de ~700 reales. El backend lo declara incompleto
   (`completo: false`, 40 de 560 g cuantificados), así que **el front tiene que
   negarse a mostrar un total incompleto como si fuera el total.**
5. **Primero DT-17, después mercado.** Y DT-17 se queda corta: hay que sumarle
   la contradicción del prompt (le prohíbe al modelo los 1.768 términos españoles
   que el catálogo curó), el piso de cobertura de 0,30 que descarta matches que
   contienen el nombre exacto, y el crudo/cocido de las lentejas, que hoy no
   muerde pero morderá apenas se abra el recall.

---

## Salvedades de honestidad

- **Fotos ambiguas / con más de un plato.** La foto 08 es una **mesa puesta
  completa** (bol de lentejas + pan + galletas + lima + una botella de ají), no
  un plato aislado; los 5 ítems que devolvió la visión son correctos, no ítems de
  más. La foto 07 traía además kétchup y una jarrita de salsa, también contados
  como aciertos. La 03 es una paella **en la paellera**, no emplatada.
- **Juicios de "ficha correcta" discutibles.** Dos:
  (a) las **galletas saltinas** — el motor eligió la variante "bajas en sodio",
  que es **la única saltina del catálogo**; las calorías (416/100 g) son las
  correctas y solo el sodio queda subestimado, así que lo marqué 🟡 y no ❌;
  (b) la **tortilla de maíz** de la foto 08 — el catálogo solo tiene la de trigo,
  y no está claro si eso es un hueco o una foto mal leída (podría ser pan).
- **Un ítem quedó sin verificar del todo:** `tortilla, corn` (25 g, confianza de
  visión 0,50) puede ser una lectura equivocada de las galletas o del pan de la
  mesa. Con confianza de visión 0,50 el propio modelo estaba dudando.
- **La tortilla de patatas salió mejor de lo predicho.** Yo predije que caería a
  difuso (~31 %) porque el prompt empuja al inglés genérico. El modelo devolvió
  `Spanish potato omelette (tortilla de patatas)`, que es **literalmente el
  `names.en` de la ficha manual**, y matcheó exacto al 90 %. Es el ejemplo de que
  una ficha bien curada, con el nombre completo que el modelo tiende a escribir,
  funciona — y de que la predicción se puede equivocar para el lado bueno.
- **Sin repetición.** Cada foto se analizó una sola vez. No se midió cuánto varía
  la salida del modelo entre corridas de la misma foto, así que **nada de este
  informe afirma nada sobre estabilidad.**

## Dónde mirar

- `predicciones.md` — las 10 predicciones, escritas antes de bajar las fotos.
- `fotos.md` — origen, licencia y las dos fotos que se cambiaron, con el motivo.
- `respuestas/NN-<plato>.json` — las 10 respuestas crudas del endpoint.
- `matcher.py` — la réplica del matcher; `python3 matcher.py "un término"`
  responde qué ficha daría, sin llamar a la API.
- `resumen.py` — vuelca las 10 respuestas en la forma de la tabla de arriba.
