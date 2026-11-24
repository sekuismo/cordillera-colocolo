// Obras humanas a escala real, tal como están mapeadas en OSM: puentes (con tablero transitable), torres y cables de
// alta tensión, tuberías a la vista de las centrales y andariveles. El pipeline solo entrega los trazados
// (data/infra.json); la geometría se arma aquí, por celdas de 4 km y solo cerca de la cámara, porque depende de la
// altura exacta del terreno. Lo fino y lejano (cables, celosías) va además como líneas de 1 px que no parpadean.
import * as THREE from 'three';
import { COMMON_VERT, ATMOS_GLSL } from './shaders.js';

const CHUNK = 4096, BUILD = 5500, DROP = 8000, HASH = 128;
// Colores en espacio lineal (0–255): el asfalto es el mismo de los caminos pintados sobre el terreno.
const CONCRETE = [74, 72, 67], ASPHALT = [17, 17, 19], STEEL = [52, 54, 56], WOOD = [46, 31, 18], RAIL = [26, 28, 29], PIPE = [40, 50, 43], MAST = [20, 28, 25];

const VERT = /* glsl */ `
${COMMON_VERT}
attribute vec3 color;
attribute vec4 aInfo; // dos coordenadas en metros (según el tipo), tipo de superficie, semiancho de la calzada
varying vec3 vRel, vN, vCol;
varying vec4 vInfo;
varying vec2 vXZ;
void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vRel = wp - cameraPosition; vN = normal; vCol = color; vInfo = aInfo; vXZ = wp.xz;
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(position, 1.0));
}`;
const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec2 uCoreSize;
uniform sampler2D uShadow;
varying vec3 vRel, vN, vCol;
varying vec4 vInfo;
varying vec2 vXZ;
void main() {
  // La sombra del relieve se lee por píxel: estas mallas tienen muchos vértices y casi ningún píxel.
  float vShade = textureLod(uShadow, vXZ / uCoreSize, 0.0).r;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  float dist = length(vRel), kind = vInfo.z;
  vec3 col = vCol;
  if (kind > 0.5 && kind < 1.5) {
    // Calzada: líneas de borde blancas y eje amarillo continuo (en la cordillera casi no hay dónde adelantar).
    float fw = fwidth(vInfo.x), fade = 1.0 - smoothstep(0.2, 0.55, fw);
    float edge = 1.0 - smoothstep(0.07, 0.07 + fw, abs(abs(vInfo.x) - (vInfo.w - 0.45)));
    float axis = (1.0 - smoothstep(0.1, 0.1 + fw, abs(vInfo.x))) * step(3.4, vInfo.w) * step(vInfo.w, 5.0);
    col = mix(col, vec3(0.50, 0.50, 0.47), edge * fade * 0.8);
    col = mix(col, vec3(0.62, 0.44, 0.05), axis * fade * 0.9);
  } else if (kind > 1.5 && kind < 2.5) {
    // Baranda: pasamanos, zócalo, larguero y parantes; el resto es aire. De lejos se deja opaca para que no centellee.
    float bars = step(fract(vInfo.x / 1.6), 0.07) + step(0.9, vInfo.y) + step(vInfo.y, 0.1) + step(abs(vInfo.y - 0.5), 0.05);
    if (bars < 0.5 && fwidth(vInfo.y) < 0.35) discard;
  } else if (kind > 3.5 && kind < 4.5) {
    // Baranda vial del Cajón del Maipo: tres barras blancas sobre postes rojo-anaranjado, cada 2 m.
    float post = step(fract(vInfo.x / 2.0), 0.06), bar = step(abs(vInfo.y - 0.94), 0.05) + step(abs(vInfo.y - 0.62), 0.045) + step(abs(vInfo.y - 0.3), 0.045);
    if (post + bar < 0.5 && fwidth(vInfo.y) < 0.35) discard;
    col = post > 0.5 ? vec3(0.42, 0.10, 0.045) : vec3(0.60, 0.60, 0.58);
  } else if (kind > 4.5) {
    // Cercha: cordones arriba y abajo, montantes cada 2,4 m y una diagonal por paño, alternada.
    float fx = fract(vInfo.x / 2.4), h = vInfo.y / max(vInfo.w, 0.5);
    float chord = step(h, 0.1) + step(0.9, h), vert = step(fx, 0.05) + step(0.95, fx);
    float diag = step(abs((mod(floor(vInfo.x / 2.4), 2.0) < 0.5 ? fx : 1.0 - fx) - h), 0.06);
    if (chord + vert + diag < 0.5 && fwidth(vInfo.y) < 0.6) discard;
  }
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 c = col * (uSunColor * ndl * vShade + uAmbient * (0.6 + 0.4 * N.y));
  if (kind > 2.5) c += uSunColor * pow(max(dot(reflect(vRel / dist, N), uSunDir), 0.0), 22.0) * 0.22 * vShade; // acero pintado
  c = applyFog(c, cameraPosition.y, vRel, dist);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const LINE_VERT = /* glsl */ `
${COMMON_VERT}
attribute float aFade; // distancia (m) a la que la línea termina de desvanecerse
varying vec3 vRel;
varying float vFade;
void main() {
  vRel = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; vFade = aFade;
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(position, 1.0));
}`;
const LINE_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec3 vRel;
varying float vFade;
void main() {
  float dist = length(vRel), a = 1.0 - smoothstep(0.45, 1.0, dist / vFade);
  if (a < 0.02) discard;
  vec3 c = applyFog(vec3(0.085, 0.09, 0.095) * (uSunColor * 0.5 + uAmbient), cameraPosition.y, vRel, dist);
  gl_FragColor = vec4(c, a * 0.9);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Acumula triángulos (relativos al ancla de la celda) y segmentos de línea.
class Mesher {
  constructor(ax, az) { this.ax = ax; this.az = az; this.pos = []; this.nrm = []; this.col = []; this.info = []; this.lp = []; this.lf = []; }
  // a→b→c→d en orden; (u, v) van a: (u0, v0), b: (u1, v0), c: (u1, v1), d: (u0, v1)
  quad(a, b, c, d, color, kind = 0, u0 = 0, u1 = 0, v0 = 0, v1 = 0, hw = 0) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const P = [a, b, c, a, c, d], U = [u0, u1, u1, u0, u1, u0], V = [v0, v0, v1, v0, v1, v1];
    for (let i = 0; i < 6; i++) { this.pos.push(P[i][0] - this.ax, P[i][1], P[i][2] - this.az); this.nrm.push(nx, ny, nz); this.col.push(color[0], color[1], color[2]); this.info.push(U[i], V[i], kind, hw); }
  }
  // Caja orientada: (tx, tz) es su eje largo en planta.
  box(cx, y0, cz, tx, tz, halfAlong, halfAcross, h, color, kind = 0) {
    const nx = -tz, nz = tx, c = (sa, sn, y) => [cx + tx * halfAlong * sa + nx * halfAcross * sn, y, cz + tz * halfAlong * sa + nz * halfAcross * sn], y1 = y0 + h;
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let i = 0; i < 4; i++) { const [a0, n0] = ring[i], [a1, n1] = ring[(i + 1) % 4]; this.quad(c(a0, n0, y0), c(a1, n1, y0), c(a1, n1, y1), c(a0, n0, y1), color, kind); }
    this.quad(c(-1, -1, y1), c(1, -1, y1), c(1, 1, y1), c(-1, 1, y1), color, kind);
  }
  // Cinta plana de ancho w entre dos puntos, mirando hacia `f` (para perfiles de celosía: una cara basta).
  ribbon(p, q, w, f, color, kind = 0) {
    const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
    let sx = dy * f[2] - dz * f[1], sy = dz * f[0] - dx * f[2], sz = dx * f[1] - dy * f[0]; const l = (Math.hypot(sx, sy, sz) || 1) / (w / 2); sx /= l; sy /= l; sz /= l;
    this.quad([p[0] - sx, p[1] - sy, p[2] - sz], [p[0] + sx, p[1] + sy, p[2] + sz], [q[0] + sx, q[1] + sy, q[2] + sz], [q[0] - sx, q[1] - sy, q[2] - sz], color, kind);
  }
  // Tubo de 8 caras con normales suaves a lo largo de una polilínea 3D.
  tube(pts, r, color, kind) {
    const N = 8; let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2]; const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      let sx = -tz, sz = tx; const sl = Math.hypot(sx, sz) || 1; sx /= sl; sz /= sl; // lateral horizontal
      const ux = -sz * ty, uy = sz * tx - sx * tz, uz = sx * ty;                       // "arriba" perpendicular al eje (lateral × tangente)
      const ring = [];
      for (let k = 0; k < N; k++) { const an = (k / N) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an), n = [sx * c + ux * s, uy * s, sz * c + uz * s]; ring.push({ n, p: [pts[i][0] + n[0] * r, pts[i][1] + n[1] * r, pts[i][2] + n[2] * r] }); }
      if (prev) for (let k = 0; k < N; k++) {
        const j = (k + 1) % N;
        for (const v of [prev[k], ring[k], ring[j], prev[k], ring[j], prev[j]]) { this.pos.push(v.p[0] - this.ax, v.p[1], v.p[2] - this.az); this.nrm.push(v.n[0], v.n[1], v.n[2]); this.col.push(color[0], color[1], color[2]); this.info.push(0, 0, kind, 0); }
      }
      prev = ring;
    }
  }
  line(p, q, fade) { this.lp.push(p[0] - this.ax, p[1], p[2] - this.az, q[0] - this.ax, q[1], q[2] - this.az); this.lf.push(fade, fade); }
  // Cable colgante entre dos puntos: parábola con flecha `sag` al centro.
  wire(p, q, sag, fade, n = 6) {
    let a = p;
    for (let i = 1; i <= n; i++) { const t = i / n, b = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t - 4 * sag * t * (1 - t), p[2] + (q[2] - p[2]) * t]; this.line(a, b, fade); a = b; }
  }
}

// Puentes relevados (Street View y satélite, 2023–2025): los que no son "una losa con baranda". El resto lleva el modelo
// común del Cajón del Maipo: vereda angosta a cada lado y baranda de barras blancas sobre postes rojo-anaranjado.
//   jersey: barrera de hormigón tipo New Jersey al borde de la calzada · arch: arco de hormigón de tablero superior ·
//   truss: cerchas metálicas a los costados (color) de alto th · wood: tablero de tablones · walk: ancho de vereda (m) ·
//   hw: semiancho real de la calzada · girder: pasarela sobre vigas y pilas, sin cables (ex puente ferroviario)
const GREEN = [20, 50, 28], GALV = [98, 100, 102], SIDEWALK = [86, 84, 78];
const BRIDGE_STYLES = [
  { lat: -33.58064, lon: -70.40812, jersey: true },                                   // El Manzano: New Jersey con grafitis y, por fuera, la vereda con su baranda
  { lat: -33.59386, lon: -70.37087, arch: true },                                     // Río Colorado: arco de hormigón sobre la garganta
  { lat: -33.68497, lon: -70.33851, jersey: true, walk: 0 },                          // al norte de El Melocotón
  { lat: -33.73409, lon: -70.30112, truss: GALV, th: 1.8, walk: 0 },                  // San Alfonso: puente mecano galvanizado
  { lat: -33.76824, lon: -70.27401, truss: GREEN, th: 1.7, wood: true, walk: 0, hw: 1.9 }, // El Ingenio: reticulado verde de una pista con tablones
  { lat: -33.67890, lon: -70.34201, walk: 0.9, hw: 3.0 },                             // El Toyo: calzada angosta sin eje pintado
  { lat: -33.82649, lon: -70.06451, walk: 0, hw: 2.0 },                               // Baños Morales: una pista
  { lat: -33.59537, lon: -70.37326, girder: true },                                   // ex puente ferroviario del río Colorado
];

const unpack = (flat) => { const p = new Float64Array(flat.length); for (let i = 0; i < flat.length; i++) p[i] = flat[i] / 10; return p; };
const cellKey = (x, z, size) => Math.floor(x / size) * 8192 + Math.floor(z / size);

export class Infra {
  constructor({ hf, manifest, env, data, shadowTex }) {
    this.hf = hf; this.group = new THREE.Group(); this.chunks = new Map(); this.features = new Map(); this.stats = { tris: 0, chunks: 0 }; this._tick = 1;
    const uniforms = { ...env, uCoreSize: { value: new THREE.Vector2(manifest.core.sizeX, manifest.core.sizeZ) }, uShadow: { value: shadowTex } };
    this.mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.lineMat = new THREE.ShaderMaterial({ uniforms: { ...env }, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false });
    const feat = (x, z) => { const k = cellKey(x, z, CHUNK); let f = this.features.get(k); if (!f) this.features.set(k, (f = { bridges: [], towers: [], pipes: [], lifts: [] })); return f; };

    // --- puentes: además de dibujarse, se pueden pisar; por eso llevan un índice espacial propio
    this.bridges = data.bridges.map(([w, flat]) => ({ foot: w < 0, hw: Math.abs(w) / 20, pts: unpack(flat), st: null, style: null, walk: 0 }));
    for (const b of this.bridges) { // ¿es uno de los relevados? (su punto medio a menos de 90 m)
      const n = b.pts.length / 2, mx = (b.pts[0] + b.pts[n * 2 - 2]) / 2, mz = (b.pts[1] + b.pts[n * 2 - 1]) / 2;
      for (const s of BRIDGE_STYLES) if (Math.hypot((s.lon - manifest.core.west) * manifest.mPerDegLon - mx, (manifest.core.north - s.lat) * manifest.mPerDegLat - mz) < 90 && (!s.girder || b.foot)) b.style = s;
      if (b.style && b.style.hw) b.hw = b.style.hw;
      b.walk = b.foot ? 0 : b.style && b.style.walk !== undefined ? b.style.walk : 1.05;
    }
    this.hash = new Map();
    for (const b of this.bridges) {
      const p = b.pts, n = p.length / 2; let last = -1;
      feat((p[0] + p[n * 2 - 2]) / 2, (p[1] + p[n * 2 - 1]) / 2).bridges.push(b);
      for (let i = 0; i < n - 1; i++) {
        const steps = Math.max(1, Math.ceil(Math.hypot(p[i * 2 + 2] - p[i * 2], p[i * 2 + 3] - p[i * 2 + 1]) / 32));
        for (let s = 0; s <= steps; s++) {
          const k = cellKey(p[i * 2] + ((p[i * 2 + 2] - p[i * 2]) * s) / steps, p[i * 2 + 1] + ((p[i * 2 + 3] - p[i * 2 + 1]) * s) / steps, HASH);
          if (k === last) continue; last = k;
          const list = this.hash.get(k); if (!list) this.hash.set(k, [b]); else if (!list.includes(b)) list.push(b);
        }
      }
    }
    // --- alta tensión: cada vértice de la línea es una torre; se orienta según la bisectriz del trazado
    for (const [kv, flat] of data.power) {
      const p = unpack(flat), H = kv >= 400 ? 46 : kv >= 200 ? 38 : kv > 0 && kv < 100 ? 24 : 30, line = [];
      for (let i = 0; i < p.length; i += 2) { const q = line[line.length - 1]; if (!q || Math.hypot(p[i] - q.x, p[i + 1] - q.z) > 45) line.push({ x: p[i], z: p[i + 1], H, y: null, dx: 0, dz: 1, next: null }); }
      for (let i = 0; i < line.length; i++) {
        const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], t = line[i], l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
        t.dx = (b.x - a.x) / l; t.dz = (b.z - a.z) / l; t.next = line[i + 1] || null;
        feat(t.x, t.z).towers.push(t);
      }
    }
    for (const flat of data.pipes) { const p = unpack(flat); feat(p[0], p[1]).pipes.push(p); }
    for (const flat of data.lifts) { const p = unpack(flat); feat(p[0], p[1]).lifts.push(p); }
    this.labels = data.labels.map(([name, note, kind, x, z, rank]) => ({ name, note, kind, group: 'vias', x, z, rank, lift: kind === 'puente' ? 9 : 5 }));
  }

  // Perfil de un puente: estaciones cada ≤ 6 m con la cota de la calzada. Los extremos calzan con el terreno (ahí llega
  // el camino pintado) y entre medio el tablero va recto con una leve contraflecha; nunca queda bajo el suelo.
  _profile(b) {
    if (b.st) return b.st;
    const hf = this.hf, p = b.pts, n = p.length / 2, st = [];
    let s = 0;
    for (let i = 0; i < n - 1; i++) {
      const x0 = p[i * 2], z0 = p[i * 2 + 1], dx = p[i * 2 + 2] - x0, dz = p[i * 2 + 3] - z0, d = Math.hypot(dx, dz); if (d < 0.05) continue;
      const k = Math.max(1, Math.ceil(d / 6));
      for (let j = 0; j < k; j++) st.push({ x: x0 + (dx * j) / k, z: z0 + (dz * j) / k, s: s + (d * j) / k, tx: dx / d, tz: dz / d, y: 0, g: 0 });
      s += d;
      if (i === n - 2) st.push({ x: x0 + dx, z: z0 + dz, s, tx: dx / d, tz: dz / d, y: 0, g: 0 });
    }
    for (let i = 1; i < st.length - 1; i++) { // en los quiebres, la sección va por la bisectriz
      const a = st[i - 1], c = st[i + 1], l = Math.hypot(c.x - a.x, c.z - a.z) || 1; st[i].bx = (c.x - a.x) / l; st[i].bz = (c.z - a.z) / l;
    }
    for (const q of st) { if (q.bx !== undefined) { q.tx = q.bx; q.tz = q.bz; } }
    const L = s, h0 = hf.height(st[0].x, st[0].z, true), h1 = hf.height(st[st.length - 1].x, st[st.length - 1].z, true);
    const rise = b.foot ? Math.min(0.5, L * 0.008) : Math.min(1.6, Math.max(0.15, L * 0.016));
    for (const q of st) {
      const nx = -q.tz, nz = q.tx, gc = hf.height(q.x, q.z, true), ga = hf.height(q.x + nx * b.hw, q.z + nz * b.hw, true), gb = hf.height(q.x - nx * b.hw, q.z - nz * b.hw, true);
      // En los extremos manda la cota del eje (ahí empalma el camino); hacia adentro, el borde más alto de la sección.
      const t = q.s / L, inner = Math.min(1, q.s / 8, (L - q.s) / 8);
      q.y = Math.max(h0 + (h1 - h0) * t + rise * Math.sin(Math.PI * t), gc + (Math.max(gc, ga, gb) - gc + 0.35) * inner) + 0.14;
      q.g = Math.min(gc, ga, gb);
    }
    b.L = L;
    return (b.st = st);
  }

  // Cota de la calzada del puente que pasa por (x, z), o -Infinity si no hay ninguno.
  deckAt(x, z) {
    let best = -Infinity;
    const cx = Math.floor(x / HASH), cz = Math.floor(z / HASH);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const list = this.hash.get((cx + dx) * 8192 + cz + dz); if (!list) continue;
      for (const b of list) {
        if (b._q === this._tick) continue; b._q = this._tick;
        const st = this._profile(b), lim = (b.hw + b.walk + 0.25) ** 2;
        for (let i = 0; i < st.length - 1; i++) {
          const a = st[i], c = st[i + 1], ex = c.x - a.x, ez = c.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1e-6)));
          const px = x - a.x - ex * t, pz = z - a.z - ez * t;
          if (px * px + pz * pz <= lim) best = Math.max(best, a.y + (c.y - a.y) * t);
        }
      }
    }
    this._tick = (this._tick | 0) + 1;
    return best;
  }

  _bridge(M, b) {
    const st = this._profile(b), hw = b.hw, foot = b.foot, T = foot ? 0.3 : Math.min(2.2, Math.max(0.9, b.L / 26)), S = b.style || {};
    const ow = hw + b.walk; // borde exterior del tablero: la calzada más la vereda
    const pt = (q, side, dy = 0, off = hw) => [q.x - q.tz * side * off, q.y + dy, q.z + q.tx * side * off];
    const top = foot || S.wood ? WOOD : ASPHALT, body = foot ? RAIL : S.truss || CONCRETE;
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i], c = st[i + 1];
      M.quad(pt(a, 1), pt(a, -1), pt(c, -1), pt(c, 1), top, foot || S.wood ? 0 : 1, hw, -hw, a.s, c.s, hw);                // calzada
      M.quad(pt(a, 1, -T, ow), pt(c, 1, -T, ow), pt(c, -1, -T, ow), pt(a, -1, -T, ow), body);                              // fondo
      for (const side of [1, -1]) {
        M.quad(pt(a, side, -T, ow), pt(c, side, -T, ow), pt(c, side, 0, ow), pt(a, side, 0, ow), body);                      // costado de la viga
        if (foot) { M.quad(pt(a, side), pt(c, side), pt(c, side, 1.1), pt(a, side, 1.1), RAIL, 2, a.s, c.s, 0, 1); continue; } // baranda de pasarela
        const up = b.walk > 0 ? 0.18 : 0;
        if (b.walk > 0) { // vereda: solera y losa, 18 cm sobre la calzada
          M.quad(pt(a, side), pt(c, side), pt(c, side, up), pt(a, side, up), CONCRETE);
          M.quad(pt(a, side, up), pt(c, side, up), pt(c, side, up, ow), pt(a, side, up, ow), SIDEWALK);
        }
        if (S.jersey) { // barrera de hormigón al borde de la calzada (la vereda queda por fuera)
          M.quad(pt(a, side, 0, hw - 0.28), pt(c, side, 0, hw - 0.28), pt(c, side, 0.82, hw - 0.12), pt(a, side, 0.82, hw - 0.12), CONCRETE);
          M.quad(pt(a, side, 0.82, hw - 0.12), pt(c, side, 0.82, hw - 0.12), pt(c, side, 0.82, hw + 0.06), pt(a, side, 0.82, hw + 0.06), CONCRETE);
          M.quad(pt(a, side, up, hw + 0.2), pt(c, side, up, hw + 0.2), pt(c, side, 0.82, hw + 0.06), pt(a, side, 0.82, hw + 0.06), CONCRETE);
        }
        if (S.truss) M.quad(pt(a, side, 0, ow + 0.1), pt(c, side, 0, ow + 0.1), pt(c, side, S.th, ow + 0.1), pt(a, side, S.th, ow + 0.1), S.truss, 5, a.s, c.s, 0, S.th, S.th); // cercha
        else if (b.walk > 0 || !S.jersey) M.quad(pt(a, side, up, ow), pt(c, side, up, ow), pt(c, side, up + 1.1, ow), pt(a, side, up + 1.1, ow), STEEL, 4, a.s, c.s, 0, 1); // baranda blanca y roja
      }
    }
    for (const q of [st[0], st[st.length - 1]]) M.quad(pt(q, 1, -T, ow), pt(q, -1, -T, ow), pt(q, -1, 0, ow), pt(q, 1, 0, ow), body); // tapas
    if (S.arch) {
      // Arco de tablero superior: dos costillas que arrancan abajo, en las paredes de la garganta, y tocan el tablero al
      // centro; sobre ellas, columnas que lo sostienen. Sin cepas en el cauce.
      const n = st.length, o = hw * 0.78;
      let clear = 0; for (const q of st) clear = Math.max(clear, q.y - T - q.g);
      const depth = Math.max(4, Math.min(clear * 0.85, b.L * 0.3));
      const ya = (q) => { const t = (2 * q.s) / b.L - 1; return -T - 0.4 - depth * t * t; }; // relativo a la calzada
      for (let i = 0; i < n - 1; i++) {
        const a = st[i], c = st[i + 1], ya0 = ya(a), ya1 = ya(c);
        for (const side of [1, -1]) {
          M.quad(pt(a, side, ya0, o), pt(c, side, ya1, o), pt(c, side, ya1 - 1.4, o), pt(a, side, ya0 - 1.4, o), CONCRETE);
          M.quad(pt(a, side, ya0, o - 0.9), pt(c, side, ya1, o - 0.9), pt(c, side, ya1 - 1.4, o - 0.9), pt(a, side, ya0 - 1.4, o - 0.9), CONCRETE);
          M.quad(pt(a, side, ya0, o), pt(c, side, ya1, o), pt(c, side, ya1, o - 0.9), pt(a, side, ya0, o - 0.9), CONCRETE);
          M.quad(pt(a, side, ya0 - 1.4, o), pt(c, side, ya1 - 1.4, o), pt(c, side, ya1 - 1.4, o - 0.9), pt(a, side, ya0 - 1.4, o - 0.9), CONCRETE);
        }
      }
      for (let i = 1; i < n - 1; i++) {
        const q = st[i], h = -T - ya(q); if (h < 0.7 || i % 2) continue;
        for (const side of [1, -1]) { const p = pt(q, side, 0, o - 0.45); M.box(p[0], q.y + ya(q), p[2], q.tx, q.tz, 0.28, 0.4, h, CONCRETE); }
      }
      return;
    }
    if (foot && !S.girder) {
      // Pasarela colgante: mástiles en los extremos y dos cables portantes que bajan casi hasta la baranda al centro.
      if (b.L < 28) return;
      const a = st[0], c = st[st.length - 1], mh = Math.min(7, 2.5 + b.L * 0.045);
      for (const q of [a, c]) for (const side of [1, -1]) { const m = pt(q, side); M.box(m[0], q.g - 1, m[2], q.tx, q.tz, 0.14, 0.14, q.y - q.g + 1 + mh, RAIL); }
      for (const side of [1, -1]) {
        const p = pt(a, side, mh), q = pt(c, side, mh), mid = (a.y + c.y) / 2 + mh, low = st[st.length >> 1].y + 1.25;
        M.wire(p, q, Math.max(0.3, mid - low), 2500, 10);
        for (let i = 2; i < st.length - 2; i += 2) { const t = st[i].s / b.L, h = pt(st[i], side, 1.1); M.line(h, [h[0], p[1] + (q[1] - p[1]) * t - 4 * Math.max(0.3, mid - low) * t * (1 - t), h[2]], 700); }
      }
      return;
    }
    // Cepas: una cada ~24 m, donde el tablero queda de verdad en el aire.
    const piers = Math.round(b.L / 24) - 1;
    for (let k = 1; k <= piers; k++) {
      const s = (b.L * k) / (piers + 1); let q = st[0]; for (const c of st) if (Math.abs(c.s - s) < Math.abs(q.s - s)) q = c;
      const h = q.y - T - q.g; if (h < 2.2) continue;
      M.box(q.x, q.g - 1.5, q.z, q.tx, q.tz, 0.7, Math.max(1.2, hw * 0.62), h + 1.5, CONCRETE);
      M.box(q.x, q.y - T - 0.7, q.z, q.tx, q.tz, 0.9, hw * 0.92, 0.7, CONCRETE);
    }
  }

  // Torre de celosía de doble circuito: cuatro montantes que se cierran hacia arriba, diagonales y tres crucetas.
  _tower(M, t) {
    const hf = this.hf; if (t.y === null) t.y = hf.height(t.x, t.z, true);
    const { x, z, H, dx, dz } = t, y = t.y, nx = -dz, nz = dx, b = H * 0.1, tp = 0.5;
    const corner = (k, f) => { const w = b + (tp - b) * Math.min(1, f / 0.7), ln = (k & 1 ? 1 : -1) * w, ld = (k & 2 ? 1 : -1) * w; return [x + nx * ln + dx * ld, y + H * f - (f === 0 ? 1 : 0), z + nz * ln + dz * ld]; };
    for (let k = 0; k < 4; k++) {
      const f = [(k & 1 ? 1 : -1) * nx + (k & 2 ? 1 : -1) * dx, 0, (k & 1 ? 1 : -1) * nz + (k & 2 ? 1 : -1) * dz];
      M.ribbon(corner(k, 0), corner(k, 0.7), 0.3, f, STEEL); M.ribbon(corner(k, 0.7), corner(k, 1), 0.24, f, STEEL);
      M.line(corner(k, 0), corner(k, 0.7), 6500); M.line(corner(k, 0.7), corner(k, 1), 6500);
    }
    const faces = [[0, 1, [dx, 0, dz]], [1, 3, [nx, 0, nz]], [3, 2, [dx, 0, dz]], [2, 0, [nx, 0, nz]]], LV = 6;
    for (const [a, c, f] of faces) for (let m = 0; m < LV; m++) M.ribbon(corner(m % 2 ? a : c, (m / LV) * 0.7), corner(m % 2 ? c : a, ((m + 1) / LV) * 0.7), 0.14, f, STEEL);
    for (const [f, len] of ARMS) for (const side of [1, -1]) {
      const tip = [x + nx * side * H * len, y + H * f, z + nz * side * H * len], root = [x + nx * side * tp, y + H * f, z + nz * side * tp], low = [root[0], root[1] - H * 0.05, root[2]];
      M.ribbon(root, tip, 0.22, [dx, 0, dz], STEEL); M.ribbon(low, tip, 0.16, [dx, 0, dz], STEEL);
      M.line(root, tip, 6500);
    }
    M.ribbon([x, y + H, z], [x, y + H + 2, z], 0.2, [dx, 0, dz], STEEL);
    // Cables hasta la torre siguiente: seis conductores (colgando de sus aisladores) y el cable de guardia arriba.
    const u = t.next; if (!u) return;
    if (u.y === null) u.y = hf.height(u.x, u.z, true);
    const span = Math.hypot(u.x - x, u.z - z), sag = Math.min(16, span * 0.032), flip = dx * u.dx + dz * u.dz < 0 ? -1 : 1;
    for (const [f, len] of ARMS) for (const side of [1, -1])
      M.wire([x + nx * side * H * len, y + H * f - 1.6, z + nz * side * H * len], [u.x - u.dz * side * flip * u.H * len, u.y + u.H * f - 1.6, u.z + u.dx * side * flip * u.H * len], sag, 3200);
    M.wire([x, y + H + 2, z], [u.x, u.y + u.H + 2, u.z], sag * 0.8, 3200);
  }

  // Tubería a la vista (las de presión de las centrales): sigue la ladera sobre machones de hormigón.
  _pipe(M, p) {
    const hf = this.hf, R = 0.85, pts = [];
    for (let i = 0; i < p.length - 2; i += 2) {
      const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], d = Math.hypot(dx, dz), k = Math.max(1, Math.ceil(d / 9));
      for (let j = i === 0 ? 0 : 1; j <= k; j++) { const x = p[i] + (dx * j) / k, z = p[i + 1] + (dz * j) / k; pts.push([x, hf.height(x, z, true) + R + 0.35, z]); }
    }
    for (let i = 1; i < pts.length - 1; i++) pts[i][1] = Math.max(pts[i][1], (pts[i - 1][1] + pts[i + 1][1]) / 2); // sin quiebres hacia abajo: es un tubo rígido
    M.tube(pts, R, PIPE, 3);
    for (let i = 0; i < pts.length; i += 2) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(c[0] - a[0], c[2] - a[2]) || 1;
      M.box(pts[i][0], pts[i][1] - R - 2, pts[i][2], (c[0] - a[0]) / l, (c[2] - a[2]) / l, 0.5, R + 0.3, R + 2, CONCRETE);
    }
  }

  // Andarivel: pilones en T cada ~75 m, dos cables y una caseta en cada extremo.
  _lift(M, p) {
    const hf = this.hf, HM = 9, masts = [];
    for (let i = 0; i < p.length - 2; i += 2) {
      const dx = p[i + 2] - p[i], dz = p[i + 3] - p[i + 1], d = Math.hypot(dx, dz), k = Math.max(1, Math.round(d / 75));
      for (let j = i === 0 ? 0 : 1; j <= k; j++) { const x = p[i] + (dx * j) / k, z = p[i + 1] + (dz * j) / k; masts.push({ x, z, y: hf.height(x, z, true), tx: dx / d, tz: dz / d }); }
    }
    masts.forEach((m, i) => {
      const end = i === 0 || i === masts.length - 1;
      if (end) M.box(m.x, m.y - 1, m.z, m.tx, m.tz, 5, 3.2, 5.5, [96, 92, 86]);
      M.box(m.x, m.y - 1, m.z, m.tx, m.tz, 0.3, 0.3, HM + 1, MAST); M.box(m.x, m.y + HM - 0.4, m.z, m.tx, m.tz, 0.25, 2.6, 0.4, MAST);
      const n = masts[i + 1]; if (!n) return;
      const span = Math.hypot(n.x - m.x, n.z - m.z);
      for (const side of [1, -1]) M.wire([m.x - m.tz * side * 2.4, m.y + HM - 0.5, m.z + m.tx * side * 2.4], [n.x - n.tz * side * 2.4, n.y + HM - 0.5, n.z + n.tx * side * 2.4], span * 0.015, 3200, 4);
    });
  }

  _build(key, f) {
    const cx = Math.floor(key / 8192), cz = key - cx * 8192, ax = (cx + 0.5) * CHUNK, az = (cz + 0.5) * CHUNK, M = new Mesher(ax, az);
    for (const b of f.bridges) this._bridge(M, b);
    for (const t of f.towers) this._tower(M, t);
    for (const p of f.pipes) this._pipe(M, p);
    for (const p of f.lifts) this._lift(M, p);
    const c = { objects: [], tris: M.pos.length / 9 };
    const place = (o) => { o.position.set(ax, 0, az); o.updateMatrixWorld(); o.matrixAutoUpdate = false; this.group.add(o); c.objects.push(o); };
    if (M.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(M.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(M.nrm, 3));
      g.setAttribute('color', new THREE.Uint8BufferAttribute(M.col, 3, true)); g.setAttribute('aInfo', new THREE.Float32BufferAttribute(M.info, 4));
      g.computeBoundingSphere(); place(new THREE.Mesh(g, this.mat));
    }
    if (M.lp.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(M.lp, 3)); g.setAttribute('aFade', new THREE.Float32BufferAttribute(M.lf, 1));
      g.computeBoundingSphere(); place(new THREE.LineSegments(g, this.lineMat));
    }
    this.stats.tris += c.tris; this.stats.chunks++;
    return c;
  }

  // Por cuadro: arma (de a una) las celdas cercanas que faltan y suelta las que quedaron lejos.
  update(camera) {
    const cam = camera.position, cx = Math.floor(cam.x / CHUNK), cz = Math.floor(cam.z / CHUNK), R = Math.ceil(BUILD / CHUNK);
    let best = null, bd = BUILD;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const key = (cx + dx) * 8192 + cz + dz; if (this.chunks.has(key) || !this.features.has(key)) continue;
      const d = Math.hypot((cx + dx + 0.5) * CHUNK - cam.x, (cz + dz + 0.5) * CHUNK - cam.z);
      if (d < bd) { bd = d; best = key; }
    }
    if (best !== null) this.chunks.set(best, this._build(best, this.features.get(best)));
    for (const [key, c] of this.chunks) {
      const kx = Math.floor(key / 8192), kz = key - kx * 8192;
      if (Math.hypot((kx + 0.5) * CHUNK - cam.x, (kz + 0.5) * CHUNK - cam.z) < DROP) continue;
      for (const o of c.objects) { this.group.remove(o); o.geometry.dispose(); }
      this.stats.tris -= c.tris; this.stats.chunks--; this.chunks.delete(key);
    }
  }
}
// Crucetas: [altura, semilargo], ambas como fracción de la altura de la torre.
const ARMS = [[0.72, 0.17], [0.85, 0.21], [0.97, 0.16]];
