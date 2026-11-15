"""Validate the SafeWay depth method (FwDET on a mapped flood outline + USGS 3DEP) against USGS
high-water marks surveyed after Hurricane Harvey in Harris County.

Inputs (cached in data/raw/, git-ignored):
  * FEMA Hurricane Harvey inundation boundaries, Harris County (data/raw/harvey/BoundariesMerge.shp)
  * USGS STN high-water marks, event 180 "2017 Harvey" (data/raw/harvey/usgs_hwms_event180.json),
    from https://api.waterdata.usgs.gov/stnservices/events/180/hwms/
  * County elevation grid and FEMA pages cached by scripts/houston-county-flood.py
Method: rasterise the Harvey outline on the county grid (~16.6 m), run the same FwDET as the app,
read the estimated depth at each mark, and compare with the surveyed height of water above ground.
Writes docs/validation/harvey-hwm.json. Run: python3 -I scripts/validate-harvey-hwm.py
"""
import importlib.util, json, math, os
import numpy as np, shapefile
from PIL import Image, ImageDraw
from scipy import ndimage, stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('county', os.path.join(ROOT, 'scripts', 'houston-county-flood.py'))
county = importlib.util.module_from_spec(spec); spec.loader.exec_module(county)

def zone(ft): return 'high' if ft >= 3 else 'medium' if ft >= 1 else 'low'

def main():
    feats = county.fema_features(); tx0, ty0, tx1, ty1 = county.grid_bounds(feats)
    dem = county.dem_grid(tx0, ty0, tx1, ty1)
    valid = np.isfinite(dem) & (dem > -100) & (dem < 500)
    iy, ix = ndimage.distance_transform_edt(~valid, return_distances=False, return_indices=True); dem = dem[iy, ix]; del iy, ix
    h, w = dem.shape; ox, oy = -county.WORLD + tx0 * county.TM, county.WORLD - ty0 * county.TM
    px = lambda lon, lat: ((county.merc(lon, lat)[0] - ox) / county.PX, (oy - county.merc(lon, lat)[1]) / county.PX)
    img = Image.new('L', (w, h), 0); draw = ImageDraw.Draw(img)
    for sr in shapefile.Reader(os.path.join(ROOT, 'data', 'raw', 'harvey', 'BoundariesMerge.shp')).iterShapeRecords():
        if sr.record['gridcode'] != 1: continue
        pts, parts = sr.shape.points, list(sr.shape.parts) + [len(sr.shape.points)]
        rings = [pts[parts[i]:parts[i + 1]] for i in range(len(parts) - 1)]
        for k, ring in enumerate(rings):  # shapefile: outer rings clockwise, holes counter-clockwise
            area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]))
            draw.polygon([px(x, y) for x, y in ring], fill=1 if area < 0 else 0)
    mask = np.array(img, dtype=bool) & valid
    depth = county.fwdet(dem, mask)
    marks = json.load(open(os.path.join(ROOT, 'data', 'raw', 'harvey', 'usgs_hwms_event180.json')))
    rows = []
    for m in marks:
        if not (m.get('countyName') or '').startswith('Harris') or m.get('height_above_ground') in (None, ''): continue
        if float(m['height_above_ground']) <= 0: continue  # 0 = height not recorded (mark at a gauge, bridge or structure), not dry ground
        x, y = px(m['longitude'], m['latitude']); c, r = int(x), int(y)
        if not (0 <= r < h and 0 <= c < w): continue
        win = depth[max(0, r - 1):r + 2, max(0, c - 1):c + 2]  # 3x3 cells (~50 m): GPS and grid alignment
        est = float(win[win >= 0].mean()) if (win >= 0).any() else None
        rows.append({'id': m['id'], 'observedFt': float(m['height_above_ground']), 'estimatedFt': est, 'inExtent': est is not None,
                     'quality': m.get('hwmQualityName'), 'environment': m.get('environment')})
    inside = [r for r in rows if r['inExtent']]
    good = [r for r in inside if (r['quality'] or '').split(':')[0] in ('Excellent', 'Good', 'Fair')]
    def summary(rs):
        o = np.array([r['observedFt'] for r in rs]); e = np.array([r['estimatedFt'] for r in rs]); err = e - o
        z = [(zone(a), zone(b)) for a, b in zip(o, e)]
        labels = ['low', 'medium', 'high']
        return {'n': len(rs), 'meanErrorFt': round(float(err.mean()), 2), 'meanAbsErrorFt': round(float(abs(err).mean()), 2),
                'rmseFt': round(float(math.sqrt((err ** 2).mean())), 2), 'medianAbsErrorFt': round(float(np.median(abs(err))), 2),
                'spearman': round(float(stats.spearmanr(o, e).statistic), 2), 'zoneAgreement': round(sum(a == b for a, b in z) / len(z), 2),
                'zoneWithinOne': round(sum(abs(labels.index(a) - labels.index(b)) <= 1 for a, b in z) / len(z), 2),
                'confusion': {f'{a}->{b}': sum(1 for x in z if x == (a, b)) for a in labels for b in labels},
                'observedMedianFt': round(float(np.median(o)), 2), 'estimatedMedianFt': round(float(np.median(e)), 2)}
    out = {'event': 'Hurricane Harvey 2017, Harris County', 'marksWithDepth': len(rows), 'marksInsideMappedExtent': len(inside),
           'all': summary(inside), 'excellentGoodFair': summary(good),
           'notes': 'observed = USGS height of water above ground at the mark; estimated = FwDET depth (mean of 3x3 cells, ~16.6 m grid) on the FEMA Harvey outline. Marks outside the rasterised outline are counted but not scored.'}
    os.makedirs(os.path.join(ROOT, 'docs', 'validation'), exist_ok=True)
    json.dump({**out, 'marks': rows}, open(os.path.join(ROOT, 'docs', 'validation', 'harvey-hwm.json'), 'w'), indent=1)
    print(json.dumps(out, indent=1))

if __name__ == '__main__':
    main()
