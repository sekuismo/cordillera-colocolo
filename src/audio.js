// Todo el sonido del juego, generado por código con Web Audio (sin archivos): música andina en La menor pentatónica
// (quena, zampoña, charango, bombo y chajchas sintetizados), ambiente (viento, río, lluvia, truenos, pájaros, grillos),
// pasos y efectos. La música es generativa pero "compuesta": frases de 4 compases en forma AABB sobre un huayno en 2/4,
// con capas que entran y salen según lo que hace el animal. Nada suena hasta start(), que debe venir de un gesto.

const PENT = [0, 3, 5, 7, 10];   // La Do Re Mi Sol, en semitonos desde La
// Grado de la escala → Hz. El grado 0 es La3 (220 Hz) y cada 5 grados sube una octava: 5 = La4, 10 = La5.
const degFreq = (d) => { const o = Math.floor(d / 5); return 220 * Math.pow(2, o + PENT[d - o * 5] / 12); };
const clamp01 = (x) => ((x = +x) > 0 ? (x < 1 ? x : 1) : 0);   // de paso convierte undefined y NaN en 0
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const num = (v, d) => (typeof v === 'number' && v === v ? v : d);
const R = Math.random;   // azar "de textura" (ruido, humanización); la composición usa el RNG con semilla de la clase

// Acordes del charango (grados, de la cuerda grave a la aguda): Am, C, Em sin quinta (con Re), Gsus, Dsus.
// MASK dice qué notas de PENT pertenecen a cada acorde (bit 0 = La ... bit 4 = Sol): la melodía cae en ellas en los tiempos.
const CHORDS = [[5, 6, 8, 10], [4, 6, 8, 9], [4, 7, 8, 9], [4, 5, 7, 9], [5, 7, 8, 10]];
const MASK = [0b01011, 0b11010, 0b11100, 0b10101, 0b01101];
const PROG_A = [[1, 1, 2, 0], [0, 1, 3, 0], [1, 3, 2, 0]], PROG_B = [[0, 4, 2, 0], [1, 4, 2, 0], [3, 1, 2, 0]];   // un acorde por compás
// Ritmos de un compás en semicorcheas (suman 8). Varios llevan la célula galopante: corchea + dos semicorcheas.
const RHY = [[2, 1, 1, 2, 2], [2, 1, 1, 2, 1, 1], [2, 2, 2, 2], [3, 1, 2, 2], [2, 1, 1, 4], [4, 2, 2], [2, 2, 2, 1, 1]];
// Pasos melódicos en grados (±2 es casi siempre un salto de cuarta): contorno que sube, que baja suave y que cae.
const STEP_ARC = [1, 1, -1, 2, 1, -1, 0, -2], STEP_DN = [-1, -1, 1, -2, -1, 1, 0, 2], STEP_FALL = [-1, -1, -1, 1, -2, -1, 0, 1];
// Cadencias del 4.º compás como pares (grado, duración). Cerradas: Mi-Re-Do-La, Do-La-Sol-La, Re-Do-La-La.
// Abiertas (quedan en Mi o en Do y piden la repetición), con el acorde que las acompaña.
const CAD_CLOSE = [[8, 2, 7, 1, 6, 1, 5, 4], [6, 2, 5, 2, 4, 1, 5, 3], [7, 2, 6, 2, 5, 2, 5, 2]];
const CAD_OPEN = [[7, 2, 8, 1, 9, 1, 8, 4], [8, 2, 7, 2, 6, 2, 6, 2], [10, 2, 9, 1, 8, 1, 8, 4]], CAD_OPEN_CH = [2, 1, 2];
const ARP = [0, -1, 2, 1, 3, -1, 2, 1];        // qué cuerda del acorde toca el arpegio en cada semicorchea (-1: silencio)
const FREE_START = [8, 10, 7, 8];
const FANF = [[5, 8, 9, 10], [8, 9, 10, 11, 10], [6, 8, 10], [5, 7, 8, 10]];   // fanfarrias de 'discover': todas llegan a La5
const AHEAD = 0.3;             // s de anticipación con que se agendan las notas
const MAXV = 44, HARD = 64;    // voces simultáneas: tope para la música y tope absoluto (efectos incluidos)
const NONE = {};

export class GameAudio {
  constructor() {
    this.ctx = null; this.broken = false; this.muted = false; this.errs = 0; this.tStart = 0;
    this.vol = { master: 0.8, music: 0.5, sfx: 0.7 };
    // RNG con semilla (mulberry32): la música cambia en cada sesión, pero una misma semilla compone lo mismo
    let s = (this.seed = (Date.now() ^ 0x9e3779b9) >>> 0);
    this.rnd = () => { let t = (s = (s + 0x6d2b79f5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    // estado del juego ya saneado (se reescribe en cada update, sin crear objetos) y nivel 0..1 de cada capa de la música
    this.q = { animal: 'colocolo', speed: 0, grounded: true, flying: false, swimming: false, snow: false, menu: false, alt: 800, water: 0, storm: 0, rain: 0, night: 0, rush: 0 };
    this.lv = { quena: 1, zamp: 0, char: 0, full: 0, perc: 0, fly: 0 };
    this.bpm = 96; this.duck = 1; this.sparse = 0; this.nv = 0;
    // secuenciador: semicorchea 0..7 dentro del compás, compás 0..15 dentro de la forma AABB
    this.step = 0; this.bar = 0; this.tStep = 0; this.gridMel = false;
    this.ph = [0, 1, 2, 3].map(() => ({ deg: new Int8Array(32).fill(-1), len: new Uint8Array(32) }));   // A, A', B, B'
    this.mot = new Int8Array(8); this.progA = PROG_A[0]; this.progB = PROG_B[0]; this.openCh = 2;
    // melodía libre (sin compás) de los momentos tranquilos
    this.tFree = 0; this.freeLeft = 0; this.freeLen = 0; this.freeDeg = 8; this.fm = new Int8Array(8);
    this.ks = [];   // caché de cuerdas Karplus-Strong, por grado
    this.tCtl = 0; this.tBird = 0; this.tThunder = 0; this.tFlap = 0; this.pFlap = 0; this.stepPh = 0.6; this.stepAlt = false;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this._gate());
  }

  get ready() { return !!this.ctx && !this.broken && this.ctx.state === 'running'; }

  // Crea el contexto la primera vez y lo reanuda si el navegador lo dejó suspendido. Llamar desde un click o una tecla.
  start() {
    if (this.broken) return;
    try {
      if (!this.ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) { this.broken = true; return; }
        try { this.ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
        this.tStart = Date.now();
        this._build();
      }
      if (this.ctx.state !== 'running') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
    } catch (e) { this._fail(e, true); }
  }

  setVolume(v) {
    if (!v) return;
    const o = this.vol;
    if (v.master != null) o.master = clamp01(v.master);
    if (v.music != null) o.music = clamp01(v.music);
    if (v.sfx != null) o.sfx = clamp01(v.sfx);
    this._vols();
  }
  setMuted(m) { this.muted = !!m; this._gate(); }

  // El maestro es la única compuerta: silencio si está muteado o si la pestaña no se ve (la agenda igual se detiene sola).
  _gate() {
    if (!this.master || this.broken) return;
    try {
      const hid = typeof document !== 'undefined' && document.hidden;
      this.master.gain.setTargetAtTime(this.muted || hid ? 0 : this.vol.master, this.ctx.currentTime, 0.05);
    } catch (e) { /* un contexto cerrado no acepta automatización: no hay nada que hacer */ }
  }
  _vols() {
    if (!this.master || this.broken) return;
    try {
      const t = this.ctx.currentTime, o = this.vol;
      this.sfxVol.gain.setTargetAtTime(o.sfx, t, 0.05); this.ambVol.gain.setTargetAtTime(o.sfx * 0.9, t, 0.05);
      this.musicVol.gain.setTargetAtTime(o.music * this.duck * 0.9, t, 0.05); this.percVol.gain.setTargetAtTime(o.music * this.duck * 0.9, t, 0.05);
    } catch (e) { /* ídem */ }
    this._gate();
  }
  // Un error aislado se traga (el juego sigue); si es de armado o se repite, el audio se apaga entero y todo queda en no-op.
  _fail(e, fatal) {
    if (this.errs++ === 0 && typeof console !== 'undefined') console.warn('[audio] error:', e);
    if (!fatal && this.errs < 5) return;
    this.broken = true;
    try { const p = this.ctx && this.ctx.close(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ya estaba cerrado */ }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Armado del grafo (una sola vez): salida, espacio, buses, timbres y las fuentes continuas del ambiente.
  _build() {
    const c = this.ctx;
    const G = (v, to) => { const g = c.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const F = (type, f, q, to) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b; };
    const O = (f, to) => { const o = c.createOscillator(); o.frequency.value = f; o.connect(to); o.start(); return o; };
    const loop = (buf, off) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, off); return s; };

    // salida: maestro → limitador → parlantes. El maestro parte ya en su volumen (todo lo continuo nace en 0 y sube
    // de a poco, así que no hay clic) para que un efecto disparado en el mismo click que start() se alcance a oír.
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -12; lim.knee.value = 8; lim.ratio.value = 16; lim.attack.value = 0.003; lim.release.value = 0.22;
    lim.connect(c.destination);
    this.master = G(this.muted ? 0 : this.vol.master, lim);
    this.white = this._noise(2, false); this.pink = this._noise(4, true);

    // espacio: reverberación de quebrada (convolución) y un eco con filtro en el lazo, que también ensucia un poco la reverb
    const conv = c.createConvolver(); conv.buffer = this._impulse(); conv.connect(G(0.9, this.master));
    const dly = c.createDelay(1), dlp = F('lowpass', 2300, 0.5, this.master);
    dly.delayTime.value = 0.43; dly.connect(dlp); dlp.connect(G(0.34, dly)); dlp.connect(G(0.4, conv));

    // buses. La percusión va aparte para darle poca reverb; efectos y ambiente comparten el volumen "sfx".
    this.musicVol = G(0, this.master); this.percVol = G(0, this.master);
    this.revSend = G(0.5, conv); this.echoSend = G(0.12, dly); this.musicVol.connect(this.revSend); this.musicVol.connect(this.echoSend);
    this.percVol.connect(G(0.16, conv));
    this.sfxVol = G(this.vol.sfx, this.master); this.sfxVol.connect(G(0.2, conv));
    this.ambVol = G(this.vol.sfx * 0.9, this.master);
    this.bQuena = G(1, this.musicVol); this.bZamp = G(0, this.musicVol); this.bPerc = G(0, this.percVol);
    const shelf = F('highshelf', 3000, 0.7, this.musicVol); shelf.gain.value = 5; this.bChar = G(0, shelf);   // el charango, brillante

    // timbres: la quena casi pura con algo de 2.º armónico; la zampoña con armónicos impares (tubo cerrado)
    this.wQuena = c.createPeriodicWave(new Float32Array(5), new Float32Array([0, 1, 0.24, 0.07, 0.03]));
    this.wZamp = c.createPeriodicWave(new Float32Array(8), new Float32Array([0, 1, 0.04, 0.38, 0.02, 0.14, 0.01, 0.06]));

    // viento: cuerpo (pasabajos) más un silbido angosto que aparece con la altura
    this.windG = G(0, this.ambVol); this.windLP = F('lowpass', 400, 0.5, this.windG);
    this.whG = G(0, this.ambVol); this.whBP = F('bandpass', 900, 9, this.whG);
    const w = loop(this.pink, 0); w.connect(this.windLP); w.connect(this.whBP);
    // río: una banda media que se mece despacio más un burbujeo agudo que tiembla
    this.rivG = G(0, this.ambVol);
    const rb = F('bandpass', 620, 0.6, this.rivG), rhg = G(0.3, this.rivG), rh = F('bandpass', 2300, 1.1, rhg), rv = loop(this.white, 0.7);
    rv.connect(rb); rv.connect(rh); O(0.23, G(150, rb.frequency)); O(1.7, G(0.14, rhg.gain));
    // lluvia: siseo agudo sin graves
    this.rainG = G(0, this.ambVol);
    loop(this.white, 1.3).connect(F('highpass', 2000, 0.5, F('lowpass', 8500, 0.5, this.rainG)));
    // grillos: dos portadoras agudas con trémolo rápido que laten despacio (ganancias 0.5 ± 0.5)
    this.crkG = G(0, this.ambVol);
    const pulse = G(0.5, this.crkG), trem = G(0.5, pulse);
    O(4300, trem); O(4730, trem); O(23, G(0.5, trem.gain)); O(1.15, G(0.5, pulse.gain));

    this._compose(true);
    this._vols();
  }

  // Ruido en bucle (blanco o rosa). El comienzo se funde con lo que venía después del final: al repetirse no hace clic.
  _noise(sec, pink) {
    const c = this.ctx, sr = c.sampleRate, len = (sr * sec) | 0, X = 2048, tmp = new Float32Array(len + X);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len + X; i++) {
      const w = R() * 2 - 1;
      if (pink) { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; tmp[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
      else tmp[i] = w;
    }
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = i < X ? tmp[i] * (i / X) + tmp[len + i] * (1 - i / X) : tmp[i];
    return buf;
  }

  // Respuesta al impulso de un cajón cordillerano: rebotes tempranos contra las paredes (distintos en cada oído) y una
  // cola larga que se va oscureciendo, porque el aire y la roca se comen primero los agudos.
  _impulse() {
    const c = this.ctx, sr = c.sampleRate, len = (sr * 2.6) | 0, buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        lp += (0.55 - 0.45 * x) * (R() * 2 - 1 - lp);
        d[i] = lp * (1 - x) * (1 - x) * Math.exp(-3.2 * x) * (i < 300 ? i / 300 : 1);
      }
      for (let k = 0; k < 6; k++) {
        const at = ((0.045 + 0.055 * k + R() * 0.03) * sr) | 0, amp = 0.55 * Math.pow(0.68, k);
        for (let j = 0; j < 90 && at + j < len; j++) d[at + j] += amp * (R() * 2 - 1) * (1 - j / 90);
      }
    }
    return buf;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Una vez por cuadro. Casi todo lo caro está espaciado: los parámetros continuos se tocan ~12 veces por segundo y las
  // notas solo se agendan cuando la ventana de anticipación alcanza la próxima semicorchea.
  update(dt, state) {
    const c = this.ctx;
    if (!c || this.broken || c.state !== 'running') return;
    try { this._update(c.currentTime, dt, state || NONE); } catch (e) { this._fail(e); }
  }
  _update(now, dt, s) {
    const q = this.q;
    dt = dt > 0 ? (dt < 0.1 ? dt : 0.1) : 0;   // un cuadro eterno (pestaña que vuelve) no debe soltar pasos de golpe
    q.animal = s.animal === 'puma' || s.animal === 'condor' ? s.animal : 'colocolo';
    q.speed = Math.min(400, Math.max(0, num(s.speed, 0))); q.alt = num(s.altitude, 800);
    q.grounded = s.grounded !== false; q.flying = !!s.flying; q.swimming = !!s.swimming; q.snow = !!s.snow; q.menu = !!s.menu;
    q.water = clamp01(s.water); q.storm = clamp01(s.storm); q.rain = clamp01(s.rain); q.night = clamp01(s.night); q.rush = clamp01(s.rush);

    // --- pasos: una fase que avanza con la cadencia; cada vez que da la vuelta suena una pisada. La cadencia crece con la
    // velocidad y se satura (un gato no da 40 pasos por segundo); pasados ~35 m/s las pisadas se funden en el viento.
    const v = q.speed;
    if (!q.menu && q.grounded && !q.flying && v > 0.5 && v < 36) {
      const condor = q.animal === 'condor';
      let cad = condor ? 1.5 + 2.3 * (1 - Math.exp(-v / 4)) : q.animal === 'puma' ? 1.7 + 5.8 * (1 - Math.exp(-v / 9)) : 2.3 + 8.5 * (1 - Math.exp(-v / 6));
      if (q.swimming) cad *= 0.45;
      // al galope las patas caen de a pares: intervalos corto y largo alternados
      const lim = v > 9 && !condor && !q.swimming ? (this.stepAlt ? 0.62 : 1.38) : 1;
      this.stepPh += dt * cad;
      if (this.stepPh >= lim) { this.stepPh = 0; this.stepAlt = !this.stepAlt; this._foot(now, 1 - smooth(26, 36, v)); }
    } else this.stepPh = 0.6;   // al volver a pisar, el primer paso no se hace esperar

    // --- aleteo: suena en el flanco de subida de `flap`; si la señal se queda arriba, se repite al ritmo de las alas
    const fl = clamp01(s.flap);
    if (fl > 0.45 && now - this.tFlap > (this.pFlap <= 0.45 ? 0.2 : 0.64 - 0.2 * fl)) { this.tFlap = now; this._flapSnd(now, 0.45 + 0.55 * fl); }
    this.pFlap = fl;

    if (now - this.tCtl >= 0.08) { this._control(now, Math.min(0.5, now - this.tCtl)); this.tCtl = now; }
    this._seq(now);
  }

  // Control lento: niveles de las capas de la música y todo el ambiente continuo. Solo mueve ganancias y filtros.
  _control(now, dt) {
    const q = this.q, lv = this.lv, v = q.menu ? 0 : q.speed, fly = q.flying && !q.menu;
    const high = smooth(3300, 4400, q.alt), altK = clamp01((q.alt - 500) / 5000), k = 1 - Math.exp(-dt / 2.2);

    // --- capas: cada nivel persigue su meta despacio (unos 2 s), así los instrumentos entran y salen sin cortes.
    // Paseo: solo quena. Trote: charango. Carrera: huayno completo. En vuelo manda la zampoña y el bombo espera al Turbo.
    const full = smooth(11, 17, v), perc = (fly ? smooth(40, 60, v) : full) * (1 - 0.55 * q.night) * (1 - 0.4 * high);
    lv.char += (smooth(3.2, 5.5, v) * (1 - 0.25 * q.night) - lv.char) * k;
    lv.full += (full - lv.full) * k; lv.perc += (perc - lv.perc) * k; lv.fly += ((fly ? 1 : 0) - lv.fly) * k;
    lv.zamp += (Math.max(full * (1 - 0.6 * q.night), fly ? 1 : 0) - lv.zamp) * k;
    lv.quena += ((fly ? 0.3 : 1) * (1 - 0.2 * q.night) - lv.quena) * k;
    this.bpm += (96 + 16 * q.rush - this.bpm) * k;
    this.sparse = clamp01(high * 0.7 + q.night * 0.4);         // 0..1: cuánto se ralea la música (altura y noche)
    this.duck = (1 - 0.6 * q.storm) * (1 - 0.3 * q.night);     // con tormenta la música cede ante el viento y la lluvia
    const calm = 1 - lv.char, mv = this.vol.music * this.duck * 0.9;
    this.bQuena.gain.setTargetAtTime(lv.quena, now, 0.25); this.bZamp.gain.setTargetAtTime(lv.zamp * 0.9, now, 0.25);
    this.bChar.gain.setTargetAtTime(lv.char * 0.6, now, 0.25); this.bPerc.gain.setTargetAtTime(lv.perc * (0.75 + 0.2 * q.rush), now, 0.25);
    this.musicVol.gain.setTargetAtTime(mv, now, 0.6); this.percVol.gain.setTargetAtTime(mv, now, 0.6);
    // más espacio cuando la música está sola y arriba en la montaña
    this.revSend.gain.setTargetAtTime(0.3 + 0.3 * high + 0.3 * calm, now, 0.8);
    this.echoSend.gain.setTargetAtTime(0.07 + 0.28 * high + 0.1 * calm, now, 0.8);

    // --- viento: sube con la altura, la velocidad y la tormenta; las ráfagas son senos lentos que nunca calzan entre sí
    const sp = clamp01(v / 70), gust = 0.72 + 0.26 * Math.sin(now * 0.37 + 1.3) + 0.18 * Math.sin(now * 0.83) + 0.12 * Math.sin(now * 0.171 + 4);
    const wind = 0.07 + 0.2 * altK + 0.3 * sp + 0.3 * q.rush + 0.5 * q.storm + (fly ? 0.12 + 0.15 * sp : 0);
    this.windG.gain.setTargetAtTime(Math.min(1, wind * gust), now, 0.5);
    this.windLP.frequency.setTargetAtTime(260 + 500 * altK + 1500 * Math.max(sp, q.rush) + 600 * q.storm + (fly ? 250 : 0), now, 0.6);
    this.whG.gain.setTargetAtTime((0.1 * altK * altK + 0.1 * q.storm + 0.06 * q.rush) * gust, now, 0.8);
    this.whBP.frequency.setTargetAtTime(820 + 330 * Math.sin(now * 0.29) + 250 * q.storm, now, 0.8);

    // --- agua
    this.rivG.gain.setTargetAtTime(q.water * q.water * 0.9, now, 0.4);
    this.rainG.gain.setTargetAtTime(q.rain * (0.22 + 0.1 * q.storm), now, 0.6);
    if (q.storm > 0.7) { if (now > this.tThunder) { this._thunder(now + 0.1); this.tThunder = now + 8 + R() * 18; } }
    else if (this.tThunder < now + 3) this.tThunder = now + 3 + R() * 6;

    // --- vida: pájaros de día en las zonas bajas, grillos de noche; ninguno canta con mal tiempo
    const calmSky = (1 - q.storm) * (1 - q.rain);
    this.crkG.gain.setTargetAtTime(q.night * (1 - smooth(1900, 2600, q.alt)) * calmSky * (1 - q.rush) * 0.02, now, 1);
    if (q.night < 0.3 && q.alt < 2200 && calmSky > 0.6 && q.rush < 0.3) { if (now > this.tBird) { this._bird(now + 0.05); this.tBird = now + 2.5 + R() * 8; } }
    else if (this.tBird < now + 1) this.tBird = now + 1 + R() * 4;
  }

  // Una pisada según el animal y el suelo. `g` baja a 0 cuando la velocidad ya es de viaje.
  _foot(t, g) {
    const q = this.q, D = this.sfxVol, j = 0.85 + R() * 0.3, puma = q.animal === 'puma';
    if (q.swimming) {            // chapoteo: un golpe de agua que cae de tono más unas gotas
      this._nz(t, D, 'bandpass', 1500 * j, 480, 0.9, 0.2, 0.55 * g, 0.015); this._nz(t + 0.03, D, 'highpass', 3800, 3000, 0.5, 0.12, 0.07 * g, 0.02);
    } else if (q.snow) {         // la nieve cruje: dos granos seguidos, el segundo más fino
      this._nz(t, D, 'bandpass', (puma ? 1500 : 2300) * j, 900, 0.9, puma ? 0.13 : 0.09, (puma ? 0.5 : 0.3) * g, 0.006);
      this._nz(t + 0.035, D, 'highpass', 5200, 4200, 0.6, 0.06, 0.05 * g, 0.004);
    } else if (puma) {           // pesado: golpe sordo con cuerpo grave
      this._nz(t, D, 'lowpass', 520 * j, 180, 0.8, 0.09, 0.9 * g, 0.004); this._tn(t, D, 'sine', 92 * j, 55, 0.11, 0.2 * g, 0.004, 0.06);
    } else if (q.animal === 'condor') this._nz(t, D, 'bandpass', 700 * j, 420, 1.2, 0.07, 0.4 * g, 0.005);   // garras sobre la piedra
    else this._nz(t, D, 'bandpass', 1100 * j, 600, 1.1, 0.045, 0.32 * g, 0.003);                             // patas chicas: apenas un toque
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Agenda: va poniendo semicorcheas en el reloj del audio hasta cubrir la ventana de anticipación.
  _seq(now) {
    // si update dejó de llamarse (pestaña oculta, tirón largo) la agenda quedó en el pasado: se retoma desde ahora,
    // sin tocar de golpe todo lo que no sonó
    if (this.tStep < now - 0.03) this.tStep = now + 0.05;
    for (let n = 0; n < 6 && this.tStep < now + AHEAD; n++) {
      const sd = 15 / this.bpm;   // duración de una semicorchea
      this._tick(this.step, this.tStep, sd);
      this.tStep += sd;
      if (++this.step === 8) { this.step = 0; if (++this.bar === 16) { this.bar = 0; this._compose(false); } }
    }
    if (!this.gridMel) {
      if (!this.tFree) this.tFree = now + 1.2;                       // la primera nota deja entrar antes al viento
      else if (this.tFree < now - 0.03) this.tFree = now + 0.15;     // misma resincronización que la agenda a compás
      if (this.tFree < now + AHEAD) this._freeNote(this.tFree);
    }
  }

  // Lo que suena en una semicorchea, según las capas activas. No agenda nada en una capa que está callada.
  _tick(step, t, sd) {
    const lv = this.lv, r = this.rnd, q = this.q, p = this.bar >> 2, bp = this.bar & 3, b = step & 3, sparse = this.sparse;
    // comienzo de frase: aquí se decide si la melodía va a compás (hay charango para sostenerla) o sigue libre
    if (step === 0 && bp === 0) {
      const grid = lv.char > 0.5 && lv.fly < 0.5;
      if (this.gridMel && !grid) this.tFree = t + 0.6;
      this.gridMel = grid;
    }
    if (this.nv > MAXV) return;
    const en = 0.85 + 0.3 * q.rush;   // con apuro todo se toca un poco más fuerte
    const chord = bp === 3 && p === 0 ? this.openCh : (p < 2 ? this.progA : this.progB)[bp];

    // --- melodía: la quena pregunta (compases 1 y 2 de la frase) y la zampoña responde una octava abajo (3 y 4);
    // en la última frase tocan juntas. Sin zampoña, la quena lleva la frase entera.
    if (this.gridMel) {
      const P = this.ph[p], d = P.deg[bp * 8 + step];
      if (d >= 0) {
        const L = P.len[bp * 8 + step], dur = L * sd, vel = (step === 0 ? 0.95 : step === 4 ? 0.88 : 0.76) * en;
        if (!(L === 1 && r() < sparse * 0.8)) {   // en la altura y de noche se caen las notas de paso
          if (lv.zamp > 0.35 && bp >= 2) { this._zamp(t, d - 5, dur * 0.96, vel); if (p === 3) this._quena(t, d, dur * 0.92, vel * 0.8, false); }
          else this._quena(t, d, dur * 0.92, vel, L >= 2 && r() < 0.18);
        }
      }
    }

    // --- charango: rasgueo galopante (corchea + dos semicorcheas) cuando hay bombo; si no, arpegio
    if (lv.char > 0.04) {
      const ch = CHORDS[chord];
      if (lv.full > 0.5 && lv.perc > 0.25) {
        if (b === 0) this._strum(t, ch, false, (step === 0 ? 0.9 : 0.78) * en, step === 0 ? 0.4 : 0.26);
        else if (b === 2) this._strum(t, ch, false, 0.55 * en, 0.12);
        else if (b === 3 && r() > sparse * 0.7) this._strum(t, ch, true, 0.5 * en, 0.14);
      } else if (ARP[step] >= 0 && !(b === 3 && r() < 0.3 + sparse * 0.6) && !(b === 2 && r() < sparse * 0.5))
        this._pluck(t + R() * 0.006, ch[ARP[step]], b === 0 ? 0.85 : 0.6, this.bChar, b === 0, 0);
    }

    // --- percusión: bombo en los tiempos, aro en las dos semicorcheas del contratiempo, chajchas en corcheas
    if (lv.perc > 0.04) {
      if (b === 0) this._bombo(t, (step === 0 ? 1 : 0.8) * en);
      else if (b === 2) this._aro(t, 0.8);
      else if (b === 3 && r() > sparse * 0.8) this._aro(t, 0.5);
      if (bp === 3 && step >= 6 && (p & 1)) this._bombo(t, 0.5);   // remate antes de cerrar la frase repetida
      if (q.night < 0.6 && ((step & 1) === 0 || q.rush > 0.5)) this._chaj(t, (b === 2 ? 1 : 0.6) * (0.8 + 0.4 * q.rush));
    }
  }

  // Melodía libre de los momentos tranquilos: frases cortas y lentas, casi sin pulso, que bajan a descansar en La o Mi.
  // Tierra: quena sola. Cóndor en vuelo: zampoña con notas largas que se pisan, como planeando.
  _freeNote(t) {
    const r = this.rnd, fly = this.lv.fly > 0.5, m = this.fm;
    if (this.freeLeft <= 0) {   // frase nueva; la mitad de las veces retoma el motivo de la anterior
      if (!this.freeLen || r() < 0.5) for (let k = 0; k < 8; k++) m[k] = STEP_DN[(r() * 8) | 0];
      this.freeLen = this.freeLeft = 3 + ((r() * 4) | 0);
      this.freeDeg = FREE_START[(r() * 4) | 0];
    } else { const d = this.freeDeg + m[this.freeLen - this.freeLeft]; this.freeDeg = d > 11 ? 22 - d : d < 5 ? 10 - d : d; }
    const last = this.freeLeft === 1;
    if (last) this.freeDeg = this.freeDeg >= 9 ? 10 : this.freeDeg >= 7 ? 8 : 5;
    const slow = (1 + 0.5 * this.sparse + (this.q.menu ? 0.15 : 0)) * (fly ? 1.7 : 1);
    const dur = (last ? 1.9 + r() * 1.3 : r() < 0.22 ? 0.32 : 0.6 + r() * 0.8) * slow;
    if (fly) this._zamp(t, this.freeDeg - 5, dur * 1.08, 0.8);
    else this._quena(t, this.freeDeg, dur * 0.96, 0.65 + r() * 0.25, dur > 0.5 && r() < 0.3);
    this.tFree = t + dur + (last ? (1.5 + r() * 3) * slow : 0);
    this.freeLeft--;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Composición. Cada vuelta de la forma (16 compases) conserva a veces la frase A o la B, y siempre cambia los finales:
  // así el tema se reconoce pero no se repite igual.
  _compose(first) {
    const r = this.rnd, nc = CAD_CLOSE.length;
    if (first || r() < 0.45) { this.progA = PROG_A[(r() * PROG_A.length) | 0]; this._body(0, false); }
    if (first || r() < 0.55) { this.progB = PROG_B[(r() * PROG_B.length) | 0]; this._body(2, true); }
    // A queda abierta y A' cierra en La; B cierra con otra cadencia y B' siempre con Mi-Re-Do-La, la más conclusiva
    const o = (r() * CAD_OPEN.length) | 0, c1 = (r() * nc) | 0, c2 = (c1 + 1 + ((r() * (nc - 1)) | 0)) % nc;
    this.openCh = CAD_OPEN_CH[o];
    this._cad(0, CAD_OPEN[o]); this._cad(1, CAD_CLOSE[c1]); this._cad(2, CAD_CLOSE[c2]); this._cad(3, CAD_CLOSE[0]);
  }
  // Los tres primeros compases de una frase (y de su repetición): motivo, el mismo motivo en secuencia, y la bajada.
  _body(pi, isB) {
    const r = this.rnd, P = this.ph[pi], Q = this.ph[pi + 1], prog = isB ? this.progB : this.progA, m = this.mot;
    P.deg.fill(-1); P.len.fill(0);
    const rh = RHY[(r() * RHY.length) | 0], tab = isB ? STEP_DN : STEP_ARC;
    for (let k = 0; k < 8; k++) m[k] = tab[(r() * 8) | 0];
    // A parte en el registro medio y sube (contorno en arco); B parte arriba, en La5, y viene bajando
    const s0 = isB ? 10 : r() < 0.5 ? 8 : 6;
    this._bar(P, 0, rh, s0, MASK[prog[0]]);
    m[rh.length - 1] = -m[rh.length - 1] || -1;   // la secuencia cambia su última nota para no calcar el compás anterior
    const e1 = this._bar(P, 1, rh, isB ? s0 - 1 : s0 + 1 + ((r() * 2) | 0), MASK[prog[1]]);
    const rh2 = RHY[(r() * RHY.length) | 0];
    for (let k = 0; k < 8; k++) m[k] = STEP_FALL[(r() * 8) | 0];
    this._bar(P, 2, rh2, isB ? 10 + ((r() * 2) | 0) : Math.max(9, e1 + 1), MASK[prog[2]]);
    Q.deg.set(P.deg); Q.len.set(P.len);
  }
  // Escribe un compás siguiendo el motivo desde `start`. La quena se queda entre La4 (5) y Do6 (11): lo que se sale
  // rebota hacia adentro. En cada tiempo la nota se corre a la vecina que pertenece al acorde.
  _bar(P, bar, rh, start, mask) {
    const m = this.mot;
    let s = bar * 8, d = start < 5 ? 5 : start > 11 ? 11 : start;
    for (let k = 0; k < rh.length; k++) {
      if (k) { d += m[k]; if (d > 11) d = 22 - d; else if (d < 5) d = 10 - d; }
      let n = d;
      if ((s & 3) === 0 && !((mask >> (n % 5)) & 1)) {
        n += (mask >> ((n + 4) % 5)) & 1 ? -1 : 1;
        if (n > 11) n = 9; else if (n < 5) n = mask & 2 ? 6 : 7;   // fuera de registro: Sol5 arriba; Do5 o Re5 abajo, el que sea del acorde
      }
      P.deg[s] = n; P.len[s] = rh[k]; s += rh[k];
    }
    return d;
  }
  _cad(pi, cad) {
    const P = this.ph[pi];
    for (let k = 24; k < 32; k++) { P.deg[k] = -1; P.len[k] = 0; }
    for (let k = 0, s = 24; k < cad.length; k += 2) { P.deg[s] = cad[k]; P.len[s] = cad[k + 1]; s += cad[k + 1]; }
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Piezas básicas. Toda voz termina sola y, al terminar, suelta sus nodos (_fin) para que el grafo no crezca.
  _fin(src, ...ns) {
    this.nv++;
    src.onended = () => { this.nv--; src.disconnect(); for (let i = 0; i < ns.length; i++) if (ns[i]) ns[i].disconnect(); };
  }
  // Golpe de ruido filtrado: el filtro barre de f0 a f1, la envolvente sube en `att` y cae exponencialmente hasta `dur`.
  _nz(t, dest, type, f0, f1, q, dur, peak, att, buf) {
    if (!(peak > 0.0005) || this.nv > HARD) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf || this.white; s.loop = true;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(peak * 0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t, R() * 1.5); s.stop(t + dur + 0.02);
    this._fin(s, f, g);
  }
  // Tono con caída: el oscilador va de f0 a f1 en `fd` segundos; misma envolvente que _nz.
  _tn(t, dest, type, f0, f1, dur, peak, att, fd) {
    if (!(peak > 0.0005) || this.nv > HARD) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (fd || dur * 0.8));
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(peak * 0.001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
    this._fin(o, g);
  }

  // --- quena: onda casi pura, soplo que sigue a la nota, entrada con un pequeño glissando desde abajo y un vibrato
  // que recién aparece cuando la nota ya está asentada. `mord`: mordente rápido con la nota vecina de arriba.
  _quena(t, deg, dur, vel, mord) {
    if (this.nv > MAXV) return;
    const c = this.ctx, f = degFreq(deg), end = t + dur, pk = 0.2 * vel, off = end + 0.5;
    const o = c.createOscillator(), env = c.createGain(), lfo = c.createOscillator(), vib = c.createGain();
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
    o.setPeriodicWave(this.wQuena);
    o.frequency.setValueAtTime(f * 0.955, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.055);
    if (mord) { o.frequency.setValueAtTime(degFreq(deg + 1), t + 0.1); o.frequency.setValueAtTime(f, t + 0.15); }
    lfo.frequency.value = 4.7 + R() * 0.7; vib.gain.setValueAtTime(0, t);   // vibrato en cents, sobre detune
    if (dur > 0.5) { vib.gain.setValueAtTime(0, t + 0.24); vib.gain.linearRampToValueAtTime(16, t + 0.24 + Math.min(0.5, dur - 0.3)); }
    lfo.connect(vib); vib.connect(o.detune);
    n.buffer = this.white; n.loop = true; bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 2.2;
    ng.gain.setValueAtTime(1.5, t); ng.gain.setTargetAtTime(0.6, t + 0.03, 0.06);   // más aire en el ataque
    n.connect(bp); bp.connect(ng); ng.connect(env); o.connect(env); env.connect(this.bQuena);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(pk, t + 0.05);
    env.gain.setTargetAtTime(pk * 0.75, t + 0.05, 0.3); env.gain.setTargetAtTime(0, end, 0.07);
    o.start(t); lfo.start(t); n.start(t, R() * 1.5); o.stop(off); lfo.stop(off); n.stop(off);
    this._fin(o, env, lfo, vib, n, bp, ng);
  }

  // --- zampoña: dos cañas apenas desafinadas, armónicos impares, mucho soplo y el "chiff" de ruido al atacar
  _zamp(t, deg, dur, vel) {
    if (this.nv > MAXV) return;
    const c = this.ctx, f = degFreq(deg), end = t + dur, pk = 0.11 * vel, off = end + 0.6;
    const a = c.createOscillator(), b = c.createOscillator(), env = c.createGain();
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
    a.setPeriodicWave(this.wZamp); b.setPeriodicWave(this.wZamp);
    a.frequency.value = f; b.frequency.value = f; a.detune.value = -6; b.detune.value = 7;
    n.buffer = this.white; n.loop = true; bp.type = 'bandpass'; bp.frequency.value = f * 3; bp.Q.value = 1.1;
    ng.gain.setValueAtTime(3.2, t); ng.gain.setTargetAtTime(0.9, t + 0.025, 0.05);
    a.connect(env); b.connect(env); n.connect(bp); bp.connect(ng); ng.connect(env); env.connect(this.bZamp);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(pk, t + 0.045);
    env.gain.setTargetAtTime(pk * 0.8, t + 0.045, 0.25); env.gain.setTargetAtTime(0, end, 0.09);
    a.start(t); b.start(t); n.start(t, R() * 1.5); a.stop(off); b.stop(off); n.stop(off);
    this._fin(a, env, b, n, bp, ng);
  }

  // --- charango: cuerda pulsada Karplus-Strong. La cuerda de cada grado se calcula una vez y queda en caché: una línea
  // de retardo llena de ruido que se realimenta por un promedio suave (los agudos mueren primero, como en una cuerda).
  // El período real es N + b muestras; `rate` corrige esa fracción para que afine exacto.
  _ks(deg) {
    let e = this.ks[deg];
    if (e) return e;
    const c = this.ctx, sr = c.sampleRate, f = degFreq(deg), N = Math.max(2, Math.round(sr / f - 0.25)), len = (sr * 1.3) | 0, b = 0.25;
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0), rho = Math.pow(0.001, 1 / (f * 1.25));   // -60 dB en 1,25 s
    let prev = 0, mean = 0;
    for (let i = 0; i <= N; i++) { prev = 0.65 * (R() * 2 - 1) + 0.35 * prev; d[i] = prev; mean += prev; }
    mean /= N + 1;
    for (let i = 0; i <= N; i++) d[i] -= mean;
    for (let i = N + 1; i < len; i++) d[i] = rho * ((1 - b) * d[i - N] + b * d[i - N - 1]);
    const fo = (sr * 0.02) | 0;
    for (let i = 0; i < fo; i++) d[len - 1 - i] *= i / fo;
    return (this.ks[deg] = { buf, rate: (f * (N + b)) / sr });
  }
  // Una cuerda. `dbl`: cuerda doble (la misma, apenas más aguda y unos ms después). `damp`: s hasta que la mano la apaga.
  _pluck(t, deg, vel, dest, dbl, damp) {
    if (!(vel > 0.001) || this.nv > HARD) return;
    const c = this.ctx, e = this._ks(deg), g = c.createGain(), s = c.createBufferSource();
    let s2 = null;
    s.buffer = e.buf; s.playbackRate.value = e.rate; s.connect(g); g.connect(dest); g.gain.setValueAtTime(vel * 0.3, t);
    if (dbl) { s2 = c.createBufferSource(); s2.buffer = e.buf; s2.playbackRate.value = e.rate * 1.004; s2.connect(g); s2.start(t + 0.006); }
    s.start(t);
    if (damp > 0) { g.gain.setTargetAtTime(0, t + damp, 0.05); s.stop(t + damp + 0.3); if (s2) s2.stop(t + damp + 0.3); }
    this._fin(s2 || s, g, s2 ? s : null);
  }
  // Rasgueo: las cuerdas del acorde separadas 10 a 18 ms, hacia abajo (grave → aguda) o hacia arriba (más liviano).
  _strum(t, ch, up, vel, damp, dest) {
    if (this.nv > MAXV) return;
    const n = up ? 3 : 4, gap = 0.01 + R() * 0.008;
    for (let k = 0; k < n; k++) this._pluck(t + k * gap, ch[up ? 3 - k : k], vel * (0.7 + 0.3 * R()), dest || this.bChar, false, damp);
  }

  // --- percusión: bombo legüero (seno que cae de ~110 a 50 Hz más el golpe sordo del parche), aro y chajchas
  _bombo(t, vel) {
    this._tn(t, this.bPerc, 'sine', 112, 50, 0.85, 0.7 * vel, 0.004, 0.12);
    this._nz(t, this.bPerc, 'lowpass', 500, 130, 0.7, 0.11, 1.2 * vel, 0.003);
  }
  _aro(t, vel) { this._nz(t, this.bPerc, 'bandpass', 1750 + R() * 300, 1500, 5, 0.05, 0.9 * vel, 0.001); }
  // Chajchas: las pezuñas no suenan a la vez; son tres granos de ruido agudo muy seguidos, cada uno más débil.
  _chaj(t, vel) {
    if (!(vel > 0.01) || this.nv > MAXV) return;
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), pk = 0.2 * vel;
    s.buffer = this.white; s.loop = true; f.type = 'bandpass'; f.frequency.value = 5600 + R() * 1400; f.Q.value = 1.4;
    g.gain.setValueAtTime(0.0001, t);
    for (let i = 0; i < 3; i++) { const tt = t + i * 0.021 + R() * 0.004; g.gain.setValueAtTime(pk * (1 - i * 0.28), tt); g.gain.exponentialRampToValueAtTime(pk * 0.03, tt + 0.015); }
    s.connect(f); f.connect(g); g.connect(this.bPerc);
    s.start(t, R() * 1.5); s.stop(t + 0.09);
    this._fin(s, f, g);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Efectos puntuales. Un nombre desconocido no hace nada. Las notas que usan también salen de la pentatónica de La.
  play(name, opts) {
    const c = this.ctx;
    if (!c || this.broken) return;
    // recién creado, el contexto tarda un instante en pasar a "running": en esa ventana el efecto igual se agenda
    // (típico: start() y play('ui') en el mismo click). Suspendido por más tiempo, se descarta para no acumular sonidos.
    if (c.state !== 'running' && !(c.state === 'suspended' && Date.now() - this.tStart < 1500)) return;
    let g = opts && opts.gain != null ? +opts.gain : 1;
    if (!(g > 0)) return;
    if (g > 2) g = 2;
    try { this._sfx(name, c.currentTime + 0.004, g); } catch (e) { this._fail(e); }
  }
  _sfx(name, t, g) {
    const D = this.sfxVol, a = this.q.animal, k = a === 'puma' ? 0.7 : a === 'condor' ? 0.85 : 1.15;   // el animal grande suena más grave
    switch (name) {
      case 'jump':      // impulso: un tono que sube y un soplo corto
        this._tn(t, D, 'sine', 240 * k, 520 * k, 0.16, 0.16 * g, 0.012, 0.11); this._nz(t, D, 'bandpass', 900, 2400, 0.8, 0.14, 0.3 * g, 0.03); break;
      case 'land':      // golpe sordo; sobre nieve, además cruje
        this._tn(t, D, 'sine', 130 * k, 52 * k, 0.2, 0.4 * g, 0.003, 0.08); this._nz(t, D, 'lowpass', 900, 200, 0.7, 0.14, 0.9 * g, 0.003);
        if (this.q.snow) this._nz(t, D, 'bandpass', 2000, 900, 0.9, 0.14, 0.4 * g, 0.006);
        break;
      case 'splash':    // el cuerpo entra al agua (grave), el agua salta (barrido) y caen las gotas (agudo, un poco después)
        this._tn(t, D, 'sine', 160, 60, 0.22, 0.3 * g, 0.004, 0.1); this._nz(t, D, 'bandpass', 2600, 500, 0.7, 0.55, 0.8 * g, 0.02);
        this._nz(t + 0.04, D, 'highpass', 4000, 2500, 0.5, 0.7, 0.14 * g, 0.08); break;
      case 'discover': { // fanfarria: charango de cuerda doble con una campanita una octava arriba, y un La menor para cerrar
        const f = FANF[(R() * FANF.length) | 0], n = f.length;
        for (let i = 0; i < n; i++) {
          const tt = t + i * 0.12, last = i === n - 1, hz = degFreq(f[i] + 5);
          this._pluck(tt, f[i], (last ? 1.1 : 0.85) * g, D, true, 0);
          this._tn(tt, D, 'sine', hz, hz, last ? 1.1 : 0.4, (last ? 0.07 : 0.05) * g, 0.01);
        }
        this._strum(t + n * 0.12 + 0.03, CHORDS[0], false, 0.7 * g, 0, D);
        break;
      }
      case 'ui':        // clic suave
        this._tn(t, D, 'sine', 1320, 990, 0.07, 0.09 * g, 0.003); this._nz(t, D, 'highpass', 5000, 5000, 0.5, 0.02, 0.03 * g, 0.001); break;
      case 'travel':    // whoosh: el aire que se abre (barrido hacia arriba), la estela que queda y un empujón grave
        this._nz(t, D, 'bandpass', 250, 3200, 1.4, 1.1, 0.9 * g, 0.45); this._nz(t + 0.25, D, 'lowpass', 2400, 300, 0.7, 1, 0.3 * g, 0.3, this.pink);
        this._tn(t, D, 'sine', 90, 45, 0.9, 0.25 * g, 0.2, 0.8); break;
      case 'ability':   // Mi-La-Re hacia arriba con un brillo de ruido
        for (let i = 0; i < 3; i++) { const hz = degFreq(8 + i * 2); this._tn(t + i * 0.06, D, 'triangle', hz, hz, 0.3, 0.1 * g, 0.006); }
        this._nz(t, D, 'bandpass', 1200, 6000, 2, 0.4, 0.25 * g, 0.15); break;
      case 'error':     // Do-La hacia abajo, opaco y sin estridencia
        this._tn(t, D, 'triangle', degFreq(1), degFreq(1), 0.14, 0.16 * g, 0.005); this._tn(t + 0.13, D, 'triangle', 220, 220, 0.26, 0.16 * g, 0.005); break;
      case 'gear':      // tic corto
        this._nz(t, D, 'highpass', 3500, 3500, 0.7, 0.025, 0.14 * g, 0.001); this._tn(t, D, 'square', 1500, 1100, 0.03, 0.04 * g, 0.001); break;
      case 'flap': this._flapSnd(t, g); break;
      case 'meow': this._meow(t, g); break;
      case 'roar': this._roar(t, g); break;
      case 'screech': this._screech(t, g); break;
      default:
    }
  }

  // Un golpe de ala grande: aire que se comprime y se suelta (ruido grave que se cierra, con ataque lento).
  _flapSnd(t, g) {
    this._nz(t, this.sfxVol, 'lowpass', 1100, 260, 0.8, 0.3, 0.9 * g, 0.09, this.pink);
    this._nz(t + 0.02, this.sfxVol, 'bandpass', 520, 190, 1.2, 0.26, 0.6 * g, 0.07);
  }
  // Maullido: diente de sierra cuyo tono sube y baja, visto a través de un formante que se abre y se cierra ("mi-a-u").
  _meow(t, g) {
    if (this.nv > HARD) return;
    const c = this.ctx, p = 0.92 + R() * 0.2, d = 0.48 + R() * 0.16;
    const o = c.createOscillator(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g2 = c.createGain(), env = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(520 * p, t); o.frequency.linearRampToValueAtTime(770 * p, t + d * 0.3); o.frequency.linearRampToValueAtTime(530 * p, t + d);
    f1.type = 'bandpass'; f1.Q.value = 4; f1.frequency.setValueAtTime(800, t); f1.frequency.linearRampToValueAtTime(1900, t + d * 0.35); f1.frequency.linearRampToValueAtTime(950, t + d);
    f2.type = 'bandpass'; f2.Q.value = 6; f2.frequency.value = 2900; g2.gain.value = 0.35;
    o.connect(f1); f1.connect(env); o.connect(f2); f2.connect(g2); g2.connect(env); env.connect(this.sfxVol);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.25 * g, t + 0.07); env.gain.setTargetAtTime(0, t + d * 0.7, d * 0.13);
    o.start(t); o.stop(t + d + 0.4);
    this._fin(o, f1, f2, g2, env);
  }
  // Gruñido del puma: sierra muy grave con la amplitud temblando a ~25 Hz (eso lo hace áspero) más aliento de ruido.
  _roar(t, g) {
    if (this.nv > HARD) return;
    const c = this.ctx, d = 1.05 + R() * 0.25, off = t + d + 0.7;
    const o = c.createOscillator(), amp = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), lp = c.createBiquadFilter(), env = c.createGain();
    const n = c.createBufferSource(), nb = c.createBiquadFilter(), ng = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(62, t); o.frequency.linearRampToValueAtTime(90, t + 0.28); o.frequency.linearRampToValueAtTime(54, t + d);
    lfo.frequency.setValueAtTime(24, t); lfo.frequency.linearRampToValueAtTime(34, t + 0.3); lfo.frequency.linearRampToValueAtTime(19, t + d);
    amp.gain.value = 0.55; lg.gain.value = 0.45; lfo.connect(lg); lg.connect(amp.gain);
    lp.type = 'lowpass'; lp.Q.value = 1.5; lp.frequency.setValueAtTime(420, t); lp.frequency.linearRampToValueAtTime(950, t + 0.3); lp.frequency.linearRampToValueAtTime(330, t + d);
    n.buffer = this.pink; n.loop = true; nb.type = 'bandpass'; nb.frequency.value = 420; nb.Q.value = 0.8; ng.gain.value = 1.4;
    o.connect(amp); n.connect(nb); nb.connect(ng); ng.connect(amp); amp.connect(lp); lp.connect(env); env.connect(this.sfxVol);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(0.45 * g, t + 0.13); env.gain.setTargetAtTime(0, t + d * 0.6, 0.17);
    o.start(t); lfo.start(t); n.start(t, R() * 3); o.stop(off); lfo.stop(off); n.stop(off);
    this._fin(o, amp, lfo, lg, lp, env, n, nb, ng);
  }
  // El cóndor no canta: sisea y carraspea. Ruido de banda media con la amplitud rasgada, y un fondo ronco muy bajo.
  _screech(t, g) {
    if (this.nv > HARD) return;
    const c = this.ctx, d = 0.5 + R() * 0.2, off = t + d + 0.4;
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), amp = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), env = c.createGain();
    const o = c.createOscillator(), og = c.createGain();
    n.buffer = this.white; n.loop = true; bp.type = 'bandpass'; bp.Q.value = 1.6; bp.frequency.setValueAtTime(2300, t); bp.frequency.exponentialRampToValueAtTime(1450, t + d);
    lfo.type = 'sawtooth'; lfo.frequency.value = 34 + R() * 8; amp.gain.value = 0.6; lg.gain.value = 0.4; lfo.connect(lg); lg.connect(amp.gain);
    o.type = 'sawtooth'; o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(110, t + d); og.gain.value = 0.1;
    n.connect(bp); bp.connect(amp); o.connect(og); og.connect(amp); amp.connect(env); env.connect(this.sfxVol);
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1.1 * g, t + 0.05); env.gain.setTargetAtTime(0, t + d * 0.65, 0.09);
    n.start(t, R() * 1.5); lfo.start(t); o.start(t); n.stop(off); lfo.stop(off); o.stop(off);
    this._fin(n, bp, amp, lfo, lg, env, o, og);
  }
  // Trino: un solo oscilador que salta entre 2 y 5 notas agudas, cada una con su pequeño barrido. Suena lejos y seco.
  _bird(t) {
    if (this.nv > MAXV) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), base = 2500 + R() * 2200, n = 2 + ((R() * 4) | 0), pk = 0.03 + R() * 0.03;
    let tt = t;
    for (let i = 0; i < n; i++) {
      const f = base * (0.85 + R() * 0.4), d = 0.05 + R() * 0.07;
      o.frequency.setValueAtTime(f, tt); o.frequency.exponentialRampToValueAtTime(f * (R() < 0.5 ? 1.25 : 0.8), tt + d);
      g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(pk, tt + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      tt += d + 0.03 + R() * 0.06;
    }
    o.connect(g); g.connect(this.ambVol);
    o.start(t); o.stop(tt + 0.02);
    this._fin(o, g);
  }
  // Trueno lejano: el estallido llega ya apagado por la distancia y después rueda el retumbo por el valle, en dos oleadas.
  _thunder(t) {
    const D = this.sfxVol, far = 0.5 + R() * 0.5;
    this._nz(t, D, 'lowpass', 700, 120, 0.5, 1.1, 0.9 * far, 0.03, this.pink);
    this._nz(t + 0.25, D, 'lowpass', 240, 55, 0.5, 3.5 + R() * 2, 1.6 * far, 0.5, this.pink);
    this._nz(t + 1.1 + R(), D, 'lowpass', 170, 50, 0.5, 3, 0.9 * far, 0.6, this.pink);
  }
}
