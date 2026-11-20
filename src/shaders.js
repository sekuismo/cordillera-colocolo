// Trozos GLSL compartidos. HEIGHT_GLSL es el gemelo en GPU de heightfield.js: si cambias uno, cambia el otro.
import { OCTAVES, CORE_BLEND } from './heightfield.js';

const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

// Profundidad logarítmica en el vértice: con near 0,3 m y far 600 km, un z-buffer lineal de 24 bits
// tiene ~500 m de error a 50 km. Como toda la geometría está teselada en proporción a la distancia,
// alcanza con hacerlo por vértice y no se pierde el early-Z.
export const COMMON_VERT = /* glsl */ `
uniform float uLogF;
vec4 logDepth(vec4 p) { p.z = (log2(max(1e-6, 1.0 + p.w)) * uLogF - 1.0) * p.w; return p; }
`;

export const ATMOS_GLSL = /* glsl */ `
uniform vec3 uSunDir, uSunColor, uSkyZenith, uSkyHorizon, uAmbient, uFogColor;
uniform float uFogDensity, uTime, uSnowLine, uStorm, uGreen;
uniform vec3 uLeaf;

vec3 skyColor(vec3 d) {
  float t = pow(clamp(d.y, 0.0, 1.0), 0.45);
  vec3 c = mix(uSkyHorizon, uSkyZenith, t);
  c = mix(c, uFogColor, smoothstep(0.02, -0.12, d.y));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunColor * (0.05 * pow(s, 5.0) + 0.22 * pow(s, 60.0));
  return c;
}
// Niebla exponencial con la altura (integral analítica a lo largo del rayo): el valle de Santiago
// queda brumoso y la alta cordillera cristalina, como en la realidad.
float fogAmount(float camY, vec3 rel, float dist) {
  const float H = 1700.0;
  float k = rel.y / H;
  float integral = exp(-camY / H) * (abs(k) < 1e-3 ? 1.0 : (1.0 - exp(-k)) / k);
  return 1.0 - exp(-(uFogDensity * integral + 1.1e-6) * dist);
}
vec3 applyFog(vec3 col, float camY, vec3 rel, float dist) {
  vec3 v = rel / dist;
  vec3 fc = uFogColor + uSunColor * 0.12 * pow(max(dot(v, uSunDir), 0.0), 8.0);
  return mix(col, fc, fogAmount(camY, rel, dist));
}
`;

export const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uCoreDem, uCtxDem, uCoreNrm, uCtxNrm, uNoise;
uniform vec2 uCoreSize, uCoreTex, uCtxTex;
uniform vec4 uCtxRect;
uniform float uStep;

float demFetch(sampler2D t, ivec2 p) { vec2 rg = texelFetch(t, p, 0).rg; return dot(rg, vec2(255.0, 65280.0)) * uStep; }
float demBilinear(sampler2D t, vec2 tc, vec2 size) {
  vec2 fp = clamp(tc - 0.5, vec2(0.0), size - 1.0);
  vec2 i = min(floor(fp), size - 2.0);
  vec2 w = fp - i; ivec2 p = ivec2(i);
  float a = demFetch(t, p), b = demFetch(t, p + ivec2(1, 0)), c = demFetch(t, p + ivec2(0, 1)), d = demFetch(t, p + ivec2(1, 1));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
float coreWeight(vec2 xz) { vec2 d = min(xz, uCoreSize - xz); return smoothstep(0.0, ${f(CORE_BLEND)}, min(d.x, d.y)); }
float baseHeight(vec2 xz, float w) {
  float h = 0.0;
  if (w < 1.0) h = demBilinear(uCtxDem, (xz - uCtxRect.xy) / uCtxRect.zw * uCtxTex, uCtxTex);
  if (w > 0.0) h = mix(h, demBilinear(uCoreDem, xz / uCoreSize * uCoreTex, uCoreTex), w);
  return h;
}
vec2 unpackSlope(vec2 n) { return (n * 255.0 - 128.0) / 127.0; }
vec2 macroSlope(vec2 xz, float w) {
  vec2 n = textureLod(uCtxNrm, (xz - uCtxRect.xy) / uCtxRect.zw, 0.0).rg;
  if (w > 0.0) n = mix(n, textureLod(uCoreNrm, xz / uCoreSize, 0.0).rg, w);
  return unpackSlope(n);
}
float roughAmp(float s2) { return 0.2 * smoothstep(0.00008, 0.0008, s2) + 0.8 * smoothstep(0.002, 0.07, s2); }
// Cada octava se apaga antes de que la malla de ese rango ya no pueda representarla.
float detailHeight(vec2 xz, float dist) {
  float d = ${f(OCTAVES[0].amp)} * textureLod(uNoise, xz / ${f(OCTAVES[0].tile)} + vec2(${OCTAVES[0].off.map(f)}), 0.0).r * (1.0 - smoothstep(600.0, 1200.0, dist));
  d += ${f(OCTAVES[1].amp)} * textureLod(uNoise, xz / ${f(OCTAVES[1].tile)} + vec2(${OCTAVES[1].off.map(f)}), 0.0).r * (1.0 - smoothstep(150.0, 300.0, dist));
  d += ${f(OCTAVES[2].amp)} * textureLod(uNoise, xz / ${f(OCTAVES[2].tile)} + vec2(${OCTAVES[2].off.map(f)}), 0.0).r * (1.0 - smoothstep(50.0, 100.0, dist));
  return d;
}
`;

export const TERRAIN_VERT = /* glsl */ `
${COMMON_VERT}
${HEIGHT_GLSL}
attribute vec4 iA; // origen relativo a la cámara (x, z), tamaño del nodo, nivel de LOD
attribute vec2 iB; // origen absoluto (x, z)
uniform vec3 uCamPos;
uniform float uRange0;
varying vec3 vRel;

void main() {
  float cell = iA.z / CELLS;
  vec2 g = position.xz;
  vec2 absXZ = iB + g * cell, relXZ = iA.xy + g * cell;
  // CDLOD: cerca del borde del rango, los vértices impares se deslizan sobre sus vecinos pares,
  // así la malla calza exacta con el nivel más grueso y no hay grietas ni saltos.
  float h0 = baseHeight(absXZ, coreWeight(absXZ));
  float range = uRange0 * exp2(iA.w);
  float d0 = length(vec3(relXZ.x, h0 - uCamPos.y, relXZ.y));
  float k = clamp((d0 - range * MORPH_START) / (range * (1.0 - MORPH_START)), 0.0, 1.0);
  vec2 shift = fract(g * 0.5) * 2.0 * cell * k;
  absXZ -= shift; relXZ -= shift;

  float w = coreWeight(absXZ);
  float h = baseHeight(absXZ, w);
  vec2 s = macroSlope(absXZ, w);
  float d1 = length(vec3(relXZ.x, h - uCamPos.y, relXZ.y));
  h += detailHeight(absXZ, d1) * roughAmp(dot(s, s));
  vRel = vec3(relXZ.x, h - uCamPos.y, relXZ.y);
  gl_Position = logDepth(projectionMatrix * modelViewMatrix * vec4(vRel, 1.0));
}
`;

// Cada octava se muestrea solo hasta la distancia en que su detalle todavía cabe en un píxel; más lejos el
// mipmap ya la promedió a cero y la lectura es trabajo perdido. Dentro de un `if` hay que usar textureGrad con
// las derivadas calculadas afuera: con derivadas implícitas, el compilador de Direct3D (ANGLE) aplana la rama
// y ejecuta igual las dos mitades.
const oct = (i, target, far) => {
  const T = f(OCTAVES[i].tile), k = f(OCTAVES[i].amp / OCTAVES[i].tile);
  const tap = `textureGrad(uNoise, uCamFrac[${i}] + vRel.xz / ${T}, dRx / ${T}, dRy / ${T})`;
  return far
    ? `vec4 t${i} = vec4(0.0);
  if (dist < ${f(far)}) { t${i} = ${tap} * (1.0 - smoothstep(${f(far * 0.6)}, ${f(far)}, dist)); ${target} += t${i}.yz * ${k}; }`
    : `vec4 t${i} = ${tap};
  ${target} += t${i}.yz * ${k};`;
};

export const TERRAIN_FRAG = /* glsl */ `
${ATMOS_GLSL}
${HEIGHT_GLSL}
varying vec3 vRel;
uniform vec3 uCamPos, uCapSun, uCatPos;
uniform sampler2D uCoreAlb, uCtxAlb, uOv0, uOv1, uOv2;
uniform vec2 uCamFrac[${OCTAVES.length}];
uniform vec2 uWaterFrac;
uniform vec3 uOv[3];   // xy: cámara − centro de la cascada, z: tamaño
uniform vec4 uShow;    // x: caminos y senderos, y: límite internacional
uniform sampler2D uShadow; // sombras arrojadas por el relieve (se recalculan en CPU cuando cambia el sol)
uniform float uStreets;     // 1 si están cargadas las calles menores de OSM
uniform sampler2D uLand;   // cobertura de suelo real: una clase por texel (ver tools/build_landcover.mjs)
#define IS(k) (1.0 - step(0.5, abs(cls - k)))
// Hash entero por parcela (estable entre GPUs, a diferencia de fract(sin())).
float parcelHash(vec2 c) {
  uvec2 q = uvec2(ivec2(c));
  uint h = (q.x * 374761393u) ^ (q.y * 668265263u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return float((h ^ (h >> 16u)) & 0xffffu) / 65536.0;
}
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float ovCover; // cuánto cubren las cascadas vectoriales este punto (1 cerca de la cámara, 0 más allá de ~20 km)
vec4 overlay(vec2 rel, vec2 dx, vec2 dy) {
  vec2 uv0 = (uOv[0].xy + rel) / uOv[0].z + 0.5, uv1 = (uOv[1].xy + rel) / uOv[1].z + 0.5, uv2 = (uOv[2].xy + rel) / uOv[2].z + 0.5;
  vec2 e0 = abs(uv0 - 0.5) * 2.0, e1 = abs(uv1 - 0.5) * 2.0, e2 = abs(uv2 - 0.5) * 2.0;
  float w0 = 1.0 - smoothstep(0.8, 0.96, max(e0.x, e0.y)), w1 = 1.0 - smoothstep(0.8, 0.96, max(e1.x, e1.y)), w2 = 1.0 - smoothstep(0.8, 0.96, max(e2.x, e2.y));
  ovCover = max(w2, max(w1, w0));
  // Una cascada más gruesa solo se lee si la más fina no cubre del todo el punto: casi siempre es 1 lectura (o ninguna, lejos).
  vec4 o = vec4(0.0);
  if (w0 < 1.0) {
    if (w1 < 1.0 && w2 > 0.0) o = textureGrad(uOv2, uv2, dx / uOv[2].z, dy / uOv[2].z) * w2;
    if (w1 > 0.0) o = mix(o, textureGrad(uOv1, uv1, dx / uOv[1].z, dy / uOv[1].z), w1);
  }
  if (w0 > 0.0) o = mix(o, textureGrad(uOv0, uv0, dx / uOv[0].z, dy / uOv[0].z), w0);
  return o;
}

void main() {
  float dist = length(vRel);
  vec3 V = vRel / dist;
  vec2 xz = uCamPos.xz + vRel.xz;
  float y = uCamPos.y + vRel.y;
  float w = coreWeight(xz);
  vec2 uvC = xz / uCoreSize, uvX = (xz - uCtxRect.xy) / uCtxRect.zw;
  // Derivadas de pantalla, una sola vez: de aquí salen todos los gradientes de textura y los anchos de línea.
  vec2 dRx = dFdx(vRel.xz), dRy = dFdy(vRel.xz);
  float dyx = dFdx(vRel.y), dyy = dFdy(vRel.y);
  vec3 alb; vec2 nrg;
  if (w >= 1.0) { // dentro del área jugable (casi todo lo que se ve): no hace falta leer las texturas de contexto
    alb = textureGrad(uCoreAlb, uvC, dRx / uCoreSize, dRy / uCoreSize).rgb; nrg = textureGrad(uCoreNrm, uvC, dRx / uCoreSize, dRy / uCoreSize).rg;
  } else {
    alb = textureGrad(uCtxAlb, uvX, dRx / uCtxRect.zw, dRy / uCtxRect.zw).rgb; nrg = textureGrad(uCtxNrm, uvX, dRx / uCtxRect.zw, dRy / uCtxRect.zw).rg;
    if (w > 0.0) { alb = mix(alb, textureGrad(uCoreAlb, uvC, dRx / uCoreSize, dRy / uCoreSize).rgb, w); nrg = mix(nrg, textureGrad(uCoreNrm, uvC, dRx / uCoreSize, dRy / uCoreSize).rg, w); }
  }
  vec2 nxz = unpackSlope(nrg);
  float s2 = dot(nxz, nxz);
  float ny = sqrt(max(1.0 - s2, 0.02));
  vec3 N0 = vec3(nxz.x, ny, nxz.y);

  // La imagen satelital trae el sombreado de las ~10:30 solar; se atenúa con la normal del DEM
  // para poder reiluminar con otra hora del día.
  float bake = 0.5 + 0.7 * max(dot(N0, uCapSun), 0.0);
  alb /= mix(1.0, clamp(bake, 0.6, 1.2), 0.6);
  // Las sombras arrojadas de la imagen no se pueden quitar con la normal: al menos se levantan los negros.
  alb *= 1.0 + 0.9 * (1.0 - smoothstep(0.0, 0.11, dot(alb, vec3(0.333))));

  float amp = roughAmp(s2);
  float near = 1.0 - smoothstep(250.0, 2500.0, dist);
  float close = 1.0 - smoothstep(6.0, 70.0, dist);
  vec2 gradD = vec2(0.0), gradM = vec2(0.0); // relieve desplazado en geometría / microrrelieve solo de sombreado
  ${oct(0, 'gradD')}
  ${oct(1, 'gradD')}
  ${oct(2, 'gradD', 2500)}
  ${oct(3, 'gradM', 600)}
  ${oct(4, 'gradM', 160)}
  ${oct(5, 'gradM', 45)}
  float cvar = t0.w * 0.30 + t1.w * 0.35 + t2.w * 0.30 + t3.w * 0.30;
  float cav = t2.x + t3.x * 0.7 + t4.x * 0.5;

  vec4 ov = overlay(vRel.xz, dRx, dRy);
  // --- Cobertura de suelo real (ESA WorldCover + OSM). El uv se desordena con ruido para que los bordes
  // entre clases sigan formas naturales y no los escalones del raster.
  float cls = w > 0.999 ? floor(textureLod(uLand, uvC + vec2(t0.w, t1.w) * 0.8 / uCoreTex, 0.0).r * 255.0 + 0.5) : 0.0;
  // Viñas, frutales, parques, plantaciones y glaciares vienen de sus polígonos OSM; el resto, de WorldCover.
  // Lo único sorteado es qué se siembra en cada parcela de campo abierto (WorldCover dice "cultivo", no cuál).
  float ph = parcelHash(floor(xz / vec2(150.0, 205.0)));
  vec3 foliage = mix(mix(vec3(0.15, 0.12, 0.085), vec3(0.07, 0.15, 0.035), uLeaf.x), vec3(0.30, 0.19, 0.04), uLeaf.y * 0.85);
  // Ciudad: desde un cerro debe leerse como trama de calles y manzanas, no como mancha gris.
  float urbanish = IS(5.0) * (1.0 - smoothstep(0.004, 0.02, s2));
  if (urbanish > 0.0) { // casi ningún píxel es ciudad o cultivo: cada bloque de cobertura corre solo para su clase
  vec2 gcell = xz / vec2(118.0, 124.0), gfw = (abs(dRx) + abs(dRy)) / vec2(118.0, 124.0);
  vec2 gedge = 0.5 - abs(fract(gcell) - 0.5);
  // Donde hay calles reales cargadas (cerca), la trama inventada se apaga; más lejos sigue dando textura de ciudad.
  float gfade = (1.0 - smoothstep(0.15, 0.55, max(gfw.x, gfw.y))) * urbanish * (1.0 - ovCover * uStreets);
  float street = max(1.0 - smoothstep(0.045, 0.045 + gfw.x * 1.5, gedge.x), 1.0 - smoothstep(0.045, 0.045 + gfw.y * 1.5, gedge.y));
  alb *= 1.0 + (hash21(floor(gcell)) - 0.5) * 0.42 * gfade;
  alb = mix(alb, alb * 0.5, street * gfade * 0.75);
  }
  // Campos: parcelas de bordes algo chuecos, cada una con su cultivo, y surcos que se ven de cerca.
  if ((cls > 3.5 && cls < 4.5) || (cls > 9.5 && cls < 11.5)) {
  float xfw = abs(dRx.x) + abs(dRy.x) + abs(dRx.y) + abs(dRy.y);
  vec2 pedge = 0.5 - abs(fract(xz / vec2(150.0, 205.0)) - 0.5);
  float lane = (1.0 - smoothstep(0.012, 0.02, min(pedge.x, pedge.y))) * (1.0 - smoothstep(1.0, 6.0, xfw)); // camino de tierra entre parcelas
  vec3 cropCol = ph < 0.3 ? vec3(0.085, 0.15, 0.045) : ph < 0.55 ? vec3(0.15, 0.18, 0.06) : ph < 0.78 ? vec3(0.21, 0.175, 0.10) : vec3(0.11, 0.18, 0.06);
  cropCol = mix(cropCol, vec3(0.19, 0.155, 0.10), (1.0 - uLeaf.x) * 0.45 * step(0.3, ph));  // en invierno, más barbecho
  float furrow = 1.0 + 0.16 * sin((ph > 0.5 ? xz.x : xz.y) * 1.05) * (1.0 - smoothstep(0.5, 2.5, xfw));
  alb = mix(alb, cropCol * furrow * (0.85 + cvar * 0.35), IS(4.0) * 0.72);
  float farm = IS(4.0) + IS(10.0) + IS(11.0);
  // Viñas: hileras cada 3 m (calzan con las parras instanciadas). Frutales: marco de 7 m.
  float vrow = mix(0.55, smoothstep(-0.25, 0.5, cos((xz.x - 1.5) * 2.0944)), 1.0 - smoothstep(0.4, 1.6, xfw));
  alb = mix(alb, mix(vec3(0.20, 0.165, 0.11), foliage, vrow) * (0.85 + cvar * 0.3), IS(10.0) * 0.85);
  float odot = mix(0.5, 1.0 - smoothstep(0.22, 0.4, length(fract(xz / 7.0) - 0.5)), 1.0 - smoothstep(0.8, 3.0, xfw));
  alb = mix(alb, mix(vec3(0.19, 0.16, 0.105), foliage * 0.9, odot) * (0.85 + cvar * 0.3), IS(11.0) * 0.8);
  alb = mix(alb, vec3(0.20, 0.17, 0.12) * (0.9 + cvar * 0.3), lane * farm * 0.8);
  }
  // Parques (pasto regado), vegas y humedales (el verde intenso de la alta cordillera).
  alb = mix(alb, vec3(0.085, 0.16, 0.045) * (0.85 + cvar * 0.4), IS(12.0) * 0.6 + IS(9.0) * 0.72);
  // Bosque y plantaciones: más allá del alcance de los árboles instanciados, el dosel sigue leyéndose como bosque.
  float canopy = (IS(1.0) + IS(13.0)) * smoothstep(150.0, 520.0, dist) * (1.0 - smoothstep(1900.0, 2300.0, y));
  alb = mix(alb, vec3(0.04, 0.068, 0.028) * (0.65 + 0.7 * smoothstep(-0.35, 0.4, t2.w + t3.w * 0.7)), canopy * 0.55);
  // Glaciares: hielo azulado con grietas y franjas de detritos; se distingue de la nieve de temporada.
  float glacier = clamp(IS(14.0) + IS(7.0) * 0.6, 0.0, 1.0), ice = glacier; // la clase "nieve y hielo" permanente de WorldCover es, en la práctica, glaciar
  if (ice > 0.0) {
  float crev = (1.0 - smoothstep(0.015, 0.06, abs(t1.x + t2.x * 0.5))) * glacier * (1.0 - smoothstep(600.0, 4000.0, dist));
  vec3 iceCol = mix(vec3(0.42, 0.56, 0.66), vec3(0.74, 0.81, 0.86), smoothstep(-0.4, 0.5, t0.w + t2.w * 0.6));
  iceCol = mix(iceCol, alb * 0.75 + 0.03, smoothstep(0.25, 0.7, t1.w) * 0.4) * (1.0 - 0.55 * crev);
  alb = mix(alb, iceCol, ice * 0.8);
  }
  // Estaciones: la imagen satelital es de verano (cerros secos). Con las lluvias de invierno la vegetación
  // silvestre del valle y la precordillera reverdece, y vuelve a amarillear hacia el verano.
  float lowland = 1.0 - smoothstep(1500.0, 2700.0, y);
  float wild = clamp(IS(0.0) + IS(1.0) + IS(2.0) + IS(3.0) + IS(6.0) * 0.4, 0.0, 1.0);
  alb = mix(alb, vec3(alb.g * 0.60, alb.g * 0.98 + 0.012, alb.b * 0.5), uGreen * lowland * wild * 0.55 * (1.0 - smoothstep(0.25, 0.6, s2)));

  // De cerca la imagen satelital (34 m/px) es solo un color medio: se le superpone un suelo procedural
  // de parches de tierra y pasto seco, grano fino y piedrecillas claras.
  float steep = smoothstep(0.10, 0.42, s2);
  float patchy = smoothstep(-0.3, 0.3, t1.w + t2.w * 0.6 + t3.x * 0.3);
  vec3 soil = alb * vec3(0.76, 0.70, 0.64), dry = alb * vec3(1.10, 1.06, 0.95) + 0.008;
  alb = mix(alb, mix(soil, dry, patchy), near * 0.8 * (1.0 - steep * 0.6));
  // Estratos en las laderas empinadas (las capas sedimentarias plegadas son la firma del Cajón del Maipo).
  float strata = 0.0;
  if (steep > 0.02) { strata = textureGrad(uNoise, vec2(y / 11.0 + cvar * 0.4, y / 190.0 + xz.x / 5000.0), vec2(dyx / 11.0, dyx / 190.0), vec2(dyy / 11.0, dyy / 190.0)).w; }
  float detail = 1.0 + (cvar * 0.42 + cav * 0.2 * max(amp, 0.4) + strata * 0.3 * steep) * mix(0.3, 1.0, near);
  detail += (t4.w * 0.30 + t5.w * 0.34) * close;
  alb *= max(detail, 0.3);
  float pebble = smoothstep(0.42, 0.7, t5.x * 0.6 + t4.x * 0.55) * close * (0.35 + 0.65 * max(amp, steep));
  alb = mix(alb, alb * 1.5 + vec3(0.035, 0.033, 0.03), pebble * 0.7);

  float road = min(1.0, ov.r * 1.4) * uShow.x, trail = ov.g * uShow.x, water = ov.b, border = ov.a * uShow.y;
  float flat_ = max(max(road, trail * 0.6), water);
  alb = mix(alb, vec3(0.055, 0.058, 0.062) * (1.0 + cvar * 0.25), road * 0.92);
  alb = mix(alb, (alb * 0.9 + vec3(0.075, 0.062, 0.045)) * (1.0 + cvar * 0.3), trail * 0.85); // huella de tierra: algo más clara que su entorno

  // Nieve estacional: sobre la línea de nieve, con borde irregular, sin pegarse en los paredones y bajando
  // unos 300 m más en las laderas que miran al sur (en el hemisferio sur son las de umbría).
  float sline = uSnowLine - 320.0 * clamp(nxz.y * 2.2, -1.0, 1.0);
  float snow = smoothstep(sline - 140.0, sline + 240.0, y + (t0.w * 0.55 + t1.w * 0.45) * 170.0);
  snow *= (1.0 - smoothstep(0.42, 0.78, s2)) * (1.0 - water) * (1.0 - road * 0.6);
  alb = mix(alb, vec3(0.64, 0.68, 0.74) * (1.0 + cvar * 0.10 + t1.x * 0.05), snow); // no más claro: con el sol encima se quemaría y se perdería el relieve
  vec2 g = -nxz / ny + (gradD * amp * 0.85 + gradM * max(amp, 0.55) * 1.15) * (1.0 - 0.8 * flat_) * (1.0 - 0.45 * snow);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));

  float ndl = max(dot(N, uSunDir), 0.0);
  // Sombra de contacto del gato.
  vec2 dc = vRel.xz - uCatPos.xz + uSunDir.xz * 0.18;
  float blob = exp(-dot(dc, dc) / 0.16) * step(abs(vRel.y - uCatPos.y), 1.5);
  float shade = w > 0.0 ? mix(1.0, textureLod(uShadow, uvC, 0.0).r, w) : 1.0;
  float gloss = pow(max(dot(reflect(V, N), uSunDir), 0.0), 40.0) * (ice * 0.35 + snow * 0.12) * shade; // el hielo brilla
  vec3 light = uSunColor * (ndl + gloss) * shade * (1.0 - 0.6 * blob) + uAmbient * (0.55 + 0.45 * N.y) * (1.0 - 0.35 * blob);
  vec3 col = alb * light;

  if (water > 0.004) {
    vec2 wuv = uWaterFrac + vRel.xz / 7.0;
    vec2 flow = uTime * vec2(0.031, 0.019);
    vec2 wdx = dRx / 7.0, wdy = dRy / 7.0;
    vec2 wg = textureGrad(uNoise, wuv + flow, wdx, wdy).yz + textureGrad(uNoise, wuv * 2.7 - flow * 1.6, wdx * 2.7, wdy * 2.7).yz * 0.6;
    vec3 Nw = normalize(vec3(nxz.x * 0.4 - wg.x * 0.010, 1.0, nxz.y * 0.4 - wg.y * 0.010));
    float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-V, Nw), 0.0), 5.0);
    vec3 R = reflect(V, Nw); R.y = abs(R.y);
    vec3 body = mix(vec3(0.02, 0.07, 0.085), alb * 0.7, 0.45) * (uSunColor * max(uSunDir.y, 0.0) * 0.5 + uAmbient);
    // Rápidos: espuma donde el río corre con pendiente.
    float foam = smoothstep(0.004, 0.05, s2) * smoothstep(-0.2, 0.6, textureGrad(uNoise, wuv * 1.9 + flow * 3.0, wdx * 1.9, wdy * 1.9).w);
    body = mix(body, vec3(0.75, 0.78, 0.78) * (uSunColor * 0.3 + uAmbient), foam * 0.7);
    vec3 wc = mix(body, skyColor(R), fres * (1.0 - foam * 0.6));
    wc += uSunColor * pow(max(dot(R, uSunDir), 0.0), 420.0) * 5.0;
    col = mix(col, wc, water);
  }

  // Límite internacional: franja punteada pintada sobre el terreno.
  float dash = 0.75 + 0.25 * step(0.5, fract((xz.x + xz.y) / 90.0));
  col = mix(col, vec3(1.0, 0.16, 0.12) * (0.6 + uSunColor.r * 0.15) * dash, border * 0.82);

  col = applyFog(col, uCamPos.y, vRel, dist);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FRAG = /* glsl */ `
${ATMOS_GLSL}
uniform sampler2D uNoise;
uniform float uCamY;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 col = skyColor(d);
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (smoothstep(0.99985, 0.99994, s) * 14.0 + pow(s, 900.0) * 1.2) * (1.0 - uStorm);
  // Cirros altos: una capa plana de ruido proyectada, tenue y sin costo real.
  if (d.y > 0.015) {
    vec2 p = d.xz / (d.y + 0.08) * 0.11 + uTime * vec2(0.0012, 0.0004);
    float c = texture2D(uNoise, p).w * 0.6 + texture2D(uNoise, p * 3.1 + 0.37).w * 0.3 + texture2D(uNoise, p * 0.31).x * 0.5;
    c = smoothstep(0.22, 0.85, c) * smoothstep(0.015, 0.16, d.y) * 0.6;
    vec3 cc = uSunColor * (0.26 + 0.25 * pow(s, 6.0)) + uAmbient * 0.75;
    col = mix(col, cc, c);
    // Frente de mal tiempo: capa cerrada de nubes grises.
    float ov = 0.75 + 0.25 * texture2D(uNoise, p * 0.7 + uTime * 0.004).w;
    col = mix(col, (uSkyHorizon * 0.8 + uAmbient * 0.35) * ov, uStorm * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
