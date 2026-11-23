// Movimiento del gato y cámara (tercera persona con mirada libre tipo FPS, o primera persona).
import * as THREE from 'three';
import { CAT_SCALE } from './cat.js';

// Cada marcha triplica (aprox.) a la anterior: el cambio se siente, pero no es un latigazo.
export const SPEEDS = [
  { name: 'Paseo', v: 2.5, ramp: 0.4 },
  { name: 'Trote', v: 7, ramp: 0.6 },
  { name: 'Carrera', v: 20, ramp: 1.2 },
  { name: 'Turbo', v: 60, ramp: 2.2 },
  { name: 'Híper', v: 180, ramp: 3.2 }, // ramp: segundos que tarda en llegar a la velocidad punta
];
const EDGE = 1700;  // m: margen con el borde del área jugable
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
    const fp = this.firstPerson || this.camDist < 1.6;

    // --- movimiento relativo a la cámara, con aceleración limitada (sin tirones al cambiar de marcha)
    this.swimming = this.grounded && !this.onDeck && hf.slope2(this.x, this.z) < 2.5e-5;
    const level = Math.min(SPEEDS.length - 1, this.level + (input.boost ? 1 : 0)), gear = SPEEDS[level];
    const top = gear.v * (this.swimming && level < 3 ? 0.45 : 1);
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw), m = input.move;
    const tx = (sy * m.y - cy * m.x) * top, tz = (cy * m.y + sy * m.x) * top;
    const dvx = tx - this.vx, dvz = tz - this.vz, dv = Math.hypot(dvx, dvz);
    if (dv > 1e-6) {
      const braking = Math.hypot(tx, tz) < this.speed - 0.5;
      const step = Math.max(top, this.speed, 4) / gear.ramp * (braking ? 1.8 : 1) * (this.grounded ? 1 : 0.35) * dt;
      const f = Math.min(1, step / dv); this.vx += dvx * f; this.vz += dvz * f;
    }
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.25) this.heading = lerpAngle(this.heading, Math.atan2(this.vx, this.vz), 1 - Math.exp(-dt * 10));
    // Si no estás arrastrando para mirar, la cámara se acomoda detrás del gato: así se puede manejar solo con A/D o el joystick.
    if (!fp && this.speed > 0.5 && m.y > -0.2 && now - input.lastLook > 1.2 && input.pointers.size === 0)
      this.camYaw = lerpAngle(this.camYaw, this.heading, 1 - Math.exp(-dt * (0.9 + Math.abs(m.x) * 1.3)));

    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (this.collide && level < 3) { const c = this.collide(nx, nz, this.y); nx = c[0]; nz = c[1]; } // Turbo e Híper son marchas de viaje: sin choques
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
    this.onDeck = deck > ground && this.y > deck - 1.3;
    if (this.onDeck) ground = deck;
    else if (wasOnDeck && this.grounded && this.y > ground + 1.5) { this.grounded = false; this.vy = 0; } // se acabó el tablero: cae
    const fast = smooth(10, 34, this.speed);
    let target = ground;
    if (fast > 0) {
      const ux = this.vx / this.speed, uz = this.vz / this.speed, L = Math.min(70, this.speed * 0.35);
      const mean = (ground + hf.height(this.x - ux * L * 0.5, this.z - uz * L * 0.5) + hf.height(this.x + ux * L * 0.5, this.z + uz * L * 0.5) + hf.height(this.x + ux * L, this.z + uz * L)) / 4;
      target = ground + Math.max(0, mean - ground) * fast;
    }
    if (this.grounded && io.jump) { this.vy = 8.6; this.grounded = false; }
    if (this.grounded) {
      const prev = this.y;
      this.y = fast > 0 ? Math.max(ground, this.y + (target - this.y) * (1 - Math.exp(-dt * (30 - 22 * fast)))) : ground;
      this.vy = (this.y - prev) / Math.max(dt, 1e-3);
    } else {
      // Mantener apretado el salto mientras sube lo alarga, como en cualquier plataformero.
      this.vy -= GRAVITY * (input.jumpHeld && this.vy > 0 ? 0.5 : 1) * dt; this.y += this.vy * dt;
      if (this.y <= target) { this.y = target; this.vy = 0; this.grounded = true; }
    }
    if (this.onDeck) this.normal.set(0, 1, 0); else hf.normal(this.x, this.z, this.normal, 0.45);

    // --- cámara
    this.camY += (this.y - this.camY) * (1 - Math.exp(-dt * 14));
    const sp = Math.min(1, this.speed / 180);
    // Viaje rápido (Turbo e Híper): el campo de visión se abre, la cámara se queda atrás al acelerar y alcanza
    // después, se inclina en las curvas y vibra un poco. `rush` va de 0 (hasta Carrera) a 1 (Híper a fondo).
    this.rush = Math.sqrt(Math.min(1, Math.max(0, (this.speed - 24) / 156)));
    this.fov += (Math.min(104, this.baseFov + 32 * this.rush) - this.fov) * (1 - Math.exp(-dt * 2.2));
    let dh = this.heading - this._prevHeading; if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    this._prevHeading = this.heading;
    this._turn += (dh / Math.max(dt, 1e-3) - this._turn) * (1 - Math.exp(-dt * 6));
    this.roll += (THREE.MathUtils.clamp(this._turn * 0.22, -0.3, 0.3) * this.rush - this.roll) * (1 - Math.exp(-dt * 4));
    const cp = Math.cos(this.camPitch), sn = Math.sin(this.camPitch);
    const lx = Math.sin(this.camYaw) * cp, lz = Math.cos(this.camYaw) * cp; // dirección de la mirada (ly = −sn)
    if (fp) {
      const hy = this.camY + 0.5 * CAT_SCALE;
      camera.position.set(this.x + Math.sin(this.heading) * 0.32, hy, this.z + Math.cos(this.heading) * 0.32);
    } else {
      this.lag += (1 + Math.sqrt(sp) * 1.8 - this.lag) * (1 - Math.exp(-dt * 1.3)); // resorte lento: al acelerar, el gato se escapa y la cámara lo alcanza
      const dist = this.camDist * this.lag;
      const tgtY = this.camY + 0.42 * CAT_SCALE + dist * 0.04;
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
