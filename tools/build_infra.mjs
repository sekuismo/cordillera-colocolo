// raw/infra.json (ver extract_infra.mjs) → data/infra.json: puentes, líneas de alta tensión, tuberías a la vista y
// andariveles, en coordenadas del mundo (decímetros enteros), más las etiquetas de rutas y puentes con nombre.
// La geometría 3D se arma en el navegador (src/infra.js), porque la altura exacta del terreno solo existe ahí.
import fs from 'node:fs/promises';
import path from 'node:path';
import { RAW, DATA, CORE, M_PER_DEG_LAT, M_PER_DEG_LON } from './config.mjs';

const raw = JSON.parse(await fs.readFile(path.join(RAW, 'infra.json'), 'utf8'));
const W = (CORE.east - CORE.west) * M_PER_DEG_LON, H = (CORE.north - CORE.south) * M_PER_DEG_LAT;
const XZ = (g) => g.map(([lat, lon]) => [(lon - CORE.west) * M_PER_DEG_LON, (CORE.north - lat) * M_PER_DEG_LAT]);
const len = (p) => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return l; };
const inside = (p, pad = 0) => p.some(([x, z]) => x > pad && z > pad && x < W - pad && z < H - pad);
const pack = (p) => p.flatMap(([x, z]) => [Math.round(x * 10), Math.round(z * 10)]);
const at = (p, s) => { // punto a `s` metros del inicio
  for (let i = 1; i < p.length; i++) { const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); if (s <= d || i === p.length - 1) { const t = Math.min(1, s / (d || 1)); return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; } s -= d; }
  return p[0];
};
function simplify(pts, tol) {
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

// ---------- Puentes ----------
// Mismos anchos con que se pinta cada vía sobre el terreno (build_osm.mjs y build_streets.mjs): el tablero la tapa justa.
const ROAD_W = { motorway: 16, trunk: 12, primary: 9, secondary: 8, tertiary: 7, unclassified: 6, residential: 5.5, living_street: 4.5, service: 4.5, track: 3.6,
  motorway_link: 8, trunk_link: 7, primary_link: 7, secondary_link: 6.5, tertiary_link: 6 };
const FOOT = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'bridleway']);
let parts = raw.bridges.filter((b) => ROAD_W[b.h] || FOOT.has(b.h)).map((b) => ({ h: b.h, name: b.name, pts: XZ(b.g) }));
// OSM corta un mismo puente en varios tramos: se cosen los que comparten extremo, tipo de vía y nombre.
const key = (p) => Math.round(p[0] * 2) + ',' + Math.round(p[1] * 2);
for (let merged = true; merged;) {
  merged = false;
  const ends = new Map();
  for (const b of parts) for (const e of [b.pts[0], b.pts[b.pts.length - 1]]) { const k = key(e); ends.set(k, [...(ends.get(k) || []), b]); }
  for (const [k, list] of ends) {
    if (list.length !== 2 || list[0] === list[1] || list[0].dead || list[1].dead) continue;
    const [a, b] = list; if (a.h !== b.h || (a.name && b.name && a.name !== b.name)) continue;
    if (key(a.pts[a.pts.length - 1]) !== k) a.pts.reverse();
    if (key(b.pts[0]) !== k) b.pts.reverse();
    a.pts = a.pts.concat(b.pts.slice(1)); a.name ||= b.name; b.dead = true; merged = true;
  }
  parts = parts.filter((b) => !b.dead);
}
const bridges = [], labels = [];
for (const b of parts) {
  const L = len(b.pts); if (L < 6 || L > 2500 || !inside(b.pts, 1800)) continue; // lo más corto es una alcantarilla
  const foot = FOOT.has(b.h);
  bridges.push([foot ? -20 : Math.round(ROAD_W[b.h] * 10), pack(simplify(b.pts, 0.4))]);
  if (b.name) labels.push({ name: b.name.replace(/\s+/g, ' ').trim(), note: `${Math.round(L)} m`, kind: 'puente', rank: 3, p: at(b.pts, L / 2), L });
}
// Las calzadas dobles traen el mismo nombre dos veces: queda el puente más largo.
labels.sort((a, b) => b.L - a.L);
const kept = [];
for (const l of labels) if (!kept.some((k) => k.name === l.name && Math.hypot(k.p[0] - l.p[0], k.p[1] - l.p[1]) < 400)) kept.push(l);

// ---------- Rutas con rol (G-25, Ruta 5…): una etiqueta cada tantos km a lo largo de cada una ----------
const routes = raw.routes.map((r) => ({ ref: r.ref.split(';')[0].trim(), name: (r.name || '').trim(), h: r.h, pts: XZ(r.g) })).filter((r) => r.ref && inside(r.pts, 1800));
const byRef = new Map();
for (const r of routes) byRef.set(r.ref, [...(byRef.get(r.ref) || []), r]);
for (const [ref, ways] of byRef) {
  const major = ways.some((w) => /motorway|trunk|primary/.test(w.h)), gap = major ? 7000 : 4500, placed = [];
  if (ways.reduce((s, w) => s + len(w.pts), 0) < 1500) continue;
  for (const w of ways.sort((a, b) => len(b.pts) - len(a.pts))) {
    const L = len(w.pts);
    for (let s = L / 2; s < L; s += gap) {
      const p = at(w.pts, s);
      if (p[0] < 1800 || p[1] < 1800 || p[0] > W - 1800 || p[1] > H - 1800 || placed.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < gap)) continue;
      placed.push(p);
      const note = w.name && !new RegExp(`^(ruta )?${ref}$`, 'i').test(w.name) ? w.name : '';
      kept.push({ name: /^\d+$/.test(ref) ? `Ruta ${ref}` : ref, note, kind: 'ruta', rank: major ? 2 : 3, p });
    }
  }
}

// ---------- Alta tensión, tuberías y andariveles ----------
const power = raw.power.map((p) => [p.kv || 0, XZ(p.g)]).filter(([, p]) => inside(p, 1800) && p.length > 1).map(([kv, p]) => [kv, pack(p)]);
const pipes = raw.pipes.map((p) => XZ(p.g)).filter((p) => inside(p, 1800) && len(p) > 12).map((p) => pack(simplify(p, 0.5)));
const lifts = raw.lifts.map((p) => XZ(p.g)).filter((p) => inside(p, 1800) && len(p) > 120).map((p) => pack(simplify(p, 1)));

const out = { bridges, power, pipes, lifts, labels: kept.map((l) => [l.name, l.note, l.kind, Math.round(l.p[0]), Math.round(l.p[1]), l.rank]) };
const file = path.join(DATA, 'infra.json');
await fs.writeFile(file, JSON.stringify(out));
console.log({ puentes: bridges.length, peatonales: bridges.filter((b) => b[0] < 0).length, lineas: power.length, torres: power.reduce((s, p) => s + p[1].length / 2, 0), tuberias: pipes.length, andariveles: lifts.length,
  etiquetasPuente: kept.filter((l) => l.kind === 'puente').length, etiquetasRuta: kept.filter((l) => l.kind === 'ruta').length, kB: Math.round((await fs.stat(file)).size / 1024) });
