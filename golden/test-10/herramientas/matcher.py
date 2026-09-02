# Réplica fiel del matcher (engine/{normalize,catalog,match}.ts) sobre el canonical.
# Solo LECTURA del repo. Sirve para (a) validar contra la salida real del backend
# y (b) correr contrafácticos sin gastar llamadas a la API.
import json,unicodedata,re,sys
CAN='/Users/tzanchetti/Documents/Proyectos Claudio/NutriScann/nutriscann/kb/build/foods.canonical.json'
COBERTURA_MIN=0.30; DIFUSA_MAX=0.6; GENERICO=0.85
def normalizar(t):
    if not isinstance(t,str): return ""
    t=unicodedata.normalize('NFD',t)
    t=''.join(c for c in t if unicodedata.category(c)!='Mn').lower()
    return re.sub(r'[^a-z0-9]+',' ',t).strip()
def contiene(pajar,aguja):
    return bool(aguja) and bool(pajar) and (f" {aguja} " in f" {pajar} ")
def empieza(pajar,aguja):
    return bool(aguja) and bool(pajar) and (pajar==aguja or pajar.startswith(aguja+" "))
GUARDAS=[{"termino":"chorizo","prohibido_en":["fdc-2705835"],"salvo":[]},
         {"termino":"pepinillos","prohibido_en":["fdc-169378"],"salvo":["dulces"]}]
def viola(q,fid):
    for g in GUARDAS:
        if fid not in g["prohibido_en"]: continue
        if not empieza(q,g["termino"]): continue
        if any(contiene(q,normalizar(p)) for p in g["salvo"]): continue
        return g
    return None
D=json.load(open(CAN)); FOODS=D['foods']; KB=D['kb_version']
porId={f['id']:f for f in FOODS}
activas=sorted([f for f in FOODS if not f.get('deprecated')],key=lambda f:f['id'])
exactoEn={};exactoEs={};difEn=[];difEs=[]
def agregar(e):
    if not e['clave']: return
    m = exactoEn if e['idioma']=='en' else exactoEs
    l = difEn if e['idioma']=='en' else difEs
    if e['clave'] in m: return
    m[e['clave']]=e; l.append(e)
for f in activas:
    agregar({'clave':normalizar(f['names']['en']),'texto':f['names']['en'],'food_id':f['id'],'confianza':1,'idioma':'en','campo':'names.en'})
    if f['names'].get('es'):
        agregar({'clave':normalizar(f['names']['es']),'texto':f['names']['es'],'food_id':f['id'],'confianza':1,'idioma':'es','campo':'names.es'})
    for a in (f.get('aliases') or {}).get('es',[]) or []:
        txt = a if isinstance(a,str) else a.get('alias')
        conf = 1.0 if isinstance(a,str) else float(a.get('confidence',1.0))
        agregar({'clave':normalizar(txt),'texto':txt,'food_id':f['id'],'confianza':conf,'idioma':'es','campo':'alias'})
for l in (difEn,difEs): l.sort(key=lambda e:(-len(e['clave']),e['food_id']))
def difuso_idx(q,lista):
    mejorA=mejorB=None
    for e in lista:
        if viola(q,e['food_id']): continue
        if contiene(q,e['clave']):
            cob=len(e['clave'])/len(q)
            if cob>=COBERTURA_MIN and (mejorA is None or cob>mejorA[1]):
                mejorA=(e,cob,'nombre_en_consulta',DIFUSA_MAX*cob*e['confianza'])
            continue
        if empieza(e['clave'],q):
            cob=len(q)/len(e['clave'])
            if cob>=COBERTURA_MIN and (mejorB is None or cob>mejorB[1]):
                mejorB=(e,cob,'consulta_en_nombre',DIFUSA_MAX*cob*e['confianza'])
    return mejorA or mejorB
def buscar(term):
    q=normalizar(term)
    if not q: return None
    def desde(e,nivel,conf,motivo):
        f=porId.get(e['food_id'])
        if f is None or f.get('deprecated'): return None
        if viola(q,f['id']): return None
        return {'ficha':f,'nivel':nivel,'conf':round(conf,3),'termino':e['texto'],'motivo':motivo}
    if q in exactoEn:
        r=desde(exactoEn[q],'exacto',1,'exacto EN')
        if r: return r
    if q in exactoEs:
        e=exactoEs[q]; r=desde(e,'alias',e['confianza'],f"exacto ES ({e['campo']}, conf {e['confianza']})")
        if r: return r
    a=difuso_idx(q,difEn); b=difuso_idx(q,difEs)
    ganador = b if (a is None) else (a if b is None else (b if b[3]>a[3] else a))
    perdedor = b if ganador is a else a
    for c in (ganador,perdedor):
        if c is None: continue
        e,cob,dirn,conf=c
        r=desde(e,'difuso',conf,f"difuso {e['idioma']} vs '{e['texto']}' ({dirn}, cobertura {round(cob,2)})")
        if r: return r
    return None
def reportar(term,conf_vision=None):
    r=buscar(term)
    if r is None:
        print(f"  '{term}'  ->  SIN MATCH")
        return
    f=r['ficha']; gen=f.get('generic') is True
    cm=round(r['conf']*(GENERICO if gen else 1),3)
    fin='' if conf_vision is None else f" | FINAL={round(conf_vision*cm,3)}"
    print(f"  '{term}'  ->  {f['names']['es']} [{f['id']}] | {r['nivel']} | conf_m={cm}{' (gen×0.85)' if gen else ''}{fin} | {f['per_100g']['kcal']} kcal/100g")
    print(f"        {r['motivo']}")
if __name__=='__main__':
    for t in sys.argv[1:]: reportar(t)
