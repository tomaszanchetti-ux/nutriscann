# Curación (capa 3)

El catálogo viene de la USDA y está **en inglés**. El modelo de visión trabaja
contra ese inglés; el español es lo que ve la persona que usa la app. Esta capa
traduce una cosa en la otra.

**La regla del proyecto: se cura el vocabulario, se frena el error.** Cuando un
nombre sale mal, el arreglo entra acá — nunca en el build, nunca a mano en
Firestore. El build es determinístico y Firestore es una copia derivada: un
parche puesto ahí se pierde en el próximo seed y el error vuelve.

## Los archivos

| Archivo | Qué es | Lo consume |
|---|---|---|
| `names.es.json` | **El entregable.** `{fdc_id: {name, aliases}}` para los 1.021 alimentos de USDA del catálogo. | el build |
| `portions.overrides.json` | Porción por defecto corregida + etiqueta, para las entradas cuya porción USDA es inservible como sugerencia. Desde la card 6.2, además `portion_hints`: porciones que la curación **agrega** (la caña, el tercio, la jarra). | el build |
| `aliases.regional.json` | **Aliases con confianza** (card 1.6): el nombre de un plato típico apuntando a su gemelo nutricional. | el build |
| `manual.foods.json` | **Alimentos que USDA no tiene**, declarados enteros (6). Precedencia máxima del pipeline. | el build |
| `cooking.transforms.json` | **Métodos de cocción** declarativos y reutilizables, cada uno con su fuente medida. | el build (y la Fase 2, en runtime) |
| `recipes.foods.json` | **Fichas derivadas de receta**: ingredientes + gramos + método. Sin un solo número nutricional. | el build |
| `genericos.dt13.json` | **La política de los genéricos** (DT-13): qué marca a una ficha como promedio de familia, desde qué sodio se lleva un caveat y con qué texto. | el build |
| `guardas.vocabulario.json` | **Términos prohibidos por ficha**: `chorizo` no puede nombrar al bife de chorizo. | el build |
| `glossary.es.json` | El vocabulario EN→ES: 1013 términos y frases. Herramienta de trabajo y documentación. | las herramientas |
| `tools/variants.es.json` | Variantes regionales (papa/patata, fresa/frutilla), más `$skip` y `$extra`. | `build_aliases.py` |
| `tools/` | `draft_names.py` (borrador), `build_aliases.py` (aliases), `verify_curation.py` (candados). | quien cura |

## El método: glosario + composición, no traducción libre

Las 975 descripciones USDA no son 975 textos distintos: son ~650 fragmentos
reutilizados unas 6,5 veces cada uno (`Apple, raw` · `Beets, raw` · `Kale, raw`).
Traducir ítem por ítem produce inconsistencias — el mismo `raw` en tres formas
distintas. Por eso se traduce **el vocabulario** una sola vez y se **compone**:

```
"Carrots, fresh, cooked, fat added, NS as to fat type"
   cabeza: carrots -> zanahorias (femenino, plural)
   modificadores: fresh -> fresco/a · cooked -> cocido/a · fat added -> con grasa
                  NS as to fat type -> ""   (marcador técnico: se descarta)
   => "Zanahorias frescas cocidas con grasa"
```

Los marcadores USDA (`NFS`, `NS as to ...`) **nunca** aparecen en un nombre:
`Pear, canned, NFS` es `Pera en lata`, no "Pera en lata NFS".

El borrador se hace con la máquina y **después se revisa a mano, categoría por
categoría**. El borrador acierta la mayoría y falla justo donde importa: el plato
con nombre propio, el orden natural de las palabras, el falso amigo. En el
catálogo v1, la máquina resolvió 938 de 975 y la revisión corrigió 252 nombres.
La calidad del nombre es la cara de la app: *"Pizza con extra de carne, masa
media"* está bien; *"Pizza con carne extra, corteza media"* está mal.

## Las convenciones del nombre

1. **Español neutro**: se entiende en Madrid y en Buenos Aires. Cuando dos
   palabras compiten, gana la de comprensión más amplia y la otra va a `aliases`.
2. **Natural, no literal**: `Meatball sandwich or sub` es `Sándwich de albóndigas`.
3. **Capitalización tipo oración**, sin punto final: `Arroz blanco cocido`.
4. **Nombres únicos**: dos alimentos distintos no pueden llamarse igual. Cuando
   colisionan, desambigua el detalle que de verdad los distingue (`Bife de ojo`
   vs `Bife de chorizo`; `Almendras` de FNDDS vs `Almendras crudas` de SR).
5. **Los `aliases` son variantes reales**, no sinónimos de diccionario: lo que
   otra persona escribiría buscando lo mismo (`banana`/`plátano`,
   `aguacate`/`palta`, `camarón`/`gamba`). Vacío si no hay variante.

### Decisiones de vocabulario ya tomadas

`banana` (no `plátano`, que en media América es el plátano macho) ·
`papa` · `jugo` · `durazno` · `frijoles` · `camarón` · `aguacate` · `fresa` ·
`maíz` · `arvejas` · `judías verdes` · `batata` · `maní` · `mantequilla` ·
`crema` · `repollo` · `anacardos` (el término del diccionario y del etiquetado;
`castañas de cajú`, `marañón` y `nuez de la India` son los alias) ·
`palitos de pan` (`grisines` y `colines`, alias) · `rábanos` · `salami` ·
`semidescremado`. Todas con su variante cargada en `tools/variants.es.json`.

**Los falsos amigos que ya nos mordieron** — están resueltos en el glosario, no
los reintroduzcas: `lima beans` son **frijoles de Lima**, no habas (otra especie);
`spanish rice` es **arroz rojo**, no un plato español; `strip steak` es **bife de
chorizo**, no lomo (el lomo es el *tenderloin*); `garden cress` es **mastuerzo**,
no berro (el berro es el *watercress*); `kétchup` no se alias-ea como "salsa de
tomate", porque esa es **otro alimento del catálogo**.

## Los aliases con confianza (card 1.6)

Hasta la card 1.3 un alias era una **variante del mismo alimento**: `banana` y
`plátano` son la misma fruta. La cobertura regional trajo otra cosa: `milanesa`
no es una variante de nada, es un **plato que USDA no mide** y que se apoya en
el alimento más parecido que sí mide. Los dos casos no pueden valer lo mismo.

Por eso el alias creció de forma **aditiva y retrocompatible**:

```jsonc
// Sigue valiendo exactamente lo que valía: confianza 1,0.
"aliases": { "es": ["Plátano", "Banano"] }

// Y ahora también puede declarar una reserva.
"aliases": { "es": ["Prosciutto", { "alias": "Jamón serrano", "confidence": 0.8 }] }
```

**Un alias en texto plano es un alias de confianza 1,0.** No hay que migrar nada,
ni los 609 que había escrito la card 1.3 ni los que se escriban mañana: el objeto
aparece solo cuando hay algo que declarar. (La card 1.6 sumó 26 aliases en texto
plano más —variantes de los alimentos que promovió— y 52 con confianza; los 609
de la 1.3 no se tocaron.)

### La reserva tiene que llegar al catálogo

Una confianza que se escribe en el coverage y no se emite como alias **no existe
para el motor**. Es el agujero que dejó el gazpacho: el alimento ya se llama
`Gazpacho`, así que el generador no emitía ningún alias, y el 0,8 —que decía que
a esa receta le faltan el pan y el aceite— se quedaba en un archivo de medición
que el catálogo no lee.

La convención que lo resuelve: **cuando el alimento ya se llama como el plato
pero hay una reserva, se emite el alias HOMÓNIMO con su confianza.** Un `name` no
puede llevar un número al lado; un alias sí. Hoy hay dos: `Gazpacho` (0,8, le
falta el pan y el AOVE) y `Callos` (0,5, la ficha es callo pelado sin el chorizo
ni la salsa del plato). `verify_curation.py` lo verifica en los dos sentidos:
toda fila del coverage con confianza < 1,0 tiene que tener su alias emitido con
esa misma confianza, y un alias que dice lo mismo que el nombre **sin** reserva
sigue estando prohibido.

**`veredicto` y `confianza` son ortogonales**, y forzarlos a no serlo fue un
error de la ronda anterior: USDA puede nombrar el plato (`directo`) y aun así
medir una receta a la que le falta algo. El gazpacho es el ejemplo exacto.

### La escala, que es CERRADA

Cuatro peldaños con nombre. Cualquier otro número —un 0,73— lo rechaza el
candado de esquema, a propósito: una escala continua termina con cada curación
inventando la suya y con un número que no significa nada para nadie.

| Confianza | Qué quiere decir | Ejemplo medido |
|---|---|---|
| **1,0** | El alimento **es** el plato: USDA lo nombra y la composición lo confirma. | `Paella` → `Paella, NFS` |
| **0,8** | **Gemelo fuerte**: mismos ingredientes dominantes, ninguno ajeno al plato. | `Choripán` → pan 44 % + chorizo 56 % |
| **0,6** | **Gemelo con reserva**: falta un ingrediente que mueve un macro, o cambia el corte. | `Moqueca` → pescado con tomate, **sin** leche de coco |
| **0,5** | **Gemelo pobre**: sirve como estimación, no como número. | `Milanesa` → filete rebozado **de pollo** |

### La regla de oro: el gemelo se valida por COMPOSICIÓN, no por nombre

El nombre miente y está medido que miente. Antes de aceptar un gemelo hay que
abrir `input_food.csv` y mirar de qué está hecho de verdad:

- El `Octopus` del catálogo **es pulpo rebozado**: 24,9 % de rebozado sobre
  64,6 % de pulpo. Sus 13,4 g de hidratos por 100 g no son de un pulpo.
- `Ribs, NFS` es **85 % costilla de cerdo** y arrastra 9,9 g de azúcares: lleva
  salsa barbacoa. No es una tira de asado por partida doble.
- `Ham croquette` **no tiene bechamel**: 68 % jamón, ni leche ni harina. La
  croqueta española es bechamel rebozada, y eso se ve en los hidratos (2,6 g
  contra ~20).

El criterio que se aplicó son **dos preguntas distintas**, y confundirlas fue un
error de la primera redacción de este README:

> **1. ¿Entra?** (binaria) Se acepta cuando los ingredientes dominantes del
> candidato son de la misma familia que los del plato **y** ningún ingrediente
> **ajeno al plato** pasa del 15 % del peso. No cuentan como ajenos el agua, el
> aceite de fritura ni la sal: son medio de cocción, no receta. Se rechaza si
> no, y el rechazo se documenta con el número que lo demuestra.
>
> **2. ¿Cuánto se le puede creer?** (graduada) La escala de confianza. La
> pregunta 1 decide si el gemelo sirve **como aproximación**; la 2 dice cuánto
> se parece. Un 0,6 o un 0,5 es explícitamente una aproximación con la reserva
> escrita al lado.

La distinción no es cosmética. Tres gemelos aceptados no sobrevivirían a la
regla binaria si se la leyera sola, y sin embargo están bien aceptados:

| Gemelo | Lo que la binaria objetaría | Por qué entra igual |
|---|---|---|
| `Croqueta` → Buñuelo (0,6) | 22 % de agua y ninguna bechamel declarada | El agua es de la masa, no un ingrediente ajeno; harina + leche + mantequilla + huevo **son** una bechamel, aunque `input_food` no use esa palabra |
| `Carbonara` → pasta con salsa de crema (0,5) | 48 % de salsa Alfredo | La emulsión grasa es la misma familia; que sea de crema y no de huevo es exactamente la reserva que declara el 0,5 |
| `Milanesa` → filete de pollo rebozado (0,5) | el plato es de vaca | La técnica y la estructura son idénticas; el cambio de especie es la reserva que declara el 0,5 |

Si la escala no existiera, los tres habría que rechazarlos y el usuario se
quedaría sin nada. La escala es lo que permite aceptarlos **diciendo la verdad**.

### El límite: SR Legacy no tiene `input_food.csv`

**La regla de oro solo se puede aplicar a FNDDS.** SR Legacy no publica
`input_food.csv`: sus alimentos son análisis de laboratorio de un producto, no
recetas con ingredientes. Los gemelos apoyados en SR —pulpo a la gallega, asado,
brigadeiro, locro, arroz con leche, y también chimichurri y dulce de leche— **no
se validaron por composición**: se validaron por la descripción del análisis y
por el perfil de macros medido. Es evidencia más débil y se declara como tal: su
campo `ingredientes` en el coverage va vacío **a propósito**, no por falta de
trabajo. Cuando un plato tiene un candidato razonable en las dos fuentes, el de
FNDDS se puede auditar y el de SR hay que creerlo.

Toda la medición vive en dos archivos hermanos, con el mismo formato:
**`kb/selection/regional.coverage.json`** (42 platos de España, Argentina, Italia
y Brasil) y **`kb/selection/es.sweep.coverage.json`** (39 platos españoles más,
por la directiva de producto que puso a España como mercado principal). Cada uno
trae la evidencia de cada gemelo aceptado y el motivo de cada rechazado.

### Cómo se agrega un alias regional

1. Buscá el candidato en los CSV y **mirá su `input_food`**, no su nombre.
2. Elegí el peldaño de la escala y escribí la reserva en `regional.coverage.json`
   (con los porcentajes que la sostienen).
3. Agregá el alias a `aliases.regional.json`. Si el alimento todavía no está en
   la selección, primero entra al bloque de promoción
   (`kb/selection/regional.v1.json`) y a `names.es.json`.
4. Corré `python3 tools/verify_curation.py`: los aliases regionales entran al
   **mismo censo** que los otros — no pueden pisar el nombre de otro alimento ni
   repetirse entre alimentos.

Un alias que dice lo mismo que el nombre del alimento **no se escribe**: el plato
ya está cubierto por el nombre, con confianza 1,0. El generador de la card 1.6
omitió siete por esto (paella, gazpacho, churros, empanada, dulce de leche,
tiramisú, focaccia).

### El límite del alias: es SOLO español

El contrato lo dice con la forma del campo, y conviene tenerlo escrito porque el
golden set de 30 hizo la pregunta: `aliases` tiene **una sola clave, `es`**. No
hay dónde declarar un alias en inglés. El caso concreto medido (plato 08) es
`bread roll`, que cae en *Pan* (fdc-2707591) teniendo *Panecillo* (fdc-2707595)
en el catálogo: **no se arregla con un alias**, porque el término está en inglés
y del lado inglés el único vocabulario que existe es `names.en`, que en las
fichas de USDA lo escribe el CSV y esta capa no pisa. Es del matcher o de una
extensión del contrato, no de la curación. Anotado para no volver a intentarlo.

Por el mismo motivo, **la regla del paréntesis solo se puede aplicar donde la
curación escribe el inglés**: en las fichas `manual` y `receta`. El golden set
dejó probado (2 de 2, la tortilla de patatas y el bocadillo de calamares, a 0,95
y 0,88) que un `names.en` con la forma *nombre genérico en inglés (nombre
regional)* es lo que el modelo tiende a escribir entero. Al revisar las 15 fichas
propias, **las cinco que tienen un equivalente genérico conocido en inglés ya la
llevan** —tortilla de patatas, bocadillo de calamares, pan de queso, huevos
rotos, merluza en salsa verde— y las otras diez son platos cuyo nombre regional
*es* el término que se usa en inglés (salmorejo, migas, turrón, coxinha, farofa,
tarta de Santiago, escalivada, ajoblanco, gazpachuelo, açaí), con el descriptor
en inglés detrás de la coma. **No hay ningún renombre pendiente por esta regla**,
y los dos platos del test que fallaron con nombre propio —la paella y el risotto—
son fichas de USDA, donde no hay mecanismo para tocar `names.en`.

## Los alimentos de curación manual

`manual.foods.json` es la **precedencia más alta del pipeline**
(`SR < Foundation < FNDDS < curación manual`). Es donde entra lo que USDA no
tiene: el salmorejo es su primera entrada.

```jsonc
{
  "id": "manual-salmorejo",          // "manual-<algo>": no se pisa con los fdc-
  "origen": "etiqueta-comercial",    // viaja al provenance: "manual/etiqueta-comercial"
  "source_ref": "Etiqueta comercial de salmorejo, foto del 30/08/2026",
  "name_en": "…", "name_es": "Salmorejo",
  "aliases": ["Salmorejo cordobés"],
  "category": "Soups, broth-based",
  "per_100g": { "kcal": 83, …, "fiber_g": null },
  "portion_hints": [ { "grams": 250, "label_en": "1 bowl", "label_es": "1 plato hondo" } ],
  "default_portion_g": 250,
  "caveats": [ "Los valores vienen por 100 ml, no por 100 g…" ]
}
```

### Los dos orígenes, que no valen lo mismo

`origen` viaja al provenance como `manual/<origen>` porque de dónde salió un
número cambia cuánto se le puede creer:

- **`etiqueta-comercial`** — leído de la etiqueta de un producto concreto
  (salmorejo). Es un dato preciso **de ese producto**, no necesariamente
  representativo del plato casero.
- **`referencia-web`** — punto medio de los rangos que publican agregadores
  nutricionales, recogidos con resúmenes de IA (tortilla de patatas, pan de
  queso, coxinha, farofa, açaí en polvo). **No es una medición: es un consenso
  de terceros.** El rango completo va escrito en los caveats, para que quien lea
  el número vea también su ancho — un "350 kcal" que viene de "300–400" no dice
  lo mismo que un 350 medido.

Tres reglas que no se negocian:

1. **`null` no es cero.** La etiqueta del salmorejo no declara fibra: el campo
   queda en `null` y el provenance de ese campo no existe, porque nadie lo produjo.
2. **Los caveats van en la entrada, no en un comentario.** Lo que la fuente NO
   dice viaja con el alimento hasta Firestore (`caveats`, que solo existe donde
   hace falta) y llega al reporte. Un valor por 100 **ml** usado como si fuera
   por 100 g es una decisión, y las decisiones se declaran.
3. **Los candados se aplican igual, y el de Atwater aprieta MÁS.** Para los
   alimentos manuales rige solo el brazo del 10 % relativo, **sin** el margen de
   ±20 kcal. El margen absoluto existe por una razón concreta y medida —en una
   lechuga de 15 kcal el porcentaje se dispara por nada— y esas lechugas vienen
   de USDA. En una ficha manual el margen absoluto es puro regalo: a 83 kcal,
   ±20 kcal es un 24 % de tolerancia efectiva. Son pocas fichas, las escribió
   una persona a mano y son los únicos números del catálogo que nadie midió en
   un laboratorio: es exactamente donde la tolerancia tiene que apretar más.
   Las seis cierran: salmorejo 3,0 % · tortilla 1,5 % · coxinha 0,8 % · pan de
   queso 2,6 % · farofa 4,8 % · açaí en polvo 8,4 %.

Si el `id` de una entrada manual coincide con un alimento del catálogo
(`fdc-173944`), sus valores lo **pisan campo a campo** en vez de agregar uno
nuevo — un `null` ahí significa "no toco este campo". El nombre y las porciones
se dejan como estaban: una entrada manual corrige **números**, no vocabulario;
para el vocabulario está `names.es.json`.

Y un candado más: **`caveats` solo puede existir en un alimento manual.** Un
caveat es lo que la fuente no dice; los alimentos de USDA los arma el build desde
los CSV y no tienen dónde declarar nada, así que un caveat en uno de ellos es un
valor que entró por una puerta que no existe.

El candado de aceptación por fuente exige **al menos 1 alimento manual**. El
motivo es el mismo que el de los otros dos pisos: el build lee la curación de
forma tolerante, así que si alguien renombra o vacía `manual.foods.json` el
catálogo saldría sin el salmorejo y con todos los demás candados en verde.

## Cómo se agrega una entrada nueva

Cuando el motor no encuentra un alimento, el build lo deja en
**`kb/build/pending.curation.json`** (clave `pending`, un ítem por alimento con
`fdc_id`, `source` y `description`). Para incorporarlo:

1. **Buscá los términos en `glossary.es.json`.** Si falta alguno, **agregalo ahí
   primero** — con la barra de género si es adjetivo (`crudo/a`), con `""` si es
   un marcador técnico. Un término resuelto en el glosario queda resuelto para
   todas las entradas futuras que lo usen: eso es frenar el error.
2. Corré el borrador **sobre la cola** y quedate con el punto de partida:
   ```bash
   python3 tools/draft_names.py --selection ../build/pending.curation.json \
                                --out /tmp/draft.json --report
   ```
   (sin `--selection` corre sobre el catálogo entero). Lo que no pudo resolver
   sale marcado con `??` en el reporte.
3. **Revisá el nombre a mano.** Leelo como lo leería quien sacó la foto.
4. Agregá la entrada a `names.es.json` y regenerá los aliases:
   ```bash
   python3 tools/build_aliases.py
   ```
   Solo agrega; los aliases escritos a mano sobreviven. Los que ninguna regla
   puede derivar (un nombre comercial, un plato que en otro país se llama entero
   distinto) van en `$extra` de `tools/variants.es.json`, por `fdc_id`.
   **Cuando cambiás una regla y un alias viejo tiene que caerse**, corré
   `build_aliases.py --rebuild`: sin eso, el generador conserva lo que ya estaba
   (no distingue un alias manual de uno generado por la regla anterior).
5. **Antes del candado: el alimento tiene que estar en la selección.**
   `verify_curation.py` compara contra la selección COMPLETA —
   `kb/selection/selection.v1.json` (card 1.1) **más** los bloques que la
   extienden, hoy `kb/selection/regional.v1.json` (card 1.6). Ninguno de los dos
   los escribe esta capa: si el alimento nuevo todavía no está ahí, pedí que se
   agregue al bloque que corresponda (dueño: `kb/selection`) y recién después
   corré el candado. Si no, la cobertura falla con un `sobran`.
6. Cerrá con los candados:
   ```bash
   npm run kb:build            # recompila el catálogo y reescribe la cola
   python3 tools/verify_curation.py
   ```
   Cobertura exacta contra `selection.v1.json`, cero nombres repetidos, aliases
   sin colisión ni desconcordancia, JSON estricto, estilo y porciones. Si falla,
   no hay seed.

## Las porciones

**La porción por defecto es lo que una persona se sirve, no una unidad de medida
de recetario.** `portions.overrides.json` corrige por los dos extremos:

- **Las que son muy chicas** — las marcadas con `portion_needs_review` en la
  selección: porciones USDA de menos de 5 g que como sugerencia sobre una foto no
  sirven (rúcula 2 g). Se reemplazan por una porción de plato realista con su
  etiqueta (`1 puñado`, `1 cucharada`).
- **Las que son una taza de recetario** — porciones de 200 g o más que no son
  bebida ni sopa y salen de una unidad de medida, no de un plato: la banana con
  225 g porque la USDA mide "1 cup, mashed" → **118 g, 1 unidad mediana**.

Dos casos no suben de los 5 g a propósito — el endulzante en sobre y el líquido:
ahí la porción chica es la verdad, lo que faltaba era la **unidad**. `1 sobre`
dice algo; `0,8 g` no dice nada. El aceite en spray sí sube a 2 g, porque su
etiqueta dejó de ser una rociada suelta y pasó a ser lo que engrasa la sartén:
**los gramos y la etiqueta tienen que decir lo mismo.**

Las etiquetas van en estilo uniforme (`1 puñado`, `1/2 taza`, `Unas gotas`):
empiezan con número o mayúscula, sin punto final. El verificador lo chequea.

## La DT-7: el nombre nunca miente

Dos fuentes que miden el mismo alimento producen dos fichas, y dos fichas para
una banana obligan al motor a elegir entre dos verdades y le dan al usuario dos
números para lo mismo. La DT-7 (aprobada por Tomás) barrió los **137 pares
cruzados** FNDDS/SR del catálogo donde el nombre en español de uno es prefijo del
otro, o donde coinciden salvo por un marcador de estado. De esos, 40 traían un
sufijo compuesto SOLO por marcadores de estado y se revisaron uno por uno: 22
resueltos, 4 pendientes de decisión y 14 descartados porque los dos nombres ya
declaraban su estado. La partición completa, con la evidencia de cada par y el
porqué de cada descarte, está en **`kb/selection/dt7.pairs.json`**.

| Grupo | Qué es | Qué se hizo |
|---|---|---|
| **A** (8) | Duplicado real: mismo alimento, mismo estado | Queda la ficha de SR Legacy —medición de laboratorio—; la de FNDDS sale por `kb/selection/exclusions.dt7.json` y **le hereda su vocabulario entero** a la que queda |
| **B** (9) | Mismo alimento en distinto estado | Se quedan las dos, y el cocido de FNDDS pasa a decir lo que trae: `Lentejas` → `Lentejas cocidas con sal y grasa` |
| **C** (5) | El nombre escondía otra receta | Se renombra: `Ruibarbo` → `Ruibarbo cocido con azúcar` |
| **ambiguo** (7) | La diferencia es real y la decisión es de producto | Se listaron con su evidencia y los resolvió la **DT-8** (abajo) |

**Excluir no puede achicar el vocabulario.** Lo que perdía la ficha excluida —su
nombre *y* sus aliases— pasa entero a la que queda, con confianza 1,0: no es un
gemelo, es el mismo alimento con otro nombre. Eso lo aplica el **build** desde
`exclusions.dt7.json`, para que haya una sola fuente de verdad; `verify_curation.py`
lo mete en el mismo censo de colisiones que el resto.

**Dos excepciones medidas** que parecían duplicados y no lo eran: el `Peanuts, NFS`
de FNDDS es `dry-roasted, with salt` (sodio 410 contra 18 mg) y el `Bulgur, NS as
to fat` es bulgur cocido **con sal** (219 contra 5 mg, con los macros idénticos).
No se excluyen: se renombran (`Maní tostado con sal`, `Bulgur cocido con sal`).

La misma regla se aplicó fuera del censo cruzado, barriendo el catálogo entero por
`input_food`: ocho fichas cuyo nombre escondía su composición. `Bacalao` era 100 %
`Fish, cod, fried` —217 kcal y 11,72 g de hidratos, cuando un bacalao al vapor
tiene 0— y ahora es `Bacalao rebozado`; lo mismo `Perca`, `Trucha` y `Pulpo`. Y un
falso amigo: la `Sidra de manzana` de USDA es jugo de manzana **sin fermentar**, así
que pasó a `Sidra de manzana sin alcohol`.

**`dt7.pairs.json` es el único lugar donde se autoriza cambiar una ficha
preexistente.** Lo que no está ahí, no se tocó. Y ahora el artefacto no es solo
documentación: cada renombre declara su `nombre_anterior`, y el build los lee
para hacer cumplir un candado.

### El candado del nombre viejo

Renombrar una ficha porque su nombre mentía no sirve de nada si el nombre viejo
vuelve como alias sin calificar: el usuario cae en el mismo lugar. Pasó dos veces
—`Quinua` sobre la quinoa con grasa, y `Garbanzos` sobre los garbanzos guisados,
la segunda reintroducida al arreglar la primera—, así que dejó de arreglarse a
mano: **ningún alias de confianza 1,0 puede ser el nombre anterior de ninguna de
las 27 fichas que la DT-7 renombró.** El build lee esos 27 nombres del propio
artefacto y rompe si alguno reaparece.

Con una **reserva declarada sí puede volver**, y es lo correcto: `Bacalao` a 0,8
sobre el bacalao al vapor dice "esto se parece", no "esto es".

## La DT-8: los siete ambiguos, resueltos

La DT-7 dejó siete pares sin resolver a propósito: la diferencia era real y la
decisión era de producto, no de curación. Tomás los resolvió el **31/08/2026** y
la resolución de cada uno vive en el mismo `dt7.pairs.json`, con su `decision` y
su `decidido_por` — el censo es también el registro de la decisión.

El criterio que salió de las siete, y que sirve para la próxima:

> Se **fusiona** cuando las dos fichas son la misma medición contada dos veces:
> los ocho valores idénticos, o una diferencia que ninguna foto puede mostrar.
> Se **conservan las dos** cuando la diferencia se **mide** (el sodio del
> parmesano: 1.398 contra 1.750 mg) o se **ve** (rallado contra en trozo).
> Lo que no se arregla borrando una ficha —dos pepinillos que el nombre ya
> distingue— es del **matcher** de la fase 2, no del catálogo.

| Par | Decisión |
|---|---|
| Parmesano rallado seco / rallado de SR | **Las dos**: 25 % de sodio de diferencia, y la distinción es de USDA |
| Parmesano rallado seco / en trozo | **Las dos**: la composición es igual, la foto no |
| Puré de papa / listo para comer | **Fusionar** al casero (queda el de FNDDS) |
| Frijoles / secos cocidos con grasa | **Fusionar** (ocho valores idénticos) |
| Croquetas de papa / congeladas | **Fusionar** (ocho valores idénticos) |
| Pepinillos / dulces | **Sin cambio**: es del matcher |
| Mantequilla NFS | **Se conserva**: la cubre la DT-13 |

Las tres fusiones se ejecutan por `exclusions.dt7.json` con el mecanismo del
grupo A —herencia de vocabulario entero— y **la entrada de la ficha excluida se
borra de `names.es.json`**: la cobertura de `verify_curation.py` es exacta, y el
vocabulario no se pierde porque pasa a `aliases_heredados`.

Una fusión rompe la regla de la DT-7 a propósito y está anotada: en el puré sale
la ficha de **SR Legacy** y queda la de FNDDS, porque ahí no decide la fuente
sino el producto — el puré que una persona fotografía es el de plato.

## La DT-13: los genéricos, y por qué el promedio no es de nadie

USDA publica fichas que no miden un alimento sino el **promedio de una familia**:
las marca con `NFS` (*not further specified*) y con `NS as to …`. Hay **339** en
el catálogo. `Queso, NFS` no es un queso: es el promedio de todos los quesos que
come la encuesta, y su sodio —964 mg— no es el de ninguno en particular.

La curación **borra el marcador del nombre en español** (esa es la convención de
arriba: `Pera en lata`, no "Pera en lata NFS"), así que el usuario nunca ve la
diferencia entre una ficha medida y un promedio. Eso está bien para el nombre y
mal para el número. La DT-13 lo resuelve con **una regla declarativa**, no con 339
ediciones a mano:

```jsonc
// curation/genericos.dt13.json
{
  "marcadores_en": [", NFS", "NS as to"],
  "umbral_sodio_mg": 400,
  "plantilla_caveat": "Ficha genérica: … Los {sodio_mg} mg de sodio por 100 g …"
}
```

Dos salidas al catálogo:

1. **`generic: true`** en las 339. Es para el motor de la fase 2: un match contra
   un promedio vale menos que uno contra una medición, y el motor no tiene por
   qué volver a parsear el inglés de USDA para saberlo.
2. **Un caveat generado** en las **101** que además pasan el umbral de sodio, con
   **el número de la propia ficha adentro**. Por eso la plantilla tiene que traer
   `{sodio_mg}` y el build la rechaza si no: un caveat que avisa que "puede
   variar" sin decir de cuánto se está hablando no informa nada.

Se eligió el sodio y no otro nutriente porque es el que más se dispersa dentro de
una familia y el que arrastra la recomendación de la OPS. El umbral y el texto
viven en el archivo y **no en el build**: subirlo a 500 o reescribir la frase es
editar un JSON y recompilar.

Tres reglas del mecanismo:

- El caveat generado **se agrega**, no pisa: si la ficha ya traía caveats, quedan.
- La regla **solo alcanza a los alimentos de USDA**. Un alimento manual o una
  receta no promedian ninguna familia y su reserva ya está escrita a mano.
- El **candado re-deriva**: el candado 1 vuelve a calcular la marca y el caveat de
  cada ficha desde la regla declarada y exige que el catálogo diga exactamente
  eso, en las dos direcciones — ni un genérico sin marcar, ni una marca de más, ni
  un caveat escrito a mano colado en una ficha de USDA, ni el caveat generado
  repetido dos veces (se compara la lista entera, no si el texto *está*).

### Estos dos archivos NO son opcionales

`genericos.dt13.json` y `guardas.vocabulario.json` son la única excepción a la
tolerancia de esta capa, y el **candado 0** la hace cumplir: si falta uno, o si
alguno no respeta su contrato, el build no escribe nada.

El motivo se midió en el Q/A de la card: borrando `genericos.dt13.json` el build
salía **en verde** publicando un catálogo con cero marcas `generic` y cero
caveats, y borrando `guardas.vocabulario.json` un alias `Chorizo` sobre el bife de
chorizo pasaba sin que nadie lo notara. Es el mismo silencio del mapeo vacío de
FNDDS que le dio origen al candado 2: nada explota, simplemente no queda nada.

Y hay un motivo más, propio de la DT-13: **la regla es la llave del candado 1**.
Sin ella, el candado no puede re-derivar las marcas y deja pasar un `generic: true`
de más. Un candado cuya llave puede desaparecer sin ruido no es un candado.

## Las guardas de vocabulario

`guardas.vocabulario.json` declara **términos que no pueden nombrar a una ficha**.
Es el hermano del candado del nombre viejo: aquel impide que un nombre ya
corregido vuelva de alias, este impide que una palabra caiga en la ficha
equivocada **aunque nadie la haya escrito todavía**.

La primera es `chorizo`. `Bife de chorizo` (`Beef, steak, strip`) es un **corte
vacuno** y el chorizo es un **embutido**: los dos existen en España y en
Argentina, y son dos alimentos distintos (239 kcal y 361 mg de sodio contra 341
kcal y 983 mg). `chorizo` a secas es del embutido, donde ya vive con confianza
0,6.

La comparación es **por igualdad exacta** sobre el término normalizado —sin
tildes, en minúsculas—, contra el nombre y contra cada alias: `Bife de chorizo`
*contiene* la palabra y es un nombre correcto; lo prohibido es la ficha
llamándose `Chorizo` o llevándolo de alias. Y **la confianza no salva**: un
`chorizo` a 0,5 sobre un corte vacuno no dice "esto se parece", dice "esto es otra
cosa".

### La regla que salió de la card 2.7: técnica y corte no son alimentos

El golden set de 30 platos reales (01/09/2026) dejó **medida** la regla general
de la que el chorizo era el primer caso particular:

> **Un término genérico de técnica de cocción o de forma de corte no puede ser el
> alias de una ficha concreta, con ninguna confianza.**

En español `filete` nombra cómo está cortado —de ternera, de salmón, de merluza,
de pollo— y `asado` nombra cómo está cocinado —pollo, papa, pimiento—. Un alias
así no dice "esto se parece a esto": dice "**todo** lo cortado o cocinado así ES
esta ficha", y por eso la escala no lo arregla. Lo que sí puede ser alias es el
nombre del plato o del corte: `Tira de asado`, `Bistec`. El costo medido de no
tener la regla fueron dos de los tres errores de ficha del test —una costilla de
vaca sobre un muslo de pollo y un bife sobre un filete de salmón.

Y una guarda que **no** es de familia, porque conviene tenerla a la vista: la de
`croqueta`/`croquetas` sobre el buñuelo. Por composición el buñuelo aprobaba
—harina, leche, huevo y mantequilla fritos en aceite *son* una masa rebozada— y
sin embargo se rechazó, **por número**: 378 kcal/100 g contra las ~240 de una
croqueta real, o sea +57 % sobre la única cifra que el producto publica. La regla
de oro pregunta de qué está hecho el gemelo; este caso agrega que **también hay
que mirar cuánto mide**, porque un gemelo que se equivoca por más de la mitad no
es un gemelo aunque su lista de ingredientes cierre.

Las **veinte** guardas vigentes están en `guardas.vocabulario.json` (5 con la
card 2.7, 7 con la 6.2, 17 con la 6.3 y 20 con la 6.4),
cada una con el número que la justifica, y hay dos tests que las fijan: uno
comprueba que sigan declaradas —el candado 0 exige que el archivo exista, no que
traiga *estas* filas— y otro construye la ficha con el alias prohibido y verifica
que la guarda muerda.

## Las recetas compuestas (card 1.7)

**El mecanismo por defecto para cubrir un hueco del catálogo.** Antes, un plato
que USDA no medía solo se podía fichar copiando números de una etiqueta o de un
agregador. Ahora se declara **de qué está hecho** y el build calcula el resto:

```
nutriente = Σ(nutriente_ingrediente × gramos / 100) / peso_final × 100
```

**Nadie tipea un número nutricional en `recipes.foods.json`.** Lo único que se
declara son ingredientes, gramos y método. Por eso una ficha derivada se puede
**auditar rehaciendo la cuenta** —los ingredientes y los gramos viajan al
catálogo en el campo `receta`— y por eso se recalcula sola el día que mejore la
ficha de uno de sus ingredientes.

### Los métodos son una tabla, no un número escondido

`cooking.transforms.json` declara cada método una vez, con su fuente medida, y
todas las recetas lo reutilizan. La Fase 2 va a consumir esa misma tabla **en
runtime** para componer platos que nadie anticipó, así que la matemática vive
pura y aparte en `kb/src/transforms.ts`: sin leer archivos, sin reloj, sin azar.
La decisión, separada de la lectura.

| Método | Factor | Aceite | De dónde sale |
|---|---|---|---|
| `crudo` | 1,000 | — | Identidad |
| `mezclado` | 1,000 | — | **Medido**: las 290 recetas de FNDDS resolubles al 100 % tienen rendimiento implícito con mediana 1,000 |
| `frito` | 1,000 | 6,5 % | **Medido**: 117 platos `fried` de FNDDS que declaran aceite (p10 1,3 · p90 9,9) |
| `horneado` | 0,759 | — | **Medido**: 193 pares crudo/asado de SR Legacy, con la proteína de trazador. *Ámbito: carnes* |
| `plancha` | 0,757 | — | **Medido**: 190 pares crudo/parrilla, mismo trazador. *Ámbito: carnes* |
| `hervido` | 1,113 | — | **Medido**: 84 pares crudo/hervido con criterio de sufijo literal. *Ámbito: verduras, y con mucha dispersión* |
| `horneado_masa` | 0,891 | — | **Medido**: 3 pares `unbaked`/`baked` de masa de tarta. *Ámbito: masa quebrada de harina* |

El hallazgo que ordena toda la tabla: **FNDDS no modela pérdida de peso en sus
propias recetas.** Se resolvieron las 290 recetas del catálogo cuyos ingredientes
se mapean enteros a SR Legacy y se comparó la suma de calorías de los
ingredientes contra las del plato: mediana 1,000. Por eso `mezclado` es el método
por defecto y su 1,000 no es un supuesto nuestro, es la convención de la fuente.

### Lo que NO está, y por qué

**Una transformación sin fuente defendible no se inventa — pero antes de decir que
no hay fuente, hay que buscarla bien.** Dos de las tres que esta capa dio por
imposibles resultaron ser errores de búsqueda propios:

- El **horneado de masas** existía: se había buscado con los sufijos de la carne
  (`cooked, baked`) y las masas de SR Legacy usan `unbaked` / `baked`. Ahora es
  `horneado_masa` (0,891) y la tarta de Santiago pasó de 391 a **439 kcal/100 g**.
- El **curado en seco** también: se había comparado cocido contra cocido usando un
  jamón de salmuera, y de ahí salía que el curado *ganaba* peso. El par correcto
  —crudo contra crudo— da mediana 0,784 en la dirección correcta. Aun así el lomo
  embuchado sigue bloqueado, pero **por el corte y no por falta de dato**: 0,784
  es el secado de un jamón y un embuchado se seca más.
- El **horneado de verduras** sigue descartado, con el conteo corregido: no son 3
  pares sino 5, en dos familias que se contradicen (2 patatas a 0,800 y 0,822; 3
  calabazas a 0,714 · 1,067 · 1,111).

Las recetas que necesitan un factor que no existe usan `mezclado` y **declaran en
sus caveats que por eso subestiman** —la escalivada y el turrón—; las que no
tienen derivación honesta quedan **bloqueadas** y se reportan: el lomo embuchado
por el corte, y la pulpa de açaí congelada, que solo se podría derivar eligiendo
la rehidratación que dé el número que ya sabemos. Eso no es derivar: es escribir
la respuesta y disfrazarla de cálculo.

### El agua

El agua que **se evapora** no es un ingrediente: la representa el factor del
método. El agua que **se queda** en el plato sí lo es, y entra apuntando a
`fdc-2710707` (Agua): pesa y diluye. Y no es un cero — USDA le mide **4 mg de
sodio por 100 g**, y el build usa sus valores reales como los de cualquier otro
ingrediente. Decirlo en una línea de la receta es mejor que esconderlo dentro de
un factor, que además perdería ese sodio.

### Los candados

1. Toda `ref` existe en el catálogo, no está deprecada y no la excluyó la DT-7.
2. El rendimiento cae entre 0,50 y 1,50 (la tabla va de 0,757 a 1,049; el rango
   deja margen y frena un error de tipeo). Un rendimiento declarado a mano
   **exige** `rendimiento_motivo`.
3. La densidad calórica cae entre 15 y 900 kcal/100 g — del caldo al aceite puro.
4. La ficha derivada trae su `receta`: sin ella el valor no se puede rehacer.
5. Piso de aceptación `receta ≥ 1`, por el mismo motivo que el de la curación
   manual: el archivo se lee de forma tolerante y vaciarlo no lanzaría nada.
6. **Atwater cierra por construcción** —las calorías y los macros salen de las
   mismas fichas y de la misma división— y hay un test que lo fija como
   invariante a través de cuatro factores de peso distintos.

Una receta que no se puede derivar **no se saltea en silencio**: rompe el build
nombrando el ingrediente que falta. Ya pasó en la primera corrida, y fue así como
se supo exactamente qué seis ingredientes sueltos había que promover.

### La ola de 43 recetas de la card 6.4, y las cuatro reglas que salieron de ahí

La card 1.7 dejó nueve recetas; la 6.4 sumó **43** de una vez, para cerrar los
platos que el censo mediterráneo había dejado sin ficha. Escribir cuarenta y tres
seguidas obligó a fijar cuatro cosas que hasta ahora estaban implícitas.

**1. El agua que se evapora NO se declara, y eso es un número, no un descuido.**
La tortillita de camarones se bate con unos 200 g de agua que se van enteros en
la freidora. Declararla habría bajado la ficha de 278 a 192 kcal/100 g —un 31 %
por debajo— sobre un plato que ronda las 350. La regla ya estaba escrita («el
agua que se evapora la representa el factor del método»); lo que faltaba era
aplicarla al revés: **si el agua se va, no entra la línea.** El agua que se queda
—el caldo de un pote, el almíbar de un tocinillo, la papilla de unas gachas— sí
entra, apuntando a `fdc-2710707`.

**2. Cuando la receta declara su aceite, el 6,5 % de `frito` se declara TAMBIÉN,
y como segunda línea.** La tabla dice que `frito` es para las frituras que no
declaran su aceite; el pestiño declara el de la masa y además absorbe el de la
sartén. La salida no es elegir una de las dos grasas: es escribir las dos, con el
método en `mezclado` y la segunda línea calculada como el 6,5 % del peso de la
masa — que es la **mediana medida** sobre 117 platos `fried` de FNDDS, no un
número elegido. El tumbet usa el mismo mecanismo para la berenjena y el
calabacín. Deja las dos grasas visibles en la receta en vez de esconder una
dentro de un factor.

**3. Un ingrediente que ya trae su cocción NO se acompaña de su caldo.** El arroz
a banda, el arroz al caldero y la fideuá se cuecen EN el fumet, y las fichas
`Arroz blanco cocido` y `Pasta cocida` ya traen esa agua adentro. Sumar el caldo
aparte la contaría dos veces y bajaría la densidad del plato. La regla se lee al
revés de la anterior y es la misma: **el agua entra una sola vez, donde de verdad
está.**

**4. Las reservas se nombran por su TIPO, y son tres.** Escribirlas con la misma
etiqueta hace que se puedan contar y buscar:

| Etiqueta | Qué declara | Ejemplo |
|---|---|---|
| `RESERVA DE ESPECIE` | La ficha mide otro animal o planta | El marmitako usa `Atún cocido` porque USDA no mide bonito |
| `RESERVA DE INGREDIENTE` | Falta el ingrediente o se sustituye | Las gachas usan harina de trigo: la de almortas no existe en ningún dataset |
| `RESERVA DEL RENDIMIENTO` | El factor aplicado es el más cercano, no el propio | La ensaimada usa `horneado_masa`, medido sobre masa quebrada |

Y una regla de honestidad que la card estrenó y conviene repetir: cuando la ficha
derivada queda **por debajo** de lo que se sabe del plato real, se dice el número
y se dice cuánto —«la ficha da ~278 y la tortillita real ronda las 350»— en vez de
mover un gramo hasta que cierre. Ese ajuste es exactamente el defecto por el que
la arepa descartó su receta en la card 6.2 y por el que la pulpa de açaí sigue
bloqueada.
