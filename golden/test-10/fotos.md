# Fotos — origen y licencia

Todas de Wikimedia Commons (`commons.wikimedia.org`), descargadas con
`User-Agent: NutriScann-QA/0.1 (test local)`, redimensionadas a lado mayor
1024 px con `sips -Z 1024 -s format jpeg -s formatOptions 80`.
Todas verificadas con `file` como JPEG baseline válido, y **miradas una por una
antes de gastar ninguna llamada** (por eso hubo dos cambios, anotados abajo).

| # | Plato | Archivo en Commons | Licencia | Local |
|---|---|---|---|---|
| 01 | Manzana entera | `File:Liat Portal for Foodie Disorder - Red Apple (Whole Fruit).jpg` | CC BY-SA 4.0 | `fotos/01-manzana.jpg` (1024×768) |
| 02 | Croissant | `File:Croissant 3.jpg` | CC BY-SA 4.0 | `fotos/02-croissant.jpg` (768×1024) |
| 03 | Paella | `File:Paella valenciana, Mazatlán, 25 de abril de 2023.jpg` | CC0 | `fotos/03-paella.jpg` (1024×880) |
| 04 | Tortilla de patatas | `File:Tortilla española con patatas y cebolla.jpg` | CC BY 4.0 | `fotos/04-tortilla.jpg` (1024×768) |
| 05 | Lasaña | `File:Lasagna (1).jpg` | CC BY 2.0 | `fotos/05-lasagna.jpg` (1024×833) |
| 06 | Risotto de hongos | `File:Risotto ai funghi porcini.JPG` | CC BY-SA 3.0 | `fotos/06-risotto.jpg` (1024×768) |
| 07 | Bife + papas + ensalada | `File:DFC 5113 Steak golden fries and fresh cabbage salad with dipping sauces - a classic comfort meal in Pattaya.jpg` | CC BY-SA 4.0 | `fotos/07-bife-combinado.jpg` (1024×682) |
| 08 | Lentejas guisadas | `File:Guiso de lentejas argentino con chorizo.jpg` | CC BY-SA 3.0 | `fotos/08-lentejas.jpg` (1024×768) |
| 09 | Arepa | `File:Arepa de harina de trigo.jpg` | CC BY-SA 4.0 | `fotos/09-arepa.jpg` (1024×576) |
| 10 | NO comida (bicicleta) | `File:Parked bicycle in the streets of Amsterdam in spring of 2013.jpg` | CC BY-SA 3.0 | `fotos/10-bicicleta.jpg` (768×1024) |

## Cambios sobre la primera selección (con su motivo)

- **05 · Lasaña.** La primera candidata (`File:Lasagna plate.jpg`) resultó ser
  **una fuente entera de lasaña de berenjena sin porcionar**, no un plato
  servido. Se cambió por `File:Lasagna (1).jpg`, que es una porción sobre plato
  blanco. El plato final se ve como lasaña de carne con ricota y espinaca, lo
  cual **acerca la foto a la ficha del catálogo** (*Lasaña con carne y
  espinaca*); la predicción no se tocó porque el punto que se mide es la vía del
  match, no la variante de lasaña.
- **08 · Lentejas.** Se probó una alternativa
  (`...con chorizo y verduras cocidas lentamente.jpg`) y resultó ser **la olla
  en la hornalla a medio cocinar**, peor que la original. Se volvió a
  `File:Guiso de lentejas argentino con chorizo.jpg`.

## Salvedades de encuadre (para leer el informe con honestidad)

- **08 · Lentejas:** el cuadro es una mesa puesta completa — además del bol de
  lentejas hay pan, galletas de agua, limones, una botella de ají y un vaso.
  Es una foto realista de un almuerzo, no un plato aislado. **Cualquier ítem de
  más que devuelva la visión acá es correcto, no un error**, y así se juzga.
- **07 · Bife combinado:** además del bife, las papas y la ensalada de repollo,
  hay **kétchup y una jarrita de salsa**. También cuentan como aciertos.
- **03 · Paella:** es una paella de marisco fotografiada **en la paellera**, no
  emplatada, y se ve una cuchara sirviendo. Es como se sirve una paella.
- **09 · Arepa:** arepa de harina de trigo rellena de queso, sobre plato y
  servilleta. Foto un poco angulada (no cenital).

## Nota de infraestructura

Descargar los 10 originales en ráfaga hizo que `upload.wikimedia.org` devolviera
**HTTP 429 (too many requests)**. Los reemplazos se bajaron por
`thumb.wikimedia.org` con la URL de miniatura que devuelve la propia API, que es
lo que Wikimedia pide hacer. No afectó a ninguna de las 10 fotos finales.
