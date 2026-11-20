// Calles menores desde un extracto OSM en PBF (raw/pbf/chile.osm.pbf, de download.geofabrik.de):
// más confiable que Overpass, que no entrega una ciudad completa de una vez.
// Deja raw/streets/pbf.json en el mismo formato compacto que download_streets.mjs; después va build_streets.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createOSMStream } from 'osm-pbf-parser-node';
import { RAW, CORE } from './config.mjs';

const KEEP = new Set(['tertiary', 'tertiary_link', 'residential', 'living_street', 'unclassified']);
const PAD = 0.02, file = path.join(RAW, 'pbf', 'chile.osm.pbf');

// Nodos dentro del área, en arreglos tipados (el archivo viene ordenado por id → búsqueda binaria).
let cap = 1 << 22, n = 0, ids = new Float64Array(cap), xy = new Float32Array(cap * 2);
const find = (id) => { let a = 0, b = n - 1; while (a <= b) { const m = (a + b) >> 1; if (ids[m] === id) return m; if (ids[m] < id) a = m + 1; else b = m - 1; } return -1; };
const out = []; let nodes = 0, ways = 0, sorted = true;
for await (const it of createOSMStream(file, { withTags: { node: [], way: ['highway', 'tunnel'], relation: [] }, withInfo: false })) {
  if (it.type === 'node') {
    if (++nodes % 20e6 === 0) console.log(`  ${nodes / 1e6} M nodos leídos, ${n} en el área`);
    if (it.lon < CORE.west - PAD || it.lon > CORE.east + PAD || it.lat < CORE.south - PAD || it.lat > CORE.north + PAD) continue;
    if (n === cap) { cap *= 2; const i2 = new Float64Array(cap), x2 = new Float32Array(cap * 2); i2.set(ids); x2.set(xy); ids = i2; xy = x2; }
    if (n && it.id < ids[n - 1]) sorted = false;
    ids[n] = it.id; xy[n * 2] = it.lat; xy[n * 2 + 1] = it.lon; n++;
  } else if (it.type === 'way') {
    if (!sorted) throw new Error('el PBF no viene ordenado por id: la búsqueda binaria no sirve');
    const h = it.tags?.highway; if (!KEEP.has(h)) continue;
    const g = []; let inside = false;
    for (const ref of it.refs) {
      const k = find(ref); if (k < 0) continue;
      const lat = xy[k * 2], lon = xy[k * 2 + 1];
      if (lon >= CORE.west && lon <= CORE.east && lat >= CORE.south && lat <= CORE.north) inside = true;
      g.push([+lat.toFixed(6), +lon.toFixed(6)]);
    }
    if (inside && g.length > 1) { out.push({ id: it.id, h, t: it.tags.tunnel && it.tags.tunnel !== 'no' ? 1 : 0, g }); ways++; }
  } else if (it.type === 'relation') break; // las relaciones vienen al final y no se usan
}
await fs.mkdir(path.join(RAW, 'streets'), { recursive: true });
await fs.writeFile(path.join(RAW, 'streets', 'pbf.json'), JSON.stringify(out));
const by = {}; for (const w of out) by[w.h] = (by[w.h] || 0) + 1;
console.log(`${nodes} nodos leídos, ${n} en el área; ${ways} vías:`, by);
