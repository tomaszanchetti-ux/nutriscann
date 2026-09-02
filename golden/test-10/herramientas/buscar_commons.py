import json,sys,urllib.request,urllib.parse
UA="NutriScann-QA/0.1 (test local)"
def q(term,limit=8):
    p=urllib.parse.urlencode({"action":"query","format":"json","generator":"search",
      "gsrsearch":f"filetype:bitmap {term}","gsrnamespace":"6","gsrlimit":str(limit),
      "prop":"imageinfo","iiprop":"url|size|extmetadata","iiurlwidth":"1200"})
    r=urllib.request.Request("https://commons.wikimedia.org/w/api.php?"+p,headers={"User-Agent":UA})
    d=json.load(urllib.request.urlopen(r,timeout=30))
    print(f"\n### {term}")
    for pg in (d.get('query',{}).get('pages') or {}).values():
        ii=pg['imageinfo'][0]; em=ii.get('extmetadata',{})
        lic=em.get('LicenseShortName',{}).get('value','?')
        aut=em.get('Artist',{}).get('value','?')[:60].replace('\n',' ')
        print(f"  {pg['title']} | {ii['width']}x{ii['height']} | {lic} | {ii.get('thumburl',ii['url'])}")
for t in sys.argv[1:]: q(t)
