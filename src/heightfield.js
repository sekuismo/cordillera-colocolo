// Campo de alturas en CPU. Replica exactamente la función de altura del vertex shader (shaders.js → HEIGHT_GLSL)
// para que la física del gato y el terreno dibujado coincidan al centímetro.
import * as THREE from 'three';

export const NOISE_SIZE = 256;
// Octavas de detalle bajo la resolución del DEM: [tamaño de la baldosa en m, amplitud en m, offset uv].
// Las 3 primeras desplazan geometría; las 3 últimas solo aportan relieve y grano en el sombreado.
export const OCTAVES = [
  { tile: 384, amp: 2.6, off: [0.0, 0.0] },
  { tile: 96, amp: 0.75, off: [0.37, 0.11] },
  { tile: 24, amp: 0.2, off: [0.71, 0.53] },
  { tile: 6, amp: 0.055, off: [0.13, 0.83] },
  { tile: 1.5, amp: 0.014, off: [0.59, 0.29] },
  { tile: 0.41, amp: 0.004, off: [0.23, 0.67] },
];
export const CORE_BLEND = 1500; // m: banda donde el core se funde con el contexto

// Ruido de gradiente periódico (fBm de 3 octavas) → canales: altura, d/du, d/dv, ruido extra para color.
export function makeNoise(seed = 7) {
  const N = NOISE_SIZE, data = new Float32Array(N * N * 4);
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const layer = (period, ch, gain) => {
    const g = new Float32Array(period * period * 2);
    for (let i = 0; i < period * period; i++) { const a = rnd() * Math.PI * 2; g[i * 2] = Math.cos(a); g[i * 2 + 1] = Math.sin(a); }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = ((x + 0.5) / N) * period, fy = ((y + 0.5) / N) * period;
      const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const dot = (ix, iy, dx, dy) => { const k = (((iy % period) * period) + (ix % period)) * 2; return g[k] * dx + g[k + 1] * dy; };
      const a = dot(x0, y0, tx, ty), b = dot(x0 + 1, y0, tx - 1, ty), c = dot(x0, y0 + 1, tx, ty - 1), d = dot(x0 + 1, y0 + 1, tx - 1, ty - 1);
      const u = fade(tx), v = fade(ty);
      data[(y * N + x) * 4 + ch] += (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * gain * 1.5;
    }
  };
  layer(8, 0, 1); layer(16, 0, 0.5); layer(32, 0, 0.25);
  layer(8, 3, 1); layer(16, 3, 0.5); layer(32, 3, 0.25); layer(64, 3, 0.2);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const at = (ix, iy) => data[((((iy + N) % N) * N) + ((ix + N) % N)) * 4];
    const o = (y * N + x) * 4;
    data[o + 1] = (at(x + 1, y) - at(x - 1, y)) * 0.5 * N; // derivada respecto a u (una baldosa = 1)
    data[o + 2] = (at(x, y + 1) - at(x, y - 1)) * 0.5 * N;
  }
  return data;
}

export function noiseTexture(data) {
  const N = NOISE_SIZE, mipmaps = [];
  let cur = data, size = N;
  for (;;) {
    const half = new Uint16Array(cur.length);
    for (let i = 0; i < cur.length; i++) half[i] = THREE.DataUtils.toHalfFloat(cur[i]);
    mipmaps.push({ data: half, width: size, height: size });
    if (size === 1) break;
    const ns = size >> 1, next = new Float32Array(ns * ns * 4);
    for (let y = 0; y < ns; y++) for (let x = 0; x < ns; x++) for (let c = 0; c < 4; c++)
      next[(y * ns + x) * 4 + c] = (cur[((2 * y) * size + 2 * x) * 4 + c] + cur[((2 * y) * size + 2 * x + 1) * 4 + c] + cur[((2 * y + 1) * size + 2 * x) * 4 + c] + cur[((2 * y + 1) * size + 2 * x + 1) * 4 + c]) / 4;
    cur = next; size = ns;
  }
  const tex = new THREE.DataTexture(mipmaps[0].data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mipmaps = mipmaps;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false; tex.anisotropy = 4; tex.needsUpdate = true;
  return tex;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Cuánto relieve procedural admite un punto según su pendiente: nada en agua/planicies, todo en laderas.
export const roughAmp = (s2) => 0.2 * smooth(0.00008, 0.0008, s2) + 0.8 * smooth(0.002, 0.07, s2);

class Layer {
  constructor(d, originX, originZ, sizeX, sizeZ) {
    Object.assign(this, d); // q, w, h, step, normals, mins, maxs, dims
    this.ox = originX; this.oz = originZ; this.sx = sizeX; this.sz = sizeZ;
    this.tx = sizeX / d.w; this.tz = sizeZ / d.h;
  }
  bilinear(x, z) {
    const { q, w, h } = this;
    let fx = (x - this.ox) / this.tx - 0.5, fz = (z - this.oz) / this.tz - 0.5;
    fx = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx; fz = fz < 0 ? 0 : fz > h - 1 ? h - 1 : fz;
    const i = Math.min(w - 2, Math.floor(fx)), j = Math.min(h - 2, Math.floor(fz)), u = fx - i, v = fz - j, k = j * w + i;
    return ((q[k] * (1 - u) + q[k + 1] * u) * (1 - v) + (q[k + w] * (1 - u) + q[k + w + 1] * u) * v) * this.step;
  }
  slope(x, z, out) { // normal bilineal (x, z), igual que textureLod con filtro lineal y clamp
    const { normals: n, w, h } = this;
    let fx = (x - this.ox) / this.tx - 0.5, fz = (z - this.oz) / this.tz - 0.5;
    fx = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx; fz = fz < 0 ? 0 : fz > h - 1 ? h - 1 : fz;
    const i = Math.min(w - 2, Math.floor(fx)), j = Math.min(h - 2, Math.floor(fz)), u = fx - i, v = fz - j, k = (j * w + i) * 2;
    const m = (c) => ((n[k + c] * (1 - u) + n[k + 2 + c] * u) * (1 - v) + (n[k + w * 2 + c] * (1 - u) + n[k + w * 2 + 2 + c] * u) * v - 128) / 127;
    out[0] = m(0); out[1] = m(1);
  }
  // Cotas conservadoras [min, max] del rectángulo x0..x1, z0..z1 (se une con lo que ya traiga `out`).
  bounds(x0, z0, x1, z1, out) {
    const { w, h } = this;
    let i0 = Math.floor((x0 - this.ox) / this.tx - 0.5) - 1, i1 = Math.ceil((x1 - this.ox) / this.tx - 0.5) + 1;
    let j0 = Math.floor((z0 - this.oz) / this.tz - 0.5) - 1, j1 = Math.ceil((z1 - this.oz) / this.tz - 0.5) + 1;
    i0 = Math.max(0, Math.min(w - 1, i0)); i1 = Math.max(0, Math.min(w - 1, i1));
    j0 = Math.max(0, Math.min(h - 1, j0)); j1 = Math.max(0, Math.min(h - 1, j1));
    let k = 0;
    while (((i1 >> k) - (i0 >> k)) > 2 || ((j1 >> k) - (j0 >> k)) > 2) k++;
    const mn = k ? this.mins[k - 1] : this.q, mx = k ? this.maxs[k - 1] : this.q, pw = k ? this.dims[(k - 1) * 2] : w;
    let lo = out[0], hi = out[1];
    for (let j = j0 >> k; j <= j1 >> k; j++) for (let i = i0 >> k; i <= i1 >> k; i++) {
      const a = mn[j * pw + i] * this.step, b = mx[j * pw + i] * this.step;
      if (a < lo) lo = a; if (b > hi) hi = b;
    }
    out[0] = lo; out[1] = hi;
  }
}

export class Heightfield {
  constructor(manifest, core, ctx, noise) {
    this.m = manifest;
    this.core = new Layer(core, 0, 0, manifest.core.sizeX, manifest.core.sizeZ);
    this.ctx = new Layer(ctx, manifest.ctx.originX, manifest.ctx.originZ, manifest.ctx.sizeX, manifest.ctx.sizeZ);
    this.noise = noise;
    this._s = [0, 0]; this._s2 = [0, 0];
    this.detailMax = (OCTAVES[0].amp + OCTAVES[1].amp + OCTAVES[2].amp) * 1.5; // el fBm se pasa un poco de ±1
  }
  coreWeight(x, z) {
    const d = Math.min(x, this.core.sx - x, z, this.core.sz - z);
    return smooth(0, CORE_BLEND, d);
  }
  base(x, z) {
    const w = this.coreWeight(x, z);
    if (w >= 1) return this.core.bilinear(x, z);
    const c = this.ctx.bilinear(x, z);
    return w <= 0 ? c : c + (this.core.bilinear(x, z) - c) * w;
  }
  noiseAt(u, v, ch) {
    const N = NOISE_SIZE, d = this.noise;
    const fx = (u - Math.floor(u)) * N - 0.5, fy = (v - Math.floor(v)) * N - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = (x0 + N) % N, xb = (x0 + 1) % N, ya = (y0 + N) % N, yb = (y0 + 1) % N;
    return (d[(ya * N + xa) * 4 + ch] * (1 - tx) + d[(ya * N + xb) * 4 + ch] * tx) * (1 - ty) + (d[(yb * N + xa) * 4 + ch] * (1 - tx) + d[(yb * N + xb) * 4 + ch] * tx) * ty;
  }
  slope2(x, z) {
    const w = this.coreWeight(x, z), s = this._s;
    if (w >= 1) this.core.slope(x, z, s);
    else {
      this.ctx.slope(x, z, s);
      if (w > 0) { const t = this._s2; this.core.slope(x, z, t); s[0] += (t[0] - s[0]) * w; s[1] += (t[1] - s[1]) * w; }
    }
    return s[0] * s[0] + s[1] * s[1];
  }
  // Altura completa (DEM + detalle procedural a máximo nivel), o sea, lo que se ve cerca de la cámara.
  height(x, z) {
    let d = 0;
    for (let i = 0; i < 3; i++) { const o = OCTAVES[i]; d += o.amp * this.noiseAt(x / o.tile + o.off[0], z / o.tile + o.off[1], 0); }
    return this.base(x, z) + d * roughAmp(this.slope2(x, z));
  }
  normal(x, z, out, e = 0.6) {
    const hx = this.height(x + e, z) - this.height(x - e, z), hz = this.height(x, z + e) - this.height(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  }
  bounds(x0, z0, size, out) {
    out[0] = Infinity; out[1] = -Infinity;
    const x1 = x0 + size, z1 = z0 + size, c = this.core;
    const insideCore = x0 >= CORE_BLEND && z0 >= CORE_BLEND && x1 <= c.sx - CORE_BLEND && z1 <= c.sz - CORE_BLEND;
    const touchesCore = x1 > 0 && z1 > 0 && x0 < c.sx && z0 < c.sz;
    if (touchesCore) c.bounds(x0, z0, x1, z1, out);
    if (!insideCore) this.ctx.bounds(x0, z0, x1, z1, out);
    out[0] -= this.detailMax; out[1] += this.detailMax;
  }
  // ¿Se ve el punto b desde a? Marcha por el DEM base; sirve para ocultar etiquetas tras los cerros.
  visible(ax, ay, az, bx, by, bz, steps = 28) {
    for (let i = 1; i < steps; i++) {
      const t = i / steps, tt = t * t * (3 - 2 * t) * 0.5 + t * 0.5; // más muestras cerca de los extremos
      if (this.base(ax + (bx - ax) * tt, az + (bz - az) * tt) > ay + (by - ay) * tt + 4) return false;
    }
    return true;
  }
}
