// Movimiento del gato y cámara en tercera persona.
import * as THREE from 'three';
import { CAT_SCALE } from './cat.js';

export const SPEEDS = [
  { name: 'Paseo', v: 3 },
  { name: 'Carrera', v: 13 },
  { name: 'Turbo', v: 70 },
  { name: 'Hiper', v: 320 },
];
const EDGE = 1700; // m: margen con el borde del área jugable

const lerpAngle = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export class Player {
  constructor(hf, manifest) {
    this.hf = hf;
    this.max = { x: manifest.core.sizeX - EDGE, z: manifest.core.sizeZ - EDGE };
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.vx = 0; this.vz = 0;
    this.heading = 0; this.level = 1; this.grounded = true; this.speed = 0; this.atEdge = false;
    this.camYaw = 0; this.camPitch = 0.13; this.camDist = 5.5; this.camY = 0; this.fov = 60; this.baseFov = 60;
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
    // --- cámara: órbita manual
    this.camYaw -= io.lookX * 0.0052; this.camPitch = THREE.MathUtils.clamp(this.camPitch + io.lookY * 0.004, -0.35, 1.45);
    this.camDist = THREE.MathUtils.clamp(this.camDist * Math.exp(io.zoom * 0.18), 2.2, 400);

    // --- movimiento relativo a la cámara
    this.swimming = this.grounded && hf.slope2(this.x, this.z) < 2.5e-5;
    const level = Math.min(SPEEDS.length - 1, this.level + (input.boost ? 1 : 0)), top = SPEEDS[level].v * (this.swimming && level < 2 ? 0.45 : 1);
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw), m = input.move;
    const tx = (sy * m.y - cy * m.x) * top, tz = (cy * m.y + sy * m.x) * top;
    const k = 1 - Math.exp(-dt * (this.grounded ? 5 : 1.2));
    this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.25) this.heading = lerpAngle(this.heading, Math.atan2(this.vx, this.vz), 1 - Math.exp(-dt * 10));
    // Si no estás moviendo la cámara, se va acomodando detrás del gato: así se puede manejar solo con A/D o el joystick.
    if (this.speed > 0.5 && m.y > -0.2 && now - input.lastLook > 1.2 && input.pointers.size === 0)
      this.camYaw = lerpAngle(this.camYaw, this.heading, 1 - Math.exp(-dt * (0.9 + Math.abs(m.x) * 1.3)));

    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    this.x = THREE.MathUtils.clamp(nx, EDGE, this.max.x); this.z = THREE.MathUtils.clamp(nz, EDGE, this.max.z);
    this.atEdge = this.x !== nx || this.z !== nz;

    // --- vertical: pegado al suelo, pero si el terreno se hunde más rápido que la gravedad, el gato vuela.
    const ground = hf.height(this.x, this.z);
    const g = 20 + (this.speed * this.speed) / 55; // a más velocidad más "pegado", o a 300 m/s saldría en órbita
    if (this.grounded && io.jump) { this.vy = 7.5; this.grounded = false; }
    if (this.grounded) {
      const ballistic = this.y + this.vy * dt - 0.5 * g * dt * dt;
      if (ground >= ballistic - 0.02) { this.vy = Math.min((ground - this.y) / Math.max(dt, 1e-3), 60); this.y = ground; }
      else { this.grounded = false; this.y = ballistic; this.vy -= g * dt; }
    } else {
      this.vy -= g * dt; this.y += this.vy * dt;
      if (this.y <= ground) { this.y = ground; this.vy = 0; this.grounded = true; }
    }
    hf.normal(this.x, this.z, this.normal, 0.45);

    // --- cámara: sigue al gato, se aleja con la velocidad y nunca atraviesa el terreno
    this.camY += (this.y - this.camY) * (1 - Math.exp(-dt * 12));
    const sp = Math.min(1, this.speed / 320);
    const dist = this.camDist * (1 + Math.sqrt(sp) * 2.2);
    this.fov += (Math.min(100, this.baseFov + 16 * Math.sqrt(sp)) - this.fov) * (1 - Math.exp(-dt * 3));
    const tgtY = this.camY + 0.42 * CAT_SCALE + dist * 0.04;
    const cp = Math.cos(this.camPitch), sp2 = Math.sin(this.camPitch);
    const dx = -Math.sin(this.camYaw) * cp, dz = -Math.cos(this.camYaw) * cp;
    let d = dist;
    for (let i = 1; i <= 10; i++) {
      const t = (i / 10) * dist;
      if (tgtY + sp2 * t < hf.height(this.x + dx * t, this.z + dz * t) + 0.35) { d = Math.max(1.2, t - dist / 10); break; }
    }
    const cx = this.x + dx * d, cz = this.z + dz * d;
    camera.position.set(cx, Math.max(tgtY + sp2 * d, hf.height(cx, cz) + 0.45), cz);
    camera.lookAt(this._t.set(this.x, tgtY, this.z));
    if (Math.abs(camera.fov - this.fov) > 0.05) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
  }
}
