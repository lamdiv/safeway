from pathlib import Path
import urllib.request,concurrent.futures,json,math,shutil
root=Path(__file__).resolve().parents[1]; target=root/'public/data/tiles/12'; target.mkdir(parents=True,exist_ok=True)
def fetch(pair):
 x,y=pair; path=target/str(x)/f'{y}.png';path.parent.mkdir(exist_ok=True)
 src=root/'data/raw'/f'terrain-12-{x}-{y}.png'
 if path.exists():return str(path.relative_to(root))
 if src.exists():shutil.copy2(src,path)
 else:
  url=f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/12/{x}/{y}.png'
  req=urllib.request.Request(url,headers={'User-Agent':'HeadwaterResearchPrototype/0.2'})
  with urllib.request.urlopen(req,timeout=30) as r:path.write_bytes(r.read())
 return str(path.relative_to(root))
# Regional context includes the published source and the study window.
pairs=[(x,y) for x in range(3017,3023) for y in range(1711,1716)]
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
 for f in ex.map(fetch,pairs):print(f,flush=True)
lon=lambda x:x/4096*360-180
lat=lambda y:math.degrees(math.atan(math.sinh(math.pi*(1-2*y/4096))))
(root/'public/data/terrain-tiles.json').write_text(json.dumps({'encoding':'terrarium','tileSize':256,'minzoom':12,'maxzoom':12,'bounds':[lon(3017),lat(1716),lon(3023),lat(1711)],'attribution':'Mapzen Terrain Tiles / SRTM, GMTED; historical elevations','source':'https://registry.opendata.aws/terrain-tiles/','tiles':['/data/tiles/{z}/{x}/{y}.png'],'purpose':'Regional 3D context. Asset screening remains restricted to its analytical grid.'}))
