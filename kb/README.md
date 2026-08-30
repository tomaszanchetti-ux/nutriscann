# Base de conocimiento (kb/)

El catálogo nutricional que usa el motor para cuantificar lo que el modelo identifica.

## El principio

**La fuente de verdad es este directorio, no Firestore.** Firestore es una copia de
servicio, derivada. Nadie edita el catálogo en la consola de Firebase: se edita acá,
se revisa en un pull request y se publica con el seed.

Un catálogo correcto **por construcción**, no por disciplina.

## Las cuatro capas

```
1. FUENTES CRUDAS       sources.json declara qué datasets usamos, con su sha256.
                        Los .zip NO están en git (1,1 GB): viven en la carpeta
                        de arriba. Si un archivo cambia, el build lo detecta.

2. BUILD                Parsea los CSV → modelo canónico. Determinístico:
                        mismas fuentes ⇒ mismo resultado, siempre.
                        Precedencia declarada en sources.json.
                        Cada campo registra de qué fuente salió.
                        → build/foods.canonical.json  (COMMITEADO)

3. CURACIÓN             curation/*.json — nombres en español, aliases, etiquetas
                        de porción en español, correcciones puntuales. Los
                        arreglos van SIEMPRE acá; nunca al build ni a Firestore
                        directo. El build los mezcla y los marca en provenance.

4. SEED                 Sube el canónico a Firestore (foods/) estampando la
                        kb_version. Idempotente: correrlo dos veces da el mismo
                        resultado. Un alimento retirado se marca deprecated,
                        nunca se borra.
```

## Cómo se corre

```bash
cd kb && npm install     # sin dependencias de runtime: solo TypeScript
npm run build            # compila el catálogo y verifica los cinco candados
npm run build -- --seco  # corre y reporta, pero no escribe nada
npm test                 # candados en frío + el pipeline completo dos veces
```

El build **no escribe nada hasta que los cinco candados dan verde**. Termina con
código 1 y la lista de fallas: un catálogo mutilado publicado es peor que un
build que no corre, porque el error aparece en el reporte de un usuario.

Salida (ambos archivos se commitean, para que cada cambio del catálogo sea un
diff revisable en un pull request):

- `build/foods.canonical.json` — el catálogo, con provenance campo a campo.
- `build/pending.curation.json` — los alimentos sin `names.es`, para la curación.

## Candados

El build **falla** —y por lo tanto no hay seed— si:

1. **Esquema.** Un alimento no valida: los cuatro macros y las calorías tienen
   que estar y ser números finitos. Nada de `NaN` ni de `Infinity`.
2. **Aceptación por fuente.** Menos de 600 alimentos de FNDDS o menos de 250 de
   SR Legacy con nutrientes resueltos. Este candado existe por una trampa
   medida: FNDDS referencia los nutrientes por `nutrient_nbr` y los otros dos
   datasets por `nutrient.id`. Un mapeo único no lanza ninguna excepción —
   devuelve VACÍO EN SILENCIO para la fuente más valiosa. Exigir un piso por
   fuente convierte ese fallo silencioso en una explosión.
3. **Atwater.** Las calorías declaradas no cierran con los propios macros del
   alimento (4×proteína + 4×carbohidratos + 9×grasa + 7×alcohol), con tolerancia
   del 10 % *y* ±20 kcal — hay que fallar las dos para que salte, porque en una
   lechuga de 15 kcal el porcentaje se dispara por nada.
4. **Casos dorados.** Cinco alimentos conocidos contra su valor de referencia,
   ±15 % (`manzana ≈ 52 kcal/100 g`). No prueban que USDA esté bien: prueban que
   el pipeline leyó la columna correcta.
5. **Idempotencia.** Dos corridas completas del pipeline tienen que producir el
   mismo archivo byte a byte. Si no, el catálogo no es reproducible.

## Cómo crece

El motor, en runtime, escribe en `curation_queue/` cada alimento que no encontró.
Esa cola se revisa, se convierte en un archivo de curación, se recompila el
catálogo y se re-seedea. El catálogo crece con el uso real — siempre entrando por
la puerta del pipeline, nunca por la ventana.

## El contrato con el seed

Cada alimento del canónico tiene esta forma. **Todo lo que ve el usuario es
bilingüe por diseño**: `names` y las etiquetas de porción llevan una clave por
idioma, así que sumar portugués o francés mañana es agregar una clave, no
refactorizar el catálogo ni migrar Firestore.

```jsonc
{
  "id": "fdc-173944",
  "source": "usda_sr_legacy",
  "source_ref": "USDA FDC #173944",
  "names": { "en": "Bananas, raw", "es": null },
  "aliases": { "es": [] },
  "category": "Fruits and Fruit Juices",
  "per_100g": { "kcal": 89, "protein_g": 1.09, "carbs_g": 22.84, "fat_g": 0.33,
                "fiber_g": 2.6, "sat_fat_g": 0.112, "sugars_g": 12.23, "sodium_mg": 1 },
  "portion_hints": [ { "grams": 118, "label_en": "1 medium", "label_es": null } ],
  "default_portion_g": 225,
  "provenance": { "per_100g.kcal": "usda_sr_legacy", "names.en": "usda_sr_legacy" },
  "deprecated": false
}
```

`names.es` y `label_es` valen `null` mientras la curación no los haya escrito:
el catálogo se publica igual y el seed no espera a nadie. Los cuatro macros y
las calorías, en cambio, nunca son `null` — sin ellos el alimento no entra.

### Qué dice exactamente `provenance`

`provenance` responde **de dónde salió cada campo**, con la ruta del campo como
clave (`per_100g.kcal`, `names.es`, `portion_hints.label_es`). Un campo que
quedó en `null` no aparece: nadie lo produjo.

Dos casos merecen una aclaración, porque su origen es de **segunda mano**:

| Campo | Qué dice el provenance | Qué significa de verdad |
|---|---|---|
| `category` | `usda_sr_legacy` / `usda_fndds` | El valor lo escribió `selection.v1.json` (card 1.1), que a su vez lo derivó de las tablas de categorías de ese dataset. El build no lee `food_category.csv`. |
| `default_portion_g` | ídem, salvo que diga `curation` | Igual: los gramos por defecto los eligió la selección entre las porciones del dataset. El build los copia tal cual, o los reemplaza si la curación los corrigió. |

Es decir: para esos dos campos el provenance nombra **el dataset de origen del
dato**, y el camino por el que llegó es la selección. El resto de los campos
—`names.en`, todo `per_100g`, `portion_hints`— sí los lee el build directamente
de los CSVs, y ahí el provenance nombra la fuente inmediata. `usda_foundation`
solo aparece en `per_100g`: Foundation no aporta alimentos, pisa valores.

## El contrato con la curación

El build lee `curation/` de forma **tolerante**: si los archivos no existen o
están a medias, el catálogo sale igual con `names.es = null` en lo que falte y
el build imprime los pendientes. Lo que no tolera es un archivo mal formado: si
existe y no respeta el contrato, lo reporta. Tolerar la ausencia no es tolerar
la basura.

```jsonc
// curation/names.es.json
{ "173944": { "name": "Banana", "aliases": ["plátano", "banano"] } }

// curation/portions.overrides.json
{ "173944": { "default_portion_g": 118, "label_es": "1 unidad mediana" } }
```

Las dos claves del override de porciones son independientes: se puede corregir
solo los gramos, solo la etiqueta en español, o las dos.

- `default_portion_g` reemplaza los gramos por defecto que traía la selección.
- `label_es` va a la **porción por defecto**: si esos gramos ya existen entre
  las porciones de USDA, esa porción recibe su nombre en español; si no existen
  (la curación nombró una medida que USDA no mide), entra como una porción más.

Lo curado queda marcado en `provenance` con la ruta del campo
(`portion_hints.label_es`, `default_portion_g`, `names.es`, `aliases.es`), así
que el resto de las porciones sigue declarando su origen USDA.

## Estado

**Capas 1, 2 y 3 en pie (card 1.2).** El build compila los 975 alimentos de la
selección con los cinco candados en verde. Falta la capa 4: el seed a Firestore
(card 1.5) y la curación en español (card 1.3), que corre en paralelo.
