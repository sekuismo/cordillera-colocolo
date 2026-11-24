// Nombres de las calles (OSM) por zona de 4 km → data/zones/names/{ix}_{iz}.json, más un índice de qué zonas tienen.
// El juego baja solo las zonas que rodean al jugador y pone el nombre sobre la calle por la que va.
// Sale del mismo extracto PBF que las calles menores (raw/pbf/chile.osm.pbf, de download.geofabrik.de).
//
// Formato de cada zona: [[nombre, clase, [x0, z0, x1, z1, …], [otro tramo…]], …], en metros enteros relativos a la
// esquina de la zona. clase: 0 autopistas y avenidas principales, 1 calles colectoras, 2 el resto (pasajes incluidos).
import fs from 'node:fs/promises';
import path from 'node:path';
import { createOSMStream } from 'osm-pbf-parser-node';
import { RAW, DATA, CORE, M_PER_DEG_LAT, M_PER_DEG_LON } from './config.mjs';

const ZONE = 4096;
const CLASS = { motorway: 0, trunk: 0, primary: 0, secondary: 0, tertiary: 1, residential: 2, living_street: 2, unclassified: 2, pedestrian: 2, service: 2, track: 2 };
const PAD = 0.02, file = path.join(RAW, 'pbf', 'chile.osm.pbf');

let cap = 1 << 22, n = 0, ids = new Float64Array(cap), xy = new Float32Array(cap * 2);
const find = (id) => { let a = 0, b = n - 1; while (a <= b) { const m = (a + b) >> 1; if (ids[m] === id) return m; if (ids[m] < id) a = m + 1; else b = m - 1; } return -1; };
const zones = new Map(); // "ix_iz" → Map(nombre → { c, t: [tramos] })
let nodes = 0, ways = 0, sorted = true;
for await (const it of createOSMStream(file, { withTags: { node: [], way: ['highway', 'name'], relation: [] }, withInfo: false })) {
  if (it.type === 'node') {
    if (++nodes % 20e6 === 0) console.log(`  ${nodes / 1e6} M nodos leídos, ${n} en el área`);
    if (it.lon < CORE.west - PAD || it.lon > CORE.east + PAD || it.lat < CORE.south - PAD || it.lat > CORE.north + PAD) continue;
    if (n === cap) { cap *= 2; const i2 = new Float64Array(cap), x2 = new Float32Array(cap * 2); i2.set(ids); x2.set(xy); ids = i2; xy = x2; }
    if (n && it.id < ids[n - 1]) sorted = false;
    ids[n] = it.id; xy[n * 2] = it.lat; xy[n * 2 + 1] = it.lon; n++;
  } else if (it.type === 'way') {
    if (!sorted) throw new Error('el PBF no viene ordenado por id: la búsqueda binaria no sirve');
    const cls = CLASS[it.tags?.highway], name = it.tags?.name;
    if (cls === undefined || !name) continue;
    // Polilínea en metros del mundo, partida por zona: cada zona se queda con los tramos que la pisan.
    const pts = [];
    for (const ref of it.refs) { const k = find(ref); if (k >= 0) pts.push((xy[k * 2 + 1] - CORE.west) * M_PER_DEG_LON, (CORE.north - xy[k * 2]) * M_PER_DEG_LAT); }
    if (pts.length < 4) continue;
    const touched = new Set();
    for (let i = 0; i < pts.length; i += 2) touched.add(Math.floor(pts[i] / ZONE) + '_' + Math.floor(pts[i + 1] / ZONE));
    for (const key of touched) {
      const [ix, iz] = key.split('_').map(Number);
      if (ix < 0 || iz < 0 || ix * ZONE > (CORE.east - CORE.west) * M_PER_DEG_LON || iz * ZONE > (CORE.north - CORE.south) * M_PER_DEG_LAT) continue;
      let z = zones.get(key); if (!z) zones.set(key, (z = new Map()));
      let e = z.get(name); if (!e) z.set(name, (e = { c: cls, t: [] }));
      e.c = Math.min(e.c, cls);
      e.t.push(pts.map((v, i) => Math.round(v - (i % 2 ? iz : ix) * ZONE)));
    }
    ways++;
  } else if (it.type === 'relation') break;
}
const dir = path.join(DATA, 'zones', 'names');
await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true });
let bytes = 0, names = 0;
for (const [key, z] of zones) {
  const body = JSON.stringify([...z].map(([name, e]) => [name, e.c, ...e.t]));
  await fs.writeFile(path.join(dir, key + '.json'), body); bytes += body.length; names += z.size;
}
await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify([...zones.keys()].sort()));
console.log(`${ways} vías con nombre → ${zones.size} zonas, ${names} nombres, ${(bytes / 1e6).toFixed(1)} MB sin comprimir`);
