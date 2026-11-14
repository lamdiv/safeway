"""Reproducible preparation of public CEMS vectors and Mapzen terrain tiles.
Never use post-event grading as an input to terrain-based screening.
"""
from pathlib import Path
import json, sqlite3, struct, math, hashlib, urllib.request, datetime, io, time
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data/raw'; OUT=ROOT/'public/data'; RAW.mkdir(exist_ok=True,parents=True); OUT.mkdir(exist_ok=True,parents=True)
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
def get(url,filename,data=None):
 p=RAW/filename
 if p.exists(): return p.read_bytes()
 req=urllib.request.Request(url,data=data,headers={'User-Agent':'HeadwaterResearchPrototype/0.1 (+public-data; hackathon)','Content-Type':'application/json' if data else 'application/octet-stream'})
 with urllib.request.urlopen(req,timeout=45) as r:
  b=r.read(); p.write_bytes(b)
  (RAW/(filename+'.metadata.json')).write_text(json.dumps({'url':url,'retrieved_at':NOW,'sha256':hashlib.sha256(b).hexdigest(),'content_type':r.headers.get('Content-Type'),'last_modified':r.headers.get('Last-Modified'),'terrain_sources':r.headers.get('x-amz-meta-x-imagery-sources')},indent=2))
 return b

def gpkg_geom(b):
 flags=b[3]; envelope=(flags>>1)&7; sizes={0:0,1:32,2:48,3:48,4:64}; offset=8+sizes[envelope]
 def wkb(o):
  endian='<' if b[o] else '>'; o+=1
  typ=struct.unpack_from(endian+'I',b,o)[0]; o+=4
  if typ==1:
   p=list(struct.unpack_from(endian+'dd',b,o)); return {'type':'Point','coordinates':p},o+16
  if typ==2:
   n=struct.unpack_from(endian+'I',b,o)[0]; o+=4
   pts=[list(struct.unpack_from(endian+'dd',b,o+i*16)) for i in range(n)]
   return {'type':'LineString','coordinates':pts},o+n*16
  if typ==3:
   n=struct.unpack_from(endian+'I',b,o)[0]; o+=4; rings=[]
   for _ in range(n):
    m=struct.unpack_from(endian+'I',b,o)[0]; o+=4
    rings.append([list(struct.unpack_from(endian+'dd',b,o+i*16)) for i in range(m)]); o+=m*16
   return {'type':'Polygon','coordinates':rings},o
  if typ in [4,5,6]:
   n=struct.unpack_from(endian+'I',b,o)[0]; o+=4; parts=[]
   for _ in range(n):
    part,o=wkb(o);parts.append(part['coordinates'])
   return {'type':{4:'MultiPoint',5:'MultiLineString',6:'MultiPolygon'}[typ],'coordinates':parts},o
  raise ValueError('Unsupported WKB '+str(typ))
 return wkb(offset)[0]

def dump(p,obj):
 (OUT/p).write_text(json.dumps(obj,separators=(',',':'),allow_nan=False))

c=sqlite3.connect(RAW/'cems-aoi01.zip'); c.row_factory=sqlite3.Row
layers={}
for table in ['areaOfInterestA_v1','builtUpP_v1','observedEventA_v1','transportationL_v1','transportationP_v1','transportationA_v1']:
 features=[]
 for row in c.execute('select * from '+table):
  r=dict(row); rawgeom=r.pop('geom'); fid=r.pop('fid')
  if rawgeom is None: continue
  g=gpkg_geom(rawgeom)
  features.append({'type':'Feature','id':str(fid),'geometry':g,'properties':r})
 layers[table]={'type':'FeatureCollection','features':features}
for filename,table in [('assessed-buildings.geojson','builtUpP_v1'),('observed-extent.geojson','observedEventA_v1'),('roads.geojson','transportationL_v1'),('bridges.geojson','transportationP_v1'),('aoi.geojson','areaOfInterestA_v1')]: dump(filename,layers[table])
# The assessments are damage-selected, not a complete building inventory.
assets=[]
for f in layers['builtUpP_v1']['features']:
 assets.append({'id':'CEMS-B'+f['id'].zfill(4),'name':'Assessed building '+f['id'].zfill(3),'kind':'building','coordinates':f['geometry']['coordinates'],'source':'cems-aoi01','inventory_basis':'post-event assessment selection','vulnerability':None,'geometry_quality':'point location, not footprint'})
for f in layers['transportationP_v1']['features']:
 assets.append({'id':'CEMS-R'+f['id'].zfill(3),'name':'Assessed crossing '+f['id'],'kind':'crossing','coordinates':f['geometry']['coordinates'],'source':'cems-aoi01','inventory_basis':'post-event assessment selection','vulnerability':None,'geometry_quality':'point location, not engineering survey'})
dump('assets.json',assets)
# A small real terrain window around the mapped Syabrubesi assessment area.
bbox=[85.311,28.140,85.361,28.197]; z=12; n=2**z
xt=lambda lon:(lon+180)/360*n*256
yt=lambda lat:(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n*256
x0=math.floor(xt(bbox[0]));x1=math.ceil(xt(bbox[2]));y0=math.floor(yt(bbox[3]));y1=math.ceil(yt(bbox[1]))
arr=np.empty((y1-y0,x1-x0),dtype=float)
urls=[]
for tx in range(x0//256,(x1-1)//256+1):
 for ty in range(y0//256,(y1-1)//256+1):
  url=f'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{tx}/{ty}.png'; urls.append(url)
  print('Terrain',tx,ty,flush=True)
  im=np.asarray(Image.open(io.BytesIO(get(url,f'terrain-{z}-{tx}-{ty}.png'))).convert('RGB'),dtype=float)
  elevation=im[:,:,0]*256+im[:,:,1]+im[:,:,2]/256-32768
  xa=max(x0,tx*256);xb=min(x1,(tx+1)*256);ya=max(y0,ty*256);yb=min(y1,(ty+1)*256)
  arr[ya-y0:yb-y0,xa-x0:xb-x0]=elevation[ya-ty*256:yb-ty*256,xa-tx*256:xb-tx*256]
lon=lambda px:px/(n*256)*360-180
lat=lambda py:math.degrees(math.atan(math.sinh(math.pi*(1-2*py/(n*256)))))
grid={'width':arr.shape[1],'height':arr.shape[0],'bbox':[lon(x0),lat(y1),lon(x1),lat(y0)],'elevation':np.round(arr,2).ravel().tolist(),'cellSizeM':round(40075016.686/(n*256)*math.cos(math.radians(28.17)),2),'source':'mapzen-terrain','urls':urls,'verticalDatum':'Mixed source terrain; see tile headers','observation_time':None,'retrieved_at':NOW,'limitations':['Approximately 34 m sample spacing; underlying source includes SRTM.','Historical terrain, not a post-flood ground survey.','Individual-building depth and structural loads are unresolved.']}
dump('terrain.json',grid)
# Offline hillshade, generated from real elevations rather than a decorative image.
gy,gx=np.gradient(arr,grid['cellSizeM']); slope=np.arctan(np.sqrt(gx*gx+gy*gy)); aspect=np.arctan2(-gx,gy)
shade=np.clip(np.cos(math.pi/4)*np.cos(slope)+np.sin(math.pi/4)*np.sin(slope)*np.cos(math.radians(315)-aspect),0,1)
norm=np.clip((arr-arr.min())/(arr.max()-arr.min()),0,1)
base=np.stack([204-30*norm,215-36*norm,203-31*norm],axis=-1)
rgb=np.clip(base*(.65+.45*shade[:,:,None]),0,255).astype('uint8')
Image.fromarray(rgb).resize((arr.shape[1]*4,arr.shape[0]*4),Image.Resampling.BICUBIC).save(OUT/'terrain.png')
# Independent catalogue metadata: recorded request can fail without inventing scenes.
try:
 url='https://earth-search.aws.element84.com/v1/search'
 payload=json.dumps({'collections':['sentinel-2-l2a'],'bbox':[85.30,28.13,85.55,28.31],'datetime':'2026-08-01T00:00:00Z/2026-09-15T23:59:59Z','limit':30}).encode()
 stac=json.loads(get(url,'stac-scenes.json',payload))
 scenes=[{'id':f['id'],'captured_at':f['properties'].get('datetime'),'cloud_cover':f['properties'].get('eo:cloud_cover'),'bbox':f.get('bbox'),'thumbnail':f.get('assets',{}).get('thumbnail',{}).get('href'),'visual':f.get('assets',{}).get('visual',{}).get('href'),'self':next((l['href'] for l in f.get('links',[]) if l['rel']=='self'),None)} for f in stac.get('features',[])]
 dump('satellite-catalogue.json',{'source':url,'retrieved_at':NOW,'status':'retrieved','scenes':scenes})
 print('STAC scenes',len(scenes),flush=True)
except Exception as e:
 dump('satellite-catalogue.json',{'source':'https://earth-search.aws.element84.com/v1/search','status':'unavailable','error':str(e),'scenes':[]})
 print('STAC unavailable',e,flush=True)
manifest={'prepared_at':NOW,'files':{},'raw_gpkg_sha256':hashlib.sha256((RAW/'cems-aoi01.zip').read_bytes()).hexdigest(),'assets':len(assets),'assessment_selection':'CEMS affected-asset assessment, not all buildings in the valley','source_imagery':[{'sensor':'Pleiades Neo','captured_at':'2025-11-29T05:11:00Z','role':'pre-event reference','pixel_size_m':0.3},{'sensor':'WorldView-3','captured_at':'2026-08-27T05:05:00Z','role':'post-event grading','pixel_size_m':0.3}],'provider':'Copernicus EMS Rapid Mapping EMSR927 AOI01 GRA PRODUCT v1','download_url':'https://rapidmapping.emergency.copernicus.eu/backend/EMSR927/AOI01/GRA_PRODUCT/EMSR927_AOI01_GRA_PRODUCT_v1.zip?type=gpkg','license_url':'https://emergency.copernicus.eu/mapping/ems/terms-and-conditions','source_table':[dict(r) for r in c.execute('select * from source_v1')]}
for p in sorted(OUT.rglob('*')):
 if p.is_file() and p.name!='manifest.json': manifest['files'][str(p.relative_to(OUT))]={'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size}
dump('manifest.json',manifest)
print('Prepared',len(assets),'assets;',grid['width'],'x',grid['height'],'terrain cells',flush=True)
