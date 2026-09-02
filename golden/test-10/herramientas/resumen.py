import json,glob,os
for p in sorted(glob.glob('respuestas/*.json')):
    d=json.load(open(p))
    print('='*78)
    print(os.path.basename(p),'| is_food:',d.get('is_food'),'| kb:',d['meta']['kb_version'])
    for it in d.get('items',[]):
        print(f"  · vision='{it['termino_en']}' {it['grams']}g conf_v={it['confidence_vision']}")
        print(f"    ficha: {it.get('name_es')} [{it.get('food_id')}] | via={it['match']} | conf_m={it['confidence_match']} | FINAL={it['confidence']}")
        n=it.get('nutrients')
        print(f"    kcal={n['kcal'] if n else None} | per100g_kcal={(it.get('per_100g') or {}).get('kcal')} | generic={it.get('generic')}")
        if it.get('caveats'): print('    caveats:',it['caveats'])
        print('    motivo:',it['motivo'][:230])
        if it.get('composicion'):
            c=it['composicion']
            print(f"    COMPOSICION metodo={c.get('metodo')} peso={c.get('peso_final_g')}")
            for comp in c.get('componentes',[]):
                print(f"       - {comp.get('termino_en')} {comp.get('grams')}g -> {comp.get('food_id')} {comp.get('name_es','')}")
    t=d.get('totals')
    if t: print(f"  TOTAL kcal={t['nutrients']['kcal']} | g={t['grams_total']} | items={t['items_incluidos']} sin_datos={t['items_sin_datos']} completo={t['completo']}")
    else: print("  TOTAL: null")
