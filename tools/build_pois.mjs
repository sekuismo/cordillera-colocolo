// Locales, servicios y lugares con nombre (OSM) por zona de 4 km → data/zones/pois/{ix}_{iz}.json, más un índice.
// De aquí salen los carteles del juego: el nombre real de la panadería, del almacén, de la escuela o de los bomberos,
// puesto en el edificio donde está. Sale del mismo extracto PBF que las calles (raw/pbf/chile.osm.pbf).
//
// Formato de cada zona: [[nombre, tipo, x, z], …] con x, z en metros enteros relativos a la esquina de la zona.
// tipo: 0 comercio (tiendas, almacenes) · 1 comida (restaurantes, cafés, bares) · 2 servicio público (municipalidad,
// bomberos, carabineros, salud, correo, banco) · 3 educación · 4 culto · 5 alojamiento y turismo · 6 otros.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createOSMStream } from 'osm-pbf-parser-node';
import { RAW, DATA, CORE, M_PER_DEG_LAT, M_PER_DEG_LON } from './config.mjs';

const ZONE = 4096, PAD = 0.02, file = path.join(RAW, 'pbf', 'chile.osm.pbf');
const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'ice_cream', 'food_court', 'biergarten']);
const PUBLIC = new Set(['townhall', 'fire_station', 'police', 'hospital', 'clinic', 'doctors', 'pharmacy', 'post_office', 'bank', 'courthouse', 'community_centre', 'library', 'bus_station', 'fuel', 'dentist', 'veterinary']);
const EDU = new Set(['school', 'kindergarten', 'college', 'university']);
const kindOf = (t) => {
  if (t.amenity === 'place_of_worship') return 4;
  if (EDU.has(t.amenity)) return 3;
  if (PUBLIC.has(t.amenity) || t.office === 'government') return 2;
  if (FOOD.has(t.amenity)) return 1;
  if (t.shop) return 0;
  if (t.tourism && ['hotel', 'hostel', 'guest_house', 'motel', 'camp_site', 'museum', 'information', 'attraction', 'chalet', 'alpine_hut'].includes(t.tourism)) return 5;
  if (t.amenity || t.office || t.craft || t.leisure === 'sports_centre' || t.historic) return 6;
  return -1;
};
const TAGS = ['name', 'amenity', 'shop', 'tourism', 'office', 'craft', 'leisure', 'historic'];

let cap = 1 << 22, n = 0, ids = new Float64Array(cap), xy = new Float32Array(cap * 2);
const find = (id) => { let a = 0, b = n - 1; while (a <= b) { const m = (a + b) >> 1; if (ids[m] === id) return m; if (ids[m] < id) a = m + 1; else b = m - 1; } return -1; };
const zones = new Map(); let nodes = 0, total = 0;
const put = (name, kind, lat, lon) => {
  if (lon < CORE.west || lon > CORE.east || lat < CORE.south || lat > CORE.north) return;
  const x = (lon - CORE.west) * M_PER_DEG_LON, z = (CORE.north - lat) * M_PER_DEG_LAT, ix = Math.floor(x / ZONE), iz = Math.floor(z / ZONE), key = ix + '_' + iz;
  let l = zones.get(key); if (!l) zones.set(key, (l = []));
  l.push([name.slice(0, 60), kind, Math.round(x - ix * ZONE), Math.round(z - iz * ZONE)]); total++;
};
for await (const it of createOSMStream(file, { withTags: { node: TAGS, way: TAGS, relation: [] }, withInfo: false })) {
  if (it.type === 'node') {
    if (++nodes % 20e6 === 0) console.log(`  ${nodes / 1e6} M nodos leídos, ${n} en el área`);
    if (it.lon < CORE.west - PAD || it.lon > CORE.east + PAD || it.lat < CORE.south - PAD || it.lat > CORE.north + PAD) continue;
    if (n === cap) { cap *= 2; const i2 = new Float64Array(cap), x2 = new Float32Array(cap * 2); i2.set(ids); x2.set(xy); ids = i2; xy = x2; }
    ids[n] = it.id; xy[n * 2] = it.lat; xy[n * 2 + 1] = it.lon; n++;
    if (it.tags?.name) { const k = kindOf(it.tags); if (k >= 0) put(it.tags.name, k, it.lat, it.lon); }
  } else if (it.type === 'way') {
    if (!it.tags?.name) continue;
    const k = kindOf(it.tags); if (k < 0) continue;
    let la = 0, lo = 0, c = 0; // centro del polígono (promedio de sus nodos)
    for (const ref of it.refs) { const i = find(ref); if (i >= 0) { la += xy[i * 2]; lo += xy[i * 2 + 1]; c++; } }
    if (c) put(it.tags.name, k, la / c, lo / c);
  } else if (it.type === 'relation') break;
}
const dir = path.join(DATA, 'zones', 'pois');
await fs.rm(dir, { recursive: true, force: true }); await fs.mkdir(dir, { recursive: true });
let bytes = 0;
for (const [key, l] of zones) { const body = JSON.stringify(l); await fs.writeFile(path.join(dir, key + '.json'), body); bytes += body.length; }
await fs.writeFile(path.join(dir, 'index.json'), JSON.stringify([...zones.keys()].sort()));
console.log(`${total} lugares con nombre → ${zones.size} zonas, ${(bytes / 1e6).toFixed(2)} MB sin comprimir`);
