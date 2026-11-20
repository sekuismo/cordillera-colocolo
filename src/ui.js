// Interfaz: HUD, fichas educativas, guía, mapa con viaje rápido y capas.
import { LUGARES, PISOS, INTRO, ESTACIONES, TORMENTA } from './lugares.js';
import { SEASONS } from './env.js';
import { SPEEDS } from './player.js';

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const STORE = 'cordillera:v1';

export class UI {
  constructor({ manifest, player, labels, terrain, env, input, quality, border }) {
    Object.assign(this, { m: manifest, player, labels, terrain, env, input, quality, border });
    this.saved = { seen: [], pisos: [], layers: {}, hour: 9.5, year: 0.04, auto: true, epocas: [], tormenta: false };
    try { Object.assign(this.saved, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch { /* almacenamiento bloqueado: se juega igual */ }
    this.seen = new Set(this.saved.seen); this.pisos = new Set(this.saved.pisos);
    this.lugares = LUGARES.map((l) => ({ ...l, x: (l.lon - manifest.core.west) * manifest.mPerDegLon, z: (manifest.core.north - l.lat) * manifest.mPerDegLat }));
    this.info = true; this.queue = []; this.cardTimer = 0; this.inside = new Set();
    this.country = 'cl'; this.tick = 0; this.hudTick = 0; this.miniTick = 0; this.edgeToast = 0; this.target = null;

    // --- paneles
    document.querySelectorAll('#menu button').forEach((b) => b.addEventListener('click', () => this.toggle(b.dataset.panel)));
    document.querySelectorAll('.panel .close').forEach((b) => b.addEventListener('click', () => this.toggle(null)));
    addEventListener('keydown', (e) => { if (e.code === 'Escape') { this.toggle(null); this.closeCard(); } });
    input.on('KeyM', () => this.toggle('mapa'));
    input.on('KeyH', () => this.toggle('ayuda'));
    input.on('KeyN', () => { const on = !Object.values(labels.enabled).some(Boolean); for (const g of ['cumbres', 'localidades', 'agua', 'lugares']) this.setLayer(g, on); this.toast(on ? 'Nombres visibles' : 'Nombres ocultos'); });

    // --- capas
    document.querySelectorAll('[data-layer]').forEach((c) => {
      const k = c.dataset.layer; if (k in this.saved.layers) c.checked = this.saved.layers[k];
      this.setLayer(k, c.checked, false);
      c.addEventListener('change', () => this.setLayer(k, c.checked));
    });
    const hora = $('#hora'), setHour = (h, save = true) => {
      env.setHour(h); const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
      $('#hora-out').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${h < 7 ? 'amanecer' : h < 11.5 ? 'mañana' : h < 14.5 ? 'mediodía' : h < 17.6 ? 'tarde' : 'atardecer'}`;
      if (save) { this.saved.hour = h; this.save(); }
    };
    hora.value = this.saved.hour; setHour(+hora.value, false);
    hora.addEventListener('input', () => setHour(+hora.value));

    // --- estaciones
    this.epocas = new Set(this.saved.epocas); this.seasonDelay = 45; this.wasStorm = false;
    const epoca = (this.epoca = $('#epoca')), auto = $('#epoca-auto'), storm = $('#tormenta');
    env.year = this.saved.year; env.auto = auto.checked = this.saved.auto; env.setYear(env.year);
    epoca.addEventListener('input', () => { env.auto = auto.checked = false; env.setYear(+epoca.value); this.saved.auto = false; this.saved.year = env.year; this.save(); });
    auto.addEventListener('change', () => { env.auto = this.saved.auto = auto.checked; this.save(); });
    storm.addEventListener('click', () => {
      if (env.winter < 0.25) return this.toast('En verano casi no entran frentes: prueba en otoño o invierno', 3200);
      env.forceStorm = !env.forceStorm; storm.classList.toggle('on', env.forceStorm);
      storm.textContent = env.forceStorm ? 'Dejar que pase la tormenta' : 'Provocar una tormenta';
    });
    document.querySelectorAll('#calidad button').forEach((b) => {
      b.classList.toggle('on', b.dataset.q === quality.tier);
      b.addEventListener('click', () => { if (b.dataset.q !== quality.tier) { const u = new URL(location.href); u.searchParams.set('q', b.dataset.q); location.href = u; } });
    });

    // --- marchas y salto
    this.levelBtns = [...document.querySelectorAll('#speed-levels button')];
    this.levelBtns.forEach((b, i) => { b.addEventListener('click', () => this.setLevel(i)); input.on('Digit' + (i + 1), () => this.setLevel(i)); });
    this.setLevel(player.level, false);
    const jb = $('#jump');
    jb.addEventListener('pointerdown', (e) => { e.preventDefault(); input.jump = true; input.touchJump = true; });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jb.addEventListener(ev, () => { input.touchJump = false; });
    input.on('KeyV', () => { player.firstPerson = !player.firstPerson; this.toast(player.firstPerson ? 'Primera persona' : 'Tercera persona'); });
    input.onLock = (on) => this.toast(on ? 'Mouse capturado · Esc para soltarlo' : 'Mouse libre · clic en el paisaje para volver a mirar', 2600);

    // --- ficha
    $('#card-close').addEventListener('click', () => this.closeCard());

    // --- guía
    const list = $('#guia-list');
    for (const l of this.lugares) {
      const li = document.createElement('li'); li.dataset.id = l.id;
      li.innerHTML = `<div><b></b><small></small></div><button>Ir</button>`;
      li.querySelector('b').textContent = l.n; li.querySelector('small').textContent = l.t;
      li.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') { this.travel(l.x, l.z, l.n); return; }
        this.queue.length = 0; this.showCard({ tag: l.t, title: l.n, text: l.d, foot: this.seen.has(l.id) ? 'Ya estuviste aquí' : 'Aún no lo visitas' }, true);
        if (matchMedia('(max-width: 820px)').matches) this.toggle(null);
      });
      list.appendChild(li); l.li = li;
    }
    this.refreshGuide();

    // --- mapas
    this.mapImg = new Image(); this.mapImg.src = new URL('../data/' + manifest.map, import.meta.url).href;
    this.mini = $('#mini'); this.mini.addEventListener('click', () => this.toggle('mapa'));
    this.big = $('#bigmap');
    this.big.addEventListener('pointerdown', (e) => {
      const r = this.big.getBoundingClientRect();
      this.target = { x: ((e.clientX - r.left) / r.width) * manifest.core.sizeX, z: ((e.clientY - r.top) / r.height) * manifest.core.sizeZ };
      const near = labels.nearest(this.target.x, this.target.z);
      const km = Math.hypot(this.target.x - player.x, this.target.z - player.z) / 1000;
      $('#map-hint').textContent = `${near ? near.name : 'Punto en la cordillera'} · a ${km.toFixed(km < 10 ? 1 : 0)} km`;
      $('#map-go').hidden = false; this.drawBig();
    });
    $('#map-go').addEventListener('click', () => { if (this.target) this.travel(this.target.x, this.target.z); });

    // --- brújula
    const tape = $('#compass-tape'), names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    for (let d = 0; d <= 720; d += 45) {
      const s = document.createElement('span'), n = names[(((d - 180) / 45) % 8 + 8) % 8];
      s.textContent = n; s.style.left = d * 2 + 'px'; if (n.length === 1) s.className = 'card';
      tape.appendChild(s);
    }
    this.tape = tape;
  }

  save() {
    this.saved.seen = [...this.seen]; this.saved.pisos = [...this.pisos];
    try { localStorage.setItem(STORE, JSON.stringify(this.saved)); } catch { /* sin almacenamiento */ }
  }
  setLayer(k, on, save = true) {
    const c = document.querySelector(`[data-layer="${k}"]`); if (c) c.checked = on;
    if (k === 'caminos') this.terrain.uniforms.uShow.value.x = on ? 1 : 0;
    else if (k === 'limite') this.terrain.uniforms.uShow.value.y = on ? 1 : 0;
    else if (k === 'info') { this.info = on; if (!on) { this.queue.length = 0; this.closeCard(); } }
    else this.labels.setLayer(k, on);
    if (save) { this.saved.layers[k] = on; this.save(); }
  }
  setLevel(i, announce = true) {
    this.player.level = i; this.levelBtns.forEach((b, k) => b.classList.toggle('on', k === i));
    if (announce) this.toast(`${SPEEDS[i].name} · ${Math.round(SPEEDS[i].v * 3.6)} km/h`);
  }
  toggle(name) {
    for (const p of document.querySelectorAll('.panel')) p.hidden = name === null || p.id !== 'panel-' + name || !p.hidden;
    if (name && document.pointerLockElement) document.exitPointerLock();
    const open = document.querySelector('.panel:not([hidden])');
    document.querySelectorAll('#menu button').forEach((b) => b.classList.toggle('on', !!open && open.id === 'panel-' + b.dataset.panel));
    if (open && open.id === 'panel-mapa') { this.target = null; $('#map-go').hidden = true; $('#map-hint').textContent = 'Toca cualquier punto del mapa para viajar ahí.'; this.drawBig(); }
  }
  toast(text, ms = 2200) {
    const t = $('#toast'); t.textContent = text; t.classList.add('on');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), ms);
  }
  travel(x, z, name) {
    const p = this.player;
    p.teleport(x, z, Math.atan2(x - p.x, z - p.z));
    this.toggle(null); this.inside.clear();
    this.toast(name ? `Llegaste a ${name}` : 'Viaje rápido', 2600);
  }

  // --- fichas
  showCard(c, now = false) {
    if (!now && (!this.info || this.card)) { if (this.info && this.queue.length < 3) this.queue.push(c); return; }
    this.card = c;
    $('#card-tag').textContent = c.tag; $('#card-title').textContent = c.title; $('#card-text').textContent = c.text; $('#card-foot').textContent = c.foot || '';
    const el = $('#card'); el.hidden = true; void el.offsetWidth; el.hidden = false;
    this.cardTimer = 9 + c.text.length * 0.055; // tiempo de lectura proporcional al texto
  }
  closeCard() { this.card = null; $('#card').hidden = true; this.cardTimer = 0; }
  refreshGuide() {
    for (const l of this.lugares) l.li.classList.toggle('seen', this.seen.has(l.id));
    $('#guia-count').textContent = `${this.seen.size}/${this.lugares.length}`;
  }
  intro() { this.showCard({ tag: INTRO.t, title: INTRO.n, text: INTRO.d, foot: 'Puedes apagar estas fichas en Capas.' }, true); }

  // ¿De qué lado del límite está el punto? Rayo hacia el oeste: cruces impares = Argentina.
  _country(x, z) {
    const b = this.border; if (!b) return 'cl';
    let n = 0; const c = b.coords;
    for (let k = 0; k < b.types.length; k++) for (let i = b.offsets[k]; i < b.offsets[k + 1] - 1; i++) {
      const z0 = c[i * 2 + 1], z1 = c[i * 2 + 3];
      if ((z0 > z) !== (z1 > z) && c[i * 2] + ((z - z0) / (z1 - z0)) * (c[i * 2 + 2] - c[i * 2]) < x) n++;
    }
    return n & 1 ? 'ar' : 'cl';
  }

  update(dt, camera) {
    const p = this.player, m = this.m;
    // brújula (cada frame)
    const bearing = ((Math.atan2(Math.sin(p.camYaw), -Math.cos(p.camYaw)) * 180) / Math.PI + 360) % 360;
    this.tape.style.transform = `translateX(${(this.tape.parentElement.clientWidth / 2 - (bearing + 180) * 2).toFixed(1)}px)`;

    if (this.card && this.cardTimer > 0 && (this.cardTimer -= dt) <= 0) this.closeCard();
    if (!this.card && this.queue.length) this.showCard(this.queue.shift(), true);

    if ((this.hudTick -= dt) <= 0) {
      this.hudTick = 0.2;
      const lat = m.core.north - p.z / m.mPerDegLat, lon = m.core.west + p.x / m.mPerDegLon;
      const near = this.labels.nearest(p.x, p.z);
      $('#place-name').textContent = near ? near.name : this.country === 'ar' ? 'Cordillera de Mendoza' : 'Cordillera de Santiago';
      $('#place-meta').textContent = `${fmt(p.y)} m s. n. m. · ${Math.abs(lat).toFixed(3).replace('.', ',')}° S ${Math.abs(lon).toFixed(3).replace('.', ',')}° O`;
      const env = this.env, temp = Math.round(env.temperature(p.y)), line = fmt(Math.round(env.snowLine / 50) * 50);
      const sky = env.storm > 0.4 ? (env.snowingHere ? 'nevando' : `lloviendo (nieva sobre ${fmt(Math.round(env.fallLine / 50) * 50)} m)`) : `nieve sobre ${line} m`;
      $('#place-clima').textContent = `${SEASONS[env.season]} · ${temp} °C · ${sky}`;
      $('#epoca-out').textContent = `${SEASONS[env.season]} · ${env.month}`;
      if (env.auto) { this.epoca.value = env.year; this.saved.year = env.year; }
      if (!env.forceStorm && $('#tormenta').classList.contains('on')) { $('#tormenta').classList.remove('on'); $('#tormenta').textContent = 'Provocar una tormenta'; }
      $('#kmh').textContent = `${fmt(p.speed * 3.6)} km/h · ${(p.odo / 1000).toFixed(p.odo < 1e5 ? 1 : 0).replace('.', ',')} km recorridos`;
      // Próximo lugar sin visitar, con rumbo y distancia: ayuda a dimensionar cuánto falta de verdad.
      let nextL = null, nd = Infinity;
      for (const l of this.lugares) { if (this.seen.has(l.id)) continue; const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < nd) { nd = d; nextL = l; } }
      if (nextL) {
        const brg = ((Math.atan2(nextL.x - p.x, -(nextL.z - p.z)) * 180) / Math.PI + 360) % 360, dir = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(brg / 45) % 8];
        const eta = p.speed > 1 ? nd / p.speed : 0;
        $('#place-next').textContent = `Próximo: ${nextL.n} · ${(nd / 1000).toFixed(nd < 1e4 ? 1 : 0).replace('.', ',')} km al ${dir}${eta > 5 ? ` · ${eta > 5400 ? (eta / 3600).toFixed(1).replace('.', ',') + ' h' : eta > 90 ? Math.round(eta / 60) + ' min' : Math.round(eta) + ' s'}` : ''}`;
      } else $('#place-next').textContent = '';
    }
    if ((this.tick -= dt) <= 0) {
      this.tick = 0.3;
      for (const l of this.lugares) {
        const inside = Math.hypot(l.x - p.x, l.z - p.z) < l.r;
        if (inside && !this.inside.has(l.id)) {
          const first = !this.seen.has(l.id);
          this.showCard({ tag: l.t, title: l.n, text: l.d, foot: first ? `Lugar ${this.seen.size + 1} de ${this.lugares.length} descubierto` : '' });
          if (first) { this.seen.add(l.id); this.refreshGuide(); this.save(); }
        }
        inside ? this.inside.add(l.id) : this.inside.delete(l.id);
      }
      const piso = PISOS.findIndex((s) => p.y >= s.min && p.y < s.max);
      if (piso >= 0 && !this.pisos.has(piso) && p.speed < 80) {
        this.pisos.add(piso); this.save();
        this.showCard({ tag: `Piso de vegetación · ${fmt(PISOS[piso].min)}–${PISOS[piso].max > 8000 ? '6.570' : fmt(PISOS[piso].max)} m`, title: PISOS[piso].n, text: PISOS[piso].d });
      }
      // Estaciones y clima: ficha la primera vez que llega cada estación y en la primera tormenta.
      const env = this.env;
      if ((this.seasonDelay -= 0.3) <= 0 && !this.epocas.has(env.season)) {
        this.epocas.add(env.season); this.saved.epocas = [...this.epocas]; this.save();
        this.showCard({ tag: `Estación · ${env.month}`, title: ESTACIONES[env.season].n, text: ESTACIONES[env.season].d });
      }
      const stormy = env.storm > 0.5;
      if (stormy !== this.wasStorm) {
        this.wasStorm = stormy;
        if (stormy) {
          this.toast(`Entra un frente: isoterma 0 °C a ${fmt(Math.round(env.iso0 / 50) * 50)} m`, 4200);
          if (!this.saved.tormenta) { this.saved.tormenta = true; this.save(); this.showCard({ tag: TORMENTA.t, title: TORMENTA.n, text: TORMENTA.d }); }
        } else this.toast('Pasó el frente: mira hasta dónde bajó la nieve', 3600);
      }
      const c = this._country(p.x, p.z);
      if (c !== this.country) { this.country = c; this.toast(c === 'ar' ? 'Cruzaste el límite: estás en Argentina' : 'De vuelta en Chile', 3600); }
      if (p.atEdge && (this.edgeToast -= 0.3) <= 0) { this.edgeToast = 4; this.toast('Fin del área explorable'); }
    }
    if ((this.miniTick -= dt) <= 0) { this.miniTick = 0.12; this.drawMini(); if (!$('#panel-mapa').hidden) this.drawBig(); }
  }

  _arrow(g, x, y, heading, s) {
    g.save(); g.translate(x, y); g.rotate(Math.PI - heading);
    g.beginPath(); g.moveTo(0, -s); g.lineTo(s * 0.72, s * 0.8); g.lineTo(0, s * 0.38); g.lineTo(-s * 0.72, s * 0.8); g.closePath();
    g.fillStyle = '#e8b25c'; g.strokeStyle = '#1c1407'; g.lineWidth = s * 0.16; g.fill(); g.stroke(); g.restore();
  }
  drawMini() {
    const cv = this.mini, g = cv.getContext('2d'), img = this.mapImg, p = this.player, m = this.m;
    if (!img.complete || !img.naturalWidth) return;
    const span = 16000, W = cv.width; // metros visibles a lo ancho
    const sx = (v) => (v / m.core.sizeX) * img.naturalWidth, sz = (v) => (v / m.core.sizeZ) * img.naturalHeight;
    g.fillStyle = '#1a1f22'; g.fillRect(0, 0, W, W);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx(p.x - span / 2), sz(p.z - span / 2), sx(span), sz(span), 0, 0, W, W);
    for (const l of this.lugares) {
      const x = ((l.x - p.x) / span + 0.5) * W, y = ((l.z - p.z) / span + 0.5) * W;
      if (x < 0 || y < 0 || x > W || y > W) continue;
      g.beginPath(); g.arc(x, y, 7, 0, 7); g.fillStyle = this.seen.has(l.id) ? '#e8b25c' : 'rgba(255,255,255,.9)'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#1c1407'; g.stroke();
    }
    this._arrow(g, W / 2, W / 2, p.heading, 17);
  }
  drawBig() {
    const cv = this.big, img = this.mapImg, p = this.player, m = this.m;
    if (!img.complete || !img.naturalWidth) return;
    if (cv.width !== img.naturalWidth * 2) { cv.width = img.naturalWidth * 2; cv.height = img.naturalHeight * 2; }
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, X = (v) => (v / m.core.sizeX) * W, Z = (v) => (v / m.core.sizeZ) * H;
    g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, W, H);
    const b = this.border;
    if (b) { // límite internacional
      g.beginPath();
      for (let k = 0; k < b.types.length; k++) for (let i = b.offsets[k]; i < b.offsets[k + 1]; i++) i === b.offsets[k] ? g.moveTo(X(b.coords[i * 2]), Z(b.coords[i * 2 + 1])) : g.lineTo(X(b.coords[i * 2]), Z(b.coords[i * 2 + 1]));
      g.strokeStyle = 'rgba(255,90,70,.9)'; g.lineWidth = 2.5; g.setLineDash([9, 6]); g.stroke(); g.setLineDash([]);
    }
    g.font = '600 17px system-ui, sans-serif'; g.textBaseline = 'middle';
    for (const l of this.lugares) {
      g.beginPath(); g.arc(X(l.x), Z(l.z), 6, 0, 7); g.fillStyle = this.seen.has(l.id) ? '#e8b25c' : 'rgba(255,255,255,.92)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1c1407'; g.stroke();
    }
    for (const [t, x, z] of [['CHILE', 0.3, 0.06], ['ARGENTINA', 0.86, 0.5], ['Santiago', 0.12, 0.3]]) {
      g.fillStyle = 'rgba(255,255,255,.8)'; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 4; g.textAlign = 'center';
      g.strokeText(t, x * W, z * H); g.fillText(t, x * W, z * H);
    }
    if (this.target) {
      const x = X(this.target.x), y = Z(this.target.z);
      g.beginPath(); g.arc(x, y, 13, 0, 7); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke();
      g.beginPath(); g.moveTo(X(p.x), Z(p.z)); g.lineTo(x, y); g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
    }
    this._arrow(g, X(p.x), Z(p.z), p.heading, 15);
  }
}
