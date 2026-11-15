"""Build the three Houston flood scenarios: one historical, two hypothetical, in different parts of the city.

  harvey    Hurricane Harvey (August 2017), Kingwood / Lake Houston. Extent: FEMA Harvey inundation
            boundaries for Harris County (from HCFCD/USGS high-water marks), HydroShare
            doi:10.4211/hs.e8768f4cb4d5478a96d2b1cbd00d9e85 (CC BY 4.0), file Harris_AOIandBoundaries.zip.
  downtown  Hypothetical flash flood on Buffalo and White Oak Bayous, downtown. Extent: FEMA NFHL
            0.2% annual-chance (500-year) area, Harris County 48201C.
  brays     Hypothetical flash flood on Brays Bayou, Meyerland. Extent: FEMA NFHL 1% annual-chance
            (100-year) area; the 0.2% area here covers nearly the whole window, leaving FwDET no edge to use.

Depth for every scenario: FwDET (Cohen et al. 2018) on the extent, with USGS 3DEP bare-earth elevation
at 5 m: the water surface is the ground elevation at the nearest edge of the flood, smoothed, minus the
ground. It is an estimate, not a surveyed or official depth grid.

Outputs per scenario in public/data/floods/<id>/: meta.json, depth.bin (uint8 per cell: 0 dry, otherwise
1 + depth in tenths of a foot, capped at 254; the browser animates and extrudes the water in 3D from it)
and zones.png (high > 3 ft, medium 1-3 ft, low < 1 ft).
The county-wide depth map behind the Flood map button is built separately by houston-county-flood.py.

Run: python3 -I scripts/houston-floods.py   (curl does the downloads; raw files go to data/raw/, git-ignored)
"""
import json, math, os, subprocess, time
from datetime import datetime, timezone
import numpy as np
import shapefile
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import shape, box, mapping
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')
OUT = os.path.join(ROOT, 'public', 'data', 'floods')
RES = 5
FT = 3.28084
DEM_URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage'
FEMA_URL = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0/query'
HARVEY_URL = 'http://www.hydroshare.org/resource/e8768f4cb4d5478a96d2b1cbd00d9e85/data/contents/NHRAP_depths/Harris_AOIandBoundaries.zip'
THRESHOLDS = [12, 9, 7, 5.5, 4.5, 3.5, 2.7, 2.0, 1.4, 0.9, 0.5, 0.0]  # ft; the water level passes these thresholds 8 s apart (src/demo/raster-flood.mjs)
LEVELS = [(1, 0, 1, '#cfe9f6'), (2, 1, 2, '#a3d3ee'), (3, 2, 3, '#72b9e3'), (4, 3, 4, '#4799d3'),
          (5, 4, 5, '#2b79bf'), (6, 5, 6, '#1d58a2'), (7, 6, None, '#123a78')]
ZONES = [('high', 3, None, '#d64541'), ('medium', 1, 3, '#f2c12e'), ('low', 0, 1, '#3fae5a')]  # red / yellow / green
SCENARIOS = {
    'harvey': {'bbox': (-95.235, 30.025, -95.170, 30.070), 'source': 'harvey'},
    'downtown': {'bbox': (-95.395, 29.745, -95.340, 29.782), 'source': 'fema'},
    'brays': {'bbox': (-95.480, 29.678, -95.415, 29.718), 'source': 'fema', 'sfhaOnly': True, 'smooth': 101},
    # Artificial drill (deliberately not realistic): water rises out of Lake Carnegie and Stony Brook
    # (OpenStreetMap) until it reaches Rabinowitz Hall with ~2 ft of water, about 47 m above the lake. Connected-bathtub model on 3DEP: a cell floods when it is lower
    # than the water level AND connected to the lake/river through other flooded cells.
    'princeton': {'bbox': (-74.680, 40.330, -74.630, 40.372), 'source': 'bathtub', 'seedNames': ['Lake Carnegie', 'Stony Brook'],
                  'target': (-74.65547, 40.34909), 'targetDepthFt': 2.0,
                  'people': [((-74.65547, 40.34909), (-74.66402, 40.34917)), ((-74.65528, 40.34916), (-74.66402, 40.34917))]},  # assembly: nearest dry high ground (66.5 m) at least 100 m from the water
}

def merc(lon, lat): return lon * 20037508.34 / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * 6378137
def unmerc(x, y): return x * 180 / 20037508.34, math.degrees(2 * math.atan(math.exp(y / 6378137)) - math.pi / 2)

def curl(args, out, ok):
    for _ in range(6):
        subprocess.run(['curl', '-sL', '-m', '300', *args, '-o', out], check=False)
        if os.path.exists(out) and ok(out): return
        time.sleep(5)
    raise SystemExit('Download failed: ' + out)

def dem_for(sid, bbox, n=3):
    cache = os.path.join(RAW, 'dem', sid); os.makedirs(cache, exist_ok=True)
    x0, y0 = merc(bbox[0], bbox[1]); x1, y1 = merc(bbox[2], bbox[3])
    xs = [x0 + (x1 - x0) * i / n for i in range(n + 1)]; ys = [y0 + (y1 - y0) * i / n for i in range(n + 1)]
    rows = []
    for r in range(n):
        row = []
        for c in range(n):
            a, b, cc, d = xs[c], ys[n - 1 - r], xs[c + 1], ys[n - r]; w, h = round((cc - a) / RES), round((d - b) / RES)
            out = os.path.join(cache, f'dem_{r}_{c}.tif')
            if not (os.path.exists(out) and os.path.getsize(out) > w * h * 3):
                curl(['-G', DEM_URL, '--data-urlencode', f'bbox={a},{b},{cc},{d}', '--data-urlencode', 'bboxSR=3857', '--data-urlencode', 'imageSR=3857',
                      '--data-urlencode', f'size={w},{h}', '--data-urlencode', 'format=tiff', '--data-urlencode', 'pixelType=F32',
                      '--data-urlencode', 'interpolation=RSP_BilinearInterpolation', '--data-urlencode', 'compression=None', '--data-urlencode', 'f=image'],
                     out, lambda p: os.path.getsize(p) > w * h * 3)
            row.append(np.array(Image.open(out), dtype='float32'))
        rows.append(np.hstack(row))
    return np.vstack(rows), (x0, y0, x1, y1)

# ---- Vexcel DTM (bare-earth terrain from Vexcel's own aerial surveys, ~15 cm native; fetched at zoom 16 ~ 2.4 m) ----
VEXCEL_API = 'https://api.vexcelgroup.com/v2'

def read_geotiff(path):
    """Minimal GeoTIFF reader for Vexcel DTMs: float32, deflate or no compression, tiles or strips, EPSG:3857.
    Returns (array with NaN for no-data, (x0, y_top, pixel_x, pixel_y))."""
    import struct, zlib
    b = open(path, 'rb').read(); bo = '>' if b[:2] == b'MM' else '<'
    off = struct.unpack(bo + 'I', b[4:8])[0]; n = struct.unpack(bo + 'H', b[off:off + 2])[0]; size = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8}; t = {}
    for i in range(n):
        e = b[off + 2 + 12 * i: off + 14 + 12 * i]; tag, typ, cnt = struct.unpack(bo + 'HHI', e[:8]); nb = size.get(typ, 1) * cnt
        data = e[8:12] if nb <= 4 else b[struct.unpack(bo + 'I', e[8:12])[0]:][:nb]
        fmt = {3: 'H', 4: 'I', 12: 'd', 11: 'f', 16: 'Q'}.get(typ)
        t[tag] = data.decode(errors='replace').strip('\x00') if typ == 2 else list(struct.unpack(bo + fmt * cnt, data[:size[typ] * cnt])) if fmt else data
    W, H = t[256][0], t[257][0]; comp = t.get(259, [1])[0]; nodata = float(t.get(42113, '-9999') or -9999)
    if t.get(258, [32])[0] != 32 or t.get(339, [3])[0] != 3: raise SystemExit('Vexcel DTM: expected float32')
    if t.get(317, [1])[0] != 1: raise SystemExit('Vexcel DTM: predictor not supported')
    dec = (lambda x: zlib.decompress(x)) if comp in (8, 32946) else (lambda x: x) if comp == 1 else None
    if dec is None: raise SystemExit(f'Vexcel DTM: compression {comp} not supported')
    a = np.full((H, W), np.nan, dtype='float32')
    if 322 in t:
        TW, TH = t[322][0], t[323][0]; across = -(-W // TW)
        for i, (o, c) in enumerate(zip(t[324], t[325])):
            tile = np.frombuffer(dec(b[o:o + c]), dtype=bo + 'f4').reshape(TH, TW); r, cc = divmod(i, across)
            hh, ww = min(TH, H - r * TH), min(TW, W - cc * TW); a[r * TH:r * TH + hh, cc * TW:cc * TW + ww] = tile[:hh, :ww]
    else:
        rows = t.get(278, [H])[0]
        for i, (o, c) in enumerate(zip(t[273], t[279])):
            strip = np.frombuffer(dec(b[o:o + c]), dtype=bo + 'f4'); r0 = i * rows; a[r0:r0 + strip.size // W] = strip.reshape(-1, W)
    a[(a <= nodata + 1) | ~np.isfinite(a)] = np.nan
    i, j, _, X, Y, _ = t[33922]; sx, sy, _ = t[33550]
    if '3857' not in str(t.get(34737, '')) and 3857 not in t.get(34735, []): raise SystemExit('Vexcel DTM: expected EPSG:3857')
    return a, (X - i * sx, Y + j * sy, sx, sy)

def vexcel_dtm(sid, bbox, shape_, bm):
    """Vexcel bare-earth DTM resampled onto the scenario grid (metres). NaN where Vexcel has no data."""
    key = os.environ.get('VEXCEL_API_KEY')
    if not key: return None
    out = os.path.join(RAW, 'vexcel-dtm', sid + '.tif'); os.makedirs(os.path.dirname(out), exist_ok=True)
    if not os.path.exists(out):
        hdr = os.path.join(RAW, 'vexcel-dtm', '.key.hdr'); open(hdr, 'w').write('X-API-KEY: ' + key + '\n'); os.chmod(hdr, 0o600)
        try:
            w, s_, e, n = bbox
            curl(['-G', VEXCEL_API + '/dtm/extract', '-H', '@' + hdr, '--data-urlencode', f'wkt=POLYGON(({w} {s_},{e} {s_},{e} {n},{w} {n},{w} {s_}))',
                  '--data-urlencode', 'srid=4326', '--data-urlencode', 'zoom=16'], out, lambda p: open(p, 'rb').read(4) in (b'MM\x00*', b'II*\x00'))
        finally:
            os.unlink(hdr)
    a, (vx0, vy0, sx, sy) = read_geotiff(out)
    h, w = shape_; x0, y0, x1, y1 = bm
    valid = np.isfinite(a); smooth = ndimage.uniform_filter(np.where(valid, a, 0), 2) / np.maximum(ndimage.uniform_filter(valid.astype('float32'), 2), 1e-6)  # ~2.4 m -> 5 m
    cols = ((x0 + (np.arange(w) + .5) / w * (x1 - x0)) - vx0) / sx - .5; rows = (vy0 - (y1 - (np.arange(h) + .5) / h * (y1 - y0))) / sy - .5
    rr, cc = np.meshgrid(rows, cols, indexing='ij')
    vals = ndimage.map_coordinates(smooth, [rr, cc], order=1, mode='nearest'); ok = ndimage.map_coordinates(valid.astype('float32'), [rr, cc], order=1, mode='constant', cval=0) > .5
    return np.where(ok, vals, np.nan).astype('float32')

def terrain_for(sid, bbox, tolerance=1.0):
    """Fuse Vexcel DTM with USGS 3DEP lidar bare earth.
    Vexcel (2.4 m, 2025 photogrammetry) adds street-scale detail, but photogrammetric bare earth fails on water,
    under large buildings and under dense canopy. So: remove Vexcel's overall offset from 3DEP (median difference),
    then use Vexcel wherever it agrees with the lidar within `tolerance` metres, and 3DEP elsewhere.
    Returns (dem, bm, terrain info)."""
    dem3, bm = dem_for(sid, bbox); vx = vexcel_dtm(sid, bbox, dem3.shape, bm)
    if vx is None: return dem3, bm, {'source': 'USGS 3DEP 5 m bare earth', 'vexcelShare': 0}
    ok = np.isfinite(vx) & np.isfinite(dem3) & (dem3 > -100); offset = float(np.median((vx - dem3)[ok]))
    adj = vx - offset; agree = ok & (np.abs(adj - dem3) <= tolerance)
    agree = ndimage.binary_opening(agree, iterations=1)  # drop isolated cells so the two sources don't speckle
    dem = np.where(agree, adj, dem3).astype('float32')
    return dem, bm, {'source': f'Vexcel DTM (2025 aerial survey, ~2.4 m) fused with USGS 3DEP lidar: Vexcel where it agrees with the lidar within {tolerance:g} m after removing its {offset:+.2f} m offset, lidar on water, under buildings and dense canopy',
                     'vexcelShare': round(float(agree.mean()), 3), 'vexcelCoverage': round(float(np.isfinite(vx).mean()), 3), 'vexcelOffsetM': round(offset, 2),
                     'vexcelMinus3depP90AbsM': round(float(np.percentile(np.abs((vx - dem3)[ok] - offset), 90)), 2)}

def fema_extent(sid, bbox, sfha_only=False):
    out = os.path.join(RAW, 'fema', sid + '.geojson'); os.makedirs(os.path.dirname(out), exist_ok=True)
    if not os.path.exists(out):
        curl(['-G', FEMA_URL, '--data-urlencode', 'geometry=' + ','.join(map(str, bbox)), '--data-urlencode', 'geometryType=esriGeometryEnvelope',
              '--data-urlencode', 'inSR=4326', '--data-urlencode', 'outSR=4326', '--data-urlencode', 'spatialRel=esriSpatialRelIntersects',
              '--data-urlencode', 'outFields=FLD_ZONE,ZONE_SUBTY,SFHA_TF,DFIRM_ID', '--data-urlencode', 'geometryPrecision=6', '--data-urlencode', 'f=geojson'],
             out, lambda p: b'"features"' in open(p, 'rb').read(200000))
    feats = json.load(open(out))['features']
    keep = [f for f in feats if f['properties'].get('SFHA_TF') == 'T' or (not sfha_only and '0.2' in (f['properties'].get('ZONE_SUBTY') or ''))]
    return [shape(f['geometry']).buffer(0) for f in keep], {'dataset': 'FEMA NFHL ' + ('1% annual-chance (100-year) area' if sfha_only else '0.2% annual-chance (500-year) area'), 'dfirm': sorted({f['properties'].get('DFIRM_ID') for f in keep})}

def harvey_extent(bbox):
    folder = os.path.join(RAW, 'harvey'); shp = os.path.join(folder, 'BoundariesMerge.shp')
    if not os.path.exists(shp):
        os.makedirs(folder, exist_ok=True); z = os.path.join(folder, 'Harris_AOIandBoundaries.zip')
        curl([HARVEY_URL], z, lambda p: os.path.getsize(p) > 70_000_000)
        subprocess.run(['unzip', '-o', '-q', z, '-d', folder], check=True)
    clip = box(*bbox); parts = []
    for sr in shapefile.Reader(shp).iterShapeRecords():
        b = sr.shape.bbox
        if sr.record['gridcode'] == 1 and b[0] < bbox[2] and b[2] > bbox[0] and b[1] < bbox[3] and b[3] > bbox[1]:
            g = shape(sr.shape.__geo_interface__).buffer(0).intersection(clip)
            if not g.is_empty: parts.append(g)
    return parts, {'dataset': 'FEMA Hurricane Harvey inundation boundaries, Harris County (NAD83)'}

def osm_water(names):
    """Lake / river polygons by name from the cached OpenStreetMap download (data/raw/princeton/osm-water.json)."""
    from shapely.geometry import LineString
    from shapely.ops import polygonize
    d = json.load(open(os.path.join(RAW, 'princeton', 'osm-water.json'))); polys = []
    for e in d['elements']:
        if e.get('tags', {}).get('name') not in names: continue
        if e['type'] == 'way': polys.append(shape({'type': 'Polygon', 'coordinates': [[(p['lon'], p['lat']) for p in e['geometry']]]}).buffer(0))
        else:
            lines = [LineString([(p['lon'], p['lat']) for p in m['geometry']]) for m in e.get('members', []) if m.get('role') == 'outer' and m.get('geometry')]
            polys += [g.buffer(0) for g in polygonize(unary_union(lines))]
    return polys

def bathtub(dem, seed, level):
    """Connected inundation: cells at or below `level` that connect to the seed water body."""
    lab, _ = ndimage.label((dem <= level) | seed)
    keep = np.unique(lab[seed]); keep = keep[keep > 0]
    return np.isin(lab, keep)

def rasterize(geoms, shape_, bbox):
    h, w = shape_; x0, y0, x1, y1 = bbox; img = Image.new('L', (w, h), 0); draw = ImageDraw.Draw(img)
    px = lambda ring: [((merc(x, y)[0] - x0) / (x1 - x0) * w, (y1 - merc(x, y)[1]) / (y1 - y0) * h) for x, y in ring]
    for g in geoms:
        for poly in getattr(g, 'geoms', [g]):
            if poly.geom_type != 'Polygon': continue
            draw.polygon(px(poly.exterior.coords), fill=1)
            for hole in poly.interiors: draw.polygon(px(hole.coords), fill=0)
    return np.array(img, dtype=bool)

def fwdet(dem, mask, smooth=15):
    edge = mask & ~ndimage.binary_erosion(mask); edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = False
    _, (iy, ix) = ndimage.distance_transform_edt(~edge, return_indices=True)
    m = mask.astype('float32')
    wse = ndimage.uniform_filter(np.where(mask, dem[iy, ix], 0), smooth) / np.maximum(ndimage.uniform_filter(m, smooth), 1e-6)
    return np.where(mask, np.clip((wse - dem) * FT, 0, None), np.nan)

def paint(classes, values, h, w):
    rgba = np.zeros((h, w, 4), dtype='uint8')
    for sel, colour in classes:
        rgba[sel] = (*(int(colour[i:i + 2], 16) for i in (1, 3, 5)), 255)
    return Image.fromarray(rgba, 'RGBA')

def level_masks(d):
    return [((d >= lo) & (d < (np.inf if hi is None else hi)), c) for _, lo, hi, c in LEVELS]

def pick_people(depth, dry_dist, bbox_m, shape_):
    """One resident in deep water (high), one moderate (medium), one at the shallow edge (low), each with a dry assembly point."""
    h, w = shape_; d = np.nan_to_num(depth, nan=-1); cy, cx = h / 2, w / 2
    yy, xx = np.mgrid[0:h, 0:w]; centre = np.hypot(yy - cy, xx - cx)
    flooded = d >= 0
    shore = ndimage.distance_transform_edt(flooded)  # cells from the dry edge, inside the flood
    picks = []
    for kind, lo, hi in [('high', 3.5, 8), ('medium', 1.2, 2.8), ('low', 0.2, 0.9)]:
        cand = (d >= lo) & (d <= hi) & (shore >= 3) & (yy > h * .12) & (yy < h * .88) & (xx > w * .12) & (xx < w * .88)
        for py, px_ in picks: cand &= np.hypot(yy - py, xx - px_) > 120  # at least ~600 m apart, so markers don't overlap in the tilted 3D view
        if not cand.any(): raise SystemExit('No location for ' + kind)
        score = np.where(cand, centre, np.inf); y, x = np.unravel_index(np.argmin(score), score.shape); picks.append((y, x))
    safe = dry_dist >= 30  # at least ~150 m from any flooded cell
    safe[:int(h * .06)] = safe[-int(h * .06):] = False; safe[:, :int(w * .06)] = safe[:, -int(w * .06):] = False
    sy, sx = np.nonzero(safe)
    def route_cost(y, x, ty, tx):
        n = int(max(abs(ty - y), abs(tx - x))) + 1; ly = np.linspace(y, ty, n).astype(int); lx = np.linspace(x, tx, n).astype(int)
        return float(np.clip(d[ly, lx], 0, None).sum())
    people = []
    for y, x in picks:
        dist = np.hypot(sy - y, sx - x); order = np.argsort(dist)[:400:8]
        best = min(order, key=lambda i: route_cost(y, x, sy[i], sx[i]) * 4 + dist[i])
        people.append(((y, x), (sy[best], sx[best])))
    x0, y0, x1, y1 = bbox_m
    ll = lambda y, x: [round(v, 6) for v in unmerc(x0 + (x + .5) / w * (x1 - x0), y1 - (y + .5) / h * (y1 - y0))]
    return [{'start': ll(*a), 'destination': ll(*b), 'depthFt': round(float(d[a]), 1)} for a, b in people]

def build(sid, cfg):
    bbox = cfg['bbox']; dem, bm, terrain = terrain_for(sid, bbox); clip = box(*bbox); h, w = dem.shape
    x0, y0, x1, y1 = bm
    cell = lambda lon, lat: (int((y1 - merc(lon, lat)[1]) / (y1 - y0) * h), int((merc(lon, lat)[0] - x0) / (x1 - x0) * w))
    if cfg['source'] == 'bathtub':
        seed = rasterize([g.intersection(clip) for g in osm_water(cfg['seedNames'])], dem.shape, bm)
        level = float(dem[cell(*cfg['target'])]) + cfg['targetDepthFt'] / FT
        mask = bathtub(dem, seed, level); depth = np.where(mask, np.clip((level - dem) * FT, 0, None), np.nan)
        info = {'dataset': 'Artificial drill flood: water rising out of Lake Carnegie and Stony Brook (OpenStreetMap) over ' + ('Vexcel DTM' if terrain['vexcelShare'] else 'USGS 3DEP') + ' elevation (connected-bathtub model)',
                'waterLevelM': round(level, 2), 'lakeSurfaceM': round(float(np.median(dem[seed])), 2)}
    else:
        geoms, info = harvey_extent(bbox) if cfg['source'] == 'harvey' else fema_extent(sid, bbox, cfg.get('sfhaOnly', False))
        geoms = [g.intersection(clip) for g in geoms]
        mask = rasterize(geoms, dem.shape, bm); depth = fwdet(dem, mask, cfg.get('smooth', 15))
    d = np.nan_to_num(depth, nan=-1)
    folder = os.path.join(OUT, sid); os.makedirs(folder, exist_ok=True)
    raw = np.where(d >= 0, 1 + np.clip(np.round(d * 10), 0, 65533), 0).astype('<u2'); raw.tofile(os.path.join(folder, 'depth.bin'))  # uint16 LE: 0 dry, else 1 + tenths of a foot
    paint([((d >= lo) & (d < (np.inf if hi is None else hi)), c) for _, lo, hi, c in ZONES], d, h, w).save(os.path.join(folder, 'zones.png'), optimize=True)
    dry_dist = ndimage.distance_transform_edt(~mask)
    if cfg.get('people'):
        ll = lambda y, x: [round(v, 6) for v in unmerc(x0 + (x + .5) / w * (x1 - x0), y1 - (y + .5) / h * (y1 - y0))]
        people = [{'start': list(a), 'destination': list(b), 'depthFt': round(float(d[cell(*a)]), 1)} for a, b in cfg['people']]
        for p in people:
            r, c = cell(*p['destination'])
            if d[r, c] >= 0 or dry_dist[r, c] < 20: raise SystemExit(f'{sid}: assembly point is flooded or within 100 m of the water')
    else:
        people = pick_people(depth, dry_dist, bm, mask.shape)
    thresholds = THRESHOLDS if cfg['source'] != 'bathtub' else [round(float(np.nanmax(depth)) * (1 - k / (len(THRESHOLDS) - 1)), 2) for k in range(len(THRESHOLDS))]
    x0, y0, x1, y1 = bm; wl, nl = unmerc(x0, y1); el, sl = unmerc(x1, y0)
    cell = (RES * math.cos(math.radians((bbox[1] + bbox[3]) / 2))) ** 2 / 1e6
    meta = {'id': sid, 'bounds': [[wl, nl], [el, nl], [el, sl], [wl, sl]], 'size': [w, h], 'resolutionM': RES, 'thresholdsFt': thresholds, 'depthEncoding': 'uint16le',
            'levels': [{'level': lv, 'minFt': lo, 'maxFt': hi, 'color': c} for lv, lo, hi, c in LEVELS],
            'zones': [{'zone': z, 'minFt': lo, 'maxFt': hi, 'color': c} for z, lo, hi, c in ZONES],
            'areaKm2': {'flooded': round(float(mask.sum()) * cell, 2), **{z: round(float(((d >= lo) & (d < (np.inf if hi is None else hi))).sum()) * cell, 2) for z, lo, hi, _ in ZONES}},
            'areaKm2ByLevel': {str(lv): round(float(m.sum()) * cell, 3) for (lv, *_), (m, _) in zip(LEVELS, level_masks(d))},
            'medianDepthFt': round(float(np.nanmedian(depth)), 1), 'people': people, 'extent': info, 'terrain': terrain,
            'method': 'FwDET (Cohen et al. 2018): water surface from the ground elevation at the nearest edge of the flood extent, smoothed (75 m, or 500 m on the broad Brays floodplain), minus the bare-earth elevation (' + terrain['source'] + ').',
            'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds')}
    json.dump(meta, open(os.path.join(folder, 'meta.json'), 'w'), indent=1)
    print(sid, 'flooded km2', meta['areaKm2'], 'median ft', meta['medianDepthFt'], 'people', [(p['depthFt']) for p in people])

if __name__ == '__main__':
    for sid, cfg in SCENARIOS.items(): build(sid, cfg)
