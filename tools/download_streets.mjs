// Calles menores (terciarias, residenciales, pasajes) de todo el área, por teselas chicas: una sola consulta
// para Santiago completo no pasa por los límites de Overpass. Reintenta con paciencia y retoma donde quedó.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { RAW, CORE } from './config.mjs';

const UA = 'cordillera-game-builder/1.0';
const HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const DLON = 0.1, DLAT = 0.125, dir = path.join(RAW, 'streets');
await fs.mkdir(dir, { recursive: true });

const tiles = [];
for (let lat = CORE.south; lat < CORE.north - 1e-9; lat += DLAT) for (let lon = CORE.west; lon < CORE.east - 1e-9; lon += DLON)
  tiles.push([lat, lon, Math.min(CORE.north, lat + DLAT), Math.min(CORE.east, lon + DLON)]);
// Primero la ciudad (oeste), que es lo que más importa si el servicio se cae a medio camino.
tiles.sort((a, b) => a[1] - b[1] || b[0] - a[0]);

let done = 0, failed = 0;
for (const [s, w, n, e] of tiles) {
  const file = path.join(dir, `${s.toFixed(3)}_${w.toFixed(3)}.json`);
  if (existsSync(file)) { done++; continue; }
  const q = `[out:json][timeout:120][maxsize:536870912];way[highway~"^(tertiary|tertiary_link|residential|living_street|unclassified)$"](${s},${w},${n},${e});out geom;`;
  let ok = false;
  for (let attempt = 0; attempt < 14 && !ok; attempt++) {
    const host = HOSTS[attempt % HOSTS.length];
    try {
      const res = await fetch(host, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' }, body: 'data=' + encodeURIComponent(q), signal: AbortSignal.timeout(150000) });
      const text = await res.text();
      if (!res.ok || !text.trimStart().startsWith('{')) throw new Error(`HTTP ${res.status}`);
      const els = JSON.parse(text).elements;
      // Solo lo necesario: id, tipo de vía y geometría.
      await fs.writeFile(file, JSON.stringify(els.map((x) => ({ id: x.id, h: x.tags?.highway, t: x.tags?.tunnel ? 1 : 0, g: x.geometry?.map((p) => [p.lat, p.lon]) }))));
      console.log(`tesela ${++done}/${tiles.length} (${s.toFixed(2)}, ${w.toFixed(2)}): ${els.length} vías`);
      ok = true;
    } catch (err) {
      await new Promise((r) => setTimeout(r, 6000 + attempt * 3000));
    }
  }
  if (!ok) { failed++; console.log(`tesela (${s.toFixed(2)}, ${w.toFixed(2)}): sin respuesta, se reintenta en la próxima corrida`); }
  await new Promise((r) => setTimeout(r, 1500));
}
console.log(`listo: ${done} teselas, ${failed} pendientes`);
