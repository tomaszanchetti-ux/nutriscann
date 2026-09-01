# El censo de cobertura mediterránea

**La pregunta que contesta:** de los platos que un comensal español va a
fotografiar, ¿cuáles sabe nombrar el catálogo, cuáles nombra mal y cuáles no
tiene? Y sobre todo: ¿cómo nos enteramos el día que uno de los que sí sabía deje
de saber?

Nació con la card 6.3 (WS06, 01/09/2026), por la directiva de producto que puso
a España y a la dieta mediterránea como mercado inicial. La card 6.4 lo volvió a
correr después de sumar 76 fichas: **de 48 platos sin ficha quedan 5**, y los
cinco dicen qué se buscó y qué no se encontró.

## Qué hay acá

| Archivo | Qué es |
|---|---|
| `platos.mediterraneos.json` | **La lista de entrada.** Los 141 platos de las dos fuentes, con su URL y su fecha de extracción. Se edita a mano, cuando cambia la fuente. |
| `censar.js` | **El medidor.** Le pregunta al motor real por cada plato y cada ingrediente, y le pega arriba los veredictos escritos a mano. Reescribe `censo.json`. |
| `censo.json` | **La foto.** Generado. No se edita: se edita `censar.js` y se vuelve a correr. |

Y el candado, que vive del otro lado porque es un test del motor:
`functions/src/engine/cobertura.test.ts`.

```bash
cd functions && npm run build     # el censo mide con el motor compilado
node kb/cobertura/censar.js       # reescribe censo.json
cd functions && npm test          # el candado verifica que no se perdió nada
```

## Las dos fuentes, que no son intercambiables

- **directoalpaladar** — los 101 platos representativos de la cocina española
  votados por 60 gastrónomos. Son **platos con nombre propio**: la fabada, el
  pisto, los callos. Es la lista contra la que se mide si el catálogo sabe de
  cocina española.
- **nuevoestilo** — 40 recetas de dieta mediterránea. La mitad no son platos con
  nombre sino **composiciones** («pez espada con tomates rellenos»). Eso no es un
  defecto de la fuente: es cómo se come, y es lo que la visión va a desarmar en
  ingredientes.

## Las cinco clases, que son cerradas

| Clase | Qué quiere decir | Quién la decide |
|---|---|---|
| `ok` | El término llega a la ficha **correcta** por un camino escrito del catálogo (nombre exacto o alias). | La máquina mide el camino; la persona confirmó que la ficha es la correcta. |
| `confianza_injusta` | La ficha es correcta y el término llegó por el **difuso**, que nunca pasa de 0,6 y en la práctica publica 0,10–0,30. El plato está cubierto y el usuario no se entera. | Idem. |
| `ficha_equivocada` | La ficha nombra **otro alimento**: otra especie, otra familia, o el ingrediente crudo en lugar del plato. | La persona, mirando la ficha. Nunca la máquina. |
| `ausente_ficha` | No hay ficha, y la que hay no sirve ni como gemelo. Fue la lista de entrada de la card 6.4, que cerró 43 de los 48; los 5 que quedan traen su motivo medido en `CANDIDATOS`. | La persona. |
| `descomponible` | El «plato» es una composición ad-hoc que la visión desarma en ingredientes. No se juzga por su nombre —no hay ficha que pueda tenerlo— sino por la cobertura de sus ingredientes. | La persona. |

**El corte entre `ok` y `confianza_injusta` es el NIVEL de la cascada, no un
número suelto**, y eso no es un atajo: la escala de confianza es cerrada
(1,0 · 0,8 · 0,6 · 0,5), así que "llegó por alias" y "confianza ≥ 0,5" dicen lo
mismo. La única diferencia es el 15 % que el motor le descuenta a una ficha
genérica, y ese descuento es el motor diciendo la verdad sobre una ficha
promedio, no un defecto del vocabulario. Un `ok` a 0,43 —`Cocido madrileño`, por
ejemplo— es un 0,5 declarado por la curación menos ese 15 %.

**El veredicto de «ficha correcta» contra «ficha equivocada» no se automatiza.**
Un censo que dedujera «correcta» de «confianza alta» estaría midiendo la
confianza dos veces y la corrección ni una. Está escrito a mano en las tablas de
`censar.js`, con el motivo de cada uno.

## Lo que midió, en las tres corridas

Los 141 platos, con el motor real y el catálogo real:

| Clase | 3.2.0 (antes de la 6.3) | 3.3.0 (card 6.3) | 3.4.0 (card 6.4) | 3.5.0 (card 6.4b) |
|---|---:|---:|---:|---:|
| `ok` | 24 | 38 | 85 | **86** |
| `confianza_injusta` | 31 | 21 | 22 | 22 |
| `ficha_equivocada` | 6 | 5 | **0** | 0 |
| `ausente_ficha` | 51 | 48 | 5 | **4** |
| `descomponible` | 29 | 29 | 29 | 29 |

Los 196 ingredientes clave:

| Clase | 3.2.0 | 3.3.0 | 3.4.0 | 3.5.0 |
|---|---:|---:|---:|---:|
| `ok` | 32 | 37 | **45** | 45 |
| `confianza_injusta` | 91 | 91 | 96 | 96 |
| `ficha_equivocada` | 14 | 9 | 11 | 11 |
| `ausente_ficha` | 59 | 59 | **44** | 44 |

**La card 6.4b movió UNA fila y ninguna más**: `Calçots` pasó de `ausente_ficha`
a `ok` con `receta-calcots` a confianza 1,0. Verificado por diff del censo entre
la 3.4.0 y la 3.5.0: ningún otro plato ni ingrediente cambió de ficha ni de
confianza, incluidos los dos que rozaban el vocabulario nuevo (`salsa marinara` y
`salsa Worcester`, que siguen donde estaban).

**La card 6.3 no movió ninguna ficha**: sus 136 cambios eran de vocabulario y
trazan uno a uno a sus nueve curaciones (barrido de 31.097 consultas, 0 perdidos).

**La card 6.4 movió 76 fichas, y todas hacia adentro**: 33 promovidas de USDA
(`kb/selection/dt33.v1.json`) y 43 derivadas por receta compuesta
(`kb/curation/recipes.foods.json`). Verificado con un barrido de 3.222 términos
—todo el vocabulario del catálogo anterior, los 141 platos, los 196 ingredientes
y los 93 términos del golden set— sobre los dos catálogos: **0 matches perdidos,
0 confianzas bajadas, 62 matches nuevos y 7 cambios de ficha, los siete
correcciones** (los cinco `ficha_equivocada` a su ficha propia, `espaguetis` de
`Pasta con salsa` a `Pasta cocida` y `harina` de `Harina de papa` a `Harina de
trigo`). Y por diff del catálogo: **0 fichas retiradas y 0 fichas preexistentes
cambiadas, byte a byte**.

El `ficha_equivocada` de ingredientes SUBE de 9 a 11, y eso también está medido:
`pasta de tomate` y `pasta filo` daban silencio y ahora caen en `Pasta cocida`
por la palabra compartida. Es el precio de la ficha nueva y se declara en vez de
esconderse; sus guardas están escritas y no muerden hasta la DT-32.

### Lo que se aprendió midiendo

**1. El hueco más caro no era de fichas: era de nombres largos.** Veinte platos
tenían su alias ya validado —`Pisto`, `Fabada`, `Callos`, `Gazpacho`— y el nombre
completo, que es el que usa el comensal, no lo disparaba: el nivel de alias es
igualdad exacta sobre la consulta entera y no busca alias *adentro* del término.
`Pisto manchego` valía 0,17 apuntando a la ficha correcta. La regla que salió de
ahí está escrita en `kb/curation/aliases.regional.json`: **el nombre regional
largo hereda la confianza del alias corto ya validado**, sin volver a juzgar la
composición.

**2. Un alias regional puede envenenar una palabra corriente.** `ajo` caía en
`Puerro cocido` porque el puerro lleva de alias `Ajo porro`, que es su nombre en
Colombia y Venezuela — un alias correcto que no había que tocar. El ajo es el
ingrediente más frecuente de las dos fuentes y no tenía puerta propia.

**3. Los ingredientes de una receta no son términos de visión.** `patatas`,
`huevos`, `harina` a secas caen mal porque no dicen la preparación, y en el
pipeline real la visión siempre la dice. Se dejaron documentados y **sin curar**:
elegir una preparación por decreto sería inventar.

**4. Hay tres huecos de proteína que ninguna curación arregla.** No existía en el
catálogo **ninguna** ficha de salmón, de mejillón ni de pez espada. Tampoco había
pasta cocida simple. Eran fichas, no vocabulario: los tapó la card 6.4.

### Lo que aprendió la card 6.4, que abrió los datasets

**5. La mitad de los huecos no eran de USDA: eran de la selección.** El censo de
la 6.3 declaró su alcance —se midió contra el CATÁLOGO y no contra los datasets
crudos— y por eso ninguna de sus pistas podía decir "USDA no lo tiene". Al
abrirlos, seis de los siete huecos centrales de la DT-33 estaban medidos desde
2018: lo que faltaba era la promoción. La lección operativa es del método: **una
pista con el alcance declarado se puede convertir en un hallazgo; una sin alcance
declarado se convierte en una creencia.**

**6. Un `X, NFS` de FNDDS no siempre es un promedio: a veces es UNA preparación
disfrazada.** `Fish, swordfish` es 80,7 % pez espada + 14,9 % rebozado + 4 %
aceite, y `Fish, eel` es idéntico en estructura. Es el mismo caso por el que la
DT-7 renombró `Bacalao` a `Bacalao rebozado`. Se mira el `input_food` ANTES de
elegir la ficha, no después.

**7. El nombre inglés de una ficha de USDA es una decisión de selección.** Para
el mejillón había dos candidatos con el mismo alimento: el de SR (172 kcal,
`Mollusks, mussel, blue, cooked, moist heat`) y el de FNDDS (109, `Mussels`).
**Medido:** con el de SR, el término inglés `mussels` da SILENCIO; con el de
FNDDS, match exacto. Como `names.en` lo escribe el CSV y la curación no lo toca
(DT-26), elegir la ficha ES elegir el vocabulario inglés — y eso hay que pesarlo
en la selección, no descubrirlo después.

**8. Los cinco bloqueos que quedaban eran de dos tipos, y ninguno era "no lo
buscamos".** Dos por RENDIMIENTO (calçots y torrezno: el ingrediente está y el
factor de cocción no existe medido) y tres por ESPECIE o INGREDIENTE (perdiz,
besugo y halloumi: cero coincidencias en los tres datasets). El motivo de cada
uno vive en la tabla `CANDIDATOS` de `censar.js`.

**QUEDAN TRES, y ahora son todos del MISMO tipo.** Los dos de rendimiento se
destrabaron por vías distintas y ninguna de las dos fue el dataset: los
`Calçots` con un rendimiento de cocción medido (card 6.4b) y el `Torrezno de
Soria` con una **etiqueta comercial** (card 6.4c) — que es lo que se hace cuando
el bloqueo no es de dato sino de modelo. Los tres que siguen —perdiz, besugo y
halloumi— son alimentos que USDA no mide, y los tres esperan la misma llave: la
pasada de BEDCA (DT-35 g). Que la lista de pendientes tenga una sola naturaleza
es información: ya no hay nada que destrabar con ingenio propio.

## Los límites, declarados

- El censo mide `buscarAlimento` con **un** término. El pipeline real busca con
  dos (inglés y español) y se queda con el mejor, así que la cobertura real es
  igual o mejor que la que dice este censo — nunca peor.
- Los `ingredientes_clave` son de **receta publicada**, no de foto. Sirven para
  preguntarle al catálogo si tiene el material del plato; no simulan el pipeline.
- El censo no toca porciones ni gramos: mide **qué ficha sale**, no cuánto pesa.
