// Nombres sobre el paisaje: etiquetas HTML proyectadas desde el mundo 3D, priorizadas por importancia
// y distancia, ocultas cuando un cerro las tapa y sin superponerse entre sí.
import * as THREE from 'three';

const GROUP_OF = {
  cerro: 'cumbres', volcan: 'cumbres', paso: 'cumbres',
  ciudad: 'localidades', pueblo: 'localidades', villa: 'localidades', caserio: 'localidades', barrio: 'localidades', lugar: 'localidades',
  lago: 'agua', rio: 'agua', estero: 'agua', glaciar: 'agua', cascada: 'agua', termas: 'agua',
  refugio: 'lugares', mirador: 'lugares', atractivo: 'lugares', parque: 'lugares', ski: 'lugares',
  valle: 'relieve', cordon: 'relieve', region: 'relieve',
  ruta: 'vias', puente: 'vias', calle: 'calles',
};
// Grandes unidades del relieve: [nombre, lat, lon]. Son el "mapa mental" de la zona.
const REGIONS = [
  ['Cajón del Maipo', -33.70, -70.33], ['Sierra de Ramón', -33.47, -70.44], ['Cuenca de Santiago', -33.50, -70.70],
  ['Valle del Yeso', -33.64, -70.02], ['Cajón del río Colorado', -33.50, -70.20], ['Cajón del río Olivares', -33.33, -70.14],
  ['Valle del río Volcán', -33.82, -70.10], ['Cajón del Mapocho', -33.36, -70.42], ['Valle de Pirque', -33.66, -70.56],
  ['Caldera Diamante', -34.17, -69.73], ['Cordillera de la Costa', -33.60, -71.08], ['Valle del Cachapoal', -34.20, -70.60],
];
const RANGE = [170000, 42000, 13000, 4200]; // alcance en metros según prioridad 0..3
// Hitos fuera del área jugable que se ven en el horizonte: [nombre, tipo, lat, lon, altitud]
const FAR = [
  ['Cerro Aconcagua', 'cerro', -32.6532, -70.0109, 6961], ['Cerro Mercedario', 'cerro', -31.979, -70.113, 6720],
  ['Nevado Juncal', 'cerro', -33.045, -70.085, 5953], ['Volcán Tinguiririca', 'volcan', -34.814, -70.352, 4280],
  ['Volcán Palomo', 'volcan', -34.608, -70.295, 4860], ['Altos de Cantillana', 'cerro', -33.966, -70.972, 2281],
  ['Cerro El Roble', 'cerro', -32.976, -71.012, 2222], ['Cerro La Campana', 'cerro', -32.955, -71.133, 1880],
  ['Mendoza', 'ciudad', -32.8895, -68.8458, 0], ['Valparaíso', 'ciudad', -33.0472, -71.6127, 0], ['Los Andes', 'ciudad', -32.8337, -70.5983, 0],
  ['San Antonio', 'ciudad', -33.5957, -71.6146, 0], ['Tupungato (Mendoza)', 'ciudad', -33.371, -69.148, 0], ['San Fernando', 'ciudad', -34.584, -70.989, 0],
  ['Melipilla', 'ciudad', -33.689, -71.215, 0], ['Portillo', 'ski', -32.835, -70.13, 0], ['Océano Pacífico', 'lago', -33.4, -71.95, 0],
];
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export class Labels {
  constructor(container, data, hf, manifest, max) {
    this.hf = hf; this.max = max; this.container = container;
    this.enabled = { cumbres: true, localidades: true, agua: true, lugares: true, relieve: true, vias: true, calles: true };
    this.dyn = []; // letreros que cambian de lugar (nombres de calles, ver streetnames.js): se revisan junto con los fijos
    this.items = data.items.map(([name, k, x, z, rank, ele]) => ({ name, kind: data.kinds[k], group: GROUP_OF[data.kinds[k]], x, z, rank, ele }));
    for (const [name, kind, lat, lon, ele] of FAR)
      this.items.push({ name, kind, group: GROUP_OF[kind], x: (lon - manifest.core.west) * manifest.mPerDegLon, z: (manifest.core.north - lat) * manifest.mPerDegLat, rank: 0, ele, far: true });
    for (const [name, lat, lon] of REGIONS)
      this.items.push({ name, kind: 'region', group: 'relieve', x: (lon - manifest.core.west) * manifest.mPerDegLon, z: (manifest.core.north - lat) * manifest.mPerDegLat, rank: 0, ele: 0, lift: 180 });
    this.active = []; this.els = new Map(); this.pool = [];
    this._vp = new THREE.Matrix4(); this._rects = [];
  }
  setLayer(group, on) { this.enabled[group] = on; }
  add(list) { for (const l of list) this.items.push({ kind: 'hito', group: 'lugares', rank: 1, ele: 0, ...l }); }

  _project(it, out) {
    const e = this._vp.elements, x = it.x, y = it.y, z = it.z;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (w <= 0.01) return false;
    out[0] = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w; out[1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
    return true;
  }

  // Selección de candidatas (cada ~250 ms): lo caro —distancias, orden y oclusión— no corre por frame.
  refresh(camera) {
    const cam = camera.position, hf = this.hf, p = [0, 0], cands = [];
    this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    for (let n = 0, N = this.items.length + this.dyn.length; n < N; n++) {
      const it = n < this.items.length ? this.items[n] : this.dyn[n - this.items.length];
      if (!this.enabled[it.group]) continue;
      const R = it.range || RANGE[it.rank], dx = it.x - cam.x, dz = it.z - cam.z, d2 = dx * dx + dz * dz;
      if (d2 > R * R) continue;
      if (it.y === undefined) it.y = Math.max(hf.base(it.x, it.z), it.far ? it.ele * 0.97 : 0) + (it.lift || 0);
      if (!this._project(it, p) || Math.abs(p[0]) > 1.08 || p[1] > 1.15 || p[1] < -1.05) continue;
      it.d = Math.sqrt(d2 + (it.y - cam.y) ** 2);
      it.score = it.d / R + it.rank * 0.1 + (it.group === 'cumbres' ? 0 : 0.04) + (it.kind === 'region' ? (it.d < 2500 ? 9 : 0.12) : 0); // estando dentro de un valle, su nombre estorba
      cands.push(it);
    }
    cands.sort((a, b) => a.score - b.score);
    const active = [], limit = Math.ceil(this.max * 1.5);
    for (let i = 0; i < cands.length && i < this.max * 4 && active.length < limit; i++) {
      const it = cands[i];
      if (it.d < 200 || hf.visible(cam.x, cam.y, cam.z, it.x, it.y + 12 + it.d * 0.004, it.z)) active.push(it);
    }
    for (const [it, el] of this.els) if (!active.includes(it)) { el.style.display = 'none'; this.pool.push(el); this.els.delete(it); }
    this.active = active;
  }

  _el(it) {
    let el = this.els.get(it);
    if (el) return el;
    el = this.pool.pop() || this.container.appendChild(document.createElement('div'));
    el.className = `lbl g-${it.group} r${it.rank} k-${it.kind}`;
    el.textContent = it.name;
    if (it.ele > 0 && it.group === 'cumbres') el.appendChild(document.createElement('i')).textContent = `${fmt(it.ele)} m`;
    else if (it.note) el.appendChild(document.createElement('i')).textContent = it.note;
    it.w = it.name.length * (it.kind === 'region' ? 11.5 : it.rank < 2 ? 7.8 : 6.9) + 14; it.h = (it.ele > 0 && it.group === 'cumbres') || it.note ? 48 : 36;
    this.els.set(it, el);
    return el;
  }

  // Por frame: solo proyectar las activas y resolver solapes en orden de prioridad.
  update(camera, width, height) {
    this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const rects = this._rects, p = [0, 0]; rects.length = 0;
    let shown = 0;
    for (const it of this.active) {
      let ok = shown < this.max && this._project(it, p);
      let sx = 0, sy = 0;
      if (ok) {
        sx = (p[0] * 0.5 + 0.5) * width; sy = (1 - (p[1] * 0.5 + 0.5)) * height;
        const el = this._el(it), x0 = sx - it.w / 2, x1 = sx + it.w / 2, y0 = sy - it.h, y1 = sy;
        ok = sx > -40 && sx < width + 40 && sy > 60 && sy < height + 30;
        for (let i = 0; ok && i < rects.length; i += 4) if (x0 < rects[i + 2] && x1 > rects[i] && y0 < rects[i + 3] && y1 > rects[i + 1]) ok = false;
        if (ok) {
          rects.push(x0, y0, x1, y1); shown++;
          el.style.display = 'block';
          el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-100%)`;
          el.style.opacity = Math.min(1, Math.max(0.25, (1.05 - it.d / (it.range || RANGE[it.rank])) * 3)).toFixed(2);
          continue;
        }
      }
      const el = this.els.get(it); if (el) el.style.display = 'none';
    }
  }

  // Nombre del lugar más cercano para el HUD (prefiere localidades; si no, la cumbre o hito de al lado).
  nearest(x, z) {
    let best = null, bs = Infinity;
    for (const it of this.items) {
      if (it.far || it.group === 'vias' || it.kind === 'mirador' || it.kind === 'atractivo' || it.kind === 'estero') continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d > 7000) continue;
      const s = d * (it.group === 'localidades' ? 1 : 1.5) * (1 + it.rank * 0.25);
      if (s < bs) { bs = s; best = it; }
    }
    return best;
  }
}
