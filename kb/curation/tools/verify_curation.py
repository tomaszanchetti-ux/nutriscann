#!/usr/bin/env python3
"""Candados de la capa de curación. Falla (exit 1) si algo no cierra.

    python3 tools/verify_curation.py

Chequea:
  1. JSON estricto en los cuatro archivos (sin comas colgantes, sin claves repetidas).
  2. Cobertura exacta: un nombre por cada fdc_id de selection.v1.json, ni uno mas.
  3. Nombres unicos: dos alimentos distintos no pueden llamarse igual.
  4. Estilo: capitalizacion tipo oracion, sin punto final, sin marcadores USDA.
  5. Aliases: sin colision entre alimentos, sin chocar con el nombre de otro,
     sin palabra repetida y concordando en numero con su propia cabeza.
  6. Porciones: cubre TODAS las portion_needs_review (puede corregir mas, como
     las porciones de recetario >=200 g), con etiqueta de estilo uniforme.
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
MARKERS = re.compile(r"\bNFS\b|\bNS as to\b|\?\?", re.IGNORECASE)


def strict_load(path: Path):
    def no_dupes(pairs):
        dupes = [k for k, n in collections.Counter(k for k, _ in pairs).items() if n > 1]
        if dupes:
            raise ValueError(f"{path.name}: claves repetidas {dupes}")
        return dict(pairs)
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=no_dupes)


def main() -> int:
    errors: list[str] = []
    selection = strict_load(SELECTION)["entries"]
    names = strict_load(CURATION / "names.es.json")
    strict_load(CURATION / "glossary.es.json")
    portions = strict_load(CURATION / "portions.overrides.json")

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
    stems = build_aliases.adjective_stems()
    owner: dict[str, str] = {}
    for fdc, entry in names.items():
        for alias in entry.get("aliases", []):
            if alias == entry["name"]:
                errors.append(f"{fdc}: alias igual al propio nombre ('{alias}')")
            if alias in seen and seen[alias] != fdc:
                errors.append(f"{fdc}: el alias '{alias}' es el NOMBRE de {seen[alias]}")
            if alias in owner and owner[alias] != fdc:
                errors.append(f"alias repetido '{alias}' en {owner[alias]} y {fdc}")
            owner[alias] = fdc
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

    # --- porciones ---
    needs = {str(e["fdc_id"]) for e in selection if e.get("portion_needs_review")}
    if not needs <= set(portions):
        errors.append(f"portion_needs_review sin corregir: {sorted(needs - set(portions))}")
    for fdc, ov in portions.items():
        if fdc not in {str(e["fdc_id"]) for e in selection}:
            errors.append(f"{fdc}: la porcion corrige un fdc_id que no esta en la seleccion")
        if not isinstance(ov.get("default_portion_g"), (int, float)) or ov["default_portion_g"] <= 0:
            errors.append(f"{fdc}: default_portion_g invalido")
        label = ov.get("label_es", "")
        if not label:
            errors.append(f"{fdc}: falta label_es")
        elif label.endswith(".") or not (label[0].isdigit() or label[0].isupper()) or len(label) > 30:
            errors.append(f"{fdc}: label_es '{label}' rompe el estilo (mayuscula o numero, sin punto, <=30)")

    print(f"{len(names)}/{len(expected)} alimentos con nombre · "
          f"{len(set(seen))} nombres unicos · "
          f"{sum(len(e['aliases']) for e in names.values())} aliases · "
          f"{len(needs & set(portions))}/{len(needs)} porciones obligatorias "
          f"+ {len(set(portions) - needs)} de recetario corregidas")
    for e in errors:
        print("  ERROR:", e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
