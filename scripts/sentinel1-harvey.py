"""Hurricane Harvey flood seen by Sentinel-1 radar over the Kingwood drill area, compared with the drill's FEMA extent.

Radar sees through cloud and rain. Calm open water reflects the radar pulse away from the satellite, so it looks dark.
Method (change detection, as in UN-SPIDER's Sentinel-1 flood mapping practice):
  * Sentinel-1 RTC (radiometrically terrain corrected gamma0, 10 m) from Microsoft Planetary Computer, the same
    descending orbit (relative orbit 143) before the storm (24 Aug 2017) and at the flood peak (30 Aug 2017).
  * 5 x 5 boxcar speckle filter on linear backscatter, then dB.
  * Open-water flood: dark on the flood day (VV below -15 dB) AND at least 3 dB darker than before the storm.
    Permanent water = already below -15 dB before the storm (Lake Houston, the San Jacinto River).
    (Otsu's threshold was tried first; the flood-day histogram is not bimodal here, so it is not used.)
  * Flood among buildings and trees (double bounce): water under walls and trunks reflects the pulse back to the
    satellite, so these areas get BRIGHTER. Flagged where VV rose by at least 3 dB AND the ground is within 6 m of
    the nearest permanent water (height above nearest drainage, from the fused Vexcel/3DEP terrain), which keeps out
    rain-wetted fields on high ground. Regions under 0.25 ha are dropped (0.1 ha for open water).
Known limits: much of the flooding under dense canopy shows neither signal; wind-roughened water can look bright;
one snapshot (30 Aug 2017 12:22 UTC), while the FEMA outline is the maximum extent compiled after the event.
Outputs public/data/sentinel1/harvey/: flood.png (overlay on the drill grid bounds) and meta.json (scenes, threshold,
agreement with the drill extent). Run: python3 -I scripts/sentinel1-harvey.py
"""
import importlib.util, json, math, os, struct, subprocess
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw', 'sentinel1'); OUT = os.path.join(ROOT, 'public', 'data', 'sentinel1', 'harvey')
SCENES = {'pre': 'S1A_IW_GRDH_1SDV_20170824T122248_20170824T122318_018065_01E54E_rtc',
          'post': 'S1B_IW_GRDH_1SDV_20170830T122203_20170830T122232_007169_00CA2C_rtc'}
API = 'https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/{bbox}/{w}x{h}.tif?collection=sentinel-1-rtc&item={item}&assets={band}&dst_crs=epsg:3857'
WATER_DB, HAND_M = -15.0, 6.0
merc = lambda lon, lat: (lon * 20037508.34 / 180, math.log(math.tan((90 + lat) * math.pi / 360)) * 6378137)

def read_tiff(path):
    """Uncompressed float32 GeoTIFF from the Planetary Computer data API: value band + alpha band, EPSG:3857."""
    b = open(path, 'rb').read(); bo = '<' if b[:2] == b'II' else '>'
    off = struct.unpack(bo + 'I', b[4:8])[0]; n = struct.unpack(bo + 'H', b[off:off + 2])[0]; size = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8}; t = {}
    for i in range(n):
        e = b[off + 2 + 12 * i: off + 14 + 12 * i]; tag, typ, cnt = struct.unpack(bo + 'HHI', e[:8]); nb = size.get(typ, 1) * cnt
        data = e[8:12] if nb <= 4 else b[struct.unpack(bo + 'I', e[8:12])[0]:][:nb]; fmt = {3: 'H', 4: 'I', 12: 'd', 11: 'f'}.get(typ)
        t[tag] = data.decode(errors='replace') if typ == 2 else list(struct.unpack(bo + fmt * cnt, data[:size[typ] * cnt])) if fmt else data
    if t.get(259, [1])[0] != 1 or 3857 not in t.get(34735, []): raise SystemExit(path + ': expected an uncompressed EPSG:3857 GeoTIFF')
    W, H, spp = t[256][0], t[257][0], t.get(277, [1])[0]
    raw = b''.join(b[o:o + c] for o, c in zip(t[273], t[279]))
    a = np.frombuffer(raw, dtype=bo + 'f4').reshape(H, W, spp)
    value, valid = a[..., 0].astype('float64'), (a[..., 1] > 0) if spp > 1 else np.isfinite(a[..., 0])
    return np.where(valid & (value > 0), value, np.nan)

def otsu(x, lo=-22, hi=-12):
    h, edges = np.histogram(x, bins=256, range=(-30, 5)); c = (edges[:-1] + edges[1:]) / 2; w = np.cumsum(h); m = np.cumsum(h * c)
    between = (m[-1] * w / w[-1] - m) ** 2 / np.maximum(w * (w[-1] - w), 1)
    return float(np.clip(c[np.argmax(between)], lo, hi))

def main():
    meta = json.load(open(os.path.join(ROOT, 'public', 'data', 'floods', 'harvey', 'meta.json'))); w5, h5 = meta['size']
    (W, N), _, (E, S), _ = meta['bounds']; x0, y1 = merc(W, N); x1, y0 = merc(E, S)
    w10, h10 = round((x1 - x0) / 10), round((y1 - y0) / 10); os.makedirs(RAW, exist_ok=True)
    img = {}
    for when, item in SCENES.items():
        for band in ('vv', 'vh'):
            path = os.path.join(RAW, f'{when}-{band}.tif')
            if not os.path.exists(path):
                subprocess.run(['curl', '-sf', '-m', '300', '-o', path, API.format(bbox=f'{W},{S},{E},{N}', w=w10, h=h10, item=item, band=band)], check=True)
            lin = read_tiff(path); ok = np.isfinite(lin)
            smooth = ndimage.uniform_filter(np.where(ok, lin, 0), 5) / np.maximum(ndimage.uniform_filter(ok.astype(float), 5), 1e-6)
            img[when, band] = np.where(ok, 10 * np.log10(np.maximum(smooth, 1e-6)), np.nan)
    pre, post = img['pre', 'vv'], img['post', 'vv']; valid = np.isfinite(pre) & np.isfinite(post)
    thr = WATER_DB; drop = post - pre
    permanent = valid & (pre < thr) & (post < thr)
    def clean(m, px): lab, n = ndimage.label(m); sz = ndimage.sum(m, lab, range(1, n + 1)); return np.isin(lab, 1 + np.nonzero(sz >= px)[0])
    open_water = clean(valid & (post < thr) & (drop <= -3) & ~permanent, 10)
    # Height above the nearest permanent water on the drill's terrain (Vexcel DTM fused with 3DEP)
    spec = importlib.util.spec_from_file_location('floods', os.path.join(ROOT, 'scripts', 'houston-floods.py')); fl = importlib.util.module_from_spec(spec); spec.loader.exec_module(fl)
    dem, _, terrain = fl.terrain_for('harvey', fl.SCENARIOS['harvey']['bbox']); dem10 = ndimage.zoom(dem, (h10 / dem.shape[0], w10 / dem.shape[1]), order=1)[:h10, :w10]
    _, (iy, ix) = ndimage.distance_transform_edt(~permanent, return_indices=True); hand = dem10 - dem10[iy, ix]
    double_bounce = clean(valid & (drop >= 3) & (hand <= HAND_M) & ~permanent & ~open_water, 25)
    flooded = open_water | double_bounce

    # Onto the drill's 5 m grid (each 10 m radar pixel covers 2 x 2 drill cells)
    ry = np.minimum((np.arange(h5) + .5) / h5 * h10, h10 - 1).astype(int); rx = np.minimum((np.arange(w5) + .5) / w5 * w10, w10 - 1).astype(int)
    up = lambda a: a[np.ix_(ry, rx)]
    sar, perm, val, ow, dbl = up(flooded), up(permanent), up(valid), up(open_water), up(double_bounce)
    depth = np.fromfile(os.path.join(ROOT, 'public', 'data', 'floods', 'harvey', 'depth.bin'), '<u2').reshape(h5, w5)
    drill = (depth > 0) & ~perm & val; sar_wet = sar & val
    tp, fp, fn = int((drill & sar_wet).sum()), int((~drill & sar_wet & ~perm).sum()), int((drill & ~sar_wet).sum())
    d_ft = np.where(depth > 0, (depth.astype(float) - 1) / 10, np.nan)
    by_zone = {z: round(float(sar_wet[m].mean()), 3) if m.any() else None for z, m in
               {'high': d_ft >= 3, 'medium': (d_ft >= 1) & (d_ft < 3), 'low': (d_ft > 0) & (d_ft < 1)}.items()}
    cell = (5 * math.cos(math.radians((N + S) / 2))) ** 2 / 1e6

    # Overlay: radar-detected flood (cyan) and permanent water (deep blue); everything else transparent
    rgba = np.zeros((h5, w5, 4), 'uint8'); rgba[ow] = (0, 214, 255, 215); rgba[dbl] = (186, 104, 255, 200); rgba[perm] = (18, 58, 120, 170)
    os.makedirs(OUT, exist_ok=True); Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'flood.png'), optimize=True)
    precision = round(tp / max(1, tp + fp), 3)
    out = {'source': 'Copernicus Sentinel-1 (ESA), radiometrically terrain corrected (RTC) by Microsoft Planetary Computer',
           'scenes': {'before': {'id': SCENES['pre'], 'date': '2017-08-24', 'orbit': 'descending, relative orbit 143'},
                      'flood': {'id': SCENES['post'], 'date': '2017-08-30', 'orbit': 'descending, relative orbit 143'}},
           'bounds': meta['bounds'], 'method': f'Change detection on VV gamma0 (5x5 speckle filter). Open-water flood: VV below {WATER_DB:g} dB on the flood day and at least 3 dB darker than before. Flood among buildings and trees (double bounce): VV at least 3 dB brighter and ground within {HAND_M:g} m of the nearest permanent water. Permanent water: already below {WATER_DB:g} dB before the storm.', 'terrain': terrain['source'],
           'waterThresholdDb': WATER_DB, 'handMaxM': HAND_M,
           'areaKm2': {'radarFlood': round(float(sar_wet.sum()) * cell, 2), 'openWater': round(float((ow & val).sum()) * cell, 2), 'buildingsAndTrees': round(float((dbl & val).sum()) * cell, 2), 'permanentWater': round(float((perm & val).sum()) * cell, 2), 'drillExtent': round(float(drill.sum()) * cell, 2)},
           'agreement': {'hitRate': round(tp / max(1, tp + fn), 3), 'precision': precision, 'falseAlarmRatio': round(1 - precision, 3), 'criticalSuccessIndex': round(tp / max(1, tp + fp + fn), 3),
                         'detectedByZone': by_zone,
                         'note': 'Drill extent = FEMA Harvey inundation outline (depth grid > 0), permanent water excluded. Precision = share of what the radar flagged that lies inside the drill extent. Hit rate = share of the drill extent the radar also flagged. Radar misses much flooding under dense canopy, so a low hit rate is expected here.'},
           'limits': 'Flooding under canopy and in dense streets often does not darken in radar; wind-roughened water can look bright. One snapshot (30 Aug 2017 12:22 UTC), not the peak everywhere.'}
    json.dump(out, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
    print(json.dumps({k: out[k] for k in ('areaKm2', 'agreement')}, indent=1))

if __name__ == '__main__':
    main()
