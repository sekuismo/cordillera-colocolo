// Datos por zonas: el core se parte en cuadrados de ZONE metros y el juego baja solo los que rodean al jugador.
//   img → data/zones/img/<i>_<j>.webp: Sentinel-2 cloudless a ~8 m/px (raw/sat14, download.mjs sat14)
//   veg → árboles reales detectados en la altura de dosel de Meta (build_trees.mjs los deja en raw/trees)
//   bld → huellas de edificios de Overture (build_buildings.mjs los deja en raw/bld)
// Uso: node build_zones.mjs [img] [bin]
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { RAW, DATA, CORE, M_PER_DEG_LAT, M_PER_DEG_LON, SAT_ZONE_Z, lon2x, lat2y, sizeMeters } from './config.mjs';

export const ZONE = 4096, ZPX = 512; // m por zona, píxeles de imagen por zona (8 m/px)
const { w: SX, h: SZ } = sizeMeters(CORE);
export const NZX = Math.ceil(SX / ZONE), NZZ = Math.ceil(SZ / ZONE);
const OUT = path.join(DATA, 'zones');

const lonOf = (x) => CORE.west + x / M_PER_DEG_LON, latOf = (z) => CORE.north - z / M_PER_DEG_LAT;

async function zoneImage(i, j) {
  const z = SAT_ZONE_Z, x0 = i * ZONE, z0 = j * ZONE;
  const tx0 = Math.floor(lon2x(lonOf(x0), z)), tx1 = Math.floor(lon2x(lonOf(x0 + ZONE), z));
  const ty0 = Math.floor(lat2y(latOf(z0), z)), ty1 = Math.floor(lat2y(latOf(z0 + ZONE), z));
  const w = (tx1 - tx0 + 1) * 256, h = (ty1 - ty0 + 1) * 256, buf = Buffer.alloc(w * h * 3);
  let found = 0;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const f = path.join(RAW, 'sat14', `${z}_${tx}_${ty}.jpg`);
    if (!existsSync(f)) continue;
    found++;
    const data = await sharp(f).removeAlpha().raw().toBuffer();
    for (let r = 0; r < 256; r++) data.copy(buf, (((ty - ty0) * 256 + r) * w + (tx - tx0) * 256) * 3, r * 768, (r + 1) * 768);
  }
  if (!found) return null;
  // Reproyección Mercator → proyección del juego con 2×2 muestras bilineales por píxel. El píxel (u, v) cubre
  // [x0 + u·8, x0 + (u+1)·8): el shader lo muestrea igual que la textura del core.
  const out = Buffer.alloc(ZPX * ZPX * 3), ss = 2, step = ZONE / ZPX;
  for (let v = 0; v < ZPX; v++) for (let u = 0; u < ZPX; u++) {
    let R = 0, G = 0, B = 0;
    for (let sj = 0; sj < ss; sj++) for (let si = 0; si < ss; si++) {
      const X = x0 + (u + (si + 0.5) / ss) * step, Z = z0 + (v + (sj + 0.5) / ss) * step;
      const fx = Math.min(w - 1.001, Math.max(0, (lon2x(lonOf(X), z) - tx0) * 256 - 0.5));
      const fy = Math.min(h - 1.001, Math.max(0, (lat2y(latOf(Z), z) - ty0) * 256 - 0.5));
      const xi = Math.floor(fx), yi = Math.floor(fy), a = fx - xi, b = fy - yi, p = (yi * w + xi) * 3, q = p + w * 3;
      const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
      R += buf[p] * w00 + buf[p + 3] * w10 + buf[q] * w01 + buf[q + 3] * w11;
      G += buf[p + 1] * w00 + buf[p + 4] * w10 + buf[q + 1] * w01 + buf[q + 4] * w11;
      B += buf[p + 2] * w00 + buf[p + 5] * w10 + buf[q + 2] * w01 + buf[q + 5] * w11;
    }
    const o = (v * ZPX + u) * 3;
    out[o] = R / 4 + 0.5; out[o + 1] = G / 4 + 0.5; out[o + 2] = B / 4 + 0.5;
  }
  return out;
}

// Importado desde build_manifest.mjs solo para leer las constantes: no construye nada.
const which = import.meta.url.endsWith('?info') ? ['none'] : process.argv.slice(2);
if (!which.length || which.includes('img')) {
  await fs.mkdir(path.join(OUT, 'img'), { recursive: true });
  let n = 0, bytes = 0;
  const jobs = [];
  for (let j = 0; j < NZZ; j++) for (let i = 0; i < NZX; i++) jobs.push([i, j]);
  let k = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (k < jobs.length) {
      const [i, j] = jobs[k++], file = path.join(OUT, 'img', `${i}_${j}.webp`);
      const img = await zoneImage(i, j); if (!img) continue;
      await sharp(img, { raw: { width: ZPX, height: ZPX, channels: 3 } }).webp({ quality: 82, effort: 6 }).toFile(file);
      n++; bytes += statSync(file).size;
      if (n % 100 === 0) console.log(`  ${n}/${jobs.length}`);
    }
  }));
  console.log(`imagen: ${n} zonas de ${NZX}×${NZZ}, ${(bytes / 1e6).toFixed(1)} MB`);
}

// Barrios de edificación en altura: [lat, lon, radio m, torres, alto mín, alto máx]. OSM trae los pisos de una parte de
// las torres; al resto (huellas de 250–3.000 m², compactas, sin dato) se le estima la altura hasta completar la cantidad,
// más alto hacia el centro del barrio. Las torres quedan sobre huellas reales, no inventadas.
const HIGHRISE = [
  [-33.4400, -70.6520, 1500, 420, 25, 95], [-33.4260, -70.6130, 1400, 330, 30, 90], [-33.4150, -70.6010, 800, 150, 60, 150],
  [-33.4090, -70.5720, 1700, 330, 35, 95], [-33.3980, -70.5950, 1000, 110, 30, 70], [-33.4540, -70.5980, 1600, 300, 30, 80],
  [-33.4520, -70.6850, 1100, 190, 55, 95], [-33.4900, -70.6510, 1300, 200, 35, 80], [-33.4180, -70.6570, 1000, 110, 30, 70],
  [-33.4850, -70.6100, 1000, 90, 30, 65], [-33.5210, -70.5990, 900, 90, 30, 70], [-33.6100, -70.5760, 600, 30, 20, 45],
];
function estimateTowers(bld) {
  let seed = 20261123; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (const [lat, lon, R, count, h0, h1] of HIGHRISE) {
    const cx = (lon - CORE.west) * M_PER_DEG_LON, cz = (CORE.north - lat) * M_PER_DEG_LAT, cand = [];
    let have = 0;
    for (let k = 0; k < bld.length; k += 6) {
      const r = Math.hypot(bld[k] - cx, bld[k + 1] - cz); if (r > R) continue;
      if (bld[k + 5] >= 6) { have++; continue; }
      const L = bld[k + 2], W = bld[k + 3], a = L * W;
      if (!bld[k + 5] && a > 250 && a < 3000 && Math.max(L, W) / Math.min(L, W) < 3) cand.push([k, r / R, rnd() * (1.2 - r / R)]);
    }
    cand.sort((a, b) => b[2] - a[2]); // preferencia aleatoria, cargada hacia el centro
    for (const [k, rr] of cand.slice(0, Math.max(0, count - have))) {
      const u = rnd(); bld[k + 5] = Math.max(6, Math.round(((h0 + (h1 - h0) * u * u * u) * (1 - 0.35 * rr)) / 2.9));
    }
  }
}

// Árboles y edificios de cada zona en un binario gzip (formato en src/zones.js → decodeZone).
// Largo y ancho de edificio en 1 byte: 0,5 m hasta 100 m y de a 4 m desde ahí (bodegas y malls de hasta 320 m).
const dimByte = (m) => (m <= 100 ? Math.round(m * 2) : Math.min(255, 200 + Math.round((m - 100) / 4)));
if (!which.length || which.includes('bin')) {
  const load = async (f, k) => { try { const b = await fs.readFile(path.join(RAW, f)); return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); } catch { console.warn('falta', f); return new Float32Array(0); } };
  const trees = await load('trees.f32'), bld = Float32Array.from(await load('bld.f32'));
  estimateTowers(bld);
  // El skyline (edificios de 5 pisos o más) va aparte: city.js lo dibuja a cualquier distancia, y la vegetación cercana lo omite.
  const sky = [];
  for (let k = 0; k < bld.length; k += 6) if (bld[k + 5] >= 5) sky.push([Math.round(bld[k]), Math.round(bld[k + 1]), +bld[k + 2].toFixed(1), +bld[k + 3].toFixed(1), Math.round(bld[k + 4] * 1000), bld[k + 5]]);
  await fs.writeFile(path.join(DATA, 'skyline.json'), JSON.stringify(sky));
  console.log(`skyline: ${sky.length} edificios de 5 pisos o más`);
  const nZ = NZX * NZZ, tz = Array.from({ length: nZ }, () => []), bz = Array.from({ length: nZ }, () => []);
  const zoneOf = (x, z) => { const i = Math.floor(x / ZONE), j = Math.floor(z / ZONE); return i < 0 || j < 0 || i >= NZX || j >= NZZ ? -1 : j * NZX + i; };
  for (let k = 0; k < trees.length; k += 4) { const zi = zoneOf(trees[k], trees[k + 1]); if (zi >= 0) tz[zi].push(k); }
  for (let k = 0; k < bld.length; k += 6) { const zi = zoneOf(bld[k], bld[k + 1]); if (zi >= 0) bz[zi].push(k); }
  await fs.mkdir(path.join(OUT, 'bin'), { recursive: true });
  for (const f of await fs.readdir(path.join(OUT, 'bin'))) await fs.unlink(path.join(OUT, 'bin', f));
  let files = 0, bytes = 0, nt = 0, nb = 0;
  for (let zi = 0; zi < nZ; zi++) {
    const T = tz[zi], B = bz[zi]; if (!T.length && !B.length) continue;
    const i = zi % NZX, j = Math.floor(zi / NZX), x0 = i * ZONE, z0 = j * ZONE;
    const buf = Buffer.alloc(8 + T.length * 6 + B.length * 8);
    buf.writeUInt32LE(T.length, 0); buf.writeUInt32LE(B.length, 4);
    let o = 8;
    // Ordenados por posición: el gzip comprime mejor y el juego los recorre por celda.
    T.sort((a, b) => trees[a + 1] - trees[b + 1] || trees[a] - trees[b]);
    for (const k of T) {
      buf.writeUInt16LE(Math.min(65535, Math.round((trees[k] - x0) * 16)), o); buf.writeUInt16LE(Math.min(65535, Math.round((trees[k + 1] - z0) * 16)), o + 2);
      buf[o + 4] = Math.min(255, Math.round(trees[k + 2] * 4)); buf[o + 5] = Math.min(255, Math.round(trees[k + 3] * 8)); o += 6;
    }
    B.sort((a, b) => bld[a + 1] - bld[b + 1] || bld[a] - bld[b]);
    for (const k of B) {
      buf.writeUInt16LE(Math.min(65535, Math.round((bld[k] - x0) * 16)), o); buf.writeUInt16LE(Math.min(65535, Math.round((bld[k + 1] - z0) * 16)), o + 2);
      buf[o + 4] = dimByte(bld[k + 2]); buf[o + 5] = dimByte(bld[k + 3]); buf[o + 6] = Math.round((bld[k + 4] / Math.PI) * 256) & 255; buf[o + 7] = Math.min(255, bld[k + 5]); o += 8;
    }
    const gz = zlib.gzipSync(buf, { level: 9 });
    await fs.writeFile(path.join(OUT, 'bin', `${i}_${j}.bin`), gz);
    files++; bytes += gz.length; nt += T.length; nb += B.length;
  }
  console.log(`datos: ${files} zonas, ${nt} árboles, ${nb} edificios, ${(bytes / 1e6).toFixed(1)} MB`);
}
