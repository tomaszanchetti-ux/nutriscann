#!/usr/bin/env python3
"""Busca fichas en el catálogo canónico. Solo lectura. Uso: python3 buscar.py "termino" [...]"""
import json, sys, unicodedata

CAT = '/Users/tzanchetti/Documents/Proyectos Claudio/NutriScann/nutriscann/kb/build/foods.canonical.json'

def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in s).split())

foods = json.load(open(CAT))['foods']

def alias_list(f):
    a = f.get('aliases') or {}
    out = []
    for v in (a.get('es') or []):
        out.append(v if isinstance(v, str) else str(v))
    for v in (a.get('en') or []):
        out.append(v if isinstance(v, str) else str(v))
    return out

for q in sys.argv[1:]:
    nq = norm(q)
    print(f'\n===== {q} =====')
    hits = []
    for f in foods:
        blob = ' | '.join(filter(None, [f['names'].get('en'), f['names'].get('es')] + alias_list(f)))
        if nq in norm(blob):
            hits.append(f)
    for f in hits[:25]:
        p = f['per_100g']
        print(f"{f['id']:28} | EN: {f['names'].get('en')}")
        print(f"{'':28} | ES: {f['names'].get('es')}  | {p.get('kcal')} kcal/100g | cat={f.get('category')} | generic={f.get('generic')} | receta={f.get('source')=='receta'} | def_g={f.get('default_portion_g')}")
        al = alias_list(f)
        if al:
            print(f"{'':28} | alias: {al}")
    print(f'--- {len(hits)} hits')
