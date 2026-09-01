import json,sys,unicodedata
D=json.load(open('/Users/tzanchetti/Documents/Proyectos Claudio/NutriScann/nutriscann/kb/build/foods.canonical.json'))['foods']
def norm(s):
    s=unicodedata.normalize('NFD',s.lower())
    return ''.join(c for c in s if unicodedata.category(c)!='Mn')
def als(f):
    out=[]
    for a in (f.get('aliases') or {}).get('es',[]) or []:
        out.append(a if isinstance(a,str) else f"{a.get('alias')}~{a.get('confidence')}")
    return out
for q in sys.argv[1:]:
    qn=norm(q); print(f"\n### {q}")
    n=0
    for f in D:
        hay=[f['names'].get('en') or '', f['names'].get('es') or '']+als(f)
        if any(qn in norm(h) for h in hay):
            n+=1
            if n<=14:
                print(f"  {f['id']} | EN: {f['names'].get('en')} | ES: {f['names'].get('es')} | kcal/100g {f['per_100g']['kcal']} | gen={f.get('generic')} | dp={f.get('default_portion_g')} | alias={als(f)}")
    print(f"  -> total {n}")
