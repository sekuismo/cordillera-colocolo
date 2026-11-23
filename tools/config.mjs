// Geometría compartida por todo el pipeline. El juego lee lo mismo desde data/manifest.json.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RAW = path.join(ROOT, 'raw');
export const DATA = path.join(ROOT, 'data');

// Zona jugable: Santiago + Sierra de Ramón + Cajón del Maipo completo, hasta ~20 km dentro de Argentina.
export const CORE = { west: -70.80, east: -69.60, north: -33.05, south: -34.30 };
// Zona de contexto (solo horizonte): costa → pampa mendocina, incluye el Aconcagua.
export const CTX = { west: -72.20, east: -68.20, north: -31.80, south: -35.60 };

// Proyección equirectangular local (metros por grado en la latitud central del core).
export const M_PER_DEG_LAT = 110922;
export const M_PER_DEG_LON = 92700;

export const CORE_HI = { w: 3272, h: 4080 }; // ~34 m por texel
export const CORE_LO = { w: 1636, h: 2040 }; // ~68 m por texel
export const CTX_DEM = { w: 1024, h: 1152 }; // ~362 m por texel
export const CTX_IMG = { w: 2048, h: 2304 };

export const SAT_Z = 13;     // ~16 m/px en esta latitud
export const SAT_ZONE_Z = 14; // ~8 m/px: imagen de detalle por zonas
export const CTX_SAT_Z = 10; // ~127 m/px
export const CTX_DEM_Z = 9;  // ~255 m/px

export const HEIGHT_STEP = 0.5; // metros por unidad en el DEM cuantizado

export const sizeMeters = (b) => ({
  w: (b.east - b.west) * M_PER_DEG_LON,
  h: (b.north - b.south) * M_PER_DEG_LAT,
});

// Web Mercator (teselas XYZ)
export const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const tileRange = (b, z) => ({
  x0: Math.floor(lon2x(b.west, z)), x1: Math.floor(lon2x(b.east, z)),
  y0: Math.floor(lat2y(b.north, z)), y1: Math.floor(lat2y(b.south, z)),
});
