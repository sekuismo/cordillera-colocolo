// Contenido educativo: lugares con una explicación corta que aparece al acercarse.
// r = radio de activación en metros. Coordenadas verificadas contra OSM con tools/check_lugares.mjs.
export const LUGARES = [
  // ---- Santiago y su cuenca
  { id: 'santiago', n: 'Santiago de Chile', t: 'Ciudad', lat: -33.4378, lon: -70.6505, r: 3500,
    d: 'Fundada en 1541 a orillas del río Mapocho. La ciudad ocupa una cuenca a unos 520 m de altitud, encerrada entre la cordillera de la Costa y los Andes. Esa forma de olla es la que atrapa el esmog en invierno: el aire frío queda abajo y una capa de aire más tibio le pone tapa (inversión térmica).' },
  { id: 'sancristobal', n: 'Cerro San Cristóbal', t: 'Cerro isla', lat: -33.4203, lon: -70.6298, r: 1300,
    d: 'Con unos 880 m s. n. m. se levanta casi 300 m sobre la ciudad. Es un "cerro isla": un resto de la cordillera que quedó rodeado por los sedimentos que rellenaron el valle. Hoy es parte del Parque Metropolitano, uno de los parques urbanos más grandes del mundo.' },
  { id: 'manquehue', n: 'Cerro Manquehue', t: 'Cumbre', lat: -33.3508, lon: -70.5822, r: 1600,
    d: 'Con 1.635 m es el cerro más alto del valle de Santiago. Su nombre viene del mapudungun y significa "lugar de cóndores". Su silueta cónica delata su origen: son restos de un volcán extinto hace millones de años.' },
  { id: 'puentealto', n: 'Puente Alto', t: 'Ciudad', lat: -33.6100, lon: -70.5750, r: 2200,
    d: 'La comuna más poblada de Chile. Nació junto al río Maipo y fue la estación de partida del Ferrocarril Militar que subía por el Cajón del Maipo hasta El Volcán, y que funcionó hasta 1985.' },
  { id: 'pirque', n: 'Pirque', t: 'Valle agrícola', lat: -33.6355, lon: -70.5730, r: 2200,
    d: 'Al sur del río Maipo, Pirque conserva su carácter rural: parcelas, viñas y canales de riego que sacan agua del Maipo desde tiempos coloniales. El valle del Maipo es una de las zonas vitivinícolas más conocidas del país.' },

  { id: 'costanera', n: 'Gran Torre Costanera', t: 'Hito urbano', lat: -33.4170, lon: -70.6065, r: 650,
    d: 'Con 300 m es el edificio más alto de Sudamérica, y por lejos lo más alto del valle: desde cualquier cerro sirve para ubicar Providencia. A su alrededor está el barrio financiero que los santiaguinos apodaron "Sanhattan". Aun así, la torre completa cabría más de diez veces bajo la cumbre del cerro de Ramón.' },
  { id: 'moneda', n: 'Palacio de La Moneda', t: 'Hito urbano', lat: -33.4430, lon: -70.6537, r: 500,
    d: 'La sede del gobierno nació como casa de moneda colonial: la diseñó el arquitecto Joaquín Toesca y se terminó en 1805. Es baja y maciza a propósito, pensada para resistir terremotos. Fue bombardeada durante el golpe de Estado del 11 de septiembre de 1973.' },
  { id: 'estadio', n: 'Estadio Nacional', t: 'Hito urbano', lat: -33.4645, lon: -70.6106, r: 600,
    d: 'Inaugurado en 1938, aquí se jugó la final del Mundial de 1962. Tras el golpe de 1973 funcionó como centro de detención y hoy una parte de sus graderías se conserva como sitio de memoria. Desde la precordillera se reconoce por su anillo ovalado en medio de Ñuñoa.' },
  { id: 'bahai', n: 'Templo Bahá’í', t: 'Hito urbano', lat: -33.4720, lon: -70.5090, r: 600,
    d: 'Inaugurado en 2016 en plena precordillera de Peñalolén, es el templo bahá’í de Sudamérica. Sus nueve "velas" de mármol y vidrio dejan pasar la luz y se encienden al atardecer. Está casi encima de la traza de la falla San Ramón.' },

  // ---- Sierra de Ramón
  { id: 'sierraramon', n: 'Sierra de Ramón', t: 'Cordón montañoso', lat: -33.4510, lon: -70.4800, r: 2400,
    d: 'El muro que ves desde todo Santiago. Este cordón de unos 25 km separa la ciudad de la alta cordillera, entre los ríos Mapocho y Maipo, y sube más de 2.500 m desde las calles hasta la cumbre del cerro de Ramón (3.253 m) en apenas 10 km.' },
  { id: 'fallaramon', n: 'Falla San Ramón', t: 'Geología', lat: -33.4600, lon: -70.5200, r: 1000,
    d: 'Justo aquí, donde la ciudad se topa con el cerro, corre la falla San Ramón: una falla activa de unos 30 km que pasa bajo comunas como Las Condes, La Reina, Peñalolén y La Florida. Es la que ha ido levantando la sierra, y podría producir sismos superficiales de magnitud cercana a 7.' },
  { id: 'provincia', n: 'Cerro Provincia', t: 'Cumbre', lat: -33.4265, lon: -70.4349, r: 1300,
    d: 'Con 2.750 m es una de las cumbres más subidas de Santiago: son casi 1.900 m de desnivel desde el Puente Ñilhue. En la cima hay un refugio, y desde aquí la ciudad se ve entera a tus pies.' },
  { id: 'ramon', n: 'Cerro de Ramón', t: 'Cumbre', lat: -33.4858, lon: -70.4388, r: 1300,
    d: 'Estás en el techo de la Sierra de Ramón: 3.253 m. Al poniente, toda la cuenca de Santiago unos 2.700 m más abajo; al oriente aparecen los gigantes: El Plomo, el Tupungato y el volcán San José.' },
  { id: 'macul', n: 'Quebrada de Macul', t: 'Riesgo natural', lat: -33.5020, lon: -70.5050, r: 1300,
    d: 'El 3 de mayo de 1993 una lluvia cálida cayó como agua, y no como nieve, sobre la sierra. Las quebradas de Macul y San Ramón bajaron convertidas en aluviones de barro y rocas que arrasaron barrios enteros y dejaron decenas de víctimas. Por eso hoy hay piscinas decantadoras en la salida de la quebrada.' },

  // ---- Mapocho, Farellones y El Plomo
  { id: 'mapocho', n: 'Nacimiento del río Mapocho', t: 'Río', lat: -33.3720, lon: -70.3930, r: 1600,
    d: 'El Mapocho nace de la unión de los ríos San Francisco y Molina, que bajan desde los glaciares del Plomo y La Paloma. Después cruza todo Santiago de oriente a poniente y termina entregando sus aguas al Maipo.' },
  { id: 'farellones', n: 'Farellones', t: 'Pueblo de montaña', lat: -33.3530, lon: -70.3130, r: 1500,
    d: 'Pueblo de montaña a unos 2.400 m, al que se llega por el camino G-21 y sus 40 curvas numeradas. Es la puerta a los centros de esquí El Colorado, La Parva y Valle Nevado, y aquí partió el esquí chileno en la década de 1930.' },
  { id: 'vallenevado', n: 'Valle Nevado', t: 'Centro de esquí', lat: -33.3543, lon: -70.2492, r: 1500,
    d: 'Centro de esquí inaugurado en 1988, con base a unos 3.000 m. Estás en el "piso andino": casi sin árboles, con arbustos bajos y achaparrados que pasan el invierno bajo la nieve.' },
  { id: 'yerbaloca', n: 'Santuario Yerba Loca', t: 'Área protegida', lat: -33.3350, lon: -70.3300, r: 1800,
    d: 'Santuario de la naturaleza que protege un valle de origen glaciar: fíjate en su forma de U. Al fondo cuelgan los glaciares La Paloma y El Altar. El estero baja con aguas ácidas y cargadas de minerales, por eso casi no tiene peces.' },
  { id: 'plomo', n: 'Cerro El Plomo', t: 'Cumbre', lat: -33.2364, lon: -70.2125, r: 2200,
    d: 'Con 5.424 m es la cumbre que domina Santiago. Para los incas fue un santuario de altura: en 1954 se encontró cerca de la cima el cuerpo congelado de un niño ofrendado hace más de 500 años, hoy resguardado en el Museo Nacional de Historia Natural.' },
  { id: 'bronces', n: 'Mina Los Bronces', t: 'Minería', lat: -33.1480, lon: -70.2850, r: 2500,
    d: 'Mina de cobre a rajo abierto a unos 3.500 m de altitud, explotada desde el siglo XIX. El mineral viaja molido y mezclado con agua por una tubería de más de 50 km hasta la planta de Las Tórtolas, al norte de Santiago. Su cercanía con glaciares la mantiene en el centro del debate ambiental.' },
  { id: 'glaciares', n: 'Parque Nacional Glaciares de Santiago', t: 'Área protegida', lat: -33.3236, lon: -70.0062, r: 5000,
    d: 'Creado en 2023, protege unas 75.000 hectáreas de alta montaña en las cabeceras de los ríos Olivares y Colorado, con cientos de glaciares. Estos hielos son la reserva de agua de Santiago en los años secos: durante la megasequía han sido los que sostienen el caudal de los ríos en verano.' },

  // ---- Cajón del Maipo
  { id: 'cajon', n: 'Entrada al Cajón del Maipo', t: 'Valle', lat: -33.5930, lon: -70.4900, r: 2000,
    d: 'Aquí el río Maipo sale de la cordillera. Hacia arriba se abre el Cajón del Maipo: el valle del Maipo y sus afluentes —Colorado, Yeso y Volcán—, un corte de más de 70 km que llega hasta volcanes de casi 6.000 m en la frontera con Argentina.' },
  { id: 'riomaipo', n: 'Río Maipo', t: 'Río', lat: -33.5870, lon: -70.4100, r: 1500,
    d: 'Nace en las faldas del volcán Maipo y recorre unos 250 km hasta el Pacífico. Es el río más importante de la zona central: entrega cerca del 70 % del agua potable de Santiago y riega buena parte del valle. Su color café en verano es sedimento molido por los glaciares.' },
  { id: 'colorado', n: 'Río Colorado', t: 'Río', lat: -33.5860, lon: -70.3690, r: 1400,
    d: 'El principal afluente del Maipo viene desde los hielos del Tupungato. Su valle guarda las centrales hidroeléctricas Maitenes y Alfalfal, que funcionan "de pasada": desvían agua por túneles y la devuelven al río más abajo.' },
  { id: 'sanjose', n: 'San José de Maipo', t: 'Pueblo', lat: -33.6410, lon: -70.3520, r: 1500,
    d: 'Fundada en 1792 tras el hallazgo de minas de plata en la zona. Es la capital de una comuna enorme: cubre casi un tercio de la Región Metropolitana, pero en ella vive menos del 1 % de su población.' },
  { id: 'lagunillas', n: 'Lagunillas', t: 'Centro de esquí', lat: -33.6090, lon: -70.2900, r: 1500,
    d: 'Un centro de esquí pequeño, manejado por un club andino, sobre San José de Maipo. A unos 2.200 m ya quedaron atrás los quillayes y litres: mandan los arbustos bajos y los coirones.' },
  { id: 'sanalfonso', n: 'San Alfonso', t: 'Pueblo', lat: -33.7300, lon: -70.3050, r: 1400,
    d: 'Pueblo junto al Maipo, conocido por la Cascada de las Ánimas, un santuario de la naturaleza privado. En estas laderas sobrevive el bosque esclerófilo: quillay, litre, peumo y, en las quebradas húmedas, el escaso ciprés de la cordillera.' },
  { id: 'sangabriel', n: 'San Gabriel', t: 'Pueblo', lat: -33.7830, lon: -70.2400, r: 1500,
    d: 'A 1.250 m, aquí el valle se abre en tres: en los alrededores se juntan con el Maipo los ríos Yeso y Volcán. Hacia el nororiente se sube al embalse El Yeso; hacia el oriente, a Baños Morales y al volcán San José.' },
  { id: 'melosas', n: 'Las Melosas', t: 'Sismología', lat: -33.8470, lon: -70.2030, r: 1600,
    d: 'El 4 de septiembre de 1958 tres sismos seguidos sacudieron este valle. No fueron terremotos "de subducción" como los de la costa, sino superficiales, generados por fallas dentro de la propia cordillera: la prueba de que los Andes siguen levantándose y acomodándose.' },
  { id: 'elvolcan', n: 'El Volcán', t: 'Historia minera', lat: -33.8154, lon: -70.1688, r: 1400,
    d: 'Antiguo pueblo minero del cobre y estación terminal del Ferrocarril Militar que subía desde Puente Alto. El tren llevaba mineral, yeso y veraneantes; dejó de funcionar en 1985 y hoy quedan sus puentes y túneles a lo largo del valle.' },
  { id: 'banosmorales', n: 'Baños Morales', t: 'Termas', lat: -33.8240, lon: -70.0620, r: 1300,
    d: 'Villorrio de montaña a unos 1.850 m con pozas termales: el agua se calienta en profundidad por el mismo calor que alimenta al volcán San José. Es la entrada al Monumento Natural El Morado.' },
  { id: 'morado', n: 'Monumento Natural El Morado', t: 'Área protegida', lat: -33.7818, lon: -70.0738, r: 2200,
    d: 'Un valle glaciar de manual: paredes verticales, fondo plano y, al final, el glaciar San Francisco colgando del cerro El Morado (4.647 m). La laguna que encuentras al pie se formó con el retroceso del hielo, que ha perdido cientos de metros en pocas décadas.' },
  { id: 'lovaldes', n: 'Lo Valdés', t: 'Geología', lat: -33.8364, lon: -70.0512, r: 1100,
    d: 'En estas rocas hay amonites y otros fósiles marinos de hasta unos 150 millones de años. Lo que hoy está a 2.000 m de altitud fue el fondo de un mar: la mejor evidencia de cuánto ha subido la cordillera. El refugio alemán del lugar recibe montañistas desde la década de 1930.' },
  { id: 'colina', n: 'Termas Valle de Colina', t: 'Termas', lat: -33.8510, lon: -69.9870, r: 1500,
    d: 'Pozas termales escalonadas a unos 2.500 m, de aguas turquesa cargadas de minerales. Estás en el piso altoandino: cojines de llareta, vegas (humedales de altura) y poco más. Unos kilómetros al oriente está la frontera.' },
  { id: 'sanjosevolcan', n: 'Volcán San José', t: 'Volcán', lat: -33.7870, lon: -69.8970, r: 3000,
    d: 'Un macizo volcánico de 5.856 m justo sobre la frontera, con varios cráteres y fumarolas activas. Junto a su vecino Marmolejo forma una de las murallas más altas del Cajón del Maipo. Chile tiene cerca de 90 volcanes activos; este es de los más cercanos a Santiago.' },
  { id: 'marmolejo', n: 'Cerro Marmolejo', t: 'Cumbre', lat: -33.7340, lon: -69.8780, r: 2500,
    d: 'Con 6.108 m, el Marmolejo es el "seismil" más austral del mundo: desde aquí hacia el sur, ninguna montaña del planeta vuelve a superar los 6.000 m. Sus glaciares alimentan el río Yeso por el lado chileno.' },
  { id: 'yeso', n: 'Embalse El Yeso', t: 'Agua', lat: -33.6760, lon: -70.0890, r: 2800,
    d: 'A unos 2.500 m, este embalse construido entre 1953 y 1967, con un muro de tierra de 62 m, guarda unos 250 millones de m³ de agua de deshielo. Es la principal reserva de agua potable de Santiago: lo que ves aquí es lo que asegura el suministro de la ciudad en los años secos.' },
  { id: 'lagunanegra', n: 'Laguna Negra', t: 'Agua', lat: -33.6355, lon: -70.1246, r: 2200,
    d: 'A diferencia del embalse vecino, esta laguna es natural: una cuenca excavada por glaciares y cerrada por sus propios escombros. Con casi 300 m de profundidad es otra reserva estratégica de agua para Santiago.' },
  { id: 'echaurren', n: 'Glaciar Echaurren Norte', t: 'Glaciar', lat: -33.5920, lon: -70.1463, r: 2000,
    d: 'Pequeño pero famoso: es el glaciar con el registro de mediciones más largo del hemisferio sur. Desde 1975 se mide cada año cuánta nieve gana y cuánto hielo pierde, y la tendencia es clara: se está achicando.' },
  { id: 'termasplomo', n: 'Termas del Plomo', t: 'Termas', lat: -33.6180, lon: -69.9100, r: 2000,
    d: 'Al fondo del valle del Yeso, sobre los 3.000 m, brotan estas aguas termales rodeadas de glaciares. Por este mismo valle subían los arrieros con ganado rumbo al paso de Piuquenes.' },
  { id: 'piuquenes', n: 'Paso Piuquenes', t: 'Paso fronterizo', lat: -33.6333, lon: -69.8747, r: 2200,
    d: 'A más de 4.000 m, este paso fue ruta de arrieros entre Santiago y Mendoza. En enero de 1817 lo cruzó una de las columnas del Ejército de los Andes, unos 55 hombres al mando de José León Lemos, que bajaron por el valle del Yeso; la guardia realista de San Gabriel huyó sin pelear. En marzo de 1835 lo cruzó Charles Darwin, que aquí encontró conchas fósiles y anotó una idea audaz para su época: la cordillera se había levantado desde el mar.' },
  { id: 'tupungato', n: 'Volcán Tupungato', t: 'Volcán', lat: -33.3580, lon: -69.7700, r: 4000,
    d: 'Con 6.570 m es la cumbre más alta de la Región Metropolitana y una de las más altas de América. Es un volcán apagado; el que sigue activo es su vecino, el Tupungatito. En 1947 un avión británico, el Star Dust, se estrelló en sus glaciares y recién reapareció en el hielo más de 50 años después.' },
  { id: 'tupungatito', n: 'Volcán Tupungatito', t: 'Volcán', lat: -33.3887, lon: -69.8263, r: 2500,
    d: 'El volcán activo más cercano a Santiago, a unos 75 km. En su cráter, sobre los 5.000 m, hay fumarolas y una laguna ácida de color turquesa. Marca el inicio de la Zona Volcánica Sur de los Andes: hacia el norte hay más de 500 km de cordillera sin volcanes activos.' },
  { id: 'maipo', n: 'Volcán Maipo', t: 'Volcán', lat: -34.1655, lon: -69.8239, r: 3500,
    d: 'Un cono casi perfecto de 5.264 m que le da nombre al río y al valle. Creció dentro de la caldera Diamante, el hueco de unos 15 por 20 km que dejó una erupción colosal hace cientos de miles de años: su ceniza y pómez cubrieron la zona de Santiago y Rancagua.' },
  { id: 'diamante', n: 'Laguna del Diamante', t: 'Agua', lat: -34.1700, lon: -69.6900, r: 3500,
    d: 'Estás en Argentina, provincia de Mendoza, a unos 3.300 m. La laguna ocupa el fondo de la caldera Diamante y refleja el cono del volcán Maipo. Es reserva natural: aquí viven guanacos, zorros y flamencos.' },

  // ---- Sur del área
  { id: 'clarillo', n: 'Parque Nacional Río Clarillo', t: 'Área protegida', lat: -33.7200, lon: -70.4800, r: 2500,
    d: 'El primer parque nacional de la Región Metropolitana protege uno de los bosques esclerófilos mejor conservados de la zona central: peumos, litres, quillayes y cipreses de la cordillera. Es hábitat de zorros, pumas, güiñas y de tu especie: el gato colocolo.' },
  { id: 'sewell', n: 'Sewell y El Teniente', t: 'Minería', lat: -34.0844, lon: -70.3806, r: 3000,
    d: 'Sewell, "la ciudad de las escaleras", fue un campamento minero construido en plena ladera a más de 2.000 m, sin calles para autos. Es Patrimonio de la Humanidad desde 2006. Bajo el cerro está El Teniente, la mina subterránea de cobre más grande del mundo, con miles de kilómetros de túneles.' },
  { id: 'rancagua', n: 'Rancagua', t: 'Ciudad', lat: -34.1700, lon: -70.7400, r: 3000,
    d: 'Capital de la Región de O\'Higgins, a orillas del río Cachapoal. Aquí ocurrió en 1814 el Desastre de Rancagua, la derrota que cerró la Patria Vieja y obligó a los patriotas a cruzar la cordillera hacia Mendoza.' },
];

// Pisos de vegetación: se anuncian la primera vez que se entra a cada franja de altitud.
export const PISOS = [
  { min: 0, max: 1000, n: 'Valle y piedemonte', d: 'Bajo los 1.000 m domina el espinal y el matorral: espinos, litres y quillayes adaptados a veranos largos y secos. Es clima mediterráneo, uno de los cinco lugares del mundo que lo tienen, y por eso está lleno de especies que no existen en ningún otro lugar.' },
  { min: 1000, max: 2000, n: 'Bosque y matorral esclerófilo', d: 'Entre 1.000 y 2.000 m: árboles de hoja dura que no pierden el agua, como quillay, litre y peumo. En las laderas que miran al norte, más soleadas y secas, aparecen quiscos y chaguales; en las que miran al sur, bosque más denso.' },
  { min: 2000, max: 3200, n: 'Piso andino', d: 'Sobre los 2.000 m los árboles desaparecen. Quedan arbustos bajos y espinosos, coirones y, en primavera, flores que crecen pegadas al suelo. Aquí viven la vizcacha, el zorro culpeo y, planeando arriba tuyo, el cóndor.' },
  { min: 3200, max: 4200, n: 'Piso altoandino', d: 'Entre 3.200 y 4.200 m solo sobreviven plantas en cojín, como la llareta, que crece apenas milímetros al año. Las vegas —humedales de altura— son el oasis de este piso y el lugar donde pastan los guanacos.' },
  { min: 4200, max: 9000, n: 'Alta montaña', d: 'Sobre los 4.200 m ya casi no hay vida: roca, nieve y hielo. Aquí tienes cerca de la mitad del oxígeno que a nivel del mar. En verano la nieve forma penitentes: filas de cuchillas de hielo talladas por el sol.' },
];

export const INTRO = {
  n: 'Eres un gato colocolo', t: 'Leopardus colocola',
  d: 'Un felino silvestre nativo, apenas más grande que un gato doméstico (3 a 4 kg). Lo reconoces por las bandas café rojizas de sus flancos, los anillos oscuros de las patas y la cola gruesa. Vive desde el matorral del valle hasta sobre los 4.000 m, y está amenazado por la pérdida de hábitat, los perros y los atropellos. Parte por subir la Sierra de Ramón.',
};

// Estaciones: una ficha la primera vez que llega cada una, más la de la primera tormenta.
export const ESTACIONES = [
  { n: 'Verano seco', d: 'De diciembre a marzo casi no llueve en la zona central: es clima mediterráneo. La nieve se refugia sobre los 4.000 m y los cerros bajos se ponen amarillos. Los ríos, en cambio, llevan su mayor caudal: viven del deshielo, no de la lluvia.' },
  { n: 'Otoño: llegan los frentes', d: 'Desde abril empiezan a entrar frentes de mal tiempo desde el Pacífico. Cada uno deja nieve nueva en la cordillera, y qué tan abajo cae depende de la isoterma cero: la altitud a la que el aire está a 0 °C.' },
  { n: 'Invierno: la cordillera blanca', d: 'En un invierno normal la nieve cubre la cordillera sobre los 2.000 a 2.500 m. Fíjate en las laderas: las que miran al sur reciben menos sol y guardan la nieve varios cientos de metros más abajo. Con una tormenta muy fría puede nevar en la precordillera y, rara vez, en Santiago mismo.' },
  { n: 'Primavera: el deshielo', d: 'El manto de nieve empieza a derretirse y a alimentar ríos y embalses hasta bien entrado el verano: es la reserva de agua de Santiago. La precordillera está en su momento más verde. Desde 2010, la megasequía ha dejado inviernos con bastante menos nieve que el promedio histórico.' },
];
export const TORMENTA = {
  n: 'Isoterma cero', t: 'Tormenta',
  d: 'Sobre la isoterma cero la precipitación cae como nieve; más abajo, como lluvia. Si el frente llega tibio y la isoterma sube sobre los 3.000 m, llueve donde normalmente nieva: el agua escurre de golpe en vez de quedar guardada como nieve, y bajan los aluviones.',
};
