// Capas vectoriales (ríos, lagos, caminos, senderos, frontera) pintadas sobre el terreno.
// Un DEM/imagen de 34 m no resuelve un sendero de 1,4 m, así que las líneas se rasterizan en GPU
// a 3 texturas en cascada centradas en la cámara (512 m, 4 km y 41 km de lado) que el shader del terreno muestrea.
import * as THREE from 'three';

const SIZES = [512, 4096, 40960];
const CELL = 2048;   // m: grilla espacial para dibujar solo los tramos cercanos a cada cascada
const MAX_SEG = 400; // m: los tramos más largos se parten, así cada uno vive en una sola celda
const CHANNEL = { pav: 0, ter: 0, res: 0, dirt: 1, path: 1, river: 2, border: 3 };

const LINE_VERT = /* glsl */ `
attribute vec4 iSeg;  // x0, z0, x1, z1
attribute vec2 iWC;   // semiancho (m), canal
uniform vec3 uRect;   // centro x, centro z, semilado
uniform float uTexel;
varying float vAcross, vHalf, vAlpha;
varying vec4 vChan;
void main() {
  vec2 a = iSeg.xy, b = iSeg.zw;
  vec2 t = normalize(b - a + vec2(1e-5, 0.0)), n = vec2(-t.y, t.x);
  float isBorder = step(2.5, iWC.y);
  // Ancho mínimo de ~1,5 texeles para que la línea no parpadee de lejos; se compensa con transparencia.
  float vis = max(iWC.x, uTexel * mix(0.75, 1.5, isBorder));
  float ext = vis + uTexel;
  vec2 p = mix(a, b, position.x) + t * (position.x * 2.0 - 1.0) * vis + n * position.y * ext;
  vAcross = position.y * ext; vHalf = vis;
  vAlpha = mix(pow(iWC.x / vis, 0.7), 1.0, isBorder);
  vChan = vec4(equal(vec4(iWC.y), vec4(0.0, 1.0, 2.0, 3.0)));
  gl_Position = vec4((p - uRect.xy) / uRect.z, 0.0, 1.0);
}`;
const LINE_FRAG = /* glsl */ `
uniform float uTexel;
varying float vAcross, vHalf, vAlpha;
varying vec4 vChan;
void main() {
  float a = clamp((vHalf - abs(vAcross)) / uTexel + 0.5, 0.0, 1.0) * vAlpha;
  gl_FragColor = vChan * a;
}`;
const FILL_VERT = /* glsl */ `
uniform vec3 uRect;
void main() { gl_Position = vec4((position.xz - uRect.xy) / uRect.z, 0.0, 1.0); }`;
const FILL_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(0.0, 0.0, 1.0, 0.0); }`;

export class Overlay {
  constructor(quality) {
    const res = quality.overlayRes;
    this.targets = SIZES.map(() => {
      const rt = new THREE.WebGLRenderTarget(res, res, { depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
      rt.texture.anisotropy = 4;
      return rt;
    });
    this.res = res;
    this.uniformValue = SIZES.map((s) => new THREE.Vector3(0, 0, s));
    this.centers = SIZES.map(() => [NaN, NaN]);
    this.scene = new THREE.Scene();
    this.camera = new THREE.Camera();
    this.uRect = { value: new THREE.Vector3() }; this.uTexel = { value: 1 };
    const blend = { blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, side: THREE.DoubleSide };
    this.lineMat = new THREE.ShaderMaterial({ uniforms: { uRect: this.uRect, uTexel: this.uTexel }, vertexShader: LINE_VERT, fragmentShader: LINE_FRAG, ...blend });
    this.fillMat = new THREE.ShaderMaterial({ uniforms: { uRect: this.uRect }, vertexShader: FILL_VERT, fragmentShader: FILL_FRAG, ...blend });
    this.cells = [];
    this.ready = false; this.hasStreets = false;
  }

  setLines(classes) {
    this.hasStreets = !!(classes.res && classes.res.types.length);
    const buckets = new Map();
    const put = (x0, z0, x1, z1, hw, ch) => {
      const key = Math.floor((x0 + x1) / 2 / CELL) + ',' + Math.floor((z0 + z1) / 2 / CELL);
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { seg: [], wc: [] }));
      b.seg.push(x0, z0, x1, z1); b.wc.push(hw, ch);
    };
    for (const name of Object.keys(CHANNEL)) {
      const c = classes[name]; if (!c) continue;
      const ch = CHANNEL[name];
      for (let k = 0; k < c.types.length; k++) {
        const hw = c.types[k] / 20; // el tipo es el ancho en decímetros
        for (let i = c.offsets[k]; i < c.offsets[k + 1] - 1; i++) {
          const x0 = c.coords[i * 2], z0 = c.coords[i * 2 + 1], x1 = c.coords[i * 2 + 2], z1 = c.coords[i * 2 + 3];
          const parts = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / MAX_SEG));
          for (let s = 0; s < parts; s++)
            put(x0 + ((x1 - x0) * s) / parts, z0 + ((z1 - z0) * s) / parts, x0 + ((x1 - x0) * (s + 1)) / parts, z0 + ((z1 - z0) * (s + 1)) / parts, hw, ch);
        }
      }
    }
    const quad = new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3);
    const index = new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 1, 3, 2]), 1);
    let segs = 0;
    for (const [key, b] of buckets) {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', quad); g.setIndex(index);
      g.setAttribute('iSeg', new THREE.InstancedBufferAttribute(new Float32Array(b.seg), 4));
      g.setAttribute('iWC', new THREE.InstancedBufferAttribute(new Float32Array(b.wc), 2));
      g.instanceCount = b.wc.length / 2; segs += g.instanceCount;
      const mesh = new THREE.Mesh(g, this.lineMat); mesh.frustumCulled = false;
      const [cx, cz] = key.split(',').map(Number);
      this.cells.push({ mesh, x0: cx * CELL, z0: cz * CELL });
      this.scene.add(mesh);
    }
    // Lagos y embalses: polígonos triangulados, todos en una sola malla.
    const lake = classes.lake, pos = [];
    for (let k = 0; lake && k < lake.types.length; k++) {
      const pts = [];
      for (let i = lake.offsets[k]; i < lake.offsets[k + 1]; i++) pts.push(new THREE.Vector2(lake.coords[i * 2], lake.coords[i * 2 + 1]));
      if (pts.length > 3 && pts[0].distanceToSquared(pts[pts.length - 1]) < 1) pts.pop();
      if (pts.length < 3) continue;
      for (const tri of THREE.ShapeUtils.triangulateShape(pts, [])) for (const i of tri) pos.push(pts[i].x, 0, pts[i].y);
    }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    const lm = new THREE.Mesh(lg, this.fillMat); lm.frustumCulled = false; this.scene.add(lm);
    this.ready = true;
    this.centers.forEach((c) => (c[0] = NaN));
    return segs;
  }

  // Re-rasteriza una cascada solo cuando la cámara se aleja 1/4 de su tamaño del centro actual.
  update(renderer, cam) {
    for (let i = 0; i < SIZES.length; i++) {
      const size = SIZES[i], snap = size / 4, c = this.centers[i];
      const cx = Math.round(cam.x / snap) * snap, cz = Math.round(cam.z / snap) * snap;
      if (this.ready && (cx !== c[0] || cz !== c[1])) {
        c[0] = cx; c[1] = cz;
        const half = size / 2, pad = MAX_SEG + 60;
        for (const cell of this.cells)
          cell.mesh.visible = cell.x0 < cx + half + pad && cell.x0 + CELL > cx - half - pad && cell.z0 < cz + half + pad && cell.z0 + CELL > cz - half - pad;
        this.uRect.value.set(cx, cz, half); this.uTexel.value = size / this.res;
        const prevTarget = renderer.getRenderTarget(), prevAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(this.targets[i]); renderer.setClearAlpha(0); renderer.clear();
        renderer.render(this.scene, this.camera);
        renderer.setRenderTarget(prevTarget); renderer.setClearAlpha(prevAlpha);
      }
      this.uniformValue[i].set(cam.x - (c[0] || 0), cam.z - (c[1] || 0), size);
    }
  }
}
