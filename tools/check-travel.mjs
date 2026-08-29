// check-travel.mjs — are the foreign gates actually reachable, and are the walks honest?
// Every capital and great city that opens to a foreigner must be somewhere a warband can WALK to
// from the camp, and Rome must be weeks away, not an afternoon. Run with the dev server up:
//   node tools/check-travel.mjs
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:5173/';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.goto(URL);
await sleep(1800);
await page.evaluate(() => { window.__GameState.reset(); window.__warlord.scene.stop('Title'); window.__warlord.scene.start('Map'); });
await sleep(2500);

const rows = await page.evaluate(() => {
  const m = window.__warlord.scene.getScene('Map');
  return window.__NODES.filter(n => n.kind === 'foreign')
    .map(n => ({ id: n.id, name: n.name, realm: n.territory, capital: !!n.capital, days: m.routeDays(n.id) }));
});
await browser.close();

let bad = 0;
const byRealm = new Map();
for (const r of rows) {
  if (!byRealm.has(r.realm)) byRealm.set(r.realm, []);
  byRealm.get(r.realm).push(r);
}
console.log('walking from the Bandit Camp:\n');
for (const [realm, list] of byRealm) {
  list.sort((a, b) => a.days - b.days);
  console.log(`  ${realm.padEnd(9)} ${list.map(r => `${r.name}${r.capital ? '*' : ''} ${r.days}d`).join('   ')}`);
  for (const r of list) if (r.days <= 0) { console.log(`    ✗ ${r.name} cannot be walked to`); bad++; }
}
const rome = rows.find(r => r.name === 'Roma');
if (rome && rome.days < 21) { console.log(`\n  ✗ Roma is only ${rome.days} days away — it should be weeks`); bad++; }
if (errors.length) { console.log('\npage errors:', errors.join('\n')); bad++; }
console.log(bad ? `\n${bad} problem(s)` : `\nall ${rows.length} foreign gates are reachable on foot`);
process.exit(bad ? 1 : 0);
