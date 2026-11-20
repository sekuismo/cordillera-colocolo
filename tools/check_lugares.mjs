// Compara las coordenadas de src/lugares.js con la etiqueta OSM más parecida, para detectar puntos mal ubicados.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA, ROOT, CORE, M_PER_DEG_LAT, M_PER_DEG_LON } from './config.mjs';
import { decodeDem } from './codec.mjs';

const { LUGARES } = await import(pathToFileURL(path.join(ROOT, 'src', 'lugares.js')).href);
const lab = JSON.parse(await fs.readFile(path.join(DATA, 'labels.json'), 'utf8'));
const dem = decodeDem(await fs.readFile(path.join(DATA, 'core_lo.dem')));
const W = (CORE.east - CORE.west) * M_PER_DEG_LON, H = (CORE.north - CORE.south) * M_PER_DEG_LAT;
const STOP = new Set(['cerro', 'volcan', 'de', 'del', 'el', 'la', 'los', 'las', 'rio', 'embalse', 'nevado', 'parque', 'nacional', 'monumento', 'natural', 'santuario', 'termas', 'mina', 'paso', 'y', 'glaciar', 'laguna', 'falla', 'quebrada', 'entrada', 'al', 'nacimiento', 'valle']);
const words = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z]+/).filter((w) => w && !STOP.has(w));

for (const l of LUGARES) {
  const x = (l.lon - CORE.west) * M_PER_DEG_LON, z = (CORE.north - l.lat) * M_PER_DEG_LAT;
  const ele = dem.q[Math.floor((z / H) * dem.h) * dem.w + Math.floor((x / W) * dem.w)] * dem.step;
  const key = words(l.n);
  let best = null;
  for (const [name, kind, lx, lz, , e] of lab.items) {
    const w = words(name);
    if (!key.length || !key.every((k) => w.includes(k))) continue;
    const d = Math.hypot(lx - x, lz - z);
    if (!best || d < best.d) best = { name, kind: lab.kinds[kind], d, e, lat: CORE.north - lz / M_PER_DEG_LAT, lon: CORE.west + lx / M_PER_DEG_LON };
  }
  const flag = !best ? '??' : best.d > l.r ? '!!' : 'ok';
  console.log(`${flag} ${l.id.padEnd(14)} dem=${String(Math.round(ele)).padStart(4)}m  ${best ? `${best.name} [${best.kind}] a ${Math.round(best.d)} m (${best.lat.toFixed(4)}, ${best.lon.toFixed(4)}) ele=${best.e}` : 'sin coincidencia OSM'}`);
}
