"""Fill the Houston drills with Vexcel building data (Vexcel API 2.0, property elements + ortho imagery).

What Vexcel gives this key (checked 2026-11-15): parcels and building structures with a footprint polygon,
the ground elevation at the building (metres, quantised to whole feet), building type and, where measured,
roof height and stories; plus 7.5 cm ortho imagery. It does NOT give a terrain raster (the DSM/DTM layers
answer 403) or any flood depth. So the terrain under the flood stays USGS 3DEP 5 m, and Vexcel adds:
  * an independent check of that terrain at every building (Vexcel ground vs 3DEP ground),
  * real building footprints, each with the flood depth at the building:
      water surface = 3DEP ground + modelled depth (FwDET grid, public/data/floods/<id>/depth.bin)
      padDepthFt = water surface - Vexcel ground elevation
  * an ortho photo centred on each drill resident's start point (residents start on deep cells, often a
    street or channel, so the nearest footprint is reported as "nearest building", not as their home).
Zones on the footprints follow the drill's depth grid. padDepthFt is the alternative depth if the building
sits at Vexcel's ground elevation: Vexcel is ~2 ft above 3DEP in the median, consistent with raised building
pads but not proven (it could also be a datum or surface-model difference), so it is reported, not used.

Outputs (public/data/vexcel/): houston-<id>.geojson (footprints), houston-<id>.json (summary + check),
houston-<id>-<a|b|c>.jpg (home photos). Imagery and building data © Vexcel Imaging US, Inc.
Needs VEXCEL_API_KEY in the environment (.env). Run: set -a; . ./.env; set +a; python3 -I scripts/vexcel-houston.py
"""
import importlib.util, json, math, os, random, subprocess, sys, tempfile, time
import numpy as np
from shapely import wkt as shapely_wkt
from shapely.geometry import mapping, shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('floods', os.path.join(ROOT, 'scripts', 'houston-floods.py'))
floods = importlib.util.module_from_spec(spec); spec.loader.exec_module(floods)

API = 'https://api.vexcelgroup.com/v2'
KEY = os.environ.get('VEXCEL_API_KEY') or sys.exit('VEXCEL_API_KEY is not set (put it in .env and run: set -a; . ./.env; set +a)')
LAYERS = 'urban,urban-r,wide-area,urban-g'
RADIUS_M = 250  # buildings around each resident
OUT = os.path.join(ROOT, 'public', 'data', 'vexcel')
FT = 3.28084

# The key goes in a header file so it never appears in the process list or in logs.
HDR = tempfile.NamedTemporaryFile('w', delete=False, suffix='.hdr'); HDR.write(f'X-API-KEY: {KEY}\n'); HDR.close(); os.chmod(HDR.name, 0o600)

def call(method, path, params=None, body=None, out=None):
    """curl the API with 429 backoff. Returns (status, bytes)."""
    for attempt in range(6):
        args = ['curl', '-s', '-m', '180', '-H', '@' + HDR.name, '-w', '\n%{http_code}', '-X', method]
        if params:
            args += ['-G'] + [a for k, v in params.items() for a in ('--data-urlencode', f'{k}={v}')]
        if body is not None:
            args += ['-H', 'Content-Type: application/json', '--data-binary', json.dumps(body)]
        raw = subprocess.run(args + [f'{API}/{path}'], capture_output=True).stdout
        data, _, code = raw.rpartition(b'\n'); code = int(code or 0)
        if code != 429: return code, data
        time.sleep(min(2 ** attempt, 30) + random.random())
    return code, data

def buildings_near(lon, lat):
    feats, page = [], 1
    while True:
        code, data = call('GET', 'property/extract', {'wkt': f'POINT({lon} {lat})', 'buffer-meter': RADIUS_M, 'srid': 4326, 'layer': LAYERS,
                                                      'latest': 'true', 'include': 'precomputed', 'unit-system': 'metric', 'page-size': 500, 'page': page})
        if code == 404: return feats
        if code == 401: sys.exit('401: Vexcel rejected the key')
        if code != 200: raise RuntimeError(f'property/extract {code}: {data[:300]!r}')
        got = json.loads(data)['features']; feats += got
        if len(got) < 500: return feats
        page += 1

def num(v):
    return None if v in (None, '') else float(v)

def run(sid):
    meta = json.load(open(os.path.join(ROOT, 'public', 'data', 'floods', sid, 'meta.json')))
    bbox = floods.SCENARIOS[sid]['bbox']; dem, (x0, y0, x1, y1) = floods.dem_for(sid, bbox)
    w, h = meta['size']; raw = np.fromfile(os.path.join(ROOT, 'public', 'data', 'floods', sid, 'depth.bin'), dtype='<u2').reshape(h, w)
    if dem.shape != (h, w): raise SystemExit(f'{sid}: DEM {dem.shape} does not match the depth grid {(h, w)}')
    def cell(lon, lat):
        x, y = floods.merc(lon, lat); c, r = int((x - x0) / (x1 - x0) * w), int((y1 - y) / (y1 - y0) * h)
        return (r, c) if 0 <= r < h and 0 <= c < w else None
    seen, rows = set(), []
    for p in meta['people']:
        for f in buildings_near(*p['start']):
            for s in f['properties'].get('structures', []):
                fp = s.get('footprint.wkt'); g = num(s.get('ground-elevation.value'))
                if not fp or g is None or fp in seen: continue
                seen.add(fp); poly = shapely_wkt.loads(fp); c = poly.centroid; rc = cell(c.x, c.y)
                if not rc: continue
                ground3dep = float(dem[rc]); v = int(raw[rc]); depth = (v - 1) / 10 if v else None
                if not (-50 < ground3dep < 500): continue
                row = {'geometry': mapping(poly), 'vexcelGroundM': round(g, 2), 'dep3GroundM': round(ground3dep, 2),
                       'heightM': num(s.get('roof-characteristics.maximum-roof-height')), 'stories': num(s.get('roof-characteristics.number-of-stories-below-eave')),
                       'type': f['properties'].get('building-type.class') or s.get('building-type.class'), 'areaM2': round(num(s.get('footprint.area')) or poly.area, 1)}
                if depth is not None:
                    wse = ground3dep + depth / FT
                    row['gridDepthFt'] = depth; row['padDepthFt'] = round(max(0.0, (wse - g) * FT), 1)
                rows.append(row)
    diff = np.array([(r['vexcelGroundM'] - r['dep3GroundM']) * FT for r in rows])
    zone = lambda d: 'high' if d >= 3 else 'medium' if d >= 1 else 'low' if d > 0 else 'dry'
    feats = []
    for r in rows:
        d = r.get('gridDepthFt'); props = {k: v for k, v in r.items() if k != 'geometry' and v is not None}
        props['zone'] = zone(d) if d is not None else 'dry'; props['gridDepthFt'] = d or 0  # zones follow the drill's depth grid
        feats.append({'type': 'Feature', 'geometry': r['geometry'], 'properties': props})
    os.makedirs(OUT, exist_ok=True)
    json.dump({'type': 'FeatureCollection', 'features': feats}, open(os.path.join(OUT, f'houston-{sid}.geojson'), 'w'), separators=(',', ':'))
    homes = []
    for i, p in enumerate(meta['people']):
        lon, lat = p['start']; home = min(rows, key=lambda r: shape(r['geometry']).centroid.distance(shape({'type': 'Point', 'coordinates': [lon, lat]})), default=None)
        code, img = call('POST', 'ortho/extract', body={'wkt': f'POINT({lon} {lat})', 'srid': 4326, 'layer': LAYERS, 'buffer-meter': 45, 'crop': 'bounding_box',
                                                         'image-format': 'jpeg', 'destination-dimensions': '480,480',
                                                         'drawing': [{'wkt': f'POINT({lon} {lat})', 'outline-color': 'rgb(214,69,65)', 'outline-width': 6, 'buffer-meter': 6}]})
        photo = None
        if code == 200 and img[:2] == b'\xff\xd8':
            photo = f'houston-{sid}-{"abc"[i]}.jpg'; open(os.path.join(OUT, photo), 'wb').write(img)
        else:
            print(f'  {sid} {"abc"[i]}: ortho {code} {img[:160]!r}')
        homes.append({'person': 'abc'[i], 'start': p['start'], 'gridDepthFt': p.get('depthFt'), 'photo': photo,  # photo is centred on the start point
                      'nearestBuilding': None if home is None else {k: home.get(k) for k in ('type', 'vexcelGroundM', 'dep3GroundM', 'gridDepthFt', 'padDepthFt', 'heightM', 'stories', 'areaM2')}})
    flooded = [f['properties'] for f in feats if f['properties']['zone'] != 'dry']
    pad = [f['properties'] for f in feats if f['properties'].get('padDepthFt', 0) > 0]
    summary = {'scenario': sid, 'radiusM': RADIUS_M, 'buildings': len(feats), 'flooded': len(flooded),
               'byZone': {z: sum(1 for f in feats if f['properties']['zone'] == z) for z in ('high', 'medium', 'low', 'dry')},
               'wetAtVexcelGround': len(pad),
               'terrainCheck': {'n': int(diff.size), 'meanDiffFt': round(float(diff.mean()), 2), 'meanAbsDiffFt': round(float(abs(diff).mean()), 2),
                                'medianAbsDiffFt': round(float(np.median(abs(diff))), 2), 'within1Ft': round(float((abs(diff) <= 1).mean()), 3),
                                'note': 'Vexcel building ground elevation minus USGS 3DEP 5 m bare earth at the footprint centroid. Vexcel reports whole feet.'},
               'homes': homes, 'source': 'Vexcel API 2.0 property elements and ortho imagery (© Vexcel Imaging US, Inc.); USGS 3DEP; SafeWay FwDET depth grid',
               'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}
    json.dump(summary, open(os.path.join(OUT, f'houston-{sid}.json'), 'w'), indent=1)
    print(json.dumps({k: summary[k] for k in ('scenario', 'buildings', 'flooded', 'byZone', 'terrainCheck')}))

if __name__ == '__main__':
    try:
        for sid in (sys.argv[1:] or ['harvey', 'downtown', 'brays']): run(sid)
    finally:
        os.unlink(HDR.name)
