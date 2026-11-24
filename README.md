# Cordillera

Un juego de exploración en el navegador: eres un **gato colocolo** (*Leopardus colocola*), un **puma** (*Puma concolor*) o un **cóndor andino** (*Vultur gryphus*) y recorres, a escala real y en 3D, la cordillera de Santiago y el Cajón del Maipo, desde la ciudad hasta pasado el límite con Argentina.

**Jugar:** https://sekuismo.github.io/cordillera-colocolo/

Desarrollado por **Esteban Muñoz**.

- Relieve real (DEM de 30 m) de un área de 111 × 139 km: Santiago, Sierra de Ramón, Farellones y El Plomo, todo el Cajón del Maipo, los volcanes San José, Tupungato y Maipo, y unos 20 km de Mendoza.
- Imagen satelital Sentinel-2 como color base, con suelo y rocas procedurales de cerca.
- Vegetación según la cobertura de suelo real (ESA WorldCover + polígonos OSM): espinal, bosque esclerófilo, quiscos en solana, ciprés de la cordillera, neneo, llareta y vegas; y lo plantado: álamos en hilera, viñas, frutales, eucaliptos y árboles urbanos, con follaje caduco que cambia por estación. Glaciares, cultivos y ciudad pintados desde la misma capa.
- 2.500 nombres (cumbres, localidades, ríos, glaciares, refugios…) que se prenden y apagan por capa.
- 48 fichas explicativas que aparecen al llegar a cada lugar, más los pisos de vegetación por altitud.
- Estaciones del año: la línea de nieve sube y baja, entran frentes con su isoterma cero (nieva arriba, llueve abajo), el valle reverdece en invierno y el sol pasa más bajo.
- Sombras arrojadas por los cerros según la hora y la época.
- Calles reales de Santiago y los pueblos (110 mil vías de OSM, incluidos pasajes); las casas se ordenan paralelas a su calle y los árboles urbanos van en la vereda.
- Santiago reconocible desde los cerros: skyline por barrio e hitos a escala real (Gran Torre Costanera, Torre Entel, La Moneda, Estadio Nacional, Templo Bahá’í, Virgen del San Cristóbal…).
- Tres animales con habilidades distintas: el colocolo salta dos veces y usa el olfato para marcar el próximo lugar por descubrir; el puma salta más lejos, corre más rápido y embiste; el cóndor vuela, planea con el viento de ladera y sube en una térmica.
- Música de raíz andina generada por código (quena, zampoña, charango y bombo sintetizados) que llega por piezas, con silencios largos entre una y otra: cada pieza sortea modo (pentatónica menor, mayor o bimodal), tono, tempo, instrumentos y volumen. Efectos y ambiente procedurales: viento, río, lluvia, pasos y aleteos. Sin archivos de audio.
- Animales a tamaño real y con física: caen, saltan en las lomas, resbalan en las laderas muy empinadas y ruedan tras una mala caída.
- **La montaña cuesta.** Subir gasta el aguante, en altura el aire rinde menos, las laderas muy empinadas hacen resbalar y una caída grande es fatal (se vuelve al último lugar seguro). Turbo e Híper solo corren por caminos: el cerro se sube a pata. Hay un modo paseo que apaga todo esto.
- **Exploración.** El mapa parte tapado y se abre con lo que se recorre; llegar a una cumbre la anota en el libro de cumbres, cuenta el desnivel subido, dice qué cerros se ven de verdad desde ahí y destapa el mapa alrededor. Hay secretos (lugares reales que no figuran en ninguna lista hasta que se llega) y solo se puede viajar por el mapa a lo que ya se conoce.
- **Pueblos como son.** Nombres reales de las calles sobre la calle misma, carteles con el nombre real de cada local y servicio en su edificio, casas distintas entre sí (alto, techo, vanos, protecciones, color), rejas y panderetas en los antejardines, postes con tendido, defensas camineras donde el camino da al barranco, y los edificios relevados uno por uno toman su color y sus pisos reales. San José de Maipo está relevado edificio por edificio (209, mirando la calle): su plaza con la pileta, la iglesia parroquial con su torre, y cada fachada del centro con su color y su cartel. Los puentes del Cajón llevan su baranda real y los distintos (el arco del río Colorado, el reticulado de El Ingenio, el mecano de San Alfonso) están modelados como son.
- **Imagen de alta resolución** por streaming (Esri World Imagery, ~0,5 m por píxel) sobre la Sentinel-2 del repo; los techos de las casas toman su color de la foto. El río lleva su lecho de piedras, sus bolones y su agua turbia.
- Piruetas: en el aire, con Truco, mortales y giros que dan puntos y un impulso si se aterriza derecho; chocar a la carrera contra una casa o un árbol bota al animal.
- Funciona en escritorio, en móvil (joystick táctil) y con control de consola; la calidad se adapta sola al equipo.

## Controles

| Escritorio | Acción |
| --- | --- |
| `W A S D` / flechas | Moverse |
| Arrastrar | Mirar alrededor |
| Rueda, `V` | Acercar o alejar la cámara, primera persona |
| `1`–`5`, `Shift` | Marchas: Paseo, Trote, Carrera, Turbo, Híper |
| `Espacio`, `E` | Saltar (mantener = más alto; con el cóndor, despegar y subir), avance automático |
| `C` | Bajar en picada (cóndor) |
| `Q`, `T` | Habilidad especial, cambiar de animal |
| `M`, `N` | Mapa (viaje rápido), mostrar/ocultar nombres |
| `P`, `K` | Modo foto (oculta la interfaz), silenciar |

En móvil: joystick en el lado izquierdo, arrastrar en el derecho para mirar, pellizcar para alejar.

Con control (mapeo estándar): stick izquierdo para moverse y derecho para mirar, `A` salta o aletea, `B`/`LT` baja, `X` habilidad, `Y` mapa, `LB`/`RB` marchas, `RT` acelera, cruceta arriba/abajo acerca la cámara, `Select` cambia de animal y `Start` abre la ayuda.

## Cómo está hecho

Es solo frontend estático, sin build: módulos ES + [three.js](https://threejs.org) incluido en `vendor/`. Todos los datos van dentro del repo en `data/` (≈19 MB; un jugador baja unos 15 MB en calidad alta o 6 MB en móvil).

| Pieza | Enfoque |
| --- | --- |
| Terreno | CDLOD: quadtree por distancia + una sola grilla instanciada (2 draw calls). La altura se calcula en el vertex shader desde el DEM en textura; el *morph* entre niveles evita grietas y saltos. |
| Compresión del DEM | 16 bits cuantizados a 0,5 m → predictor planar → zigzag → gzip. 13,3 M de muestras en 7,6 MB (4,6 bits/muestra). Se decodifica en un Web Worker con `DecompressionStream`. |
| Precisión | Render relativo a la cámara y profundidad logarítmica por vértice: un gato de 1 m y un horizonte a 300 km en la misma escena, sin z-fighting. |
| Detalle bajo 34 m | Ruido fBm periódico compartido entre CPU y GPU: desplaza la malla cerca de la cámara y la física del gato usa exactamente la misma función. |
| Ríos, caminos, frontera | Vectores OSM rasterizados en GPU a 4 texturas en cascada centradas en la cámara (0,25 m/px cerca, 8 m/px a media distancia, 32 m/px lejos). Las rutas pavimentadas llevan berma, eje amarillo y líneas de borde. |
| Plataforma de caminos y cauce de ríos | El DEM de 34 m no tiene ni la calzada ni el cauce: a lo largo de cada camino y río de OSM se talla una plataforma plana (cota del DEM suavizada a lo largo del trazado) con taludes de corte y relleno, y un cauce de agua plana que solo baja aguas abajo. Es una función pura (`src/carve.js`) que evalúan igual la física del gato y un worker que arma la ventana de 1 km que lee el vertex shader. |
| Detalle real por zonas | El core se parte en zonas de 4 km (`data/zones/`) y solo se bajan las que rodean al jugador: imagen Sentinel-2 a 8 m/px (un anillo de 4×4 zonas en una textura con repetición, sin mover nada al avanzar), cada árbol detectado en la altura de dosel de Meta con su altura real y cada huella de edificio de Overture como rectángulo orientado con sus pisos (OSM) o un estimado. |
| Puentes, alta tensión, tuberías, andariveles | Trazados reales de OSM (`data/infra.json`); la geometría 3D se arma en el navegador por celdas de 4 km cerca de la cámara (`src/infra.js`). Los puentes se pueden cruzar caminando. |
| Nombres | Etiquetas HTML priorizadas por aislamiento topográfico de la cumbre y distancia, con oclusión por el relieve. |
| Sombras del relieve | Barrido O(N) sobre el DEM en CPU (altura de sombra por línea paralela al sol), repartido en varios cuadros y subido como textura de 1 canal. |
| Vegetación | Raster de clases de 1 byte por texel (1,5 MB) compartido por CPU y GPU: la CPU decide qué especie instanciar en cada punto y el shader pinta cultivos, dosel y hielo. |
| Estaciones | Un solo parámetro (fracción del año) mueve la declinación solar, la línea de nieve, el verdor y la probabilidad de frentes. |
| Animales | `src/animals.js` define cifras y textos; `src/cat.js` arma colocolo y puma del mismo esqueleto y `src/condor.js` el cóndor. El vuelo es una velocidad vertical que busca su equilibrio entre planeo, aleteo, pérdida por falta de velocidad y viento de ladera. |
| Física | Sin motor de física: el animal es un punto que cae con gravedad y choca contra la función de altura (`src/player.js`). De ahí salen los saltos en las lomas, el resbalón en laderas, las caídas, el aguante y las piruetas. |
| Imagen por streaming | `src/sat.js`: tres niveles (zoom 18, 16 y 15) centrados en la cámara, cada uno un anillo de 8×8 teselas en una capa de una textura de arreglo. De la foto se usa el detalle (foto dividida por su promedio de ~32 m) aplicado sobre el color de la imagen propia, para que no se vea lavada ni cambie con la fecha de captura. La clave va en `src/config.js`, restringida por dominio. Nada se guarda. |
| Calles, carteles y pueblos | `tools/build_street_names.mjs` y `tools/build_pois.mjs` sacan del extracto de OSM los nombres de las calles y de los locales, por zona de 4 km (`data/zones/names/`, `data/zones/pois/`). `src/streetnames.js` pone los letreros, `src/signs.js` pinta los carteles en un lienzo y los instancia sobre la fachada que da a la calle, `src/roadside.js` arma defensas y postes, y `src/pueblos.js` guarda los edificios relevados a mano. |
| Progreso | `src/progreso.js`: niebla de exploración (una celda cada 500 m), libro de cumbres y secretos (`src/secretos.js`), guardados en el navegador. |
| Sonido | `src/audio.js`: Web Audio sin archivos. Música generativa en La menor pentatónica con instrumentos sintetizados (Karplus-Strong para el charango) y capas que entran según lo que hace el animal. |
| Color | Tone mapping AgX más un ajuste propio de saturación y contraste (`CustomToneMapping` en `src/main.js`): ACES teñía de morado el cielo y saturaba los cerros. |
| Resolución adaptativa | Con `EXT_disjoint_timer_query_webgl2` se mide el tiempo real de GPU por cuadro y se ajustan la resolución interna y la densidad de la malla del relieve para caber en 12,5 ms; sin esa extensión, se estima por fps detectando si el navegador limita los cuadros. |

`src/heightfield.js` (CPU) y `HEIGHT_GLSL` en `src/shaders.js` (GPU) son la misma función escrita dos veces: si se cambia una, hay que cambiar la otra.

## Correr en local

```bash
python tools/serve.py 8123
```

y abrir http://localhost:8123. Parámetro opcional `?q=hi` o `?q=lo` para forzar la calidad.

## Medir rendimiento

`tools/bench.js` se pega en la consola del navegador con el juego cargado: dibuja a 1280×720 fijo en cinco lugares y espera a la GPU en cada cuadro, así que mide el costo real aunque la pestaña esté en segundo plano (donde el navegador frena `requestAnimationFrame` y los fps no dicen nada). Separa terreno y vegetación, y vértices de píxeles. Para comparar dos versiones hay que intercalarlas en la misma sesión: entre corridas el equipo cambia de carga y los números absolutos se mueven fácil un 40 %.

## Regenerar los datos

```bash
cd tools && npm install
node download.mjs          # ~250 MB a /raw (ignorado por git)
node build_dem.mjs && node build_albedo.mjs && node build_osm.mjs && node build_landcover.mjs && node build_manifest.mjs
node check_lugares.mjs     # valida las coordenadas de las fichas contra OSM

# Calles menores: salen de un extracto PBF, porque Overpass no entrega una ciudad completa.
# Bajar https://download.geofabrik.de/south-america/chile-latest.osm.pbf a raw/pbf/chile.osm.pbf y luego:
node extract_streets.mjs && node build_streets.mjs
node extract_infra.mjs && node build_infra.mjs   # puentes, torres, tuberías, andariveles y etiquetas de rutas
node build_street_names.mjs && node build_pois.mjs  # nombres de calles y de locales por zona (del mismo PBF)
node build_pueblos.mjs                              # edificios relevados a mano (tools/relevamientos/*.txt) → src/pueblos_data.js
node download.mjs sat14 && python extract_buildings.py && python build_buildings.py && python build_trees.py
node build_zones.mjs                                # imagen, árboles y edificios por zona → data/zones/
node build_manifest.mjs
```

El área y las resoluciones se definen en `tools/config.mjs`.

## Datos y licencias

- **Relieve:** Copernicus DEM GLO-30 © DLR e.V. 2010-2014 y © Airbus Defence and Space GmbH 2014-2018, provisto bajo COPERNICUS por la Unión Europea y la ESA. Horizonte lejano: Terrain Tiles (Mapzen/AWS Open Data).
- **Imagen:** [Sentinel-2 cloudless 2016](https://s2maps.eu) por EOX IT Services GmbH (contiene datos Copernicus Sentinel modificados 2016), CC BY 4.0.
- **Cobertura de suelo:** © ESA WorldCover project 2021 / contiene datos Copernicus Sentinel modificados (2021) procesados por el consorcio ESA WorldCover, CC BY 4.0.
- **Nombres, caminos, ríos y límite:** © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL.
- **Árboles:** [High Resolution Canopy Height Maps](https://sustainability.atmeta.com/blog/2024/04/22/using-artificial-intelligence-to-map-the-earths-forests/) © World Resources Institute y Meta, CC BY 4.0 (cada árbol es una copa detectada en la altura de dosel de ~1 m).
- **Edificios:** [Overture Maps Foundation](https://overturemaps.org), ODbL; fusiona OpenStreetMap, Microsoft ML Buildings y Google Open Buildings.
- **Imagen de alta resolución (streaming):** Esri World Imagery, vía ArcGIS Location Platform. Fuente: Esri, Vantor, Earthstar Geographics y la comunidad de usuarios GIS. No se almacena ni se redistribuye.
- **Código:** MIT (ver `LICENSE`).

Los textos de las fichas son divulgativos; el límite internacional dibujado es referencial. Viñas, frutales, parques, plantaciones y glaciares salen de sus polígonos OSM; en el campo abierto restante, WorldCover indica que hay cultivo pero no cuál, así que el color de cada parcela es sorteado.
