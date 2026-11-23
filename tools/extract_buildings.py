# Huellas de edificios de Overture Maps (fusiona OSM, Microsoft ML Buildings y Google Open Buildings) para el core.
# Deja raw/buildings.parquet; después va build_buildings.mjs. Requiere: pip install duckdb
import duckdb, time, pathlib
RELEASE = '2026-11-18.0'
W, E, N, S = -70.80, -69.60, -33.05, -34.30
out = pathlib.Path(__file__).resolve().parent.parent / 'raw' / 'buildings.parquet'
con = duckdb.connect()
con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; SET s3_region='us-west-2';")
t = time.time()
con.sql(f"""
COPY (
  SELECT ST_AsWKB(geometry) AS wkb, height, num_floors, class, subtype, sources[1].dataset AS src
  FROM read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)
  WHERE bbox.xmin > {W} AND bbox.xmax < {E} AND bbox.ymin > {S} AND bbox.ymax < {N}
) TO '{out.as_posix()}' (FORMAT parquet, COMPRESSION zstd)
""")
print('edificios:', con.sql(f"SELECT count(*), count(num_floors), count(height) FROM '{out.as_posix()}'").fetchall(), f'{time.time() - t:.0f} s')
