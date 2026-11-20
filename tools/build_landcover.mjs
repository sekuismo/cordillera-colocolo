// Cobertura de suelo real → data/land_{hi,lo}.bin (1 byte por texel, gzip).
// Base: ESA WorldCover 2021 (10 m, CC BY 4.0), leído por rangos HTTP desde su COG (solo la ventana del juego).
// Encima: polígonos OSM de lo que plantó la gente (viñas, frutales, plantaciones, parques) y glaciares.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fromUrl } from 'geotiff';
import { RAW, DATA, CORE, CORE_HI, CORE_LO } from './config.mjs';

export const CLASSES = ['sin dato', 'bosque', 'matorral', 'pradera', 'cultivo', 'urbano', 'suelo desnudo', 'nieve y hielo', 'agua', 'humedal', 'viña', 'frutales', 'parque', 'plantación', 'glaciar'];
const WC = { 10: 1, 20: 2, 30: 3, 40: 4, 50: 5, 60: 6, 70: 7, 80: 8, 90: 9, 95: 9, 100: 6 };
const URL = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_S36W072_Map.tif';
const { w: W, h: H } = CORE_HI;

// --- 1) ventana de WorldCover a 20 m (overview 1), cacheada en /raw
const cache = path.join(RAW, 'landcover', 'worldcover_20m.bin');
let src, sw, sh;
{
  const tiff = await fromUrl(URL), img = await tiff.getImage(1);
  const [bw, bs, be, bn] = (await tiff.getImage(0)).getBoundingBox(), iw = img.getWidth(), ih = img.getHeight();
  const x0 = Math.floor(((CORE.west - bw) / (be - bw)) * iw), x1 = Math.ceil(((CORE.east - bw) / (be - bw)) * iw);
  const y0 = Math.floor(((bn - CORE.north) / (bn - bs)) * ih), y1 = Math.ceil(((bn - CORE.south) / (bn - bs)) * ih);
  sw = x1 - x0; sh = y1 - y0;
  if (existsSync(cache)) src = new Uint8Array(await fs.readFile(cache));
  else {
    await fs.mkdir(path.dirname(cache), { recursive: true });
    src = new Uint8Array(sw * sh);
    for (let y = y0; y < y1; y += 1024) { // por franjas, para no pedir todo de una vez
      const yb = Math.min(y1, y + 1024), r = await img.readRasters({ window: [x0, y, x1, yb], interleave: true });
      src.set(r, (y - y0) * sw);
      console.log(`  WorldCover ${Math.round(((yb - y0) / sh) * 100)} %`);
    }
    await fs.writeFile(cache, src);
  }
  console.log(`WorldCover: ventana ${sw}x${sh}`);
}

// --- 2) remuestreo por mayoría al grid del juego
const hi = new Uint8Array(W * H), count = new Uint8Array(16);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  count.fill(0);
  let best = 0, bn = 0;
  for (const fj of [0.2, 0.5, 0.8]) for (const fi of [0.2, 0.5, 0.8]) {
    const c = WC[src[Math.min(sh - 1, Math.floor(((j + fj) / H) * sh)) * sw + Math.min(sw - 1, Math.floor(((i + fi) / W) * sw))]] || 0;
    if (++count[c] > bn) { bn = count[c]; best = c; }
  }
  hi[j * W + i] = best;
}

// --- 3) polígonos OSM encima (relleno por líneas de barrido)
const X = (lon) => ((lon - CORE.west) / (CORE.east - CORE.west)) * W, Y = (lat) => ((CORE.north - lat) / (CORE.north - CORE.south)) * H;
function fill(rings, cls) { // regla par-impar: los anillos interiores quedan como huecos
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  for (let j = Math.max(0, Math.ceil(y0 - 0.5)); j <= Math.min(H - 1, Math.floor(y1 - 0.5)); j++) {
    const yc = j + 0.5, xs = [];
    for (const r of rings) for (let k = 0, n = r.length; k < n; k++) {
      const a = r[k], b = r[(k + 1) % n];
      if ((a[1] > yc) !== (b[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let i = Math.max(0, Math.ceil(xs[k] - 0.5)); i <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); i++) hi[j * W + i] = cls;
  }
}
const stats = {};
const order = { 13: 0, 12: 1, 11: 2, 10: 3, 14: 4 }; // lo último pintado gana: glaciares sobre todo
const polys = [];
const landFile = path.join(RAW, 'osm', 'land.json');
if (!existsSync(landFile)) console.log('AVISO: falta raw/osm/land.json (node download.mjs osm): sale solo WorldCover, sin viñas, frutales, parques ni glaciares OSM');
for (const e of existsSync(landFile) ? JSON.parse(await fs.readFile(landFile, 'utf8')).elements : []) {
  const t = e.tags || {};
  const cls = t.natural === 'glacier' ? 14 : t.landuse === 'vineyard' ? 10 : t.landuse === 'orchard' ? 11 : t.landuse === 'forest' ? 13 : t.leisure ? 12 : 0;
  if (!cls) continue;
  const rings = e.type === 'way' ? [e.geometry] : (e.members || []).filter((m) => m.type === 'way' && m.geometry).map((m) => m.geometry);
  // En relaciones los tramos de un mismo anillo vienen separados: con par-impar por línea de barrido igual cierra bien
  // si se tratan todos los segmentos juntos, así que se aplanan en una lista de segmentos como "anillos" abiertos.
  const pts = rings.filter((r) => r && r.length > 1).map((r) => r.filter(Boolean).map((p) => [X(p.lon), Y(p.lat)]));
  if (pts.length) polys.push({ cls, pts, open: e.type !== 'way' });
  stats[CLASSES[cls]] = (stats[CLASSES[cls]] || 0) + 1;
}
polys.sort((a, b) => order[a.cls] - order[b.cls]);
function fillSegments(segs, cls) { // versión para relaciones: segmentos sueltos, sin cerrar cada tramo
  let y0 = Infinity, y1 = -Infinity;
  for (const r of segs) for (const p of r) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  for (let j = Math.max(0, Math.ceil(y0 - 0.5)); j <= Math.min(H - 1, Math.floor(y1 - 0.5)); j++) {
    const yc = j + 0.5, xs = [];
    for (const r of segs) for (let k = 0; k + 1 < r.length; k++) {
      const a = r[k], b = r[k + 1];
      if ((a[1] > yc) !== (b[1] > yc)) xs.push(a[0] + ((yc - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let i = Math.max(0, Math.ceil(xs[k] - 0.5)); i <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); i++) hi[j * W + i] = cls;
  }
}
for (const p of polys) (p.open ? fillSegments : fill)(p.pts, p.cls);
console.log('polígonos OSM:', stats);

// --- 4) versión liviana (2x2 → la clase más frecuente) y salida
const lo = new Uint8Array(CORE_LO.w * CORE_LO.h);
for (let j = 0; j < CORE_LO.h; j++) for (let i = 0; i < CORE_LO.w; i++) {
  const k = 2 * j * W + 2 * i, c = [hi[k], hi[k + 1], hi[k + W], hi[k + W + 1]];
  let best = c[0], bn = 0;
  for (const v of c) { const n = c.filter((q) => q === v).length; if (n > bn || (n === bn && v > best)) { bn = n; best = v; } }
  lo[j * CORE_LO.w + i] = best;
}
const hist = new Array(CLASSES.length).fill(0); for (const v of hi) hist[v]++;
console.log(Object.fromEntries(CLASSES.map((c, i) => [c, ((hist[i] / hi.length) * 100).toFixed(2) + ' %'])));
for (const [name, buf] of [['land_hi.bin', hi], ['land_lo.bin', lo]]) {
  const gz = zlib.gzipSync(buf, { level: 9 });
  await fs.writeFile(path.join(DATA, name), gz);
  console.log(`${name}: ${(gz.length / 1e6).toFixed(2)} MB`);
}
