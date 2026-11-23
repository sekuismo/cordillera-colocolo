// Arma, fuera del hilo principal, la ventana de tallado (caminos y cauces) que el terreno lee alrededor de la cámara.
// Arma los perfiles de caminos y ríos y le devuelve una copia al hilo principal: ambos lados evalúan la misma función.
import { Carve, makeBase } from './carve.js';

let carve = null;
self.onmessage = ({ data }) => {
  if (data.type === 'init') { // los perfiles se calculan acá (~1 s): el hilo principal sigue armando la escena
    const t0 = performance.now();
    carve = Carve.build({ lines: data.lines, bridges: data.bridges, manifest: data.manifest, base: makeBase(data.manifest, data.core, data.ctx) });
    postMessage({ init: carve.data(), ms: performance.now() - t0 });
  } else if (data.type === 'window' && carve) {
    const { ox, oz, N, s, seq } = data, t0 = performance.now();
    const buf = carve.window(ox, oz, N, s);
    postMessage({ seq, ox, oz, N, s, buf, ms: performance.now() - t0 }, [buf.buffer]);
  }
};
