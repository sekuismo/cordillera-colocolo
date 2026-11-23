// Carga por zonas: el core está partido en cuadrados de 4.096 m (tools/build_zones.mjs) y solo se bajan los que
// rodean al jugador. Así el detalle real (imagen a 8 m/px, árboles y edificios uno por uno) no pesa en la carga inicial.
//
// Imagen: una textura de 4×4 zonas usada como anillo (clipmap toroidal). La zona (i, j) va a la casilla
// (i mod 4, j mod 4) y el shader la muestrea con uv = xz / (4 · ZONE) y repetición, así que nunca hay que mover nada al
// avanzar: solo se sobrescriben las casillas que quedaron atrás. uZoneSlot dice qué zona tiene cada casilla.
import * as THREE from 'three';

const RING = 4, MAX_LOADS = 4;

export class Zones {
  constructor(manifest, quality) {
    const z = manifest.zones;
    this.size = z.size; this.nx = z.nx; this.nz = z.nz;
    this.hasImg = new Set(z.img || []); this.hasBin = new Set(z.bin || []);
    this.px = quality.tier === 'hi' ? z.px : z.px / 2; // en móvil, la mitad de resolución (16 m/px)
    const S = this.px * RING;
    this.tex = new THREE.DataTexture(new Uint8Array(S * S * 4), S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
    Object.assign(this.tex, { colorSpace: THREE.SRGBColorSpace, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, anisotropy: 4, needsUpdate: true });
    this.slot = Array.from({ length: RING * RING }, () => new THREE.Vector2(-1e4, -1e4)); // uniform: zona en cada casilla
    this.slotWant = new Array(RING * RING).fill(null);
    this.bins = new Map();      // 'i_j' → datos de la zona ya cargados (árboles, edificios)
    this.onBin = null;          // (key, data) cuando llega una zona nueva
    this.onDrop = null;         // (key, data) cuando una zona queda lejos y se suelta
    this.pending = 0; this.queue = []; this.loading = new Set(); this.stats = { img: 0, bin: 0, bytes: 0 };
    this._bitmapTex = new THREE.Texture(); this._bitmapTex.flipY = false;
  }

  // Pide lo que falta alrededor de (x, z): imagen en el bloque de 4×4 zonas centrado en el jugador, datos en 3×3.
  update(renderer, x, z) {
    this.renderer = renderer;
    const S = this.size, fx = x / S, fz = z / S;
    const bx = Math.floor(fx - RING / 2 + 0.5), bz = Math.floor(fz - RING / 2 + 0.5), want = [];
    for (let j = bz; j < bz + RING; j++) for (let i = bx; i < bx + RING; i++) {
      const k = (((j % RING) + RING) % RING) * RING + (((i % RING) + RING) % RING), key = i + '_' + j;
      this.slotWant[k] = key;
      const s = this.slot[k];
      if ((s.x !== i || s.y !== j) && this.hasImg.has(key)) want.push({ kind: 'img', i, j, k, key, d: Math.hypot(i + 0.5 - fx, j + 0.5 - fz) });
    }
    const ci = Math.floor(fx), cj = Math.floor(fz);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const key = i + '_' + j;
      if (this.hasBin.has(key) && !this.bins.has(key)) want.push({ kind: 'bin', i, j, key, d: Math.hypot(i + 0.5 - fx, j + 0.5 - fz) });
    }
    // Las zonas de datos que quedaron lejos se sueltan (la vegetación ya copió lo que necesitaba).
    for (const [key, d] of this.bins) { const [i, j] = key.split('_').map(Number); if (Math.abs(i - ci) > 2 || Math.abs(j - cj) > 2) { this.bins.delete(key); if (this.onDrop) this.onDrop(key, d); } }
    want.sort((a, b) => a.d - b.d);
    for (const w of want) {
      if (this.loading.size >= MAX_LOADS) break;
      const id = w.kind + w.key; if (this.loading.has(id)) continue;
      this.loading.add(id);
      (w.kind === 'img' ? this._loadImg(w) : this._loadBin(w)).catch((e) => console.warn('zona', w.key, e)).finally(() => this.loading.delete(id));
    }
  }

  async _loadImg({ i, j, k, key }) {
    const res = await fetch(new URL(`../data/zones/img/${key}.webp`, import.meta.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob(); this.stats.bytes += blob.size;
    const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: this.px, resizeHeight: this.px, resizeQuality: 'high' });
    if (this.slotWant[k] !== key) { bmp.close(); return; } // el jugador ya se fue de ahí
    const t = this._bitmapTex; t.image = bmp;
    const pos = new THREE.Vector2((((i % RING) + RING) % RING) * this.px, (((j % RING) + RING) % RING) * this.px);
    this.renderer.copyTextureToTexture(t, this.tex, null, pos); // regenera los mipmaps de la textura completa
    bmp.close();
    this.slot[k].set(i, j); this.stats.img++;
  }

  async _loadBin({ key }) {
    const res = await fetch(new URL(`../data/zones/bin/${key}.bin`, import.meta.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = new Uint8Array(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    this.stats.bytes += buf.length; this.stats.bin++;
    const data = decodeZone(buf, key, this.size);
    this.bins.set(key, data);
    if (this.onBin) this.onBin(key, data);
  }
}

// Formato de data/zones/bin/<i>_<j>.bin (gzip), ver tools/build_zones.mjs:
//   u32 nTrees, u32 nBuildings
//   árboles:   u16 x, u16 z (1/16 m dentro de la zona), u8 altura (1/4 m), u8 radio de copa (1/8 m)
//   edificios: u16 x, u16 z (1/16 m), u8 largo, u8 ancho (1/2 m hasta 100 m, de a 4 m desde ahí), u8 rumbo (π/256),
//              u8 pisos (0 = sin dato)
const dim = (v) => (v <= 200 ? v / 2 : 100 + (v - 200) * 4);
export function decodeZone(buf, key, size) {
  const [i, j] = key.split('_').map(Number), x0 = i * size, z0 = j * size;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const nt = dv.getUint32(0, true), nb = dv.getUint32(4, true);
  const trees = new Float32Array(nt * 4), bld = new Float32Array(nb * 6);
  let o = 8;
  for (let n = 0; n < nt; n++, o += 6) {
    trees[n * 4] = x0 + dv.getUint16(o, true) / 16; trees[n * 4 + 1] = z0 + dv.getUint16(o + 2, true) / 16;
    trees[n * 4 + 2] = buf[o + 4] / 4; trees[n * 4 + 3] = buf[o + 5] / 8;
  }
  for (let n = 0; n < nb; n++, o += 8) {
    bld[n * 6] = x0 + dv.getUint16(o, true) / 16; bld[n * 6 + 1] = z0 + dv.getUint16(o + 2, true) / 16;
    bld[n * 6 + 2] = dim(buf[o + 4]); bld[n * 6 + 3] = dim(buf[o + 5]); bld[n * 6 + 4] = (buf[o + 6] / 256) * Math.PI; bld[n * 6 + 5] = buf[o + 7];
  }
  return { trees, bld, x0, z0 };
}
