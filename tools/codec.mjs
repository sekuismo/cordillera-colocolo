// Códecs compactos del pipeline. Los decodificadores equivalentes viven en src/worker-decode.js.
import zlib from 'node:zlib';

// DEM: uint16 → predictor planar (izq + arriba − diagonal) → zigzag → bytes con escape → gzip.
// El residuo del predictor en terreno real es chico, así que casi todo cabe en 1 byte de baja entropía.
export function encodeDem(q, w, h, step) {
  const out = Buffer.allocUnsafe(q.length * 4 + 16);
  out.write('DEM1', 0, 'latin1');
  out.writeUInt32LE(w, 4);
  out.writeUInt32LE(h, 8);
  out.writeFloatLE(step, 12);
  let o = 16;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const a = i ? q[k - 1] : 0, b = j ? q[k - w] : 0, c = i && j ? q[k - w - 1] : 0;
      const pred = i && j ? a + b - c : i ? a : b;
      const r = q[k] - pred;
      const z = r >= 0 ? r * 2 : -r * 2 - 1;
      if (z < 254) out[o++] = z;
      else if (z < 65536) { out[o++] = 254; out[o++] = z & 255; out[o++] = z >> 8; }
      else { out[o++] = 255; out[o++] = z & 255; out[o++] = (z >> 8) & 255; out[o++] = z >> 16; }
    }
  }
  return zlib.gzipSync(out.subarray(0, o), { level: 9 });
}

export function decodeDem(file) {
  const buf = zlib.gunzipSync(file);
  if (buf.toString('latin1', 0, 4) !== 'DEM1') throw new Error('DEM inválido');
  const w = buf.readUInt32LE(4), h = buf.readUInt32LE(8), step = buf.readFloatLE(12);
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

// Escritor de varints (LEB128 + zigzag) para las polilíneas vectoriales.
export class VarintWriter {
  constructor() { this.buf = Buffer.allocUnsafe(1 << 20); this.o = 0; }
  u(v) {
    if (this.o + 6 > this.buf.length) this.buf = Buffer.concat([this.buf, Buffer.allocUnsafe(this.buf.length)]);
    while (v >= 128) { this.buf[this.o++] = (v & 127) | 128; v = Math.floor(v / 128); }
    this.buf[this.o++] = v;
  }
  s(v) { this.u(v >= 0 ? v * 2 : -v * 2 - 1); }
  bytes() { return this.buf.subarray(0, this.o); }
}
