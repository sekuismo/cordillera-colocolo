// Sombras arrojadas por el relieve. Un barrido O(N) sobre el DEM: se recorre cada línea paralela al
// sol llevando la "altura de la sombra" (baja con la tangente de la elevación solar y se renueva en cada cumbre).
// Corre en CPU solo cuando el sol cambia (hora o estación), repartido en varios cuadros para no dar tirones,
// y el resultado es una textura de 1 canal.
import * as THREE from 'three';

const SOFT = 28; // m de desnivel entre plena luz y plena sombra: da penumbra en los bordes

export class Shadows {
  constructor(core) {
    // Se usa la pirámide de máximos (mitad de resolución): es conservadora y 4 veces más barata.
    this.w = core.dims[0]; this.h = core.dims[1]; this.src = core.maxs[0]; this.step_ = core.step;
    this.tx = core.sx / this.w; this.tz = core.sz / this.h; this.sx = core.sx; this.sz = core.sz;
    this.data = new Uint8Array(this.w * this.h).fill(255); this.back = new Uint8Array(this.w * this.h);
    this.tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter; this.tex.unpackAlignment = 1; this.tex.needsUpdate = true;
    this.job = null;
  }
  get busy() { return !!this.job; }
  start(sun) { this.job = this._sweep({ x: sun.x, y: sun.y, z: sun.z }, this.back); }
  // Avanza el barrido durante `ms` milisegundos; al terminar intercambia los búferes y sube la textura.
  step(ms) {
    if (!this.job) return;
    const t0 = performance.now();
    do { if (this.job.next().done) { this.job = null; [this.data, this.back] = [this.back, this.data]; this.tex.image.data = this.data; this.tex.needsUpdate = true; return; } }
    while (performance.now() - t0 < ms);
  }
  *_sweep(sun, data) {
    const { w: W, h: H, src } = this, hor = Math.hypot(sun.x, sun.z);
    if (sun.y <= 0.005) { data.fill(0); return; }
    if (hor < 1e-4) { data.fill(255); return; }
    const tan = sun.y / hor, cx = -sun.x / hor / this.tx, cz = -sun.z / hor / this.tz; // la luz viaja alejándose del sol
    const majorX = Math.abs(cx) >= Math.abs(cz);
    const N = majorX ? W : H, M = majorX ? H : W, dir = (majorX ? cx : cz) > 0 ? 1 : -1;
    const m = majorX ? cz / Math.abs(cx) : cx / Math.abs(cz);              // avance en el eje menor por cada paso
    const drop = (tan * Math.hypot(majorX ? this.tx : this.tz, m * (majorX ? this.tz : this.tx))) / this.step_;
    const soft = SOFT / this.step_, bias = 2 / this.step_, span = m * (N - 1);
    for (let o = Math.floor(Math.min(0, -span)) - 1; o <= M + Math.ceil(Math.max(0, -span)) + 1; o++) {
      let hs = -1e9;
      for (let k = 0; k < N; k++) {
        const b = Math.round(o + m * k);
        if (b < 0 || b >= M) { hs = -1e9; continue; }
        const a = dir > 0 ? k : N - 1 - k, idx = majorX ? b * W + a : a * W + b, h = src[idx];
        hs -= drop;
        if (h >= hs - bias) { data[idx] = 255; if (h > hs) hs = h; }
        else { const d = hs - bias - h; data[idx] = d >= soft ? 0 : 255 * (1 - d / soft); }
      }
      if ((o & 15) === 0) yield;
    }
  }
  at(x, z) { // 0 = sombra, 1 = sol
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return 1;
    return this.data[Math.floor(z / this.tz) * this.w + Math.floor(x / this.tx)] / 255;
  }
}
