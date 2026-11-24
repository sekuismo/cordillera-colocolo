// Movimiento del animal y cámara (tercera persona con mirada libre tipo FPS, o primera persona).
// Los felinos corren y saltan; el cóndor, además, vuela: despega saltando, sube aleteando y planea solo.
import * as THREE from 'three';
import { ANIMALS } from './animals.js';

// Cada marcha triplica (aprox.) a la anterior: el cambio se siente, pero no es un latigazo.
export const SPEEDS = [
  { name: 'Paseo', v: 2.5, ramp: 0.4 },
  { name: 'Trote', v: 7, ramp: 0.6 },
  { name: 'Carrera', v: 20, ramp: 1.2 },
  { name: 'Turbo', v: 60, ramp: 2.2 },
  { name: 'Híper', v: 180, ramp: 3.2 }, // ramp: segundos que tarda en llegar a la velocidad punta
];
const EDGE = 1700;  // m: margen con el borde del área jugable
const CEILING = 7200; // m s. n. m.: techo de vuelo del cóndor (los reales pasan de 5.500)
const GRAVITY = 22;

const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Player {
  constructor(hf, manifest) {
    this.hf = hf;
    this.max = { x: manifest.core.sizeX - EDGE, z: manifest.core.sizeZ - EDGE };
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.vx = 0; this.vz = 0;
    this.heading = 0; this.level = 1; this.grounded = true; this.speed = 0; this.atEdge = false; this.odo = 0;
    this.camYaw = 0; this.camPitch = 0.13; this.camDist = 5.5; this.camY = 0; this.fov = 60; this.baseFov = 60;
    this.firstPerson = false; this.swimming = false; this.collide = null;
    this.deck = null; this.onDeck = false; // deck(x, z): cota de la calzada si ahí hay un puente (ver infra.js)
    this.rush = 0; this.roll = 0; this.lag = 1; this._prevHeading = 0; this._turn = 0;
    this.normal = new THREE.Vector3(0, 1, 0);
    this._t = new THREE.Vector3();
    this.animal = ANIMALS.colocolo; this.size = this.animal.scale;
    this.flying = false; this.flap = 0; this.airJumps = 0;
    this.surge = 0; this.thermal = 0;       // segundos que quedan de embestida (puma) y de térmica (cóndor)
    this.abilityReady = 0; this.abilityUntil = 0;
    this.onEvent = null;                    // (nombre, valor): 'jump', 'jump2', 'land' (con la velocidad de caída), para sonido y vibración
  }
  emit(n, v) { if (this.onEvent) this.onEvent(n, v); }
  setAnimal(a) {
    this.animal = a; this.size = a.scale; this.camDist = a.camDist;
    this.surge = this.thermal = 0; this.flying = false; this.flap = 0; this.abilityReady = 0; this.abilityUntil = 0;
  }
  // Habilidad especial del animal. Devuelve false si todavía se está recargando. El olfato del colocolo no cambia
  // el movimiento: lo resuelve main.js con la marca de luz.
  useAbility(now) {
    if (now < this.abilityReady) return false;
    const ab = this.animal.ability;
    this.abilityReady = now + ab.cd; this.abilityUntil = now + ab.dur;
    if (this.animal.id === 'puma') this.surge = ab.dur;
    if (this.animal.id === 'condor') { this.thermal = ab.dur; if (this.grounded) { this.grounded = false; this.vy = 9; } }
    return true;
  }
  teleport(x, z, yaw = this.camYaw) {
    this.x = THREE.MathUtils.clamp(x, EDGE, this.max.x); this.z = THREE.MathUtils.clamp(z, EDGE, this.max.z);
    this.y = this.camY = this.hf.height(this.x, this.z);
    this.vx = this.vz = this.vy = 0; this.grounded = true; this.heading = this.camYaw = yaw;
  }
  update(dt, now, input, io, camera) {
    const hf = this.hf;
    // --- mirada: yaw/pitch libres, arrastrando (pitch < 0 mira hacia arriba)
    this.camYaw -= io.lookX * 0.0042; this.camPitch = THREE.MathUtils.clamp(this.camPitch + io.lookY * 0.0036, -1.25, 1.45);
    this.camDist = THREE.MathUtils.clamp(this.camDist * Math.exp(io.zoom * 0.18), 1.0, 400);
    const fp = this.firstPerson || this.camDist < 1.07 * this.size;
    const A = this.animal, flying = (this.flying = !!A.fly && !this.grounded);
    if (this.surge > 0) this.surge -= dt; if (this.thermal > 0) this.thermal -= dt;

    // --- movimiento relativo a la cámara, con aceleración limitada (sin tirones al cambiar de marcha)
    this.swimming = this.grounded && !this.onDeck && hf.slope2(this.x, this.z) < 2.5e-5;
    const level = Math.min(SPEEDS.length - 1, this.level + (input.boost ? 1 : 0)), gear = SPEEDS[level];
    const table = flying ? A.air : A.speeds, surge = this.surge > 0 && level < 3;
    const top = table[level] * (this.swimming && level < 3 ? 0.45 : 1) * (surge ? 1.75 : 1);
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw), m = input.move;
    let tx = (sy * m.y - cy * m.x) * top, tz = (cy * m.y + sy * m.x) * top;
    // Volando sin tocar nada, el cóndor no se detiene en el aire: sigue planeando hacia donde iba.
    if (flying && Math.abs(m.x) + Math.abs(m.y) < 0.05) { tx = Math.sin(this.heading) * table[0]; tz = Math.cos(this.heading) * table[0]; }
    const dvx = tx - this.vx, dvz = tz - this.vz, dv = Math.hypot(dvx, dvz);
    if (dv > 1e-6) {
      const braking = Math.hypot(tx, tz) < this.speed - 0.5;
      const step = Math.max(top, this.speed, 4) / gear.ramp * (braking ? 1.8 : 1) * (this.grounded ? 1 : flying ? 0.7 : 0.35) * (surge ? 2 : 1) * dt;
      const f = Math.min(1, step / dv); this.vx += dvx * f; this.vz += dvz * f;
    }
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.25) this.heading = lerpAngle(this.heading, Math.atan2(this.vx, this.vz), 1 - Math.exp(-dt * 10));
    // Si no estás arrastrando para mirar, la cámara se acomoda detrás del gato: así se puede manejar solo con A/D o el joystick.
    if (!fp && this.speed > 0.5 && m.y > -0.2 && now - input.lastLook > 1.2 && input.pointers.size === 0)
      this.camYaw = lerpAngle(this.camYaw, this.heading, 1 - Math.exp(-dt * (0.9 + Math.abs(m.x) * 1.3)));

    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (this.collide && level < 3 && !flying) { const c = this.collide(nx, nz, this.y); nx = c[0]; nz = c[1]; } // Turbo e Híper son marchas de viaje: sin choques
    // Sobre un puente, la barrera ataja al gato: caminando no se sale por el costado (saltando, sí) y resbala a lo largo de ella.
    if (this.onDeck && this.grounded) {
      const off = (x, z) => this.deck(x, z) < this.y - 1.2 && hf.height(x, z) < this.y - 1.2;
      if (off(nx, nz)) { if (!off(nx, this.z)) nz = this.z; else if (!off(this.x, nz)) nx = this.x; else { nx = this.x; nz = this.z; } }
    }
    this.x = THREE.MathUtils.clamp(nx, EDGE, this.max.x); this.z = THREE.MathUtils.clamp(nz, EDGE, this.max.z);
    this.atEdge = this.x !== nx || this.z !== nz;
    this.odo += this.speed * dt;

    // --- vertical. Caminando, el gato pisa el terreno exacto. A alta velocidad sigue un perfil suavizado
    // (el promedio de lo que viene y lo que pasó), así planea sobre las irregularidades en vez de rebotar.
    let ground = hf.height(this.x, this.z);
    // Puentes: si el gato viene a la altura del tablero (o cae sobre él), ese es su suelo; si pasa por abajo, no.
    const deck = this.deck ? this.deck(this.x, this.z) : -Infinity;
    const wasOnDeck = this.onDeck;
    this.onDeck = !flying && deck > ground && this.y > deck - 1.3;
    if (this.onDeck) ground = deck;
    else if (wasOnDeck && this.grounded && this.y > ground + 1.5) { this.grounded = false; this.vy = 0; } // se acabó el tablero: cae
    const fast = flying ? 0 : smooth(10, 34, this.speed);
    let target = ground;
    if (fast > 0) {
      const ux = this.vx / this.speed, uz = this.vz / this.speed, L = Math.min(70, this.speed * 0.35);
      const mean = (ground + hf.height(this.x - ux * L * 0.5, this.z - uz * L * 0.5) + hf.height(this.x + ux * L * 0.5, this.z + uz * L * 0.5) + hf.height(this.x + ux * L, this.z + uz * L)) / 4;
      target = ground + Math.max(0, mean - ground) * fast;
    }
    if (io.jump) {
      if (this.grounded) { this.vy = A.jump; this.grounded = false; this.airJumps = A.airJumps; this.emit('jump'); }
      else if (this.airJumps > 0 && !A.fly) { this.airJumps--; this.vy = A.jump * 0.92; this.emit('jump2'); } // el segundo salto del colocolo
    }
    if (this.grounded) {
      const prev = this.y;
      this.y = fast > 0 ? Math.max(ground, this.y + (target - this.y) * (1 - Math.exp(-dt * (30 - 22 * fast)))) : ground;
      this.vy = (this.y - prev) / Math.max(dt, 1e-3);
      this.flap = 0;
    } else if (A.fly) {
      // Vuelo. La velocidad vertical busca un equilibrio: el planeo pierde ~1 m/s, aletear (Saltar apretado) sube,
      // C baja en picada, sin velocidad no hay sustentación, y cerca de una ladera empinada el viento que la remonta
      // empuja hacia arriba (así es como los cóndores ganan altura sin aletear).
      const agl = this.y - ground, stall = 1 - smooth(4, 10, this.speed);
      const ridge = agl < 260 ? 2.6 * smooth(0.03, 0.25, hf.slope2(this.x, this.z)) * (1 - agl / 260) : 0;
      const want = (input.jumpHeld ? 7.5 : 0) - (input.descend ? 15 : 0) - 0.9 - stall * 7 + ridge + (this.thermal > 0 ? 17 : 0);
      this.vy += (want - this.vy) * (1 - Math.exp(-dt * 2.2));
      this.y = Math.min(CEILING, this.y + this.vy * dt);
      this.flap = input.jumpHeld || this.thermal > 0 ? 1 : stall > 0.5 ? 0.7 : 0;
      if (this.y <= ground) {
        this.y = ground;
        if (input.jumpHeld || this.thermal > 0) this.vy = Math.max(this.vy, 0); // sigue queriendo volar: roza el suelo y continúa
        else { this.emit('land', -this.vy); this.vy = 0; this.grounded = true; }
      }
    } else {
      // Mantener apretado el salto mientras sube lo alarga, como en cualquier plataformero.
      this.vy -= GRAVITY * (input.jumpHeld && this.vy > 0 ? 0.5 : 1) * dt; this.y += this.vy * dt;
      if (this.y <= target) { this.emit('land', -this.vy); this.y = target; this.vy = 0; this.grounded = true; }
    }
    if (this.onDeck) this.normal.set(0, 1, 0); else hf.normal(this.x, this.z, this.normal, 0.45);

    // --- cámara
    this.camY += (this.y - this.camY) * (1 - Math.exp(-dt * 14));
    const sp = Math.min(1, this.speed / 180);
    // Viaje rápido (Turbo e Híper): el campo de visión se abre, la cámara se queda atrás al acelerar y alcanza
    // después, se inclina en las curvas y vibra un poco. `rush` va de 0 (hasta Carrera) a 1 (Híper a fondo).
    this.rush = Math.sqrt(Math.min(1, Math.max(0, (this.speed - 24) / 156)));
    this.fov += (Math.min(104, this.baseFov + 32 * this.rush + (surge ? 9 : 0)) - this.fov) * (1 - Math.exp(-dt * 2.2));
    let dh = this.heading - this._prevHeading; if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    this._prevHeading = this.heading;
    this._turn += (dh / Math.max(dt, 1e-3) - this._turn) * (1 - Math.exp(-dt * 6));
    this.roll += (THREE.MathUtils.clamp(this._turn * 0.22, -0.3, 0.3) * this.rush - this.roll) * (1 - Math.exp(-dt * 4));
    const cp = Math.cos(this.camPitch), sn = Math.sin(this.camPitch);
    const lx = Math.sin(this.camYaw) * cp, lz = Math.cos(this.camYaw) * cp; // dirección de la mirada (ly = −sn)
    if (fp) {
      const hy = this.camY + 0.5 * this.size;
      camera.position.set(this.x + Math.sin(this.heading) * 0.21 * this.size, hy, this.z + Math.cos(this.heading) * 0.21 * this.size);
    } else {
      this.lag += (1 + Math.sqrt(sp) * 1.8 - this.lag) * (1 - Math.exp(-dt * 1.3)); // resorte lento: al acelerar, el gato se escapa y la cámara lo alcanza
      const dist = this.camDist * this.lag;
      const tgtY = this.camY + 0.42 * this.size + dist * 0.04;
      const cx = this.x - lx * dist, cz = this.z - lz * dist;
      // La cámara nunca queda bajo tierra ni con un cerro entre ella y el gato: sube, pero no se acerca de golpe.
      let cyy = Math.max(tgtY + sn * dist, hf.height(cx, cz) + 0.45);
      for (const f of [0.35, 0.7]) {
        const h = hf.height(this.x - lx * dist * f, this.z - lz * dist * f) + 0.3;
        if (h > tgtY + (cyy - tgtY) * f) cyy = Math.min(tgtY + (h - tgtY) / f, cyy + dist);
      }
      camera.position.set(cx, cyy, cz);
      if (this.rush > 0.01) { // vibración: dos senos desfasados por eje, amplitud con el cuadrado de la velocidad
        const a = this.rush * this.rush * 0.05 * Math.min(1, dist / 6);
        camera.position.x += (Math.sin(now * 47) + Math.sin(now * 71.3)) * a; camera.position.y += (Math.sin(now * 53.7) + Math.sin(now * 83.1)) * a * 0.7;
      }
    }
    camera.lookAt(this._t.set(camera.position.x + lx, camera.position.y - sn, camera.position.z + lz));
    if (Math.abs(this.roll) > 1e-4) camera.rotateZ(this.roll);
    if (Math.abs(camera.fov - this.fov) > 0.05) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    return fp;
  }
}
