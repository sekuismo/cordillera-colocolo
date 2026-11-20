// Pegar en la consola: mide el costo real por cuadro (render + espera a la GPU) a 1280x720 fijo.
(() => {
  const j = __juego; j.start(); j.ui.info = false; j.ui.closeCard(); j.env.auto = false; j.env.forceStorm = false; j.env.setYear(0.04); j.env.setHour(9.5);
  const gl = j.renderer.getContext(), px = new Uint8Array(4); j.renderer.setAnimationLoop(null);
  j.renderer.setPixelRatio(1); j.renderer.setSize(1280, 720, false); j.camera.aspect = 1280 / 720; j.camera.updateProjectionMatrix();
  const cost = (n = 9) => { const ts = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); j.renderer.render(j.scene, j.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); ts.push(performance.now() - t0); } ts.sort((a, b) => a - b); return ts[n >> 1]; };
  const L = (id) => j.ui.lugares.find((l) => l.id === id);
  const spots = { inicio: [26419, 44036, 1.75, 0.13, 5.5], providencia: [(-70.615 + 70.8) * 92700, (-33.05 + 33.432) * 110922, 1.2, 0.13, 5.5], clarillo: [L('clarillo').x, L('clarillo').z, 1.4, 0.12, 9], ramon: [L('ramon').x, L('ramon').z, -1.3, 0.2, 6], yeso: [L('yeso').x + 300, L('yeso').z - 200, 2.2, 0.16, 9] };
  const idle = { move: { x: 0, y: 0 }, boost: false, lastLook: -10, pointers: new Map() };
  const go = (name) => { const [x, z, yaw, p, d] = spots[name]; j.player.teleport(x, z, yaw); j.player.camPitch = p; j.player.camDist = d; for (let i = 0; i < 40; i++) j.player.update(0.05, 0, idle, { lookX: 0, lookY: 0, zoom: 0, jump: false }, j.camera); j.env.update(j.camera, 1, 0); j.overlay.update(j.renderer, j.camera.position); j.terrain.update(j.camera); j.props.update(j.camera, 0); j.city.update(j.camera, j.env.elevation); };
  const groups = { terreno: j.terrain.group, props: j.props.group, ciudad: j.city.mesh, cielo: j.env.sky, gato: j.cat.root };
  const only = (names) => { for (const [n, o] of Object.entries(groups)) o.visible = names.includes(n); };
  const out = {}; let tot = { todo: 0, terreno: 0, terrenoPx: 0, props: 0, propsV: 0 };
  for (const s of Object.keys(spots)) {
    go(s); const r = {};
    only(Object.keys(groups)); cost(2); r.todo = cost();
    only(['terreno']); cost(2); r.terreno = cost(); j.renderer.setViewport(0, 0, 48, 27); const tv = cost(5); j.renderer.setViewport(0, 0, 1280, 720); r.terrenoPx = r.terreno - tv;
    only(['props']); cost(2); r.props = cost(); j.renderer.setViewport(0, 0, 48, 27); r.propsV = cost(5); j.renderer.setViewport(0, 0, 1280, 720);
    only(Object.keys(groups)); cost(1); r.tris = Math.round(j.renderer.info.render.triangles / 1000);
    for (const k of Object.keys(tot)) tot[k] += r[k];
    out[s] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, +v.toFixed(1)]));
  }
  out.SUMA = Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, +v.toFixed(1)]));
  out.errores = j.renderer.info.programs.filter((p) => p.diagnostics && p.diagnostics.runnable === false).length;
  window.__go = go;
  return JSON.stringify(out);
})()
