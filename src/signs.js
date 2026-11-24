// Carteles: el nombre real de cada local, servicio o lugar (OpenStreetMap, data/zones/pois/, armado por
// tools/build_pois.mjs), puesto como letrero en la fachada del edificio donde está y mirando a su calle. Si ahí no
// hay edificio cargado, queda como letrero en un poste al borde de la vereda.
// Todos los carteles cercanos se pintan en un solo lienzo (una casilla por cartel) y se dibujan con una sola malla
// instanciada: cuesta una textura y una llamada de dibujo.
import * as THREE from 'three';
import { COMMON_VERT, ATMOS_GLSL } from './shaders.js';

const ZONE = 4096, COLS = 8, ROWS = 16, CW = 256, CH = 64, MAX = COLS * ROWS, REACH = 230;
// Colores de tablero y de letra según el tipo (ver build_pois.mjs); el comercio sortea entre varios, como en la calle.
const STYLE = [
  [['#f4f1e6', '#b3261e'], ['#f2c531', '#1c1b17'], ['#1f4e8c', '#ffffff'], ['#2f6b3a', '#fdfbf2'], ['#c0392b', '#fff6d8'], ['#1c1c1c', '#f2c531'], ['#ffffff', '#1f3b73']],
  [['#7a1f1a', '#f6e7c1'], ['#f3e6c4', '#5a2d0c'], ['#22343a', '#f0d28a'], ['#e8dcc0', '#8c1c13']],
  [['#16407a', '#ffffff'], ['#0f5c3a', '#ffffff'], ['#ffffff', '#16407a']],
  [['#1d5c3f', '#ffffff'], ['#f4f1e6', '#1d3f6e']],
  [['#efe6cf', '#4a2c14'], ['#4a2c14', '#efe6cf']],
  [['#5b3a1e', '#f3e3bd'], ['#2c4a34', '#f1e9cf']],
  [['#3a3d42', '#f2f2f2'], ['#e9e6dc', '#2a2a2a']],
];

const VERT = /* glsl */ `
${COMMON_VERT}
attribute vec4 iPR;   // posición relativa al ancla (xyz) y giro en Y
attribute vec3 iSC;   // ancho, alto (m) y casilla del lienzo
uniform vec3 uCamRel;
varying vec2 vUv;
varying vec3 vRel, vN;
void main() {
  float c = cos(iPR.w), s = sin(iPR.w), x = position.x * iSC.x;
  vec3 wp = vec3(c * x, position.y * iSC.y, -s * x) + iPR.xyz;
  vN = vec3(s, 0.0, c); vRel = wp - uCamRel;
  vUv = (vec2(mod(iSC.z, ${COLS}.0), floor(iSC.z / ${COLS}.0)) + vec2(uv.x, 1.0 - uv.y)) / vec2(${COLS}.0, ${ROWS}.0);
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(wp, 1.0));
}`;
const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform sampler2D tMap;
uniform float uCamY;
varying vec2 vUv;
varying vec3 vRel, vN;
void main() {
  vec3 col = texture2D(tMap, vUv).rgb, N = normalize(vN);
  vec3 c = col * (uSunColor * max(dot(N, uSunDir), 0.0) * 0.7 + uAmbient * 1.2);
  c = applyFog(c, uCamY, vRel, length(vRel));
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Signs {
  constructor({ env, hf, props }) {
    this.hf = hf; this.props = props; this.index = null; this.zones = new Map(); this.extra = []; // extra: carteles puestos a mano (pueblos.js)
    this.cv = document.createElement('canvas'); this.cv.width = COLS * CW; this.cv.height = ROWS * CH;
    this.g = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.flipY = false; this.tex.anisotropy = 8;
    const geo = new THREE.InstancedBufferGeometry(), q = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('position', q.attributes.position); geo.setAttribute('uv', q.attributes.uv); geo.setIndex(q.index);
    this.iPR = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4); this.iSC = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    geo.setAttribute('iPR', this.iPR); geo.setAttribute('iSC', this.iSC); geo.instanceCount = 0;
    this.uniforms = { ...env, tMap: { value: this.tex }, uCamRel: { value: new THREE.Vector3() }, uCamY: { value: 0 } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.visible = false;
    this.tick = 0; this.sig = ''; this.zv = -1; this.labels = []; // labels: los mismos nombres, para quien quiera listarlos
    fetch(new URL('../data/zones/pois/index.json', import.meta.url)).then((r) => (r.ok ? r.json() : [])).then((l) => { this.index = new Set(l); }).catch(() => { this.index = new Set(); });
  }
  _load(key, ix, iz) {
    this.zones.set(key, null);
    fetch(new URL(`../data/zones/pois/${key}.json`, import.meta.url)).then((r) => r.json()).then((list) => {
      if (this.zones.has(key)) this.zones.set(key, list.map(([n, k, x, z]) => ({ n, k, x: x + ix * ZONE, z: z + iz * ZONE })));
    }).catch(() => { this.zones.delete(key); });
  }
  update(dt, px, pz, camera) {
    this.uniforms.uCamRel.value.copy(camera.position).sub(this.mesh.position); this.uniforms.uCamY.value = camera.position.y;
    if ((this.tick -= dt) > 0 || !this.index) return;
    this.tick = 1;
    const cx = Math.floor(px / ZONE), cz = Math.floor(pz / ZONE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const ix = cx + dx, iz = cz + dz, key = ix + '_' + iz;
      if (Math.max(ix * ZONE - px, px - (ix + 1) * ZONE, iz * ZONE - pz, pz - (iz + 1) * ZONE) < REACH + 60 && this.index.has(key) && !this.zones.has(key)) this._load(key, ix, iz);
    }
    for (const key of this.zones.keys()) { const [ix, iz] = key.split('_').map(Number); if (Math.abs(ix - cx) > 1 || Math.abs(iz - cz) > 1) this.zones.delete(key); }
    const near = [];
    const take = (s) => { const d = Math.hypot(s.x - px, s.z - pz); if (d < REACH) near.push({ s, d }); };
    for (const s of this.extra) take(s);
    // Los de OSM que caen encima de un cartel relevado a mano se omiten: es el mismo local, y manda lo leído en la calle.
    const mine = near.map((o) => o.s);
    for (const z of this.zones.values()) if (z) for (const s of z) { if (!mine.some((e) => Math.abs(e.x - s.x) < 16 && Math.abs(e.z - s.z) < 16)) take(s); }
    near.sort((a, b) => a.d - b.d); near.length = Math.min(near.length, MAX);
    // Solo se rehace si cambió el conjunto de carteles a la vista o si llegaron edificios nuevos donde apoyarlos.
    const sig = near.map((o) => o.s.n + (o.s.x | 0)).join('|'), zv = this.props.zoneVersion || 0;
    if (sig === this.sig && zv === this.zv) return;
    this.sig = sig; this.zv = zv;
    this._build(near.map((o) => o.s), px, pz);
  }
  _build(list, px, pz) {
    const g = this.g, P = this.iPR.array, S = this.iSC.array, streets = this.props.streets, used = new Map();
    this.mesh.position.set(Math.round(px), 0, Math.round(pz)); // ancla: los carteles van relativos a ella
    const ax = this.mesh.position.x, az = this.mesh.position.z;
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    let n = 0;
    for (const s of list) {
      // --- tablero: color según el tipo, letra que se achica hasta caber
      const h = [...s.n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), st = STYLE[s.k] || STYLE[6], [bg, fg] = s.col || st[h % st.length];
      const X = (n % COLS) * CW, Y = Math.floor(n / COLS) * CH, text = s.k === 2 || (h & 3) === 0 ? s.n.toUpperCase() : s.n;
      g.fillStyle = bg; g.fillRect(X, Y, CW, CH);
      g.strokeStyle = fg; g.globalAlpha = 0.55; g.lineWidth = 3; g.strokeRect(X + 4, Y + 4, CW - 8, CH - 8); g.globalAlpha = 1;
      let fs = 34; g.font = `700 ${fs}px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`;
      while (fs > 13 && g.measureText(text).width > CW - 26) { fs -= 2; g.font = `700 ${fs}px "Arial Narrow", "Roboto Condensed", system-ui, sans-serif`; }
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, X + CW / 2, Y + CH / 2 + 1, CW - 20);
      // --- dónde va: en la fachada que da a la calle del edificio más cercano; si no hay, en un poste junto a la vereda
      const w = Math.min(6.4, Math.max(2.3, text.length * 0.27)), hgt = w * (CH / CW);
      let x = s.x, z = s.z, y = 2.5, yaw = 0;
      const b = this.props.buildingNear ? this.props.buildingNear(s.x, s.z, 9) : null, road = streets && streets.nearest(b ? b.x : s.x, b ? b.z : s.z, 40);
      if (road && road.d > 0.5) {
        const ux = road.px / road.d, uz = road.pz / road.d; // de la calle hacia el edificio
        yaw = Math.atan2(-ux, -uz);
        if (b) {
          const c = Math.cos(b.rot), si = Math.sin(b.rot), depth = Math.abs(ux * c - uz * si) * b.L / 2 + Math.abs(ux * si + uz * c) * b.W / 2;
          const bk = Math.round(b.x * 2) + ',' + Math.round(b.z * 2), k = used.get(bk) || 0; used.set(bk, k + 1);
          const side = ((k + 1) >> 1) * (k & 1 ? -1 : 1) * (w + 0.35); // varios locales en el mismo edificio: uno al lado del otro
          x = b.x - ux * (depth + 0.14) - uz * side; z = b.z - uz * (depth + 0.14) + ux * side; y = Math.min(b.floors * 2.9 - 0.25, 2.75);
        } else { x = s.x - ux * Math.max(0, road.d - road.hw - 1.4); z = s.z - uz * Math.max(0, road.d - road.hw - 1.4); }
      } else if (b) { yaw = b.rot; y = 2.75; }
      P[n * 4] = x - ax; P[n * 4 + 1] = this.hf.height(x, z, true) + y; P[n * 4 + 2] = z - az; P[n * 4 + 3] = yaw;
      S[n * 3] = w; S[n * 3 + 1] = hgt; S[n * 3 + 2] = n; n++;
    }
    this.iPR.needsUpdate = this.iSC.needsUpdate = true; this.tex.needsUpdate = true;
    this.mesh.geometry.instanceCount = n; this.mesh.visible = n > 0;
  }
}
