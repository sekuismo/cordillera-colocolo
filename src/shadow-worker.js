// Worker de sombras del relieve. Barrido O(N) sobre el DEM: se recorre cada línea paralela al sol llevando la
// "altura de la sombra" (baja con la tangente de la elevación solar y se renueva en cada cumbre).
// Vive fuera del hilo principal porque con las estaciones avanzando el sol se mueve todo el tiempo, y
// recalcular en el hilo de dibujo le sumaba ~6 ms a uno de cada seis cuadros.
const SOFT = 28; // m de desnivel entre plena luz y plena sombra: da penumbra en los bordes
let src, W, H, step, tx, tz;

function sweep(sun, data) {
  const hor = Math.hypot(sun.x, sun.z);
  if (sun.y <= 0.005) { data.fill(0); return; }
  if (hor < 1e-4) { data.fill(255); return; }
  const tan = sun.y / hor, cx = -sun.x / hor / tx, cz = -sun.z / hor / tz; // la luz viaja alejándose del sol
  const majorX = Math.abs(cx) >= Math.abs(cz);
  const N = majorX ? W : H, M = majorX ? H : W, dir = (majorX ? cx : cz) > 0 ? 1 : -1;
  const m = majorX ? cz / Math.abs(cx) : cx / Math.abs(cz);              // avance en el eje menor por cada paso
  const drop = (tan * Math.hypot(majorX ? tx : tz, m * (majorX ? tz : tx))) / step;
  const soft = SOFT / step, bias = 2 / step, span = m * (N - 1);
  for (let o = Math.floor(Math.min(0, -span)) - 1; o <= M + Math.ceil(Math.max(0, -span)) + 1; o++) {
    let hs = -1e9;
    for (let k = 0; k < N; k++) {
      const b = Math.round(o + m * k);
      if (b < 0 || b >= M) { hs = -1e9; continue; }
      const a = dir > 0 ? k : N - 1 - k, idx = majorX ? b * W + a : a * W + b, h = src[idx];
      hs -= drop;
      if (h >= hs - bias) { data[idx] = 255; if (h > hs) hs = h; }
      else { const d = hs - bias - h; data[idx] = d >= soft ? 0 : 255 * (1 - d / soft); }
    }
  }
}

self.onmessage = ({ data }) => {
  if (data.init) { ({ src, w: W, h: H, step, tx, tz } = data.init); return; }
  sweep(data.sun, data.out);
  postMessage({ out: data.out }, [data.out.buffer]);
};
