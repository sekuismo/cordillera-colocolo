// data/manifest.json: la geometría que el juego necesita para ubicar cada capa en el mundo.
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA, CORE, CTX, CORE_HI, CORE_LO, CTX_DEM, CTX_IMG, M_PER_DEG_LAT, M_PER_DEG_LON, sizeMeters } from './config.mjs';

const core = sizeMeters(CORE), ctx = sizeMeters(CTX);
const manifest = {
  mPerDegLat: M_PER_DEG_LAT, mPerDegLon: M_PER_DEG_LON,
  core: { ...CORE, sizeX: core.w, sizeZ: core.h },
  // Origen del contexto en coordenadas del mundo (el mundo parte en la esquina NO del core).
  ctx: { ...CTX, sizeX: ctx.w, sizeZ: ctx.h, originX: (CTX.west - CORE.west) * M_PER_DEG_LON, originZ: (CORE.north - CTX.north) * M_PER_DEG_LAT, dem: 'ctx.dem', img: 'ctx.webp', demSize: CTX_DEM, imgSize: CTX_IMG },
  tiers: {
    hi: { dem: 'core_hi.dem', img: 'core_hi.webp', ...CORE_HI },
    lo: { dem: 'core_lo.dem', img: 'core_lo.webp', ...CORE_LO },
  },
  labels: 'labels.json', lines: 'lines.bin', map: 'mapa.webp',
};
for (const f of ['core_hi.dem', 'core_hi.webp', 'core_lo.dem', 'core_lo.webp', 'ctx.dem', 'ctx.webp', 'lines.bin', 'labels.json'])
  (manifest.bytes ??= {})[f] = (await fs.stat(path.join(DATA, f))).size;
await fs.writeFile(path.join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(manifest);
