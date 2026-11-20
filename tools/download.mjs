// Descarga los datos crudos a /raw (ignorado por git). Uso: node download.mjs [dem|ctxdem|sat|ctxsat|osm]...
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { RAW, CORE, CTX, SAT_Z, CTX_SAT_Z, CTX_DEM_Z, tileRange } from './config.mjs';

const UA = 'cordillera-game-builder/1.0';

async function fetchTo(url, file, tries = 4) {
  if (existsSync(file)) return false;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(file + '.part', buf);
      await fs.rename(file + '.part', file);
      return true;
    } catch (e) {
      if (i === tries - 1) throw new Error(`${url}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

async function pool(jobs, n) {
  let i = 0, done = 0, fresh = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < jobs.length) {
      const job = jobs[i++];
      if (await fetchTo(job.url, job.file)) fresh++;
      if (++done % 100 === 0) console.log(`  ${done}/${jobs.length}`);
    }
  }));
  console.log(`  listo: ${jobs.length} archivos (${fresh} nuevos)`);
}

const tasks = {
  // Copernicus GLO-30 (ESA, datos abiertos en AWS). Teselas de 1°x1°.
  async dem() {
    const jobs = [];
    for (const lat of ['S34', 'S35']) for (const lon of ['W071', 'W070']) {
      const name = `Copernicus_DSM_COG_10_${lat}_00_${lon}_00_DEM`;
      jobs.push({ url: `https://copernicus-dem-30m.s3.amazonaws.com/${name}/${name}.tif`, file: path.join(RAW, 'dem', `${lat}_${lon}.tif`) });
    }
    await pool(jobs, 2);
  },
  // Terrain Tiles (Mapzen/AWS, formato terrarium) para el horizonte lejano.
  async ctxdem() {
    const r = tileRange(CTX, CTX_DEM_Z), jobs = [];
    for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++)
      jobs.push({ url: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${CTX_DEM_Z}/${x}/${y}.png`, file: path.join(RAW, 'ctxdem', `${CTX_DEM_Z}_${x}_${y}.png`) });
    await pool(jobs, 6);
  },
  // Sentinel-2 cloudless 2016 de EOX (CC BY 4.0).
  async sat() { await sat(CORE, SAT_Z, 'sat'); },
  async ctxsat() { await sat(CTX, CTX_SAT_Z, 'ctxsat'); },
  async osm() {
    const bb = `${CORE.south},${CORE.west},${CORE.north},${CORE.east}`;
    const mountainBb = `${CORE.south},-70.62,${CORE.north},${CORE.east}`;
    const q = {
      points: `[out:json][timeout:180][bbox:${bb}];(
        node[natural~"^(peak|volcano|saddle|hot_spring|glacier)$"][name];
        node[mountain_pass=yes][name];
        node[place~"^(city|town|village|hamlet|suburb|locality)$"][name];
        node[tourism~"^(alpine_hut|wilderness_hut|viewpoint|attraction)$"][name];
        node[waterway=waterfall][name];
      );out body;`,
      areas: `[out:json][timeout:180][bbox:${bb}];(
        way[natural=glacier][name];relation[natural=glacier][name];
        way[boundary~"^(protected_area|national_park)$"][name];relation[boundary~"^(protected_area|national_park)$"][name];
        way[leisure=nature_reserve][name];relation[leisure=nature_reserve][name];
        way[landuse=winter_sports][name];relation[landuse=winter_sports][name];
        relation[boundary=administrative][admin_level=8][name];
        way[natural=water][name];relation[natural=water][name];
      );out tags center;`,
      water: `[out:json][timeout:240][bbox:${bb}];(
        way[natural=water];relation[natural=water];
        way[waterway~"^(river|stream)$"][name];
        way[waterway=river];
      );out geom;`,
      roads: `[out:json][timeout:240][bbox:${bb}];(
        way[highway~"^(motorway|trunk|primary|secondary)$"];
      );out geom;`,
      trails: `[out:json][timeout:240][bbox:${mountainBb}];(
        way[highway~"^(tertiary|unclassified|track|path)$"];
      );out geom;`,
      border: `[out:json][timeout:180][bbox:${bb}];(
        way[boundary=administrative][admin_level=2];
      );out geom;`,
    };
    const hosts = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    for (const [name, query] of Object.entries(q)) {
      const file = path.join(RAW, 'osm', `${name}.json`);
      if (existsSync(file)) { console.log(`  ${name}: ya existe`); continue; }
      let ok = false;
      for (let attempt = 0; attempt < 6 && !ok; attempt++) {
        const host = hosts[attempt % hosts.length];
        try {
          const res = await fetch(host, {
            method: 'POST',
            headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: '*/*' },
            body: 'data=' + encodeURIComponent(query),
          });
          const text = await res.text();
          if (!res.ok || !text.trimStart().startsWith('{')) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
          const n = JSON.parse(text).elements.length;
          await fs.writeFile(file, text);
          console.log(`  ${name}: ${n} elementos, ${(text.length / 1e6).toFixed(1)} MB`);
          ok = true;
        } catch (e) {
          console.log(`  ${name}: reintento (${e.message.slice(0, 100)})`);
          await new Promise((r) => setTimeout(r, 8000));
        }
      }
      if (!ok) throw new Error(`OSM ${name} falló`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  },
};

async function sat(bounds, z, dir) {
  const r = tileRange(bounds, z), jobs = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++)
    jobs.push({ url: `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${z}/${y}/${x}.jpg`, file: path.join(RAW, dir, `${z}_${x}_${y}.jpg`) });
  await pool(jobs, 6);
}

const which = process.argv.slice(2);
for (const name of which.length ? which : Object.keys(tasks)) {
  console.log(`[${name}]`);
  await tasks[name]();
}
