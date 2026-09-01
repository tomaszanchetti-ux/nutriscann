#!/usr/bin/env python3
"""Candados de la capa de curación. Falla (exit 1) si algo no cierra.

    python3 tools/verify_curation.py

Chequea:
  1. JSON estricto en los archivos de curacion (sin comas colgantes, sin claves repetidas).
  2. Cobertura exacta: un nombre por cada fdc_id de la seleccion COMPLETA
     (selection.v1.json + regional.v1.json), ni uno mas.
  3. Nombres unicos: dos alimentos distintos no pueden llamarse igual.
  4. Estilo: capitalizacion tipo oracion, sin punto final, sin marcadores USDA.
  5. Aliases: sin colision entre alimentos, sin chocar con el nombre de otro,
     sin palabra repetida y concordando en numero con su propia cabeza.
     Los aliases regionales (aliases.regional.json) entran al mismo censo: un
     alias con confianza tampoco puede pisar el nombre de otro alimento.
  6. Porciones: cubre TODAS las portion_needs_review (puede corregir mas, como
     las porciones de recetario >=200 g), con etiqueta de estilo uniforme.
  7. Confianza: cada alias regional usa uno de los cuatro peldanos declarados.
  8. TODA RESERVA ES VISIBLE: cada plato de los coverage con confianza < 1,0 tiene
     su alias emitido en aliases.regional.json con esa misma confianza. Una reserva
     que se queda en el archivo de medicion y no llega al catalogo no existe para
     el motor: es exactamente el agujero que dejo el gazpacho.
"""
from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True  # no ensuciar el repo con __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_aliases  # noqa: E402  (mismo directorio: comparte las reglas de concordancia)

HERE = Path(__file__).resolve().parent
CURATION = HERE.parent
SELECTION = CURATION.parent / "selection/selection.v1.json"
# La card 1.6 no reescribe la seleccion de la 1.1: le suma bloques con criterio
# propio y le resta las exclusiones de la DT-7. La curacion tiene que cubrir el
# resultado, no el primer archivo.
BLOQUES = [CURATION.parent / "selection/regional.v1.json",
           CURATION.parent / "selection/es.sweep.v1.json",
           CURATION.parent / "selection/ingredientes.v1.json",
           CURATION.parent / "selection/dt27.v1.json",
           CURATION.parent / "selection/dt33.v1.json"]
EXCLUSIONES = CURATION.parent / "selection/exclusions.dt7.json"
CONFIANZAS = (1, 0.8, 0.6, 0.5)
COVERAGE = [CURATION.parent / "selection/regional.coverage.json",
            CURATION.parent / "selection/es.sweep.coverage.json"]
MARKERS = re.compile(r"\bNFS\b|\bNS as to\b|\?\?", re.IGNORECASE)


def strict_load(path: Path):
    def no_dupes(pairs):
        dupes = [k for k, n in collections.Counter(k for k, _ in pairs).items() if n > 1]
        if dupes:
            raise ValueError(f"{path.name}: claves repetidas {dupes}")
        return dict(pairs)
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_dupes)


def sin_comentarios(mapa: dict) -> dict:
    """Los mapas planos por fdc_id admiten claves `$algo` como comentario.

    Es la misma regla que aplica el build (`esComentario` en kb/src/curation.ts):
    se saltea el prefijo `$` y NADA mas, asi que una clave mal tipeada sigue
    siendo un error de cobertura.
    """
    return {k: v for k, v in mapa.items() if not k.startswith("$")}


def main() -> int:
    errors: list[str] = []
    selection = strict_load(SELECTION)["entries"]
    for bloque in BLOQUES:
        if bloque.exists():
            selection = selection + strict_load(bloque)["entries"]
    heredados: dict[str, list[str]] = {}
    if EXCLUSIONES.exists():
        fuera = strict_load(EXCLUSIONES)["exclusions"]
        excluidos = {e["fdc_id"] for e in fuera}
        selection = [e for e in selection if e["fdc_id"] not in excluidos]
        for e in fuera:
            heredados.setdefault(str(e["duplicado_de"]), []).extend(e["aliases_heredados"])
    names = sin_comentarios(strict_load(CURATION / "names.es.json"))
    strict_load(CURATION / "glossary.es.json")
    portions = sin_comentarios(strict_load(CURATION / "portions.overrides.json"))
    regional_file = CURATION / "aliases.regional.json"
    regionales = strict_load(regional_file)["aliases"] if regional_file.exists() else {}

    expected = {str(e["fdc_id"]) for e in selection}
    faltan, sobran = expected - set(names), set(names) - expected
    if faltan:
        errors.append(f"faltan {len(faltan)} fdc_id en names.es.json: {sorted(faltan)[:5]}")
    if sobran:
        errors.append(f"sobran {len(sobran)} fdc_id en names.es.json: {sorted(sobran)[:5]}")

    seen: dict[str, str] = {}
    for fdc, entry in names.items():
        name = entry.get("name", "")
        if not name:
            errors.append(f"{fdc}: sin nombre")
            continue
        if name in seen:
            errors.append(f"nombre duplicado '{name}' ({seen[name]} y {fdc})")
        seen[name] = fdc
        if not name[0].isupper():
            errors.append(f"{fdc}: '{name}' no empieza en mayuscula")
        if name.endswith("."):
            errors.append(f"{fdc}: '{name}' termina en punto")
        if MARKERS.search(name):
            errors.append(f"{fdc}: '{name}' arrastra un marcador tecnico USDA")
        if not isinstance(entry.get("aliases"), list):
            errors.append(f"{fdc}: 'aliases' no es una lista")

    # --- aliases ---
    # Los regionales entran al MISMO censo que los de la card 1.3: un alias con
    # confianza que pisa el nombre de otro alimento rompe el matching igual de
    # feo que uno sin confianza. Lo unico que no se les exige es la concordancia
    # de genero y numero: son nombres propios de plato ("Milanesa a la
    # napolitana"), no sintagmas compuestos por el generador.
    todos: dict[str, list[tuple[str, bool]]] = {}
    for fdc, entry in names.items():
        todos.setdefault(fdc, []).extend((a, True) for a in entry.get("aliases", []))
    # El vocabulario que hereda una ficha que se queda tras una exclusion de la
    # DT-7 lo aplica el BUILD desde exclusions.dt7.json (una sola fuente de
    # verdad), pero tiene que entrar al mismo censo: si pisara el nombre de otro
    # alimento, el catalogo saldria con dos alimentos respondiendo a lo mismo.
    for fdc, lista in heredados.items():
        if fdc not in names:
            errors.append(f"{fdc}: hereda aliases pero no esta en la seleccion")
            continue
        for alias in lista:
            todos.setdefault(fdc, []).append((alias, False))

    for fdc, lista in regionales.items():
        if fdc not in names:
            errors.append(f"{fdc}: tiene alias regional pero no esta en la seleccion")
            continue
        for item in lista:
            alias, conf = item.get("alias", ""), item.get("confidence")
            if not alias:
                errors.append(f"{fdc}: alias regional sin texto")
                continue
            if conf not in CONFIANZAS:
                errors.append(f"{fdc}: '{alias}' tiene confianza {conf}, fuera de {CONFIANZAS}")
            todos.setdefault(fdc, []).append((alias, False))

    stems = build_aliases.adjective_stems()
    owner: dict[str, str] = {}
    for fdc, lista in todos.items():
        entry = names[fdc]
        for alias, concuerda in lista:
            if alias == entry["name"] and concuerda:
                # Un alias en texto plano igual al nombre no agrega nada. Uno
                # REGIONAL igual al nombre si: es el que carga la reserva.
                errors.append(f"{fdc}: alias igual al propio nombre ('{alias}')")
            if alias in seen and seen[alias] != fdc:
                errors.append(f"{fdc}: el alias '{alias}' es el NOMBRE de {seen[alias]}")
            if alias in owner and owner[alias] != fdc:
                errors.append(f"alias repetido '{alias}' en {owner[alias]} y {fdc}")
            owner[alias] = fdc
            if not concuerda:
                continue
            words = [w.lower().rstrip(",") for w in alias.split(" ")]
            if any(words[i] == words[i + 1] for i in range(len(words) - 1)):
                errors.append(f"{fdc}: '{alias}' repite una palabra")
            gender, plural = build_aliases.gender_number(words[0])
            for word in words[1:]:
                if word in build_aliases.PREPS:
                    break
                stem = word[:-2] if word.endswith(("os", "as")) else word[:-1] if word.endswith(("o", "a")) else None
                if stem not in stems:
                    continue
                if word.endswith("s") != plural:
                    errors.append(f"{fdc}: '{alias}' no concuerda en numero ('{word}')")
                if ("f" if word.rstrip("s").endswith("a") else "m") != gender:
                    errors.append(f"{fdc}: '{alias}' no concuerda en genero ('{word}')")

    # --- candado 8: toda reserva llega al catalogo ---
    # `veredicto` y `confianza` son ORTOGONALES a proposito: USDA puede nombrar el
    # plato (directo) y aun asi medir una receta que le falta algo (el gazpacho, a
    # 0,8). Lo que no puede pasar es que esa reserva se quede escrita solo en el
    # coverage. Cuando el alimento YA se llama como el plato, el alias homonimo con
    # su confianza es el unico lugar donde la reserva se puede decir.
    emitidos = {(fdc, a.get("alias")): a.get("confidence")
                for fdc, lista in regionales.items() for a in lista}
    for archivo in COVERAGE:
        if not archivo.exists():
            continue
        for fila in strict_load(archivo)["cobertura"]:
            conf, alias, fdc = fila.get("confianza"), fila.get("alias"), fila.get("fdc_id")
            if conf is None or alias is None or fdc is None:
                continue
            if conf not in CONFIANZAS:
                errors.append(f"{archivo.name}: '{fila['plato']}' tiene confianza {conf}, fuera de {CONFIANZAS}")
            if conf == 1:
                continue
            got = emitidos.get((str(fdc), alias))
            if got is None:
                errors.append(
                    f"{archivo.name}: '{fila['plato']}' declara confianza {conf} sobre fdc-{fdc} "
                    f"y el alias '{alias}' NO esta en aliases.regional.json: la reserva no llega al catalogo")
            elif got != conf:
                errors.append(
                    f"{archivo.name}: '{fila['plato']}' declara {conf} y el alias '{alias}' se emitio con {got}")

    # --- porciones ---
    needs = {str(e["fdc_id"]) for e in selection if e.get("portion_needs_review")}
    if not needs <= set(portions):
        errors.append(f"portion_needs_review sin corregir: {sorted(needs - set(portions))}")
    def revisar_label(fdc: str, label, contexto: str) -> None:
        if not isinstance(label, str) or not label:
            errors.append(f"{fdc}: falta {contexto}")
            return
        if label.endswith(".") or not (label[0].isdigit() or label[0].isupper()) or len(label) > 30:
            errors.append(f"{fdc}: {contexto} '{label}' rompe el estilo (mayuscula o numero, sin punto, <=30)")

    for fdc, ov in portions.items():
        if fdc not in {str(e["fdc_id"]) for e in selection}:
            errors.append(f"{fdc}: la porcion corrige un fdc_id que no esta en la seleccion")
        if not isinstance(ov.get("default_portion_g"), (int, float)) or ov["default_portion_g"] <= 0:
            errors.append(f"{fdc}: default_portion_g invalido")
            continue
        # Las porciones que AGREGA la curacion (card 6.2) traen su propia
        # etiqueta en espanol, y son obligatorias: una porcion curada existe para
        # nombrar una medida. Los gramos tienen que ser unicos entre ellas —dos
        # `1 cana` de 200 g no son dos porciones— y la de por defecto tiene que
        # estar nombrada por algun lado: por `label_es` o por una de estas.
        hints = ov.get("portion_hints", [])
        if not isinstance(hints, list):
            errors.append(f"{fdc}: portion_hints no es una lista")
            hints = []
        gramos_vistos = set()
        for i, hint in enumerate(hints):
            if not isinstance(hint, dict):
                errors.append(f"{fdc}: portion_hints[{i}] no es un objeto")
                continue
            g = hint.get("grams")
            if not isinstance(g, (int, float)) or g <= 0:
                errors.append(f"{fdc}: portion_hints[{i}] con gramos invalidos")
            elif g in gramos_vistos:
                errors.append(f"{fdc}: portion_hints repite los {g} g")
            else:
                gramos_vistos.add(g)
            if not hint.get("label_en"):
                errors.append(f"{fdc}: portion_hints[{i}] sin label_en")
            revisar_label(fdc, hint.get("label_es"), f"portion_hints[{i}].label_es")

        nombrada_por_hint = any(
            isinstance(h, dict) and h.get("grams") == ov["default_portion_g"] and h.get("label_es")
            for h in hints
        )
        if ov.get("label_es") or not nombrada_por_hint:
            revisar_label(fdc, ov.get("label_es"), "label_es")

    print(f"{len(names)}/{len(expected)} alimentos con nombre · "
          f"{len(set(seen))} nombres unicos · "
          f"{sum(len(e['aliases']) for e in names.values())} aliases "
          f"+ {sum(len(v) for v in regionales.values())} regionales con confianza "
          f"+ {sum(len(v) for v in heredados.values())} heredados de la DT-7 · "
          f"{len(needs & set(portions))}/{len(needs)} porciones obligatorias "
          f"+ {len(set(portions) - needs)} de recetario corregidas")
    for e in errors:
        print("  ERROR:", e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
