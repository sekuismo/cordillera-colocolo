// Edificios relevados uno por uno (mirando la calle de verdad), para que cada pueblo se vea como es y no como un
// sorteo. El juego ya trae la huella de cada edificio; aquí va lo que la huella no dice: de qué color es el muro,
// cuántos pisos tiene, cómo es su cierre y qué cartel lleva. Cada entrada se asigna al edificio cuya huella contiene
// el punto (lat, lon). Campos:
//   color:  color del muro (#rrggbb, como se ve en la calle); se lleva al tono más cercano de la paleta de PAREDES
//   pisos:  número de pisos
//   cierre: 'ninguno' (fachada a la línea de la vereda) | 'reja' | 'pandereta' | 'madera'
//   cartel: texto del letrero, tal como está escrito; tipo: 0 comercio · 1 comida · 2 servicio público · 3 educación ·
//           4 culto · 5 turismo · 6 otros (elige los colores del tablero)
// PAREDES son los colores de muro que sabe pintar el shader de las casas (albedo lineal). Los diez primeros son los
// comunes, que se reparten al azar entre las casas sin relevar; los seis últimos solo aparecen donde se los pide.
export const PAREDES = [
  [0.58, 0.56, 0.51], [0.50, 0.44, 0.32], [0.47, 0.38, 0.20], [0.38, 0.27, 0.17], [0.40, 0.40, 0.38],
  [0.36, 0.33, 0.25], [0.55, 0.45, 0.16], [0.28, 0.40, 0.46], [0.50, 0.31, 0.28], [0.30, 0.42, 0.33],
  [0.33, 0.07, 0.05], [0.42, 0.19, 0.10], [0.12, 0.20, 0.36], [0.10, 0.22, 0.13], [0.48, 0.36, 0.10], [0.17, 0.11, 0.07],
];
export const COMUNES = 10;

import { RELEVADOS } from './pueblos_data.js';

// Los edificios relevados (San José de Maipo por ahora) salen de tools/relevamientos/ vía tools/build_pueblos.mjs.
export const EDIFICIOS = RELEVADOS;

// Color visto en la calle (sRGB) → índice del tono de PAREDES más parecido.
export function tono(hex) {
  const v = parseInt(hex.slice(1), 16), lin = (c) => Math.pow(c / 255, 2.2) * 0.82;
  const r = lin(v >> 16), g = lin((v >> 8) & 255), b = lin(v & 255);
  let best = 0, bd = Infinity;
  PAREDES.forEach((p, i) => { const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

// Índice espacial de los edificios relevados, en metros del mundo.
export class Relevados {
  constructor(manifest, list = EDIFICIOS) {
    this.map = new Map(); this.n = list.length;
    for (const e of list) {
      const x = (e.lon - manifest.core.west) * manifest.mPerDegLon, z = (manifest.core.north - e.lat) * manifest.mPerDegLat;
      const o = { ...e, x, z, tono: e.color ? tono(e.color) : -1 }, key = Math.floor(x / 32) * 65536 + Math.floor(z / 32);
      const l = this.map.get(key); if (l) l.push(o); else this.map.set(key, [o]);
    }
  }
  // El relevado más cercano a la huella (centro x, z; largo L, ancho W; giro rot), a no más de 5 m de su muro: el punto
  // relevado es el frente del edificio visto desde la calle, y suele caer en la vereda. O null.
  at(x, z, L, W, rot) {
    if (!this.n) return null;
    const c = Math.cos(rot), s = Math.sin(rot), R = Math.max(L, W) / 2 + 6;
    let best = null, bd = Infinity;
    for (let cz = Math.floor((z - R) / 32); cz <= Math.floor((z + R) / 32); cz++) for (let cx = Math.floor((x - R) / 32); cx <= Math.floor((x + R) / 32); cx++) {
      const l = this.map.get(cx * 65536 + cz); if (!l) continue;
      for (const o of l) {
        const ox = o.x - x, oz = o.z - z, lx = c * ox - s * oz, lz = s * ox + c * oz;
        const d = Math.hypot(Math.max(Math.abs(lx) - L / 2, 0), Math.max(Math.abs(lz) - W / 2, 0));
        if (d > 5 || d >= bd) continue;
        if (o.best !== undefined && o.best < d - 0.01) continue; // ya lo tomó un edificio que le queda más cerca
        bd = d; best = o;
      }
    }
    if (best) best.best = bd;
    return best;
  }
}
