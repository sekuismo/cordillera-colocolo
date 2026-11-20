// Worker: descarga, descomprime y decodifica los binarios fuera del hilo principal.
// Los codificadores equivalentes están en tools/codec.mjs.

async function fetchGunzip(url, id) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  let loaded = 0;
  const counter = new TransformStream({
    transform(chunk, ctl) { loaded += chunk.byteLength; postMessage({ id, progress: loaded }); ctl.enqueue(chunk); },
  });
  const stream = res.body.pipeThrough(counter).pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function decodeDem(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== 'DEM1') throw new Error('DEM inválido');
  const w = dv.getUint32(4, true), h = dv.getUint32(8, true), step = dv.getFloat32(12, true);
  const q = new Uint16Array(w * h);
  let o = 16;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let z = buf[o++];
      if (z === 254) { z = buf[o] | (buf[o + 1] << 8); o += 2; }
      else if (z === 255) { z = buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16); o += 3; }
      const r = z & 1 ? -((z + 1) >> 1) : z >> 1;
      const k = j * w + i;
      const a = i ? q[k - 1] : 0, b = j ? q[k - w] : 0, c = i && j ? q[k - w - 1] : 0;
      q[k] = (i && j ? a + b - c : i ? a : b) + r;
    }
  }
  return { q, w, h, step };
}

// Normales del DEM empaquetadas en 2 bytes (x, z); la y se reconstruye en el shader.
function buildNormals(q, w, h, step, texelX, texelZ) {
  const n = new Uint8Array(w * h * 2);
  const kx = step / (2 * texelX), kz = step / (2 * texelZ);
  for (let j = 0; j < h; j++) {
    const jm = j ? j - 1 : j, jp = j < h - 1 ? j + 1 : j;
    for (let i = 0; i < w; i++) {
      const im = i ? i - 1 : i, ip = i < w - 1 ? i + 1 : i;
      const dx = (q[j * w + ip] - q[j * w + im]) * kx, dz = (q[jp * w + i] - q[jm * w + i]) * kz;
      const inv = 1 / Math.sqrt(dx * dx + dz * dz + 1), o = (j * w + i) * 2;
      n[o] = Math.round(-dx * inv * 127) + 128;
      n[o + 1] = Math.round(-dz * inv * 127) + 128;
    }
  }
  return n;
}

// Pirámide min/max: da cotas de altura por nodo del quadtree para el culling y la selección de LOD.
function buildMinMax(q, w, h) {
  const mins = [], maxs = [], dims = [];
  let pw = w, ph = h, pmin = q, pmax = q;
  while (pw > 1 || ph > 1) {
    const nw = (pw + 1) >> 1, nh = (ph + 1) >> 1;
    const mn = new Uint16Array(nw * nh), mx = new Uint16Array(nw * nh);
    for (let j = 0; j < nh; j++) {
      const j0 = j * 2, j1 = Math.min(ph - 1, j0 + 1);
      for (let i = 0; i < nw; i++) {
        const i0 = i * 2, i1 = Math.min(pw - 1, i0 + 1);
        const a = j0 * pw + i0, b = j0 * pw + i1, c = j1 * pw + i0, d = j1 * pw + i1;
        mn[j * nw + i] = Math.min(pmin[a], pmin[b], pmin[c], pmin[d]);
        mx[j * nw + i] = Math.max(pmax[a], pmax[b], pmax[c], pmax[d]);
      }
    }
    mins.push(mn); maxs.push(mx); dims.push(nw, nh);
    pw = nw; ph = nh; pmin = mn; pmax = mx;
  }
  return { mins, maxs, dims };
}

function decodeLines(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const hl = dv.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + hl)));
  let o = 4 + hl;
  const u = () => { let v = 0, m = 1, b; do { b = buf[o++]; v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
  const s = () => { const z = u(); return z % 2 ? -(z + 1) / 2 : z / 2; };
  const classes = {};
  for (const c of header.classes) {
    const types = new Uint16Array(c.count), offsets = new Uint32Array(c.count + 1);
    const chunks = [];
    let total = 0;
    for (let k = 0; k < c.count; k++) {
      types[k] = u();
      const n = u(), pts = new Float32Array(n * 2);
      let x = 0, z = 0;
      for (let i = 0; i < n; i++) { x += s(); z += s(); pts[i * 2] = x * header.unit; pts[i * 2 + 1] = z * header.unit; }
      chunks.push(pts); offsets[k] = total; total += n;
    }
    offsets[c.count] = total;
    const coords = new Float32Array(total * 2);
    let p = 0; for (const ch of chunks) { coords.set(ch, p); p += ch.length; }
    classes[c.name] = { types, offsets, coords };
  }
  return classes;
}

self.onmessage = async (e) => {
  const { id, type, url } = e.data;
  try {
    const buf = await fetchGunzip(url, id);
    if (type === 'dem') {
      const { q, w, h, step } = decodeDem(buf);
      const normals = buildNormals(q, w, h, step, e.data.texelX, e.data.texelZ);
      const mm = buildMinMax(q, w, h);
      postMessage({ id, result: { q, w, h, step, normals, ...mm } },
        [q.buffer, normals.buffer, ...mm.mins.map((a) => a.buffer), ...mm.maxs.map((a) => a.buffer)]);
    } else if (type === 'lines') {
      const classes = decodeLines(buf);
      postMessage({ id, result: classes }, Object.values(classes).flatMap((c) => [c.types.buffer, c.offsets.buffer, c.coords.buffer]));
    }
  } catch (err) {
    postMessage({ id, error: String(err && err.message || err) });
  }
};
