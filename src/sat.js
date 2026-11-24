// Imagen satelital de alta resolución por streaming (Esri World Imagery, ~0,5 a 1 m por píxel), encima de la
// Sentinel-2 de 10 m que va en el repo. Los términos de Esri no dejan guardar ni redistribuir sus teselas: se piden
// en vivo, con la clave de src/config.js, y nada de esto queda en disco ni en el repositorio. Sin clave, sin red o si
// el servicio falla, el juego sigue con la imagen propia.
//
// Dos niveles centrados en el jugador, cada uno un anillo de 8×8 teselas de 256 px en una capa de 2048² (las dos
// capas van en una sola textura de tipo arreglo, porque al shader del terreno ya no le quedan unidades de textura
// libres) con repetición: la tesela (x, y) vive en la casilla (x mod 8, y mod 8), así que al avanzar solo se suben las teselas
// nuevas (nada se mueve). El nivel fino (zoom 17, ~1 m/px) cubre unos 2 km; el grueso (zoom 15, ~4 m/px), unos 8 km.
// Una casilla sin cargar tiene alfa 0, y el shader del terreno mezcla según ese alfa: lo que falta, simplemente
// muestra lo de abajo.
import * as THREE from 'three';

const RING = 8, TILE = 256;
// Sobre esta velocidad (m/s) no se piden teselas de ese zoom: se irían antes de llegar.
const MAX_SPEED = { 18: 30, 17: 45, 16: 70, 15: 110 };
export const SAT_LEVELS = 3;
const URL_ = (z, x, y, key) => `https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}?token=${key}`;
const mod = (a, n) => ((a % n) + n) % n;

export class Sat {
  constructor(renderer, manifest, key, zooms = [18, 16, 15]) {
    this.renderer = renderer; this.m = manifest; this.key = key; this.on = !!key; this.fails = 0; this.loaded = 0;
    // La textura la crea y la llena este módulo directo con WebGL (three no sabe subir un trozo de una capa);
    // a three solo se le entrega para que la enlace: con version 0 nunca intenta subirla él.
    const gl = renderer.getContext(), S = RING * TILE, T = gl.TEXTURE_2D_ARRAY;
    this.tex = new THREE.DataArrayTexture(null, S, S, zooms.length);
    this.glTex = gl.createTexture();
    renderer.state.bindTexture(T, this.glTex);
    gl.texStorage3D(T, Math.log2(S) + 1, gl.SRGB8_ALPHA8, S, S, zooms.length); // nace en ceros: todo transparente hasta que llegue algo
    gl.texParameteri(T, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(T, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(T, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(T, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const an = renderer.extensions.get('EXT_texture_filter_anisotropic');
    if (an) gl.texParameterf(T, an.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    const p = renderer.properties.get(this.tex); p.__webglTexture = this.glTex; p.__webglInit = true;
    this.dirty = false;
    this.levels = zooms.map((z, layer) => ({ z, layer, n: 2 ** z, slots: new Array(RING * RING).fill(''), ok: new Uint8Array(RING * RING), cx: NaN, cy: NaN }));
    // Para el shader. A: posición de la cámara en teselas (mod 8) y teselas por metro. B: cámara − centro del anillo, y si está activo.
    // B.z es además el nivel de mipmap que promedia ~32 m de foto: con él el shader separa el detalle fino del color medio.
    this.A = Array.from({ length: SAT_LEVELS }, () => new THREE.Vector4()); this.B = Array.from({ length: SAT_LEVELS }, () => new THREE.Vector3());
    this.queue = []; this.pending = new Set(); this.active = 0; this.tick = 0; this.tMip = 0;
    this.blank = new Uint8Array(TILE * TILE * 4);
  }
  setEnabled(v) { this.on = !!v && !!this.key && this.fails < 8; }
  get covered() { return this.on && this.loaded > 12; }

  // Mundo (metros) → coordenada de tesela Web Mercator en el zoom dado.
  _tx(x, n) { return ((this.m.core.west + x / this.m.mPerDegLon + 180) / 360) * n; }
  _ty(z, n) { const lat = ((this.m.core.north - z / this.m.mPerDegLat) * Math.PI) / 180; return ((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * n; }

  // Sube una tesela a su casilla (o la borra, con img = null).
  _put(L, slot, img) {
    const r = this.renderer, gl = r.getContext();
    r.state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    const sx = (slot % RING) * TILE, sy = Math.floor(slot / RING) * TILE;
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, sx, sy, L.layer, TILE, TILE, 1, gl.RGBA, gl.UNSIGNED_BYTE, img || this.blank);
    L.ok[slot] = img ? 1 : 0; this.dirty = true;
  }

  async _fetch(job) {
    const { L, tx, ty, slot, id } = job;
    try {
      const res = await fetch(URL_(L.z, tx, ty, this.key));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const img = await createImageBitmap(await res.blob());
      this.fails = 0;
      if (L.slots[slot] === id && this.on) { this._put(L, slot, img); this.loaded++; } // si el jugador ya se fue de ahí, se descarta
      img.close();
    } catch (e) {
      if (++this.fails === 8) { this.on = false; console.warn('[sat] imagen de alta resolución desactivada:', e.message); }
    }
    this.pending.delete(L.z + '/' + id); this.active--;
  }

  // Una vez por cuadro. x, z: posición de la CÁMARA (el shader mide desde ella); speed: m/s.
  update(dt, x, z, speed) {
    for (let i = 0; i < this.levels.length; i++) {
      const L = this.levels[i], tx = this._tx(x, L.n), ty = this._ty(z, L.n);
      const ax = L.n / (360 * this.m.mPerDegLon), ay = (this._ty(z + 50, L.n) - this._ty(z - 50, L.n)) / 100;
      const cx = Math.round(tx), cy = Math.round(ty);
      this.A[i].set(mod(tx, RING), mod(ty, RING), ax, ay); this.B[i].set(tx - cx, ty - cy, this.on ? Math.max(1, L.z - 12) : 0);
      L.cx = cx; L.cy = cy;
    }
    if (!this.on || (this.tick -= dt) > 0) return;
    this.tick = 0.2;
    for (let i = 0; i < this.levels.length; i++) {
      const L = this.levels[i], slow = speed < (MAX_SPEED[L.z] || 60);
      for (let ty = L.cy - RING / 2; ty < L.cy + RING / 2; ty++) for (let tx = L.cx - RING / 2; tx < L.cx + RING / 2; tx++) {
        const slot = mod(tx, RING) + RING * mod(ty, RING), id = tx + '/' + ty, key = L.z + '/' + id;
        if (L.slots[slot] !== id) { L.slots[slot] = id; if (L.ok[slot]) this._put(L, slot, null); } // la casilla cambia de dueño: lo viejo ya no vale
        if (slow && !L.ok[slot] && !this.pending.has(key)) {
          this.pending.add(key);
          this.queue.push({ L, tx, ty, slot, id, d: Math.hypot(tx + 0.5 - L.cx, ty + 0.5 - L.cy) + i * 0.5 });
        }
      }
    }
    // Primero lo más cercano; lo que quedó en cola pero ya no corresponde a su casilla se bota sin pedirlo.
    this.queue.sort((a, b) => b.d - a.d);
    while (this.active < 6 && this.queue.length) {
      const job = this.queue.pop();
      if (job.L.slots[job.slot] !== job.id) { this.pending.delete(job.L.z + '/' + job.id); continue; }
      this.active++; this._fetch(job);
    }
    if (this.queue.length > 160) for (const j of this.queue.splice(0, this.queue.length - 160)) this.pending.delete(j.L.z + '/' + j.id);
    // Mipmaps: una vez por tanda de teselas nuevas, no por cada una.
    const now = performance.now();
    if (this.dirty && now - this.tMip > 250) {
      const gl = this.renderer.getContext();
      this.renderer.state.bindTexture(gl.TEXTURE_2D_ARRAY, this.glTex); gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      this.dirty = false; this.tMip = now;
    }
  }
}
