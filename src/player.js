// Movimiento del animal y cámara (tercera persona con mirada libre tipo FPS, o primera persona).
// Los felinos corren y saltan; el cóndor, además, vuela: despega saltando, sube aleteando y planea solo.
//
// Física: el animal es un punto con velocidad propia que cae con la gravedad y choca contra el relieve. No va pegado
// al suelo: si el terreno se le va de abajo más rápido de lo que la gravedad lo sigue (un borde, una loma a la carrera),
// queda en el aire y cae donde le toque. Las laderas empinadas le cuestan, las muy empinadas lo hacen resbalar, y un
// aterrizaje demasiado fuerte termina rodando. No hay motor de física: todo sale de consultar la función de altura.
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
const TRAVEL_G = 2.4; // en Turbo e Híper la gravedad pesa más: se vuela sobre las lomas, pero no por kilómetros

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
    this._t = new THREE.Vector3(); this._n = new THREE.Vector3();
    this.animal = ANIMALS.colocolo; this.size = this.animal.scale; this.camDist = this.animal.camDist;
    this.flying = false; this.flap = 0; this.airJumps = 0;
    this.surge = 0; this.thermal = 0;       // segundos que quedan de embestida (puma) y de térmica (cóndor)
    this.abilityReady = 0; this.abilityUntil = 0;
    this.slope = 0;                         // tangente de la pendiente bajo las patas
    this.slide = 0;                         // 0..1: cuánto está resbalando (para el sonido y el polvo)
    this.tumble = 0; this.tumbleDur = 1; this.spin = 0; // segundos que quedan rodando tras una mala caída, y el giro del cuerpo
    this.kick = 0; this.bump = 0; this._band = 0;       // golpes de cámara: al entrar en velocidad de viaje y al aterrizar
    this.airTime = 0;                       // segundos seguidos en el aire (un salto largo se celebra)
    // Piruetas (felinos): en el aire, con Truco apretado, adelante/atrás da mortales y los costados giran el cuerpo.
    // trickP y trickY son los ángulos acumulados (rad); al aterrizar se cuenta lo que se alcanzó a completar.
    this.trickP = 0; this.trickY = 0; this._tp = 0; this._ty = 0; this.tricking = false; this.boostT = 0;
    // Esfuerzo y peligro. stamina: aguante 0..1 (subir y correr lo gastan; descansar lo devuelve; en altura rinde menos).
    // road(x, z): ¿hay camino de vehículos ahí? Turbo e Híper solo funcionan sobre uno. free: modo paseo, sin nada de esto.
    this.stamina = 1; this.exhausted = false; this.road = null; this.offroad = false; this.free = false;
    this.dead = 0; this.fallTop = 0; this.safe = []; this._safeT = 0; // últimos puntos seguros, para volver tras una caída fatal
    // (nombre, valor): 'jump', 'jump2', 'land' (velocidad del impacto), 'tumble' (ídem), 'boom' (1 Turbo, 2 Híper), 'air' (segundos de vuelo)
    this.onEvent = null;
  }
  emit(n, v) { if (this.onEvent) this.onEvent(n, v); }
  setAnimal(a) {
    this.animal = a; this.size = a.scale; this.camDist = a.camDist;
    this.surge = this.thermal = 0; this.flying = false; this.flap = 0; this.abilityReady = 0; this.abilityUntil = 0;
    this.tumble = 0; this.spin = 0; this.trickP = this.trickY = this._tp = this._ty = 0; this.boostT = 0;
    this.stamina = 1; this.exhausted = false;
  }
  // Habilidad especial del animal. Devuelve false si todavía se está recargando. El olfato del colocolo no cambia
  // el movimiento: lo resuelve main.js con la marca de luz.
  useAbility(now) {
    if (now < this.abilityReady || this.tumble > 0 || this.dead > 0) return false;
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
    this.tumble = 0; this.spin = 0; this.slide = 0; this.airTime = 0; this.trickP = this.trickY = this._tp = this._ty = 0;
    this.dead = 0; this.safe.length = 0; this._safeT = 0;
  }
  update(dt, now, input, io, camera) {
    const hf = this.hf;
    // --- mirada: yaw/pitch libres, arrastrando (pitch < 0 mira hacia arriba)
    this.camYaw -= io.lookX * 0.0042; this.camPitch = THREE.MathUtils.clamp(this.camPitch + io.lookY * 0.0036, -1.25, 1.45);
    this.camDist = THREE.MathUtils.clamp(this.camDist * Math.exp(io.zoom * 0.18), 0.7, 400);
    const fp = this.firstPerson || this.camDist < 1.07 * this.size;
    const A = this.animal, flying = (this.flying = !!A.fly && !this.grounded);
    if (this.surge > 0) this.surge -= dt; if (this.thermal > 0) this.thermal -= dt;
    const tumbling = this.tumble > 0;
    if (tumbling) {
      this.tumble -= dt;
      const k = 1 - Math.max(0, this.tumble) / this.tumbleDur; // gira rápido al principio y se va frenando
      this.spin = this.tumble > 0 ? Math.PI * 2 * Math.max(1, Math.round(this.tumbleDur * 1.25)) * (1 - (1 - k) * (1 - k)) : 0;
    }

    // --- movimiento relativo a la cámara, con aceleración limitada (sin tirones al cambiar de marcha)
    this.swimming = this.grounded && !this.onDeck && hf.slope2(this.x, this.z) < 2.5e-5;
    let level = Math.min(SPEEDS.length - 1, this.level + (input.boost ? 1 : 0));
    // Turbo e Híper son marchas de camino: fuera de uno, el cerro se sube a pata (lo más rápido es la Carrera).
    this.offroad = level >= 3 && !flying && !this.free && !!this.road && !this.road(this.x, this.z);
    if (this.offroad) level = 2;
    const gear = SPEEDS[level];
    const travel = level >= 3; // Turbo e Híper son marchas de viaje: sin choques, sin límite de pendiente y sin porrazos
    const table = flying ? A.air : A.speeds, surge = this.surge > 0 && level < 3;
    if (this.boostT > 0) this.boostT -= dt; // el impulso que deja una pirueta bien aterrizada
    let top = table[level] * (this.swimming && level < 3 ? 0.45 : 1) * (surge ? 1.75 : 1) * (this.boostT > 0 && level < 3 ? 1.3 : 1);
    if (this.exhausted && !travel) top = Math.min(top, table[0] * (flying ? 1 : 0.85)); // sin aliento: al paso
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw), m = input.move;
    let tx = (sy * m.y - cy * m.x) * top, tz = (cy * m.y + sy * m.x) * top;
    // Volando sin tocar nada, el cóndor no se detiene en el aire: sigue planeando hacia donde iba.
    if (flying && Math.abs(m.x) + Math.abs(m.y) < 0.05) { tx = Math.sin(this.heading) * table[0]; tz = Math.cos(this.heading) * table[0]; }
    if (tumbling || this.dead > 0) tx = tz = 0; // rodando no manda nadie
    // Pirueta: con Truco apretado en el aire, las direcciones dejan de dirigir y pasan a girar el cuerpo.
    const tricking = (this.tricking = !this.grounded && !A.fly && !tumbling && !!input.descend);
    if (tricking) { tx = this.vx; tz = this.vz; }
    this._tp += ((tricking ? m.y * 10 : 0) - this._tp) * (1 - Math.exp(-dt * 9)); this._ty += ((tricking ? -m.x * 11 : 0) - this._ty) * (1 - Math.exp(-dt * 9));
    if (!this.grounded) { this.trickP += this._tp * dt; this.trickY += this._ty * dt; }

    // --- pendiente bajo las patas (huella de 2 m, para que una piedra no cuente como ladera). Cuesta arriba el
    // animal pierde velocidad hasta que ya no sube; pasado su límite, resbala ladera abajo y casi no puede dirigirse.
    let tan = 0, ctrl = 1, slipping = false;
    if (this.grounded && !flying && !this.onDeck && !this.swimming && !travel) {
      const n = hf.normal(this.x, this.z, this._n, 2), gh = Math.hypot(n.x, n.z);
      tan = gh / Math.max(n.y, 1e-3);
      if (gh > 1e-4 && tan > A.climb * 0.55) {
        const dx = n.x / gh, dz = n.z / gh; // ladera abajo
        const up = -(tx * dx + tz * dz);
        if (up > 0) { const cut = up * smooth(A.climb * 0.55, A.climb, tan); tx += dx * cut; tz += dz * cut; }
        if (tan > A.slip) {
          // Resbala: lo que el jugador quiere pesa cada vez menos y se le suma una deriva ladera abajo que crece con
          // la pendiente (unos 5 m/s apenas pasado el límite, 25 en un paredón). Quieto tampoco se sostiene.
          const hold = 1 - 0.7 * smooth(A.slip, A.slip * 1.3, tan), vs = Math.min(28, 4 + 40 * (tan / A.slip - 1));
          tx = tx * hold + dx * vs; tz = tz * hold + dz * vs;
          ctrl = 0.6; slipping = true;
        }
      }
    }
    this.slope = tan;
    this.slide += ((slipping && this.speed > 1.5 ? 1 : 0) - this.slide) * (1 - Math.exp(-dt * 6));

    const dvx = tx - this.vx, dvz = tz - this.vz, dv = Math.hypot(dvx, dvz);
    if (dv > 1e-6) {
      const braking = Math.hypot(tx, tz) < this.speed - 0.5;
      let step = Math.max(top, this.speed, 4) / gear.ramp * (braking ? 1.8 : 1) * (this.grounded ? 1 : flying ? 0.7 : travel ? 0.8 : 0.35) * (surge ? 2 : 1) * ctrl * dt;
      if (tumbling) step = (this.grounded ? 9 : 1) * dt; // solo lo frena el roce contra el suelo
      const f = Math.min(1, step / dv); this.vx += dvx * f; this.vz += dvz * f;
    }
    this.speed = Math.hypot(this.vx, this.vz);
    if (this.speed > 0.25 && !tumbling) this.heading = lerpAngle(this.heading, Math.atan2(this.vx, this.vz), 1 - Math.exp(-dt * 10));
    // Si no estás arrastrando para mirar, la cámara se acomoda detrás del gato: así se puede manejar solo con A/D o el joystick.
    if (!fp && this.speed > 0.5 && m.y > -0.2 && now - input.lastLook > 1.2 && input.pointers.size === 0)
      this.camYaw = lerpAngle(this.camYaw, this.heading, 1 - Math.exp(-dt * (0.9 + Math.abs(m.x) * 1.3)));

    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (this.collide && !travel && !flying) {
      const c = this.collide(nx, nz, this.y), px = c[0] - nx, pz = c[1] - nz, push = Math.hypot(px, pz);
      if (push > 1e-4) {
        // Contra un tronco, una roca o un muro: despacio, el animal resbala por el costado; rápido, el golpe lo bota.
        const ux = px / push, uz = pz / push, vn = -(this.vx * ux + this.vz * uz);
        if (vn > A.crash && !tumbling) {
          this.vx = (this.vx + ux * vn * 1.5) * 0.45; this.vz = (this.vz + uz * vn * 1.5) * 0.45; // rebota y pierde casi todo el impulso
          this.tumble = this.tumbleDur = Math.min(1.9, 0.7 + (vn - A.crash) * 0.06); this.surge = 0; this.boostT = 0;
          if (this.grounded) { this.vy = 3.2; this.grounded = false; }
          this.emit('crash', vn);
        } else if (vn > 0) { this.vx += ux * vn; this.vz += uz * vn; }
      }
      nx = c[0]; nz = c[1];
    }
    // Sobre un puente, la barrera ataja al gato: caminando no se sale por el costado (saltando, sí) y resbala a lo largo de ella.
    if (this.onDeck && this.grounded) {
      const off = (x, z) => this.deck(x, z) < this.y - 1.2 && hf.height(x, z) < this.y - 1.2;
      if (off(nx, nz)) { if (!off(nx, this.z)) nz = this.z; else if (!off(this.x, nz)) nx = this.x; else { nx = this.x; nz = this.z; } }
    }
    this.x = THREE.MathUtils.clamp(nx, EDGE, this.max.x); this.z = THREE.MathUtils.clamp(nz, EDGE, this.max.z);
    this.atEdge = this.x !== nx || this.z !== nz;
    this.odo += this.speed * dt;

    // --- vertical. El suelo es el terreno exacto; a alta velocidad, un perfil suavizado (el promedio de lo que
    // viene y lo que pasó), para que las irregularidades chicas no hagan rebotar al animal.
    const y0 = this.y;
    let ground = hf.height(this.x, this.z);
    // Puentes: si el gato viene a la altura del tablero (o cae sobre él), ese es su suelo; si pasa por abajo, no.
    const deck = this.deck ? this.deck(this.x, this.z) : -Infinity;
    this.onDeck = !flying && deck > ground && this.y > deck - 1.3;
    if (this.onDeck) ground = deck;
    const fast = flying ? 0 : smooth(10, 34, this.speed);
    let floor = ground;
    if (fast > 0) {
      const ux = this.vx / this.speed, uz = this.vz / this.speed, L = Math.min(70, this.speed * 0.35);
      const mean = (ground + hf.height(this.x - ux * L * 0.5, this.z - uz * L * 0.5) + hf.height(this.x + ux * L * 0.5, this.z + uz * L * 0.5) + hf.height(this.x + ux * L, this.z + uz * L)) / 4;
      floor = ground + Math.max(0, mean - ground) * fast;
    }
    if (io.jump && !tumbling && !(this.dead > 0)) {
      if (!this.free) this.stamina = Math.max(0, this.stamina - 0.025);
      if (this.grounded) { this.vy = A.jump * (this.exhausted ? 0.6 : 1) + Math.max(0, this.vy) * 0.25; this.grounded = false; this.airJumps = A.airJumps; this.emit('jump'); } // subiendo una ladera se salta un poco más
      else if (this.airJumps > 0 && !A.fly) { this.airJumps--; this.vy = A.jump * 0.92; this.emit('jump2'); } // el segundo salto del colocolo
    }
    if (A.fly && !this.grounded) {
      // Vuelo. La velocidad vertical busca un equilibrio: el planeo pierde ~1 m/s, aletear (Saltar apretado) sube,
      // C baja en picada, sin velocidad no hay sustentación, y cerca de una ladera empinada el viento que la remonta
      // empuja hacia arriba (así es como los cóndores ganan altura sin aletear).
      const agl = this.y - ground, stall = 1 - smooth(4, 10, this.speed);
      const ridge = agl < 260 ? 2.6 * smooth(0.03, 0.25, hf.slope2(this.x, this.z)) * (1 - agl / 260) : 0;
      const flapping = input.jumpHeld && !this.exhausted; // sin aliento no hay aleteo: solo queda planear
      const want = (flapping ? 7.5 : 0) - (input.descend ? 15 : 0) - 0.9 - stall * 7 + ridge + (this.thermal > 0 ? 17 : 0);
      this.vy += (want - this.vy) * (1 - Math.exp(-dt * 2.2));
      this.y = Math.min(CEILING, this.y + this.vy * dt);
      this.flap = flapping || this.thermal > 0 ? 1 : stall > 0.5 ? 0.7 : 0;
      if (this.y <= ground) {
        this.y = ground;
        if (input.jumpHeld || this.thermal > 0) this.vy = Math.max(this.vy, 0); // sigue queriendo volar: roza el suelo y continúa
        else { this.emit('land', -this.vy); this.vy = 0; this.grounded = true; }
      }
    } else {
      // Caída libre contra el suelo. Mantener apretado el salto mientras sube lo alarga, como en cualquier plataformero.
      const wasG = this.grounded;
      this.vy -= GRAVITY * (travel ? TRAVEL_G : 1) * (!wasG && input.jumpHeld && this.vy > 0 ? 0.5 : 1) * dt;
      const ny = this.y + this.vy * dt;
      // Dónde queda el animal si sigue apoyado: sobre el suelo, o acercándose a él con algo de retardo cuando va rápido.
      const follow = fast > 0 ? Math.max(ground, this.y + (floor - this.y) * (1 - Math.exp(-dt * (30 - 22 * fast)))) : floor;
      if (ny <= follow) {
        if (!wasG) this._land(travel);
        this.vy = (follow - this.y) / Math.max(dt, 1e-3); this.y = follow; this.grounded = true; this.flap = 0;
      } else {
        this.y = ny;
        // Las patas alcanzan el suelo unos centímetros más abajo: recién pasado eso el animal está de verdad en el aire.
        if (wasG && ny - follow > 0.1 * this.size + 0.05) this.grounded = false;
      }
    }
    if (this.grounded) { if (this.airTime > 1.6) this.emit('air', this.airTime); this.airTime = 0; }
    else { if (this.airTime === 0) this.fallTop = y0; if (this.y > this.fallTop) this.fallTop = this.y; this.airTime += dt; }
    // --- aguante. Subir cuesta por metro ganado; la carrera, por segundo; quieto o al paso se recupera. En altura el
    // aire rinde menos: todo gasta más y se recupera más lento. El cóndor gasta aleteando y descansa planeando.
    if (!this.free && !(this.dead > 0)) {
      const S = A.stam, thin = smooth(2600, 5600, this.y);
      let d = 0;
      if (flying) d = ((input.jumpHeld && !this.exhausted ? S.flap : -S.glide) + (level >= 3 ? 0.03 * (level - 2) : 0)) * dt;
      else if (this.grounded && !travel) {
        const running = level === 2 && this.speed > top * 0.6;
        d = Math.max(0, this.y - y0) * S.climb + (running ? S.run : this.speed < 0.5 ? -S.rec : level === 0 ? -S.rec * 0.6 : -S.rec * 0.2) * dt;
      }
      this.stamina = Math.min(1, Math.max(0, this.stamina - (d > 0 ? d * (1 + 1.2 * thin) : d * (1 - 0.55 * thin))));
      if (this.stamina <= 0 && !this.exhausted) { this.exhausted = true; this.emit('tired', this.y); }
      else if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    } else if (this.free) { this.stamina = 1; this.exhausted = false; }
    // Punto seguro: cada par de segundos, si el animal está bien parado en un lugar tranquilo.
    if ((this._safeT -= dt) <= 0 && this.grounded && !tumbling && !(this.dead > 0) && this.slope < 0.55 && !this.swimming && this.speed < 30) {
      this._safeT = 2; this.safe.push(this.x, this.z, this.heading); if (this.safe.length > 15) this.safe.splice(0, 3);
    }
    if (this.dead > 0 && (this.dead -= dt) <= 0) this.respawn();
    if (this.onDeck) this.normal.set(0, 1, 0); else hf.normal(this.x, this.z, this.normal, 0.45);

    // --- cámara
    this.camY += (this.y - this.camY) * (1 - Math.exp(-dt * 14));
    const sp = Math.min(1, this.speed / 180);
    // Viaje rápido (Turbo e Híper): el campo de visión se abre, la cámara se queda atrás al acelerar y alcanza
    // después, se inclina en las curvas y vibra un poco. `rush` va de 0 (hasta Carrera) a 1 (Híper a fondo).
    this.rush = Math.sqrt(Math.min(1, Math.max(0, (this.speed - 24) / 156)));
    // Al cruzar a velocidad de Turbo y de Híper hay un estampido: la cámara recibe un golpe que se disipa en medio segundo.
    // (Con histéresis: sube a 1 sobre 44 m/s y a 2 sobre 128; baja recién bajo 110 y bajo 36.)
    let band = this._band;
    if (this.speed > 128) band = 2; else if (this.speed > 44) band = this.speed < 110 ? 1 : Math.max(1, band); else if (this.speed < 36) band = 0;
    if (band > this._band) { this.kick = 1; this.emit('boom', band); }
    this._band = band;
    this.kick *= Math.exp(-dt * 2.4); this.bump *= Math.exp(-dt * 7);
    this.fov += (Math.min(112, this.baseFov + 34 * this.rush + (surge ? 9 : 0) + 16 * this.kick) - this.fov) * (1 - Math.exp(-dt * (2.2 + 9 * this.kick)));
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
      const tgtY = this.camY + 0.42 * this.size + dist * 0.04 - this.bump * 0.5 * this.size;
      const cx = this.x - lx * dist, cz = this.z - lz * dist;
      // La cámara nunca queda bajo tierra ni con un cerro entre ella y el gato: sube, pero no se acerca de golpe.
      let cyy = Math.max(tgtY + sn * dist, hf.height(cx, cz) + 0.3 + 0.1 * this.size);
      for (const f of [0.35, 0.7]) {
        const h = hf.height(this.x - lx * dist * f, this.z - lz * dist * f) + 0.3;
        if (h > tgtY + (cyy - tgtY) * f) cyy = Math.min(tgtY + (h - tgtY) / f, cyy + dist);
      }
      camera.position.set(cx, cyy, cz);
      const shake = this.rush * this.rush * 0.05 + this.kick * 0.14 + this.bump * 0.05;
      if (shake > 0.001) { // vibración: dos senos desfasados por eje
        const a = shake * Math.min(1, dist / 6);
        camera.position.x += (Math.sin(now * 47) + Math.sin(now * 71.3)) * a; camera.position.y += (Math.sin(now * 53.7) + Math.sin(now * 83.1)) * a * 0.7;
      }
    }
    camera.lookAt(this._t.set(camera.position.x + lx, camera.position.y - sn, camera.position.z + lz));
    if (Math.abs(this.roll) > 1e-4) camera.rotateZ(this.roll);
    if (Math.abs(camera.fov - this.fov) > 0.05) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    return fp;
  }
  // Tras una caída fatal: de vuelta al último punto seguro de hace unos segundos (no al borde mismo del que se cayó).
  respawn() {
    const s = this.safe, k = Math.max(0, s.length - 9), x = s.length ? s[k] : this.x, z = s.length ? s[k + 1] : this.z, yaw = s.length ? s[k + 2] : this.heading;
    this.teleport(x, z, yaw); this.stamina = 0.6; this.exhausted = false;
    this.emit('respawn', 0);
  }
  // Aterrizaje. Lo que duele no es la velocidad de caída sino la componente contra el suelo: caer sobre una ladera
  // que baja en el mismo sentido es mucho más suave que caer de plano. Pasado el aguante del animal, rueda.
  _land(travel) {
    const n = this.onDeck ? this._n.set(0, 1, 0) : this.hf.normal(this.x, this.z, this._n, 1.2);
    const impact = Math.max(0, -(this.vx * n.x + this.vy * n.y + this.vz * n.z));
    this.bump = Math.min(1, impact / 16);
    this.emit('land', impact);
    // Caída fatal: en la montaña, pasado cierto golpe no hay segunda oportunidad. El agua amortigua.
    const drop = this.fallTop - this.y, wet = !this.onDeck && this.hf.slope2(this.x, this.z) < 2.5e-5;
    if (!this.free && !wet && drop > 9 && impact > this.animal.lethal) {
      this.dead = 3.6; this.tumble = this.tumbleDur = 3.6; this.vx *= 0.35; this.vz *= 0.35; this.surge = 0; this.boostT = 0;
      this.trickP = this.trickY = this._tp = this._ty = 0;
      this.emit('death', { impact, drop }); return;
    }
    // Piruetas: se cuenta lo completado. Si el cuerpo viene a medio mortal (más de ~60° de la vertical), se cae.
    const P2 = Math.PI * 2, flips = Math.round(this.trickP / P2), off = Math.abs(this.trickP - flips * P2), halves = Math.round(this.trickY / Math.PI);
    const tried = Math.abs(this.trickP) > 0.7 || Math.abs(this.trickY) > 1.3, air = this.airTime;
    this.trickP = this.trickY = this._tp = this._ty = 0;
    if (tried && off > 1.05) {
      this.tumble = this.tumbleDur = 1.3; this.vx *= 0.6; this.vz *= 0.6; this.surge = 0; this.boostT = 0;
      this.emit('bail', impact); return;
    }
    if (tried && (flips || halves)) { this.boostT = 2.5; this.emit('trick', { flips, halves, air }); }
    const water = !this.onDeck && this.hf.slope2(this.x, this.z) < 2.5e-5; // el agua amortigua
    if (!travel && !water && impact > this.animal.hard) {
      this.tumble = this.tumbleDur = Math.min(2.4, 0.75 + (impact - this.animal.hard) * 0.07);
      this.vx *= 0.6; this.vz *= 0.6; this.surge = 0;
      this.emit('tumble', impact);
    }
  }
}
