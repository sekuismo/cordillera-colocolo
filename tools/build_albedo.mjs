// Teselas Sentinel-2 cloudless (Web Mercator) → imágenes en la proyección del juego.
import path from 'node:path';
import { statSync } from 'node:fs';
import sharp from 'sharp';
import { RAW, DATA, CORE, CTX, CORE_HI, CORE_LO, CTX_IMG, SAT_Z, CTX_SAT_Z, tileRange, lon2x, lat2y } from './config.mjs';

async function mosaic(dir, bounds, z) {
  const r = tileRange(bounds, z), w = (r.x1 - r.x0 + 1) * 256, h = (r.y1 - r.y0 + 1) * 256;
  const buf = Buffer.alloc(w * h * 3);
  const jobs = [];
  for (let ty = r.y0; ty <= r.y1; ty++) for (let tx = r.x0; tx <= r.x1; tx++) jobs.push([tx, ty]);
  let k = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (k < jobs.length) {
      const [tx, ty] = jobs[k++];
      const data = await sharp(path.join(RAW, dir, `${z}_${tx}_${ty}.jpg`)).removeAlpha().raw().toBuffer();
      for (let j = 0; j < 256; j++) data.copy(buf, (((ty - r.y0) * 256 + j) * w + (tx - r.x0) * 256) * 3, j * 768, (j + 1) * 768);
    }
  }));
  return { buf, w, h, r, z };
}

// Reproyección con filtro de área (ss x ss muestras bilineales por píxel destino).
function reproject(m, bounds, W, H, ss) {
  const out = Buffer.alloc(W * H * 3);
  const dLon = (bounds.east - bounds.west) / W, dLat = (bounds.north - bounds.south) / H;
  const xs = new Float64Array(W * ss);
  for (let i = 0; i < W; i++) for (let s = 0; s < ss; s++)
    xs[i * ss + s] = (lon2x(bounds.west + (i + (s + 0.5) / ss) * dLon, m.z) - m.r.x0) * 256 - 0.5;
  for (let j = 0; j < H; j++) {
    const ys = [];
    for (let s = 0; s < ss; s++) ys.push((lat2y(bounds.north - (j + (s + 0.5) / ss) * dLat, m.z) - m.r.y0) * 256 - 0.5);
    for (let i = 0; i < W; i++) {
      let R = 0, G = 0, B = 0;
      for (let sj = 0; sj < ss; sj++) {
        const fy = Math.min(m.h - 1.001, Math.max(0, ys[sj])), y0 = Math.floor(fy), v = fy - y0;
        for (let si = 0; si < ss; si++) {
          const fx = Math.min(m.w - 1.001, Math.max(0, xs[i * ss + si])), x0 = Math.floor(fx), u = fx - x0;
          const p = (y0 * m.w + x0) * 3, q = p + m.w * 3;
          const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
          R += m.buf[p] * w00 + m.buf[p + 3] * w10 + m.buf[q] * w01 + m.buf[q + 3] * w11;
          G += m.buf[p + 1] * w00 + m.buf[p + 4] * w10 + m.buf[q + 1] * w01 + m.buf[q + 4] * w11;
          B += m.buf[p + 2] * w00 + m.buf[p + 5] * w10 + m.buf[q + 2] * w01 + m.buf[q + 5] * w11;
        }
      }
      const o = (j * W + i) * 3, n = ss * ss;
      out[o] = R / n + 0.5; out[o + 1] = G / n + 0.5; out[o + 2] = B / n + 0.5;
    }
  }
  return out;
}

const save = async (raw, w, h, name, quality) => {
  await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).webp({ quality, effort: 6 }).toFile(path.join(DATA, name));
  console.log(`${name}: ${w}x${h}, ${(statSync(path.join(DATA, name)).size / 1e6).toFixed(2)} MB`);
};

const which = process.argv.slice(2);
if (!which.length || which.includes('core')) {
  const m = await mosaic('sat', CORE, SAT_Z);
  const hi = reproject(m, CORE, CORE_HI.w, CORE_HI.h, 3);
  await save(hi, CORE_HI.w, CORE_HI.h, 'core_hi.webp', 80);
  const lo = await sharp(hi, { raw: { width: CORE_HI.w, height: CORE_HI.h, channels: 3 } }).resize(CORE_LO.w, CORE_LO.h, { kernel: 'lanczos3' }).raw().toBuffer();
  await save(lo, CORE_LO.w, CORE_LO.h, 'core_lo.webp', 80);
  // Miniatura para el minimapa.
  const mini = await sharp(hi, { raw: { width: CORE_HI.w, height: CORE_HI.h, channels: 3 } }).resize(409, 510).raw().toBuffer();
  await save(mini, 409, 510, 'mapa.webp', 78);
}
if (!which.length || which.includes('ctx')) {
  const m = await mosaic('ctxsat', CTX, CTX_SAT_Z);
  await save(reproject(m, CTX, CTX_IMG.w, CTX_IMG.h, 2), CTX_IMG.w, CTX_IMG.h, 'ctx.webp', 78);
}
