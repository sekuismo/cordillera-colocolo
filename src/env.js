// Sol, cielo y niebla según la hora solar. Los uniforms se comparten entre todos los materiales.
import * as THREE from 'three';
import { SKY_VERT, SKY_FRAG } from './shaders.js';

export const FAR = 600000;
const LAT = (-33.5 * Math.PI) / 180, DECL = (-20 * Math.PI) / 180; // Santiago, verano austral

// Paleta por elevación solar (grados). Colores en RGB lineal.
const KEYS = [
  { e: -5, zen: [0.02, 0.035, 0.12], hor: [0.34, 0.2, 0.2], sun: [1.0, 0.4, 0.25], si: 0.25, amb: [0.1, 0.1, 0.17], fog: [0.2, 0.15, 0.18] },
  { e: -1, zen: [0.05, 0.09, 0.28], hor: [0.74, 0.36, 0.22], sun: [1.0, 0.36, 0.18], si: 1.2, amb: [0.2, 0.19, 0.3], fog: [0.5, 0.32, 0.3] },
  { e: 4, zen: [0.08, 0.16, 0.42], hor: [0.8, 0.54, 0.34], sun: [1.0, 0.56, 0.27], si: 2.5, amb: [0.26, 0.26, 0.37], fog: [0.72, 0.54, 0.42] },
  { e: 13, zen: [0.09, 0.22, 0.55], hor: [0.56, 0.62, 0.73], sun: [1.0, 0.85, 0.65], si: 3.0, amb: [0.32, 0.38, 0.52], fog: [0.62, 0.66, 0.74] },
  { e: 30, zen: [0.09, 0.24, 0.6], hor: [0.46, 0.62, 0.82], sun: [1.0, 0.95, 0.86], si: 3.3, amb: [0.34, 0.44, 0.62], fog: [0.56, 0.67, 0.82] },
];

export class Environment {
  constructor(noiseTex) {
    const v3 = () => ({ value: new THREE.Vector3() });
    this.uniforms = {
      uSunDir: v3(), uSunColor: v3(), uSkyZenith: v3(), uSkyHorizon: v3(), uAmbient: v3(), uFogColor: v3(),
      uFogDensity: { value: 2.4e-5 }, uTime: { value: 0 }, uLogF: { value: 2 / Math.log2(FAR + 1) },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({ uniforms: { ...this.uniforms, uNoise: { value: noiseTex } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
    );
    this.sky.frustumCulled = false; this.sky.renderOrder = 100;
    this.setHour(9.5);
  }
  setHour(hour) {
    this.hour = hour;
    const H = ((hour - 12) * 15 * Math.PI) / 180;
    const up = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H);
    const north = Math.cos(LAT) * Math.sin(DECL) - Math.sin(LAT) * Math.cos(DECL) * Math.cos(H);
    const east = -Math.cos(DECL) * Math.sin(H);
    const u = this.uniforms;
    u.uSunDir.value.set(east, up, -north).normalize(); // mundo: +x este, +y arriba, −z norte
    const e = (Math.asin(up) * 180) / Math.PI;
    let i = 0; while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
    const mix = (x, y, s = 1) => [0, 1, 2].map((k) => (x[k] + (y[k] - x[k]) * t) * s);
    const si = a.si + (b.si - a.si) * t;
    u.uSunColor.value.fromArray(mix(a.sun, b.sun, si));
    u.uSkyZenith.value.fromArray(mix(a.zen, b.zen));
    u.uSkyHorizon.value.fromArray(mix(a.hor, b.hor));
    u.uAmbient.value.fromArray(mix(a.amb, b.amb));
    u.uFogColor.value.fromArray(mix(a.fog, b.fog));
    this.elevation = e;
  }
  update(camera, time) {
    this.uniforms.uTime.value = time;
    this.sky.position.copy(camera.position);
  }
}
