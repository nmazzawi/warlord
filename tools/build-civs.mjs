// build-civs.mjs — writes the fifteen starts into src/world/Civs.ts from data/civs/starts.json.
// The WORDS come from the pack; the NUMBERS are set here, from each unit's role and from what its own
// signature says it does, so the whole roster is balanced against one table instead of fifteen.
//   node tools/build-civs.mjs
import fs from 'node:fs';

const starts = JSON.parse(fs.readFileSync(process.argv[2] || 'data/civs/starts.json', 'utf8'));
const q = (s) => JSON.stringify(String(s));

const HOME = { outlaw: 'homeland', mongolia: 'steppe' };
const NAME = {
  outlaw: 'The Borderland', rome: 'Rome', greece: 'Greece', japan: 'Japan', china: 'China',
  mongolia: 'Mongolia', rus: 'Rus', arabia: 'The Caliphate', viking: 'The Norse', persia: 'Persia',
  india: 'India', egypt: 'Egypt', kush: 'Kush', aztecs: 'The Aztecs', inca: 'The Inca',
};
const CAMP = {
  outlaw: 'Bandit Camp', rome: 'The Old Villa', greece: 'The Ruined Sanctuary', japan: 'The Mountain Hall',
  china: 'The Abandoned Ward', mongolia: 'Your Camp', rus: 'The River Fort', arabia: 'The Dry Well',
  viking: 'The Boat Shed', persia: 'The Way Station', india: 'The Grove Camp', egypt: 'The Old Quarry',
  kush: 'The Furnace Camp', aztecs: 'The Lake Village', inca: 'The High Terrace',
};
// cloth, then metal or trim: the two colours a portrait is read by
const COLOR = {
  outlaw: [0x6b5030, 0x9a7a44], rome: [0xa8412f, 0xd8b45a], greece: [0x3f6f9a, 0xc9a049],
  japan: [0x2f3a4a, 0xc4443a], china: [0x8a2f3a, 0xd6b45c], mongolia: [0x7a5a2f, 0xbfa05a],
  rus: [0x3f6b4a, 0xc0c8d8], arabia: [0x2f6b6b, 0xe0c46a], viking: [0x4a5a6b, 0xb9c2cc],
  persia: [0x6b3f7a, 0xd8b45a], india: [0xb5602a, 0xe8c060], egypt: [0x2f7a6b, 0xe0c060],
  kush: [0x8a4a2f, 0xd8a860], aztecs: [0x2f6b4a, 0xd85a3a], inca: [0x9a4a3a, 0xd8c060],
};
/** Role baselines. Everything else is a nudge from what the unit's own signature says it does. */
const ROLE = {
  line:       { hp: 50, attack: 8,  defense: 2, speed: 150, evasion: 2,  range: 0, cost: 32, wage: 2 },
  elite:      { hp: 80, attack: 13, defense: 6, speed: 140, evasion: 4,  range: 0, cost: 85, wage: 5 },
  specialist: { hp: 54, attack: 10, defense: 2, speed: 168, evasion: 14, range: 0, cost: 62, wage: 4 },
};
const has = (s, ...words) => words.some(w => s.toLowerCase().includes(w));

/** The ONE thing this unit visibly does, read out of the signature its author wrote for it. Every
 *  unit gets exactly one; a plain line unit gets none and is the better for it. */
function abilityFor(u) {
  const sig = `${u.signature} ${u.desc} ${u.name}`.toLowerCase();
  if (has(sig, 'javelin', 'pilum', 'throw', 'dart', 'sling', 'shot puts')) return 'javelin';
  if (has(sig, 'never routs', 'frenz', 'berserk', 'rage', 'bleeds', 'harder as')) return 'frenzy';
  if (has(sig, 'behind', 'backstab', 'shadow', 'night', 'silent', 'before he turns')) return 'backstab';
  if (has(sig, 'nearby', 'either side', 'close up', 'inspire', 'courage', 'drum', 'walk back into rank', 'fight harder')) return 'inspire';
  if (has(sig, 'singles out', 'duel', 'alone until', 'whoever leads', 'commander')) return 'duel';
  if (has(sig, 'elephant', 'trample', 'chariot', 'through the line', 'scythe')) return 'trample';
  if (has(sig, 'shield', 'wall', 'overlap', 'roof', 'locks')) return 'shieldwall';
  if (has(sig, 'bow', 'arrow', 'shoot', 'loose', 'crossbow', 'archer')) return 'volley';
  if (has(sig, 'horse', 'saddle', 'rider', 'lancer', 'gallop')) return 'lance';
  return 'none';
}

function statsFor(u) {
  const b = { ...ROLE[u.role] };
  const sig = `${u.signature} ${u.desc} ${u.name}`;
  if (has(sig, 'bow', 'arrow', 'shoot', 'loose', 'sling', 'archer', 'volley', 'crossbow')) { b.range = 210; b.attack -= 1; b.hp -= 6; }
  if (has(sig, 'javelin', 'pilum', 'throw', 'dart')) { b.range = 130; b.speed += 10; }
  if (has(sig, 'horse', 'saddle', 'gallop', 'ride', 'rider', 'lancer', 'cavalr', 'camel')) { b.speed = 195; b.hp += 8; b.cost += 26; b.wage += 2; }
  if (has(sig, 'shield', 'wall', 'holds', 'hold the', 'anchor', 'formation')) { b.defense += 3; b.speed -= 10; }
  if (has(sig, 'never routs', 'frenz', 'berserk', 'rage')) { b.attack += 4; b.defense -= 1; b.hp += 10; }
  if (has(sig, 'behind', 'backstab', 'shadow', 'night', 'silent')) { b.evasion += 10; b.attack += 3; b.hp -= 6; }
  if (has(sig, 'elephant', 'trample', 'chariot')) { b.hp += 40; b.attack += 6; b.speed -= 6; b.cost += 40; b.wage += 3; }
  if (has(sig, 'capture', 'bind', 'takes prisoners')) { b.evasion += 6; }
  if (has(sig, 'harder', 'inspire', 'nearby', 'courage', 'standard', 'drum')) { b.defense += 2; b.cost += 20; b.wage += 1; }
  for (const k of Object.keys(b)) b[k] = Math.max(0, Math.round(b[k]));
  return b;
}

const order = ['outlaw', 'rome', 'greece', 'japan', 'china', 'mongolia', 'rus', 'arabia', 'viking', 'persia', 'india', 'egypt', 'kush', 'aztecs', 'inca'];
starts.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

const body = starts.map(c => {
  const [tint, accent] = COLOR[c.id] ?? [0x6b5030, 0x9a7a44];
  const troops = c.troops.map((t, i) => {
    const s = statsFor(t);
    const id = `${c.id}_${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
    return `      { id: ${q(id)}, name: ${q(t.name)}, role: ${q(t.role)}, ability: ${q(abilityFor(t))},
        attack: ${s.attack}, defense: ${s.defense}, speed: ${s.speed}, evasion: ${s.evasion}, range: ${s.range},
        hp: ${s.hp}, cost: ${s.cost}, wage: ${s.wage},
        signature: ${q(t.signature)},
        desc: ${q(t.desc)} },`;
  }).join('\n');
  return `  ${c.id}: {
    id: ${q(c.id)}, home: ${q(HOME[c.id] ?? c.id)}, name: ${q(NAME[c.id] ?? c.id)},
    heroName: ${q(c.heroName)}, heroTitle: ${q(c.heroTitle)},
    backstory: ${q(c.backstory)},
    playstyle: ${q(c.playstyle)},
    weapon: ${q(c.weapon)}, dress: ${q(c.dress)},
    tint: 0x${tint.toString(16)}, accent: 0x${accent.toString(16)}, lean: ${q(c.lean)},
    campName: ${q(CAMP[c.id] ?? 'Camp')},
    troops: [
${troops}
    ],
  },`;
}).join('\n');

const p = 'src/world/Civs.ts';
let s = fs.readFileSync(p, 'utf8');
const head = s.indexOf('export const CIVS');
const tail = s.indexOf('\nexport function civOf');
if (head < 0 || tail < 0) throw new Error('markers not found in Civs.ts');
s = s.slice(0, head) + `export const CIVS: Record<string, CivDef> = {\n${body}\n};\n` + s.slice(tail + 1);
fs.writeFileSync(p, s);
console.log(`wrote ${starts.length} starts into ${p}`);
