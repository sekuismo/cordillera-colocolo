// Tallado fino del relieve a lo largo de caminos y ríos.
//
// El DEM tiene 34 m por texel: una ruta de 8 m en una ladera queda inclinada de lado y un río de 16 m no tiene cauce.
// Acá cada camino recibe una plataforma plana (su cota es el DEM suavizado a lo largo del trazado, así sube y baja
// parejo) con taludes de corte y relleno hacia el terreno natural; cada río, un cauce de agua plana que solo baja
// aguas abajo, hundido bajo sus orillas. En los puentes el camino no se talla (el tablero lo pone infra.js) y en sus
// estribos tampoco el río, para que el tablero calce con el suelo.
//
// Es una función pura de (x, z): la evalúan igual la CPU (física del gato, vegetación, puentes) y el worker que arma la
// textura que lee el vertex shader alrededor de la cámara (carve-worker.js y carveAt en shaders.js). Da D, el desnivel
// respecto del DEM base, y w, cuánto manda el tallado: altura = base + detalle·(1 − w) + w·D.
// No importa nada: corre también en el worker, que no ve el import map de three.

export const CARVE_FADE = 40;     // texeles: el tallado se desvanece en el borde de la ventana de la GPU
const BLOCK = 128;                // m: bloques del índice espacial de tramos
const BANK_MAX = 22;              // m: ancho máximo de un talud
const CORE_BLEND = 1500;          // igual que en heightfield.js
const RIVER = 4;
export const CLASSES = ['pav', 'ter', 'res', 'dirt', 'river'];
// Por clase: berma a cada lado de la calzada (m), talud mínimo (m), ancho del talud por metro de desnivel y ventana de
// suavizado y paso de muestreo del perfil longitudinal (m). El talud resulta de ~40° en corte alto, que es lo que se ve en el Cajón.
const PARAM = [
  { shoulder: 1.5, bank: 2.5, k: 1.0, smooth: 45, step: 6 }, // pav: rutas pavimentadas
  { shoulder: 1.0, bank: 2.0, k: 1.0, smooth: 35, step: 8 }, // ter: calles terciarias
  { shoulder: 1.0, bank: 2.0, k: 1.0, smooth: 30, step: 10 }, // res: calles de barrio (casi siempre en plano: solo se emparejan)
  { shoulder: 0.4, bank: 1.5, k: 0.9, smooth: 30, step: 6 }, // dirt: caminos de tierra y huellas
  { shoulder: 0.0, bank: 3.0, k: 1.2, smooth: 40, step: 8 }, // river: el "ancho" es el espejo de agua
];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Media flotante de 16 bits, como la guarda la textura: así la CPU usa exactamente los valores que ve la GPU.
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
export function toHalf(v) {
  f32[0] = v; const x = u32[0], sign = (x >>> 16) & 0x8000, e = ((x >>> 23) & 0xff) - 112, m = x & 0x7fffff;
  if (e <= 0) return e < -10 ? sign : sign | (((m | 0x800000) >> (1 - e)) + 0x1000 >> 13);
  if (e >= 31) return sign | 0x7c00;
  return sign | ((e << 10) + ((m + 0x1000) >> 13));
}
function fromHalf(h) {
  const e = (h >> 10) & 31, m = h & 1023, s = h & 0x8000 ? -1 : 1;
  return e === 0 ? s * m * 2 ** -24 : e === 31 ? s * Infinity : s * (1 + m / 1024) * 2 ** (e - 15);
}
const q16 = (v) => fromHalf(toHalf(v));

// Altura base del DEM (core fundido con el contexto) y su pendiente suave: misma cuenta que Heightfield.base y que
// la normal que el shader reconstruye de la textura de normales (diferencias centrales con filtro bilineal).
export function makeBase(m, core, ctx) {
  const layer = (d, ox, oz, sx, sz) => ({ q: d.q, w: d.w, h: d.h, step: d.step, ox, oz, tx: sx / d.w, tz: sz / d.h });
  const C = layer(core, 0, 0, m.core.sizeX, m.core.sizeZ), X = layer(ctx, m.ctx.originX, m.ctx.originZ, m.ctx.sizeX, m.ctx.sizeZ);
  const bil = (L, x, z) => {
    const { q, w, h } = L;
    let fx = (x - L.ox) / L.tx - 0.5, fz = (z - L.oz) / L.tz - 0.5;
    fx = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx; fz = fz < 0 ? 0 : fz > h - 1 ? h - 1 : fz;
    const i = Math.min(w - 2, Math.floor(fx)), j = Math.min(h - 2, Math.floor(fz)), u = fx - i, v = fz - j, k = j * w + i;
    return ((q[k] * (1 - u) + q[k + 1] * u) * (1 - v) + (q[k + w] * (1 - u) + q[k + w + 1] * u) * v) * L.step;
  };
  const SX = m.core.sizeX, SZ = m.core.sizeZ;
  const base = (x, z) => {
    const w = smooth(0, CORE_BLEND, Math.min(x, SX - x, z, SZ - z));
    if (w >= 1) return bil(C, x, z);
    const c = bil(X, x, z);
    return w <= 0 ? c : c + (bil(C, x, z) - c) * w;
  };
  const grad = (x, z, out) => { // solo el core: fuera de él no hay tallado
    const { q, w, h } = C, kx = C.step / (2 * C.tx), kz = C.step / (2 * C.tz);
    let fx = x / C.tx - 0.5, fz = z / C.tz - 0.5;
    fx = fx < 0 ? 0 : fx > w - 1 ? w - 1 : fx; fz = fz < 0 ? 0 : fz > h - 1 ? h - 1 : fz;
    const i = Math.min(w - 2, Math.floor(fx)), j = Math.min(h - 2, Math.floor(fz)), u = fx - i, v = fz - j;
    let gx = 0, gz = 0;
    for (let c = 0; c < 4; c++) {
      const ii = i + (c & 1), jj = j + (c >> 1), wt = (c & 1 ? u : 1 - u) * (c >> 1 ? v : 1 - v), r = jj * w;
      gx += wt * (q[r + Math.min(ii + 1, w - 1)] - q[r + Math.max(ii - 1, 0)]) * kx;
      gz += wt * (q[Math.min(jj + 1, h - 1) * w + ii] - q[Math.max(jj - 1, 0) * w + ii]) * kz;
    }
    out[0] = gx; out[1] = gz;
  };
  return { base, grad };
}

// Índice por bloques en formato CSR: off[b]..off[b+1] son los ítems cuya caja toca el bloque b.
function blockIndex(n, nx, nz, box) {
  const cnt = new Uint32Array(nx * nz + 1), r = [0, 0, 0, 0];
  const range = (i) => {
    box(i, r);
    return [Math.max(0, Math.floor(r[0] / BLOCK)), Math.max(0, Math.floor(r[1] / BLOCK)), Math.min(nx - 1, Math.floor(r[2] / BLOCK)), Math.min(nz - 1, Math.floor(r[3] / BLOCK))];
  };
  for (let i = 0; i < n; i++) { const [a, b, c, d] = range(i); for (let j = b; j <= d; j++) for (let k = a; k <= c; k++) cnt[j * nx + k + 1]++; }
  for (let b = 0; b < nx * nz; b++) cnt[b + 1] += cnt[b];
  const ids = new Uint32Array(cnt[nx * nz]), fill = cnt.slice(0, nx * nz);
  for (let i = 0; i < n; i++) { const [a, b, c, d] = range(i); for (let j = b; j <= d; j++) for (let k = a; k <= c; k++) ids[fill[j * nx + k]++] = i; }
  return { off: cnt, ids };
}

export class Carve {
  // d: arreglos ya armados (Carve.build en el hilo principal, o copiados al worker). base: makeBase(...).
  constructor(d, base) {
    Object.assign(this, d); // P, H, segV, segK, segPlat, off, ids, B6, boff, bids, nx, nz
    this.base = base.base; this.grad = base.grad;
    this._o = { D: 0, w: 0 }; this._cache = new Map();
  }
  data() {
    const { P, H, segV, segK, segPlat, off, ids, B6, boff, bids, nx, nz } = this;
    return { P, H, segV, segK, segPlat, off, ids, B6, boff, bids, nx, nz };
  }

  static build({ lines, bridges, manifest, base }) {
    const nx = Math.ceil(manifest.core.sizeX / BLOCK), nz = Math.ceil(manifest.core.sizeZ / BLOCK);
    // Puentes: tramos con semiancho y marca de estribo (1: el inicio es un extremo del puente, 2: el final).
    const bl = [];
    for (const [w10, flat] of bridges || []) {
      const hw = w10 < 0 ? 1.5 : w10 / 20, n = flat.length / 2;
      for (let i = 0; i < n - 1; i++) bl.push(flat[i * 2] / 10, flat[i * 2 + 1] / 10, flat[i * 2 + 2] / 10, flat[i * 2 + 3] / 10, hw, (i === 0 ? 1 : 0) | (i === n - 2 ? 2 : 0));
    }
    const B6 = new Float32Array(bl);
    const bix = blockIndex(B6.length / 6, nx, nz, (i, r) => {
      const o = i * 6, pad = B6[o + 4] + 14;
      r[0] = Math.min(B6[o], B6[o + 2]) - pad; r[1] = Math.min(B6[o + 1], B6[o + 3]) - pad; r[2] = Math.max(B6[o], B6[o + 2]) + pad; r[3] = Math.max(B6[o + 1], B6[o + 3]) + pad;
    });
    const self = new Carve({ B6, boff: bix.off, bids: bix.ids, nx, nz }, base);

    let nv = 0, ns = 0;
    for (const name of CLASSES) { const c = lines[name]; if (c) { nv += c.coords.length / 2; ns += c.coords.length / 2 - c.types.length; } }
    const P = new Float32Array(nv * 2), H = new Float32Array(nv), segV = new Uint32Array(ns), segK = new Uint8Array(ns), segPlat = new Float32Array(ns);
    let v = 0, s = 0;
    CLASSES.forEach((name, kind) => {
      const c = lines[name]; if (!c) return;
      for (let k = 0; k < c.types.length; k++) {
        const a = c.offsets[k], b = c.offsets[k + 1], hw = c.types[k] / 20, n = b - a;
        P.set(c.coords.subarray(a * 2, b * 2), v * 2);
        H.set(self._profile(c.coords.subarray(a * 2, b * 2), n, kind, hw), v);
        for (let i = 0; i < n - 1; i++, s++) { segV[s] = v + i; segK[s] = kind; segPlat[s] = hw + PARAM[kind].shoulder; }
        v += n;
      }
    });
    const ix = blockIndex(ns, nx, nz, (i, r) => {
      const o = segV[i] * 2, pad = segPlat[i] + BANK_MAX;
      r[0] = Math.min(P[o], P[o + 2]) - pad; r[1] = Math.min(P[o + 1], P[o + 3]) - pad; r[2] = Math.max(P[o], P[o + 2]) + pad; r[3] = Math.max(P[o + 1], P[o + 3]) + pad;
    });
    Object.assign(self, { P, H, segV, segK, segPlat, off: ix.off, ids: ix.ids });
    return self;
  }

  // Distancia al borde de la calzada del puente más cercano (negativa sobre el tablero).
  _bridgeGap(x, z) {
    const bi = Math.floor(x / BLOCK), bj = Math.floor(z / BLOCK);
    if (bi < 0 || bj < 0 || bi >= this.nx || bj >= this.nz) return Infinity;
    const b = bj * this.nx + bi, B6 = this.B6;
    let best = Infinity;
    for (let k = this.boff[b]; k < this.boff[b + 1]; k++) {
      const o = this.bids[k] * 6, ax = B6[o], az = B6[o + 1], ex = B6[o + 2] - ax, ez = B6[o + 3] - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1e-9)));
      best = Math.min(best, Math.hypot(x - ax - ex * t, z - az - ez * t) - B6[o + 4]);
    }
    return best;
  }

  // Cota objetivo en cada vértice de una línea: el DEM muestreado cada pocos metros y suavizado a lo largo del trazado.
  _profile(pts, n, kind, hw) {
    const out = new Float32Array(n), base = this.base;
    const sv = new Float64Array(n);
    for (let i = 1; i < n; i++) sv[i] = sv[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
    const L = sv[n - 1], m = Math.max(2, Math.ceil(L / PARAM[kind].step) + 1), ds = L / (m - 1) || 1;
    const hb = new Float64Array(m), mark = new Uint8Array(m);
    for (let i = 0, seg = 0; i < m; i++) {
      const s = i * ds;
      while (seg < n - 2 && sv[seg + 1] < s) seg++;
      const t = Math.max(0, Math.min(1, (s - sv[seg]) / (sv[seg + 1] - sv[seg] || 1)));
      const x = pts[seg * 2] + (pts[seg * 2 + 2] - pts[seg * 2]) * t, z = pts[seg * 2 + 1] + (pts[seg * 2 + 3] - pts[seg * 2 + 1]) * t;
      hb[i] = base(x, z);
      if (kind !== RIVER) mark[i] = this._bridgeGap(x, z) < 1 ? 1 : 0;           // sobre un puente: el DEM es el fondo de la quebrada
      else mark[i] = Math.abs(base(x + 12, z) - base(x - 12, z)) + Math.abs(base(x, z + 12) - base(x, z - 12)) < 0.05 ? 1 : 0; // lago o embalse
    }
    if (kind !== RIVER) { // el tramo sobre un puente se reemplaza por la recta entre sus extremos
      for (let i = 0; i < m; i++) {
        if (!mark[i]) continue;
        let j = i; while (j < m && mark[j]) j++;
        const a = i > 0 ? hb[i - 1] : j < m ? hb[j] : hb[i], b = j < m ? hb[j] : a;
        for (let k = i; k < j; k++) hb[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
        i = j;
      }
    }
    // Dos pasadas de media móvil (≈ triangular) con borde fijo.
    const r = Math.max(1, Math.round(PARAM[kind].smooth / (2 * ds)));
    let hs = hb;
    for (let pass = 0; pass < 2; pass++) {
      const acc = new Float64Array(m + 1), next = new Float64Array(m);
      for (let i = 0; i < m; i++) acc[i + 1] = acc[i] + hs[i];
      for (let i = 0; i < m; i++) {
        const a = i - r, b = i + r;
        let sum = acc[Math.min(m, b + 1)] - acc[Math.max(0, a)];
        if (a < 0) sum += -a * hs[0];
        if (b >= m) sum += (b - m + 1) * hs[m - 1];
        next[i] = sum / (2 * r + 1);
      }
      hs = next;
    }
    if (kind === RIVER) {
      // Aguas abajo el espejo solo baja (OSM dibuja los ríos en el sentido del flujo; igual se verifica con el DEM),
      // sin cavar más de 6 m bajo el DEM suavizado, y queda hundido bajo las orillas según el tamaño del río.
      const depth = hw >= 12 ? 2 : hw >= 7 ? 1.5 : hw >= 5 ? 1.2 : 0.5, down = hs[0] >= hs[m - 1];
      let low = Infinity;
      const lv = new Float64Array(m);
      for (let c = 0; c < m; c++) {
        const i = down ? c : m - 1 - c;
        low = Math.min(low, hs[i]);
        lv[i] = Math.max(low, hs[i] - 6) - (mark[i] ? 0 : depth);
      }
      hs = lv;
    }
    for (let i = 0; i < n; i++) {
      const f = Math.min(m - 1, sv[i] / ds), k = Math.min(m - 2, Math.floor(f)), t = f - k;
      out[i] = hs[k] + (hs[k + 1] - hs[k]) * t;
    }
    return out;
  }

  // Tallado exacto en (x, z). `o` se reutiliza: { D, w }.
  query(x, z, o = this._o) {
    o.D = 0; o.w = 0;
    const bi = Math.floor(x / BLOCK), bj = Math.floor(z / BLOCK);
    if (bi < 0 || bj < 0 || bi >= this.nx || bj >= this.nz) return o;
    const blk = bj * this.nx + bi, a0 = this.off[blk], a1 = this.off[blk + 1];
    if (a0 === a1) return o;
    // Máscaras de los puentes: sobre el tablero y cerca de él no se talla el camino; en los estribos, tampoco el río.
    let mRoad = 0, mEnd = 0;
    const B6 = this.B6;
    for (let k = this.boff[blk]; k < this.boff[blk + 1]; k++) {
      const b = this.bids[k] * 6, ax = B6[b], az = B6[b + 1], ex = B6[b + 2] - ax, ez = B6[b + 3] - az, hw = B6[b + 4], fl = B6[b + 5];
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1e-9)));
      mRoad = Math.max(mRoad, 1 - smooth(hw + 2, hw + 12, Math.hypot(x - ax - ex * t, z - az - ez * t)));
      if (fl & 1) mEnd = Math.max(mEnd, 1 - smooth(hw + 3, hw + 12, Math.hypot(x - ax, z - az)));
      if (fl & 2) mEnd = Math.max(mEnd, 1 - smooth(hw + 3, hw + 12, Math.hypot(x - ax - ex, z - az - ez)));
    }
    const P = this.P, H = this.H, segV = this.segV, segK = this.segK, segPlat = this.segPlat, ids = this.ids;
    let b0 = NaN, S = 0, SD = 0, W = 0;
    for (let k = a0; k < a1; k++) {
      const s = ids[k], v = segV[s], plat = segPlat[s], reach = plat + BANK_MAX;
      const ax = P[v * 2], az = P[v * 2 + 1], ex = P[v * 2 + 2] - ax, ez = P[v * 2 + 3] - az;
      let t = ((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez || 1e-9); t = t < 0 ? 0 : t > 1 ? 1 : t;
      const fx = ax + ex * t, fz = az + ez * t, px = x - fx, pz = z - fz, d2 = px * px + pz * pz;
      if (d2 >= reach * reach) continue;
      const kind = segK[s], mask = kind === RIVER ? mEnd : mRoad;
      if (mask >= 1) continue;
      const h = H[v] + (H[v + 1] - H[v]) * t;
      let wi = 1;
      if (d2 > plat * plat) {
        // Talud: del borde de la plataforma al terreno natural, más ancho mientras más desnivel haya en ese borde.
        const d = Math.sqrt(d2), f = plat / d, prm = PARAM[kind];
        const bw = Math.min(BANK_MAX, prm.bank + prm.k * Math.abs(this.base(fx + px * f, fz + pz * f) - h)), e = d - plat;
        if (e >= bw) continue;
        const u = e / bw; wi = 1 - u * u * (3 - 2 * u);
      }
      wi *= 1 - mask;
      // Donde se juntan dos tallados manda el más fuerte (peso a la sexta): un camino junto al río no se ladea hacia él.
      let q = wi * wi * wi; q *= q;
      if (b0 !== b0) b0 = this.base(x, z);
      S += q; SD += q * (h - b0); if (wi > W) W = wi;
    }
    if (S > 0) { o.D = SD / S; o.w = W; }
    return o;
  }

  // Lo mismo que interpola la GPU en la ventana `win` ({ ox, oz, s, N }): bilineal entre los vértices de la grilla, con
  // valores de 16 bits y el desvanecido del borde. Así la física y el terreno dibujado calzan al milímetro.
  sample(x, z, win, o = this._o) {
    o.D = 0; o.w = 0;
    if (!win) return o;
    const fx = (x - win.ox) / win.s, fz = (z - win.oz) / win.s, n = win.N - 1, e = Math.min(fx, fz, n - fx, n - fz);
    if (e <= 0) return o;
    const i = Math.min(n - 1, Math.floor(fx)), j = Math.min(n - 1, Math.floor(fz)), u = fx - i, v = fz - j;
    const gi = Math.round(win.ox / win.s) + i, gj = Math.round(win.oz / win.s) + j;
    const a = this._corner(gi, gj, win.s), b = this._corner(gi + 1, gj, win.s), c = this._corner(gi, gj + 1, win.s), d = this._corner(gi + 1, gj + 1, win.s);
    o.D = (a[0] * (1 - u) + b[0] * u) * (1 - v) + (c[0] * (1 - u) + d[0] * u) * v;
    o.w = ((a[1] * (1 - u) + b[1] * u) * (1 - v) + (c[1] * (1 - u) + d[1] * u) * v) * smooth(0, CARVE_FADE, e);
    return o;
  }
  _corner(gi, gj, s) {
    const key = gi * 1048576 + gj;
    let c = this._cache.get(key);
    if (!c) {
      if (this._cache.size > 8192) this._cache.clear();
      const o = this.query(gi * s, gj * s, {});
      c = [q16(o.D), q16(o.w)]; this._cache.set(key, c);
    }
    return c;
  }

  // Ventana de N×N vértices cada s metros desde (ox, oz), en RGBA de 16 bits: D, w y el cambio que el tallado le hace
  // a la pendiente (para sombrear con la normal correcta sin leer la textura cuatro veces en el fragment shader).
  window(ox, oz, N, s) {
    const n2 = N * N, D = new Float32Array(n2), W = new Float32Array(n2), o = { D: 0, w: 0 };
    for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++, k++) { this.query(ox + i * s, oz + j * s, o); D[k] = o.D; W[k] = o.w; }
    const out = new Uint16Array(n2 * 4), g = [0, 0], base = this.base;
    const wd = (k) => W[k] * D[k];
    for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++, k++) {
      const w = W[k];
      // La pendiente del relieve tallado es ∇base + ∇(w·D). El shader ya tiene la pendiente suave del DEM (gS), así
      // que se le pasa la diferencia: ∇(w·D) + w·(∇base − gS), con ∇base por diferencias en la misma grilla.
      let gx = 0, gz = 0;
      if (w > 0 || (i > 0 && W[k - 1] > 0) || (i < N - 1 && W[k + 1] > 0) || (j > 0 && W[k - N] > 0) || (j < N - 1 && W[k + N] > 0)) {
        const il = i > 0 ? k - 1 : k, ir = i < N - 1 ? k + 1 : k, jl = j > 0 ? k - N : k, jr = j < N - 1 ? k + N : k;
        gx = (wd(ir) - wd(il)) / (((ir - il) || 1) * s); gz = (wd(jr) - wd(jl)) / ((((jr - jl) / N) || 1) * s);
        if (w > 0) {
          const x = ox + i * s, z = oz + j * s;
          this.grad(x, z, g);
          gx += w * ((base(x + s, z) - base(x - s, z)) / (2 * s) - g[0]);
          gz += w * ((base(x, z + s) - base(x, z - s)) / (2 * s) - g[1]);
        }
      }
      out[k * 4] = toHalf(D[k]); out[k * 4 + 1] = toHalf(w); out[k * 4 + 2] = toHalf(gx); out[k * 4 + 3] = toHalf(gz);
    }
    return out;
  }
}
