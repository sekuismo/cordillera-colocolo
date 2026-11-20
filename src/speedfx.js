// Sensación de velocidad en Turbo e Híper: estelas de aire. Son motas quietas en el mundo (envueltas en una
// caja que viaja con la cámara) dibujadas como trazos a lo largo de la velocidad, igual que un desenfoque de
// movimiento: mientras más rápido, más largas y más visibles. A velocidad de caminata no se dibujan.
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
  p -= uVel / max(sp, 1.0) * aEnd * clamp(sp * 0.07, 0.0, 16.0);
  float d = length(p);
  vA = uStrength * smoothstep(2.5, 8.0, d) * smoothstep(${(BOX / 2).toFixed(1)}, ${(BOX / 3).toFixed(1)}, d) * (1.0 - aEnd * 0.85);
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(p, 1.0));
}`;
const FRAG = /* glsl */ `
uniform vec3 uSunColor, uAmbient;
varying float vA;
void main() {
  gl_FragColor = vec4((uSunColor * 0.2 + uAmbient) * 1.4, vA * 0.38);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class SpeedFX {
  constructor(env, overlayEl, amount = 1) {
    const N = Math.round(700 * amount), seeds = new Float32Array(N * 6), ends = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { const s = Math.sin((i * 3 + k) * 127.1 + 311.7) * 43758.5453, r = s - Math.floor(s); seeds[i * 6 + k] = seeds[i * 6 + 3 + k] = r; ends[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(seeds, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.uniforms = { uSunColor: env.uSunColor, uAmbient: env.uAmbient, uLogF: env.uLogF, uOff: { value: new THREE.Vector3() }, uVel: { value: new THREE.Vector3() }, uStrength: { value: 0 } };
    this.mesh = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 95; this.mesh.visible = false;
    this.el = overlayEl; this.k = 0;
  }
  // rush: 0..1 (0 hasta Carrera, 1 en Híper a fondo)
  update(camera, vx, vy, vz, rush, dt) {
    this.k += (rush - this.k) * (1 - Math.exp(-dt * 3));
    const on = this.k > 0.02;
    this.mesh.visible = on;
    if (this.el) { this.el.style.opacity = on ? (this.k * 0.9).toFixed(3) : '0'; }
    if (!on) return;
    const c = camera.position, fr = (v, b) => v / b - Math.floor(v / b);
    this.mesh.position.copy(c);
    this.uniforms.uOff.value.set(fr(c.x, BOX), fr(c.y, BOX / 2), fr(c.z, BOX));
    this.uniforms.uVel.value.set(vx, vy, vz);
    this.uniforms.uStrength.value = this.k;
  }
}
