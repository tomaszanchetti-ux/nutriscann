# Bloque 0 de la Fase 6 — «La confianza dice la verdad y los gramos se cuentan»

> WS12, 03/09/2026. Medido sobre los 3 escaneos reales de Tomás de ese día
> (expedientes en Firestore), el golden de 30 fotos re-jugado con la visión v6 y
> el motor de la Fase 5 tal como está en producción (`kb 3.8.0+843ecb80`).
> Este informe es la piedra sobre la que se definieron las cards 6.0 a 6.7.

## 1. El caso que abrió la fase

Ensalada de atún con lechuga, guisantes, huevo y tomate (13:39). La visión
identificó los seis ingredientes al 85 %; los seis resolvieron a fichas reales.
El plato salió **sin total**: confianza 0,107 contra el piso de 0,12.

| Ingrediente | g | Ficha | Vía | Confianza del match |
|---|---|---|---|---|
| lettuce, shredded | 100 | Lechuga **cocida** | difuso | 0,60 |
| canned tuna | 100 | Atún (genérico) | difuso | **0,157** |
| green peas, cooked | 90 | Arvejas cocidas con sal y grasa | exacto | 0,85 |
| hard-boiled egg, chopped | 60 | Huevo cocido | difuso | 0,255 |
| tomato, chopped | 40 | Tomate **cocido** | difuso | 0,51 |
| carrot, shredded | 10 | Zanahorias crudas | difuso | 0,60 |

Confianza del plato = 0,85 (visión) × 0,157 (el peor ingrediente) × 0,8
(descuento de composición) = **0,107**. Un solo ingrediente decide por los seis.

## 2. Hallazgos

### H1 — La confianza de un compuesto es la del eslabón más débil
`compose.ts` toma `min(confianza de cada componente) × FACTOR_COMPOSICION`. Con
la misma ensalada, otras agregaciones del match (antes del ×0,8 y ×visión):

| Agregación | Match | Confianza del plato |
|---|---|---|
| mínimo (hoy) | 0,227 | 0,155 (*) |
| ponderado por gramos | 0,484 | 0,33 |
| mediana | 0,600 | 0,41 |

(*) 0,155 y no 0,107 porque en la reconstrucción el tomate cayó en crudo; el
`food_es` real de los componentes no se persistió (ver H6).

### H2 — La compuerta del 12 % se calibró sin compuestos, y ya no corta lo que debía
El piso salió en la card 2.8 (WS05) del histograma del golden v1–v3, donde la
visión devolvía los ingredientes como ítems separados. Re-jugando las 31 fotos
del golden con la visión v6 y el motor actual:

- **Plato 20, ensalada mixta:** en la v3 pasaba con 0,85 (exacto); hoy es un
  compuesto a **0,107** y sale sin total. El mismo defecto que el caso real.
- **Plato 28, comida de plástico**, el caso que creó la compuerta: hoy publica
  **1.097,6 kcal como total completo**, porque la cascada de la card 5.3 lo
  responde con la cabeza de subfamilia `Crepe` a 0,425 × 0,72 = 0,306, y esa
  cabeza viene con `identidad_respaldada: true`.
- **Plato 30, envase cerrado:** publica 344 kcal a 0,16 (difuso «Sándwich»).

El re-juego de la WS11 contó «fichas cambiadas» y no si la compuerta seguía
abriéndose. La compuerta hoy frena a la ensalada buena y deja pasar al plástico.

### H3 — La segunda puerta no existe para compuestos
`identidad_respaldada` solo se marca en `conFicha` (un match nombra lo que dijo
la visión). Un ítem `compuesto` nunca la tiene, aunque la visión haya elegido
`ensalada/verde` de la lista cerrada de 191 con 0,85.

### H4 — Un empate crudo/cocido lo decide el largo del nombre
En la dirección C del difuso, `picado`/`shredded`/`chopped` son descriptores y se
descuentan: «lechuga» explica entero a «Lechuga cruda» y a «Lechuga cocida»
(cobertura 1, 0,6 las dos). El empate lo decide el orden de la lista (por largo)
porque `leGana` exige estrictamente mayor; la regla del crudo/cocido existente es
unidireccional (solo promueve al cocido cuando el crudo es seco).

Medido: `lechuga picada` → Lechuga cocida (49 kcal) · `tomate picado` → Tomate
cocido (50 kcal) · `lettuce, chopped` → Lettuce, cooked · `mushrooms, sliced` →
Champiñones cocidos con grasa. La ensalada verde de las 13:35 salió inflada
**62 kcal (12 %) y 6,5 g de grasa** por esto; la de atún, 29 kcal.

### H5 — Vocabulario que falta
Sin alias: «atún en lata» / «atún en conserva» (cae en `Atún` a 0,185–0,267),
«huevo duro» (0,3), «lombarda» (sin ficha). En inglés `canned tuna` y `tomato,
chopped` no enganchan (plural `Tomatoes`). La cabeza de `pescado/conserva` es
«Sardinas en lata» (208 kcal), que tampoco serviría de respaldo para el atún.

### H6 — El expediente no guarda ni la foto ni lo que dijo el modelo
`image_ref` sigue en `null` y la salida cruda de la visión (los `food_es` y
`familia_subfamilia` de cada componente) se pierde: el §1 se reconstruyó a mano.
Sin esto no se puede calibrar ni la confianza ni los gramos.

### H7 — Gramos: el dato para contar ya está en el catálogo
Las **1.115 fichas traen `portion_hints`** con pesos por unidad heredados de
USDA (1 huevo = 50 g; 1 rodaja de tomate = 20 g; lechuga «cantidad típica en
ensalada» = 70 g; 1 filete chico de atún = 90 g) y **730 traen la porción
típica** de la encuesta de consumo (`Quantity not specified`). Hoy nadie los usa
para estimar. Por subfamilia se deriva una banda de plausibilidad (p10 / mediana /
p90): verdura cruda 10/20/60 g · pan de barra o molde 28/31/44 · plato de arroz
120/237/290 · plato de pasta 100/225/250. Las etiquetas en español están vacías
en las 1.115 (`label_es: null`).

Costo de referencia hoy (ensalada de atún): 1.061 tokens de entrada + 8.361
cacheados, 444 de salida, 5,8 s de modelo.

### H8 — Los escaneos de otros usuarios (10 expedientes, 3 usuarios, 02–03/09)
Descripción contra kcal, plato por plato, con lo que no cierra:

- **Arroz frito con verduras y huevo** (180 g, 293 kcal): compuesto a **0,12**, un
  pelo arriba de la compuerta, por el mismo mecanismo del §1. `white rice, fried`
  cae en la cabeza «Arroz blanco cocido» (la preparación «frito» que dijo la
  visión se pierde al responder por cabeza) y `green pepper, diced` cae en
  «Verduras de hoja cocidas con sal y grasa»: ficha equivocada.
- **Ensalada mixta con pollo** (320 g, 287 kcal, usuario nuevo): `chicken,
  cooked, shredded` → «Pollo con piel» 0,51; `pan integral de semillas en
  rebanada` → «Pan» genérico a **0,04**.
- **Fideos negros con gulas** y **pizza con champiñones y bacon**: cabezas de
  subfamilia a 0,32–0,34, totales plausibles (125 y 280 kcal/100 g).
- **La visión escribe el estado cuando quiere:** para un usuario `lettuce, raw`
  (exacto 1,0) y para otro `lettuce, chopped` (difuso 0,6 → cocida). El
  componente ya viaja con su subfamilia declarada (`verdura/cruda`) y el matcher
  no la usa como estado pedido: es el arreglo estructural detrás de la 6.3.

## 3. Las cards de la fase

| Card | Qué | Territorio |
|---|---|---|
| 6.0 ✅ WS12 | El expediente guarda `vision` (byte a byte lo que entró al motor) y la foto en Storage, sin latencia agregada | `functions/src/analyze/`, `index.ts` |
| 6.1 ✅ WS13 | La confianza de un compuesto se pondera por gramos; cada ingrediente conserva la suya. Informe `docs/fase6.card-6.1.md` | `engine/compose.ts`, `analyze.ts` |
| 6.2 ✅ WS13 · **REDEFINIDA por Tomás** | **El total se publica SIEMPRE.** La compuerta del 12 % deja de apagar el total (`total_no_publicable` desaparece); el score de confianza no es acierto sino la vía del match, y no decide si hay ficha. Ni segunda puerta ni recalibración: medido con las 6.1 y 6.3 adentro, ningún plato del golden queda bajo 0,12 y el plástico (0,306) está por encima de cinco platos reales — es de la visión (DT-71). Informe `docs/fase6.card-6.2.md` | `engine/arithmetic.ts`, `constants.ts` (comentario), front |
| 6.3 ✅ WS13 | Desempate crudo/cocido simétrico, con las lentejas secas como candado. Informe `docs/fase6.card-6.3.md` | `engine/match.ts` |
| **6.2b (WS14)** | **Píldoras por vía de match, calculadas en el BACKEND** (decisión de Tomás, WS13): por ítem y por plato una categoría cerrada de cuatro valores que el front solo pinta — 🟢 **Exacto** (exacto, alias) · 🟡 **Muy parecido** (difuso, compuesto completo) · 🟠 **Aproximado** (sustituto, cabeza_subfamilia, compuesto_parcial) · 🔴 **Estimación** (cabeza_familia, no_catalogado). El compuesto hereda la de su peor ingrediente (`eslabon_mas_debil`); el plato, la de su peor ítem. Naranja y rojo = tokens nuevos del design system. Las 9 claves `match_*` se reemplazan por 4 pares y salen del candado del seed | `engine/analyze.ts`, `types.ts` (back y front), `BadgeDeMatch.tsx`, `config/copy.json`, `kb/seed` |
| 6.4 | Curación: atún en lata/conserva, huevo duro, lombarda, plural inglés; DT-51…54 | `kb/curation/` |
| 6.5 (WS14, Bloque 0 primero) | El modelo cuenta, la base pesa — con el material de raciones españolas que trajo Tomás (`NutriScann/Calculo de Gramos/*.pdf` y https://aeeh.es/liverai-pesos-raciones/) cruzado con los `portion_hints`: plato como regla, unidades contadas, conversión por `portion_hints`, candado por subfamilia y geometría, medición de costo | `vision.ts`, `engine/`, prompt |
| 6.6 | Golden de peso conocido (fotos de Tomás con pesos impresos) | `golden/` |
| 6.7 | Pulgares por ítem y del total. Arriba: un toque. Abajo: motivo CERRADO («no era esto» / «la cantidad no» / «las calorías no me cierran») + texto libre opcional («¿qué era?», «¿cuánto había?»). Todo al expediente, junto a `vision` y la foto. Caso que lo motivó: la ensalada «con pollo» del 03/09 era caballa | front + `persistencia` |

Fuera de la fase, anotado: el deslizador de gramos del usuario (v1.1) y la DT-48
del CI.
