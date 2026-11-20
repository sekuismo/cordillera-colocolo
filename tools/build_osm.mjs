// OSM → data/labels.json (nombres con prioridad) + data/lines.bin (ríos, caminos, senderos, lagos, frontera).
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { RAW, DATA, CORE, M_PER_DEG_LAT, M_PER_DEG_LON } from './config.mjs';
import { decodeDem, VarintWriter } from './codec.mjs';

const load = async (n) => JSON.parse(await fs.readFile(path.join(RAW, 'osm', `${n}.json`), 'utf8')).elements;
const X = (lon) => (lon - CORE.west) * M_PER_DEG_LON;
const Z = (lat) => (CORE.north - lat) * M_PER_DEG_LAT;
const W = (CORE.east - CORE.west) * M_PER_DEG_LON, H = (CORE.north - CORE.south) * M_PER_DEG_LAT;

const dem = decodeDem(await fs.readFile(path.join(DATA, 'core_hi.dem')));
const demAt = (x, z) => {
  const i = Math.min(dem.w - 1, Math.max(0, Math.floor((x / W) * dem.w))), j = Math.min(dem.h - 1, Math.max(0, Math.floor((z / H) * dem.h)));
  return dem.q[j * dem.w + i] * dem.step;
};
// Altura de cumbre: máximo local, porque el nodo OSM rara vez cae justo en el texel más alto.
const demPeak = (x, z) => { let m = 0; for (let dz = -60; dz <= 60; dz += 30) for (let dx = -60; dx <= 60; dx += 30) m = Math.max(m, demAt(x + dx, z + dz)); return m; };

// ---------- Etiquetas ----------
const KINDS = ['cerro', 'volcan', 'paso', 'ciudad', 'pueblo', 'villa', 'caserio', 'barrio', 'lugar', 'refugio', 'mirador', 'atractivo', 'cascada', 'termas', 'glaciar', 'lago', 'rio', 'estero', 'parque', 'ski', 'valle', 'cordon'];
const labels = [];
const add = (name, kind, lon, lat, rank, ele = null) => {
  const x = X(lon), z = Z(lat);
  if (x < 0 || z < 0 || x > W || z > H) return;
  name = name.replace(/\s+/g, ' ').trim();
  if (!name || name.length > 48) return;
  // OSM trae nombres que no son topónimos (infraestructura, descripciones en minúscula).
  if (/^[a-záéíóúñ]/.test(name) || /estanque|piscina|tejido urbano|tranque|reactor|planta |antialuvi|decantador|relave/i.test(name)) return;
  labels.push({ name, kind, x, z, rank, ele });
};
const parseEle = (s) => { const v = parseFloat(String(s ?? '').replace(/\./g, (m, o, str) => (/^\d{1,2}\.\d{3}$/.test(str) ? '' : '.')).replace(',', '.')); return Number.isFinite(v) && v > 0 && v < 7000 ? v : null; };

for (const e of await load('points')) {
  const t = e.tags, n = t.name;
  if (t.natural === 'peak' || t.natural === 'volcano') {
    const x = X(e.lon), z = Z(e.lat), d = demPeak(x, z);
    let ele = parseEle(t.ele);
    if (ele === null || Math.abs(ele - d) > 350) ele = Math.round(d);
    add(n, t.natural === 'volcano' ? 'volcan' : 'cerro', e.lon, e.lat, 3, ele);
  } else if (t.mountain_pass === 'yes') add(n, 'paso', e.lon, e.lat, 1, parseEle(t.ele));
  else if (t.natural === 'saddle') add(n, 'paso', e.lon, e.lat, 3, parseEle(t.ele));
  else if (t.place) {
    const m = { city: ['ciudad', 0], town: ['pueblo', 1], village: ['villa', 2], suburb: ['barrio', 2], hamlet: ['caserio', 3], locality: ['lugar', 3] }[t.place];
    if (m) add(n, m[0], e.lon, e.lat, m[1]);
  } else if (t.tourism === 'alpine_hut' || t.tourism === 'wilderness_hut') add(n, 'refugio', e.lon, e.lat, 2);
  else if (t.tourism === 'viewpoint') add(n, 'mirador', e.lon, e.lat, 3);
  else if (t.tourism === 'attraction') add(n, 'atractivo', e.lon, e.lat, 3);
  else if (t.waterway === 'waterfall') add(n, 'cascada', e.lon, e.lat, 3);
  else if (t.natural === 'hot_spring') add(n, 'termas', e.lon, e.lat, 2);
  else if (t.natural === 'glacier') add(n, 'glaciar', e.lon, e.lat, 2);
}
for (const e of await load('areas')) {
  const t = e.tags, c = e.center; if (!c || !t.name) continue;
  if (t.natural === 'glacier') add(t.name, 'glaciar', c.lon, c.lat, 2);
  else if (t.natural === 'water') add(t.name, 'lago', c.lon, c.lat, /embalse|laguna negra|diamante/i.test(t.name) ? 1 : 2);
  else if (t.landuse === 'winter_sports') add(t.name, 'ski', c.lon, c.lat, 1);
  else if (t.boundary === 'national_park' || t.boundary === 'protected_area' || t.leisure === 'nature_reserve') add(t.name, 'parque', c.lon, c.lat, 2);
}

for (const e of await load('relief')) {
  const t = e.tags || {}, c = e.center || e; if (!t.name || c.lat === undefined) continue;
  add(t.name, t.natural === 'valley' || t.natural === 'gorge' ? 'valle' : 'cordon', c.lon, c.lat, t.natural === 'cliff' ? 3 : 2);
}

// ---------- Geometría ----------
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
const geomOf = (g) => g.filter(Boolean).map((p) => [X(p.lon), Z(p.lat)]);
const inside = (pts, pad = 2000) => pts.some(([x, z]) => x > -pad && z > -pad && x < W + pad && z < H + pad);
const length = (pts) => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; };
const area = (pts) => { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; return Math.abs(a / 2); };

const classes = { pav: [], dirt: [], path: [], river: [], lake: [], border: [] };
const seen = new Set();
const pushLine = (cls, widthM, pts, tol) => {
  if (pts.length < 2 || !inside(pts)) return;
  classes[cls].push({ type: Math.round(widthM * 10), pts: simplify(pts, tol) });
};

for (const file of ['roads', 'trails']) for (const e of await load(file)) {
  if (e.type !== 'way' || !e.geometry || seen.has(e.id)) continue; seen.add(e.id);
  const t = e.tags || {}; if (t.tunnel && t.tunnel !== 'no') continue;
  const hw = t.highway, pts = geomOf(e.geometry);
  if (hw === 'motorway') pushLine('pav', 16, pts, 1.2);
  else if (hw === 'trunk') pushLine('pav', 12, pts, 1.2);
  else if (hw === 'primary') pushLine('pav', 9, pts, 1);
  else if (hw === 'secondary') pushLine('pav', 8, pts, 1);
  else if (hw === 'tertiary') pushLine('pav', 7, pts, 1);
  else if (hw === 'unclassified') pushLine('dirt', 5, pts, 1);
  else if (hw === 'track') pushLine('dirt', 3.6, pts, 1);
  else if (hw === 'path') pushLine('path', 1.4, pts, 0.8);
}

const riverNames = new Map();
for (const e of await load('water')) {
  const t = e.tags || {};
  if (e.type === 'way' && t.waterway) {
    if (t.tunnel && t.tunnel !== 'no') continue;
    const pts = geomOf(e.geometry); if (!inside(pts, 0)) continue;
    const isRiver = t.waterway === 'river';
    const width = isRiver ? (/maipo/i.test(t.name || '') ? 26 : /mapocho|colorado|volc[aá]n|yeso/i.test(t.name || '') ? 16 : 12) : 4;
    pushLine('river', width, pts, isRiver ? 2 : 2.5);
    if (t.name) { const k = (isRiver ? 'rio|' : 'estero|') + t.name; if (!riverNames.has(k)) riverNames.set(k, []); riverNames.get(k).push(pts); }
  } else if (t.natural === 'water') {
    let rings = [];
    if (e.type === 'way' && e.geometry) rings = [geomOf(e.geometry)];
    else if (e.type === 'relation') {
      // Coser los tramos "outer" por sus extremos hasta cerrar cada anillo.
      const parts = e.members.filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry).map((m) => geomOf(m.geometry));
      const eq = (a, b) => Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5;
      while (parts.length) {
        let ring = parts.pop(), grew = true;
        while (grew && !eq(ring[0], ring[ring.length - 1])) {
          grew = false;
          for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (eq(ring[ring.length - 1], p[0])) ring = ring.concat(p.slice(1));
            else if (eq(ring[ring.length - 1], p[p.length - 1])) ring = ring.concat(p.slice(0, -1).reverse());
            else continue;
            parts.splice(i, 1); grew = true; break;
          }
        }
        rings.push(ring);
      }
    }
    for (const ring of rings) {
      if (ring.length < 4 || !inside(ring, 0)) continue;
      const a = area(ring); if (a < 600) continue;
      const s = simplify(ring, a > 2e5 ? 3 : 1.5);
      if (s.length >= 4) classes.lake.push({ type: 0, pts: s });
    }
  }
}
// Etiquetas de ríos: una cada ~7 km a lo largo de cada curso con nombre.
for (const [k, ways] of riverNames) {
  const [kind, name] = k.split('|');
  const total = ways.reduce((s, w) => s + length(w), 0);
  if (kind === 'estero' && total < 1500) continue;
  const placed = [];
  for (const w of ways) {
    const mid = w[Math.floor(w.length / 2)];
    if (placed.every((p) => Math.hypot(p[0] - mid[0], p[1] - mid[1]) > 7000)) {
      placed.push(mid);
      labels.push({ name, kind, x: mid[0], z: mid[1], rank: kind === 'rio' ? 1 : 3, ele: null });
    }
  }
}
for (const e of await load('border')) if (e.type === 'way' && e.geometry) pushLine('border', 30, geomOf(e.geometry), 8);

// ---------- Prioridad de cumbres por aislamiento (distancia a la cumbre más alta más cercana) ----------
const peaks = labels.filter((l) => l.kind === 'cerro' || l.kind === 'volcan');
for (const p of peaks) {
  let iso = Infinity;
  for (const o of peaks) if (o.ele > p.ele + 1) iso = Math.min(iso, Math.hypot(o.x - p.x, o.z - p.z));
  p.iso = iso;
  p.rank = iso > 11000 ? 0 : iso > 4500 || (p.ele >= 5600 && iso > 1500) ? 1 : iso > 1800 ? 2 : 3;
  if (p.ele < 1300 && p.rank === 0) p.rank = 1; // cerros isla del valle: aislados, pero no son hitos de la cordillera
  if (/^Cumbre /.test(p.name)) p.rank = 9;      // "Cumbre Norte/Sur": subcumbres sin nombre propio
}
// Cumbres duplicadas en OSM (nodo "peak" + nodo "volcano" del mismo macizo): gana la más aislada.
for (const p of peaks) for (const o of peaks)
  if (o !== p && p.rank < 9 && o.rank < 9 && Math.hypot(o.x - p.x, o.z - p.z) < 2500 && o.name.replace(/^(Cerro|Volcán|Nevado) /, '') === p.name.replace(/^(Cerro|Volcán|Nevado) /, ''))
    (o.kind === 'volcan' ? p : o).rank = 9;
// Deduplicar (mismo nombre y tipo a menos de 1,5 km; gana el de mejor prioridad).
labels.sort((a, b) => a.rank - b.rank);
const out = [];
for (const l of labels) {
  const inBounds = l.x >= 0 && l.z >= 0 && l.x <= W && l.z <= H;
  if (!inBounds || l.rank > 3) continue;
  if (out.some((o) => o.name === l.name && o.kind === l.kind && Math.hypot(o.x - l.x, o.z - l.z) < (l.kind === 'rio' || l.kind === 'estero' ? 6000 : 1500))) continue;
  out.push(l);
}
await fs.writeFile(path.join(DATA, 'labels.json'), JSON.stringify({
  kinds: KINDS,
  items: out.map((l) => [l.name, KINDS.indexOf(l.kind), Math.round(l.x), Math.round(l.z), l.rank, l.ele ? Math.round(l.ele) : 0]),
}));
const byKind = {}; for (const l of out) byKind[l.kind] = (byKind[l.kind] || 0) + 1;
console.log('etiquetas:', out.length, byKind);
console.log('top cumbres:', out.filter((l) => l.kind === 'cerro' || l.kind === 'volcan').filter((l) => l.rank === 0).map((l) => `${l.name} ${l.ele}`).join(' | '));

// ---------- Líneas: cabecera JSON + varints (coordenadas en 0,5 m, deltas zigzag) ----------
const UNIT = 0.5, vw = new VarintWriter(), header = { unit: UNIT, classes: [] };
for (const [name, list] of Object.entries(classes)) {
  header.classes.push({ name, count: list.length });
  let pts = 0;
  for (const pl of list) {
    vw.u(pl.type); vw.u(pl.pts.length);
    let px = 0, pz = 0;
    for (const [x, z] of pl.pts) { const qx = Math.round(x / UNIT), qz = Math.round(z / UNIT); vw.s(qx - px); vw.s(qz - pz); px = qx; pz = qz; }
    pts += pl.pts.length;
  }
  console.log(`${name}: ${list.length} polilíneas, ${pts} puntos`);
}
const hj = Buffer.from(JSON.stringify(header)), len = Buffer.alloc(4); len.writeUInt32LE(hj.length);
const gz = zlib.gzipSync(Buffer.concat([len, hj, vw.bytes()]), { level: 9 });
await fs.writeFile(path.join(DATA, 'lines.bin'), gz);
console.log(`lines.bin: ${(gz.length / 1e6).toFixed(2)} MB`);
