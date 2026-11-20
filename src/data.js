// Carga de datos: los binarios pesados se decodifican en un worker; las imágenes las decodifica el navegador.
import * as THREE from 'three';

export function pickQuality(maxTexture) {
  const params = new URLSearchParams(location.search);
  const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900;
  let tier = params.get('q');
  if (tier !== 'hi' && tier !== 'lo') tier = mobile || (navigator.deviceMemory && navigator.deviceMemory < 4) ? 'lo' : 'hi';
  if (maxTexture < 4096) tier = 'lo';
  const hi = tier === 'hi';
  return {
    tier, mobile,
    cells: hi ? 32 : 16,          // celdas por lado en cada nodo del terreno
    lodBias: 1,
    overlayRes: hi ? 2048 : 1024,
    maxPixelRatio: mobile ? 1.5 : 2,
    maxLabels: mobile ? 22 : 40,
    props: hi ? 1 : 0.5,
  };
}

export async function loadAll(manifest, quality, onProgress) {
  const base = new URL('../data/', import.meta.url);
  const tier = manifest.tiers[quality.tier], files = [tier.dem, tier.img, manifest.ctx.dem, manifest.ctx.img, manifest.lines];
  const total = files.reduce((s, f) => s + (manifest.bytes[f] || 0), 0), loaded = {};
  const report = (f, n) => { loaded[f] = n; onProgress(Math.min(1, Object.values(loaded).reduce((a, b) => a + b, 0) / total)); };

  const worker = new Worker(new URL('./worker.js', import.meta.url));
  const pending = new Map(); let seq = 0;
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id); if (!p) return;
    if (data.progress !== undefined) return report(p.file, data.progress);
    pending.delete(data.id);
    data.error ? p.reject(new Error(data.error)) : p.resolve(data.result);
  };
  const viaWorker = (type, file, extra = {}) => new Promise((resolve, reject) => {
    const id = ++seq; pending.set(id, { resolve, reject, file });
    worker.postMessage({ id, type, url: new URL(file, base).href, ...extra });
  });
  const image = async (file) => {
    const res = await fetch(new URL(file, base));
    if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
    const reader = res.body.getReader(), chunks = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); n += value.byteLength; report(file, n); }
    return createImageBitmap(new Blob(chunks, { type: 'image/webp' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  };

  const [core, ctx, lines, coreImg, ctxImg, labels] = await Promise.all([
    viaWorker('dem', tier.dem, { texelX: manifest.core.sizeX / tier.w, texelZ: manifest.core.sizeZ / tier.h }),
    viaWorker('dem', manifest.ctx.dem, { texelX: manifest.ctx.sizeX / manifest.ctx.demSize.w, texelZ: manifest.ctx.sizeZ / manifest.ctx.demSize.h }),
    viaWorker('lines', manifest.lines),
    image(tier.img), image(manifest.ctx.img),
    fetch(new URL(manifest.labels, base)).then((r) => r.json()),
  ]);
  worker.terminate();
  // Cobertura de suelo: 1 byte por texel, gzip. Decide qué vegetación crece en cada punto.
  const lres = await fetch(new URL(tier.land, base));
  if (!lres.ok) throw new Error(`${tier.land}: HTTP ${lres.status}`);
  const land = { data: new Uint8Array(await new Response(lres.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()), w: tier.w, h: tier.h };
  return { core, ctx, lines, coreImg, ctxImg, labels, land };
}

// Altura de 16 bits en una textura RG8 (byte bajo en R, alto en G); el shader hace el bilineal a mano
// porque así funciona en cualquier GPU con WebGL2, sin depender de filtrado de texturas float.
export function demTexture(d) {
  const t = new THREE.DataTexture(new Uint8Array(d.q.buffer), d.w, d.h, THREE.RGFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
export function landTexture(l) {
  const t = new THREE.DataTexture(l.data, l.w, l.h, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.unpackAlignment = 1; t.needsUpdate = true;
  return t;
}
export function normalTexture(d) {
  const t = new THREE.DataTexture(d.normals, d.w, d.h, THREE.RGFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.unpackAlignment = 1; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
export function albedoTexture(bitmap, anisotropy) {
  const t = new THREE.Texture(bitmap);
  t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.premultiplyAlpha = false;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true;
  t.anisotropy = anisotropy; t.needsUpdate = true;
  return t;
}
