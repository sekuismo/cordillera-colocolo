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
    hi: { dem: 'core_hi.dem', img: 'core_hi.webp', land: 'land_hi.bin', ...CORE_HI },
    lo: { dem: 'core_lo.dem', img: 'core_lo.webp', land: 'land_lo.bin', ...CORE_LO },
  },
  labels: 'labels.json', lines: 'lines.bin', map: 'mapa.webp',
};
for (const f of ['core_hi.dem', 'core_hi.webp', 'core_lo.dem', 'core_lo.webp', 'ctx.dem', 'ctx.webp', 'lines.bin', 'labels.json', 'land_hi.bin', 'land_lo.bin'])
  (manifest.bytes ??= {})[f] = (await fs.stat(path.join(DATA, f))).size;
// Calles menores (opcionales: existen si se corrió download_streets + build_streets). Las residenciales solo en calidad alta.
manifest.streets = [];
for (const [file, tiers] of [['streets_ter.bin', ['hi', 'lo']], ['streets_res.bin', ['hi']]]) {
  try { manifest.bytes[file] = (await fs.stat(path.join(DATA, file))).size; manifest.streets.push({ file, tiers }); } catch { /* aún no generadas */ }
}
try { manifest.bytes['skyline.json'] = (await fs.stat(path.join(DATA, 'skyline.json'))).size; manifest.skyline = 'skyline.json'; } catch { /* aún no generado */ }
try { manifest.bytes['infra.json'] = (await fs.stat(path.join(DATA, 'infra.json'))).size; manifest.infra = 'infra.json'; } catch { /* aún no generada */ }
// Zonas que se cargan alrededor del jugador (build_zones.mjs): qué archivos existen y cuánto pesan en total.
try {
  const { ZONE, ZPX, NZX, NZZ } = await import('./build_zones.mjs?info');
  const list = async (dir, ext) => (await fs.readdir(path.join(DATA, 'zones', dir)).catch(() => [])).filter((f) => f.endsWith(ext));
  const img = await list('img', '.webp'), bin = await list('bin', '.bin');
  let bytes = 0;
  for (const [d, fs_] of [['img', img], ['bin', bin]]) for (const f of fs_) bytes += (await fs.stat(path.join(DATA, 'zones', d, f))).size;
  manifest.zones = { size: ZONE, px: ZPX, nx: NZX, nz: NZZ, bytes, img: img.map((f) => f.slice(0, -5)), bin: bin.map((f) => f.slice(0, -4)) };
} catch (e) { console.warn('sin zonas:', e.message); }
await fs.writeFile(path.join(DATA, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log({ ...manifest, zones: manifest.zones && { ...manifest.zones, img: manifest.zones.img.length, bin: manifest.zones.bin.length } });
