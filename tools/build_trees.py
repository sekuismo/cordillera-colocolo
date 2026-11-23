# Árboles reales desde la altura de dosel de Meta (High Resolution Canopy Height, ~1 m, CC BY 4.0; raw/chm/*.tif,
# teselas Web Mercator z9 bajadas de s3://dataforgood-fb-data/forests/v1/alsgedi_global_v6_float/chm/).
# Cada copa es un máximo local del dosel suavizado: queda un árbol por copa con su posición y altura reales.
# Deja raw/trees.f32 (x, z, altura, radio de copa) en metros del juego; build_zones.mjs lo reparte por zona.
# Requiere: pip install numpy scipy tifffile.   Uso: python build_trees.py [lon0 lat0 lon1 lat1] (para probar un recorte)
import sys, math, zlib, time, pathlib
import numpy as np, tifffile
from scipy import ndimage

root = pathlib.Path(__file__).resolve().parent.parent
W, E, N, S = -70.80, -69.60, -33.05, -34.30
if len(sys.argv) == 5: W, S, E, N = map(float, sys.argv[1:])
LON, LAT, CW, CN = 92700, 110922, -70.80, -33.05
RE = 6378137.0
mx = lambda lon: RE * math.radians(lon)
my = lambda lat: RE * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))
MIN_H = 3.0     # m: bajo esto es matorral (lo pone la vegetación procedural)
BAND, PAD = 512, 8

xs_all, zs_all, hs_all, rs_all = [], [], [], []
t0 = time.time()
for f in sorted((root / 'raw' / 'chm').glob('*.tif')):
    with tifffile.TiffFile(f) as tif:
        page = tif.pages[0]
        tie, scale = page.tags['ModelTiepointTag'].value, page.tags['ModelPixelScaleTag'].value
        X0, Y0, res = tie[3], tie[4], scale[0]
        offs, cnts, width, height = page.dataoffsets, page.databytecounts, page.imagewidth, page.imagelength
    c0 = max(0, int((mx(W) - X0) / res) - PAD); c1 = min(width, int((mx(E) - X0) / res) + PAD)
    r0 = max(0, int((Y0 - my(N)) / res) - PAD); r1 = min(height, int((Y0 - my(S)) / res) + PAD)
    if c0 >= c1 or r0 >= r1: continue
    n0 = len(xs_all)
    with open(f, 'rb') as fh:
        for b0 in range(r0, r1, BAND):
            a0, a1 = max(r0, b0 - PAD), min(r1, b0 + BAND + PAD)
            rows = []
            for r in range(a0, a1):
                fh.seek(offs[r]); row = np.frombuffer(zlib.decompress(fh.read(cnts[r])), np.uint8)
                rows.append(np.cumsum(row[:c1], dtype=np.uint8)[c0:c1])  # predictor horizontal: diferencias por byte
            h = np.stack(rows).astype(np.float32)
            h[h > 120] = 0  # sin dato
            if (h >= MIN_H).sum() == 0: continue
            hs = ndimage.gaussian_filter(h, 1.0)
            top = (h >= MIN_H) & (hs >= ndimage.maximum_filter(hs, 5) - 1e-4)
            top &= (h < 10) | (hs >= ndimage.maximum_filter(hs, 9) - 1e-4)   # los árboles altos tienen copas más anchas
            top[: b0 - a0, :] = False; top[b0 - a0 + BAND:, :] = False         # el margen es solo contexto
            ry, rx = np.nonzero(top)
            if not len(ry): continue
            hh = ndimage.maximum_filter(h, 3)[ry, rx]
            # Las mesetas de altura entera dejan varios máximos pegados: uno por celda de 2 px.
            key = (ry // 2).astype(np.int64) * 100000 + rx // 2
            _, first = np.unique(key, return_index=True)
            ry, rx, hh = ry[first], rx[first], hh[first]
            Xm = X0 + (c0 + rx + 0.5) * res; Ym = Y0 - (a0 + ry + 0.5) * res
            lon = np.degrees(Xm / RE); lat = np.degrees(2 * np.arctan(np.exp(Ym / RE)) - math.pi / 2)
            ok = (lon >= W) & (lon < E) & (lat <= N) & (lat > S)
            xs_all.append((lon[ok] - CW) * LON); zs_all.append((CN - lat[ok]) * LAT); hs_all.append(hh[ok])
            rs_all.append(np.clip(0.6 + 0.22 * hh[ok], 1.0, 9.0))  # radio de copa por alometría (el dosel de 1 m no separa copas pegadas)
    print(f'{f.name}: {sum(len(a) for a in xs_all[n0:])} árboles, {time.time() - t0:.0f} s', flush=True)

arr = np.stack([np.concatenate(xs_all), np.concatenate(zs_all), np.concatenate(hs_all), np.concatenate(rs_all)], axis=1).astype(np.float32)
arr.tofile(root / 'raw' / 'trees.f32')
print(f'total: {len(arr)} árboles; altura media {arr[:, 2].mean():.1f} m; {time.time() - t0:.0f} s')
