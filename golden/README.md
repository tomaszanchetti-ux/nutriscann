# El golden set, adentro del repo

Las fotos con las que se mide si NutriScann sirve, las predicciones escritas
**antes** de correrlas, las respuestas que devolvió el sistema y las herramientas
para volver a medir todo eso sin gastar un centavo.

Hasta la WS06 esto vivía fuera del repo, en `NutriScann/golden-set-30/`. Un test
de mercado que vive afuera del repo no se puede correr en CI, no se versiona con
el motor que mide y se pierde en cuanto cambia la máquina. Ahora está acá.

## Qué hay

```
golden/
  runner.sh              corre las fotos contra el endpoint. CUESTA PLATA.
  bin/informe.js         mide OFFLINE lo ya grabado. Gratis, todas las veces.
  set-30/
    fotos/               30 fotos, 6,4 MB (ver "sobre el peso")
    respuestas/          corrida v1 · catálogo 3.0.0+b2b227e1
    respuestas-v2/       corrida v2 · catálogo 3.1.0+47b8c77d
    predicciones.md      LA VARA: qué ficha y qué rango, escrito antes de correr
    criterios.json       lo mismo, en una forma que una máquina puede leer
    evaluacion.md        el informe de la v1
    evaluacion-v2.md     el informe de la v2 (el que abrió la DT-28)
    fotos.md             de dónde salió cada foto y con qué licencia
    herramientas/        los scripts con los que se buscaron y bajaron las fotos
  test-10/               el test anterior, de 10 platos, con su informe
```

**Las fotos de `test-10` no están, y no se perdieron:** son byte a byte las diez
primeras de `set-30` (verificado por sha256), y los `raw-*.jpg` de aquel
directorio eran los originales de 2-4 MB de los que salieron. Lo que sí está es lo
que no se puede reconstruir: sus respuestas y su informe.

## Sobre el peso de las fotos

**No se comprimió nada, y eso se midió antes de decidirlo.** Las 30 fotos pesan
6,4 MB y ya están a **1.024 px de lado mayor**, que es exactamente lo que hace la
app antes de mandar la imagen al modelo (`apps/web/src/lib/imagen.ts`:
`LADO_MAYOR_PX = 1024`, `CALIDAD_JPEG = 0,8`). Comprimirlas otra vez habría
degradado la imagen sin ahorrar nada y, peor, habría hecho que el golden set
midiera sobre fotos DISTINTAS de las que ya se corrieron: las respuestas grabadas
dejarían de ser comparables.

Lo que sí quedó afuera: los **`bodies/`** (la misma foto en base64, 8,5 MB por
corrida, los regenera el runner) y los directorios `raw/` y `descartadas/` del
material de origen, que siguen intactos fuera del repo.

## Volver a medir sin llamar a nadie

```bash
cd functions && npm run build && cd ..
node golden/bin/informe.js
node golden/bin/informe.js --detalle
```

Las respuestas grabadas son **oro**: traen el término que la visión escribió para
cada alimento, así que el matching se puede volver a jugar contra el motor de hoy
las veces que haga falta. Tres medidas salen de ahí:

1. **Replay** — qué hace el motor de hoy con los términos de aquel día.
2. **Criterio 2 recalibrado** — los kcal contra los gramos que la visión reportó,
   no contra los que la predicción supuso (DT-28, punto 4).
3. **Estabilidad de la visión** — cuánto se movió el modelo entre dos corridas
   sobre las mismas fotos (DT-28, punto 5).

La lógica de las tres vive en `functions/src/engine/golden.ts`, se compila con el
motor y tiene sus candados en `functions/src/engine/golden.test.ts`. Este
directorio guarda los datos y la línea de comandos.

### Para atribuirle un cambio al motor hay que clavar el catálogo

Cada respuesta grabada dice con qué `kb_version` se calculó. Si el replay corre
contra un catálogo posterior, lo que se ve es la suma de dos cosas —lo que cambió
el motor y lo que cambió la curación— y no se pueden separar. **Las dos corridas
se grabaron con catálogos distintos**, así que esto casi siempre hace falta:

```bash
git show <commit>:kb/build/foods.canonical.json > /tmp/kb-de-la-corrida.json
node golden/bin/informe.js --catalogo=/tmp/kb-de-la-corrida.json
```

El informe avisa solo cuando el índice no coincide con la corrida.

### Lo que el replay NO puede ver

**Las respuestas grabadas no traen `food_es`** (DT-25): el expediente guarda
`termino_en` y nada más. Un alimento que aquel día matcheó por su nombre español
—la lasaña por el alias `Lasaña`, el jamón por `Jamón serrano`— no se puede volver
a jugar. Se los reconoce por el motivo, que sí quedó grabado y dice el idioma, y
el informe los marca `no_comparable_es` en vez de contarlos como pérdidas.

Mientras la DT-25 siga abierta, **el replay mide un piso, no el resultado
completo**.

## Volver a correr las fotos (esto sí cuesta)

```bash
./golden/runner.sh -o set-30/respuestas-v3 -e https://.../analyze
```

30 llamadas al modelo de visión. Una corrida nueva **no reemplaza** a las
anteriores: se guarda al lado, porque comparar dos corridas es la única forma de
saber cuánto se mueve el modelo solo.
