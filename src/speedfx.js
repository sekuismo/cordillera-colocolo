// Sensación de velocidad y de golpe. Tres piezas:
//   · Estelas de aire: motas quietas en el mundo (envueltas en una caja que viaja con la cámara) dibujadas como
//     trazos a lo largo de la velocidad. Mientras más rápido, más largas y más visibles.
//   · Desenfoque radial: después de dibujar la escena, se copia el cuadro a una textura y se vuelve a pintar el borde
//     de la pantalla estirado hacia el punto al que se viaja. El centro queda nítido; los costados se van en líneas.
//     Solo corre en Turbo e Híper (y en el estampido al entrar en ellos): a velocidad de caminata no cuesta nada.
//   · Polvo: partículas que saltan de las patas al correr, al resbalar por una ladera, al aterrizar y al rodar.
import * as THREE from 'three';
import { COMMON_VERT } from './shaders.js';

const BOX = 70;
const VERT = /* glsl */ `
${COMMON_VERT}
attribute float aEnd;
uniform vec3 uOff, uVel;
uniform float uStrength;
varying float vA;
void main() {
  vec3 p = (fract(position - uOff) - 0.5) * vec3(${BOX.toFixed(1)}, ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)});
  float sp = length(uVel);
  p -= uVel / max(sp, 1.0) * aEnd * clamp(sp * 0.09, 0.0, 26.0);
  float d = length(p);
  vA = uStrength * smoothstep(2.5, 8.0, d) * smoothstep(${(BOX / 2).toFixed(1)}, ${(BOX / 3).toFixed(1)}, d) * (1.0 - aEnd * 0.85);
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(p, 1.0));
}`;
const FRAG = /* glsl */ `
uniform vec3 uSunColor, uAmbient;
varying float vA;
void main() {
  gl_FragColor = vec4((uSunColor * 0.2 + uAmbient) * 1.5, vA * 0.5);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// El cuadro copiado ya viene con su color final (tone mapping y sRGB aplicados): este pase solo mueve píxeles.
const BLUR_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLUR_FRAG = /* glsl */ `
uniform sampler2D tMap;
uniform vec2 uCenter;
uniform float uAmt, uAspect;
varying vec2 vUv;
void main() {
  vec2 d = vUv - uCenter;
  float r = length(d * vec2(uAspect, 1.0));
  float m = smoothstep(0.1, 0.62, r) * uAmt;
  if (m < 0.006) discard;                         // el centro no se toca (ni se paga)
  float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453); // desfase por píxel: esconde los escalones
  vec3 c = vec3(0.0);
  for (int i = 0; i < TAPS; i++) c += texture2D(tMap, vUv - d * ((float(i) + j) / float(TAPS)) * m * 0.2).rgb;
  c /= float(TAPS);
  // en el borde, el rojo y el azul se separan apenas (aberración) y la imagen se oscurece un poco
  c.r = mix(c.r, texture2D(tMap, vUv - d * m * 0.215).r, 0.45);
  c.b = mix(c.b, texture2D(tMap, vUv - d * m * 0.165).b, 0.45);
  gl_FragColor = vec4(c * (1.0 - 0.3 * m * smoothstep(0.35, 0.95, r)), 1.0);
}`;

const DUST_VERT = /* glsl */ `
${COMMON_VERT}
attribute vec4 aData;   // edad 0..1 (≥1: muerta), tamaño en m, brillo, 0
uniform float uPx;
varying float vA, vT;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float k = aData.x;
  vA = k < 1.0 ? smoothstep(0.0, 0.08, k) * (1.0 - k) * (1.0 - k) : 0.0; vT = aData.z;
  gl_PointSize = clamp(uPx * aData.y * (0.5 + 1.6 * k) / max(-mv.z, 0.3), 1.0, 96.0);
  gl_Position = logDepth(projectionMatrix * mv);
}`;
const DUST_FRAG = /* glsl */ `
uniform vec3 uSunColor, uAmbient, uTint;
varying float vA, vT;
void main() {
  float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uTint * vT * (uSunColor * 0.5 + uAmbient * 1.1), a * 0.55);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const MAXD = 220;

export class SpeedFX {
  constructor(env, overlayEl, amount = 1, pxUniform = null) {
    const N = Math.round(900 * amount), seeds = new Float32Array(N * 6), ends = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { const s = Math.sin((i * 3 + k) * 127.1 + 311.7) * 43758.5453, r = s - Math.floor(s); seeds[i * 6 + k] = seeds[i * 6 + 3 + k] = r; ends[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seeds, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.uniforms = { uSunColor: env.uSunColor, uAmbient: env.uAmbient, uLogF: env.uLogF, uOff: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() }, uStrength: { value: 0 } };
    this.mesh = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 95; this.mesh.visible = false;
    this.el = overlayEl; this.k = 0;

    // --- desenfoque radial
    this.blurOn = true; this.blur = 0; this.fb = null; this._size = new THREE.Vector2(); this._v = new THREE.Vector3();
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAmt: { value: 0 }, uAspect: { value: 1 } },
      vertexShader: BLUR_VERT, fragmentShader: BLUR_FRAG, defines: { TAPS: amount >= 1 ? 10 : 6 }, depthTest: false, depthWrite: false, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMat); quad.frustumCulled = false;
    this.quadScene = new THREE.Scene(); this.quadScene.add(quad); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // --- polvo: un anillo de partículas que se reciclan; posiciones relativas a un origen que se va corriendo
    this.dPos = new Float32Array(MAXD * 3); this.dVel = new Float32Array(MAXD * 3); this.dData = new Float32Array(MAXD * 4); this.dLife = new Float32Array(MAXD);
    for (let i = 0; i < MAXD; i++) this.dData[i * 4] = 1;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(this.dPos, 3).setUsage(THREE.DynamicDrawUsage));
    dg.setAttribute('aData', new THREE.BufferAttribute(this.dData, 4).setUsage(THREE.DynamicDrawUsage));
    this.dustTint = new THREE.Vector3(0.5, 0.42, 0.32);
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: { uSunColor: env.uSunColor, uAmbient: env.uAmbient, uLogF: env.uLogF, uPx: pxUniform || { value: 800 }, uTint: { value: this.dustTint } },
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false,
    }));
    this.dust.frustumCulled = false; this.dust.renderOrder = 94; this.dust.visible = false;
    this.dNext = 0; this.dAlive = 0; this.dAcc = 0;
    this.group = new THREE.Group(); this.group.add(this.mesh, this.dust);
  }

  // rush: 0..1 (0 hasta Carrera, 1 en Híper a fondo). kick: 0..1, el golpe al entrar en velocidad de viaje.
  update(camera, vx, vy, vz, rush, dt, kick = 0) {
    this.k += (rush - this.k) * (1 - Math.exp(-dt * 3));
    const on = this.k > 0.02;
    this.mesh.visible = on;
    if (this.el && on !== this.shown) { this.shown = on; this.el.style.display = on ? 'block' : 'none'; }
    if (this.el && on) this.el.style.opacity = (this.k * 0.55).toFixed(3);
    // El desenfoque apunta al punto de la pantalla hacia el que se viaja; mirando de costado, casi no se aplica.
    const sp = Math.hypot(vx, vy, vz);
    let amt = 0;
    if (sp > 1) {
      const v = this._v.set(vx / sp, vy / sp, vz / sp).transformDirection(camera.matrixWorldInverse);
      const f = 1 / Math.tan((camera.fov * Math.PI) / 360), ahead = Math.max(0, -v.z);
      const z = Math.max(0.2, -v.z), cx = THREE.MathUtils.clamp(0.5 + (v.x / z) * (f / camera.aspect) * 0.5, -0.4, 1.4), cy = THREE.MathUtils.clamp(0.5 + (v.y / z) * f * 0.5, -0.4, 1.4);
      const c = this.blurMat.uniforms.uCenter.value; c.x += (cx - c.x) * (1 - Math.exp(-dt * 6)); c.y += (cy - c.y) * (1 - Math.exp(-dt * 6));
      amt = (this.k * 0.95 + kick * 0.9) * (0.35 + 0.65 * ahead);
    }
    this.blur = Math.min(1.5, amt); this.blurMat.uniforms.uAspect.value = camera.aspect;
    if (!on) return;
    const c = camera.position, fr = (v, b) => v / b - Math.floor(v / b);
    this.mesh.position.copy(c);
    this.uniforms.uOff.value.set(fr(c.x, BOX), fr(c.y, BOX / 2), fr(c.z, BOX));
    this.uniforms.uVel.value.set(vx, vy, vz);
    this.uniforms.uStrength.value = Math.min(1, this.k + kick * 0.5);
  }

  // Llamar justo después de dibujar la escena. Si el navegador no deja copiar el cuadro, se apaga solo.
  post(renderer) {
    if (!this.blurOn || this.blur < 0.03) return;
    try {
      const s = renderer.getDrawingBufferSize(this._size);
      if (!this.fb || this.fb.image.width !== s.x || this.fb.image.height !== s.y) {
        if (this.fb) this.fb.dispose();
        this.fb = new THREE.FramebufferTexture(s.x, s.y);
        this.fb.minFilter = this.fb.magFilter = THREE.LinearFilter; this.fb.generateMipmaps = false;
        this.blurMat.uniforms.tMap.value = this.fb;
      }
      renderer.copyFramebufferToTexture(this.fb);
      this.blurMat.uniforms.uAmt.value = this.blur;
      const ac = renderer.autoClear; renderer.autoClear = false;
      renderer.render(this.quadScene, this.quadCam);
      renderer.autoClear = ac;
    } catch (e) { this.blurOn = false; console.warn('[speedfx] sin desenfoque radial:', e); }
  }

  // n partículas en (x, y, z) con velocidad base (vx, vy, vz) y dispersión `spread` (m/s). size: metros; life: segundos.
  puff(n, x, y, z, vx, vy, vz, spread, size, life, bright = 1) {
    if (!this.dAlive) { this.dust.position.set(x, y, z); } // origen nuevo si no queda ninguna viva: mantiene la precisión
    const o = this.dust.position;
    for (let i = 0; i < n; i++) {
      const k = this.dNext; this.dNext = (k + 1) % MAXD;
      const a = Math.random() * 6.283, r = Math.random();
      this.dPos[k * 3] = x - o.x + Math.cos(a) * r * size; this.dPos[k * 3 + 1] = y - o.y + Math.random() * size * 0.5; this.dPos[k * 3 + 2] = z - o.z + Math.sin(a) * r * size;
      this.dVel[k * 3] = vx + Math.cos(a) * spread * r; this.dVel[k * 3 + 1] = vy + Math.random() * spread * 0.6; this.dVel[k * 3 + 2] = vz + Math.sin(a) * spread * r;
      this.dData[k * 4] = 0; this.dData[k * 4 + 1] = size * (0.6 + Math.random() * 0.8); this.dData[k * 4 + 2] = bright * (0.8 + Math.random() * 0.4);
      this.dLife[k] = life * (0.6 + Math.random() * 0.8);
    }
    this.dAlive = Math.max(this.dAlive, 1);
  }
  // Polvo continuo (correr, resbalar, rodar): `rate` partículas por segundo.
  trail(dt, rate, x, y, z, vx, vz, size, bright) {
    this.dAcc += rate * dt;
    const n = Math.min(8, this.dAcc | 0); this.dAcc -= n;
    if (n) this.puff(n, x, y, z, vx, 0.4, vz, 1.2 + size * 2, size, 0.9, bright);
  }
  updateDust(dt) {
    if (!this.dAlive) { this.dust.visible = false; return; }
    let alive = 0;
    const P = this.dPos, V = this.dVel, D = this.dData, drag = Math.exp(-dt * 2.2);
    for (let k = 0; k < MAXD; k++) {
      if (D[k * 4] >= 1) continue;
      D[k * 4] += dt / this.dLife[k];
      if (D[k * 4] >= 1) { D[k * 4] = 1; continue; }
      alive++;
      V[k * 3] *= drag; V[k * 3 + 1] = V[k * 3 + 1] * drag + 0.5 * dt; V[k * 3 + 2] *= drag; // se frena y flota hacia arriba
      P[k * 3] += V[k * 3] * dt; P[k * 3 + 1] += V[k * 3 + 1] * dt; P[k * 3 + 2] += V[k * 3 + 2] * dt;
    }
    this.dAlive = alive; this.dust.visible = alive > 0;
    this.dust.geometry.attributes.position.needsUpdate = true; this.dust.geometry.attributes.aData.needsUpdate = true;
  }
}
