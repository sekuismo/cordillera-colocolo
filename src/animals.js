// Los tres animales jugables. Cada uno recorre la cordillera de otra manera: el colocolo es chico y ágil,
// el puma es pura potencia y el cóndor vuela. Las cifras de movimiento las lee player.js; los textos, la interfaz.
//   speeds: m/s de cada marcha en tierra (Paseo, Trote, Carrera, Turbo, Híper). Turbo e Híper son marchas de viaje,
//           iguales para todos: nadie corre a 650 km/h, sirven para cruzar un mundo a escala real.
//   air:    lo mismo, pero volando (solo el cóndor).
//   jump:   velocidad vertical del salto (m/s). airJumps: saltos extra en el aire.
//   ability: habilidad especial (tecla Q). cd: segundos de recarga; dur: cuánto dura el efecto.
export const ANIMALS = {
  colocolo: {
    id: 'colocolo', n: 'Gato colocolo', corto: 'Colocolo', sci: 'Leopardus colocola', lema: 'Chico, ágil y de buen olfato',
    stats: ['Doble salto en el aire', 'Liviano: gira y frena en seco', 'Olfato: te marca el próximo lugar por descubrir'],
    d: 'Un felino silvestre nativo, apenas más grande que un gato doméstico (3 a 4 kg). Lo reconoces por las bandas café rojizas de sus flancos, los anillos oscuros de las patas y la cola gruesa. Vive desde el matorral del valle hasta sobre los 4.000 m, y está amenazado por la pérdida de hábitat, los perros y los atropellos. Con él puedes saltar dos veces en el aire y usar el olfato (Q) para encontrar lugares.',
    scale: 1.5, speeds: [2.5, 7, 20, 60, 180], jump: 8.6, airJumps: 1, camDist: 5.5,
    ability: { n: 'Olfato', d: 'Una columna de luz marca el próximo lugar sin descubrir', cd: 14, dur: 12 },
  },
  puma: {
    id: 'puma', n: 'Puma', corto: 'Puma', sci: 'Puma concolor', lema: 'El gran cazador de los Andes',
    stats: ['Salta el doble de alto y de largo', 'Carrera más veloz: casi 100 km/h', 'Embestida: un pique explosivo por unos segundos'],
    d: 'El felino más grande de Chile y el mayor depredador de la cordillera: un macho adulto pasa de los 60 kg. Es solitario y recorre territorios enormes, de noche y al amanecer, siguiendo a guanacos, vizcachas y liebres. De un salto puede subir más de cinco metros. Con él saltas mucho más lejos, corres más rápido y tienes la embestida (Q) para un pique corto.',
    scale: 2.9, speeds: [3, 9, 27, 60, 180], jump: 12.8, airJumps: 0, camDist: 9,
    ability: { n: 'Embestida', d: 'Pique explosivo durante cinco segundos', cd: 14, dur: 5 },
  },
  condor: {
    id: 'condor', n: 'Cóndor andino', corto: 'Cóndor', sci: 'Vultur gryphus', lema: 'El dueño del cielo',
    stats: ['Vuela: mantén Saltar para aletear y subir', 'Planea sin gastar nada; baja con C', 'Térmica: una corriente te eleva cientos de metros'],
    d: 'El ave voladora más grande del mundo: más de tres metros de punta a punta de las alas y hasta 15 kg. Casi no aletea; sube en las corrientes de aire caliente y en el viento que remonta las laderas, y así recorre cientos de kilómetros en un día buscando carroña. Está en el escudo de Chile y su población es vulnerable. Con él despegas con Saltar, subes manteniéndolo apretado, bajas con C y usas la térmica (Q) para ganar altura.',
    scale: 1.3, speeds: [1.4, 3, 5.5, 60, 180], air: [11, 18, 30, 70, 180], jump: 6.5, airJumps: 0, camDist: 11, fly: true,
    ability: { n: 'Térmica', d: 'Una corriente ascendente te sube durante cinco segundos', cd: 16, dur: 5 },
  },
};
export const ANIMAL_IDS = ['colocolo', 'puma', 'condor'];
