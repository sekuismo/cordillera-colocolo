// Entrada unificada: teclado + mouse en escritorio, joystick virtual + arrastre + pellizco en pantallas táctiles.
export class Input {
  constructor(canvas, stickEl) {
    this.move = { x: 0, y: 0 };   // x: derecha, y: adelante (relativo a la cámara)
    this.lookX = 0; this.lookY = 0; this.zoom = 0;
    this.jump = false; this.jumpHeld = false; this.boost = false; this.auto = false; this.locked = false; this.onLock = null;
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
      if (this.pointers.size === 1 && !this.locked) {
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

    // Mirada tipo FPS: un clic captura el mouse (Pointer Lock) y la cámara sigue al mouse sin arrastrar; Esc lo suelta.
    canvas.addEventListener('click', (e) => {
      if (e.pointerType === 'touch' || !matchMedia('(pointer: fine)').matches || document.pointerLockElement) return;
      try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* el navegador puede negarlo: queda el arrastre */ }
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; this.onLock?.(this.locked); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookX += e.movementX; this.lookY += e.movementY; this.lastLook = performance.now() / 1000;
    });
  }
  on(code, fn) { this.handlers[code] = fn; }
  // Llamar una vez por frame: deja `move` listo y devuelve los deltas acumulados.
  poll() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; if (y < 0) this.auto = false; }
    else { x = this.joyVec.x; y = this.joyVec.y; }
    if (this.auto && !(x || y)) y = 1;
    this.move.x = x; this.move.y = y;
    this.boost = k.has('ShiftLeft') || k.has('ShiftRight'); this.jumpHeld = k.has('Space') || this.touchJump;
    const out = { lookX: this.lookX, lookY: this.lookY, zoom: this.zoom, jump: this.jump };
    this.lookX = this.lookY = this.zoom = 0; this.jump = false;
    return out;
  }
}
