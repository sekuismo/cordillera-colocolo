// Senderos con nombre (OSM) → data/senderos.json
//
// OSM trae la huella de cada sendero y, en unos 290, su nombre. Aquí se junta cada sendero (que viene partido en
// varias vías), se le saca el recorrido principal de punta a punta y se mide sobre el relieve del juego: largo,
// desnivel de subida y cotas de sus extremos. Nada de eso se escribe a mano: sale de la geometría.
//
// Formato: { v: 1, items: [[nombre, largo en m, subida en m, cota inicio, cota fin, cota máxima, [x0, z0, x1, z1, …]], …] }
// con x, z en metros enteros del mundo. El recorrido va siempre de su extremo más bajo al más alto.
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAW, DATA, CORE, M_PER_DEG_LAT, M_PER_DEG_LON } from './config.mjs';
import { decodeDem } from './codec.mjs';

const FOOT = new Set(['path', 'footway', 'bridleway']);
const MIN_LEN = 600;  // m: bajo esto es un atajo o un acceso, no un sendero que valga la pena anunciar
const TOL = 5;        // m de tolerancia al simplificar la polilínea
const out = process.argv[2] || path.join(DATA, 'senderos.json');

const dem = decodeDem(await fs.readFile(path.join(DATA, 'core_hi.dem')));
const SX = (CORE.east - CORE.west) * M_PER_DEG_LON, SZ = (CORE.north - CORE.south) * M_PER_DEG_LAT;
const heightAt = (x, z) => { // bilineal sobre el DEM (muestras en el centro de cada texel)
  const u = Math.min(dem.w - 1.001, Math.max(0, (x / SX) * dem.w - 0.5)), v = Math.min(dem.h - 1.001, Math.max(0, (z / SZ) * dem.h - 0.5));
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, q = dem.q, w = dem.w;
  return ((q[j * w + i] * (1 - fu) + q[j * w + i + 1] * fu) * (1 - fv) + (q[(j + 1) * w + i] * (1 - fu) + q[(j + 1) * w + i + 1] * fu) * fv) * dem.step;
};

// Nombre limpio: OSM a veces mete la cota o el largo en el nombre ("Sendero Cajón del Muerto (2145 m)").
const clean = (s) => s.replace(/\s*\([^)]*\d[^)]*\)\s*/g, ' ').replace(/\s+\d+([.,]\d+)?\s*km\b/i, '').replace(/\s+/g, ' ').trim();

const els = JSON.parse(await fs.readFile(path.join(RAW, 'osm', 'trails.json'), 'utf8')).elements;
const byName = new Map();
for (const e of els) {
  if (e.type !== 'way' || !FOOT.has(e.tags?.highway) || !e.tags.name || !e.geometry) continue;
  const n = clean(e.tags.name); if (n.length < 3) continue;
  let l = byName.get(n); if (!l) byName.set(n, (l = []));
  l.push(e);
}

// Recorrido principal de un grupo de vías conectadas: el camino más corto entre sus dos puntos más alejados.
function dijkstra(adj, src) {
  const dist = new Map([[src, 0]]), prev = new Map(), done = new Set(), heap = [[0, src]];
  while (heap.length) {
    let bi = 0; for (let i = 1; i < heap.length; i++) if (heap[i][0] < heap[bi][0]) bi = i;
    const [d, u] = heap.splice(bi, 1)[0];
    if (done.has(u)) continue; done.add(u);
    for (const [v, w] of adj.get(u)) { const nd = d + w; if (nd < (dist.get(v) ?? Infinity)) { dist.set(v, nd); prev.set(v, u); heap.push([nd, v]); } }
  }
  return { dist, prev };
}
function simplify(pts) { // Douglas-Peucker iterativo sobre [[x, z], …]
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = 0, mi = -1;
    const ax = pts[a][0], az = pts[a][1], ex = pts[b][0] - ax, ez = pts[b][1] - az, l2 = ex * ex + ez * ez || 1e-9;
    for (let i = a + 1; i < b; i++) { let t = ((pts[i][0] - ax) * ex + (pts[i][1] - az) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t; const d = Math.hypot(pts[i][0] - ax - ex * t, pts[i][1] - az - ez * t); if (d > md) { md = d; mi = i; } }
    if (md > TOL) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const items = [];
for (const [name, ways] of byName) {
  const pos = new Map(), adj = new Map();
  for (const w of ways) for (let i = 0; i < w.nodes.length; i++) {
    const id = w.nodes[i], g = w.geometry[i];
    if (!pos.has(id)) { pos.set(id, [(g.lon - CORE.west) * M_PER_DEG_LON, (CORE.north - g.lat) * M_PER_DEG_LAT]); adj.set(id, []); }
    if (i) { const a = w.nodes[i - 1], pa = pos.get(a), pb = pos.get(id), d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]); adj.get(a).push([id, d]); adj.get(id).push([a, d]); }
  }
  // En OSM un mismo sendero suele venir cortado: un tramo sin nombre en el medio o dos vías que no comparten nodo.
  // Los cabos sueltos que quedan a menos de 90 m de otro trozo del mismo nombre se empalman.
  const comp = new Map(); let nc = 0;
  for (const s of pos.keys()) { if (comp.has(s)) continue; const st = [s]; comp.set(s, nc); while (st.length) { const u = st.pop(); for (const [v] of adj.get(u)) if (!comp.has(v)) { comp.set(v, nc); st.push(v); } } nc++; }
  if (nc > 1) for (const [id, l] of adj) {
    if (l.length !== 1) continue;
    const p = pos.get(id); let best = null, bd = 90;
    for (const [o, q] of pos) { if (comp.get(o) === comp.get(id)) continue; const d = Math.hypot(p[0] - q[0], p[1] - q[1]); if (d < bd) { bd = d; best = o; } }
    if (best !== null) { l.push([best, bd]); adj.get(best).push([id, bd]); }
  }
  const seen = new Set();
  for (const start of pos.keys()) {
    if (seen.has(start)) continue;
    const a = dijkstra(adj, start); for (const k of a.dist.keys()) seen.add(k);
    let A = start, da = 0; for (const [k, d] of a.dist) if (d > da) { da = d; A = k; }
    const b = dijkstra(adj, A);
    let B = A, db = 0; for (const [k, d] of b.dist) if (d > db) { db = d; B = k; }
    if (db < MIN_LEN) continue;
    let pts = []; for (let k = B; k !== undefined; k = b.prev.get(k)) pts.push(pos.get(k));
    if (pts.some(([x, z]) => x < 0 || z < 0 || x > SX || z > SZ)) pts = pts.filter(([x, z]) => x >= 0 && z >= 0 && x <= SX && z <= SZ);
    if (pts.length < 2) continue;
    // Perfil cada ~25 m, suavizado: el DEM de 34 m mete escalones que inflarían el desnivel.
    const prof = [];
    for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), n = Math.max(1, Math.round(d / 25)); for (let s = i === 1 ? 0 : 1; s <= n; s++) prof.push(heightAt(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * s / n, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * s / n)); }
    const sm = prof.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - 3); k <= Math.min(prof.length - 1, i + 3); k++) { s += prof[k]; c++; } return s / c; });
    if (sm[0] > sm[sm.length - 1]) { pts.reverse(); sm.reverse(); } // siempre de abajo hacia arriba
    let up = 0, ref = sm[0]; for (const h of sm) { if (h > ref + 4) { up += h - ref; ref = h; } else if (h < ref - 4) ref = h; }
    const sp = simplify(pts);
    let len = 0; for (let i = 1; i < sp.length; i++) len += Math.hypot(sp[i][0] - sp[i - 1][0], sp[i][1] - sp[i - 1][1]);
    items.push([name, Math.round(len), Math.round(up), Math.round(sm[0]), Math.round(sm[sm.length - 1]), Math.round(Math.max(...sm)), sp.flatMap(([x, z]) => [Math.round(x), Math.round(z)])]);
  }
}
items.sort((a, b) => b[1] - a[1]);
const body = JSON.stringify({ v: 1, items });
await fs.writeFile(out, body);
console.log(`${items.length} senderos con nombre (${(items.reduce((s, i) => s + i[1], 0) / 1000).toFixed(0)} km) → ${path.basename(out)}, ${(body.length / 1024).toFixed(0)} KB sin comprimir`);
if (process.argv.includes('--ver')) for (const [n, len, up, lo, hi, top, p] of items) console.log(`  ${n.padEnd(48)} ${(len / 1000).toFixed(1).padStart(5)} km  +${String(up).padStart(4)} m  ${lo} → ${hi} m (máx ${top})  (${p.length / 2} pts)`);
