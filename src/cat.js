// Gato colocolo (Leopardus colocola) procedural: tronco articulado, patas de tres tramos movidas por cinemática
// inversa y pelaje por shader. Sin assets externos. El puma (Puma concolor) sale del mismo esqueleto: más largo,
// de cola larga y pelaje leonado liso, sin bandas ni anillos.
import * as THREE from 'three';
import { COMMON_VERT } from './shaders.js';

export const CAT_SCALE = 1.0; // tamaño real: el modelo a escala 1 mide ~60 cm de cuerpo y ~35 cm a la cruz, como un colocolo

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
uniform float uPart, uSeg, uShade, uPuma;
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
  vec3 col = mix(BASE, vec3(0.30, 0.205, 0.11), uPuma); // puma: leonado parejo
  float fuzz = 1.0, pat = 1.0 - uPuma;                   // las marcas del colocolo se apagan en el puma
  if (uPart < 0.5) {            // tronco: bandas oblicuas, línea dorsal y vientre claro
    float wob = vnoise(vPos.zy * 38.0) * 1.6;
    float band = sin((vPos.z + vPos.y * 0.85) * 62.0 + wob * 2.2);
    float flank = smoothstep(0.25, 0.75, abs(n.x)) * smoothstep(-0.55, 0.0, n.y);
    col = mix(col, RUST, smoothstep(0.2, 0.75, band) * flank * 0.9 * pat);
    col = mix(col, RUST * 0.8, smoothstep(0.82, 0.97, n.y) * (0.75 - 0.5 * uPuma));
    col = mix(col, CREAM, smoothstep(-0.25, -0.75, n.y));
    col *= 0.86 + 0.28 * vnoise(vPos.zy * 150.0);
  } else if (uPart < 1.5) {     // patas: anillos oscuros bien marcados, típicos de la especie
    float ring = smoothstep(0.1, 0.6, sin(vPos.y * 118.0 + vnoise(vPos.xz * 60.0) * 1.5));
    col = mix(col, DARK, ring * 0.92 * pat);
    col = mix(col, CREAM, smoothstep(0.3, 0.9, -n.z) * 0.25);
  } else if (uPart < 2.5) {     // cola gruesa anillada con punta oscura
    float ring = smoothstep(0.0, 0.5, sin(uSeg * 3.14159 + vPos.z * 40.0));
    col = mix(col, mix(RUST, DARK, 0.55), ring * 0.85 * pat);
    col = mix(col, DARK, step(5.5, uSeg));
    col *= 0.86 + 0.28 * vnoise(vPos.xz * 150.0);
  } else if (uPart < 3.5) {     // cabeza: hocico claro, rayas en mejillas y frente
    float cheek = smoothstep(0.55, 0.9, sin(vPos.y * 150.0 + abs(vPos.x) * 60.0 + 1.0)) * smoothstep(0.35, 0.8, abs(n.x)) * step(vPos.z, 0.035);
    col = mix(col, RUST * 0.7, cheek * 0.85 * pat);
    float brow = smoothstep(0.5, 0.9, sin(vPos.x * 210.0)) * smoothstep(0.55, 0.9, n.y) * smoothstep(-0.02, 0.03, vPos.z);
    col = mix(col, RUST * 0.6, brow * 0.7 * pat);
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

// Anatomía. El tronco son dos tubos de sección elíptica (grupa y pecho) articulados en la cintura: así el lomo se
// arquea y se estira al galope. Las patas tienen tres tramos como las de un felino de verdad (digitígrado: camina
// sobre los dedos, con el talón en alto): muslo/brazo, pierna/antebrazo y metatarso. No se animan girando
// articulaciones con senos: cada pata persigue con cinemática inversa el punto donde debe ir su mano o su pie, y ese
// punto recorre el ciclo real del paso (apoyo: queda clavado en el suelo mientras el cuerpo avanza; vuelo: se
// levanta y se adelanta). Por eso las patas no patinan y el paso, el trote y el galope salen del mismo código.
const WALK = [0.25, 0.75, 0, 0.5], TROT = [0, 0.5, 0.5, 0], GALLOP = [0.5, 0.62, 0, 0.12]; // desfase de cada pata: del. izq., del. der., tras. izq., tras. der.

export class Cat {
  constructor(env, { puma = false, scale = CAT_SCALE } = {}) {
    this.root = new THREE.Group();
    this.scale = scale; this.root.scale.setScalar(scale);
    const P = puma ? 1 : 0, ZL = 1 + 0.14 * P, LL = 1 + 0.1 * P; // el puma: tronco más largo y patas más largas para su cuerpo
    this.bodyY = 0.3 + 0.03 * P;
    this.shade = { value: 1 }; // baja a 0 cuando el gato está a la sombra de un cerro
    const mat = (part, seg = 0) => new THREE.ShaderMaterial({
      uniforms: { uSunDir: env.uSunDir, uSunColor: env.uSunColor, uAmbient: env.uAmbient, uLogF: env.uLogF, uShade: this.shade, uPuma: { value: P }, uPart: { value: part }, uSeg: { value: seg } },
      vertexShader: VERT, fragmentShader: FRAG,
    });
    const M = [0, 1, 3, 4, 5, 6, 7].reduce((o, p) => ((o[p] = mat(p)), o), {}); // un material por parte (la cola usa uno por anillo)
    const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.frustumCulled = false; parent.add(o); return o; };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    // Tubo de sección elíptica a lo largo de Z. Estaciones: [z, semiancho, lomo (y), vientre (y)].
    const tube = (st, zs = 1) => {
      const N = 14, pos = [], idx = [];
      for (const [z, w, top, bot] of st) for (let j = 0; j < N; j++) {
        const a = (j / N) * Math.PI * 2, s = Math.sin(a);
        pos.push(w * Math.cos(a), (top + bot) / 2 + ((top - bot) / 2) * Math.sign(s) * Math.pow(Math.abs(s), 0.8), z * zs);
      }
      for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < N; j++) {
        const a = i * N + j, b = i * N + ((j + 1) % N);
        idx.push(a, b, a + N, b, b + N, a + N);
      }
      const n = st.length, c0 = pos.length / 3, c1 = c0 + 1, e = st[n - 1];
      pos.push(0, (st[0][2] + st[0][3]) / 2, st[0][0] * zs, 0, (e[2] + e[3]) / 2, e[0] * zs); // tapas
      for (let j = 0; j < N; j++) { idx.push(c0, (j + 1) % N, j, c1, (n - 1) * N + j, (n - 1) * N + ((j + 1) % N)); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals();
      return g;
    };
    const cyl = (r0, r1, len, sx = 1) => { const g = new THREE.CylinderGeometry(r0, r1, len, 8, 1); g.translate(0, -len / 2, 0); g.scale(sx, 1, 1); return g; };
    const ball = (r, sx = 1, sy = 1, sz = 1) => { const g = new THREE.SphereGeometry(r, 10, 8); g.scale(sx, sy, sz); return g; };

    const body = (this.body = grp(this.root, 0, this.bodyY, 0));
    const rear = (this.rear = grp(body)), front = (this.front = grp(body)); // las dos mitades giran en la cintura
    // Grupa alta y redonda, cintura recogida, pecho hondo: la silueta de un felino, no un cilindro.
    mesh(tube([[-0.25, 0.018, 0.05, 0.012], [-0.222, 0.058, 0.079, -0.044], [-0.15, 0.076, 0.091, -0.072], [-0.07, 0.07, 0.089, -0.065], [0, 0.068, 0.088, -0.063], [0.04, 0.066, 0.087, -0.063]], ZL), M[0], rear);
    mesh(tube([[-0.04, 0.066, 0.087, -0.063], [0, 0.068, 0.088, -0.065], [0.07, 0.076, 0.09, -0.081], [0.15, 0.08, 0.093, -0.09], [0.215, 0.066, 0.09, -0.072], [0.262, 0.042, 0.086, -0.03]], ZL), M[0], front);

    // Cuello (un tubo que sube hacia adelante) y cabeza.
    const neck = (this.neck = grp(front, 0, 0.03, 0.225 * ZL));
    const neckGeo = tube([[-0.04, 0.052, 0.056, -0.06], [0.03, 0.047, 0.05, -0.052], [0.09, 0.041, 0.044, -0.044], [0.125, 0.036, 0.04, -0.038]]);
    neckGeo.rotateX(-0.62); mesh(neckGeo, M[0], neck);
    const head = (this.head = grp(neck, 0, 0.078, 0.098));
    if (puma) head.scale.setScalar(0.9); // cabeza chica para su cuerpo, de orejas redondas
    mesh(ball(0.064, 1.08, 0.92, 1.0), M[3], head);
    mesh(ball(0.05, 0.9, 0.6, 0.9), M[3], head, 0, 0.022, 0.022); // frente
    if (!puma) for (const s of [-1, 1]) mesh(ball(0.036, 1, 0.85, 0.9), M[3], head, s * 0.045, -0.022, 0.012); // mejillas con pelo largo: la cara ancha del colocolo
    mesh(ball(0.032, 1.15, 0.8, 1), M[4], head, 0, -0.022, 0.05);  // hocico
    mesh(ball(0.02, 1.1, 0.7, 1), M[4], head, 0, -0.042, 0.036);   // mentón
    mesh(ball(0.009), M[7], head, 0, -0.01, 0.08);
    this.ears = [];
    for (const s of [-1, 1]) {
      const eg = new THREE.ConeGeometry(0.031 - 0.005 * P, 0.06 - 0.018 * P, 4 + 4 * P, 1); eg.rotateY(Math.PI / 4); eg.scale(1, 1, 0.5); eg.translate(0, 0.03, 0);
      const ear = mesh(eg, M[5], head, s * 0.042, 0.042, -0.006); ear.rotation.set(-0.12, 0, -s * 0.42);
      this.ears.push(ear);
      const eye = mesh(ball(0.0115), M[6], head, s * 0.027, 0.012, 0.054); eye.rotation.y = s * 0.35;
    }

    // Patas: cadera u hombro → rodilla o codo → talón o muñeca → dedos.
    const leg = (half, side, fr) => {
      const L1 = (fr ? 0.105 : 0.13) * LL, L2 = (fr ? 0.125 : 0.135) * LL, L3 = (fr ? 0.04 : 0.085) * LL, a3 = fr ? 0.1 : 0.45;
      const hy = fr ? -0.035 : -0.02, hz = (fr ? 0.165 : -0.155) * ZL;
      const hip = grp(half, side * (fr ? 0.05 : 0.056), hy, hz);
      mesh(ball(fr ? 0.042 : 0.052, 0.8, 1.15, 1.25), M[0], hip, 0, -0.012, 0); // paleta o anca: funde la pata con el tronco
      mesh(cyl(fr ? 0.036 : 0.047, fr ? 0.024 : 0.027, L1, 0.8), M[1], hip);
      const knee = grp(hip, 0, -L1, 0);
      mesh(ball(fr ? 0.025 : 0.028), M[1], knee);
      mesh(cyl(fr ? 0.023 : 0.025, fr ? 0.016 : 0.015, L2), M[1], knee);
      const foot = grp(knee, 0, -L2, 0);
      mesh(ball(0.017), M[1], foot);
      mesh(cyl(0.016, 0.014, L3), M[1], foot);
      const paw = mesh(ball(0.024, 1, 0.62, 1.4), M[1], foot, 0, -L3 + 0.006, 0.012); paw.rotation.x = a3; // la garra queda plana aunque el metatarso vaya inclinado
      return { hip, knee, foot, L1, L2, L3, a3, fr, hy, hz, rest: hz + (fr ? 0.012 : -0.03) };
    };
    // Orden: delantera izq., delantera der., trasera izq., trasera der.
    this.legs = [leg(front, 1, true), leg(front, -1, true), leg(rear, 1, false), leg(rear, -1, false)];

    // Cola: cadena de segmentos para que ondule.
    this.tail = [];
    let parent = grp(rear, 0, 0.036, -0.238 * ZL);
    const nTail = puma ? 9 : 7; // la del puma es larga y pareja, con la punta oscura; la del colocolo, corta, gruesa y anillada
    for (let i = 0; i < nTail; i++) {
      const r = puma ? 0.023 - i * 0.0005 : 0.031 - i * 0.0012, len = puma ? 0.066 : 0.05;
      const tg = new THREE.CapsuleGeometry(r, len, 4, 10); tg.rotateX(Math.PI / 2); tg.translate(0, 0, -len / 2);
      mesh(tg, mat(2, i === nTail - 1 ? 6 : Math.min(i, 5)), parent);
      this.tail.push(parent);
      parent = grp(parent, 0, 0, -len);
    }

    this.cycle = 0; this.gait = 0; this.speedSmooth = 0; this.air = 0; this.tuck = 0; this.lean = 0;
    this._up = new THREE.Vector3(0, 1, 0); this._m = new THREE.Matrix4();
    this._f = new THREE.Vector3(); this._r = new THREE.Vector3(); this._n = new THREE.Vector3();
  }

  // Cinemática inversa de una pata en su plano (y arriba, z adelante). (py, pz): dónde van los dedos respecto de la
  // cadera. El talón queda detrás y arriba de los dedos; cadera, rodilla y talón se resuelven con la ley de cosenos.
  // La rodilla trasera dobla hacia adelante y el codo hacia atrás. Si el punto queda fuera de alcance, la pata se estira.
  _ik(L, py, pz) {
    const ay = py + L.L3 * Math.cos(L.a3), az = pz - L.L3 * Math.sin(L.a3);
    const d = Math.max(1e-4, Math.hypot(ay, az)), dc = Math.min(L.L1 + L.L2 - 0.003, Math.max(Math.abs(L.L1 - L.L2) + 0.01, d));
    const th = Math.atan2(az, -ay), A = Math.acos((L.L1 * L.L1 + dc * dc - L.L2 * L.L2) / (2 * L.L1 * dc));
    const t1 = th + (L.fr ? -A : A), ky = -L.L1 * Math.cos(t1), kz = L.L1 * Math.sin(t1), s = dc / d;
    const t2 = Math.atan2(az * s - kz, -(ay * s - ky));
    L.hip.rotation.x = -t1; L.knee.rotation.x = t1 - t2; L.foot.rotation.x = t2 - L.a3;
  }

  // speed: m/s en el mundo; normal: normal del terreno; airborne: en salto; vy: velocidad vertical;
  // spin: giro del cuerpo (rad) al rodar o hacer un mortal; turn: rad/s de viraje; tuck: 0..1, encogido en una pirueta.
  update(dt, t, { x, y, z, heading, speed, normal, airborne, vy, spin = 0, turn = 0, tuck = 0 }) {
    const k = (r) => 1 - Math.exp(-dt * r);
    this.root.position.set(x, y, z);
    // Alinear con la pendiente (suavizado), manteniendo el rumbo.
    this._up.lerp(airborne ? this._n.set(0, 1, 0) : normal, k(9)).normalize();
    this._f.set(Math.sin(heading), 0, Math.cos(heading));
    this._r.crossVectors(this._up, this._f).normalize();
    this._f.crossVectors(this._r, this._up).normalize();
    this._m.makeBasis(this._r, this._up, this._f);
    this.root.quaternion.setFromRotationMatrix(this._m);

    this.speedSmooth += (speed - this.speedSmooth) * k(8);
    const v = this.speedSmooth / this.scale; // velocidad en "tamaños de gato"
    this.gait += ((v < 2.2 ? 0 : v < 5 ? 1 : 2) - this.gait) * k(6); // 0 = paso, 1 = trote, 2 = galope
    const g = this.gait, g1 = Math.min(g, 1), gal = Math.max(0, g - 1), moving = Math.min(1, v / 0.5);
    this.air += ((airborne ? 1 : 0) - this.air) * k(12); this.tuck += (tuck - this.tuck) * k(10);
    const air = this.air, tk = this.tuck;
    // Zancada (m por ciclo) y cadencia. A velocidad de viaje las patas ya no pueden ir más rápido: se alarga la zancada.
    const lambda = (0.42 + 0.2 * g1 + 0.63 * gal) * (1 + gal * Math.min(0.6, v / 25)), f = Math.min(4.4, v / lambda);
    this.cycle = (this.cycle + f * dt) % 1;
    const beta = 0.62 - 0.12 * g1 - 0.16 * gal;                         // fracción del ciclo con la pata apoyada
    const S = Math.min(0.4, (f > 0.05 ? v / f : lambda) * beta), lift = 0.035 + 0.015 * g1 + 0.035 * gal;
    const cyc = this.cycle * Math.PI * 2, breathe = Math.sin(t * 2.2) * 0.004 * (1 - moving);

    // Tronco: baja al correr, se mece al andar, y al galope el lomo se arquea y se estira una vez por ciclo.
    const bodyH = this.bodyY - 0.008 * g1 - 0.024 * gal + breathe + Math.sin(cyc * 2) * 0.005 * moving * (1 - gal) + Math.sin(cyc + 0.9) * 0.018 * gal * moving;
    const flex = 0.2 * Math.sin(cyc + 2.2) * gal * moving * (1 - air) + 0.1 * air * (1 - tk) - 0.42 * tk;
    this.lean += (THREE.MathUtils.clamp(-turn * 0.1 * Math.min(1, v / 2), -0.4, 0.4) - this.lean) * k(7);
    this.body.position.y = bodyH - (spin ? 0.1 * Math.abs(Math.sin(spin * 0.5)) : 0);
    this.body.rotation.x = Math.sin(cyc + 0.6) * 0.06 * gal * moving * (1 - air) - air * THREE.MathUtils.clamp(vy * 0.045, -0.5, 0.5) * (1 - tk) + spin;
    this.body.rotation.z = Math.sin(cyc) * 0.03 * moving * (1 - gal) + this.lean;
    this.rear.rotation.x = flex; this.front.rotation.x = -flex;

    for (let i = 0; i < 4; i++) {
      const L = this.legs[i];
      const off = g < 1 ? WALK[i] + (TROT[i] - WALK[i]) * g : TROT[i] + (GALLOP[i] - TROT[i]) * (g - 1);
      const ph = (this.cycle + off + 1) % 1;
      let fz, fy = 0;
      if (ph < beta) fz = S * (0.5 - ph / beta);                         // apoyo: el pie se queda atrás mientras el cuerpo pasa
      else { const u = (ph - beta) / (1 - beta); fz = S * (u * u * (3 - 2 * u) - 0.5); fy = lift * Math.sin(Math.PI * u); } // vuelo
      let pz = L.rest + fz * moving, py = -bodyH + fy * moving;
      if (air > 0.01) { // en el aire: manos adelante, patas estiradas atrás
        pz += (L.rest + (L.fr ? 0.11 : -0.13) - pz) * air; py += (-this.bodyY * (L.fr ? 0.7 : 0.8) - py) * air;
      }
      if (tk > 0.01) { pz += (L.hz + (L.fr ? -0.05 : 0.06) - pz) * tk; py += (-0.15 - py) * tk; } // encogido
      // Del espacio del cuerpo al de su mitad del tronco (que está girada en la cintura) y de ahí a la cadera.
      const r = L.fr ? -flex : flex, c = Math.cos(r), s = Math.sin(r);
      this._ik(L, py * c + pz * s - L.hy, -py * s + pz * c - L.hz);
    }

    // Cabeza: se mantiene nivelada aunque el lomo trabaje, mira hacia donde dobla y, quieto, otea.
    this.neck.rotation.x = flex * 0.8 + 0.08 * moving + 0.2 * gal * moving + Math.sin(t * 0.7) * 0.03 * (1 - moving) + 0.5 * tk;
    this.head.rotation.x = 0.12 - 0.1 * moving - 0.12 * gal;
    this.head.rotation.y = Math.sin(t * 0.43) * 0.5 * (1 - moving) * (Math.sin(t * 0.17) > 0.2 ? 1 : 0.15) + THREE.MathUtils.clamp(turn * 0.22, -0.55, 0.55) * moving;
    this.ears[0].rotation.x = this.ears[1].rotation.x = -0.12 - 0.35 * Math.min(1, v / 8) + Math.max(0, Math.sin(t * 3.1) - 0.97) * 6;
    // Cola: caída en reposo, estirada como balancín al correr, y se queda atrás en los virajes.
    const tl = 0.5 - 0.75 * moving + 0.35 * gal, sw = THREE.MathUtils.clamp(-turn * 0.07, -0.28, 0.28) * moving;
    this.tail.forEach((seg, i) => {
      seg.rotation.x = (i === 0 ? -0.5 : 0) + tl * (i === 0 ? 0.6 : 0.16) - Math.sin(cyc + i * 0.5) * 0.05 * gal + 0.25 * tk;
      seg.rotation.y = Math.sin(t * (1.6 + moving * 4) - i * 0.55) * (0.1 + 0.05 * i) * (1 - gal * 0.6) + sw;
    });
  }
}
