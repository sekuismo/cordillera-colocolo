// Senderos reales con nombre (OpenStreetMap, medidos sobre el relieve por tools/build_senderos.mjs).
//
// Al pisar uno, el juego dice cuál es, cuánto mide y cuánto sube; la primera vez sale su ficha. Mientras se camina se
// van marcando tramos de 100 m, y al haber recorrido casi todo (85 %) queda completado en la bitácora. Así el sendero
// funciona como lo que es en la montaña de verdad: una línea que otro trazó y que uno decide seguir o no.
const BIN = 100, ON = 22, DONE = 0.85; // m por tramo, m al eje para estar "en" el sendero, fracción para completarlo
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const km = (m) => (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',');

export class Senderos {
  constructor({ labels, ui, audio, player, hf, progress }) {
    Object.assign(this, { labels, ui, audio, player, hf, progress });
    this.items = []; this.cur = null; this.tick = 0; this.lastToast = new Map();
    this.state = (progress.data.senderos ??= {}); // clave → [tramos visitados…] o 'ok' si está completo
    fetch(new URL('../data/senderos.json', import.meta.url)).then((r) => r.json()).then((d) => this._init(d)).catch(() => {});
  }
  _init(d) {
    const count = new Map();
    for (const [name, len, up, lo, hi, top, p] of d.items) {
      const k = (count.get(name) || 0) + 1; count.set(name, k);
      const pts = new Float32Array(p), cum = new Float32Array(p.length / 2);
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        if (i) cum[i / 2] = cum[i / 2 - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
        x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]);
      }
      // Clave estable aunque haya varios senderos con el mismo nombre (OSM tiene tres "Sendero Salto de Apoquindo").
      this.items.push({ key: k > 1 ? `${name} #${k}` : name, name, len, up, lo, hi, top, pts, cum, x0, z0, x1, z1, bins: Math.max(1, Math.ceil(len / BIN)) });
    }
    // El inicio de cada sendero largo queda como lugar con nombre en el paisaje.
    this.labels.add(this.items.filter((s) => s.len > 1500).map((s) => ({ name: s.name, kind: 'sendero', x: s.pts[0], z: s.pts[1], rank: 3, note: `sendero · ${km(s.len)} km · +${fmt(s.up)} m` })));
    this.ui.refreshProgress();
  }
  get total() { return this.items.length; }
  get done() { let n = 0; for (const s of this.items) if (this.state[s.key] === 'ok') n++; return n; }
  doneList() { return this.items.filter((s) => this.state[s.key] === 'ok'); }

  // Sendero bajo el jugador: el más cercano a menos de ON m, con la distancia recorrida a lo largo de él.
  _at(x, z) {
    let best = null, bd = ON, bs = 0;
    for (const s of this.items) {
      if (x < s.x0 - ON || x > s.x1 + ON || z < s.z0 - ON || z > s.z1 + ON) continue;
      const p = s.pts;
      for (let i = 0; i < p.length - 2; i += 2) {
        const ex = p[i + 2] - p[i], ez = p[i + 3] - p[i + 1], l2 = ex * ex + ez * ez || 1e-6;
        let t = ((x - p[i]) * ex + (z - p[i + 1]) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - p[i] - ex * t, z - p[i + 1] - ez * t);
        if (d < bd) { bd = d; best = s; bs = s.cum[i / 2] + Math.sqrt(l2) * t; }
      }
    }
    return best && { s: best, along: bs };
  }

  update(dt) {
    if ((this.tick -= dt) > 0 || !this.items.length) return;
    this.tick = 0.4;
    const p = this.player;
    // A velocidad de viaje o volando alto no se está "caminando" un sendero.
    if (p.speed > 25 || p.y - this.hf.base(p.x, p.z) > 20) { this.cur = null; return; }
    const hit = this._at(p.x, p.z);
    if (!hit) { this.cur = null; return; }
    const { s, along } = hit, st = this.state[s.key];
    if (s !== this.cur) {
      this.cur = s;
      const now = performance.now(), last = this.lastToast.get(s.key) || -1e9;
      if (st === undefined) {
        this.ui.showCard({ tag: 'Sendero', title: s.name, text: `${km(s.len)} km de largo y ${fmt(s.up)} m de subida acumulada, entre los ${fmt(s.lo)} y los ${fmt(s.top)} m de altitud. Recórrelo casi entero y queda en tu bitácora.`, foot: `Trazado real de OpenStreetMap · ${this.done} de ${this.total} senderos completados` });
        this.state[s.key] = []; this.progress.dirty = true;
      } else if (now - last > 120000) this.ui.toast(`Sendero ${s.name}${st === 'ok' ? ' · ya lo completaste' : ' · ' + Math.round((st.length / s.bins) * 100) + ' % recorrido'}`, 2600);
      this.lastToast.set(s.key, now);
    }
    if (st === 'ok') return;
    const bins = this.state[s.key], b = Math.min(s.bins - 1, Math.floor(along / BIN));
    if (bins.includes(b)) return;
    bins.push(b); this.progress.dirty = true;
    if (bins.length >= Math.ceil(s.bins * DONE)) {
      this.state[s.key] = 'ok';
      this.ui.queue.length = 0;
      this.ui.showCard({ tag: `Sendero completado · ${this.done} de ${this.total}`, title: s.name, text: `Recorriste sus ${km(s.len)} km y sus ${fmt(s.up)} m de subida. Lo trazaron caminantes como tú, a pie y con GPS, para que otros lo pudieran seguir.`, foot: 'Queda en tu bitácora (Guía).' }, true);
      this.audio.play('summit', { gain: 0.8 }); this.progress.save(); this.ui.refreshProgress();
    }
  }
}
