// Claves de servicios externos. Van a la vista en un sitio estático, así que tienen que ser claves PÚBLICAS:
// solo con los permisos mínimos y restringidas por dominio en el panel del proveedor.
//
// ESRI_KEY: clave de API de ArcGIS Location Platform (cuenta sekuismo_cordillera, credencial "cordillera-web").
// Solo tiene el privilegio de mapas base y solo responde a https://sekuismo.github.io y http://localhost:8123.
// Caduca el 21-02-2027: hay que generar otra en el panel antes de esa fecha. Si se deja vacía, el juego usa la
// imagen Sentinel-2 que va dentro del repo, igual que antes.
export const ESRI_KEY = 'AAPTacwjqifeeU-Wm5RFQzYoECg..SGQcxoVJuMIVfuAXhaga9hX5YHpJrynRyxKZlpxREtJEphHUU4YF_TXzN0FUaFIY9rr7-hykG5AilIGqJlbPS3hVZUgQ94ETlbedYk3mo04vqVab_10G8eZe5vh-M82i8-PTakmjMFIdoUZIlJg1EsZN_ob-kL524earKWOrgQBfLTvHGFS3LR5VotHl4r0JRtcwUmlQs3tcroR9rtr3Pq4LOC9NT1ku44Lnt_5R2gegycWLJR2mv_GrPMP5gTYmf7skFg..AT1_nABzw4HX';
