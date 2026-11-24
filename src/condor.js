// Cóndor andino (Vultur gryphus) procedural: cuerpo negro, collar blanco, cabeza pelada y las alas anchas con las
// primarias abiertas como dedos, que es como se lo reconoce en el cielo. En tierra camina con las alas plegadas;
// en el aire planea con las alas en V abierta y solo aletea para subir. Misma interfaz que Cat (root, shade, update).
import * as THREE from 'three';
import { COMMON_VERT } from './shaders.js';

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
uniform float uPart, uShade;
varying vec3 vPos, vNrm, vViewPos, vViewNrm;
const vec3 BLACK = vec3(0.02, 0.02, 0.024), WHITE = vec3(0.62, 0.62, 0.60);
void main() {
  vec3 n = normalize(vNrm), col = BLACK;
  float sheen = 1.0;
  if (uPart > 0.5 && uPart < 1.5) col = mix(BLACK, WHITE, step(0.0, n.y) * smoothstep(-0.02, -0.1, vPos.z)); // secundarias blancas, solo por arriba
  else if (uPart < 2.5 && uPart > 1.5) col = WHITE;                                 // collar de plumón
  else if (uPart < 3.5 && uPart > 2.5) { col = vec3(0.27, 0.17, 0.16); sheen = 0.0; } // cabeza y cuello pelados
  else if (uPart < 4.5 && uPart > 3.5) { col = vec3(0.50, 0.46, 0.35); sheen = 0.0; } // pico color marfil
  else if (uPart > 4.5) { col = vec3(0.17, 0.165, 0.16); sheen = 0.0; }              // patas grises
  vec3 N = normalize(vViewNrm), V = normalize(-vViewPos);
  if (!gl_FrontFacing) N = -N;
  vec3 L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ndl = dot(N, L), wrap = clamp(ndl * 0.6 + 0.4, 0.0, 1.0);
  vec3 up = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
  vec3 light = uSunColor * wrap * wrap * 0.85 * uShade + uAmbient * (0.6 + 0.4 * dot(N, up));
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  // El plumaje negro no es mate: con el sol encima devuelve un brillo azulado.
  vec3 c = col * light + sheen * (rim * 0.05 + pow(max(dot(reflect(-L, N), V), 0.0), 18.0) * 0.06) * (uSunColor * uShade + uAmbient);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Condor {
  constructor(env, { scale = 1.0 } = {}) {
    this.root = new THREE.Group(); this.scale = scale; this.root.scale.setScalar(scale);
    this.shade = { value: 1 };
    const mat = (part) => new THREE.ShaderMaterial({
      uniforms: { uSunDir: env.uSunDir, uSunColor: env.uSunColor, uAmbient: env.uAmbient, uLogF: env.uLogF, uShade: this.shade, uPart: { value: part } },
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    });
    const M = [0, 1, 2, 3, 4, 5].map(mat); // un material por parte: comparten programa
    const mesh = (geo, part, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, M[part]); o.position.set(x, y, z); o.frustumCulled = false; parent.add(o); return o; };
    const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
    // Lámina de pluma: va desde el origen hacia ±x (s), con la cuerda sobre z y el borde de ataque adelante.
    const plate = (s, len, chord, taper, th = 0.022) => {
      const g = new THREE.BoxGeometry(len, th, chord, 2, 1, 1); g.translate((s * len) / 2, 0, -chord * 0.3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = Math.abs(p.getX(i)) / len; p.setZ(i, p.getZ(i) * (1 + (taper - 1) * k)); }
      g.computeVertexNormals(); return g;
    };

    const body = (this.body = grp(this.root, 0, 0.3, 0));
    const bg = new THREE.SphereGeometry(1, 16, 12); bg.scale(0.17, 0.155, 0.36);
    mesh(bg, 0, body);
    // Cola: abanico corto y ancho.
    const tg = new THREE.BoxGeometry(0.26, 0.02, 0.34, 1, 1, 2); tg.translate(0, 0, -0.17);
    { const p = tg.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 + 0.7 * (-p.getZ(i) / 0.34))); tg.computeVertexNormals(); }
    this.tail = mesh(tg, 0, body, 0, 0.01, -0.3);

    // Cuello, collar y cabeza.
    const neck = (this.neck = grp(body, 0, 0.03, 0.28));
    const rg = new THREE.SphereGeometry(0.095, 12, 8); rg.scale(1, 0.8, 0.7);
    mesh(rg, 2, neck);
    const ng = new THREE.CapsuleGeometry(0.04, 0.12, 4, 8); ng.rotateX(Math.PI / 2 - 0.25); ng.translate(0, 0.03, 0.1);
    mesh(ng, 3, neck);
    const head = (this.head = grp(neck, 0, 0.06, 0.2));
    const hg = new THREE.SphereGeometry(0.052, 12, 10); hg.scale(0.9, 0.95, 1.15);
    mesh(hg, 3, head);
    const kg = new THREE.ConeGeometry(0.024, 0.085, 6); kg.rotateX(Math.PI / 2 + 0.35); kg.translate(0, -0.012, 0.085);
    mesh(kg, 4, head);
    mesh(new THREE.BoxGeometry(0.012, 0.03, 0.06), 3, head, 0, 0.055, 0.02); // cresta (carúncula) del macho

    // Alas: brazo → mano → primarias. Cada ala cuelga de su hombro; los ángulos los pone update().
    this.wings = [];
    for (const s of [1, -1]) {
      const shoulder = grp(body, s * 0.11, 0.05, 0.1);
      mesh(plate(s, 0.62, 0.46, 0.92), 1, shoulder);
      const elbow = grp(shoulder, s * 0.6, 0, 0);
      mesh(plate(s, 0.5, 0.42, 0.78), 0, elbow);
      const hand = grp(elbow, s * 0.48, 0, -0.02);
      const fingers = [];
      for (let i = 0; i < 7; i++) {
        const fg = plate(s, 0.4 - i * 0.022, 0.085, 0.55, 0.012);
        const f = mesh(fg, 0, hand, 0, 0, 0.1 - i * 0.055);
        f.userData.a = -0.1 + i * 0.15; fingers.push(f);
      }
      this.wings.push({ s, shoulder, elbow, fingers });
    }
    // Patas: cuelgan en tierra, se recogen bajo la cola en vuelo.
    this.legs = [];
    for (const s of [1, -1]) {
      const hip = grp(body, s * 0.07, -0.09, -0.06);
      const lg = new THREE.CapsuleGeometry(0.022, 0.2, 3, 6); lg.translate(0, -0.12, 0);
      mesh(lg, 5, hip);
      const fg = new THREE.SphereGeometry(0.04, 8, 6); fg.scale(1, 0.4, 1.6);
      mesh(fg, 5, hip, 0, -0.245, 0.03);
      this.legs.push(hip);
    }
    this.air = 0; this.flap = 0; this.phase = 0; this.step = 0; this.bank = 0; this.pitch = 0; this.speedSmooth = 0;
    this._up = new THREE.Vector3(0, 1, 0); this._n = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._id = new THREE.Quaternion(); this._e = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  // Igual que Cat.update, más flap (0..1: cuánto aletea) y turn (rad/s: para ladearse en los virajes).
  update(dt, t, { x, y, z, heading, speed, normal, airborne, vy, flap = 0, turn = 0, spin = 0 }) {
    const k = (r) => 1 - Math.exp(-dt * r);
    this.air += ((airborne ? 1 : 0) - this.air) * k(5);
    this.flap += (flap - this.flap) * k(6);
    this.speedSmooth += (speed - this.speedSmooth) * k(8);
    const air = this.air, gnd = 1 - air, a = this.flap;
    this.phase = (this.phase + dt * Math.PI * 2 * (2.1 + 0.5 * a)) % (Math.PI * 2);
    const ph = this.phase, moving = Math.min(1, this.speedSmooth / 1.2) * gnd;
    this.step = (this.step + dt * Math.min(9, 3 + this.speedSmooth * 2.2) * moving) % (Math.PI * 2);

    // Actitud: en tierra sigue la pendiente a medias; en el aire cabecea con la subida y se ladea en los virajes.
    this.bank += (THREE.MathUtils.clamp(-turn * 0.55, -0.95, 0.95) * air - this.bank) * k(3.5);
    this.pitch += (THREE.MathUtils.clamp(-Math.atan2(vy, Math.max(6, speed)) * 0.8, -0.7, 0.8) * air - this.pitch) * k(4);
    this.root.position.set(x, y, z);
    this.root.quaternion.setFromEuler(this._e.set(this.pitch, heading, this.bank));
    if (gnd > 0.01) { // inclinación del suelo, atenuada
      this._up.lerp(airborne ? this._n.set(0, 1, 0) : normal, k(8)).normalize();
      this._q.setFromUnitVectors(this._n.set(0, 1, 0), this._up);
      this.root.quaternion.premultiply(this._q.slerp(this._id, 1 - gnd * 0.6));
    }

    // Cuerpo: erguido en tierra (cabeza arriba), horizontal en vuelo; el cuello compensa para mirar al frente.
    const up = 0.78 * gnd;
    this.body.rotation.x = -up + Math.sin(this.step * 2) * 0.03 * moving + spin;
    this.body.rotation.z = Math.sin(this.step) * 0.07 * moving;
    this.body.position.y = 0.3 * gnd + 0.05 + Math.abs(Math.sin(this.step)) * 0.012 * moving - Math.sin(ph) * 0.05 * a * air;
    this.neck.rotation.x = up * 0.75 + 0.1 * air + Math.sin(t * 0.6) * 0.03;
    this.head.rotation.y = Math.sin(t * 0.37) * 0.5 * (Math.sin(t * 0.13) > 0.3 ? 1 : 0.2);
    this.head.rotation.x = 0.15 * air;
    this.tail.rotation.x = 0.25 * gnd - this.pitch * 0.3;
    this.legs.forEach((hip, i) => { hip.rotation.x = up * gnd + 1.35 * air + Math.sin(this.step + i * Math.PI) * 0.5 * moving; });

    // Alas. Plegadas: el brazo se va hacia atrás y la mano vuelve hacia adelante (una Z), pegadas al flanco.
    // Abiertas: diedro suave y batido lento, con la mano retrasada respecto del brazo, que es lo que da el latigazo.
    const fold = gnd;
    for (const w of this.wings) {
      const s = w.s, beat = Math.sin(ph) * a, lag = Math.sin(ph - 0.95) * a;
      w.shoulder.rotation.set(0.2 * fold, s * 1.42 * fold, s * ((0.1 + beat * 0.62) * air - 0.3 * fold));
      w.elbow.rotation.set(0, -s * 2.7 * fold, s * (0.07 + lag * 0.5) * air);
      const spread = 0.35 + 0.65 * air;
      for (const f of w.fingers) { f.rotation.y = s * f.userData.a * spread; f.rotation.z = s * (0.05 + 0.1 * f.userData.a + lag * 0.2) * air; f.scale.x = 0.3 + 0.7 * air; }
    }
  }
}
