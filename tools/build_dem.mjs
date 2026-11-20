// DEM Copernicus GLO-30 (core) + Terrain Tiles (contexto) → data/*.dem
import fs from 'node:fs/promises';
import path from 'node:path';
import { fromFile } from 'geotiff';
import sharp from 'sharp';
import { RAW, DATA, CORE, CTX, CORE_HI, CORE_LO, CTX_DEM, CTX_DEM_Z, HEIGHT_STEP, tileRange, lon2x, lat2y } from './config.mjs';
import { encodeDem, decodeDem } from './codec.mjs';

// --- Mosaico Copernicus: 2°x2° a 1 arcsec, centros de píxel en arcosegundos enteros.
const LON0 = -71, LAT0 = -33, N = 7200;
const mosaic = new Float32Array(N * N);
for (const f of await fs.readdir(path.join(RAW, 'dem'))) {
  if (!f.endsWith('.tif')) continue;
  const img = await (await fromFile(path.join(RAW, 'dem', f))).getImage();
  const w = img.getWidth(), h = img.getHeight();
  const [ox, oy] = img.getOrigin(), [rx, ry] = img.getResolution();
  if (w !== 3600 || h !== 3600) throw new Error(`${f}: tamaño inesperado ${w}x${h}`);
  // GTRasterType 2 = PixelIsPoint: el tiepoint ya es el centro del píxel (geotiff.js no corrige el medio píxel).
  const half = img.getGeoKeys().GTRasterTypeGeoKey === 2 ? 0 : 0.5;
  const col0 = Math.round((ox + rx * half - LON0) * 3600), row0 = Math.round((LAT0 - (oy + ry * half)) * 3600);
  const data = (await img.readRasters({ interleave: true }));
  for (let j = 0; j < h; j++) mosaic.set(data.subarray(j * w, (j + 1) * w), (row0 + j) * N + col0);
  console.log(`${f}: origen ${ox.toFixed(5)},${oy.toFixed(5)} → col ${col0}, fila ${row0}`);
}

function sample(lon, lat) {
  const fi = (lon - LON0) * 3600, fj = (LAT0 - lat) * 3600;
  const i = Math.min(N - 2, Math.max(0, Math.floor(fi))), j = Math.min(N - 2, Math.max(0, Math.floor(fj)));
  const u = fi - i, v = fj - j, k = j * N + i;
  return (mosaic[k] * (1 - u) + mosaic[k + 1] * u) * (1 - v) + (mosaic[k + N] * (1 - u) + mosaic[k + N + 1] * u) * v;
}

// --- Core hi: supermuestreo 2x2 para no aliasar (el grid destino es algo más grueso que la fuente).
const { w: W, h: H } = CORE_HI;
const hi = new Float32Array(W * H);
const dLon = (CORE.east - CORE.west) / W, dLat = (CORE.north - CORE.south) / H;
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    let s = 0;
    for (const sj of [0.25, 0.75]) for (const si of [0.25, 0.75])
      s += sample(CORE.west + (i + si) * dLon, CORE.north - (j + sj) * dLat);
    hi[j * W + i] = Math.max(0, s / 4);
  }
}
const lo = new Float32Array(CORE_LO.w * CORE_LO.h);
for (let j = 0; j < CORE_LO.h; j++) for (let i = 0; i < CORE_LO.w; i++) {
  const k = 2 * j * W + 2 * i;
  lo[j * CORE_LO.w + i] = (hi[k] + hi[k + 1] + hi[k + W] + hi[k + W + 1]) / 4;
}

const quant = (f) => { const q = new Uint16Array(f.length); for (let i = 0; i < f.length; i++) q[i] = Math.round(f[i] / HEIGHT_STEP); return q; };
async function write(name, f, w, h) {
  const q = quant(f), enc = encodeDem(q, w, h, HEIGHT_STEP);
  const back = decodeDem(enc);
  for (let i = 0; i < q.length; i++) if (back.q[i] !== q[i]) throw new Error(`${name}: roundtrip falló en ${i}`);
  await fs.writeFile(path.join(DATA, name), enc);
  let mx = 0; for (const v of f) if (v > mx) mx = v;
  console.log(`${name}: ${w}x${h}, máx ${mx.toFixed(0)} m, ${(enc.length / 1e6).toFixed(2)} MB (${(enc.length * 8 / q.length).toFixed(2)} bits/muestra)`);
}
await write('core_hi.dem', hi, W, H);
await write('core_lo.dem', lo, CORE_LO.w, CORE_LO.h);

// --- Contexto: mosaico terrarium z9.
const r = tileRange(CTX, CTX_DEM_Z), tw = r.x1 - r.x0 + 1, th = r.y1 - r.y0 + 1, MW = tw * 256, MH = th * 256;
const tm = new Float32Array(MW * MH);
for (let ty = r.y0; ty <= r.y1; ty++) for (let tx = r.x0; tx <= r.x1; tx++) {
  const { data, info } = await sharp(path.join(RAW, 'ctxdem', `${CTX_DEM_Z}_${tx}_${ty}.png`)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 256 || info.channels !== 3) throw new Error('tesela terrarium inesperada');
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const p = (j * 256 + i) * 3;
    tm[((ty - r.y0) * 256 + j) * MW + (tx - r.x0) * 256 + i] = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
  }
}
const tsample = (lon, lat) => {
  const fi = (lon2x(lon, CTX_DEM_Z) - r.x0) * 256 - 0.5, fj = (lat2y(lat, CTX_DEM_Z) - r.y0) * 256 - 0.5;
  const i = Math.min(MW - 2, Math.max(0, Math.floor(fi))), j = Math.min(MH - 2, Math.max(0, Math.floor(fj)));
  const u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j)), k = j * MW + i;
  return (tm[k] * (1 - u) + tm[k + 1] * u) * (1 - v) + (tm[k + MW] * (1 - u) + tm[k + MW + 1] * u) * v;
};
const ctx = new Float32Array(CTX_DEM.w * CTX_DEM.h);
const cLon = (CTX.east - CTX.west) / CTX_DEM.w, cLat = (CTX.north - CTX.south) / CTX_DEM.h;
for (let j = 0; j < CTX_DEM.h; j++) for (let i = 0; i < CTX_DEM.w; i++) {
  let s = 0, n = 0, inCore = 0;
  for (let sj = 0; sj < 4; sj++) for (let si = 0; si < 4; si++) {
    const lon = CTX.west + (i + (si + 0.5) / 4) * cLon, lat = CTX.north - (j + (sj + 0.5) / 4) * cLat;
    // Dentro del core se usa Copernicus promediado: así la costura core/contexto mezcla datos consistentes.
    const inside = lon > CORE.west && lon < CORE.east && lat < CORE.north && lat > CORE.south;
    s += inside ? sample(lon, lat) : tsample(lon, lat); n++; inCore += inside;
  }
  ctx[j * CTX_DEM.w + i] = Math.max(0, s / n);
}
await write('ctx.dem', ctx, CTX_DEM.w, CTX_DEM.h);
