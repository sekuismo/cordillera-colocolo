// Vegetación, rocas y construcciones instanciadas alrededor de la cámara: es lo que da la escala humana al paisaje.
// La distribución es determinista (hash por celda). Qué crece en cada punto lo decide la cobertura de suelo real
// (ESA WorldCover + polígonos OSM) cruzada con altitud, pendiente y exposición, siguiendo la vegetación de la zona central:
//   nativa   → espinal en el valle; bosque esclerófilo (quillay, litre, peumo) en laderas y quebradas; quiscos en las
//              laderas que miran al norte; ciprés de la cordillera en umbrías altas; neneo y coirón en el piso andino;
//              llareta sobre los 3.000 m; vegas verdes en los humedales de altura.
//   plantada → álamos en hilera en los campos, eucaliptos y pinos en plantaciones, frutales y viñas en cuadrícula,
//              árboles de calle y parque en la ciudad. Lo caduco amarillea en otoño y queda pelado en invierno;
//              lo nativo es siempre verde: esa es la gracia del bosque esclerófilo.
import * as THREE from 'three';
import { COMMON_VERT, ATMOS_GLSL } from './shaders.js';

const TYPES = [
  { key: 'pasto', cell: 6, range: 60, per: 14, max: 9000 },
  { key: 'roca', cell: 12, range: 170, per: 3, max: 1500, lod: 55 },
  { key: 'arbusto', cell: 14, range: 300, per: 4, max: 5000, lod: 70 },   // lod: distancia (m) desde la que se usa la malla liviana
  { key: 'arbol', cell: 26, range: 560, per: 4, max: 5000, lod: 120 },
  { key: 'quisco', cell: 26, range: 420, per: 2, max: 1500 },
  { key: 'casa', cell: 15, range: 560, per: 1, max: 6000 },
  { key: 'alto', cell: 6, range: 520, per: 1, max: 5000, lod: 120 },  // árboles columnares o cónicos
  { key: 'vid', cell: 9, range: 190, per: 3, max: 6000 },    // hileras de parra
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
uniform vec3 uLeaf; // x: hoja en los caducos (0 = invierno), y: color de otoño, z: floración
uniform sampler2D uCoreAlb, uShadow;
varying vec3 vRel, vN, vGround;
varying vec2 vUv;
varying float vVar, vShade;
void main() {
  vec3 p = position;
  float fade = 1.0 - smoothstep(uRange * 0.72, uRange, length(iPR.xyz - uCamRel)); // se encoge al borde del alcance: sin "pop"
  float kind = floor(iSV.y), crown = step(0.5, uv.x);
  vec2 sway = vec2(sin(uTime * 0.9 + iPR.x * 0.2), cos(uTime * 0.7 + iPR.z * 0.2)) * 0.03 * crown;
  #if TYPE == 0
    p.xz += uv.y * uv.y * vec2(sin(uTime * 1.7 + iPR.x * 0.6), cos(uTime * 1.3 + iPR.z * 0.6)) * 0.07;
    p *= iSV.x * fade * vec3(1.0, 0.7 + fract(iSV.y) * 0.6, 1.0);
  #elif TYPE == 1
    p *= iSV.x * fade * vec3(1.0, 0.55 + fract(iSV.y * 7.3) * 0.45, 0.7 + fract(iSV.y * 3.1) * 0.5);
  #elif TYPE == 2
    // 0 matorral esclerófilo · 1 neneo (cojín bajo) · 2 llareta (cojín plano) · 3 frutal
    float sy = kind < 0.5 ? 0.85 + fract(iSV.y * 5.7) * 0.4 : kind < 1.5 ? 0.6 : kind < 2.5 ? 0.3 : 1.3;
    p.xz += uv.y * sway * step(2.5, kind);
    p *= iSV.x * fade * vec3(1.0, sy, 1.0);
  #elif TYPE == 3
    // 0 espino (copa ancha y aplanada) · 1 quillay/litre · 2 peumo · 4 árbol urbano caduco
    vec3 shape = kind < 0.5 ? vec3(1.35, 0.76, 1.35) : vec3(1.0, 0.9 + fract(iSV.y * 5.7) * 0.35, 1.0);
    p.xz += uv.y * sway;
    p.xz *= mix(1.0, 0.6, crown * step(3.5, kind) * (1.0 - uLeaf.x)); // sin hojas queda solo el ramaje
    p *= iSV.x * fade * shape;
  #elif TYPE == 5
    float tall = floor(iSV.y); // pisos extra: edificios en el centro de las ciudades
    p *= iSV.x * fade * vec3(1.0 + tall * 0.05, 1.0 + tall * 0.9, 1.0 + tall * 0.05);
  #elif TYPE == 6
    // 0 álamo (columna) · 1 ciprés de la cordillera (cono) · 2 eucalipto · 3 pino (cono ancho)
    float cone = step(0.5, kind) * step(kind, 1.5) + step(2.5, kind);
    float width = kind < 0.5 ? 0.42 * mix(0.7, 1.0, uLeaf.x) : kind < 1.5 ? 0.7 : kind < 2.5 ? 0.85 : 1.0;
    p.xz *= mix(1.0, width * mix(1.0, mix(1.5, 0.12, smoothstep(0.25, 1.0, uv.y)), cone), crown);
    p.xz += uv.y * sway * 2.0;
    p *= iSV.x * fade * vec3(1.0, 0.9 + fract(iSV.y * 5.7) * 0.25, 1.0);
  #elif TYPE == 7
    p *= fade * vec3(1.0, mix(0.62, 1.0, uLeaf.x), 1.0); // podada en invierno
  #else
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
// Hash sin seno: el moteado del follaje llama a esto 16 veces por píxel.
float hash(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
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
  float kind = floor(vVar), v = fract(vVar);
  // Follaje caduco: verde → amarillo de otoño → ramaje gris en invierno → brote verde claro en primavera.
  vec3 decid = mix(mix(vec3(0.075, 0.062, 0.05), mix(vec3(0.04, 0.095, 0.022), vec3(0.075, 0.14, 0.035), v), uLeaf.x), vec3(0.36, 0.25, 0.035), uLeaf.y * 0.85);
  #if TYPE == 0      // coirón en champas (paja) y pasto verde en vegas, parques y campos regados
    vec3 straw = mix(vec3(0.15, 0.13, 0.055), vec3(0.30, 0.25, 0.10), vUv.y);
    vec3 green = mix(vec3(0.045, 0.09, 0.025), vec3(0.13, 0.22, 0.06), vUv.y);
    col = mix(straw, green, max(step(0.5, kind), uGreen * 0.65 * (1.0 - smoothstep(1500.0, 2700.0, wp.y)))) * (0.75 + v * 0.5);
    col = mix(col, vGround * 1.25, 0.25); wrap = 0.6; N = normalize(N + vec3(0.0, 1.4, 0.0));
  #elif TYPE == 1    // roca: toma el color del suelo, más gris
    float g = dot(vGround, vec3(0.33));
    col = mix(vGround, vec3(g), 0.45) * (0.8 + v * 0.55) * (0.85 + 0.3 * speck);
  #elif TYPE == 2
    vec3 base = kind < 0.5 ? mix(vec3(0.03, 0.042, 0.016), vec3(0.075, 0.08, 0.032), v)   // matorral esclerófilo: oliva oscuro
      : kind < 1.5 ? mix(vec3(0.10, 0.105, 0.035), vec3(0.17, 0.155, 0.05), v)             // neneo: cojín amarillento del piso andino
      : kind < 2.5 ? mix(vec3(0.06, 0.14, 0.025), vec3(0.10, 0.19, 0.035), v)              // llareta: verde intenso, casi una roca viva
      : decid;                                                                              // frutal
    col = base * (0.55 + 0.9 * speck) * (0.6 + 0.5 * vUv.y); wrap = 0.5;
    col = mix(col, vec3(0.62, 0.50, 0.52), uLeaf.z * step(2.5, kind) * smoothstep(0.45, 0.7, speck)); // frutales en flor
  #elif TYPE == 3
    vec3 leaf = kind < 0.5 ? mix(vec3(0.05, 0.062, 0.03), vec3(0.085, 0.095, 0.045), v)   // espino: verde grisáceo, copa rala
      : kind < 1.5 ? mix(vec3(0.022, 0.04, 0.015), vec3(0.055, 0.072, 0.028), v)           // quillay y litre
      : kind < 2.5 ? mix(vec3(0.014, 0.03, 0.012), vec3(0.03, 0.05, 0.02), v)              // peumo: el más oscuro, en quebradas
      : decid;                                                                              // árbol urbano
    col = vUv.x < 0.5 ? vec3(0.055, 0.04, 0.028) * (0.7 + 0.6 * speck) : leaf * (0.5 + 1.0 * speck) * (0.55 + 0.55 * vUv.y);
    wrap = vUv.x < 0.5 ? 0.0 : 0.5;
  #elif TYPE == 4    // quisco: cactus columnar con costillas
    float rib = 0.72 + 0.28 * abs(sin(vUv.x * 37.7));
    col = vec3(0.075, 0.12, 0.06) * rib * (0.8 + 0.4 * v); wrap = 0.25;
  #elif TYPE == 5    // casas y edificios: muros claros, techos de zinc o teja
    vec3 wall = v < 0.3 ? vec3(0.40, 0.38, 0.33) : v < 0.55 ? vec3(0.33, 0.26, 0.18) : v < 0.8 ? vec3(0.35, 0.35, 0.34) : vec3(0.27, 0.32, 0.34);
    vec3 roof = v < 0.4 ? vec3(0.20, 0.21, 0.23) : v < 0.75 ? vec3(0.24, 0.085, 0.055) : vec3(0.11, 0.11, 0.12);
    float win = step(0.45, fract(vUv.y * (1.6 + kind * 1.6) * 1.57)) * step(0.4, fract((wp.x + wp.z) * 0.42 + wp.y * 0.01));
    col = vUv.x > 0.5 ? roof * (0.85 + 0.3 * speck) : wall * (1.0 - 0.5 * win * step(abs(N.y), 0.5));
  #elif TYPE == 6
    vec3 leaf = kind < 0.5 ? decid * 1.15                                                  // álamo: el amarillo del otoño en el Cajón
      : kind < 1.5 ? mix(vec3(0.014, 0.032, 0.016), vec3(0.03, 0.055, 0.026), v)           // ciprés de la cordillera
      : kind < 2.5 ? mix(vec3(0.04, 0.062, 0.05), vec3(0.075, 0.10, 0.08), v)              // eucalipto: verde azulado
      : mix(vec3(0.016, 0.035, 0.016), vec3(0.035, 0.06, 0.026), v);                       // pino
    vec3 bark = kind > 1.5 && kind < 2.5 ? vec3(0.22, 0.20, 0.17) : vec3(0.06, 0.045, 0.032);
    col = vUv.x < 0.5 ? bark * (0.7 + 0.6 * speck) : leaf * (0.5 + 1.0 * speck) * (0.5 + 0.6 * vUv.y);
    wrap = vUv.x < 0.5 ? 0.0 : 0.5;
  #else              // parra en espaldera
    vec3 vine = mix(mix(vec3(0.09, 0.07, 0.05), mix(vec3(0.04, 0.10, 0.02), vec3(0.08, 0.15, 0.035), v), uLeaf.x), vec3(0.33, 0.14, 0.03), uLeaf.y * 0.9);
    col = mix(vec3(0.07, 0.055, 0.04), vine, smoothstep(0.25, 0.5, vUv.y)) * (0.55 + 0.9 * speck); wrap = 0.5;
  #endif
  // Nieve sobre la línea de nieve de la estación: se posa en lo que mira hacia arriba.
  float sn = smoothstep(uSnowLine - 40.0, uSnowLine + 220.0, wp.y) * smoothstep(-0.1, 0.65, N.y);
  col = mix(col, vec3(0.64, 0.68, 0.74), sn * 0.88);
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
function merge(parts) { // [{geo, part}] → una geometría indexada; uv.x = parte, uv.y = altura normalizada
  const pos = [], nrm = [], uv = [], index = [], seen = new Map();
  let top = 0;
  for (const { geo } of parts) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i)); }
  for (const { geo, part, ang } of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const v = [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i), ang ? Math.atan2(p.getZ(i) - ang[1], p.getX(i) - ang[0]) / (Math.PI * 2) + 0.5 : part, p.getY(i) / top];
      // Vértices idénticos (posición, normal y uv) se comparten: una copa de normales suaves baja de 240 a 42 vértices,
      // y el vertex shader, que es donde se va el tiempo de la vegetación, corre casi 6 veces menos.
      const key = v.map((x) => Math.round(x * 2000)).join(',');
      let k = seen.get(key);
      if (k === undefined) { k = pos.length / 3; seen.set(key, k); pos.push(v[0], v[1], v[2]); nrm.push(v[3], v[4], v[5]); uv.push(v[6], v[7]); }
      index.push(k);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(index);
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
  // Árbol alto: tronco + copa alargada. En el vertex shader se vuelve columna (álamo) o cono (ciprés, pino).
  const tallTrunk = new THREE.CylinderGeometry(0.06, 0.11, 1.4, 6, 1, true); tallTrunk.translate(0, 0.6, 0);
  const tallCrown = blob(1, 0.28, 5.5, 1, true); tallCrown.scale(0.62, 2.0, 0.62); tallCrown.translate(0, 2.9, 0);
  const vineRow = new THREE.BoxGeometry(0.6, 1.5, 9); vineRow.translate(0, 0.75, 0);
  const far = (g, x, y, z, sx = 1, sy = 1, sz = 1) => { g.scale(sx, sy, sz); g.translate(x, y, z); return g; };
  const col = (r, h, x, y, z) => { const g = new THREE.CapsuleGeometry(r, h, 3, 9); g.translate(x, y + h / 2 + r * 0.3, z); return g; };
  return {
    pasto: merge([{ geo: pasto, part: 0 }]),
    roca: merge([{ geo: rock, part: 0 }]),
    arbusto: merge([{ geo: bush, part: 1 }]),
    arbol: merge([{ geo: trunk, part: 0 }, { geo: crownA, part: 1 }, { geo: crownB, part: 1 }]),
    quisco: merge([{ geo: col(0.17, 2.4, 0, -0.2, 0), ang: [0, 0] }, { geo: col(0.13, 1.3, 0.42, 0.5, 0.05), ang: [0.42, 0.05] }, { geo: col(0.12, 0.9, -0.3, 0.9, -0.22), ang: [-0.3, -0.22] }]),
    casa: merge([{ geo: walls, part: 0 }, { geo: roofGeo, part: 1 }]),
    alto: merge([{ geo: tallTrunk, part: 0 }, { geo: tallCrown, part: 1 }]),
    // Versiones livianas para lejos: icosaedro sin subdividir (20 caras) y tronco de 4 lados. A más de 100 m no se nota.
    rocaFar: merge([{ geo: far(blob(0, 0.42, 1.7), 0, 0.35, 0), part: 0 }]),
    arbustoFar: merge([{ geo: far(blob(0, 0.5, 4.2, 0.72, true), 0, 0.5, 0), part: 1 }]),
    arbolFar: merge([{ geo: far(new THREE.CylinderGeometry(0.07, 0.13, 1.5, 4, 1, true), 0, 0.6, 0), part: 0 }, { geo: far(blob(0, 0.45, 9.1, 0.8, true), 0.2, 1.75, 0.1, 1.3, 1.1, 1.3), part: 1 }]),
    altoFar: merge([{ geo: far(new THREE.CylinderGeometry(0.06, 0.11, 1.4, 4, 1, true), 0, 0.6, 0), part: 0 }, { geo: far(blob(0, 0.28, 5.5, 1, true), 0, 2.9, 0, 0.62, 2.0, 0.62), part: 1 }]),
    vid: merge([{ geo: vineRow, part: 1 }]),
  };
}

const hash2 = (ix, iz, k) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(k + 1, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Props {
  constructor({ hf, manifest, env, coreAlb, land, amount, labels, shadowTex, streets }) {
    this._c = [0, 0]; this.streets = streets;
    this.hf = hf; this.m = manifest; this.land = land; this.amount = amount;
    this._buildUrban(labels);
    this.group = new THREE.Group();
    const geos = geometries(), nrm = new THREE.Vector3();
    this._n = nrm;
    this.types = TYPES.map((t, i) => {
      const range = t.range * (0.6 + 0.4 * amount), max = Math.ceil(t.max * amount);
      const uniforms = { ...env, uCamRel: { value: new THREE.Vector3() }, uAnchor: { value: new THREE.Vector2() }, uCoreSize: { value: new THREE.Vector2(manifest.core.sizeX, manifest.core.sizeZ) }, uRange: { value: range }, uCoreAlb: { value: coreAlb }, uShadow: { value: shadowTex }, uCamY: { value: 0 } };
      const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, defines: { TYPE: i }, side: i === 0 ? THREE.DoubleSide : THREE.FrontSide });
      const level = (geo) => { // un nivel de detalle = una malla instanciada con sus propios búferes
        const g = new THREE.InstancedBufferGeometry();
        for (const k of ['position', 'normal', 'uv']) g.setAttribute(k, geo.attributes[k]);
        g.setIndex(geo.index);
        const iPR = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4), iSV = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2);
        iPR.setUsage(THREE.DynamicDrawUsage); iSV.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('iPR', iPR); g.setAttribute('iSV', iSV); g.instanceCount = 0;
        const mesh = new THREE.Mesh(g, material); mesh.frustumCulled = false; this.group.add(mesh);
        return { mesh, iPR, iSV, n: 0 };
      };
      const lods = [level(geos[t.key])];
      if (t.lod && geos[t.key + 'Far']) lods.push(level(geos[t.key + 'Far']));
      return { ...t, range, max, mesh: lods[0].mesh, lods, uniforms, cache: new Map(), cx: NaN, cz: NaN, ax: 0, az: 0 };
    });
  }

  // Clase de cobertura de suelo en un punto (ver CLASES en tools/build_landcover.mjs).
  _cls(x, z) {
    const l = this.land, i = Math.floor((x / this.m.core.sizeX) * l.w), j = Math.floor((z / this.m.core.sizeZ) * l.h);
    return i < 0 || j < 0 || i >= l.w || j >= l.h ? 0 : l.data[j * l.w + i];
  }

  // Grilla de densidad urbana (100 m) a partir de las localidades OSM.
  _buildUrban(labels) {
    const G = 100, W = (this.uw = Math.ceil(this.m.core.sizeX / G)), H = Math.ceil(this.m.core.sizeZ / G);
    // Dos grillas: pueblos chicos (se confía en el nodo OSM, porque WorldCover no siempre los marca como urbanos) y
    // ciudades/barrios (solo deciden dónde van los edificios altos; la mancha urbana misma viene de la cobertura).
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
  _urbanAt(x, z, big) { return ((big ? this.urbanBig : this.urban)[Math.floor(z / 100) * this.uw + Math.floor(x / 100)] || 0) / 255; }

  _cell(t, ti, ix, iz) {
    const hf = this.hf, out = [], C = t.cell;
    for (let k = 0; k < t.per; k++) {
      const h0 = hash2(ix, iz, k * 5 + ti * 101), h1 = hash2(ix, iz, k * 5 + 1 + ti * 101);
      const jit = ti === 5 ? 0.3 : 1; // las casas van una por celda, casi centradas: así no se enciman
      let x = (ix + 0.5 + (h0 - 0.5) * jit) * C, z = (iz + 0.5 + (h1 - 0.5) * jit) * C;
      if (x < 0 || z < 0 || x > this.m.core.sizeX || z > this.m.core.sizeZ) continue;
      const c = this._cls(x, z);
      if (c === 8 || c === 14) continue;                        // agua y glaciar: nada
      const r = hash2(ix, iz, k * 5 + 2 + ti * 101), v = hash2(ix, iz, k * 5 + 3 + ti * 101);
      const s2 = hf.slope2(x, z);
      if (s2 < 2.5e-5) continue;                                // superficie perfectamente plana = lago
      const south = hf._s[1];                                   // > 0: ladera que mira al sur (umbría); < 0: al norte (solana)
      const alt = hf.base(x, z), steep = sm(0.12, 0.5, s2);
      let dens = 0, scale = 1, rot = v * 6.283, kind = 0;
      if (ti === 0) {         // pastos
        dens = [0.25, 0.3, 0.6, 0.9, 0, 0.04, 0.12, 0, 0, 1, 0.12, 0.2, 0.55, 0.15][c] * (1 - steep) * (1 - sm(3500, 4100, alt));
        kind = c >= 9 && c <= 12 ? 1 : 0; scale = 0.28 + v * 0.3;
      } else if (ti === 1) {  // rocas
        dens = (0.1 + 0.55 * sm(0.04, 0.35, s2) + 0.25 * sm(2300, 3300, alt)) * [1, 0.5, 0.8, 0.7, 0.05, 0.03, 1.2, 1, 0, 0.2, 0.03, 0.03, 0.1, 0.4][c];
        scale = 0.14 + v * v * v * 1.3 + (v > 0.985 ? 1.4 : 0);
      } else if (ti === 2) {  // arbustos, cojines andinos y frutales
        if (c === 11) { // frutales: marco de plantación de 7 m
          x = (ix + ((k % 2) + 0.5) / 2) * C; z = (iz + (Math.floor(k / 2) + 0.5) / 2) * C;
          if (this._cls(x, z) !== 11) continue;
          kind = 3; dens = 0.96; scale = 1.45 + v * 0.35;
        } else {
          const cover = [0.25, 0.5, 0.85, 0.3, 0, 0.05, 0.12, 0, 0, 0.3, 0, 0, 0.25, 0.3][c];
          if (alt > 2950 + h0 * 400) { kind = 2; dens = (c === 6 ? 0.22 : cover * 0.4) * (1 - sm(3900, 4350, alt)); scale = 0.5 + v * 0.9; }
          else if (alt > 1900 + h1 * 350) { kind = 1; dens = Math.max(cover, c === 6 ? 0.3 : 0) * 0.8; scale = 0.35 + v * 0.5; }
          else { dens = cover * (1 - steep * 0.6); scale = 0.45 + v * 0.75; }
        }
      } else if (ti === 3) {  // árboles de copa redonda
        const low = 1 - sm(1600, 2050, alt);
        if (c === 5 || c === 12) { // en la ciudad los árboles van en la vereda, no en la calzada
          const st = this.streets && this.streets.nearest(x, z, 20);
          if (st && st.d < st.hw + 1.6) { x += st.nx * (st.hw + 1.6 - st.d); z += st.nz * (st.hw + 1.6 - st.d); }
        }
        if (c === 1 && s2 < 0.004 && alt < 1000) { kind = 4; dens = 0.5; scale = 1.6 + v * 1.5; }                              // arboleda en el plano del valle: plantada
        else if (c === 1) { kind = south > 0.1 ? 2 : 1; dens = 0.9 * low; scale = 1.6 + v * 1.9; }                             // bosque esclerófilo
        else if (c === 2) { if (alt < 1150) { dens = 0.2; scale = 1.3 + v * 1.0; } else { kind = 1; dens = (0.1 + (south > 0.12 ? 0.22 : 0)) * low; scale = 1.4 + v * 1.4; } } // espinal abajo; esclerófilo en umbrías
        else if (c === 3 && alt < 1100) { dens = 0.06; scale = 1.3 + v * 0.9; }                                                // espinos sueltos en la pradera
        else if (c === 5) { kind = 4; dens = 0.3; scale = 1.5 + v * 1.4; }                                                     // árboles de calle
        else if (c === 12) { kind = v > 0.4 ? 4 : 1; dens = 0.55; scale = 1.7 + v * 1.6; }                                     // parques
        else if (c === 4) { kind = 4; dens = 0.015; scale = 1.8 + v; }
        dens *= (1 - steep * 0.8) * (1 - sm(2000, 2300, alt)); // sobre los 2.200 m ya no crecen árboles, ni plantados
      } else if (ti === 4) {  // quiscos: laderas de solana, bajo los 1.900 m
        dens = c === 2 || c === 3 || c === 6 || c === 1 ? sm(0.12, 0.3, -south) * 0.75 * (1 - sm(1500, 1950, alt)) : 0; scale = 0.8 + v * 1.1;
      } else if (ti === 5) {  // construcciones: solo en terreno poco inclinado; en las ciudades siguen la cuadrícula de calles
        const urban = Math.max(this._urbanAt(x, z, false), c === 5 ? 0.8 : 0), center = c === 5 ? this._urbanAt(x, z, true) : 0;
        dens = urban * 0.8 * (1 - sm(0.02, 0.07, s2)); scale = 0.8 + v * 0.35;
        rot = Math.round(hash2(ix, iz, k * 5 + 4) * 4) * 1.5708 + (urban > 0.6 ? 0.1 : v * 0.8);
        kind = center > 0.86 ? Math.floor(hash2(iz, ix, k + 9) ** 2 * 8) : 0;
        // Con calles reales cerca, la casa se pone paralela a su calle y retirada de la calzada (antejardín incluido).
        const st = this.streets && this.streets.nearest(x, z, 45);
        if (st) {
          rot = Math.atan2(-st.tz, st.tx);
          const back = st.hw + 2.7 * scale * (1 + kind * 0.05) + 2.2;
          if (st.d < back) { x += st.nx * (back - st.d); z += st.nz * (back - st.d); }
          dens *= 1.15;
        }
      } else if (ti === 6) {  // árboles altos
        if (c === 13) { kind = alt > 1400 ? 3 : 2; dens = 0.5; scale = 2.6 + v * 1.7; }                                       // plantaciones: eucalipto abajo, pino arriba
        else if (c === 4 || c === 10 || c === 11) { // álamos en hilera (cortavientos) cada ~220 m, con tramos que existen y tramos que no
          const lx = Math.round(x / 220) * 220, lz = Math.round(z / 260) * 260;
          if (Math.abs(x - lx) < C / 2 && hash2(Math.round(x / 220), Math.floor(z / 450), 77) > 0.45) { x = lx; dens = 0.95; }
          else if (Math.abs(z - lz) < C / 2 && hash2(Math.floor(x / 450), Math.round(z / 260), 78) > 0.6) { z = lz; dens = 0.95; }
          scale = 3.4 + v * 1.0;
        } else if (c === 1 && s2 < 0.004 && alt < 1000) { kind = v > 0.55 ? 2 : 0; dens = 0.07; scale = 3 + v * 1.4; }         // eucaliptos y álamos entre las arboledas del valle
        else if (c === 1 && alt > 1050 && alt < 2250 && south > 0.12) { kind = 1; dens = 0.05; scale = 1.7 + v * 1.5; }        // ciprés de la cordillera
        else if (c === 9 && alt < 2000) { dens = 0.06; scale = 2.8 + v; }                                                      // álamos y sauces junto al agua
        else if (c === 5) { kind = 2; dens = 0.004; scale = 3 + v * 1.5; }
        else if (c === 12) { kind = v > 0.5 ? 2 : 3; dens = 0.03; scale = 2.6 + v * 1.4; }
        dens *= (1 - steep * 0.7) * (1 - sm(2000, 2300, alt));
      } else {                // viñas: hileras cada 3 m
        if (c !== 10) continue;
        x = (ix + (k + 0.5) / 3) * C; z = (iz + 0.5) * C; rot = 0; dens = 1.1 / Math.max(this.amount, 0.5);
      }
      if (r > dens * this.amount) continue;
      // Nada crece en la calzada ni en las huellas de vehículos (las casas ya se retiran solas de su calle).
      if (ti !== 5 && this.streets) { const st = this.streets.nearest(x, z, 12); if (st && st.d < st.hw + (ti === 0 ? 0.4 : ti >= 3 ? 1.6 : 0.9)) continue; }
      let y = hf.height(x, z);
      if (ti === 1) y -= scale * 0.12; else if (ti === 5) y -= 0.5; else if (ti === 7) y -= 0.1; else if (ti >= 3) y -= 0.15;
      out.push(x, y, z, rot, scale, v * 0.999 + kind);
    }
    return new Float32Array(out);
  }

  // Colisiones contra lo que tiene cuerpo: casas (caja orientada), troncos, quiscos y rocas grandes.
  // Usa las mismas celdas ya generadas para dibujar; devuelve la posición corregida.
  collide(x, z) {
    let nx = x, nz = z;
    for (const ti of [1, 3, 4, 5, 6]) {
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
            const r = ti === 1 ? (sc > 0.75 ? sc * 0.8 : 0) : ti === 4 ? 0.2 * sc + 0.22 : 0.12 * sc + 0.28;
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
    const keep = new Map(), lods = t.lods, far2 = lods.length > 1 ? t.lod * t.lod : Infinity;
    for (const l of lods) l.n = 0;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
      const key = (cx + dx) * 65536 + (cz + dz);
      let c = t.cache.get(key);
      if (!c) c = this._cell(t, ti, cx + dx, cz + dz);
      keep.set(key, c);
      for (let i = 0; i < c.length; i += 6) {
        const rx = c[i] - ax, rz = c[i + 2] - az, l = rx * rx + rz * rz > far2 ? lods[1] : lods[0], n = l.n;
        if (n >= t.max) continue;
        const pr = l.iPR.array, sv = l.iSV.array;
        pr[n * 4] = rx; pr[n * 4 + 1] = c[i + 1]; pr[n * 4 + 2] = rz; pr[n * 4 + 3] = c[i + 3];
        sv[n * 2] = c[i + 4]; sv[n * 2 + 1] = c[i + 5]; l.n++;
      }
    }
    t.cache = keep; t.ax = ax; t.az = az;
    for (const l of lods) {
      l.mesh.geometry.instanceCount = l.n; l.mesh.visible = l.n > 0;
      l.iPR.clearUpdateRanges(); l.iPR.addUpdateRange(0, l.n * 4); l.iPR.needsUpdate = true;
      l.iSV.clearUpdateRanges(); l.iSV.addUpdateRange(0, l.n * 2); l.iSV.needsUpdate = true;
      l.mesh.position.set(ax, 0, az); l.mesh.updateMatrixWorld();
    }
    t.uniforms.uAnchor.value.set(ax, az);
  }
}
