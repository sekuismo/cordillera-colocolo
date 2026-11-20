// Sombras arrojadas por el relieve: textura de 1 canal que calcula un worker (shadow-worker.js) cada vez que
// el sol cambia (hora o estación). Dos búferes van y vienen entre hilos, así no se copia ni se genera basura.
import * as THREE from 'three';

export class Shadows {
  constructor(core) {
    // Se usa la pirámide de máximos (mitad de resolución): es conservadora y 4 veces más barata.
    this.w = core.dims[0]; this.h = core.dims[1];
    this.tx = core.sx / this.w; this.tz = core.sz / this.h; this.sx = core.sx; this.sz = core.sz;
    this.data = new Uint8Array(this.w * this.h).fill(255); this.spare = new Uint8Array(this.w * this.h);
    this.tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter; this.tex.unpackAlignment = 1; this.tex.needsUpdate = true;
    this.busy = false; this.pending = null;
    this.worker = new Worker(new URL('./shadow-worker.js', import.meta.url));
    const src = core.maxs[0].slice(); // copia: el original lo sigue usando el quadtree del terreno
    this.worker.postMessage({ init: { src, w: this.w, h: this.h, step: core.step, tx: this.tx, tz: this.tz } }, [src.buffer]);
    this.worker.onmessage = ({ data }) => {
      this.spare = this.data; this.data = data.out;
      this.tex.image.data = this.data; this.tex.needsUpdate = true;
      this.busy = false;
      if (this.pending) { const s = this.pending; this.pending = null; this.start(s); }
    };
  }
  // Pide un recálculo. Si hay uno en curso, se queda solo con la petición más reciente.
  start(sun) {
    const s = { x: sun.x, y: sun.y, z: sun.z };
    if (this.busy) { this.pending = s; return; }
    this.busy = true;
    const out = this.spare; this.spare = null;
    this.worker.postMessage({ sun: s, out }, [out.buffer]);
  }
  at(x, z) { // 0 = sombra, 1 = sol
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return 1;
    return this.data[Math.floor(z / this.tz) * this.w + Math.floor(x / this.tx)] / 255;
  }
}
