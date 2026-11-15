"""County-wide flood depth map for Harris County (levels 1-7), as XYZ map tiles.

Flood extents: FEMA National Flood Hazard Layer, Harris County DFIRM 48201C (regulatory floodway,
1% annual-chance and 0.2% annual-chance areas), through Esri's public USA Flood Hazard Areas mirror.
Ground: USGS 3DEP bare-earth elevation. Depth: FwDET (Cohen et al. 2018): the water surface is the
ground elevation at the nearest edge of the flood extent, smoothed, minus the ground. This is an
estimate for awareness and exercises. HCFCD's modelled MAAPnext depth grids would be the better
source; their image server (fximgservices.hcfcd.org) was unreachable when this was built.

The grid is aligned to Web Mercator zoom-13 tiles (19.11 m per pixel in Mercator, ~16.6 m on the
ground), so z13 tiles are cut directly and z9-z12 are built by keeping the deepest level per block.

Outputs in public/data/county-flood/:
  meta.json                         bounds, levels, areas, sources, method
  <100|500>/<z>/<x>/<y>.png         coloured depth levels (palette PNG, transparent when dry)
  <100|500>-data/13/<x>/<y>.png     depth per pixel: 0 dry, else 1 + tenths of a foot (capped 254)
Raw downloads are cached in data/raw/county/ (git-ignored). Run: python3 -I scripts/houston-county-flood.py
"""
import json, math, os, shutil, subprocess, time
from datetime import datetime, timezone
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from shapely.geometry import shape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw', 'county')
OUT = os.path.join(ROOT, 'public', 'data', 'county-flood')
FEMA = 'https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Flood_Hazard_Reduced_Set_gdb/FeatureServer/0/query'
DEM = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage'
Z = 13; TILE = 256; WORLD = 20037508.342789244; TM = 2 * WORLD / 2 ** Z  # metres per z13 tile
PX = TM / TILE; FT = 3.28084; BLOCK = 4  # DEM requested in 4x4-tile blocks (1024 px)
LEVELS = [(1, 0, 1, '#cfe9f6'), (2, 1, 2, '#a3d3ee'), (3, 2, 3, '#72b9e3'), (4, 3, 4, '#4799d3'),
          (5, 4, 5, '#2b79bf'), (6, 5, 6, '#1d58a2'), (7, 6, None, '#123a78')]
EVENTS = {'100': ('floodway', '1pct'), '500': ('floodway', '1pct', '0.2pct')}

def curl(args, out, ok, tries=8):
    for i in range(tries):
        subprocess.run(['curl', '-sL', '-m', '240', *args, '-o', out], check=False)
        if os.path.exists(out) and ok(out): return
        time.sleep(4 + 4 * i)
    raise SystemExit('Download failed: ' + out)

def merc(lon, lat): return lon * WORLD / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * 6378137
def unmerc(x, y): return x * 180 / WORLD, math.degrees(2 * math.atan(math.exp(y / 6378137)) - math.pi / 2)
def tile_of(lon, lat):
    x, y = merc(lon, lat); return int((x + WORLD) // TM), int((WORLD - y) // TM)

def tier(p):
    if p.get('ZONE_SUBTY') == 'Floodway': return 'floodway'
    if p.get('SFHA_TF') == 'T': return '1pct'
    if '0.2' in (p.get('ZONE_SUBTY') or ''): return '0.2pct'
    return None

def fema_features():
    os.makedirs(os.path.join(RAW, 'fema'), exist_ok=True); feats, offset = [], 0
    while True:
        out = os.path.join(RAW, 'fema', f'page_{offset:05d}.geojson')
        if not os.path.exists(out):
            curl(['-G', FEMA, '--data-urlencode', "where=DFIRM_ID='48201C' AND (SFHA_TF='T' OR ZONE_SUBTY LIKE '%0.2%')",
                  '--data-urlencode', 'outFields=OBJECTID,FLD_ZONE,ZONE_SUBTY,SFHA_TF', '--data-urlencode', 'outSR=4326',
                  '--data-urlencode', 'maxAllowableOffset=0.00005', '--data-urlencode', 'geometryPrecision=6',
                  '--data-urlencode', 'orderByFields=OBJECTID', '--data-urlencode', f'resultOffset={offset}',
                  '--data-urlencode', 'resultRecordCount=500', '--data-urlencode', 'f=geojson'],
                 out, lambda p: b'"features"' in open(p, 'rb').read())
        page = json.load(open(out))['features']; feats += page
        print('FEMA page', offset, len(page), flush=True)
        if len(page) < 500: return feats
        offset += 500

def grid_bounds(feats):
    xs, ys = [], []
    for f in feats:
        b = shape(f['geometry']).bounds; xs += [b[0], b[2]]; ys += [b[1], b[3]]
    tx0, ty0 = tile_of(min(xs), max(ys)); tx1, ty1 = tile_of(max(xs), min(ys))
    tx0 -= tx0 % BLOCK; ty0 -= ty0 % BLOCK; tx1 += BLOCK - 1 - tx1 % BLOCK; ty1 += BLOCK - 1 - ty1 % BLOCK
    return tx0, ty0, tx1, ty1

def valid_tiff(path, n):
    """The server may compress blocks that are mostly water, so check the image itself, not the file size."""
    try:
        with Image.open(path) as im: return im.size == (n, n) and im.mode == 'F'
    except Exception: return False

def dem_grid(tx0, ty0, tx1, ty1):
    os.makedirs(os.path.join(RAW, 'dem'), exist_ok=True); n = BLOCK * TILE
    grid = np.zeros(((ty1 - ty0 + 1) * TILE, (tx1 - tx0 + 1) * TILE), dtype='float32')
    for by in range(ty0, ty1 + 1, BLOCK):
        for bx in range(tx0, tx1 + 1, BLOCK):
            out = os.path.join(RAW, 'dem', f'{bx}_{by}.tif'); x0 = -WORLD + bx * TM; y1 = WORLD - by * TM
            if not valid_tiff(out, n):
                curl(['-G', DEM, '--data-urlencode', f'bbox={x0},{y1 - BLOCK * TM},{x0 + BLOCK * TM},{y1}', '--data-urlencode', 'bboxSR=3857',
                      '--data-urlencode', 'imageSR=3857', '--data-urlencode', f'size={n},{n}', '--data-urlencode', 'format=tiff',
                      '--data-urlencode', 'pixelType=F32', '--data-urlencode', 'interpolation=RSP_BilinearInterpolation',
                      '--data-urlencode', 'compression=None', '--data-urlencode', 'f=image'], out, lambda p: valid_tiff(p, n))
            r, c = (by - ty0) * TILE, (bx - tx0) * TILE
            grid[r:r + n, c:c + n] = np.array(Image.open(out), dtype='float32')
            print('DEM block', bx, by, flush=True)
    return grid

def rasterize(feats, tiers, shape_, tx0, ty0):
    img = Image.new('L', (shape_[1], shape_[0]), 0); draw = ImageDraw.Draw(img); ox, oy = -WORLD + tx0 * TM, WORLD - ty0 * TM
    def px(ring): return [((merc(x, y)[0] - ox) / PX, (oy - merc(x, y)[1]) / PX) for x, y in ring]
    for f in feats:
        if tier(f['properties']) not in tiers: continue
        g = f['geometry']; polys = [g['coordinates']] if g['type'] == 'Polygon' else g['coordinates']
        for poly in polys:
            draw.polygon(px(poly[0]), fill=1)
            for hole in poly[1:]: draw.polygon(px(hole), fill=0)
    return np.array(img, dtype=bool)

def fwdet(dem, mask, smooth=7):
    edge = mask & ~ndimage.binary_erosion(mask); edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = False
    iy, ix = ndimage.distance_transform_edt(~edge, return_distances=False, return_indices=True)
    wse = np.where(mask, dem[iy, ix], 0).astype('float32'); del iy, ix
    m = mask.astype('float32')
    wse = ndimage.uniform_filter(wse, smooth) / np.maximum(ndimage.uniform_filter(m, smooth), 1e-6)
    depth = np.where(mask, np.clip((wse - dem) * FT, 0, None), -1).astype('float32')
    return depth

def levels(depth):
    lv = np.zeros(depth.shape, dtype='uint8')
    for n, lo, hi, _ in LEVELS: lv[(depth >= lo) & (depth < (np.inf if hi is None else hi))] = n
    return lv

PALETTE = [0, 0, 0] + [int(c[i:i + 2], 16) for *_, c in LEVELS for i in (1, 3, 5)]
def save_level_tile(block, path):
    img = Image.fromarray(block, 'P'); img.putpalette(PALETTE + [0] * (768 - len(PALETTE))); img.info['transparency'] = 0
    os.makedirs(os.path.dirname(path), exist_ok=True); img.save(path, optimize=True, transparency=0)

def write_tiles(lv, data, event, tx0, ty0):
    h, w = lv.shape; base = os.path.join(OUT, event); dbase = os.path.join(OUT, event + '-data')
    for r in range(0, h, TILE):
        for c in range(0, w, TILE):
            x, y = tx0 + c // TILE, ty0 + r // TILE
            save_level_tile(lv[r:r + TILE, c:c + TILE], os.path.join(base, str(Z), str(x), f'{y}.png'))
            p = os.path.join(dbase, str(Z), str(x), f'{y}.png'); os.makedirs(os.path.dirname(p), exist_ok=True)
            Image.fromarray(data[r:r + TILE, c:c + TILE], 'L').save(p, optimize=True)
    cur, cx, cy = lv, tx0, ty0
    for z in range(Z - 1, 8, -1):  # parents keep the deepest level of each 2x2 block, so channels stay visible
        if cx % 2: cur = np.pad(cur, ((0, 0), (TILE, 0))); cx -= 1
        if cy % 2: cur = np.pad(cur, ((TILE, 0), (0, 0))); cy -= 1
        hh, ww = cur.shape; cur = np.pad(cur, ((0, hh % (2 * TILE)), (0, ww % (2 * TILE))))
        hh, ww = cur.shape; cur = cur.reshape(hh // 2, 2, ww // 2, 2).max(axis=(1, 3)); cx //= 2; cy //= 2
        for r in range(0, cur.shape[0], TILE):
            for c in range(0, cur.shape[1], TILE):
                save_level_tile(cur[r:r + TILE, c:c + TILE], os.path.join(base, str(z), str(cx + c // TILE), f'{cy + r // TILE}.png'))

def main():
    feats = fema_features(); tx0, ty0, tx1, ty1 = grid_bounds(feats)
    print('z13 tiles', tx0, ty0, tx1, ty1, flush=True)
    dem = dem_grid(tx0, ty0, tx1, ty1)
    if os.path.exists(OUT): shutil.rmtree(OUT)
    os.makedirs(OUT)
    x0, y1 = -WORLD + tx0 * TM, WORLD - ty0 * TM; x1, y0 = -WORLD + (tx1 + 1) * TM, WORLD - (ty1 + 1) * TM
    (w, n), (e, s) = unmerc(x0, y1), unmerc(x1, y0)
    lat = math.radians((n + s) / 2); cell_km2 = (PX * math.cos(lat)) ** 2 / 1e6
    meta = {'name': 'Harris County flood depth', 'bounds': [w, s, e, n], 'minzoom': 9, 'maxzoom': Z, 'tile': TILE,
            'levels': [{'level': lv, 'minFt': lo, 'maxFt': hi, 'color': c} for lv, lo, hi, c in LEVELS], 'events': {},
            'sources': ['FEMA National Flood Hazard Layer, Harris County DFIRM 48201C (floodway, 1% and 0.2% annual-chance areas)', 'USGS 3D Elevation Program (3DEP) bare-earth elevation'],
            'method': 'FwDET (Cohen et al. 2018): water surface from the ground elevation at the nearest edge of the FEMA flood extent, smoothed over ~115 m, minus ground elevation. Grid ~16.6 m.',
            'caveat': 'Estimated depth for awareness and exercises, not FEMA or HCFCD modelled depth. Channels read deep because the bed is far below the banks.',
            'generatedAt': datetime.now(timezone.utc).isoformat(timespec='seconds')}
    # 3DEP has no-data cells over some open water (NaN or a -3.4e38 fill value). Fill them from the
    # nearest valid ground so FwDET has a surface, but never report a depth there.
    valid = np.isfinite(dem) & (dem > -100) & (dem < 500)
    if not valid.all():
        iy, ix = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True)
        dem = dem[iy, ix]; del iy, ix
    meta['noDataKm2'] = round(float((~valid).sum()) * cell_km2, 1)
    for event, tiers in EVENTS.items():
        mask = rasterize(feats, tiers, dem.shape, tx0, ty0) & valid
        depth = fwdet(dem, mask); lv = levels(depth)
        data = np.where(depth >= 0, 1 + np.clip(np.round(depth * 10), 0, 253), 0).astype('uint8'); del depth
        write_tiles(lv, data, event, tx0, ty0)
        meta['events'][event] = {'label': {'100': '100-year flood (1% annual chance)', '500': '500-year flood (0.2% annual chance)'}[event],
            'floodedKm2': round(float(mask.sum()) * cell_km2, 1),
            'areaKm2ByLevel': {str(k): round(float((lv == k).sum()) * cell_km2, 1) for k in range(1, 8)}}
        print(event, meta['events'][event], flush=True)
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)

if __name__ == '__main__':
    main()
