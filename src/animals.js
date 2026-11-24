// Los tres animales jugables. Cada uno recorre la cordillera de otra manera: el colocolo es chico y ágil,
// el puma es pura potencia y el cóndor vuela. Las cifras de movimiento las lee player.js; los textos, la interfaz.
//   scale:  tamaño del modelo. Los tres van a TAMAÑO REAL y proporcionados entre sí (el mundo también es 1:1):
//           colocolo ~33 cm a la cruz y 60 cm de cuerpo; puma ~70 cm a la cruz y 1,25 m de cuerpo; cóndor 3,2 m de envergadura.
//   speeds: m/s de cada marcha en tierra (Paseo, Trote, Carrera, Turbo, Híper). Hasta Carrera son velocidades creíbles
//           para el animal; Turbo e Híper son marchas de viaje, iguales para todos: nadie corre a 650 km/h, sirven
//           para cruzar un mundo a escala real.
//   air:    lo mismo, pero volando (solo el cóndor).
//   jump:   velocidad vertical del salto (m/s). airJumps: saltos extra en el aire.
//   climb:  pendiente (tangente) que ya no puede subir de frente; desde poco más de la mitad empieza a costarle.
//   slip:   pendiente (tangente) desde la que resbala ladera abajo aunque no quiera.
//   hard:   velocidad de impacto (m/s, contra el suelo) desde la que el aterrizaje sale mal y el animal rueda.
//   lethal: velocidad de impacto (m/s) desde la que la caída es fatal (unos 20 m de caída libre): la cordillera no perdona.
//   stam:   aguante. run: gasto por segundo a la carrera; climb: gasto por metro subido; rec: lo que recupera por segundo
//           quieto; flap/glide (cóndor): gasto aleteando y recuperación planeando. En altura todo cuesta más.
//   crash:  velocidad (m/s) contra un árbol, una roca o una casa desde la que el choque lo bota.
//   ability: habilidad especial (tecla Q). cd: segundos de recarga; dur: cuánto dura el efecto.
export const ANIMALS = {
  colocolo: {
    id: 'colocolo', n: 'Gato colocolo', corto: 'Colocolo', sci: 'Leopardus colocola', lema: 'Chico, ágil y de buen olfato',
    stats: ['Doble salto en el aire', 'Trepa laderas que el puma no puede', 'Olfato: te marca el próximo lugar por descubrir'],
    d: 'Un felino silvestre nativo, apenas más grande que un gato doméstico (3 a 4 kg). Lo reconoces por las bandas café rojizas de sus flancos, los anillos oscuros de las patas y la cola gruesa. Vive desde el matorral del valle hasta sobre los 4.000 m, y está amenazado por la pérdida de hábitat, los perros y los atropellos. Con él puedes saltar dos veces en el aire, trepar laderas muy empinadas y usar el olfato (Q) para encontrar lugares.',
    scale: 1.0, speeds: [1.6, 5, 14, 60, 180], jump: 8.6, airJumps: 1, camDist: 2.1,
    climb: 1.19, slip: 1.33, hard: 19, crash: 8, lethal: 30, stam: { run: 0.02, climb: 1 / 130, rec: 0.065 },
    ability: { n: 'Olfato', d: 'Una columna de luz marca el próximo lugar sin descubrir', cd: 14, dur: 12 },
  },
  puma: {
    id: 'puma', n: 'Puma', corto: 'Puma', sci: 'Puma concolor', lema: 'El gran cazador de los Andes',
    stats: ['Salta el doble de alto y de largo', 'Carrera más veloz: 80 km/h', 'Embestida: un pique explosivo por unos segundos'],
    d: 'El felino más grande de Chile y el mayor depredador de la cordillera: un macho adulto pasa de los 60 kg. Es solitario y recorre territorios enormes, de noche y al amanecer, siguiendo a guanacos, vizcachas y liebres. De un salto puede subir más de cinco metros. Con él saltas mucho más lejos, corres más rápido y tienes la embestida (Q) para un pique corto.',
    scale: 1.9, speeds: [2.2, 7, 22, 60, 180], jump: 12.8, airJumps: 0, camDist: 3.9,
    climb: 1.07, slip: 1.23, hard: 21, crash: 11, lethal: 32, stam: { run: 0.034, climb: 1 / 150, rec: 0.055 },
    ability: { n: 'Embestida', d: 'Pique explosivo durante cinco segundos', cd: 14, dur: 5 },
  },
  condor: {
    id: 'condor', n: 'Cóndor andino', corto: 'Cóndor', sci: 'Vultur gryphus', lema: 'El dueño del cielo',
    stats: ['Vuela: aletear cansa, planear descansa', 'Sube gratis con el viento de las laderas; baja con C', 'Térmica: una corriente te eleva cientos de metros'],
    d: 'El ave voladora más grande del mundo: más de tres metros de punta a punta de las alas y hasta 15 kg. Casi no aletea; sube en las corrientes de aire caliente y en el viento que remonta las laderas, y así recorre cientos de kilómetros en un día buscando carroña. Está en el escudo de Chile y su población es vulnerable. Con él despegas con Saltar, subes manteniéndolo apretado, bajas con C y usas la térmica (Q) para ganar altura.',
    scale: 1.0, speeds: [1.2, 2.6, 5, 60, 180], air: [11, 18, 30, 44, 58], jump: 6.5, airJumps: 0, camDist: 5.6, fly: true,
    climb: 0.78, slip: 1.0, hard: 14, crash: 7, lethal: 25, stam: { run: 0.03, climb: 1 / 70, rec: 0.06, flap: 0.05, glide: 0.035 },
    ability: { n: 'Térmica', d: 'Una corriente ascendente te sube durante cinco segundos', cd: 16, dur: 5 },
  },
};
export const ANIMAL_IDS = ['colocolo', 'puma', 'condor'];
