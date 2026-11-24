// Cumbres verificadas: corrige y enriquece lo que viene de OpenStreetMap para las montañas que importan.
//
// OSM trae ~620 cumbres en el área, pero con errores que en un juego de montaña se notan: altitudes viejas o de otro
// punto, nodos puestos a cientos de metros de la cima (y entonces "haces cumbre" en una ladera), duplicados y
// cumbres emblemáticas castigadas por estar al lado de otra más alta. Aquí va la versión revisada de las ~45 que
// todo andinista de Santiago conoce.
//
// Fuentes: altitud de Andeshandbook (que sigue la carta del IGM) o Wikipedia cuando se indica; coordenadas de OSM
// revisadas contra el máximo del DEM del juego (todas caen a menos de ~50 m de la cima del relieve, salvo
// Tupungatito y San José, que se movieron a la cima del DEM porque el nodo OSM estaba en una ladera).
// Si se cambia algo aquí, tiene que ser verdad y estar donde dice.
//
// [nombre, altitud m, lat, lon, prioridad (0 se ve desde 170 km, 1 desde 42 km), dato, nombre en OSM si es otro]
// Nombre en OSM null = no hay nodo útil y se crea la etiqueta.
export const CUMBRES = [
  // ---- Cerros de la ciudad y precordillera
  ['Cerro Manquehue', 1635, -33.3508, -70.5822, 1, 'Del mapudungun: "lugar de cóndores". Es el cerro más alto del valle de Santiago.'],
  ['Cerro Manquehuito', 1316, -33.3554, -70.5667, 1, 'El hermano chico del Manquehue: un sendero corto y familiar desde Lo Curro.'],
  ['Cerro El Carbón', 1365, -33.3626, -70.6006, 1, 'El punto más alto del Parque Metropolitano de Santiago.'],
  ['Cerro Pochoco', 1804, -33.3546, -70.4502, 1, 'Ojo: la "cumbre tradicional" a la que llega casi todo el mundo está a 1.692 m, unos 700 m antes de esta, la verdadera.'],
  // ---- Sierra de Ramón
  ['Alto del Naranjo', 1890, -33.3934, -70.4523, 1, 'Una explanada con un quillay solitario: el descanso obligado en la ruta normal al Provincia.'],
  ['Cerro Provincia', 2750, -33.4265, -70.4349, 1, 'La cumbre más visitada de la sierra. Antes se llamaba "de la Providencia"; junto a la cima hay un domo que sirve de refugio.'],
  ['Cerro La Cruz', 2552, -33.4753, -70.4713, 1, 'También le dicen Morro del Carnero. La ruta normal sube desde el Parque Mahuida, en La Reina.'],
  ['Cerro de Ramón', 3253, -33.4858, -70.4388, 0, 'El techo de la sierra. Lleva el nombre del gobernador Alonso García de Ramón; lo de "San Ramón" es uso popular.', 'Cerro San Ramón'],
  ['Punta de Damas', 3149, -33.5047, -70.4439, 1, 'La segunda cumbre de la sierra. El nombre viene de sus dos montículos redondeados.'],
  ['Cerro Minillas', 2467, -33.5362, -70.4795, 1, 'La cima más austral de la Sierra de Ramón; se reconoce por sus antenas.'],
  ['Cerro Purgatorio', 2458, -33.6199, -70.4278, 1, 'Se ganó el nombre por lo largo del acceso y la falta de agua en el camino.'],
  // ---- Farellones y Grupo Plomo
  ['Cerro Colorado', 3339, -33.3462, -70.2696, 1, 'El cerro que le da nombre al centro de esquí El Colorado.'],
  ['Cerro Franciscano', 3612, -33.3195, -70.2612, 1, 'La cumbre que corona el centro de esquí La Parva.'],
  ['Cerro La Parva', 4047, -33.3017, -70.2586, 1, '"Parva" es el montón de paja que queda tras la trilla. Es el típico primer cuatromil de los santiaguinos.'],
  ['Cerro Pintor', 4180, -33.2891, -70.2492, 1, 'El nombre viene de sus farellones de colores. Se sube en el día desde La Parva.'],
  ['Cerro Cepo', 4309, -33.3068, -70.1874, 1, 'La mayor altura del cordón del Cepo, que cierra Valle Nevado por el oriente.'],
  ['Cerro Bismarck', 4650, -33.2721, -70.1983, 1, 'Lo subieron Brant y Luck en 1893, el día del cumpleaños 78 del canciller alemán. Se escaló antes que El Plomo.'],
  ['Cerro Leonera', 4954, -33.2470, -70.2413, 1, '"Lugar de leones", que es como los arrieros llamaban a los pumas. Primera ascensión en 1935.'],
  ['Cerro La Paloma', 4910, -33.1820, -70.2653, 1, 'Subido en 1912. Su glaciar es la postal de Yerba Loca; el acceso por el norte lo corta la mina Los Bronces.'],
  ['Cerro Altar', 5180, -33.1868, -70.2434, 1, 'Primer ascenso registrado en 1929. Su glaciar colgante cierra el fondo del valle de Yerba Loca.'],
  ['Cerro Littoria', 5352, -33.2174, -70.2185, 1, 'Lo subieron en 1934 los italianos Binaghi y Gervasutti, que lo bautizaron con el nombre de una ciudad italiana (hoy Latina).'],
  ['Cerro El Plomo', 5424, -33.2368, -70.2144, 0, 'Primera ascensión moderna en 1896 (Brant y Luck), pero los incas ya subían: en 1954 se encontró aquí el cuerpo de un niño ofrendado en una capacocha hace unos 500 años.'],
  ['Cerro Risopatrón', 5720, -33.1519, -70.0637, 1, 'Honra a Luis Risopatrón, el geógrafo que trazó buena parte del límite con Argentina.'],
  ['Nevado del Plomo', 6070, -33.1039, -70.0660, 0, 'Un seismil de la frontera que no hay que confundir con el cerro El Plomo que se ve desde Santiago.'],
  ['Nevado Juncal', 5953, -33.0520, -70.1016, 1, 'Pese a su porte no alcanza a ser seismil. De sus hielos nace el río Juncal, que baja hacia el Aconcagua.', 'Nevado Juncal (Cumbre Chilena)'],
  // ---- Cajón del Maipo
  ['Cerro San Francisco', 4345, -33.7475, -70.0883, 1, 'Del San Francisco cuelga el glaciar que se ve al fondo del Monumento Natural El Morado.'],
  ['Mirador del Morado', 3883, -33.7474, -70.0684, 1, 'Subido en 1931 por el glaciar San Francisco: el mejor balcón para mirar la pared del Morado.', 'Cerro Mirador del Morado'],
  ['Cerro El Morado', 4647, -33.7302, -70.0641, 1, 'Primera ascensión en 1933. Su pared sur, escalada en 1961, es una de las grandes paredes de Chile central.'],
  ['Cerro Unión', 3658, -33.7562, -70.0550, 1, 'Se levanta justo al sur de la laguna del Morado.'],
  ['Cerro Arenas', 4366, -33.7574, -70.0125, 1, 'Su pared sur, escalada en 1962, domina el valle de las Arenas.'],
  ['Punta Zanzi', 3250, -33.8344, -70.0294, 1, 'Recuerda a José Zanzi, andinista muerto en 1951. La subieron en su memoria al año siguiente.'],
  ['Cerro Retumbadero', 3825, -33.8652, -70.0827, 1, 'En su ladera se ve la franja de roca clara que llaman "Las Amarillas".', 'Cerro Retumbadero Norte'],
  ['Cerro Diablo', 4190, -33.9030, -70.0977, 1, 'Una cumbre de dos puntas, "como cuernos": de ahí el nombre.'],
  ['Cerro Mesón Alto', 5257, -33.6826, -70.0353, 1, 'Su cumbre plana, como una mesa cubierta de hielo, se reconoce desde el embalse El Yeso.'],
  ['Cerro Loma Larga', 5404, -33.6873, -69.9882, 1, 'Tiene tres cumbres. Con el Mesón Alto y el Cortaderas forma la muralla sur del valle del Yeso.'],
  ['Cerro Cortaderas', 5197, -33.7036, -69.9985, 1, 'Primera ascensión en 1932, por la misma cordada alemana que abrió medio Cajón del Maipo.'],
  // ---- Frontera y volcanes
  ['Volcán Tupungatito', 5600, -33.3960, -69.8074, 1, 'El volcán activo más cercano a Santiago: su última erupción fue en 1986. Las fuentes le dan entre 5.600 y 5.650 m.'],
  ['Volcán Tupungato', 6570, -33.3579, -69.7695, 0, 'Primera ascensión en 1897 (Zurbriggen y Vines). Es la cumbre más alta de la Región Metropolitana.'],
  ['Cerro Sierra Bella', 5275, -33.2734, -69.8346, 1, 'Subido por primera vez el 14 de febrero de 1949.', 'Sierra Bella'],
  ['Cerro Alto San Juan', 6148, -33.4687, -69.8153, 0, 'Uno de los seismiles de la frontera, entre el Tupungato y el Piuquenes. Altitud según Wikipedia.', 'Cerro San Juan'],
  ['Nevado de los Piuquenes', 6019, -33.5151, -69.8351, 0, 'Un seismil poco conocido. El nombre viene del piuquén, el ganso andino.'],
  ['Cerro Trono', 5477, -33.5072, -69.8647, 1, 'En la carta del IGM figura como "Trono Blanco". Primera ascensión en 1946.'],
  ['Cerro Marmolejo', 6108, -33.7348, -69.8778, 0, 'El seismil más austral del mundo: de aquí al sur ninguna montaña del planeta vuelve a pasar los 6.000 m.', null],
  ['Volcán San José', 5856, -33.7897, -69.8954, 0, 'Un volcán activo, con fumarolas. En su ruta normal está el refugio Plantat (3.130 m), construido en 1937.'],
  ['Cerro Castillo', 5468, -33.9757, -69.8811, 1, 'Lo subieron recién en 1953, clavando cuñas de madera en la roca.'],
  ['Volcán Maipo', 5264, -34.1638, -69.8318, 0, 'Primera ascensión en 1883 (Güssfeldt). Creció dentro de la caldera del Diamante, de 20 por 15 km.'],
];

// Etiquetas de OSM que sobran: duplicados de una cumbre que ya está, o nodos con altitud y posición imposibles.
// [nombre, altitud]: ambos tienen que calzar.
const SOBRAN = [
  ['Volcán Marmolejo', 5006], // a 1,9 km de la cima real y 1.100 m más bajo: el Marmolejo de verdad va arriba
  ['Volcán Cerro Negro', 6152], // mismo cerro que "Cerro Negro", a 740 m
  ['Aguja Punta Zanzi', 3250], // copia de Punta Zanzi, puesta en otro punto
  ['Cerro El Boyenar', 2278], // copia de Cerro Boyen, a 98 m
];

// Colecciones: listas cortas que dan un objetivo sin convertir el juego en una lista de tareas.
export const COLECCIONES = [
  { id: 'ciudad', n: 'Cerros de Santiago', d: 'Los cerros isla y la precordillera que se suben después de la pega.', c: ['Cerro Santa Lucía', 'Cerro San Cristóbal', 'Cerro El Carbón', 'Cerro Renca', 'Cerro Chena', 'Cerro Manquehuito', 'Cerro Manquehue', 'Cerro Pochoco'] },
  { id: 'ramon', n: 'Sierra de Ramón', d: 'El muro que se ve desde todo Santiago, de punta a punta.', c: ['Alto del Naranjo', 'Cerro Provincia', 'Cerro La Cruz', 'Cerro de Ramón', 'Punta de Damas', 'Cerro Minillas'] },
  { id: 'farellones', n: 'Primeros cuatromiles', d: 'Las cumbres de Farellones donde casi todos aprenden la altura.', c: ['Cerro Colorado', 'Cerro Franciscano', 'Cerro La Parva', 'Cerro Pintor', 'Cerro Cepo', 'Cerro Bismarck'] },
  { id: 'plomo', n: 'Grupo Plomo', d: 'Los glaciares que alimentan el Mapocho y su señor, El Plomo.', c: ['Cerro Leonera', 'Cerro La Paloma', 'Cerro Altar', 'Cerro Littoria', 'Cerro El Plomo'] },
  { id: 'morado', n: 'El Morado y Lo Valdés', d: 'El valle glaciar de manual y los cerros de fósiles marinos.', c: ['Mirador del Morado', 'Cerro El Morado', 'Cerro San Francisco', 'Cerro Unión', 'Cerro Arenas', 'Punta Zanzi', 'Cerro Retumbadero', 'Cerro Diablo'] },
  { id: 'yeso', n: 'Murallas del Yeso', d: 'Los cincomiles que encierran la reserva de agua de Santiago.', c: ['Cerro Mesón Alto', 'Cerro Loma Larga', 'Cerro Cortaderas'] },
  { id: 'volcanes', n: 'Volcanes del Maipo', d: 'Los volcanes de la frontera, dos de ellos todavía vivos.', c: ['Volcán Tupungatito', 'Volcán Tupungato', 'Volcán San José', 'Volcán Maipo'] },
  { id: 'seismiles', n: 'Seismiles', d: 'Las montañas sobre 6.000 m del área. Solo el cóndor llega sin sufrir.', c: ['Cerro Marmolejo', 'Volcán Tupungato', 'Cerro Alto San Juan', 'Nevado del Plomo', 'Nevado de los Piuquenes'] },
];

// Aplica las correcciones sobre labels.items (ya convertidos a metros). Devuelve { renombres: Map(viejo → nuevo) }
// para migrar el progreso guardado con nombres de OSM.
export function corregirCumbres(labels, manifest) {
  const xz = (lat, lon) => [(lon - manifest.core.west) * manifest.mPerDegLon, (manifest.core.north - lat) * manifest.mPerDegLat];
  const esCumbre = (it) => !it.far && (it.kind === 'cerro' || it.kind === 'volcan');
  labels.items = labels.items.filter((it) => !(esCumbre(it) && SOBRAN.some(([n, e]) => n === it.name && e === it.ele)));
  const renombres = new Map(), usados = new Set();
  for (const [name, ele, lat, lon, rank, dato, osm] of CUMBRES) {
    const [x, z] = xz(lat, lon), buscado = osm === undefined ? name : osm;
    let it = null, bd = 2500;
    if (buscado) for (const o of labels.items) {
      if (!esCumbre(o) || o.name !== buscado || usados.has(o)) continue;
      const d = Math.hypot(o.x - x, o.z - z); if (d < bd) { bd = d; it = o; }
    }
    if (!it) { it = { kind: name.startsWith('Volcán') ? 'volcan' : 'cerro', group: 'cumbres' }; labels.items.push(it); }
    else if (it.name !== name) renombres.set(it.name, name);
    usados.add(it);
    Object.assign(it, { name, ele, x, z, rank: Math.min(it.rank ?? 9, rank), dato, verificada: true, y: undefined });
  }
  return { renombres };
}
