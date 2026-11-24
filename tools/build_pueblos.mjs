// Relevamientos de pueblos (tools/relevamientos/*.txt) → src/pueblos_data.js.
// Cada relevamiento es un texto escrito mirando la calle de verdad, edificio por edificio, con una línea por edificio:
//   lat, lon | calle y lado | qué es | cartel | pisos | color_muro #hex | material | techo | cierre | fachada | detalles | [V]/[I]
// De cada línea se saca lo que el juego sabe dibujar: el color del muro, los pisos, el cierre y el cartel.
// Los textos completos quedan en el repo: son la fuente, y sirven para lo que todavía no se modela.
import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.mjs';

const dir = path.join(ROOT, 'tools', 'relevamientos'), out = [];
const tipoDe = (s) => {
  s = s.toLowerCase();
  if (/iglesia|parroqui|capilla|templo/.test(s)) return 4;
  if (/escuela|colegio|liceo|jard[ií]n infantil|sala cuna/.test(s)) return 3;
  if (/municipal|bombero|carabiner|comisar|hospital|consultorio|cesfam|cosam|banco|bci|correo|registro civil|juzgado|biblioteca|turismo|farmacia|posta/.test(s)) return 2;
  if (/restaur|caf[eé]|poller|pizzer|empanad|comida|sangu|fuente de soda|helad|gelat|pasteler|panader|bar\b|cervec|food/.test(s)) return 1;
  if (/hostal|hotel|hosped|caba[ñn]a|camping|residencial/.test(s)) return 5;
  if (/almac[eé]n|minimarket|supermerc|tienda|local|librer|botiller|ferreter|carnicer|verduler|bazar|kiosco|quiosco|artesan|peluquer|vulcaniz|taller|funeraria|veterin|lavander|florer/.test(s)) return 0;
  return 6;
};
for (const file of (await fs.readdir(dir)).filter((f) => f.endsWith('.txt')).sort()) {
  const pueblo = file.replace('.txt', '');
  let n = 0;
  for (const line of (await fs.readFile(path.join(dir, file), 'utf8')).split(/\r?\n/)) {
    if (!/^-?\d+\.\d+,\s*-?\d+\.\d+\s*\|/.test(line)) continue;
    const f = line.split('|').map((s) => s.trim());
    if (f.length < 12) continue; // las líneas cortas son elementos de plaza, no edificios
    const [lat, lon] = f[0].split(',').map(Number), e = { lat, lon };
    const hex = f[5].match(/#[0-9A-Fa-f]{6}/); if (hex) e.color = hex[0].toLowerCase();
    const pisos = parseInt(f[4], 10); if (pisos > 0 && pisos < 12) e.pisos = pisos;
    const c = f[8].toLowerCase();
    if (/ningun/.test(c)) e.cierre = 'ninguno';
    else if (/reja|perfiles|barrotes|malla/.test(c)) e.cierre = 'reja';
    else if (/pandereta|muro|pirca|albañiler|ladrillo/.test(c)) e.cierre = 'pandereta';
    else if (/madera|tabla|cerco|varas/.test(c)) e.cierre = 'madera';
    else if (/continua/.test(f[9].toLowerCase())) e.cierre = 'ninguno';
    // Cartel: el primer texto entre comillas que se leyó completo (sin puntos suspensivos ni signos de duda).
    // Fuera lo pasajero o de marca ("se vende", gas, cable, bebidas): no es el nombre del lugar.
    const NOISE = /^(se vende|se arrienda|directv|abastible|abasto|le[ñn]a|ideal|masajes|lipigas|gasco|coca[- ]cola|cristal|escudo)$/i;
    const quotes = [...f[3].matchAll(/["“]([^"”]{2,})["”]/g)].flatMap((m) => m[1].split(/\s+\/\s+/)).map((s) => s.replace(/\([^)]*\)/g, ' ').replace(/^(Jim Beam|Bresler)\s*—\s*/i, '').split(/\s+—\s+/)[0].replace(/\s+/g, ' ').trim()).filter((s) => !NOISE.test(s) && !/#\s*\d+|solidaria/i.test(s)).filter((s) => s.length >= 3 && !/[…?]|\.\.\./.test(s) && !/^\d+\s*[A-Z]?$/.test(s) && !/→/.test(s));
    if (quotes.length) { e.cartel = quotes[0].slice(0, 38); e.tipo = tipoDe(f[2] + ' ' + quotes[0]); }
    if (/IGLESIA PARROQUIAL/.test(f[2])) e.hito = 'iglesia';
    if (e.color || e.pisos || e.cierre || e.cartel) { out.push(e); n++; }
  }
  console.log(`${pueblo}: ${n} edificios`);
}
const body = `// GENERADO por tools/build_pueblos.mjs a partir de tools/relevamientos/*.txt. No editar a mano.\nexport const RELEVADOS = ${JSON.stringify(out).replace(/\},\{/g, '},\n  {').replace('[{', '[\n  {').replace(/\}\]$/, '},\n]')};\n`;
await fs.writeFile(path.join(ROOT, 'src', 'pueblos_data.js'), body);
const con = (k) => out.filter((e) => e[k]).length;
console.log(`${out.length} edificios → src/pueblos_data.js · con color ${con('color')} · con pisos ${con('pisos')} · con cierre ${con('cierre')} · con cartel ${con('cartel')}`);
