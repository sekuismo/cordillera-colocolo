// Vegetación y rocas instanciadas alrededor de la cámara: es lo que da la escala humana al paisaje.
// La distribución es determinista (hash por celda) y sigue reglas simples de la zona central:
// altitud, pendiente, exposición (los quiscos van en laderas que miran al norte) y el verdor de la imagen satelital.
import * as THREE from 'three';
import { COMMON_VERT, ATMOS_GLSL } from './shaders.js';

const TYPES = [
  { key: 'pasto', cell: 6, range: 60, per: 14, max: 9000 },
  { key: 'roca', cell: 12, range: 170, per: 3, max: 1500 },
  { key: 'arbusto', cell: 14, range: 300, per: 4, max: 5000 },
  { key: 'arbol', cell: 26, range: 560, per: 4, max: 5000 },
  { key: 'quisco', cell: 26, range: 420, per: 2, max: 1500 },
  { key: 'casa', cell: 15, range: 560, per: 1, max: 6000 },
];
// Radio (m) y densidad máxima de construcciones alrededor de cada localidad OSM, según su tipo.
const URBAN = { ciudad: [4500, 1], pueblo: [950, 0.85], barrio: [1500, 0.8], villa: [430, 0.7], caserio: [150, 0.5] };

const VERT = /* glsl */ `
${COMMON_VERT}
attribute vec4 iPR;   // posición relativa al ancla (xyz) y rotación en Y
attribute vec2 iSV;   // escala y semilla de variación
uniform vec3 uCamRel; // cámara relativa al ancla
uniform vec2 uAnchor, uCoreSize;
uniform float uTime, uRange;
uniform sampler2D uCoreAlb, uShadow;
varying vec3 vRel, vN, vGround;
varying vec2 vUv;
varying float vVar, vShade;
void main() {
  vec3 p = position;
  float fade = 1.0 - smoothstep(uRange * 0.72, uRange, length(iPR.xyz - uCamRel)); // se encoge al borde del alcance: sin "pop"
  #if TYPE == 0
    p.xz += uv.y * uv.y * vec2(sin(uTime * 1.7 + iPR.x * 0.6), cos(uTime * 1.3 + iPR.z * 0.6)) * 0.07;
    p *= iSV.x * fade * vec3(1.0, 0.7 + iSV.y * 0.6, 1.0);
  #elif TYPE == 1
    p *= iSV.x * fade * vec3(1.0, 0.55 + fract(iSV.y * 7.3) * 0.45, 0.7 + fract(iSV.y * 3.1) * 0.5);
  #elif TYPE == 5
    float tall = floor(iSV.y); // pisos extra: edificios en el centro de las ciudades
    p *= iSV.x * fade * vec3(1.0 + tall * 0.05, 1.0 + tall * 0.9, 1.0 + tall * 0.05);
  #else
    p.xz += uv.y * vec2(sin(uTime * 0.9 + iPR.x * 0.2), cos(uTime * 0.7 + iPR.z * 0.2)) * 0.03 * step(0.5, uv.x);
    p *= iSV.x * fade * vec3(1.0, 0.85 + fract(iSV.y * 5.7) * 0.4, 1.0);
  #endif
  float c = cos(iPR.w), s = sin(iPR.w);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vN = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
  vec3 wp = p + iPR.xyz;
  vRel = wp - uCamRel; vUv = uv; vVar = iSV.y;
  vGround = textureLod(uCoreAlb, (uAnchor + iPR.xz) / uCoreSize, 2.0).rgb;
  vShade = textureLod(uShadow, (uAnchor + iPR.xz) / uCoreSize, 0.0).r; // color del suelo donde está parada
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(wp, 1.0));
}`;

const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec3 uCamRel;
uniform float uCamY;
varying vec3 vRel, vN, vGround;
varying vec2 vUv;
varying float vVar, vShade;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 col; float wrap = 0.0;
  vec3 wp = vRel + uCamRel;
  float speck = vnoise(wp * 7.0) * 0.6 + vnoise(wp * 23.0) * 0.4;
  #if TYPE == 0      // coirón: pasto duro en champas, color paja
    col = mix(vec3(0.15, 0.13, 0.055), vec3(0.30, 0.25, 0.10), vUv.y) * (0.75 + vVar * 0.5);
    col = mix(col, vGround * 1.25, 0.3); wrap = 0.6; N = normalize(N + vec3(0.0, 1.4, 0.0));
  #elif TYPE == 1    // roca: toma el color del suelo, más gris
    float g = dot(vGround, vec3(0.33));
    col = mix(vGround, vec3(g), 0.45) * (0.8 + vVar * 0.55) * (0.85 + 0.3 * speck);
  #elif TYPE == 2    // arbusto del matorral
    col = mix(vec3(0.03, 0.042, 0.016), vec3(0.075, 0.08, 0.032), vVar) * (0.55 + 0.9 * speck) * (0.6 + 0.5 * vUv.y); wrap = 0.5;
  #elif TYPE == 3    // árbol esclerófilo (quillay, litre) o espino
    col = vUv.x < 0.5 ? vec3(0.055, 0.04, 0.028) * (0.7 + 0.6 * speck)
      : mix(vec3(0.02, 0.036, 0.014), vec3(0.055, 0.07, 0.028), vVar) * (0.5 + 1.0 * speck) * (0.55 + 0.55 * vUv.y);
    wrap = vUv.x < 0.5 ? 0.0 : 0.5;
  #elif TYPE == 4    // quisco: cactus columnar con costillas
    float rib = 0.72 + 0.28 * abs(sin(vUv.x * 37.7));
    col = vec3(0.075, 0.12, 0.06) * rib * (0.8 + 0.4 * vVar); wrap = 0.25;
  #else              // casas y edificios: muros claros, techos de zinc o teja
    float v = fract(vVar), tall = floor(vVar);
    vec3 wall = v < 0.3 ? vec3(0.40, 0.38, 0.33) : v < 0.55 ? vec3(0.33, 0.26, 0.18) : v < 0.8 ? vec3(0.35, 0.35, 0.34) : vec3(0.27, 0.32, 0.34);
    vec3 roof = v < 0.4 ? vec3(0.20, 0.21, 0.23) : v < 0.75 ? vec3(0.24, 0.085, 0.055) : vec3(0.11, 0.11, 0.12);
    float win = step(0.45, fract(vUv.y * (1.6 + tall * 1.6) * 1.57)) * step(0.4, fract((wp.x + wp.z) * 0.42 + wp.y * 0.01));
    col = vUv.x > 0.5 ? roof * (0.85 + 0.3 * speck) : wall * (1.0 - 0.5 * win * step(abs(N.y), 0.5));
  #endif
  // Nieve sobre la línea de nieve de la estación: se posa en lo que mira hacia arriba.
  float sn = smoothstep(uSnowLine - 40.0, uSnowLine + 220.0, wp.y) * smoothstep(-0.1, 0.65, N.y);
  col = mix(col, vec3(0.80, 0.84, 0.90), sn * 0.88);
  float ndl = clamp((dot(N, uSunDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 c = col * (uSunColor * ndl * vShade + uAmbient * (0.55 + 0.45 * N.y));
  float dist = length(vRel);
  c = applyFog(c, uCamY, vRel, dist);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------- geometrías base (y = 0 en el suelo) ----------
function blob(detail, jitter, seed, squash = 1, smooth = false) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  const h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453; return s - Math.floor(s); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (h(Math.round(x * 50), Math.round(y * 50), Math.round(z * 50)) - 0.5) * jitter;
    p.setXYZ(i, x * k, y * k * squash, z * k);
  }
  g.computeVertexNormals();
  if (smooth) { // follaje: normal de esfera, para que no se vean las caras
    const n = g.attributes.normal, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i) / squash, p.getZ(i)).normalize(); n.setXYZ(i, v.x, v.y, v.z); }
  }
  return g;
}
function merge(parts) { // [{geo, part}] → una geometría; uv.x = parte, uv.y = altura normalizada
  const pos = [], nrm = [], uv = [];
  let top = 0;
  for (const { geo } of parts) { const g = geo.index ? geo.toNonIndexed() : geo; const p = g.attributes.position; for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i)); }
  for (const { geo, part, ang } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(ang ? Math.atan2(p.getZ(i) - ang[1], p.getX(i) - ang[0]) / (Math.PI * 2) + 0.5 : part, p.getY(i) / top);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
function geometries() {
  // Champa de coirón: abanico de hojas triangulares.
  const pos = [], nrm = [], uv = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.3, lean = 0.25 + (i % 4) * 0.16, w = 0.035, hgt = 0.75 + (i % 3) * 0.2;
    const dx = Math.cos(a), dz = Math.sin(a), px = -dz * w, pz = dx * w, bx = dx * 0.05, bz = dz * 0.05;
    pos.push(bx - px, 0, bz - pz, bx + px, 0, bz + pz, bx + dx * lean, hgt, bz + dz * lean);
    for (let k = 0; k < 3; k++) nrm.push(dx * 0.5, 0.85, dz * 0.5);
    uv.push(0, 0, 0, 0, 0, 1);
  }
  const pasto = new THREE.BufferGeometry();
  pasto.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pasto.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  pasto.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));

  const rock = blob(1, 0.42, 1.7); rock.translate(0, 0.35, 0);
  const bush = blob(1, 0.5, 4.2, 0.72, true); bush.translate(0, 0.5, 0);
  const trunk = new THREE.CylinderGeometry(0.07, 0.13, 1.5, 6, 1, true); trunk.translate(0, 0.6, 0);
  const crownA = blob(1, 0.5, 9.1, 0.8, true); crownA.scale(1.05, 1.0, 1.05); crownA.translate(0, 1.85, 0);
  const crownB = blob(1, 0.4, 2.3, 0.7, true); crownB.scale(0.8, 0.8, 0.8); crownB.translate(0.75, 1.45, 0.3);
  // Casa: caja + techo a dos aguas (prisma triangular).
  const walls = new THREE.BoxGeometry(7, 3.2, 5.4); walls.translate(0, 1.1, 0);
  const rp = [-3.8, 2.7, -3.0, 3.8, 2.7, -3.0, -3.8, 2.7, 3.0, 3.8, 2.7, 3.0, -3.8, 4.1, 0, 3.8, 4.1, 0];
  const ri = [0, 4, 1, 1, 4, 5, 2, 3, 4, 3, 5, 4, 0, 2, 4, 1, 5, 3], rpos = [];
  for (const i of ri) rpos.push(rp[i * 3], rp[i * 3 + 1], rp[i * 3 + 2]);
  const roofGeo = new THREE.BufferGeometry(); roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(rpos, 3)); roofGeo.computeVertexNormals();
  const col = (r, h, x, y, z) => { const g = new THREE.CapsuleGeometry(r, h, 3, 9); g.translate(x, y + h / 2 + r * 0.3, z); return g; };
  return {
    pasto: merge([{ geo: pasto, part: 0 }]),
    roca: merge([{ geo: rock, part: 0 }]),
    arbusto: merge([{ geo: bush, part: 1 }]),
    arbol: merge([{ geo: trunk, part: 0 }, { geo: crownA, part: 1 }, { geo: crownB, part: 1 }]),
    quisco: merge([{ geo: col(0.17, 2.4, 0, -0.2, 0), ang: [0, 0] }, { geo: col(0.13, 1.3, 0.42, 0.5, 0.05), ang: [0.42, 0.05] }, { geo: col(0.12, 0.9, -0.3, 0.9, -0.22), ang: [-0.3, -0.22] }]),
    casa: merge([{ geo: walls, part: 0 }, { geo: roofGeo, part: 1 }]),
  };
}

const hash2 = (ix, iz, k) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(k + 1, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Props {
  constructor({ hf, manifest, env, coreAlb, mapPixels, amount, labels, shadowTex }) {
    this._c = [0, 0];
    this.hf = hf; this.m = manifest; this.map = mapPixels; this.amount = amount;
    this._buildUrban(labels);
    this.group = new THREE.Group();
    const geos = geometries(), nrm = new THREE.Vector3();
    this._n = nrm;
    this.types = TYPES.map((t, i) => {
      const range = t.range * (0.6 + 0.4 * amount), max = Math.ceil(t.max * amount);
      const g = new THREE.InstancedBufferGeometry();
      for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, geos[t.key].attributes[k]);
      const iPR = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), iSV = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
      iPR.setUsage(THREE.DynamicDrawUsage); iSV.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPR', iPR); g.setAttribute('iSV', iSV); g.instanceCount = 0;
      const uniforms = { ...env, uCamRel: { value: new THREE.Vector3() }, uAnchor: { value: new THREE.Vector2() }, uCoreSize: { value: new THREE.Vector2(manifest.core.sizeX, manifest.core.sizeZ) }, uRange: { value: range }, uCoreAlb: { value: coreAlb }, uShadow: { value: shadowTex }, uCamY: { value: 0 } };
      const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, defines: { TYPE: i }, side: i === 0 ? THREE.DoubleSide : THREE.FrontSide }));
      mesh.frustumCulled = false; this.group.add(mesh);
      return { ...t, range, max, mesh, uniforms, iPR, iSV, cache: new Map(), cx: NaN, cz: NaN, ax: 0, az: 0 };
    });
  }

  // Verdor (0..1) estimado desde la miniatura satelital: verde oliva oscuro = matorral/bosque; gris o blanco = ciudad, roca o nieve.
  _veg(x, z) {
    const mp = this.map, i = Math.min(mp.w - 1, Math.max(0, Math.floor((x / this.m.core.sizeX) * mp.w))), j = Math.min(mp.h - 1, Math.max(0, Math.floor((z / this.m.core.sizeZ) * mp.h))), o = (j * mp.w + i) * 4;
    const r = mp.data[o], g = mp.data[o + 1], b = mp.data[o + 2], lum = (r + g + b) / 3;
    const sat = (Math.max(r, g, b) - Math.min(r, g, b)) / (lum + 1);
    this._bare = sat < 0.13 || lum > 175 ? 1 : 0; // ciudad, nieve o roca clara
    this._grey = sat < 0.13 && lum > 80 && lum < 175; // gris medio: en el valle es mancha urbana
    return sm(-20, 8, g - r) * sm(175, 95, lum);
  }

  // Grilla de densidad urbana (100 m) a partir de las localidades OSM.
  _buildUrban(labels) {
    const G = 100, W = (this.uw = Math.ceil(this.m.core.sizeX / G)), H = Math.ceil(this.m.core.sizeZ / G);
    // Dos grillas: pueblos chicos (se confía en el nodo OSM) y ciudades/barrios (radio grande: además se exige gris urbano en la imagen,
    // o aparecerían edificios en los cerros isla y parques).
    const small = (this.urban = new Uint8Array(W * H)), big = (this.urbanBig = new Uint8Array(W * H));
    for (const [, k, x, z] of labels.items) {
      const cfg = URBAN[labels.kinds[k]]; if (!cfg) continue;
      const [R, peak] = cfg, r = Math.ceil(R / G), ci = Math.floor(x / G), cj = Math.floor(z / G), u = R > 1000 ? big : small;
      for (let j = Math.max(0, cj - r); j <= Math.min(H - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(W - 1, ci + r); i++) {
        const d = Math.hypot(i - ci, j - cj) / r; if (d >= 1) continue;
        const val = 255 * peak * (1 - d * d); if (val > u[j * W + i]) u[j * W + i] = val;
      }
    }
  }
  _urbanAt(x, z, grey) { const i = Math.floor(z / 100) * this.uw + Math.floor(x / 100); return Math.max(this.urban[i] || 0, grey ? this.urbanBig[i] || 0 : 0) / 255; }

  _cell(t, ti, ix, iz) {
    const hf = this.hf, out = [], n = this._n;
    for (let k = 0; k < t.per; k++) {
      const jit = ti === 5 ? 0.3 : 1; // las casas van una por celda, casi centradas: así no se enciman
      const x = (ix + 0.5 + (hash2(ix, iz, k * 5 + ti * 101) - 0.5) * jit) * t.cell, z = (iz + 0.5 + (hash2(ix, iz, k * 5 + 1 + ti * 101) - 0.5) * jit) * t.cell;
      if (x < 0 || z < 0 || x > this.m.core.sizeX || z > this.m.core.sizeZ) continue;
      const r = hash2(ix, iz, k * 5 + 2 + ti * 101), v = hash2(ix, iz, k * 5 + 3 + ti * 101);
      const s2 = hf.slope2(x, z);
      if (s2 < 2.5e-5) continue; // superficie perfectamente plana = lago
      const alt = hf.base(x, z), veg = this._veg(x, z), bare = this._bare, steep = sm(0.12, 0.5, s2);
      const urban = Math.max(this._urbanAt(x, z, this._grey), this._grey && alt < 1050 && s2 < 0.004 ? 0.75 : 0);
      let dens, scale, rot = v * 6.283, vary = v;
      if (ti === 0) { dens = (0.3 + 0.6 * veg) * (1 - steep) * (1 - sm(3400, 4000, alt)) * (1 - bare) * (1 - urban * 0.8); scale = 0.28 + v * 0.3; }
      else if (ti === 1) { dens = 0.1 + 0.55 * sm(0.04, 0.35, s2) + 0.25 * sm(2300, 3300, alt) - bare * 0.5 * (alt < 1200 ? 1 : 0); scale = 0.14 + v * v * v * 1.3 + (v > 0.985 ? 1.4 : 0); }
      else if (ti === 2) { dens = (0.12 + 0.75 * veg) * (1 - sm(2500, 3250, alt)) * (1 - bare) * (1 - steep * 0.6) * (1 - urban * 0.7); scale = 0.45 + v * 0.75; }
      else if (ti === 3) { dens = veg * veg * 0.95 * (1 - sm(1500, 2050, alt)) * (1 - bare) * (1 - steep * 0.8); scale = 1.5 + v * 1.7; }
      else if (ti === 4) { hf.core.slope(x, z, hf._s); dens = sm(0.12, 0.3, -hf._s[1]) * 0.75 * (1 - sm(1500, 1950, alt)) * (1 - bare) * (1 - urban); scale = 0.8 + v * 1.1; }
      else { // construcciones: solo en terreno poco inclinado; en las ciudades siguen la cuadrícula de calles
        dens = urban * 0.8 * (1 - sm(0.02, 0.07, s2)); scale = 0.8 + v * 0.35;
        rot = Math.round(hash2(ix, iz, k * 5 + 4) * 4) * 1.5708 + (urban > 0.6 ? 0.1 : v * 0.8);
        vary = v * 0.999 + (urban > 0.86 ? Math.floor(hash2(iz, ix, k + 9) ** 2 * 8) : 0);
      }
      if (r > dens * this.amount) continue;
      let y = hf.height(x, z);
      if (ti === 1) y -= scale * 0.12; else if (ti === 5) y -= 0.5; else if (ti >= 3) y -= 0.15;
      out.push(x, y, z, rot, scale, vary);
    }
    return new Float32Array(out);
  }

  // Colisiones contra lo que tiene cuerpo: casas (caja orientada), troncos, quiscos y rocas grandes.
  // Usa las mismas celdas ya generadas para dibujar; devuelve la posición corregida.
  collide(x, z) {
    let nx = x, nz = z;
    for (const ti of [1, 3, 4, 5]) {
      const t = this.types[ti], cx = Math.floor(nx / t.cell), cz = Math.floor(nz / t.cell);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = t.cache.get((cx + dx) * 65536 + (cz + dz)); if (!c) continue;
        for (let i = 0; i < c.length; i += 6) {
          const ox = nx - c[i], oz = nz - c[i + 2], sc = c[i + 4];
          if (ti === 5) {
            const k = 1 + Math.floor(c[i + 5]) * 0.05, hx = 3.5 * sc * k + 0.35, hz = 2.7 * sc * k + 0.35;
            const co = Math.cos(c[i + 3]), si = Math.sin(c[i + 3]);
            let lx = co * ox - si * oz, lz = si * ox + co * oz;
            if (Math.abs(lx) >= hx || Math.abs(lz) >= hz) continue;
            if (hx - Math.abs(lx) < hz - Math.abs(lz)) lx = Math.sign(lx || 1) * hx; else lz = Math.sign(lz || 1) * hz;
            nx = c[i] + co * lx + si * lz; nz = c[i + 2] - si * lx + co * lz;
          } else {
            const r = ti === 1 ? (sc > 0.75 ? sc * 0.8 : 0) : ti === 3 ? 0.13 * sc + 0.28 : 0.2 * sc + 0.22;
            const d = Math.hypot(ox, oz);
            if (r && d < r && d > 1e-4) { nx = c[i] + (ox / d) * r; nz = c[i + 2] + (oz / d) * r; }
          }
        }
      }
    }
    this._c[0] = nx; this._c[1] = nz; return this._c;
  }

  update(camera, speed) {
    const cam = camera.position;
    this.types.forEach((t, ti) => {
      const cx = Math.floor(cam.x / t.cell), cz = Math.floor(cam.z / t.cell);
      if (cx !== t.cx || cz !== t.cz) {
        // A velocidad Turbo/Híper el pasto y las rocas chicas no alcanzan a verse: no vale la pena regenerarlos.
        if (speed > 45 && ti < 2 && Math.abs(cx - t.cx) + Math.abs(cz - t.cz) < 6) { /* espera a frenar */ }
        else this._rebuild(t, ti, cx, cz);
      }
      t.uniforms.uCamRel.value.set(cam.x - t.ax, cam.y, cam.z - t.az);
      t.uniforms.uCamY.value = cam.y;
    });
  }
  _rebuild(t, ti, cx, cz) {
    t.cx = cx; t.cz = cz;
    const R = Math.ceil(t.range / t.cell), ax = (cx + 0.5) * t.cell, az = (cz + 0.5) * t.cell;
    const pr = t.iPR.array, sv = t.iSV.array, keep = new Map();
    let n = 0;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      const key = (cx + dx) * 65536 + (cz + dz);
      let c = t.cache.get(key);
      if (!c) c = this._cell(t, ti, cx + dx, cz + dz);
      keep.set(key, c);
      for (let i = 0; i < c.length && n < t.max; i += 6, n++) {
        pr[n * 4] = c[i] - ax; pr[n * 4 + 1] = c[i + 1]; pr[n * 4 + 2] = c[i + 2] - az; pr[n * 4 + 3] = c[i + 3];
        sv[n * 2] = c[i + 4]; sv[n * 2 + 1] = c[i + 5];
      }
    }
    t.cache = keep; t.ax = ax; t.az = az;
    t.mesh.geometry.instanceCount = n; t.mesh.visible = n > 0;
    t.iPR.clearUpdateRanges(); t.iPR.addUpdateRange(0, n * 4); t.iPR.needsUpdate = true;
    t.iSV.clearUpdateRanges(); t.iSV.addUpdateRange(0, n * 2); t.iSV.needsUpdate = true;
    t.mesh.position.set(ax, 0, az); t.mesh.updateMatrixWorld();
    t.uniforms.uAnchor.value.set(ax, az);
  }
}
