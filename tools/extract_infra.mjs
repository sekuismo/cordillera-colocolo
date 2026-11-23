// Infraestructura desde el extracto PBF de OSM (raw/pbf/chile.osm.pbf): puentes con su geometría, torres y
// líneas de alta tensión, tuberías a la vista, ferrocarril (también el abandonado), andariveles y represas.
// Deja raw/infra.json; después va build_infra.mjs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createOSMStream } from 'osm-pbf-parser-node';
import { RAW, CORE } from './config.mjs';

const PAD = 0.02, file = path.join(RAW, 'pbf', 'chile.osm.pbf');
const inCore = (lat, lon) => lon >= CORE.west && lon <= CORE.east && lat >= CORE.south && lat <= CORE.north;
let cap = 1 << 22, n = 0, ids = new Float64Array(cap), xy = new Float32Array(cap * 2);
const find = (id) => { let a = 0, b = n - 1; while (a <= b) { const m = (a + b) >> 1; if (ids[m] === id) return m; if (ids[m] < id) a = m + 1; else b = m - 1; } return -1; };

const out = { bridges: [], power: [], towers: [], pipes: [], rails: [], lifts: [], dams: [], routes: [] };
const WAY_TAGS = ['highway', 'bridge', 'bridge:name', 'name', 'ref', 'layer', 'power', 'man_made', 'location', 'railway', 'aerialway', 'waterway', 'tunnel', 'voltage'];
const ROUTE = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
for await (const it of createOSMStream(file, { withTags: { node: ['power'], way: WAY_TAGS, relation: [] }, withInfo: false })) {
  if (it.type === 'node') {
    if (it.lon < CORE.west - PAD || it.lon > CORE.east + PAD || it.lat < CORE.south - PAD || it.lat > CORE.north + PAD) continue;
    if (n === cap) { cap *= 2; const i2 = new Float64Array(cap), x2 = new Float32Array(cap * 2); i2.set(ids); x2.set(xy); ids = i2; xy = x2; }
    ids[n] = it.id; xy[n * 2] = it.lat; xy[n * 2 + 1] = it.lon; n++;
    if (it.tags?.power === 'tower' && inCore(it.lat, it.lon)) out.towers.push([+it.lat.toFixed(6), +it.lon.toFixed(6)]);
  } else if (it.type === 'way') {
    const t = it.tags || {};
    const kind = t.highway && t.bridge && t.bridge !== 'no' ? 'bridges'
      : t.power === 'line' ? 'power'
      : t.man_made === 'pipeline' && t.location !== 'underground' && t.tunnel !== 'yes' ? 'pipes'
      : t.railway && /^(rail|narrow_gauge|abandoned|disused|preserved)$/.test(t.railway) && (!t.tunnel || t.tunnel === 'no') ? 'rails'
      : t.aerialway && !/station|pylon/.test(t.aerialway) ? 'lifts'
      : t.waterway === 'dam' ? 'dams'
      : t.highway && ROUTE.has(t.highway) && t.ref && (!t.tunnel || t.tunnel === 'no') ? 'routes' : null;
    if (!kind) continue;
    const g = []; let inside = false;
    for (const ref of it.refs) { const k = find(ref); if (k < 0) continue; const lat = xy[k * 2], lon = xy[k * 2 + 1]; if (inCore(lat, lon)) inside = true; g.push([+lat.toFixed(6), +lon.toFixed(6)]); }
    if (!inside || g.length < 2) continue;
    const o = { id: it.id, g };
    if (kind === 'bridges') { o.h = t.highway; o.name = t['bridge:name'] || (/^puente/i.test(t.name || '') ? t.name : ''); o.road = t.name || ''; o.ref = t.ref || ''; }
    else if (kind === 'routes') { o.h = t.highway; o.name = t.name || ''; o.ref = t.ref; }
    else if (kind === 'rails') { o.s = t.railway; o.name = t.name || ''; }
    else if (kind === 'lifts' || kind === 'dams') o.name = t.name || '';
    else if (kind === 'power') o.kv = Math.round((parseInt(t.voltage, 10) || 0) / 1000);
    out[kind].push(o);
  } else if (it.type === 'relation') break;
}
await fs.writeFile(path.join(RAW, 'infra.json'), JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
console.log('puentes con nombre:', out.bridges.filter((b) => b.name).map((b) => b.name).slice(0, 40).join(' | '));
const byH = {}; for (const b of out.bridges) byH[b.h] = (byH[b.h] || 0) + 1; console.log('puentes por tipo de vía:', byH);
console.log('ferrocarril:', [...new Set(out.rails.map((r) => r.s + (r.name ? ' ' + r.name : '')))].slice(0, 15).join(' | '));
