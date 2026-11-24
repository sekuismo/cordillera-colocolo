import * as THREE from 'three';
import { pickQuality, pickAntialias, loadAll, demTexture, normalTexture, albedoTexture, landTexture } from './data.js';
import { Heightfield, makeNoise, noiseTexture } from './heightfield.js';
import { Environment, FAR } from './env.js';
import { Overlay } from './overlay.js';
import { Terrain } from './terrain.js';
import { Cat } from './cat.js';
import { Condor } from './condor.js';
import { ANIMALS } from './animals.js';
import { GameAudio } from './audio.js';
import { COMMON_VERT } from './shaders.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Labels } from './labels.js';
import { UI } from './ui.js';
import { Props } from './props.js';
import { Shadows } from './shadows.js';
import { City, HITOS } from './city.js';
import { SpeedFX } from './speedfx.js';
import { StreetIndex } from './streets.js';
import { Infra } from './infra.js';
import { Carve, makeBase, CLASSES as CARVE_CLASSES } from './carve.js';
import { Zones } from './zones.js';

const $ = (s) => document.querySelector(s);

// Versión del código que está corriendo. version.json se pide sin caché: si no coincide, el navegador tiene archivos
// viejos guardados y se avisa. Hay que cambiar los dos juntos en cada deploy.
const VERSION = '2026-11-23d';
$('#ver').textContent = 'versión ' + VERSION;
fetch(new URL('../version.json', import.meta.url), { cache: 'no-store' }).then((r) => r.json()).then(({ version }) => {
  if (version !== VERSION) { $('#ver').textContent = `Estás viendo una versión guardada (${VERSION}); la publicada es ${version}. Recarga con Ctrl+Shift+R.`; $('#ver').classList.add('old'); }
}).catch(() => {});
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
  // AgX en vez de ACES: ACES tiñe de morado el cielo y satura los cerros hacia el naranjo. Encima va un "look"
  // propio (algo de saturación y contraste, en espacio de pantalla) porque AgX solo deja el paisaje lavado.
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace('vec3 CustomToneMapping( vec3 color ) { return color; }', `
vec3 CustomToneMapping(vec3 color) {
  vec3 c = AgXToneMapping(color);
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, 1.28);
  c = sqrt(max(c, 0.0));
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.42);
  return clamp(c * c, 0.0, 1.0);
}`);
  renderer.toneMapping = THREE.CustomToneMapping; renderer.toneMappingExposure = 1.0;
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
  // Tallado de caminos y cauces: la CPU lo evalúa directo; la GPU lee una ventana alrededor de la cámara que arma un worker.
  const cN = quality.tier === 'hi' ? 1024 : 512, cS = quality.tier === 'hi' ? 1 : 2, cSnap = 256;
  tex.carve = new THREE.DataTexture(new Uint16Array(cN * cN * 4), cN, cN, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.carve.minFilter = tex.carve.magFilter = THREE.LinearFilter; tex.carve.generateMipmaps = false; tex.carve.needsUpdate = true;
  const carveWorker = new Worker(new URL('./carve-worker.js', import.meta.url), { type: 'module' });
  const strip = (d) => ({ q: d.q, w: d.w, h: d.h, step: d.step });
  const carveLines = {}; for (const k of CARVE_CLASSES) if (data.lines[k]) carveLines[k] = data.lines[k];
  carveWorker.postMessage({ type: 'init', lines: carveLines, bridges: data.infra && data.infra.bridges, manifest: { core: manifest.core, ctx: manifest.ctx }, core: strip(data.core), ctx: strip(data.ctx) });
  const carveReady = new Promise((resolve) => { carveWorker.onmessage = ({ data: r }) => resolve(r); });
  const carveState = { busy: false, want: '', have: '', seq: 0, ms: 0, build: 0 };
  const shadows = new Shadows(hf.core); tex.shadow = shadows.tex;
  const env = new Environment(tex.noise, quality.props);
  let shadowDirty = false, shadowAt = 0;
  env.onSunChange = () => { shadowDirty = true; };
  shadows.start(env.uniforms.uSunDir.value);
  const overlay = new Overlay(quality);
  overlay.setLines(data.lines);
  const zones = manifest.zones ? new Zones(manifest, quality) : null;
  if (zones) renderer.initTexture(zones.tex);
  const terrain = new Terrain({ manifest, hf, tex, env: env.uniforms, quality, overlay, zones });
  // Los tres animales comparten jugador y cámara. El modelo de cada uno se arma recién cuando se elige.
  const models = {};
  const makeModel = (id) => (id === 'condor' ? new Condor(env.uniforms, { scale: ANIMALS.condor.scale }) : new Cat(env.uniforms, { puma: id === 'puma', scale: ANIMALS[id].scale }));
  let cat = null; // el modelo del animal en juego
  const props = new Props({ hf, manifest, env: env.uniforms, coreAlb: tex.coreAlb, land: data.land, streets: new StreetIndex(overlay), amount: quality.props, labels: data.labels, shadowTex: shadows.tex });
  if (zones && zones.hasBin.size) {
    props.useZones(); props.zoneSize = zones.size;
    zones.onBin = (key, d) => props.addZone(key, d); zones.onDrop = (key, d) => props.dropZone(key, d);
  }
  const city = new City({ hf, manifest, env: env.uniforms, skyline: data.skyline });
  const infra = data.infra ? new Infra({ hf, manifest, env: env.uniforms, data: data.infra, shadowTex: shadows.tex }) : null;
  const scene = new THREE.Scene();
  const speedfx = new SpeedFX(env.uniforms, $('#rush'), quality.props);
  scene.add(terrain.group, props.group, city.mesh, env.sky, env.precip, speedfx.mesh);
  if (infra) scene.add(infra.group);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.25, FAR);
  // Pide una ventana nueva cuando la cámara se alejó un cuarto de ella; mientras el worker trabaja, solo una a la vez.
  const requestCarve = (p) => {
    const cx = Math.round(p.x / cSnap) * cSnap, cz = Math.round(p.z / cSnap) * cSnap, key = cx + ',' + cz;
    carveState.want = key;
    if (carveState.busy || key === carveState.have) return;
    carveState.busy = true; carveState.have = key;
    carveWorker.postMessage({ type: 'window', ox: cx - (cN / 2) * cS, oz: cz - (cN / 2) * cS, N: cN, s: cS, seq: ++carveState.seq });
  };
  // Antes de que corra el primer cuadro (la vegetación y los puentes ya se colocan sobre el relieve tallado).
  const ci = await carveReady;
  const carve = (hf.carve = new Carve(ci.init, makeBase(manifest, data.core, data.ctx))); carveState.build = ci.ms;
  carveWorker.onmessage = ({ data: r }) => {
    // Textura y ventana de la CPU cambian en el mismo cuadro: la física nunca ve un terreno distinto del dibujado.
    tex.carve.image.data = r.buf; tex.carve.needsUpdate = true;
    terrain.uniforms.uCarveRect.value.set(r.ox, r.oz, r.s, r.N);
    hf.cwin = { ox: r.ox, oz: r.oz, s: r.s, N: r.N };
    carveState.busy = false; carveState.ms = r.ms;
  };

  const input = new Input(canvas, $('#stick'));
  const player = new Player(hf, manifest);
  player.teleport((START.lon - manifest.core.west) * manifest.mPerDegLon, (manifest.core.north - START.lat) * manifest.mPerDegLat, START.yaw);
  const labels = new Labels($('#labels'), data.labels, hf, manifest, quality.maxLabels);
  labels.add(HITOS.map((h) => ({ name: h.n, x: h.x, z: h.z, y: h.top + 8, note: h.nota })));
  player.collide = (x, z) => props.collide(x, z);
  if (infra) { labels.add(infra.labels); player.deck = (x, z) => infra.deckAt(x, z); }
  const audio = new GameAudio();
  const setAnimal = (id) => {
    const a = ANIMALS[id] || ANIMALS.colocolo;
    if (!models[a.id]) { models[a.id] = makeModel(a.id); scene.add(models[a.id].root); }
    for (const k in models) models[k].root.visible = k === a.id;
    cat = models[a.id];
    const zoom = player.camDist / player.animal.camDist; // conserva el acercamiento relativo que traía la cámara
    player.setAnimal(a); player.camDist = a.camDist * zoom;
  };
  const ui = new UI({ manifest, player, labels, terrain, env, input, quality, border: data.lines.border, audio, onAnimal: setAnimal });
  ui.pickAnimal(ui.saved.animal, false);
  player.onEvent = (n, v) => {
    if (n === 'jump' || n === 'jump2') audio.play(player.animal.fly ? 'flap' : 'jump', { gain: n === 'jump2' ? 0.7 : 1 });
    else if (n === 'land' && v > 3) {
      audio.play(hf.slope2(player.x, player.z) < 2.5e-5 ? 'splash' : 'land', { gain: Math.min(1, v / 14) });
      if (v > 9) input.rumble(Math.min(1, v / 20), 0.3, 140);
    }
  };

  // Marca de luz del olfato del colocolo: una columna sobre el próximo lugar sin descubrir, visible desde lejos.
  const beaconGeo = new THREE.CylinderGeometry(4, 12, 1, 16, 1, true); beaconGeo.translate(0, 0.5, 0);
  const beacon = new THREE.Mesh(beaconGeo, new THREE.ShaderMaterial({
    uniforms: { uLogF: env.uniforms.uLogF, uTime: env.uniforms.uTime, uFade: { value: 0 } },
    vertexShader: `${COMMON_VERT}\nvarying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(position, 1.0)); }`,
    fragmentShader: 'uniform float uTime, uFade; varying vec2 vUv;\nvoid main() { float a = pow(1.0 - vUv.y, 1.5) * (0.6 + 0.4 * sin(vUv.y * 60.0 - uTime * 5.0)) * uFade; gl_FragColor = vec4(vec3(1.0, 0.7, 0.28) * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  beacon.visible = false; beacon.frustumCulled = false; beacon.renderOrder = 80; scene.add(beacon);
  let beaconUntil = 0;
  const ability = () => {
    if (!started) return;
    const now = performance.now() / 1000, a = player.animal;
    if (!player.useAbility(now)) { audio.play('error', { gain: 0.5 }); return; }
    audio.play('ability');
    if (a.id === 'colocolo') {
      const l = ui.nextPlace;
      if (!l) { ui.toast('Ya descubriste todos los lugares'); return; }
      const km = Math.hypot(l.x - player.x, l.z - player.z) / 1000;
      beacon.position.set(l.x, hf.height(l.x, l.z, true), l.z); beaconUntil = now + a.ability.dur; audio.play('meow');
      ui.toast(`Olfato: ${l.n}, a ${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km. Sigue la luz`, 3600);
    } else if (a.id === 'puma') { audio.play('roar'); input.rumble(0.8, 0.5, 350); ui.toast('¡Embestida!'); }
    else { audio.play('screech'); ui.toast('Térmica: el aire caliente te sube'); }
  };
  input.on('KeyQ', ability);
  // En la portada, el control elige animal (cruceta) y parte (A); después, la cruceta cambia de marcha.
  input.on('PadA', () => { if (!started) $('#start').click(); });
  input.on('PadLeft', () => (started ? input.handlers.GearDown() : ui.cycleAnimal(-1)));
  input.on('PadRight', () => (started ? input.handlers.GearUp() : ui.cycleAnimal(1)));
  addEventListener('keydown', (e) => {
    if (started || $('#start').hidden) return;
    if (e.code === 'Enter') $('#start').click(); else if (e.code === 'ArrowLeft') ui.cycleAnimal(-1); else if (e.code === 'ArrowRight') ui.cycleAnimal(1);
  });
  // Los navegadores solo dejan sonar después de un gesto: el primer clic o tecla enciende el audio (y la música de la portada).
  const unlock = () => audio.start();
  addEventListener('pointerdown', unlock, { once: true }); addEventListener('keydown', unlock, { once: true });
  const snd = { animal: 'colocolo', speed: 0, grounded: true, flying: false, flap: 0, swimming: false, altitude: 0, snow: false, water: 0, storm: 0, rain: 0, night: 0, rush: 0, menu: true };
  let water = 0, waterTick = 0;

  // Resolución adaptativa: si el equipo no da, se baja la densidad de píxeles antes que los cuadros por segundo.
  // Con el cronómetro de GPU (Chrome y Edge) se mide cuánto cuesta de verdad dibujar cada cuadro; sin él, se estima por fps.
  const MIN_SCALE = 0.5, gl = renderer.getContext(), tq = gl.getExtension('EXT_disjoint_timer_query_webgl2'), queries = [];
  let scale = 1, frames = 0, acc = 0, fps = 60, labelTick = 0, started = false, sink = 0, stalled = false, pendingResize = true, slow = 0, fast = 0, lastW = 0, lastH = 0;
  let gpuMs = 0, gpuN = 0, gpuLast = 0, cap = 60, dropFps = 0, dropFrom = 1;
  // Punto de partida prudente (~2 megapíxeles): medido en una gráfica integrada, el cuadro cuesta ~11 ms por megapíxel.
  // Si la GPU da para más, el cronómetro sube la resolución en un par de segundos; partir de arriba son segundos de tirones.
  if (!tq && !quality.antialias) terrain.setLodBias(0.86); // sin cronómetro y en gráfica integrada: malla algo más liviana de entrada
  if (tq) scale = Math.min(1, Math.max(MIN_SCALE, Math.sqrt(2.0e6 / (innerWidth * innerHeight * Math.min(devicePixelRatio, quality.maxPixelRatio) ** 2))));
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
    const io = input.poll(dt);
    let fp = false;
    if (started) fp = player.update(dt, performance.now() / 1000, input, io, camera);
    else { // portada: la cámara gira lento alrededor del gato
      player.camYaw += dt * 0.05;
      player.update(dt, 0, idle, { lookX: 0, lookY: 0, zoom: 0, jump: false }, camera);
    }
    cat.root.visible = !fp;
    sink += ((player.swimming ? 0.21 * player.size + Math.sin(t * 2.4) * 0.015 : 0) - sink) * (1 - Math.exp(-dt * 6));
    cat.update(dt, t, { x: player.x, y: player.y - sink, z: player.z, heading: player.heading, speed: player.speed, normal: player.normal, airborne: !player.grounded, vy: player.vy, flap: player.flap, turn: player._turn });
    const groundY = hf.height(player.x, player.z), agl = player.y - groundY;
    // La sombra de contacto solo existe cerca del suelo: un cóndor a 300 m no deja una mancha bajo él.
    terrain.uniforms.uCatPos.value.set(player.x - camera.position.x, agl > 6 ? 1e6 : groundY - camera.position.y, player.z - camera.position.z);
    const nowS = performance.now() / 1000;
    if ((beacon.visible = nowS < beaconUntil)) {
      const s = Math.min(60, Math.max(1, Math.hypot(beacon.position.x - camera.position.x, beacon.position.z - camera.position.z) / 500)); // de lejos se ensancha, para no perderse
      beacon.scale.set(s, 2600, s); beacon.material.uniforms.uFade.value = Math.min(1, (beaconUntil - nowS) / 1.5);
    }
    // Sonido: el estado del mundo que escucha el animal. El agua cercana se muestrea dos veces por segundo.
    if ((waterTick -= dt) <= 0) {
      waterTick = 0.5; let n = 0;
      for (let i = 0; i < 8; i++) { const a = i * 0.785, r = i & 1 ? 40 : 16; if (hf.slope2(player.x + Math.cos(a) * r, player.z + Math.sin(a) * r) < 2.5e-5) n++; }
      water = Math.max(player.swimming ? 1 : 0, n / 8) * Math.max(0, 1 - agl / 120);
    }
    snd.animal = player.animal.id; snd.speed = player.speed; snd.grounded = player.grounded; snd.flying = player.flying; snd.flap = player.flap; snd.swimming = player.swimming;
    snd.altitude = player.y; snd.snow = player.y > env.snowLine + 120; snd.water = water; snd.storm = env.storm; snd.rain = env.storm > 0.3 && !env.snowingHere ? env.storm : 0;
    snd.night = city.uniforms.uNight.value; snd.rush = player.rush; snd.menu = !started;
    audio.update(dt, snd);
    env.update(camera, t, dt);
    // Las sombras del relieve se recalculan (en un worker) solo cuando el sol se movió.
    if (shadowDirty && t - shadowAt > 0.3) { shadows.start(env.uniforms.uSunDir.value); shadowDirty = false; shadowAt = t; }
    cat.shade.value += (shadows.at(player.x, player.z) - cat.shade.value) * (1 - Math.exp(-dt * 8));
    city.update(camera, env.elevation);
    if (infra) infra.update(camera);
    speedfx.update(camera, player.vx, player.vy, player.vz, started && !fp ? player.rush : player.rush * 0.6, dt);
    requestCarve(player);
    if (zones) zones.update(renderer, player.x, player.z);
    overlay.update(renderer, camera.position);
    terrain.update(camera);
    props.update(camera, player.speed);
    let q = null;
    if (tq && queries.length < 6) { q = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, q); }
    renderer.render(scene, camera);
    if (q) { gl.endQuery(tq.TIME_ELAPSED_EXT); queries.push(q); }
    while (queries.length && gl.getQueryParameter(queries[0], gl.QUERY_RESULT_AVAILABLE)) { // el resultado llega uno o dos cuadros después
      const done = queries.shift();
      if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) { gpuMs += gl.getQueryParameter(done, gl.QUERY_RESULT) / 1e6; gpuN++; }
      gl.deleteQuery(done);
    }

    if (started) {
      if ((labelTick -= dt) <= 0) { labelTick = 0.25; labels.refresh(camera); }
      labels.update(camera, innerWidth, innerHeight);
      ui.update(dt, camera);
    }
    frames++; acc += dt;
    if (acc >= 1) {
      fps = frames / acc; frames = 0; acc = 0;
      let next = scale;
      if (gpuN >= 8 && !stalled) {
        // Con cronómetro: el costo es casi proporcional a los píxeles, así que la resolución va directo a la que cabe en
        // el presupuesto (12,5 ms: 60 cuadros con holgura) en vez de tantear de a poco. Y un navegador que limita a 30
        // cuadros (ahorro de batería) no la hace bajar sin motivo, que era lo que dejaba la imagen borrosa.
        const g = (gpuLast = gpuMs / gpuN);
        // En vistas de montaña lo caro no son los píxeles sino los triángulos del relieve (hasta 800 mil): ahí bajar la
        // resolución no arregla nada y solo emborrona. Primero se suelta malla, que casi no se nota (el detalle fino va
        // en el sombreado), y recién después resolución. Al recuperar, en el orden inverso.
        if (g > 14.5) {
          if (terrain.stats.tris > 260000 && terrain.lodBias > 0.79) terrain.setLodBias(terrain.lodBias * 0.9);
          else next = Math.max(MIN_SCALE, scale * Math.min(0.96, Math.max(0.7, Math.sqrt(12.5 / g))));
        } else if (g < 9.5) {
          if (scale < 1) next = Math.min(1, scale * Math.min(1.25, Math.max(1.04, Math.sqrt(11.5 / g))));
          else if (terrain.lodBias < 1) terrain.setLodBias(terrain.lodBias * 1.06);
        }
      } else if (!tq && !stalled) {
        // Sin cronómetro: por cuadros por segundo, con histéresis (2 s lento para bajar, 4 s rápido para subir). Si bajar
        // la resolución no sube los cuadros, el límite no es la GPU (pantalla o navegador a 30 Hz): se devuelve la
        // resolución y ese ritmo pasa a ser el techo esperado.
        if (dropFps && fps < dropFps * 1.07) { cap = fps; next = dropFrom; }
        dropFps = 0;
        slow = fps < Math.min(40, cap * 0.8) ? slow + 1 : 0; fast = fps > Math.min(56, cap * 0.93) ? fast + 1 : 0;
        if (next === scale) {
          if (slow >= 2) { dropFps = fps; dropFrom = scale; next = Math.max(MIN_SCALE, scale * 0.88); }
          else if (fast >= 4 && scale < 1) next = Math.min(1, scale * 1.1);
        }
      }
      gpuMs = gpuN = 0;
      if (Math.abs(next - scale) > 0.004) { scale = next; slow = fast = 0; pendingResize = true; }
      stalled = false;
      $('#stats').textContent = `${fps.toFixed(0)} fps${gpuLast ? ` · GPU ${gpuLast.toFixed(1)} ms` : ''} · ${(terrain.stats.tris / 1000).toFixed(0)} mil triángulos · relieve a ${quality.tier === 'hi' ? 34 : 68} m · escala de render ${(scale * 100).toFixed(0)} %`;
    }
  };
  renderer.setAnimationLoop(frame);
  window.__juego = { zones, carve, carveState, infra, props, scene, shadows, city, player, terrain, hf, env, renderer, camera, overlay, labels, ui, get cat() { return cat; }, models, setAnimal, audio, quality, input, start: () => $('#start').click() };

  $('#intro').classList.add('ready'); $('#bar').hidden = true; $('#status').textContent = '';
  $('#start').hidden = false; $('#animals').hidden = false;
  $('#start').addEventListener('click', () => {
    started = true; $('#intro').classList.add('gone'); $('#hud').hidden = false; audio.start(); audio.play('discover', { gain: 0.6 });
    player.camYaw = START.yaw; ui.intro(); canvas.focus();
  }, { once: true });
}
boot().catch(fail);
