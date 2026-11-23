// Santiago visto desde los cerros: el skyline (los edificios reales de 5 pisos o más, data/skyline.json, sobre su huella
// real; ver tools/build_zones.mjs) y los hitos reconocibles, modelados a su tamaño real. Todo va en una sola malla estática
// que se dibuja a cualquier distancia: desde el cerro de Ramón, la Costanera son unos 30 píxeles de alto.
import * as THREE from 'three';
import { COMMON_VERT, ATMOS_GLSL } from './shaders.js';

export const HITOS = [
  { id: 'costanera', n: 'Gran Torre Costanera', nota: '300 m', lat: -33.4170, lon: -70.6065 },
  { id: 'titanium', n: 'Torre Titanium', nota: '194 m', lat: -33.4135, lon: -70.6040 },
  { id: 'entel', n: 'Torre Entel', nota: '127 m', lat: -33.4444, lon: -70.6551 },
  { id: 'telefonica', n: 'Torre Telefónica', nota: '143 m', lat: -33.4372, lon: -70.6347 },
  { id: 'moneda', n: 'Palacio de La Moneda', nota: '', lat: -33.4430, lon: -70.6537 },
  { id: 'estadio', n: 'Estadio Nacional', nota: '', lat: -33.4645, lon: -70.6106 },
  { id: 'bahai', n: 'Templo Bahá’í', nota: '', lat: -33.4720, lon: -70.5090 },
  { id: 'virgen', n: 'Virgen del San Cristóbal', nota: '', lat: -33.4254, lon: -70.6329 },
  { id: 'votivo', n: 'Templo Votivo de Maipú', nota: '88 m', lat: -33.5103, lon: -70.7570 },
];

const VERT = /* glsl */ `
${COMMON_VERT}
attribute vec3 color;
attribute vec3 aInfo; // u a lo largo del muro (m), altura sobre la base (m), tipo: 0 hormigón, 1 vidrio, 2 liso
uniform vec3 uAnchorRel;
varying vec3 vRel, vN, vCol, vInfo;
void main() {
  vRel = position + uAnchorRel; vN = normal; vCol = color; vInfo = aInfo;
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(position, 1.0));
}`;
const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform float uCamY, uNight;
varying vec3 vRel, vN, vCol, vInfo;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec3 N = normalize(vN);
  float dist = length(vRel);
  vec3 V = vRel / dist, col = vCol;
  float wall = step(abs(N.y), 0.5), lit = 0.0;
  if (vInfo.z < 1.5) {
    // Ventanas: franjas por piso (3,4 m) y módulos de 3 m; de lejos se promedian solas.
    vec2 cell = vec2(vInfo.x / 3.0, vInfo.y / 3.4);
    float aa = clamp(1.0 - fwidth(cell.y) * 1.5, 0.0, 1.0);
    float win = step(0.32, fract(cell.y)) * step(0.22, fract(cell.x)) * wall;
    float glass = step(0.5, vInfo.z);
    col = mix(col, mix(col * 0.42, skyColor(reflect(V, N)) * 0.55 + col * 0.25, glass), win * mix(0.55, 1.0, aa) * mix(0.75, 0.9, glass));
    lit = step(0.62, hash(floor(cell) + floor(vInfo.x * 0.01))) * win; // al caer la tarde se prenden algunas
  }
  float ndl = max(dot(N, uSunDir), 0.0);
  // Las caras sin sol directo reciben luz del cielo (azulada) más el rebote cálido del suelo iluminado.
  vec3 amb = mix(uAmbient, vec3(dot(uAmbient, vec3(0.333))), 0.45) * (0.6 + 0.4 * N.y);
  vec3 c = col * (uSunColor * ndl + amb + uSunColor * vec3(1.0, 0.92, 0.8) * 0.11 * max(uSunDir.y, 0.0) * (1.0 - 0.5 * N.y));
  c += vec3(1.0, 0.72, 0.38) * lit * uNight * 0.9;
  c = applyFog(c, uCamY, vRel, dist);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Builder {
  constructor() { this.pos = []; this.nrm = []; this.col = []; this.info = []; }
  quad(a, b, c, d, n, color, kind, u0, u1, v0, v1) { // a,b abajo; d,c arriba (sentido antihorario visto desde fuera)
    const P = [a, b, c, a, c, d], U = [u0, u1, u1, u0, u1, u0], V = [v0, v0, v1, v0, v1, v1];
    for (let i = 0; i < 6; i++) { this.pos.push(...P[i]); this.nrm.push(...n); this.col.push(...color); this.info.push(U[i], V[i], kind); }
  }
  // Prisma de base poligonal (n lados) que puede afinarse hacia arriba. rot en radianes; (sx, sz) estira la planta.
  prism(x, y, z, r0, r1, h, n, rot, color, kind, sx = 1, sz = 1, roof = color) {
    const co = Math.cos(rot), si = Math.sin(rot);
    const ring = (r, yy) => Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + Math.PI / n, lx = Math.sin(a) * r * sx, lz = Math.cos(a) * r * sz;
      return [x + lx * co + lz * si, yy, z - lx * si + lz * co];
    });
    const lo = ring(r0, y), hi = ring(r1, y + h);
    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ex = lo[j][0] - lo[i][0], ez = lo[j][2] - lo[i][2], len = Math.hypot(ex, ez);
      const nn = new THREE.Vector3(ez, (r0 - r1) / h * len, -ex).normalize();
      // la normal debe apuntar hacia afuera del eje
      if (nn.x * (lo[i][0] + lo[j][0] - 2 * x) + nn.z * (lo[i][2] + lo[j][2] - 2 * z) < 0) nn.multiplyScalar(-1);
      this.quad(lo[i], lo[j], hi[j], hi[i], [nn.x, nn.y, nn.z], color, kind, u, u + len, 0, h);
      u += len;
    }
    for (let i = 1; i < n - 1; i++) for (const p of [hi[0], hi[i], hi[i + 1]]) { this.pos.push(...p); this.nrm.push(0, 1, 0); this.col.push(...roof); this.info.push(0, 0, 2); }
  }
  box(x, y, z, w, d, h, rot, color, kind, roof) { this.prism(x, y, z, Math.SQRT1_2, Math.SQRT1_2, h, 4, rot, color, kind, w, d, roof); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3)); g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 3));
    return g;
  }
}

export class City {
  constructor({ hf, manifest, env, skyline }) {
    const m = manifest, X = (lon) => (lon - m.core.west) * m.mPerDegLon, Z = (lat) => (m.core.north - lat) * m.mPerDegLat;
    const ax = (this.ax = X(-70.63)), az = (this.az = Z(-33.45)); // ancla: los vértices van relativos al centro de Santiago
    const B = new Builder(), ground = (x, z) => hf.base(x, z) - 1.5;
    let seed = 20261120; const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const CONCRETE = [[0.36, 0.34, 0.31], [0.30, 0.29, 0.28], [0.40, 0.37, 0.32], [0.27, 0.25, 0.23]], GLASS = [[0.10, 0.15, 0.19], [0.13, 0.17, 0.18], [0.09, 0.12, 0.16]], ROOF = [0.16, 0.16, 0.17];

    // --- skyline: cada edificio alto sobre su huella real, con sus pisos (OSM) o un estimado en los barrios de torres
    this.towers = [];
    for (const [x, z, L, W, a, floors] of skyline || []) {
      if (HITOS.some((k) => Math.hypot(X(k.lon) - x, Z(k.lat) - z) < 45)) continue; // los hitos tienen su propio modelo
      const r = ((Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) >>> 0) / 4294967296, isGlass = floors > 12 && r < 0.45;
      // box() usa (w, d) como semiejes del cuadrado unitario girado: la huella va con su rumbo real.
      B.box(x - ax, ground(x, z), z - az, L, W, floors * 3.1 + 1.5, -a / 1000, (isGlass ? GLASS : CONCRETE)[Math.floor(r * 97) % (isGlass ? 3 : 4)], isGlass ? 1 : 0, ROOF);
      this.towers.push(x, z, Math.max(L, W) * 0.6);
    }

    // --- hitos, a escala real
    const at = (id) => { const h = HITOS.find((k) => k.id === id), x = X(h.lon), z = Z(h.lat); return [x - ax, ground(x, z), z - az, h, x, z]; };
    let [x, y, z, h] = at('costanera'); // torre de vidrio que se afina: 300 m, la más alta de Sudamérica
    B.prism(x, y, z, 33, 23, 262, 4, 0.5, [0.11, 0.17, 0.22], 1); B.prism(x, y + 262, z, 23, 17, 38, 4, 0.5, [0.16, 0.22, 0.27], 1); h.top = y + 300;
    [x, y, z, h] = at('titanium'); B.prism(x, y, z, 26, 26, 190, 10, 0.4, [0.09, 0.13, 0.19], 1, 1, 0.62); h.top = y + 194;
    [x, y, z, h] = at('entel'); // fuste de hormigón, plataformas de antenas y mástil
    B.prism(x, y, z, 6.5, 5.5, 88, 12, 0, [0.42, 0.41, 0.39], 2); B.prism(x, y + 88, z, 11, 11, 14, 12, 0, [0.30, 0.30, 0.31], 0); B.prism(x, y + 102, z, 4.5, 3, 14, 12, 0, [0.42, 0.41, 0.39], 2); B.prism(x, y + 116, z, 0.9, 0.5, 11, 6, 0, [0.5, 0.15, 0.12], 2); h.top = y + 127;
    [x, y, z, h] = at('telefonica'); // dos cuerpos desfasados: el "celular" de Plaza Baquedano
    B.box(x, y, z, 24, 30, 143, 0.2, [0.12, 0.16, 0.22], 1, ROOF); B.box(x + 14, y, z + 6, 12, 30, 112, 0.2, [0.33, 0.33, 0.34], 0, ROOF); h.top = y + 143;
    [x, y, z, h] = at('moneda'); B.box(x, y, z, 112, 96, 15, 0.07, [0.52, 0.50, 0.45], 0, [0.30, 0.29, 0.27]); h.top = y + 15;
    [x, y, z, h] = at('estadio'); // coliseo elíptico: graderías como anillo de prismas y la cancha al centro
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; B.box(x + Math.sin(a) * 118, y, z + Math.cos(a) * 142, 30, 26, 22, a, [0.40, 0.39, 0.37], 2, [0.30, 0.30, 0.32]); }
    B.box(x, y + 1.6, z, 70, 106, 0.4, 0, [0.07, 0.17, 0.05], 2, [0.07, 0.17, 0.05]); h.top = y + 22;
    [x, y, z, h] = at('bahai'); B.prism(x, y, z, 16, 5, 27, 9, 0, [0.62, 0.62, 0.60], 2); B.prism(x, y + 27, z, 5, 0.5, 4, 9, 0, [0.62, 0.62, 0.60], 2); h.top = y + 31;
    { // la Virgen va en la cumbre real: se busca el punto más alto del cerro alrededor de la coordenada
      const hh = HITOS.find((k) => k.id === 'virgen'); let bx = X(hh.lon), bz = Z(hh.lat), best = -1;
      for (let dz = -350; dz <= 350; dz += 35) for (let dx = -350; dx <= 350; dx += 35) { const e = hf.base(X(hh.lon) + dx, Z(hh.lat) + dz); if (e > best) { best = e; bx = X(hh.lon) + dx; bz = Z(hh.lat) + dz; } }
      hh.wx = bx; hh.wz = bz;
      B.prism(bx - ax, best - 1, bz - az, 4.5, 3.6, 8.5, 8, 0, [0.5, 0.48, 0.44], 2); B.prism(bx - ax, best + 7.5, bz - az, 1.9, 1.0, 12, 8, 0, [0.72, 0.72, 0.70], 2); B.prism(bx - ax, best + 19.5, bz - az, 1.1, 0.3, 2.5, 8, 0, [0.72, 0.72, 0.70], 2); hh.top = best + 22;
    }
    [x, y, z, h] = at('votivo'); B.box(x, y, z, 34, 70, 24, 0, [0.55, 0.54, 0.50], 2, [0.36, 0.35, 0.33]); B.prism(x, y, z - 30, 11, 6, 88, 4, Math.PI / 4, [0.58, 0.57, 0.53], 2); h.top = y + 88;
    for (const k of HITOS) { k.x = k.wx ?? X(k.lon); k.z = k.wz ?? Z(k.lat); }

    this.uniforms = { ...env, uAnchorRel: { value: new THREE.Vector3() }, uCamY: { value: 0 }, uNight: { value: 0 } };
    this.mesh = new THREE.Mesh(B.geometry(), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide }));
    this.mesh.position.set(ax, 0, az); this.mesh.updateMatrixWorld(); this.mesh.frustumCulled = false;
    this.tris = B.pos.length / 9;
  }
  update(camera, sunElevation) {
    this.uniforms.uAnchorRel.value.set(this.ax - camera.position.x, -camera.position.y, this.az - camera.position.z);
    this.uniforms.uCamY.value = camera.position.y;
    this.uniforms.uNight.value = Math.min(1, Math.max(0, (9 - sunElevation) / 11));
    // A más de 60 km las torres son subpíxel: no vale la pena mandarlas a la GPU.
    this.mesh.visible = Math.hypot(camera.position.x - this.ax, camera.position.z - this.az) < 60000;
  }
}
