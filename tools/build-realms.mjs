// build-realms.mjs — writes the foreigner content into src/world/Realms.ts from a JSON pack.
//   node tools/build-realms.mjs data/realms/visits.json
import fs from 'node:fs';

const src = process.argv[2] || 'data/realms/visits.json';
const realms = JSON.parse(fs.readFileSync(src, 'utf8'));
const q = (s) => JSON.stringify(String(s));
const order = ['rus', 'rome', 'greece', 'arabia', 'persia', 'egypt', 'kush', 'india', 'china'];
realms.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

const body = realms.map(r => `  ${r.id}: {
    id: ${q(r.id)},
    enter: ${q(r.enter)},
    warLocked: ${q(r.warLocked)},
    barracksLocked: ${q(r.barracksLocked)},
    forge: { items: [${r.forge.items.map(q).join(', ')}], swordMaxTier: ${r.forge.swordMaxTier}, note: ${q(r.forge.note)} },
    stables: { horses: [${r.stables.horses.map(q).join(', ')}], note: ${q(r.stables.note)} },
    inn: {
      name: ${q(r.inn.name)},
      rumors: [
${r.inn.rumors.map(t => `        ${q(t)},`).join('\n')}
      ],
    },
    markup: ${r.markup},
  },`).join('\n');

const p = 'src/world/Realms.ts';
let s = fs.readFileSync(p, 'utf8');
const head = s.indexOf('export const REALM_VISITS');
const tail = s.indexOf('\n/** The realms whose gates are open');
if (head < 0 || tail < 0) throw new Error('markers not found in Realms.ts');
s = s.slice(0, head) + `export const REALM_VISITS: Record<string, RealmVisit> = {\n${body}\n};\n` + s.slice(tail + 1);
fs.writeFileSync(p, s);
console.log(`wrote ${realms.length} realms into ${p}`);
