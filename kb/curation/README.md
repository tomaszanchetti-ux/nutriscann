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
| `names.es.json` | **El entregable.** `{fdc_id: {name, aliases}}` para los 975 del catálogo v1. | el build |
| `portions.overrides.json` | Porción por defecto corregida + etiqueta, para las entradas cuya porción USDA es inservible como sugerencia. | el build |
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
   `verify_curation.py` compara contra `kb/selection/selection.v1.json`, que es
   la salida de la card 1.1 y **no la escribe esta capa**: si el alimento nuevo
   todavía no está ahí, pedí que se regenere la selección (dueño: `kb/selection`)
   y recién después corré el candado. Si no, la cobertura falla con un `sobran`.
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
