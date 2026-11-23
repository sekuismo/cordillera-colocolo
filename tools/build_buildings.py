# raw/buildings.parquet (extract_buildings.py) → raw/bld.f32: un rectángulo orientado por edificio, en metros del
# juego: x, z (centro), largo, ancho, rumbo (rad, módulo π) y pisos (0 = sin dato). build_zones.mjs lo reparte por zona.
# El rectángulo es el de área mínima que contiene la huella, achicado para conservar el área real (una L no queda gorda).
import duckdb, numpy as np, pathlib, time
root = pathlib.Path(__file__).resolve().parent.parent
src, out = (root / 'raw' / 'buildings.parquet').as_posix(), root / 'raw' / 'bld.f32'
LON, LAT, W, N = 92700, 110922, -70.80, -33.05
con = duckdb.connect(); con.sql('LOAD spatial')
t = time.time()
r = con.sql(f"""
WITH g AS (SELECT ST_Affine(ST_GeomFromWKB(wkb), {LON}, 0, 0, {-LAT}, {-W * LON}, {N * LAT}) AS g, num_floors, height FROM '{src}'),
     r AS (SELECT ST_Area(g) a, ST_MinimumRotatedRectangle(g) rr, num_floors, height FROM g),
     p AS (SELECT a, ST_Area(rr) ar, ST_Centroid(rr) c, ST_PointN(ST_ExteriorRing(rr), 1) p0, ST_PointN(ST_ExteriorRing(rr), 2) p1,
                  ST_PointN(ST_ExteriorRing(rr), 3) p2, num_floors, height FROM r WHERE ST_GeometryType(rr) = 'POLYGON')
SELECT ST_X(c), ST_Y(c), ST_X(p1) - ST_X(p0), ST_Y(p1) - ST_Y(p0), ST_X(p2) - ST_X(p1), ST_Y(p2) - ST_Y(p1), a, ar,
       coalesce(num_floors, round(height / 3.0), 0) FROM p
""").fetchnumpy()
cx, cz, ax, az, bx, bz, a, ar, fl = [np.asarray(v, dtype=np.float64) for v in r.values()]
L, Wd = np.hypot(ax, az), np.hypot(bx, bz)
k = np.sqrt(np.clip(a / np.maximum(ar, 1e-6), 0.5, 1.0))
ang = np.mod(np.arctan2(az, ax), np.pi)
ok = (L > 1.5) & (Wd > 1.5)
arr = np.stack([cx, cz, L * k, Wd * k, ang, np.clip(fl, 0, 99)], axis=1)[ok].astype(np.float32)
arr.tofile(out)
print(f'{len(arr)} edificios ({(~ok).sum()} descartados), {np.count_nonzero(arr[:, 5])} con pisos, {time.time() - t:.0f} s')
