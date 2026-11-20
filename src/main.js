import * as THREE from 'three';
import { pickQuality, pickAntialias, loadAll, demTexture, normalTexture, albedoTexture, landTexture } from './data.js';
import { Heightfield, makeNoise, noiseTexture } from './heightfield.js';
import { Environment, FAR } from './env.js';
import { Overlay } from './overlay.js';
import { Terrain } from './terrain.js';
import { Cat, CAT_SCALE } from './cat.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Labels } from './labels.js';
import { UI } from './ui.js';
import { Props } from './props.js';
import { Shadows } from './shadows.js';
import { City, HITOS } from './city.js';
import { SpeedFX } from './speedfx.js';
import { StreetIndex } from './streets.js';

const $ = (s) => document.querySelector(s);
const START = { lat: -33.4546, lon: -70.5176, yaw: 1.75 }; // Parque Mahuida, al pie de la Sierra de Ramón, mirando al oriente

function fail(e) {
  console.error(e);
  $('#status').textContent = 'No se pudo iniciar: ' + (e && e.message ? e.message : e);
  $('#bar').hidden = true;
}

async function boot() {
  const canvas = $('#c');
  let renderer;
  const antialias = pickAntialias();
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias, powerPreference: 'high-performance' }); }
  catch { throw new Error('tu navegador o dispositivo no soporta WebGL2.'); }
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
  const quality = pickQuality(renderer.capabilities.maxTextureSize); quality.antialias = antialias;

  const manifest = await (await fetch(new URL('../data/manifest.json', import.meta.url))).json();
  const data = await loadAll(manifest, quality, (p) => { $('#bar i').style.width = (p * 100).toFixed(1) + '%'; $('#status').textContent = `Cargando relieve e imagen satelital… ${(p * 100) | 0}%`; });
  $('#status').textContent = 'Levantando la cordillera…';
  await new Promise((r) => setTimeout(r, 40)); // deja pintar el estado antes del trabajo pesado (sin rAF: no corre con la pestaña oculta)

  const noise = makeNoise();
  const hf = new Heightfield(manifest, data.core, data.ctx, noise);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const tex = {
    coreDem: demTexture(data.core), ctxDem: demTexture(data.ctx),
    coreNrm: normalTexture(data.core), ctxNrm: normalTexture(data.ctx),
    coreAlb: albedoTexture(data.coreImg, aniso), ctxAlb: albedoTexture(data.ctxImg, aniso),
    noise: noiseTexture(noise), land: landTexture(data.land),
  };
  const shadows = new Shadows(hf.core); tex.shadow = shadows.tex;
  const env = new Environment(tex.noise, quality.props);
  let shadowDirty = false, shadowAt = 0;
  env.onSunChange = () => { shadowDirty = true; };
  shadows.start(env.uniforms.uSunDir.value);
  const overlay = new Overlay(quality);
  overlay.setLines(data.lines);
  const terrain = new Terrain({ manifest, hf, tex, env: env.uniforms, quality, overlay });
  const cat = new Cat(env.uniforms);
  const props = new Props({ hf, manifest, env: env.uniforms, coreAlb: tex.coreAlb, land: data.land, streets: new StreetIndex(overlay), amount: quality.props, labels: data.labels, shadowTex: shadows.tex });
  const city = new City({ hf, manifest, env: env.uniforms });
  const scene = new THREE.Scene();
  const speedfx = new SpeedFX(env.uniforms, $('#rush'), quality.props);
  scene.add(terrain.group, props.group, city.mesh, cat.root, env.sky, env.precip, speedfx.mesh);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.25, FAR);

  const input = new Input(canvas, $('#stick'));
  const player = new Player(hf, manifest);
  player.teleport((START.lon - manifest.core.west) * manifest.mPerDegLon, (manifest.core.north - START.lat) * manifest.mPerDegLat, START.yaw);
  const labels = new Labels($('#labels'), data.labels, hf, manifest, quality.maxLabels);
  labels.add(HITOS.map((h) => ({ name: h.n, x: h.x, z: h.z, y: h.top + 8, note: h.nota })));
  player.collide = (x, z) => props.collide(x, z);
  const ui = new UI({ manifest, player, labels, terrain, env, input, quality, border: data.lines.border });

  // Resolución adaptativa: si el equipo no da, se baja la densidad de píxeles antes que los cuadros por segundo.
  let scale = 1, frames = 0, acc = 0, fps = 60, labelTick = 0, started = false, sink = 0, stalled = false, pendingResize = true, slow = 0, fast = 0, lastW = 0, lastH = 0;
  const resize = () => {
    const w = (lastW = innerWidth), h = (lastH = innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality.maxPixelRatio) * scale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // En pantallas verticales se abre el campo vertical para no perder visión hacia los lados.
    player.baseFov = Math.min(88, Math.max(60, (2 * Math.atan(Math.tan((34 * Math.PI) / 180) / camera.aspect) * 180) / Math.PI));
    camera.updateProjectionMatrix();
    env.pu.uPx.value = renderer.domElement.height / (2 * Math.tan((camera.fov * Math.PI) / 360));
  };
  // Redimensionar un canvas WebGL lo borra. Si se hace después de dibujar, ese cuadro se ve negro: por eso
  // aquí solo se marca, y el cambio se aplica al comienzo del cuadro siguiente, justo antes de dibujar.
  const askResize = () => { pendingResize = true; };
  addEventListener('resize', askResize); addEventListener('orientationchange', askResize); resize();

  const clock = new THREE.Clock();
  const idle = { move: { x: 0, y: 0 }, boost: false, lastLook: -10, pointers: new Map() };
  const frame = () => {
    const raw = clock.getDelta(), dt = Math.min(raw, 0.1), t = clock.elapsedTime;
    if (raw > 0.4 || document.hidden) stalled = true; // pestaña en segundo plano: el navegador frena los cuadros, no es lentitud real
    // Al girar el teléfono, el evento de orientación a veces llega antes de que cambien las medidas: se comparan en cada cuadro.
    if (innerWidth !== lastW || innerHeight !== lastH) pendingResize = true;
    if (pendingResize) { pendingResize = false; resize(); }
    const io = input.poll();
    let fp = false;
    if (started) fp = player.update(dt, performance.now() / 1000, input, io, camera);
    else { // portada: la cámara gira lento alrededor del gato
      player.camYaw += dt * 0.05;
      player.update(dt, 0, idle, { lookX: 0, lookY: 0, zoom: 0, jump: false }, camera);
    }
    cat.root.visible = !fp;
    sink += ((player.swimming ? 0.21 * CAT_SCALE + Math.sin(t * 2.4) * 0.015 : 0) - sink) * (1 - Math.exp(-dt * 6));
    cat.update(dt, t, { x: player.x, y: player.y - sink, z: player.z, heading: player.heading, speed: player.speed, normal: player.normal, airborne: !player.grounded, vy: player.vy });
    terrain.uniforms.uCatPos.value.set(player.x - camera.position.x, hf.height(player.x, player.z) - camera.position.y, player.z - camera.position.z);
    env.update(camera, t, dt);
    // Las sombras del relieve se recalculan (en un worker) solo cuando el sol se movió.
    if (shadowDirty && t - shadowAt > 0.3) { shadows.start(env.uniforms.uSunDir.value); shadowDirty = false; shadowAt = t; }
    cat.shade.value += (shadows.at(player.x, player.z) - cat.shade.value) * (1 - Math.exp(-dt * 8));
    city.update(camera, env.elevation);
    speedfx.update(camera, player.vx, player.vy, player.vz, started && !fp ? player.rush : player.rush * 0.6, dt);
    overlay.update(renderer, camera.position);
    terrain.update(camera);
    props.update(camera, player.speed);
    renderer.render(scene, camera);

    if (started) {
      if ((labelTick -= dt) <= 0) { labelTick = 0.25; labels.refresh(camera); }
      labels.update(camera, innerWidth, innerHeight);
      ui.update(dt, camera);
    }
    frames++; acc += dt;
    if (acc >= 1) {
      fps = frames / acc; frames = 0; acc = 0;
      // Resolución dinámica: bajo 40 fps se achica la resolución interna (2 s seguidos); sobre 56, se recupera (4 s).
      // La histéresis evita que oscile. El costo de píxeles del terreno escala casi lineal con la resolución.
      slow = !stalled && fps < 40 ? slow + 1 : 0; fast = !stalled && fps > 56 ? fast + 1 : 0;
      const next = slow >= 2 ? Math.max(0.5, scale * 0.88) : fast >= 4 && scale < 1 ? Math.min(1, scale * 1.1) : scale;
      if (next !== scale) { scale = next; slow = fast = 0; pendingResize = true; }
      stalled = false;
      $('#stats').textContent = `${fps.toFixed(0)} fps · ${(terrain.stats.tris / 1000).toFixed(0)} mil triángulos · relieve a ${quality.tier === 'hi' ? 34 : 68} m · escala de render ${(scale * 100).toFixed(0)} %`;
    }
  };
  renderer.setAnimationLoop(frame);
  window.__juego = { props, scene, shadows, city, player, terrain, hf, env, renderer, camera, overlay, labels, ui, cat, quality, input, start: () => $('#start').click() };

  $('#intro').classList.add('ready'); $('#bar').hidden = true; $('#status').textContent = '';
  $('#start').hidden = false;
  $('#start').addEventListener('click', () => {
    started = true; $('#intro').classList.add('gone'); $('#hud').hidden = false;
    player.camYaw = START.yaw; ui.intro(); canvas.focus();
  }, { once: true });
}
boot().catch(fail);
