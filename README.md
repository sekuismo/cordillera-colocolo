# Cordillera

Un juego de exploración en el navegador: eres un **gato colocolo** (*Leopardus colocola*) y recorres, a escala real y en 3D, la cordillera de Santiago y el Cajón del Maipo, desde la ciudad hasta pasado el límite con Argentina.

**Jugar:** https://sekuismo.github.io/cordillera-colocolo/

- Relieve real (DEM de 30 m) de un área de 111 × 139 km: Santiago, Sierra de Ramón, Farellones y El Plomo, todo el Cajón del Maipo, los volcanes San José, Tupungato y Maipo, y unos 20 km de Mendoza.
- Imagen satelital Sentinel-2 como color base, con suelo, vegetación y rocas procedurales de cerca.
- 2.500 nombres (cumbres, localidades, ríos, glaciares, refugios…) que se prenden y apagan por capa.
- 48 fichas explicativas que aparecen al llegar a cada lugar, más los pisos de vegetación por altitud.
- Estaciones del año: la línea de nieve sube y baja, entran frentes con su isoterma cero (nieva arriba, llueve abajo), el valle reverdece en invierno y el sol pasa más bajo.
- Sombras arrojadas por los cerros según la hora y la época.
- Santiago reconocible desde los cerros: skyline por barrio e hitos a escala real (Gran Torre Costanera, Torre Entel, La Moneda, Estadio Nacional, Templo Bahá’í, Virgen del San Cristóbal…).
- Funciona en escritorio y en móvil (joystick táctil, calidad adaptativa).

## Controles

| Escritorio | Acción |
| --- | --- |
| `W A S D` / flechas | Moverse |
| Clic (Esc para soltar) | Capturar el mouse y mirar como en un FPS |
| Rueda, `V` | Acercar o alejar la cámara, primera persona |
| `1`–`5`, `Shift` | Marchas: Paseo, Trote, Carrera, Turbo, Híper |
| `Espacio`, `E` | Saltar (mantener = más alto), avance automático |
| `M`, `N` | Mapa (viaje rápido), mostrar/ocultar nombres |

En móvil: joystick en el lado izquierdo, arrastrar en el derecho para mirar, pellizcar para alejar.

## Cómo está hecho

Es solo frontend estático, sin build: módulos ES + [three.js](https://threejs.org) incluido en `vendor/`. Todos los datos van dentro del repo en `data/` (≈16 MB; un jugador baja 12 MB en calidad alta o 5 MB en móvil).

| Pieza | Enfoque |
| --- | --- |
| Terreno | CDLOD: quadtree por distancia + una sola grilla instanciada (2 draw calls). La altura se calcula en el vertex shader desde el DEM en textura; el *morph* entre niveles evita grietas y saltos. |
| Compresión del DEM | 16 bits cuantizados a 0,5 m → predictor planar → zigzag → gzip. 13,3 M de muestras en 7,6 MB (4,6 bits/muestra). Se decodifica en un Web Worker con `DecompressionStream`. |
| Precisión | Render relativo a la cámara y profundidad logarítmica por vértice: un gato de 1 m y un horizonte a 300 km en la misma escena, sin z-fighting. |
| Detalle bajo 34 m | Ruido fBm periódico compartido entre CPU y GPU: desplaza la malla cerca de la cámara y la física del gato usa exactamente la misma función. |
| Ríos, caminos, frontera | Vectores OSM rasterizados en GPU a 3 texturas en cascada centradas en la cámara (0,25 m/px cerca, 16 m/px lejos). |
| Nombres | Etiquetas HTML priorizadas por aislamiento topográfico de la cumbre y distancia, con oclusión por el relieve. |
| Sombras del relieve | Barrido O(N) sobre el DEM en CPU (altura de sombra por línea paralela al sol), repartido en varios cuadros y subido como textura de 1 canal. |
| Estaciones | Un solo parámetro (fracción del año) mueve la declinación solar, la línea de nieve, el verdor y la probabilidad de frentes. |

`src/heightfield.js` (CPU) y `HEIGHT_GLSL` en `src/shaders.js` (GPU) son la misma función escrita dos veces: si se cambia una, hay que cambiar la otra.

## Correr en local

```bash
python tools/serve.py 8123
```

y abrir http://localhost:8123. Parámetro opcional `?q=hi` o `?q=lo` para forzar la calidad.

## Regenerar los datos

```bash
cd tools && npm install
node download.mjs          # ~250 MB a /raw (ignorado por git)
node build_dem.mjs && node build_albedo.mjs && node build_osm.mjs && node build_manifest.mjs
node check_lugares.mjs     # valida las coordenadas de las fichas contra OSM
```

El área y las resoluciones se definen en `tools/config.mjs`.

## Datos y licencias

- **Relieve:** Copernicus DEM GLO-30 © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, provisto bajo COPERNICUS por la Unión Europea y la ESA. Horizonte lejano: Terrain Tiles (Mapzen/AWS Open Data).
- **Imagen:** [Sentinel-2 cloudless 2016](https://s2maps.eu) por EOX IT Services GmbH (contiene datos Copernicus Sentinel modificados 2016), CC BY 4.0.
- **Nombres, caminos, ríos y límite:** © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL.
- **Código:** MIT (ver `LICENSE`).

Los textos de las fichas son divulgativos; el límite internacional dibujado es referencial.
