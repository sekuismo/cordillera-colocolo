// Sol, cielo, niebla, estaciones y clima. Los uniforms se comparten entre todos los materiales.
import * as THREE from 'three';
import { SKY_VERT, SKY_FRAG, COMMON_VERT, ATMOS_GLSL } from './shaders.js';

export const FAR = 600000;
const LAT = (-33.5 * Math.PI) / 180;
const YEAR_SECONDS = 600; // un año completo cada 10 minutos cuando las estaciones avanzan solas

// Paleta por elevación solar (grados). Colores en RGB lineal.
const KEYS = [
  { e: -5, zen: [0.02, 0.035, 0.12], hor: [0.34, 0.2, 0.2], sun: [1.0, 0.4, 0.25], si: 0.25, amb: [0.15, 0.15, 0.24], fog: [0.2, 0.15, 0.18] },
  { e: -1, zen: [0.05, 0.09, 0.28], hor: [0.74, 0.36, 0.22], sun: [1.0, 0.36, 0.18], si: 1.2, amb: [0.2, 0.19, 0.3], fog: [0.5, 0.32, 0.3] },
  { e: 4, zen: [0.08, 0.16, 0.42], hor: [0.8, 0.54, 0.34], sun: [1.0, 0.56, 0.27], si: 2.5, amb: [0.26, 0.26, 0.37], fog: [0.72, 0.54, 0.42] },
  { e: 13, zen: [0.09, 0.22, 0.55], hor: [0.56, 0.62, 0.73], sun: [1.0, 0.85, 0.65], si: 3.0, amb: [0.32, 0.38, 0.52], fog: [0.62, 0.66, 0.74] },
  { e: 30, zen: [0.09, 0.24, 0.6], hor: [0.46, 0.62, 0.82], sun: [1.0, 0.95, 0.86], si: 3.3, amb: [0.34, 0.44, 0.62], fog: [0.56, 0.67, 0.82] },
];
export const SEASONS = ['Verano', 'Otoño', 'Invierno', 'Primavera'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const PRECIP_VERT = /* glsl */ `
${COMMON_VERT}
attribute float aEnd;
uniform vec3 uOff;      // fract(cámara / caja): mantiene las partículas ancladas al mundo
uniform float uTime, uAmount, uSnowing, uBox, uPx;
varying float vA;
void main() {
  vec3 s = position;
  float fall = mix(9.0, 1.3 + s.x * 0.9, uSnowing);
  vec3 p = vec3(s.x + sin(uTime * 0.7 + s.y * 40.0) * 0.02 * uSnowing + uTime * 0.035, s.y - uTime * fall / uBox, s.z + uTime * 0.02);
  p = fract(p - uOff) - 0.5;
  vec3 rel = p * uBox;
  rel.y += aEnd * mix(0.55, 0.0, uSnowing);          // la lluvia es un trazo corto; la nieve, un punto
  vec4 mv = modelViewMatrix * vec4(rel, 1.0);
  float d = length(rel);
  vA = step(fract(s.z * 91.7 + s.x * 13.3), uAmount) * smoothstep(uBox * 0.5, uBox * 0.3, d) * smoothstep(0.4, 1.4, d);
  gl_PointSize = clamp(uPx * (0.04 + s.y * 0.045) / max(-mv.z, 0.3), 1.5, 13.0);
  gl_Position = logDepth(projectionMatrix * mv);
}`;
const PRECIP_FRAG = /* glsl */ `
uniform vec3 uSunColor, uAmbient;
uniform float uSnowing;
varying float vA;
void main() {
  #ifdef POINTS
    vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.15, length(c));
  #else
    float a = 0.5;
  #endif
  vec3 col = mix(vec3(0.5, 0.56, 0.62), vec3(0.95), uSnowing) * (uSunColor * 0.25 + uAmbient * 1.2);
  gl_FragColor = vec4(col, a * vA * mix(0.4, 0.9, uSnowing));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Environment {
  constructor(noiseTex, amount = 1) {
    const v3 = () => ({ value: new THREE.Vector3() });
    this.uniforms = {
      uSunDir: v3(), uSunColor: v3(), uSkyZenith: v3(), uSkyHorizon: v3(), uAmbient: v3(), uFogColor: v3(),
      uFogDensity: { value: 2.4e-5 }, uTime: { value: 0 }, uLogF: { value: 2 / Math.log2(FAR + 1) },
      uSnowLine: { value: 4300 }, uStorm: { value: 0 }, uGreen: { value: 0 },
    };
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 16),
      new THREE.ShaderMaterial({ uniforms: { ...this.uniforms, uNoise: { value: noiseTex } }, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }),
    );
    this.sky.frustumCulled = false; this.sky.renderOrder = 100;

    // Precipitación: una caja de partículas que viaja con la cámara. Puntos para la nieve, trazos para la lluvia.
    const N = Math.round(9000 * amount), seeds = new Float32Array(N * 3), lineSeeds = new Float32Array(N * 6), ends = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { const r = hash(i * 3 + k + 0.5); seeds[i * 3 + k] = r; lineSeeds[i * 6 + k] = lineSeeds[i * 6 + 3 + k] = r; ends[i * 2 + 1] = 1; }
    const pu = { ...this.uniforms, uOff: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uSnowing: { value: 1 }, uBox: { value: 44 }, uPx: { value: 800 } };
    this.pu = pu;
    const mat = (points) => new THREE.ShaderMaterial({ uniforms: pu, vertexShader: PRECIP_VERT, fragmentShader: PRECIP_FRAG, transparent: true, depthWrite: false, defines: points ? { POINTS: 1 } : {} });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(seeds, 3)); pg.setAttribute('aEnd', new THREE.BufferAttribute(new Float32Array(N), 1));
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lineSeeds, 3)); lg.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.snow = new THREE.Points(pg, mat(true)); this.rain = new THREE.LineSegments(lg, mat(false));
    this.precip = new THREE.Group(); this.precip.add(this.snow, this.rain);
    for (const o of [this.snow, this.rain]) { o.frustumCulled = false; o.renderOrder = 90; o.visible = false; }

    this.hour = 9.5; this.year = 0.04; this.auto = true; this.storm = 0; this.stormOn = false;
    this.snowLine = 4300; this.iso0 = 4000; this.onSunChange = null; this._lastSun = new THREE.Vector3();
    this.refresh();
  }
  // year: 0 = 1 de enero (pleno verano austral), 0,5 = julio.
  get season() { return Math.floor(((this.year + 0.03) % 1) * 4) % 4; } // verano: 21 de diciembre a 20 de marzo
  get month() { return MONTHS[Math.floor(this.year * 12) % 12]; }
  get winter() { return 0.5 - 0.5 * Math.cos(2 * Math.PI * (this.year - 0.08)); } // 0..1, máximo a fines de julio–agosto
  setHour(h) { this.hour = h; this.refresh(); }
  setYear(y) { this.year = ((y % 1) + 1) % 1; this.snowLine = this.baseSnowLine(); this.refresh(); }
  // Línea de nieve "de fondo" de cada época: ~4.300 m a fines del verano, ~2.300 m en pleno invierno.
  baseSnowLine() { return 4300 - 2000 * this.winter; }
  temperature(alt) { // °C aproximados: ciclo anual + ciclo diario − 6,5 °C por cada 1.000 m (gradiente térmico)
    const day = Math.cos(((this.hour - 15) / 24) * 2 * Math.PI);
    return 17 + 8 * Math.cos(2 * Math.PI * (this.year - 0.04)) + 6 * day - 5 * this.storm - (6.5 * (alt - 550)) / 1000;
  }

  refresh() {
    const decl = (-23.44 * Math.cos(2 * Math.PI * this.year) * Math.PI) / 180; // en invierno el sol pasa mucho más bajo
    const H = ((this.hour - 12) * 15 * Math.PI) / 180;
    const up = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H);
    const north = Math.cos(LAT) * Math.sin(decl) - Math.sin(LAT) * Math.cos(decl) * Math.cos(H);
    const east = -Math.cos(decl) * Math.sin(H);
    const u = this.uniforms, st = this.storm;
    u.uSunDir.value.set(east, up, -north).normalize(); // mundo: +x este, +y arriba, −z norte
    const e = (Math.asin(up) * 180) / Math.PI;
    let i = 0; while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
    const a = KEYS[i], b = KEYS[i + 1], t = Math.min(1, Math.max(0, (e - a.e) / (b.e - a.e)));
    const mix = (x, y, s = 1) => [0, 1, 2].map((k) => (x[k] + (y[k] - x[k]) * t) * s);
    const si = (a.si + (b.si - a.si) * t) * (1 - 0.8 * st);
    const grey = (c, k) => { const g = (c[0] + c[1] + c[2]) / 3 * 0.8; return c.map((v) => v + (g - v) * k); }; // nublado: todo tiende al gris
    u.uSunColor.value.fromArray(mix(a.sun, b.sun, si));
    u.uSkyZenith.value.fromArray(grey(mix(a.zen, b.zen), st * 0.9).map((v) => v * (1 + st * 1.2)));
    u.uSkyHorizon.value.fromArray(grey(mix(a.hor, b.hor), st * 0.9));
    u.uAmbient.value.fromArray(grey(mix(a.amb, b.amb), st * 0.7).map((v) => v * (1 + st * 0.15)));
    u.uFogColor.value.fromArray(grey(mix(a.fog, b.fog), st * 0.9));
    u.uFogDensity.value = 2.4e-5 * (1 + st * 14);
    u.uStorm.value = st; u.uSnowLine.value = this.snowLine;
    u.uGreen.value = 0.5 - 0.5 * Math.cos(2 * Math.PI * (this.year - 0.22)); // el verde llega con las lluvias: máximo en septiembre
    this.elevation = e;
    if (this.onSunChange && this._lastSun.angleTo(u.uSunDir.value) > 0.012) { this._lastSun.copy(u.uSunDir.value); this.onSunChange(u.uSunDir.value); }
  }

  update(camera, time, dt = 0) {
    this.uniforms.uTime.value = time;
    this.sky.position.copy(camera.position); this.precip.position.copy(camera.position);
    if (dt > 0) {
      if (this.auto) this.year = (this.year + dt / YEAR_SECONDS) % 1;
      // Tormentas: ventanas de 25 s sorteadas con una probabilidad que sigue al invierno (en verano, ninguna).
      const w = this.winter, slot = Math.floor(time / 25), want = this.forceStorm ? true : hash(slot * 7.13 + Math.floor(this.year * 4)) < 0.62 * w * w;
      this.stormOn = want;
      if (this.forceStorm && w < 0.25) this.forceStorm = false; // en verano no hay frentes que forzar
      this.storm += ((want ? 1 : 0) - this.storm) * (1 - Math.exp(-dt * 0.45));
      // Isoterma cero de la tormenta: más baja mientras más invierno. La nieve cae hasta ~300 m bajo ella.
      this.iso0 = 3900 - 1750 * w + (hash(slot * 3.7) - 0.5) * 700;
      const fallLine = this.iso0 - 300, base = this.baseSnowLine();
      if (this.storm > 0.35) { if (fallLine < this.snowLine) this.snowLine += (fallLine - this.snowLine) * (1 - Math.exp(-dt * 0.5 * this.storm)); } // nieva: la línea baja
      else this.snowLine += (base - this.snowLine) * (1 - Math.exp(-dt * (base > this.snowLine ? 0.035 : 0.3))); // se derrite lento
      this.refresh();
      const snowing = camera.position.y > fallLine ? 1 : 0, amt = Math.max(0, (this.storm - 0.25) / 0.75);
      this.pu.uAmount.value = amt; this.pu.uSnowing.value = snowing;
      const fr = (v) => v / 44 - Math.floor(v / 44);
      this.pu.uOff.value.set(fr(camera.position.x), fr(camera.position.y), fr(camera.position.z));
      this.snow.visible = amt > 0 && snowing === 1; this.rain.visible = amt > 0 && snowing === 0;
      this.snowingHere = snowing === 1; this.fallLine = fallLine;
    }
  }
}
