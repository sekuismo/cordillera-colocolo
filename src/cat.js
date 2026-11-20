// Gato colocolo (Leopardus colocola) procedural: geometría por primitivas, pelaje por shader y
// animación de marcha/trote/galope calculada a partir de la distancia recorrida. Sin assets externos.
import * as THREE from 'three';
import { COMMON_VERT } from './shaders.js';

export const CAT_SCALE = 1.5; // un colocolo real mide ~65 cm de cuerpo; se agranda un poco para que se lea en pantalla

const VERT = /* glsl */ `
${COMMON_VERT}
varying vec3 vPos, vNrm, vViewPos, vViewNrm;
void main() {
  vPos = position; vNrm = normal;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz; vViewNrm = normalMatrix * normal;
  gl_Position = logDepth(projectionMatrix * mv);
}`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir, uSunColor, uAmbient;
uniform float uPart, uSeg, uShade;
varying vec3 vPos, vNrm, vViewPos, vViewNrm;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
const vec3 BASE = vec3(0.215, 0.165, 0.10);   // gris ocráceo
const vec3 RUST = vec3(0.115, 0.038, 0.012); // bandas café rojizas de los flancos
const vec3 CREAM = vec3(0.36, 0.31, 0.225);  // vientre y hocico
const vec3 DARK = vec3(0.016, 0.01, 0.007); // anillos de patas y cola

void main() {
  vec3 n = normalize(vNrm);
  vec3 col = BASE;
  float fuzz = 1.0;
  if (uPart < 0.5) {            // tronco: bandas oblicuas, línea dorsal y vientre claro
    float wob = vnoise(vPos.zy * 38.0) * 1.6;
    float band = sin((vPos.z + vPos.y * 0.85) * 62.0 + wob * 2.2);
    float flank = smoothstep(0.25, 0.75, abs(n.x)) * smoothstep(-0.55, 0.0, n.y);
    col = mix(col, RUST, smoothstep(0.2, 0.75, band) * flank * 0.9);
    col = mix(col, RUST * 0.8, smoothstep(0.82, 0.97, n.y) * 0.75);
    col = mix(col, CREAM, smoothstep(-0.25, -0.75, n.y));
    col *= 0.86 + 0.28 * vnoise(vPos.zy * 150.0);
  } else if (uPart < 1.5) {     // patas: anillos oscuros bien marcados, típicos de la especie
    float ring = smoothstep(0.1, 0.6, sin(vPos.y * 118.0 + vnoise(vPos.xz * 60.0) * 1.5));
    col = mix(col, DARK, ring * 0.92);
    col = mix(col, CREAM, smoothstep(0.3, 0.9, -n.z) * 0.25);
  } else if (uPart < 2.5) {     // cola gruesa anillada con punta oscura
    float ring = smoothstep(0.0, 0.5, sin(uSeg * 3.14159 + vPos.z * 40.0));
    col = mix(col, mix(RUST, DARK, 0.55), ring * 0.85);
    col = mix(col, DARK, step(5.5, uSeg));
    col *= 0.86 + 0.28 * vnoise(vPos.xz * 150.0);
  } else if (uPart < 3.5) {     // cabeza: hocico claro, rayas en mejillas y frente
    float cheek = smoothstep(0.55, 0.9, sin(vPos.y * 150.0 + abs(vPos.x) * 60.0 + 1.0)) * smoothstep(0.35, 0.8, abs(n.x)) * step(vPos.z, 0.035);
    col = mix(col, RUST * 0.7, cheek * 0.85);
    float brow = smoothstep(0.5, 0.9, sin(vPos.x * 210.0)) * smoothstep(0.55, 0.9, n.y) * smoothstep(-0.02, 0.03, vPos.z);
    col = mix(col, RUST * 0.6, brow * 0.7);
    col = mix(col, CREAM, smoothstep(-0.1, -0.6, n.y) * 0.8);
  } else if (uPart < 4.5) {     // hocico y mentón
    col = CREAM * 1.12;
  } else if (uPart < 5.5) {     // orejas: dorso oscuro, interior rosado
    col = mix(DARK * 1.6, vec3(0.26, 0.15, 0.12), smoothstep(0.1, 0.6, n.z));
  } else if (uPart < 6.5) {     // ojos ámbar
    float pupil = smoothstep(0.0045, 0.0025, length(vPos.xy * vec2(2.4, 1.0)));
    col = mix(vec3(0.34, 0.21, 0.03), vec3(0.004), pupil); fuzz = 0.0;
  } else { col = vec3(0.10, 0.04, 0.035); fuzz = 0.0; } // nariz

  vec3 N = normalize(vViewNrm), V = normalize(-vViewPos);
  vec3 L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ndl = dot(N, L);
  float wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);          // difuso envolvente: el pelaje no corta en seco
  vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  vec3 light = uSunColor * wrap * wrap * 0.85 * uShade + uAmbient * (0.6 + 0.4 * dot(N, up));
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 c = col * light + rim * fuzz * (uSunColor * max(ndl + 0.5, 0.0) * 0.07 + uAmbient * 0.1);
  if (fuzz < 0.5) c += uSunColor * pow(max(dot(reflect(-L, N), V), 0.0), 60.0) * 0.5;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Cat {
  constructor(env) {
    this.root = new THREE.Group();
    this.root.scale.setScalar(CAT_SCALE);
    this.shade = { value: 1 }; // baja a 0 cuando el gato está a la sombra de un cerro
    const mat = (part, seg = 0) => new THREE.ShaderMaterial({
      uniforms: { uSunDir: env.uSunDir, uSunColor: env.uSunColor, uAmbient: env.uAmbient, uLogF: env.uLogF, uShade: this.shade, uPart: { value: part }, uSeg: { value: seg } },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.frustumCulled = false; parent.add(o); return o; };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    const body = (this.body = grp(this.root, 0, 0.3, 0));
    // Tronco: perfil torneado (grupa → cintura → pecho) acostado sobre el eje Z.
    const profile = [[0, -0.235], [0.045, -0.228], [0.074, -0.19], [0.086, -0.12], [0.082, -0.02], [0.088, 0.08], [0.09, 0.15], [0.076, 0.2], [0.05, 0.228], [0, 0.236]];
    const torsoGeo = new THREE.LatheGeometry(profile.map(([r, t]) => new THREE.Vector2(r, t)), 20);
    torsoGeo.rotateX(Math.PI / 2); torsoGeo.scale(0.9, 1.04, 1); torsoGeo.computeVertexNormals();
    this.torso = mesh(torsoGeo, mat(0), body);

    // Cuello y cabeza.
    const neck = (this.neck = grp(body, 0, 0.035, 0.19));
    const neckGeo = new THREE.CapsuleGeometry(0.052, 0.07, 6, 12); neckGeo.rotateX(Math.PI / 2 - 0.75); neckGeo.translate(0, 0.03, 0.035);
    mesh(neckGeo, mat(0), neck);
    const head = (this.head = grp(neck, 0, 0.075, 0.085));
    const headGeo = new THREE.SphereGeometry(0.064, 20, 14); headGeo.scale(1.08, 0.92, 1.0);
    mesh(headGeo, mat(3), head);
    for (const s of [-1, 1]) { // mejillas con pelo largo: la cara ancha del colocolo
      const cg = new THREE.SphereGeometry(0.036, 12, 10); cg.scale(1, 0.85, 0.9);
      mesh(cg, mat(3), head, s * 0.045, -0.022, 0.012);
    }
    const muzzleGeo = new THREE.SphereGeometry(0.032, 14, 10); muzzleGeo.scale(1.15, 0.8, 1);
    mesh(muzzleGeo, mat(4), head, 0, -0.022, 0.05);
    mesh(new THREE.SphereGeometry(0.009, 8, 6), mat(7), head, 0, -0.01, 0.08);
    this.ears = [];
    for (const s of [-1, 1]) {
      const eg = new THREE.ConeGeometry(0.03, 0.055, 4, 1); eg.rotateY(Math.PI / 4); eg.scale(1, 1, 0.5); eg.translate(0, 0.0275, 0);
      const ear = mesh(eg, mat(5), head, s * 0.042, 0.042, -0.006); ear.rotation.set(-0.12, 0, -s * 0.42);
      this.ears.push(ear);
      const eye = mesh(new THREE.SphereGeometry(0.0115, 10, 8), mat(6), head, s * 0.027, 0.012, 0.054);
      eye.rotation.y = s * 0.35;
    }

    // Patas: cadera/hombro → rodilla → pata.
    const leg = (x, z, l, front) => {
      const hip = grp(body, x, -0.045, z);
      const ug = new THREE.CapsuleGeometry(front ? 0.027 : 0.033, l - 0.03, 5, 10); ug.translate(0, -l / 2, 0);
      mesh(ug, mat(1), hip);
      const knee = grp(hip, 0, -l, 0);
      const lg = new THREE.CapsuleGeometry(0.02, l - 0.03, 5, 10); lg.translate(0, -l / 2, 0);
      mesh(lg, mat(1), knee);
      const pg = new THREE.SphereGeometry(0.026, 10, 8); pg.scale(1, 0.7, 1.35);
      mesh(pg, mat(1), knee, 0, -l + 0.004, 0.012);
      return { hip, knee, front, rest: front ? [-0.12, 0.24] : [0.45, -0.9] };
    };
    // Orden: delantera izq., delantera der., trasera izq., trasera der.
    this.legs = [leg(0.052, 0.155, 0.125, true), leg(-0.052, 0.155, 0.125, true), leg(0.058, -0.15, 0.14, false), leg(-0.058, -0.15, 0.14, false)];

    // Cola: cadena de segmentos para que ondule.
    this.tail = [];
    let parent = grp(body, 0, 0.03, -0.215);
    for (let i = 0; i < 7; i++) {
      const r = 0.031 - i * 0.0012, len = 0.05;
      const tg = new THREE.CapsuleGeometry(r, len, 4, 10); tg.rotateX(Math.PI / 2); tg.translate(0, 0, -len / 2);
      mesh(tg, mat(2, i), parent);
      this.tail.push(parent);
      parent = grp(parent, 0, 0, -len);
    }

    this.phase = 0; this.gait = 0; this.speedSmooth = 0; this.air = 0;
    this._up = new THREE.Vector3(0, 1, 0); this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4();
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); this._n = new THREE.Vector3();
  }

  // speed: m/s en el mundo; normal: normal del terreno; airborne: en salto; vy: velocidad vertical.
  update(dt, t, { x, y, z, heading, speed, normal, airborne, vy }) {
    this.root.position.set(x, y, z);
    // Alinear con la pendiente (suavizado), manteniendo el rumbo.
    this._up.lerp(airborne ? this._n.set(0, 1, 0) : normal, 1 - Math.exp(-dt * 9)).normalize();
    this._f.set(Math.sin(heading), 0, Math.cos(heading));
    this._r.crossVectors(this._up, this._f).normalize();
    this._f.crossVectors(this._r, this._up).normalize();
    this._m.makeBasis(this._r, this._up, this._f);
    this.root.quaternion.setFromRotationMatrix(this._m);

    this.speedSmooth += (speed - this.speedSmooth) * (1 - Math.exp(-dt * 8));
    const v = this.speedSmooth / CAT_SCALE; // velocidad en "tamaños de gato"
    // 0 = paso, 1 = trote, 2 = galope
    const gaitTarget = v < 0.15 ? 0 : v < 2.2 ? 0 : v < 5 ? 1 : 2;
    this.gait += (gaitTarget - this.gait) * (1 - Math.exp(-dt * 6));
    const g = this.gait, moving = Math.min(1, v / 0.6);
    const stride = (0.34 + 0.3 * Math.min(g, 1) + 0.75 * Math.max(0, g - 1)) * (1 + Math.min(0.5, v / 30));
    const cadence = Math.min(4.2, v / stride); // ciclos/s; a velocidad turbo las patas ya no pueden ir más rápido
    this.phase = (this.phase + cadence * dt * Math.PI * 2) % (Math.PI * 2);
    const ph = this.phase;
    this.air += ((airborne ? 1 : 0) - this.air) * (1 - Math.exp(-dt * 12));

    // Desfase de cada pata según el aire: paso lateral → trote diagonal → galope.
    const walk = [Math.PI * 0.5, Math.PI * 1.5, 0, Math.PI], trot = [0, Math.PI, Math.PI, 0], gallop = [Math.PI, Math.PI * 1.22, 0, Math.PI * 0.22];
    const amp = (0.34 + 0.2 * Math.min(g, 1) + 0.38 * Math.max(0, g - 1)) * moving;
    this.legs.forEach((L, i) => {
      const a = g < 1 ? walk[i] + (trot[i] - walk[i]) * g : trot[i] + (gallop[i] - trot[i]) * (g - 1);
      const s = Math.sin(ph + a), c = Math.cos(ph + a);
      let hip = L.rest[0] + s * amp * (L.front ? 1 : 0.9);
      let knee = L.rest[1] + Math.max(0, c) * (L.front ? 0.9 : -0.8) * amp * 1.5; // recoge la pata al avanzar
      if (this.air > 0.01) { // en el aire: delanteras adelante, traseras estiradas atrás
        hip += ((L.front ? -0.95 : 0.9) - hip) * this.air; knee += ((L.front ? 0.5 : -0.35) - knee) * this.air;
      }
      L.hip.rotation.x = hip; L.knee.rotation.x = knee;
    });

    const gal = Math.max(0, g - 1), breathe = Math.sin(t * 2.2) * 0.004 * (1 - moving);
    this.body.position.y = 0.3 + breathe + Math.abs(Math.sin(ph)) * 0.012 * moving * (1 + gal * 2.2);
    this.body.rotation.x = Math.sin(ph + 0.6) * 0.1 * gal * moving - this.air * THREE.MathUtils.clamp(vy * 0.045, -0.5, 0.5);
    this.body.rotation.z = Math.sin(ph) * 0.03 * moving * (1 - gal);
    this.torso.scale.set(1, 1 + breathe * 6, 1 + gal * 0.06 * Math.sin(ph * 1 + 1.2) * moving);
    this.neck.rotation.x = -this.body.rotation.x * 0.7 + 0.1 * moving + Math.sin(t * 0.7) * 0.03 * (1 - moving);
    this.head.rotation.x = 0.12 - 0.1 * moving;
    this.head.rotation.y = Math.sin(t * 0.43) * 0.5 * (1 - moving) * (Math.sin(t * 0.17) > 0.2 ? 1 : 0.15);
    this.ears[0].rotation.x = this.ears[1].rotation.x = -0.12 - 0.35 * Math.min(1, v / 8) + Math.max(0, Math.sin(t * 3.1) - 0.97) * 6;
    const lift = 0.5 - 0.75 * moving + 0.35 * gal; // en reposo cae; corriendo va estirada
    this.tail.forEach((seg, i) => {
      seg.rotation.x = (i === 0 ? -0.5 : 0) + lift * (i === 0 ? 0.6 : 0.16) - Math.sin(ph + i * 0.5) * 0.05 * gal;
      seg.rotation.y = Math.sin(t * (1.6 + moving * 4) - i * 0.55) * (0.1 + 0.05 * i) * (1 - gal * 0.6);
    });
  }
}
