// Terreno CDLOD: un quadtree elige nodos según la distancia y todos se dibujan con la misma grilla
// instanciada (2 draw calls). La altura se calcula en el vertex shader desde las texturas del DEM.
import * as THREE from 'three';
import { TERRAIN_VERT, TERRAIN_FRAG } from './shaders.js';
import { OCTAVES } from './heightfield.js';

const NODE0 = 16;        // m: lado del nodo más fino
const RANGE0 = 48;       // m: alcance del nivel 0; cada nivel duplica (debe ser > 2,25 × NODE0 para que el morph cierre)
const ROOT_LEVEL = 15;   // 16 m × 2^15 = 524 km: un solo nodo raíz cubre todo el contexto
const MAX_INST = 6000;

function gridGeometry(cells) {
  const n = cells + 1, pos = new Float32Array(n * n * 3), idx = new Uint16Array(cells * cells * 6);
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) { pos[(z * n + x) * 3] = x; pos[(z * n + x) * 3 + 2] = z; }
  let o = 0;
  for (let z = 0; z < cells; z++) for (let x = 0; x < cells; x++) {
    const a = z * n + x, b = a + 1, c = a + n, d = c + 1;
    // Diagonales alternadas: al colapsar los vértices impares queda la triangulación del nivel superior.
    if ((x + z) & 1) idx.set([a, c, b, b, c, d], o); else idx.set([a, c, d, a, d, b], o);
    o += 6;
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const A = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 4), 4), B = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 2), 2);
  A.setUsage(THREE.DynamicDrawUsage); B.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('iA', A); g.setAttribute('iB', B);
  g.instanceCount = 0;
  return g;
}

export class Terrain {
  constructor({ manifest, hf, tex, env, quality, overlay }) {
    this.hf = hf; this.quality = quality;
    const m = manifest, tier = m.tiers[quality.tier];
    this.ctxRect = [m.ctx.originX, m.ctx.originZ, m.ctx.originX + m.ctx.sizeX, m.ctx.originZ + m.ctx.sizeZ];
    this.rootSize = NODE0 * 2 ** ROOT_LEVEL;
    this.rootX = Math.floor(m.ctx.originX / NODE0) * NODE0;
    this.rootZ = Math.floor(m.ctx.originZ / NODE0) * NODE0;
    this.lodBias = quality.lodBias;

    this.uniforms = {
      ...env,
      uCoreDem: { value: tex.coreDem }, uCtxDem: { value: tex.ctxDem },
      uCoreNrm: { value: tex.coreNrm }, uCtxNrm: { value: tex.ctxNrm },
      uCoreAlb: { value: tex.coreAlb }, uCtxAlb: { value: tex.ctxAlb }, uNoise: { value: tex.noise },
      uCoreSize: { value: new THREE.Vector2(m.core.sizeX, m.core.sizeZ) },
      uCoreTex: { value: new THREE.Vector2(tier.w, tier.h) },
      uCtxTex: { value: new THREE.Vector2(m.ctx.demSize.w, m.ctx.demSize.h) },
      uCtxRect: { value: new THREE.Vector4(m.ctx.originX, m.ctx.originZ, m.ctx.sizeX, m.ctx.sizeZ) },
      uStep: { value: hf.core.step },
      uCamPos: { value: new THREE.Vector3() },
      uRange0: { value: RANGE0 * this.lodBias },
      uCamFrac: { value: OCTAVES.map(() => new THREE.Vector2()) },
      uWaterFrac: { value: new THREE.Vector2() },
      uCapSun: { value: new THREE.Vector3(0.494, 0.839, -0.23) },
      uCatPos: { value: new THREE.Vector3(0, -1e6, 0) },
      uOv0: { value: overlay.targets[0].texture }, uOv1: { value: overlay.targets[1].texture }, uOv2: { value: overlay.targets[2].texture },
      uOv: { value: overlay.uniformValue },
      uShow: { value: new THREE.Vector4(1, 1, 0, 0) },
      uShadow: { value: tex.shadow }, uLand: { value: tex.land }, uStreets: { value: overlay.hasStreets ? 1 : 0 },
    };
    const mk = (cells) => new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG,
      defines: { CELLS: cells.toFixed(1), MORPH_START: '0.8' },
    });
    this.group = new THREE.Group();
    this.meshes = [quality.cells, quality.cells / 2].map((cells) => {
      const mesh = new THREE.Mesh(gridGeometry(cells), mk(cells));
      mesh.frustumCulled = false; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      return mesh;
    });
    this.bufs = this.meshes.map((mesh) => ({ A: mesh.geometry.attributes.iA, B: mesh.geometry.attributes.iB, n: 0 }));

    this._mm = [0, 0]; this._box = new THREE.Box3(); this._frustum = new THREE.Frustum(); this._mat = new THREE.Matrix4();
    this.stats = { nodes: 0, tris: 0 };
  }

  _box3(x, z, size) {
    const mm = this._mm, c = this._cam;
    this.hf.bounds(x, z, size, mm);
    this._box.min.set(x - c.x, mm[0] - c.y, z - c.z);
    this._box.max.set(x + size - c.x, mm[1] - c.y, z + size - c.z);
    return this._box;
  }
  _distSq(b) { // distancia² desde la cámara (origen) a la caja
    const dx = Math.max(b.min.x, 0, -b.max.x), dy = Math.max(b.min.y, 0, -b.max.y), dz = Math.max(b.min.z, 0, -b.max.z);
    return dx * dx + dy * dy + dz * dz;
  }
  _emit(which, x, z, size, level) {
    const buf = this.bufs[which];
    if (buf.n >= MAX_INST) return;
    const a = buf.A.array, b = buf.B.array, i = buf.n++;
    a[i * 4] = x - this._cam.x; a[i * 4 + 1] = z - this._cam.z; a[i * 4 + 2] = size; a[i * 4 + 3] = level;
    b[i * 2] = x; b[i * 2 + 1] = z;
  }
  _select(x, z, size, level) {
    const r = this.ctxRect;
    if (x >= r[2] || z >= r[3] || x + size <= r[0] || z + size <= r[1]) return;
    const box = this._box3(x, z, size);
    if (!this._frustum.intersectsBox(box)) return;
    const prev = level ? RANGE0 * this.lodBias * 2 ** (level - 1) : 0;
    if (level === 0 || this._distSq(box) > prev * prev) { this._emit(0, x, z, size, level); return; }
    const h = size / 2, c = this._cam;
    // Hijos del más cercano al más lejano: el z-buffer descarta antes los píxeles tapados.
    const fx = c.x > x + h ? 1 : 0, fz = c.z > z + h ? 1 : 0;
    for (let k = 0; k < 4; k++) {
      const ix = k & 1 ? 1 - fx : fx, iz = k & 2 ? 1 - fz : fz, cx = x + ix * h, cz = z + iz * h;
      if (cx >= r[2] || cz >= r[3] || cx + h <= r[0] || cz + h <= r[1]) continue;
      const cb = this._box3(cx, cz, h);
      if (this._distSq(cb) <= prev * prev) this._select(cx, cz, h, level - 1);
      else if (this._frustum.intersectsBox(cb)) this._emit(1, cx, cz, h, level);
    }
  }

  update(camera) {
    const c = (this._cam = camera.position), u = this.uniforms;
    this._mat.copy(camera.matrixWorldInverse); this._mat.elements[12] = this._mat.elements[13] = this._mat.elements[14] = 0;
    this._mat.premultiply(camera.projectionMatrix);
    this._frustum.setFromProjectionMatrix(this._mat);
    this.bufs[0].n = this.bufs[1].n = 0;
    this._select(this.rootX, this.rootZ, this.rootSize, ROOT_LEVEL);

    const cells = this.quality.cells;
    this.stats.nodes = this.bufs[0].n + this.bufs[1].n;
    this.stats.tris = this.bufs[0].n * cells * cells * 2 + this.bufs[1].n * cells * cells / 2;
    this.meshes.forEach((mesh, i) => {
      const buf = this.bufs[i];
      mesh.geometry.instanceCount = buf.n; mesh.visible = buf.n > 0;
      buf.A.clearUpdateRanges(); buf.A.addUpdateRange(0, buf.n * 4); buf.A.needsUpdate = true;
      buf.B.clearUpdateRanges(); buf.B.addUpdateRange(0, buf.n * 2); buf.B.needsUpdate = true;
      // La malla viaja con la cámara: modelView queda como rotación pura y no se pierde precisión float32.
      mesh.matrix.makeTranslation(c.x, c.y, c.z); mesh.matrixWorld.copy(mesh.matrix);
    });
    u.uCamPos.value.copy(c);
    const fr = (v) => v - Math.floor(v);
    OCTAVES.forEach((o, i) => u.uCamFrac.value[i].set(fr(c.x / o.tile + o.off[0]), fr(c.z / o.tile + o.off[1])));
    u.uWaterFrac.value.set(fr(c.x / 7), fr(c.z / 7));
  }
}
