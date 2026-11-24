// Lo que hace reconocible a un pueblo y no sale de ninguna huella: su iglesia y su plaza, construidas a mano con las
// medidas del relevamiento (tools/relevamientos/). Por ahora, San José de Maipo: la iglesia parroquial (nave roja de
// adobe de unos 40 × 14 m con pórtico de columnas blancas y torre de madera, Monumento Histórico) y la Plaza de Armas
// (pileta central, bancas, faroles, asta, monolitos y los toldos de la feria artesanal). Los senderos y el pasto de la
// plaza ya vienen en la foto del suelo. Todo va en una sola malla, que se arma al acercarse.
import * as THREE from 'three';
import { SOLID_VERT, SOLID_FRAG } from './roadside.js';

const RED = [0.33, 0.07, 0.05], CAL = [0.58, 0.56, 0.52], ZINC = [0.27, 0.09, 0.07], WOOD = [0.20, 0.13, 0.08], IRON = [0.03, 0.08, 0.05];
const STONE = [0.40, 0.36, 0.34], WATER = [0.09, 0.19, 0.15], BLUE = [0.05, 0.13, 0.40], YELLOW = [0.55, 0.42, 0.05], CREAM = [0.5, 0.45, 0.33];

class Mesher {
  constructor(ax, az) { this.ax = ax; this.az = az; this.pos = []; this.nrm = []; this.col = []; }
  tri(a, b, c, color) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) { this.pos.push(p[0] - this.ax, p[1], p[2] - this.az); this.nrm.push(nx, ny, nz); this.col.push(color[0], color[1], color[2]); }
  }
  quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }
  // Caja apoyada en y0: largo sx sobre su eje local x, ancho sz. El giro usa la misma convención que las casas.
  box(cx, y0, cz, sx, sy, sz, yaw, color) {
    const c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, y, lz) => [cx + c * lx + s * lz, y, cz - s * lx + c * lz], hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
    const k = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
    for (let i = 0; i < 4; i++) { const a = k[i], b = k[(i + 1) % 4]; this.quad(P(a[0], y0, a[1]), P(a[0], y1, a[1]), P(b[0], y1, b[1]), P(b[0], y0, b[1]), color); }
    this.quad(P(-hx, y1, -hz), P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz), color);
  }
  // Techo a dos aguas: cumbrera a lo largo del eje local x, a h sobre y0.
  gable(cx, y0, cz, sx, sz, h, yaw, color, endColor = color) {
    const c = Math.cos(yaw), s = Math.sin(yaw), P = (lx, y, lz) => [cx + c * lx + s * lz, y, cz - s * lx + c * lz], hx = sx / 2, hz = sz / 2;
    this.quad(P(-hx, y0, -hz), P(-hx, y0 + h, 0), P(hx, y0 + h, 0), P(hx, y0, -hz), color);
    this.quad(P(-hx, y0, hz), P(hx, y0, hz), P(hx, y0 + h, 0), P(-hx, y0 + h, 0), color);
    this.tri(P(-hx, y0, -hz), P(-hx, y0, hz), P(-hx, y0 + h, 0), endColor); this.tri(P(hx, y0, -hz), P(hx, y0 + h, 0), P(hx, y0, hz), endColor);
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const m = new THREE.Mesh(g, mat); m.position.set(this.ax, 0, this.az); m.updateMatrixWorld(); m.matrixAutoUpdate = false; m.frustumCulled = false;
    return m;
  }
}

export class PuebloHitos {
  constructor({ hf, env, shadowTex, manifest }) {
    this.hf = hf; this.m = manifest; this.group = new THREE.Group(); this.built = false;
    const u = { ...env, uShadow: { value: shadowTex }, uCoreSize: { value: new THREE.Vector2(manifest.core.sizeX, manifest.core.sizeZ) } };
    this.mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: SOLID_VERT, fragmentShader: SOLID_FRAG, side: THREE.DoubleSide });
    [this.cx, this.cz] = this.w(-33.64038, -70.3529); // centro de la Plaza de Armas de San José de Maipo
  }
  w(lat, lon) { return [(lon - this.m.core.west) * this.m.mPerDegLon, (this.m.core.north - lat) * this.m.mPerDegLat]; }
  update(px, pz) {
    if (this.built || Math.hypot(px - this.cx, pz - this.cz) > 1100) return;
    this.built = true;
    const M = new Mesher(this.cx, this.cz);
    this._plaza(M); this._iglesia(M);
    this.group.add(M.mesh(this.mat));
  }
  _iglesia(M) {
    // Nave de norte a sur (por calle Comercio), frente al sur, hacia la plaza.
    const [x, z] = this.w(-33.63969, -70.3524), len = 40, wid = 14, yaw = -Math.PI / 2, H = 8, y = this.hf.height(x, z + len / 2, true), front = z + len / 2;
    M.box(x, y - 1.5, z, len + 0.5, 2.4, wid + 0.5, yaw, CAL);                 // zócalo blanco en talud
    M.box(x, y, z, len, H, wid, yaw, RED);                                     // muros de adobe, rojo colonial
    M.gable(x, y + H, z, len + 0.9, wid + 1.1, wid * 0.3, yaw, ZINC, CAL);     // techo de zinc rojo; frontón blanco
    for (const k of [-0.36, -0.12, 0.12, 0.36]) for (const side of [-1, 1]) M.box(x + side * (wid / 2 + 0.25), y, z + len * k, 1.3, H * 0.85, 0.9, 0, CAL); // contrafuertes
    // Pórtico: cuatro columnas blancas sobre pedestal, entablamento y cornisa.
    for (const k of [-0.42, -0.14, 0.14, 0.42]) { M.box(x + wid * k, y, front + 2.4, 0.9, 1.0, 0.9, 0, CAL); M.box(x + wid * k, y + 1, front + 2.4, 0.6, 5.2, 0.6, 0, CAL); }
    M.box(x, y + 6.2, front + 1.3, wid + 0.6, 1.1, 3.0, 0, CAL);
    M.box(x, y + 7.3, front + 1.3, wid + 1.0, 0.3, 3.4, 0, CAL);
    // Torre de madera sobre el frente: dos cuerpos rojos de esquineros blancos, linterna blanca y cruz.
    const tz = front - 3.2, t0 = y + H + 1.2;
    M.box(x, t0, tz, 4.6, 6.8, 4.6, 0, RED);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) M.box(x + sx * 2.3, t0, tz + sz * 2.3, 0.4, 6.8, 0.4, 0, CAL);
    M.box(x, t0 + 6.8, tz, 5.2, 0.35, 5.2, 0, CAL);
    M.box(x, t0 + 7.15, tz, 3.4, 2.6, 3.4, 0, RED);
    M.box(x, t0 + 9.75, tz, 3.9, 0.3, 3.9, 0, CAL);
    M.box(x, t0 + 10.05, tz, 1.8, 1.7, 1.8, 0, CAL);
    M.gable(x, t0 + 11.75, tz, 2.2, 2.2, 1.0, 0, CAL);
    M.box(x, t0 + 12.6, tz, 0.14, 1.6, 0.14, 0, IRON); M.box(x, t0 + 13.5, tz, 0.8, 0.14, 0.14, 0, IRON);
  }
  _plaza(M) {
    const hf = this.hf, cx = this.cx, cz = this.cz, h = (x, z) => hf.height(x, z, true);
    // Pileta: pretil circular de piedra, espejo de agua, taza blanca y pedestal de fierro de varios platos.
    const y0 = h(cx, cz);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; M.box(cx + Math.sin(a) * 3.9, y0, cz + Math.cos(a) * 3.9, 1.62, 0.45, 0.5, a, STONE); }
    M.box(cx, y0, cz, 6.6, 0.3, 6.6, 0.39, WATER); M.box(cx, y0, cz, 6.6, 0.3, 6.6, 1.18, WATER);
    M.box(cx, y0, cz, 2.6, 0.55, 2.6, 0.39, CAL); M.box(cx, y0, cz, 2.6, 0.55, 2.6, 1.18, CAL);
    M.box(cx, y0, cz, 0.34, 2.6, 0.34, 0, IRON); M.box(cx, y0 + 1.15, cz, 1.7, 0.12, 1.7, 0.39, IRON); M.box(cx, y0 + 1.95, cz, 1.0, 0.1, 1.0, 0.39, IRON);
    // Bancas de listones en el anillo central, mirando a la pileta; faroles de fierro verde alrededor y en los ejes.
    for (let i = 0; i < 10; i++) {
      const a = ((i + 0.5) / 10) * Math.PI * 2, x = cx + Math.sin(a) * 10.2, z = cz + Math.cos(a) * 10.2, y = h(x, z);
      M.box(x, y + 0.4, z, 1.8, 0.07, 0.5, a, WOOD); M.box(x + Math.sin(a) * 0.26, y + 0.47, z + Math.cos(a) * 0.26, 1.8, 0.45, 0.07, a, WOOD);
      for (const s of [-0.7, 0.7]) M.box(x + Math.cos(a) * s, y, z - Math.sin(a) * s, 0.08, 0.4, 0.45, a, IRON);
    }
    const farol = (x, z) => { const y = h(x, z); M.box(x, y, z, 0.13, 3.8, 0.13, 0, IRON); M.box(x, y + 3.8, z, 0.34, 0.5, 0.34, 0, CREAM); M.box(x, y + 4.3, z, 0.42, 0.08, 0.42, 0, IRON); };
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; farol(cx + Math.sin(a) * 13, cz + Math.cos(a) * 13); farol(cx + Math.sin(a) * 30, cz + Math.cos(a) * 30); }
    // Asta con la bandera, busto y monolitos de las esquinas.
    const at = (lat, lon, f) => { const [x, z] = this.w(lat, lon); f(x, h(x, z), z); };
    at(-33.64012, -70.35252, (x, y, z) => { M.box(x, y, z, 0.14, 12, 0.14, 0, CAL); M.box(x + 0.9, y + 10.9, z, 1.7, 0.55, 0.04, 0, CAL); M.box(x + 0.9, y + 10.35, z, 1.7, 0.55, 0.04, 0, [0.5, 0.04, 0.04]); M.box(x + 0.33, y + 10.9, z, 0.56, 0.55, 0.06, 0, [0.02, 0.08, 0.35]); });
    at(-33.64015, -70.35251, (x, y, z) => { M.box(x, y, z, 0.8, 1.4, 0.8, 0, CREAM); M.box(x, y + 1.4, z, 0.5, 0.6, 0.4, 0, CAL); });
    at(-33.64005, -70.35244, (x, y, z) => { M.box(x, y, z, 1.2, 0.5, 0.9, 0, [0.3, 0.1, 0.07]); M.box(x, y + 0.5, z, 0.9, 1.6, 0.35, 0, CREAM); });
    at(-33.64005, -70.35327, (x, y, z) => M.box(x, y, z, 0.8, 1.8, 0.5, 0, CAL));
    at(-33.64037, -70.35326, (x, y, z) => M.box(x, y, z, 0.9, 1.5, 0.9, 0, CAL));
    // Feria artesanal: toldos de 3 × 3 m, azules y amarillos, en la explanada oriente; puestos en las esquinas.
    const toldo = (x, z, c) => { const y = h(x, z); for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) M.box(x + sx, y, z + sz, 0.06, 2.3, 0.06, 0, STONE); M.box(x, y + 2.3, z, 3.0, 0.12, 3.0, 0, c); M.gable(x, y + 2.42, z, 3.0, 3.0, 0.6, 0, c); M.box(x, y, z + 0.9, 2.4, 0.8, 0.7, 0, WOOD); };
    for (let i = 0; i < 6; i++) at(-33.64044 - i * 0.000036, -70.3525, (x, y, z) => toldo(x, z, i % 2 ? YELLOW : BLUE));
    at(-33.64003, -70.3532, (x, y, z) => toldo(x, z, BLUE)); at(-33.64074, -70.35318, (x, y, z) => toldo(x, z, BLUE));
    at(-33.64072, -70.3525, (x, y, z) => { M.box(x, y, z, 2.6, 2.2, 2.6, 0, [0.4, 0.07, 0.05]); M.gable(x, y + 2.2, z, 3.0, 3.0, 0.7, 0, ZINC); });
  }
}
