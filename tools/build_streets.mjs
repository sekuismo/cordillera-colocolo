// Calles menores (raw/streets/*.json, bajadas con download_streets.mjs) → data/streets_ter.bin y streets_res.bin.
// Mismo formato que lines.bin: cabecera JSON + varints con deltas en unidades de 0,5 m.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { RAW, DATA, CORE, M_PER_DEG_LAT, M_PER_DEG_LON } from './config.mjs';
import { VarintWriter } from './codec.mjs';

const X = (lon) => (lon - CORE.west) * M_PER_DEG_LON, Z = (lat) => (CORE.north - lat) * M_PER_DEG_LAT;
const W = (CORE.east - CORE.west) * M_PER_DEG_LON, H = (CORE.north - CORE.south) * M_PER_DEG_LAT;

function simplify(pts, tol) { // Douglas–Peucker iterativo
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a], [bx, bz] = pts[b], dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1e-9;
    let worst = -1, wd = tol * tol;
    for (let i = a + 1; i < b; i++) {
      const t = Math.max(0, Math.min(1, ((pts[i][0] - ax) * dx + (pts[i][1] - az) * dz) / len2));
      const ex = pts[i][0] - ax - t * dx, ez = pts[i][1] - az - t * dz, d = ex * ex + ez * ez;
      if (d > wd) { wd = d; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// Vías que ya están en lines.bin (avenidas, y terciarias/caminos del sector cordillerano): no se repiten.
const seen = new Set();
for (const f of ['roads', 'trails']) for (const e of JSON.parse(await fs.readFile(path.join(RAW, 'osm', `${f}.json`), 'utf8')).elements) seen.add(e.id);

const WIDTH = { tertiary: 7, tertiary_link: 6, unclassified: 6, residential: 5.5, living_street: 4.5 };
const classes = { ter: [], res: [] };
const dir = path.join(RAW, 'streets'), files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));
for (const f of files) for (const e of JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))) {
  if (seen.has(e.id) || !e.g || e.t || !WIDTH[e.h]) continue; seen.add(e.id);
  const pts = e.g.map(([lat, lon]) => [X(lon), Z(lat)]);
  if (!pts.some(([x, z]) => x > 0 && z > 0 && x < W && z < H)) continue;
  classes[e.h.startsWith('tertiary') ? 'ter' : 'res'].push({ type: Math.round(WIDTH[e.h] * 10), pts: simplify(pts, 1.5) });
}

const out = {};
for (const [name, list] of Object.entries(classes)) {
  const vw = new VarintWriter(), header = { unit: 0.5, classes: [{ name, count: list.length }] };
  let n = 0;
  for (const pl of list) {
    vw.u(pl.type); vw.u(pl.pts.length);
    let px = 0, pz = 0;
    for (const [x, z] of pl.pts) { const qx = Math.round(x / 0.5), qz = Math.round(z / 0.5); vw.s(qx - px); vw.s(qz - pz); px = qx; pz = qz; }
    n += pl.pts.length;
  }
  const hj = Buffer.from(JSON.stringify(header)), len = Buffer.alloc(4); len.writeUInt32LE(hj.length);
  const gz = zlib.gzipSync(Buffer.concat([len, hj, vw.bytes()]), { level: 9 });
  await fs.writeFile(path.join(DATA, `streets_${name}.bin`), gz);
  out[name] = { vias: list.length, puntos: n, MB: +(gz.length / 1e6).toFixed(2) };
}
console.log(`${files.length} teselas →`, out);
