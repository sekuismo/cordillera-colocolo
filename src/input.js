// Entrada unificada: teclado + mouse en escritorio, joystick virtual + arrastre + pellizco en pantallas táctiles,
// y control de consola (Gamepad API, mapeo estándar: Xbox, PlayStation, Switch Pro y la mayoría de los genéricos).
// Botones del control → la misma acción que su tecla. Los que se mantienen apretados (saltar, bajar, acelerar) se leen aparte.
const PAD = { 0: 'PadA', 1: 'PadB', 2: 'KeyQ', 3: 'KeyM', 4: 'GearDown', 5: 'GearUp', 8: 'KeyT', 9: 'KeyH', 10: 'KeyF', 11: 'KeyV', 14: 'PadLeft', 15: 'PadRight' };
const dead = (v) => (Math.abs(v) < 0.16 ? 0 : (v - Math.sign(v) * 0.16) / 0.84); // zona muerta: los sticks nunca vuelven al cero exacto

export class Input {
  constructor(canvas, stickEl) {
    this.move = { x: 0, y: 0 };   // x: derecha, y: adelante (relativo a la cámara)
    this.lookX = 0; this.lookY = 0; this.zoom = 0;
    this.jump = false; this.jumpHeld = false; this.boost = false; this.auto = false; this.descend = false;
    this.touchJump = false; this.touchDown = false;
    this.pads = 0; this.padPrev = []; this.padName = '';
    addEventListener('gamepadconnected', (e) => { this.pads++; this.padName = e.gamepad.id; this.handlers.PadOn?.(e.gamepad.id); });
    addEventListener('gamepaddisconnected', () => { this.pads = Math.max(0, this.pads - 1); this.padPrev.length = 0; this.handlers.PadOff?.(); });
    this.keys = new Set(); this.handlers = {};
    this.joy = null; this.joyVec = { x: 0, y: 0 };
    this.pointers = new Map(); this.pinch = 0;
    this.stickEl = stickEl; this.knob = stickEl.firstElementChild;
    this.lastLook = -10;

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
      const k = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
      if (!e.repeat) {
        if (k === 'Space') this.jump = true;
        if (k === 'KeyE') this.auto = !this.auto;
        this.handlers[k]?.();
      }
      this.keys.add(k);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch' && !this.joy && e.clientX < innerWidth * 0.42 && e.clientY > innerHeight * 0.3) {
        this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
        stickEl.style.left = e.clientX + 'px'; stickEl.style.top = e.clientY + 'px'; stickEl.classList.add('on');
        return;
      }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinch = 0;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        const R = 56; let dx = (e.clientX - this.joy.x) / R, dy = (e.clientY - this.joy.y) / R;
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        this.joyVec.x = dx; this.joyVec.y = -dy;
        this.knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
        return;
      }
      const p = this.pointers.get(e.pointerId); if (!p) return;
      if (this.pointers.size === 1) {
        this.lookX += e.clientX - p.x; this.lookY += e.clientY - p.y; this.lastLook = performance.now() / 1000;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.zoom += (this.pinch - d) * 0.012;
        this.pinch = d;
      }
    });
    const up = (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy = null; this.joyVec.x = this.joyVec.y = 0; stickEl.classList.remove('on'); this.knob.style.transform = '';
      }
      this.pointers.delete(e.pointerId); this.pinch = 0;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom += Math.sign(e.deltaY) * Math.min(1.5, Math.abs(e.deltaY) / 100); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  }
  on(code, fn) { this.handlers[code] = fn; }
  _pad() {
    if (!this.pads || !navigator.getGamepads) return null;
    let any = null;
    for (const g of navigator.getGamepads()) { if (!g || !g.connected) continue; if (g.mapping === 'standard') return g; any = any || g; }
    return any;
  }
  // Vibración del control (si la tiene): fuerte = motor grave, débil = motor agudo.
  rumble(strong, weak, ms) {
    const g = this._pad(), a = g && g.vibrationActuator;
    if (a && a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {});
  }
  // Llamar una vez por frame: deja `move` listo y devuelve los deltas acumulados.
  poll(dt = 0.016) {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; if (y < 0) this.auto = false; }
    else { x = this.joyVec.x; y = this.joyVec.y; }
    let padJump = false, padDown = false, padBoost = false;
    const g = this._pad();
    if (g) {
      const lx = dead(g.axes[0] || 0), ly = dead(g.axes[1] || 0), rx = dead(g.axes[2] || 0), ry = dead(g.axes[3] || 0);
      if (!(x || y) && (lx || ly)) { x = lx; y = -ly; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } if (y < -0.5) this.auto = false; }
      // Stick derecho: mirar. Respuesta cuadrática, para apuntar fino cerca del centro y girar rápido a fondo.
      if (rx || ry) { this.lookX += rx * Math.abs(rx) * 640 * dt; this.lookY += ry * Math.abs(ry) * 430 * dt; this.lastLook = performance.now() / 1000; }
      const b = g.buttons, down = (i) => !!b[i] && (b[i].pressed || b[i].value > 0.5), P = this.padPrev;
      for (let i = 0; i < 16 && i < b.length; i++) {
        const d = down(i);
        if (d && !P[i]) {
          if (i === 0) this.jump = true;
          if (i === 10) this.auto = !this.auto;
          if (PAD[i]) this.handlers[PAD[i]]?.();
        }
        P[i] = d;
      }
      padJump = down(0); padDown = down(1) || down(6); padBoost = down(7);
      if (down(12)) this.zoom -= dt * 3.5; if (down(13)) this.zoom += dt * 3.5; // cruceta arriba/abajo: acercar o alejar la cámara
    }
    if (this.auto && !(x || y)) y = 1;
    this.move.x = x; this.move.y = y;
    this.boost = k.has('ShiftLeft') || k.has('ShiftRight') || padBoost;
    this.jumpHeld = k.has('Space') || this.touchJump || padJump;
    this.descend = k.has('KeyC') || this.touchDown || padDown;
    const out = { lookX: this.lookX, lookY: this.lookY, zoom: this.zoom, jump: this.jump };
    this.lookX = this.lookY = this.zoom = 0; this.jump = false;
    return out;
  }
}
