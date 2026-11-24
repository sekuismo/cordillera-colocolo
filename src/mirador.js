// Desafío del mirador: en una cumbre, el juego esconde los nombres de los cerros y pregunta "¿dónde está El Plomo?".
// El jugador gira la cámara hasta tenerlo al centro y marca (F, o el botón). Se puntúa por qué tan cerca apuntó, no por
// acertar o fallar, y después se muestra dónde estaba. Es la forma de aprenderse la cordillera de verdad: reconocer
// las montañas por su forma, no leer etiquetas.
import * as THREE from 'three';

const N = 3, FULL = 1.5, ZERO = 25; // preguntas por desafío; grados con puntaje completo; grados a los que ya da cero
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const $ = (s) => document.querySelector(s);
// "¿Dónde está el Cerro Altar?", "¿Dónde está la Punta de Damas?", "¿Dónde está Alto del Naranjo?"
const conArticulo = (n) => (/^(Cerro|Volcán|Nevado|Morro|Pico|Mirador|Cordón|Alto) /.test(n) ? 'el ' + n : /^(Punta|Sierra|Loma|Aguja|Cima) /.test(n) ? 'la ' + n : n);

export class Mirador {
  constructor({ labels, ui, audio, hf, player, progress }) {
    Object.assign(this, { labels, ui, audio, hf, player, progress });
    this.q = null; this.camera = null; this.flash = null; this._v = new THREE.Vector3();
    (progress.data.miradores ??= {});
    $('#quiz-mark').addEventListener('click', () => this.mark());
    $('#quiz-skip').addEventListener('click', () => this.end(true));
  }
  get active() { return !!this.q; }

  // Cumbres importantes que se ven de verdad desde (x, top, z): línea de vista sobre el relieve.
  visibles(from, top, max = 70000) {
    const out = [];
    for (const o of this.progress.cumbres) {
      if (o === from || o.rank > 1) continue;
      const d = Math.hypot(o.x - from.x, o.z - from.z);
      if (d > 2500 && d < max && this.hf.visible(from.x, top, from.z, o.x, this.hf.base(o.x, o.z), o.z)) out.push(o);
    }
    return out;
  }
  // Arma el desafío con las cumbres visibles más reconocibles (con algo de azar para que no se repita siempre igual).
  start(cumbre) {
    if (this.q) return false;
    const top = this.hf.base(cumbre.x, cumbre.z) + 3;
    const vis = this.visibles(cumbre, top).sort((a, b) => a.rank - b.rank || b.ele - a.ele).slice(0, 9);
    if (vis.length < 2) return false;
    for (let i = vis.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [vis[i], vis[j]] = [vis[j], vis[i]]; }
    this.q = { from: cumbre, targets: vis.slice(0, N), i: 0, pts: 0, layer: this.labels.enabled.cumbres };
    this.labels.setLayer('cumbres', false);
    document.body.classList.add('quiz');
    $('#quiz').hidden = false; this._ask();
    return true;
  }
  _ask() {
    const q = this.q, t = q.targets[q.i], d = Math.hypot(t.x - q.from.x, t.z - q.from.z);
    $('#quiz-tag').textContent = `Desafío del mirador · ${q.i + 1} de ${q.targets.length}`;
    $('#quiz-q').textContent = `¿Dónde está ${conArticulo(t.name)}?`;
    $('#quiz-hint').textContent = `${fmt(t.ele)} m, a ${fmt(d / 1000)} km. Gira la cámara hasta tenerlo en la mira y marca con F.`;
  }
  // Error horizontal (grados) entre hacia dónde mira la cámara y la cumbre buscada.
  _error(t) {
    const c = this.camera; if (!c) return 180;
    c.getWorldDirection(this._v);
    const a = Math.atan2(this._v.x, this._v.z), b = Math.atan2(t.x - c.position.x, t.z - c.position.z);
    let e = Math.abs(a - b) * 180 / Math.PI; if (e > 180) e = 360 - e;
    return e;
  }
  mark() {
    const q = this.q; if (!q) return false;
    const t = q.targets[q.i], e = this._error(t);
    const pts = e <= FULL ? 100 : Math.max(0, Math.round(100 * (1 - (e - FULL) / (ZERO - FULL))));
    q.pts += pts;
    q.last = `${pts >= 90 ? '¡Clavado!' : pts >= 60 ? 'Bien cerca' : pts > 0 ? 'Más o menos' : 'Nada que ver'} · error de ${e.toFixed(1).replace('.', ',')}° · +${pts}`;
    this.ui.toast(q.last, 2400);
    this.audio.play(pts >= 60 ? 'trick' : 'ui', { gain: 0.8 });
    this.flash = { t, time: 2.6 };
    if (++q.i < q.targets.length) this._ask(); else this.end(false);
    return true;
  }
  end(skipped) {
    const q = this.q; if (!q) return;
    this.q = null; this.labels.setLayer('cumbres', q.layer);
    document.body.classList.remove('quiz'); $('#quiz').hidden = true;
    if (skipped) return;
    const max = q.targets.length * 100, best = this.progress.data.miradores[q.from.name] || 0;
    if (q.pts > best) { this.progress.data.miradores[q.from.name] = q.pts; this.progress.dirty = true; this.progress.save(); }
    this.ui.toast(`${q.last} — Mirador de ${q.from.name}: ${q.pts} de ${max} puntos${q.pts > best && best ? ' · ¡récord!' : ''}`, 4200);
    this.ui.refreshProgress();
  }

  update(dt, camera) {
    this.camera = camera;
    const q = this.q;
    if (q && Math.hypot(this.player.x - q.from.x, this.player.z - q.from.z) > 150) { this.end(true); this.ui.toast('Dejaste la cumbre: desafío cancelado', 2200); }
    const el = $('#quiz-flash');
    if (!this.flash) { el.hidden = true; return; }
    if ((this.flash.time -= dt) <= 0) { this.flash = null; el.hidden = true; return; }
    // Muestra dónde estaba la cumbre de la respuesta recién marcada.
    const t = this.flash.t, v = this._v.set(t.x, this.hf.base(t.x, t.z) + 30, t.z).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { el.hidden = true; return; }
    el.hidden = false; el.textContent = `${t.name} · ${fmt(t.ele)} m`;
    el.style.transform = `translate(${((v.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px,${((0.5 - v.y * 0.5) * innerHeight).toFixed(1)}px) translate(-50%,-100%)`;
  }
}
