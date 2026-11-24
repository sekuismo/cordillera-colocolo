// Índice espacial de calles y caminos en CPU, para que las casas se ordenen a lo largo de la calle
// (paralelas a ella y retiradas de la calzada) y los árboles urbanos queden en la vereda.
// No duplica datos: lee los mismos búferes de segmentos que usa la capa vectorial (overlay.js) y arma,
// solo para las zonas que se visitan, una subgrilla de 64 m por cada celda de 2 km.
import { CELL } from './overlay.js';

const SUB = 64, MAX_CACHE = 24;

export class StreetIndex {
  constructor(overlay) {
    this.cells = new Map();
    for (const c of overlay.cells) this.cells.set(Math.round(c.x0 / CELL) * 4096 + Math.round(c.z0 / CELL), c);
    this.cache = new Map(); this._out = { d: 0, nx: 0, nz: 0, tx: 0, tz: 0, hw: 0 };
  }
  _grid(bx, bz) {
    const key = bx * 4096 + bz;
    let g = this.cache.get(key);
    if (g !== undefined) return g;
    const cell = this.cells.get(key);
    if (!cell) g = null;
    else {
      const geo = cell.mesh.geometry, seg = geo.attributes.iSeg.array, wc = geo.attributes.iWC.array, map = new Map();
      for (let i = 0; i < geo.instanceCount; i++) {
        if (wc[i * 2 + 1] > 1.5 || wc[i * 2] < 1.5) continue; // solo vías con ancho de calle: fuera ríos, frontera y senderos
        const x0 = seg[i * 4], z0 = seg[i * 4 + 1], x1 = seg[i * 4 + 2], z1 = seg[i * 4 + 3];
        const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 32));
        let last = -1;
        for (let s = 0; s <= steps; s++) {
          const k = Math.floor((x0 + ((x1 - x0) * s) / steps) / SUB) * 65536 + Math.floor((z0 + ((z1 - z0) * s) / steps) / SUB);
          if (k === last) continue; last = k;
          const list = map.get(k); if (list) list.push(i); else map.set(k, [i]);
        }
      }
      g = { seg, wc, map };
    }
    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, g);
    return g;
  }
  // Calle más cercana a (x, z) dentro de `max` metros (max ≤ 64), o null. Devuelve distancia al eje,
  // la normal desde la calle hacia el punto, la tangente y el semiancho. El objeto devuelto se reutiliza.
  nearest(x, z, max) {
    let best = max * max, found = false; const o = this._out;
    const cx = Math.floor(x / SUB), cz = Math.floor(z / SUB);
    // Un tramo vive en la celda de 2 km de su punto medio y mide hasta 400 m: puede asomarse a la celda vecina.
    for (let bz = Math.floor((z - 270) / CELL); bz <= Math.floor((z + 270) / CELL); bz++) for (let bx = Math.floor((x - 270) / CELL); bx <= Math.floor((x + 270) / CELL); bx++) {
      const g = this._grid(bx, bz); if (!g) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const list = g.map.get((cx + dx) * 65536 + cz + dz); if (!list) continue;
        for (const i of list) {
          const x0 = g.seg[i * 4], z0 = g.seg[i * 4 + 1], ex = g.seg[i * 4 + 2] - x0, ez = g.seg[i * 4 + 3] - z0, len2 = ex * ex + ez * ez || 1e-6;
          const t = Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / len2)), px = x - x0 - ex * t, pz = z - z0 - ez * t, d2 = px * px + pz * pz;
          if (d2 >= best) continue;
          best = d2; found = true;
          const d = Math.sqrt(d2), len = Math.sqrt(len2);
          o.d = d; o.tx = ex / len; o.tz = ez / len; o.hw = g.wc[i * 2]; o.px = px; o.pz = pz; // (px, pz): del eje de la calle al punto consultado
          if (d > 1e-3) { o.nx = px / d; o.nz = pz / d; } else { o.nx = -o.tz; o.nz = o.tx; }
        }
      }
    }
    return found ? o : null;
  }
}
