// Lo que el jugador va conquistando: el mapa que ha visto (niebla de exploración), las cumbres que ha hecho y los
// secretos que ha encontrado. Todo se guarda en el navegador. La idea es que la cordillera sea un misterio que se
// va abriendo con las patas: el mapa parte tapado, una cumbre destapa todo lo que se ve desde ella, y los secretos
// no figuran en ninguna parte hasta que se llega.
import { SECRETOS } from './secretos.js';

const KEY = 'cordillera:progreso:v1', CELL = 500; // m por celda de la niebla
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export class Progress {
  constructor({ manifest, player, labels, hf, audio, ui }) {
    Object.assign(this, { m: manifest, player, labels, hf, audio, ui });
    this.gw = Math.ceil(manifest.core.sizeX / CELL); this.gh = Math.ceil(manifest.core.sizeZ / CELL);
    this.fog = new Uint8Array(this.gw * this.gh); this.seen = 0; // 1 = visto
    this.data = { cumbres: {}, secretos: [], muertes: 0, desnivel: 0 };
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s) { Object.assign(this.data, s.data); const b = atob(s.fog || ''); for (let i = 0; i < b.length && i * 8 < this.fog.length; i++) for (let k = 0; k < 8; k++) if (b.charCodeAt(i) & (1 << k)) this.fog[i * 8 + k] = 1; }
    } catch { /* sin almacenamiento o dato corrupto: se parte de cero */ }
    for (let i = 0; i < this.fog.length; i++) this.seen += this.fog[i];
    this.cumbres = labels.items.filter((it) => it.group === 'cumbres' && !it.far && it.ele > 0 && it.kind !== 'paso');
    this.secretos = SECRETOS.map((s) => ({ ...s, x: (s.lon - manifest.core.west) * manifest.mPerDegLon, z: (manifest.core.north - s.lat) * manifest.mPerDegLat, hinted: -1e9 }));
    this.found = new Set(this.data.secretos);
    // Lienzo de la niebla: un píxel por celda; al dibujarlo ampliado, el filtrado suaviza los bordes.
    this.cv = document.createElement('canvas'); this.cv.width = this.gw; this.cv.height = this.gh;
    this.g = this.cv.getContext('2d'); this.img = this.g.createImageData(this.gw, this.gh);
    for (let i = 0; i < this.fog.length; i++) { this.img.data[i * 4] = 9; this.img.data[i * 4 + 1] = 13; this.img.data[i * 4 + 2] = 17; this.img.data[i * 4 + 3] = this.fog[i] ? 0 : 215; }
    this.g.putImageData(this.img, 0, 0);
    this.tick = 0; this.dirty = false; this.tSave = 0; this.lastY = null; this.ascent = 0; this.tAsc = performance.now();
    addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
  }
  get pct() { return (this.seen / this.fog.length) * 100; }
  save() {
    if (!this.dirty) return;
    this.dirty = false; this.data.secretos = [...this.found];
    let b = ''; for (let i = 0; i < this.fog.length; i += 8) { let v = 0; for (let k = 0; k < 8; k++) if (this.fog[i + k]) v |= 1 << k; b += String.fromCharCode(v); }
    try { localStorage.setItem(KEY, JSON.stringify({ data: this.data, fog: btoa(b) })); } catch { /* sin almacenamiento */ }
  }
  explored(x, z) { const i = Math.floor(x / CELL), j = Math.floor(z / CELL); return i >= 0 && j >= 0 && i < this.gw && j < this.gh && this.fog[j * this.gw + i] === 1; }
  reveal(x, z, r) {
    const i0 = Math.max(0, Math.floor((x - r) / CELL)), i1 = Math.min(this.gw - 1, Math.floor((x + r) / CELL)), j0 = Math.max(0, Math.floor((z - r) / CELL)), j1 = Math.min(this.gh - 1, Math.floor((z + r) / CELL));
    let n = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * this.gw + i;
      if (this.fog[k] || Math.hypot((i + 0.5) * CELL - x, (j + 0.5) * CELL - z) > r) continue;
      this.fog[k] = 1; this.img.data[k * 4 + 3] = 0; n++;
    }
    if (n) { this.seen += n; this.dirty = true; this.g.putImageData(this.img, 0, 0); }
  }
  // Dibuja la niebla sobre un mapa: (sx, sz, sw, sh) es el rectángulo del mundo en metros; (dx, dy, dw, dh), el del lienzo.
  drawFog(g, sx, sz, sw, sh, dx, dy, dw, dh) {
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.cv, sx / CELL, sz / CELL, sw / CELL, sh / CELL, dx, dy, dw, dh);
  }
  // Viaje por el mapa: solo a lo que ya se conoce (lugares descubiertos, cumbres hechas, secretos) y a los poblados,
  // que tienen camino. Devuelve el destino permitido más cercano al punto tocado, o null.
  travelTarget(x, z) {
    let best = null, bd = 1600;
    const tryIt = (px, pz, name) => { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = { x: px, z: pz, name }; } };
    for (const it of this.labels.items) if (!it.far && it.group === 'localidades' && it.rank <= 2) tryIt(it.x, it.z, it.name);
    for (const l of this.ui.lugares) if (this.ui.seen.has(l.id)) tryIt(l.x, l.z, l.n);
    for (const it of this.cumbres) if (this.data.cumbres[it.name]) tryIt(it.x, it.z, it.name);
    for (const s of this.secretos) if (this.found.has(s.id)) tryIt(s.x, s.z, s.n);
    return best;
  }

  update(dt) {
    const p = this.player;
    // Desnivel: solo cuenta lo subido por las patas (o las alas), no lo que regala una marcha de viaje.
    if (this.lastY !== null && p.y > this.lastY && p.speed < 40 && p.y - this.lastY < 3) { this.ascent += p.y - this.lastY; this.data.desnivel += p.y - this.lastY; }
    this.lastY = p.y;
    if ((this.tick -= dt) > 0) return;
    this.tick = 0.5;
    const ground = this.hf.base(p.x, p.z), agl = Math.max(0, p.y - ground);
    this.reveal(p.x, p.z, 1100 + Math.min(4500, agl * 7)); // desde el aire se ve más lejos
    // --- cumbres: hay que estar parado arriba, no pasar volando ni a 600 km/h
    if (p.grounded && p.speed < 30) for (const it of this.cumbres) {
      if (this.data.cumbres[it.name] || Math.abs(it.x - p.x) > 90 || Math.abs(it.z - p.z) > 90) continue;
      if (Math.hypot(it.x - p.x, it.z - p.z) < 90 && p.y > this.hf.base(it.x, it.z) - 30) this.summit(it);
    }
    // --- secretos: de lejos, una pista; al llegar, se revela
    const now = performance.now();
    for (const s of this.secretos) {
      if (this.found.has(s.id)) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < s.r && p.speed < 45) { this.discover(s); continue; }
      if (d < Math.max(1200, s.r * 6) && now - s.hinted > 180000 && p.speed < 45) {
        s.hinted = now; this.ui.toast('Algo hay por aquí cerca… ' + s.pista, 5200); this.audio.play('ability', { gain: 0.35 });
      }
    }
    if (this.dirty && now - this.tSave > 15000) { this.tSave = now; this.save(); }
  }
  summit(it) {
    const n = Object.keys(this.data.cumbres).length + 1, mins = Math.max(1, Math.round((performance.now() - this.tAsc) / 60000));
    this.data.cumbres[it.name] = [it.ele, Date.now()]; this.dirty = true;
    this.reveal(it.x, it.z, 7500); // desde arriba se ve todo: la cumbre destapa el mapa a su alrededor
    // Qué cumbres importantes se ven de verdad desde aquí (línea de vista sobre el relieve).
    const top = this.hf.base(it.x, it.z) + 3, vis = [];
    for (const o of this.cumbres) {
      if (o === it || o.rank > 1) continue;
      const d = Math.hypot(o.x - it.x, o.z - it.z);
      if (d < 70000 && this.hf.visible(it.x, top, it.z, o.x, this.hf.base(o.x, o.z), o.z)) vis.push(o);
    }
    vis.sort((a, b) => a.rank - b.rank || b.ele - a.ele);
    const see = vis.slice(0, 5).map((o) => `${o.name} (${fmt(o.ele)} m)`).join(', ');
    this.ui.queue.length = 0;
    this.ui.showCard({
      tag: `Cumbre ${n} de ${this.cumbres.length}`, title: it.name,
      text: `${fmt(it.ele)} m sobre el nivel del mar. Subiste ${fmt(this.ascent)} m de desnivel en ${mins} min para llegar aquí.` + (see ? ` Desde esta cumbre se ven: ${see}.` : '') + ' El mapa se abrió a tu alrededor.',
      foot: 'Queda anotada en tu libro de cumbres (Guía).',
    }, true);
    this.audio.play('summit'); this.ascent = 0; this.tAsc = performance.now(); this.save(); this.ui.refreshProgress();
  }
  discover(s) {
    this.found.add(s.id); this.dirty = true; this.reveal(s.x, s.z, 2500);
    this.ui.queue.length = 0;
    this.ui.showCard({ tag: `Secreto ${this.found.size} de ${this.secretos.length} · ${s.cat}`, title: s.n, text: s.d, foot: 'Nadie te lo había mostrado: lo encontraste tú. Queda en tu bitácora (Guía).' }, true);
    this.audio.play('summit'); this.save(); this.ui.refreshProgress();
  }
  death() { this.data.muertes++; this.dirty = true; this.ascent = 0; this.tAsc = performance.now(); }
}
