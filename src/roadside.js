// Lo que acompaña a un camino de verdad y no viene en ningún dato: las defensas camineras donde el borde cae al
// barranco, y los postes con su tendido en las calles de los pueblos y la ciudad. Todo sale de los mismos trazados
// de OSM que pintan los caminos (overlay.js) más el relieve: se recorre cada tramo y se decide con la altura del
// terreno. Se arma por celdas de 2 km cerca de la cámara, de a poco (un par de milisegundos por cuadro), y se suelta
// al alejarse.
import * as THREE from 'three';
import { COMMON_VERT, ATMOS_GLSL } from './shaders.js';
import { CELL } from './overlay.js';

const BUILD = 1500, DROP = 3200, STEP = 4, POLE = 38; // m: distancia para armar y para soltar; largo de una defensa; separación de postes

const VERT = /* glsl */ `
${COMMON_VERT}
attribute vec3 color;
varying vec3 vRel, vN, vCol;
varying vec2 vXZ;
void main() {
  vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
  vRel = wp - cameraPosition; vN = normal; vCol = color; vXZ = wp.xz;
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(position, 1.0));
}`;
const FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform vec2 uCoreSize;
uniform sampler2D uShadow;
varying vec3 vRel, vN, vCol;
varying vec2 vXZ;
void main() {
  float shade = textureLod(uShadow, vXZ / uCoreSize, 0.0).r, dist = length(vRel);
  vec3 N = normalize(vN);
  vec3 c = vCol * (uSunColor * max(dot(N, uSunDir), 0.0) * shade + uAmbient * (0.6 + 0.4 * N.y));
  c = applyFog(c, cameraPosition.y, vRel, dist);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const LINE_VERT = /* glsl */ `
${COMMON_VERT}
varying vec3 vRel;
void main() { vRel = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(position, 1.0)); }`;
const LINE_FRAG = /* glsl */ `
${ATMOS_GLSL}
varying vec3 vRel;
void main() {
  float d = length(vRel), a = 1.0 - smoothstep(180.0, 420.0, d);
  if (a < 0.02) discard;
  gl_FragColor = vec4(applyFog(vec3(0.012), cameraPosition.y, vRel, d), a * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// Las seis caras de una caja: cuatro esquinas (en signos) y la normal. Se dibuja por los dos lados, así el orden no importa.
const FACES = [
  [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1], [1, 0, 0]], [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1], [-1, 0, 0]],
  [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1], [0, 1, 0]], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, -1, 0]],
  [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]], [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [0, 0, -1]],
], TRI = [0, 1, 2, 0, 2, 3];
export const SOLID_VERT = VERT, SOLID_FRAG = FRAG; // el mismo material sirve para otras mallas sólidas de color por vértice
const STEEL = [0.40, 0.41, 0.42], WOOD = [0.15, 0.10, 0.06], CONC = [0.36, 0.35, 0.33];

export class Roadside {
  // cls(x, z): clase de cobertura de suelo (5 = ciudad). overlay: de ahí salen los tramos de camino por celda.
  constructor({ hf, env, overlay, shadowTex, manifest, cls }) {
    this.hf = hf; this.cls = cls; this.group = new THREE.Group(); this.cells = new Map(); this.job = null;
    this.src = new Map(); for (const c of overlay.cells) this.src.set(Math.round(c.x0 / CELL) + ',' + Math.round(c.z0 / CELL), c);
    const u = { ...env, uShadow: { value: shadowTex }, uCoreSize: { value: new THREE.Vector2(manifest.core.sizeX, manifest.core.sizeZ) } };
    this.mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide });
    this.lineMat = new THREE.ShaderMaterial({ uniforms: env, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, transparent: true, depthWrite: false });
    this.stats = { rails: 0, poles: 0 };
  }
  update(camera) {
    const cx = camera.position.x, cz = camera.position.z;
    // sigue con la celda que se está armando
    if (this.job) { if (this._work(this.job, 2.2)) { this._finish(this.job); this.job = null; } return; }
    for (const [key, c] of this.cells) {
      if (Math.max(c.x0 - cx, cx - c.x0 - CELL, c.z0 - cz, cz - c.z0 - CELL) > DROP) { for (const o of c.objects) { this.group.remove(o); o.geometry.dispose(); } this.cells.delete(key); }
    }
    const i0 = Math.floor((cx - BUILD) / CELL), i1 = Math.floor((cx + BUILD) / CELL), j0 = Math.floor((cz - BUILD) / CELL), j1 = Math.floor((cz + BUILD) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = i + ',' + j; if (this.cells.has(key)) continue;
      const src = this.src.get(key);
      if (!src) { this.cells.set(key, { x0: i * CELL, z0: j * CELL, objects: [] }); continue; }
      const g = src.mesh.geometry;
      this.job = { key, x0: i * CELL, z0: j * CELL, seg: g.attributes.iSeg.array, wc: g.attributes.iWC.array, n: g.instanceCount, i: 0, pos: [], nrm: [], col: [], line: [], rails: 0, poles: 0 };
      return;
    }
  }
  // Caja orientada (centro, tamaño, giro en Y) sin índices: 36 vértices. Relativa a la esquina de la celda.
  _box(J, cx, cy, cz, sx, sy, sz, yaw, c) {
    const co = Math.cos(yaw), si = Math.sin(yaw), hx = sx / 2, hy = sy / 2, hz = sz / 2;
    for (const f of FACES) {
      const n = f[4];
      for (const k of TRI) {
        const lx = f[k][0] * hx, ly = f[k][1] * hy, lz = f[k][2] * hz;
        J.pos.push(cx + co * lx + si * lz, cy + ly, cz - si * lx + co * lz);
        J.nrm.push(co * n[0] + si * n[2], n[1], -si * n[0] + co * n[2]); J.col.push(c[0], c[1], c[2]);
      }
    }
  }
  _work(J, ms) {
    const t0 = performance.now(), hf = this.hf;
    while (J.i < J.n) {
      const i = J.i++, hw = J.wc[i * 2], ch = J.wc[i * 2 + 1];
      if (ch > 0.5 || hw < 1.8) continue; // solo calzadas (no huellas, ríos ni senderos)
      const x0 = J.seg[i * 4], z0 = J.seg[i * 4 + 1], dx = J.seg[i * 4 + 2] - x0, dz = J.seg[i * 4 + 3] - z0, len = Math.hypot(dx, dz);
      if (len < 2) continue;
      const tx = dx / len, tz = dz / len, nx = -tz, nz = tx, yaw = Math.atan2(-tz, tx);
      if (hw >= 3.2) {
        // --- defensas camineras: donde, al lado de la berma, el terreno cae más de un par de metros
        for (let d = STEP / 2; d < len; d += STEP) for (const s of [-1, 1]) {
          const px = x0 + tx * d, pz = z0 + tz * d, ex = px + nx * s * (hw + 1.0), ez = pz + nz * s * (hw + 1.0);
          const he = hf.height(ex, ez, true), drop = he - hf.height(px + nx * s * (hw + 7.5), pz + nz * s * (hw + 7.5), true);
          if (drop < 2.4) continue;
          this._box(J, ex - J.x0, he + 0.62, ez - J.z0, STEP + 0.05, 0.3, 0.07, yaw, STEEL);   // la doble onda, simplificada a una viga
          this._box(J, ex - J.x0, he + 0.32, ez - J.z0, 0.1, 0.72, 0.12, yaw, STEEL);          // su poste
          J.rails++;
        }
      } else if (this.cls(x0 + dx / 2, z0 + dz / 2) === 5) {
        // --- postes con tendido en las calles: uno cada 38 m, siempre al mismo lado; el cable cuelga un poco entre ellos
        const a0 = x0 * tx + z0 * tz, k0 = Math.ceil(a0 / POLE), k1 = Math.floor((a0 + len) / POLE);
        for (let k = k0; k <= k1; k++) {
          const d = k * POLE - a0, px = x0 + tx * d + nx * (hw + 1.3), pz = z0 + tz * d + nz * (hw + 1.3), y = hf.height(px, pz, true);
          const conc = ((k * 7 + Math.round(a0)) & 3) === 0;
          this._box(J, px - J.x0, y + 4.1, pz - J.z0, 0.2, 8.4, 0.2, yaw, conc ? CONC : WOOD);
          this._box(J, px - J.x0, y + 7.7, pz - J.z0, 0.1, 0.1, 1.9, yaw, conc ? CONC : WOOD);
          for (const off of [-0.8, 0.8]) for (const dir of [-1, 1]) { // de cada poste salen medios vanos hacia los dos lados
            const wx = px + nx * off, wz = pz + nz * off, mx = wx + tx * dir * POLE / 2, mz = wz + tz * dir * POLE / 2;
            J.line.push(wx - J.x0, y + 7.75, wz - J.z0, mx - J.x0, hf.height(mx, mz, true) + 7.3, mz - J.z0);
          }
          J.poles++;
        }
      }
      if (performance.now() - t0 > ms) return false;
    }
    return true;
  }
  _finish(J) {
    const c = { x0: J.x0, z0: J.z0, objects: [] };
    const place = (o) => { o.position.set(J.x0, 0, J.z0); o.updateMatrixWorld(); o.matrixAutoUpdate = false; o.frustumCulled = false; this.group.add(o); c.objects.push(o); };
    if (J.pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(J.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(J.nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(J.col, 3));
      place(new THREE.Mesh(g, this.mat));
    }
    if (J.line.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(J.line, 3));
      place(new THREE.LineSegments(g, this.lineMat));
    }
    this.cells.set(J.key, c); this.stats.rails += J.rails; this.stats.poles += J.poles;
  }
}
