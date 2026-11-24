// Nombres reales de las calles (OpenStreetMap), como letreros sobre la calle misma. Los datos van por zona de 4 km
// (data/zones/names/, armados por tools/build_street_names.mjs) y solo se bajan las zonas que rodean al jugador.
// Cada medio segundo se eligen las calles más cercanas a un punto unos metros delante de la cámara, y el letrero de
// cada una se pone en el punto de la calle más próximo a ese: así el nombre acompaña al que va caminando por ella y
// los de las transversales aparecen en la esquina que viene.
const ZONE = 4096, REACH = [650, 380, 230]; // m a los que se lee el letrero según la clase: avenida, colectora, calle o pasaje

export class StreetNames {
  constructor(labels, hf) {
    this.labels = labels; this.hf = hf; this.index = null; this.zones = new Map(); this.items = new Map();
    this.tick = 0; this.current = ''; // current: la calle por la que va el jugador (para el HUD)
    fetch(new URL('../data/zones/names/index.json', import.meta.url)).then((r) => (r.ok ? r.json() : [])).then((l) => { this.index = new Set(l); }).catch(() => { this.index = new Set(); });
  }
  _load(key, ix, iz) {
    this.zones.set(key, null);
    fetch(new URL(`../data/zones/names/${key}.json`, import.meta.url)).then((r) => r.json()).then((list) => {
      if (!this.zones.has(key)) return; // el jugador ya se fue
      const ox = ix * ZONE, oz = iz * ZONE;
      this.zones.set(key, list.map(([name, cls, ...polys]) => {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        const ps = polys.map((p) => { const a = new Float32Array(p.length); for (let i = 0; i < p.length; i += 2) { const x = (a[i] = p[i] + ox), z = (a[i + 1] = p[i + 1] + oz); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return a; });
        return { name, cls, ps, x0, z0, x1, z1 };
      }));
    }).catch(() => { this.zones.delete(key); });
  }
  // px, pz: jugador. fx, fz: dirección horizontal de la mirada. speed: m/s (a velocidad de viaje no hay letreros).
  update(dt, px, pz, fx, fz, speed) {
    if ((this.tick -= dt) > 0) return;
    this.tick = 0.45;
    if (!this.index || speed > 40 || !this.labels.enabled.calles) { this.labels.dyn = []; this.current = ''; return; }
    const cx = Math.floor(px / ZONE), cz = Math.floor(pz / ZONE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iz = cz + dz, key = ix + '_' + iz;
      // solo la zona propia y las vecinas que están a menos de 700 m
      const near = Math.max(ix * ZONE - px, px - (ix + 1) * ZONE, iz * ZONE - pz, pz - (iz + 1) * ZONE) < 700;
      if (near && this.index.has(key) && !this.zones.has(key)) this._load(key, ix, iz);
    }
    for (const key of this.zones.keys()) { const [ix, iz] = key.split('_').map(Number); if (Math.abs(ix - cx) > 1 || Math.abs(iz - cz) > 1) this.zones.delete(key); }

    const rx = px + fx * 28, rz = pz + fz * 28, best = new Map(); // nombre → { d, x, z, cls }
    let cur = '', curD = 9;
    for (const z of this.zones.values()) if (z) for (const s of z) {
      const R = REACH[s.cls];
      if (rx < s.x0 - R || rx > s.x1 + R || rz < s.z0 - R || rz > s.z1 + R) continue;
      let bd = Infinity, bx = 0, bz = 0, pd = Infinity;
      for (const a of s.ps) for (let i = 0; i < a.length - 2; i += 2) {
        const x0 = a[i], z0 = a[i + 1], ex = a[i + 2] - x0, ez = a[i + 3] - z0, l2 = ex * ex + ez * ez || 1e-6;
        let t = ((rx - x0) * ex + (rz - z0) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(rx - x0 - ex * t, rz - z0 - ez * t);
        if (d < bd) { bd = d; bx = x0 + ex * t; bz = z0 + ez * t; }
        let u = ((px - x0) * ex + (pz - z0) * ez) / l2; u = u < 0 ? 0 : u > 1 ? 1 : u;
        const e = Math.hypot(px - x0 - ex * u, pz - z0 - ez * u); if (e < pd) pd = e;
      }
      if (pd < curD) { curD = pd; cur = s.name; }
      if (bd > R) continue;
      const o = best.get(s.name);
      if (!o || bd < o.d) best.set(s.name, { d: bd, x: bx, z: bz, cls: s.cls, k: bd / R });
    }
    this.current = cur;
    const pick = [...best].sort((a, b) => a[1].k - b[1].k).slice(0, 12), dyn = [];
    for (const [name, o] of pick) {
      let it = this.items.get(name);
      if (!it) this.items.set(name, (it = { name, kind: 'calle', group: 'calles', rank: 3, ele: 0 }));
      it.x = o.x; it.z = o.z; it.y = this.hf.height(o.x, o.z) + 3.2; it.range = REACH[o.cls] * 1.15;
      dyn.push(it);
    }
    if (this.items.size > 400) this.items.clear(); // los letreros viejos no se acumulan para siempre
    this.labels.dyn = dyn;
  }
}
