// smoke.mjs — automated playthrough in headless Chromium (desktop + emulated phone). Run: npm run smoke
// Title → camp screen (tap buildings, shop, wait a day) → map (ledger, travel) → raid → sack/occupy/leave →
// occupied village shops → wages & desertion → siege of Kingsport (gate, waves, halberd) → Kingsport shops →
// palisade reachability for every village → the ranged rule → save/reload.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || 'tests/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

function attachErrorCapture(page, errors) {
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
}
async function buttonPos(page, sceneKey, prefix) {
  return page.evaluate(([k, p]) => {
    const s = window.__warlord.scene.getScene(k);
    if (!s || !s.children) return null;
    for (const c of s.children.list) {
      if (c.type !== 'Container') continue;
      const t = c.list.find(x => x.type === 'Text' && x.text.startsWith(p));
      if (t) { const d = window.__warlord.scale.displayScale.x || 1; return { x: c.x / d, y: c.y / d }; }
    }
    return null;
  }, [sceneKey, prefix]);
}
const activeScenes = (page) => page.evaluate(() => window.__warlord.scene.getScenes(true).map(s => s.scene.key));
const gs = (page) => page.evaluate(() => { const S = window.__GameState; return { gold: S.gold, day: S.day, infamy: S.infamy, location: S.location, tier: S.infamyTierName, troops: S.troops.length, kinds: S.troops.map(t => t.kind), horse: S.horse, weapon: S.weaponKind, owned: { ...S.owned }, armor: S.armor, shield: S.shield, defense: S.defense, wages: S.wagesPerDay, tribute: S.tributePerDay, deserted: S.deserted.length, unpaid: S.unpaidDays, settlements: JSON.parse(JSON.stringify(S.settlements)), garrisons: Object.fromEntries(Object.entries(S.garrisons).map(([k, v]) => [k, v.length])), siege: S.siegeUnlocked }; });
const raidState = (page) => page.evaluate(() => {
  const r = window.__warlord.scene.getScene('Raid');
  if (!r || !r.hero || !r.scene.isActive()) return null;
  return { heroX: r.hero.x, heroY: r.hero.y, heroHp: r.hero.hp, enemies: r.enemies.length, onWall: r.enemies.filter(e => e.onWall).length, dormant: r.enemies.filter(e => e.dormant).length,
    kinds: r.enemies.map(e => e.kind), troops: r.troops.length, gold: r.hud.gold, kind: r.cfg.kind, layout: r.cfg.layoutId, palisade: r.cfg.palisade,
    walls: r.obstacles.filter(o => o.kind === 'wall').length, gate: r.gate ? { alive: r.gate.alive, hp: r.gate.hp } : null, mode: r.hero.mode, tier: r.hero.tier, scale: r.hero.scaleX, fps: window.__warlord.loop.actualFps,
    playerArrows: r.arrows.getChildren().filter(a => a.active && a.team === 'player').length };
});
async function clickBtn(page, scene, prefix, touch = false) {
  const b = await buttonPos(page, scene, prefix);
  check(!!b, `found "${prefix}" in ${scene}`);
  if (!b) throw new Error(`no button ${prefix} in ${scene}`);
  if (touch) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
  await sleep(450);
}
async function autoPlay(page, seconds, { weaken = true } = {}) {
  const end = Date.now() + seconds * 1000;
  let lastX = -1, lastY = -1, stuckTicks = 0, tick = 0;
  while (Date.now() < end) {
    const st = await page.evaluate(([wiggle, weaken]) => {
      const r = window.__warlord.scene.getScene('Raid');
      if (!r || !r.hero || !r.hero.alive || !r.playerInput || !r.scene.isActive()) return null;
      if (weaken) { for (const e of r.enemies) if (e.hp > 1) e.hp = 1; r.hero.hp = r.hero.maxHp; if (r.gate && r.gate.alive && r.gate.hp > 40) r.gate.hp = 40; }
      let best = null, bd = 1e9;
      if (r.gate && r.gate.alive) { best = { x: r.gate.x - 30, y: Math.max(r.gate.rect.top + 10, Math.min(r.gate.rect.bottom - 10, r.hero.y)) }; bd = Math.hypot(best.x - r.hero.x, best.y - r.hero.y); }
      else for (const e of r.enemies) { if (e.onWall || e.dormant) continue; const d = Math.hypot(e.x - r.hero.x, e.y - r.hero.y); if (d < bd) { bd = d; best = e; } }
      if (!best) { r.playerInput.joyX = 0; r.playerInput.joyY = 0; return { enemies: r.enemies.length, x: r.hero.x, y: r.hero.y, idle: true }; }
      let dx = (best.x - r.hero.x) / (bd || 1), dy = (best.y - r.hero.y) / (bd || 1);
      if (wiggle) { const t = dx; dx = -dy; dy = t; }
      const go = bd > (r.hero.mode === 'bow' ? 150 : 34);
      r.playerInput.joyX = go ? dx : 0; r.playerInput.joyY = go ? dy : 0;
      return { enemies: r.enemies.length, x: r.hero.x, y: r.hero.y };
    }, [stuckTicks >= 3, weaken]);
    if (!st) break;
    if (st.enemies === 0 && tick > 4) break;
    if (Math.abs(st.x - lastX) < 3 && Math.abs(st.y - lastY) < 3) stuckTicks++; else stuckTicks = 0;
    if (stuckTicks > 5) stuckTicks = 0;
    lastX = st.x; lastY = st.y; tick++;
    await sleep(200);
  }
  await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); if (r && r.playerInput) { r.playerInput.joyX = 0; r.playerInput.joyY = 0; } });
}
const waitScene = async (page, key, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await activeScenes(page)).includes(key)) return true; await sleep(150); } return false; };
const waitPanel = async (page, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const open = await page.evaluate(() => { const h = window.__warlord.scene.getScene('MapHud'); return !!(h && h.scene.isActive() && h.panelOpen); }); if (open) return true; await sleep(200); } return false; };
const panelTitle = (page) => page.evaluate(() => window.__warlord.scene.getScene('MapHud').spec?.title ?? null);
const hidePanel = (page) => page.evaluate(() => window.__warlord.scene.getScene('MapHud').hidePanel());
const tapNode = async (page, id, touch = false) => {
  const pos = await page.evaluate((nid) => { const m = window.__warlord.scene.getScene('Map'); const n = window.__NODES.find(n => n.id === nid); const cam = m.cameras.main; const d = window.__warlord.scale.displayScale.x || 1;
    return { x: ((n.x - cam.worldView.x) * cam.zoom) / d, y: ((n.y - cam.worldView.y) * cam.zoom) / d }; }, id);
  if (touch) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
};
const noPatrols = (page) => page.evaluate(() => { Object.defineProperty(window.__GameState, 'patrolChance', { get: () => 0, configurable: true }); });
async function raidHere(page, expectKind = 'village') {
  await clickBtn(page, 'MapHud', expectKind === 'siege' ? 'SIEGE' : 'RAID');
  check(await waitScene(page, 'Raid'), `${expectKind} battle started`);
  await sleep(700);
  return raidState(page);
}

async function desktopRun(browser) {
  console.log('=== DESKTOP 1440x900 ===');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  attachErrorCapture(page, errors);
  await page.goto(URL);
  await sleep(1500);
  check((await activeScenes(page)).includes('Title'), 'title scene on load');
  // the title screen must never write a save
  await page.evaluate(() => { window.__GameState.save(); });
  check(!(await page.evaluate(() => window.__GameState.hasSave())), 'title screen cannot create a save by accident');
  await clickBtn(page, 'Title', 'NEW');
  check(await waitScene(page, 'Settlement'), 'new warband opens the camp screen');
  await sleep(500);
  await page.screenshot({ path: `${OUT}/d-camp.png` });

  // --- tap buildings
  await clickBtn(page, 'Settlement', 'FORGE');
  check(await waitScene(page, 'Shop'), 'tapping the Forge opens its panel');
  await page.screenshot({ path: `${OUT}/d-forge.png` });
  await clickBtn(page, 'Shop', 'LEAVE');
  check(!(await activeScenes(page)).includes('Shop'), 'shop closed');
  await page.evaluate(() => { window.__GameState.gold = 300; window.__GameState.save(); });
  await clickBtn(page, 'Settlement', 'BARRACKS');
  await waitScene(page, 'Shop');
  await clickBtn(page, 'Shop', '35 gold');
  let s = await gs(page);
  check(s.troops === 4 && s.gold === 265, `recruited a raider (${s.troops} troops, ${s.gold} gold)`);
  await clickBtn(page, 'Shop', 'LEAVE');
  await clickBtn(page, 'Settlement', 'FORGE');
  await waitScene(page, 'Shop');
  await clickBtn(page, 'Shop', '60 gold');
  s = await gs(page);
  check(s.armor === 'leather' && s.defense === 2, `bought leather armor (armor ${s.armor}, def ${s.defense})`);
  await clickBtn(page, 'Shop', 'LEAVE');
  // --- wait a day: wages
  const before = await gs(page);
  await clickBtn(page, 'Settlement', 'WAIT');
  s = await gs(page);
  check(s.day === before.day + 1 && s.gold === before.gold - before.wages, `waiting a day charged wages (${before.gold} → ${s.gold}, wages ${before.wages}/day)`);
  await clickBtn(page, 'Settlement', 'TO THE MAP');
  check(await waitScene(page, 'Map'), 'to the map');
  await sleep(700);
  await noPatrols(page);
  const ledger = await page.evaluate(() => window.__warlord.scene.getScene('MapHud').ledgerText.text);
  check(/wages/.test(ledger) && /tribute/.test(ledger), `ledger on the map bar: "${ledger}"`);
  await page.screenshot({ path: `${OUT}/d-map.png` });

  // --- raid Ashford and just leave
  await tapNode(page, 'ashford');
  check(await waitPanel(page, 15000), 'reached Ashford');
  let r = await raidHere(page);
  check(r && r.enemies === 11, `Ashford: ${r && r.enemies} defenders`);
  await autoPlay(page, 60);
  await sleep(1800);
  check(await waitScene(page, 'Result'), 'victory result');
  const choices = await page.evaluate(() => window.__warlord.scene.getScene('Result').children.list.filter(c => c.type === 'Container').map(c => c.list.find(t => t.type === 'Text')?.text));
  check(choices.includes('SACK') && choices.includes('OCCUPY') && choices.includes('LEAVE'), `conquest choice offered (${choices.join('/')})`);
  await page.screenshot({ path: `${OUT}/d-choice.png` });
  await clickBtn(page, 'Result', 'LEAVE');
  check(await waitScene(page, 'Map'), 'back on the map');
  await sleep(800);
  s = await gs(page);
  check(s.settlements.ashford?.timesRaided === 1 && s.infamy === 7, `leave: village raided + ruined, infamy ${s.infamy}`);
  await page.screenshot({ path: `${OUT}/d-map-toast.png` });

  // --- occupy Millbrook
  await hidePanel(page);
  await tapNode(page, 'millbrook');
  check(await waitPanel(page, 20000), 'reached Millbrook');
  r = await raidHere(page);
  await autoPlay(page, 80);
  await sleep(1800);
  await waitScene(page, 'Result');
  await clickBtn(page, 'Result', 'OCCUPY');
  await waitScene(page, 'Map');
  await sleep(800);
  s = await gs(page);
  check(s.settlements.millbrook?.occupied && s.garrisons.millbrook === 2 && s.troops === 2 && s.tribute === 6, `occupied Millbrook: garrison 2, troops ${s.troops}, tribute +${s.tribute}/day`);
  await page.screenshot({ path: `${OUT}/d-occupied.png` });
  // its shops open to us
  await clickBtn(page, 'MapHud', 'ENTER');
  check(await waitScene(page, 'Settlement'), 'entered the occupied village');
  await sleep(400);
  await page.screenshot({ path: `${OUT}/d-village-screen.png` });
  await clickBtn(page, 'Settlement', 'BARRACKS');
  await waitScene(page, 'Shop');
  await clickBtn(page, 'Shop', '25 gold');
  s = await gs(page);
  check(s.troops === 3 && s.kinds.includes('levy'), `recruited a village levy (${s.kinds.join(',')})`);
  await clickBtn(page, 'Shop', 'LEAVE');
  await clickBtn(page, 'Settlement', 'TO THE MAP');
  await waitScene(page, 'Map');
  await sleep(500);

  // --- upkeep: too many mouths, no gold → desertion on the road
  await page.evaluate(() => { const S = window.__GameState; S.gold = 0; while (S.troops.length < 6) S.recruit('raider'); S.save(); });
  await hidePanel(page);
  await tapNode(page, 'camp');
  check(await waitPanel(page, 30000), 'travelled home broke with 6 mouths to feed');
  s = await gs(page);
  check(s.deserted >= 1 && s.troops < 6, `unpaid troops deserted on the road (${s.deserted} gone, ${s.troops} left)`);
  await page.screenshot({ path: `${OUT}/d-desertion.png` });

  // --- the siege of Kingsport
  await page.evaluate(() => { const S = window.__GameState; S.gold = 500; S.infamy = 20; S.save(); window.__warlord.scene.getScene('Map').refresh(); });
  s = await gs(page);
  check(s.siege, `siege unlocked at ${s.tier}`);
  await hidePanel(page);
  await tapNode(page, 'kingsport');
  check(await waitPanel(page, 5000) && /MARCH/.test((await page.evaluate(() => window.__warlord.scene.getScene('MapHud').spec.buttons.map(b => b.label).join(' ')))), 'Kingsport panel offers MARCH with the route cost before travelling');
  await clickBtn(page, 'MapHud', 'MARCH');
  await sleep(300);
  check(await waitPanel(page, 60000), 'reached Kingsport');
  r = await raidHere(page, 'siege');
  check(r && r.kind === 'siege' && r.gate && r.gate.alive && r.onWall === 4 && r.dormant === 10, `siege set up: gate ${r && r.gate && r.gate.hp}hp, ${r && r.onWall} wall archers, ${r && r.dormant} asleep behind the wall`);
  await page.screenshot({ path: `${OUT}/d-siege.png` });
  await autoPlay(page, 25);
  r = await raidState(page);
  check(r && r.gate && !r.gate.alive, 'the gate fell');
  check(r && r.onWall === 0 && r.dormant === 0, 'wall archers came down and the guard woke');
  await page.screenshot({ path: `${OUT}/d-siege-open.png` });
  await autoPlay(page, 90);
  r = await raidState(page);
  await autoPlay(page, 60);
  await sleep(1800);
  check(await waitScene(page, 'Result', 8000), 'Kingsport fell');
  const sc = await page.evaluate(() => window.__warlord.scene.getScene('Result').children.list.filter(c => c.type === 'Container').map(c => c.list.find(t => t.type === 'Text')?.text));
  check(sc.includes('SACK') && sc.includes('OCCUPY') && !sc.includes('LEAVE'), `town: sack or occupy only (${sc.join('/')})`);
  await page.screenshot({ path: `${OUT}/d-siege-result.png` });
  await clickBtn(page, 'Result', 'OCCUPY');
  await waitScene(page, 'Map');
  await sleep(800);
  s = await gs(page);
  check(s.owned.halberd && s.weapon === 'halberd', 'the garrison captain dropped the halberd (equipped)');
  check(s.settlements.kingsport?.occupied && s.tribute === 6 + 15, `Kingsport occupied, tribute now +${s.tribute}/day`);
  await clickBtn(page, 'MapHud', 'ENTER');
  await waitScene(page, 'Settlement');
  await sleep(400);
  await page.screenshot({ path: `${OUT}/d-kingsport.png` });
  await clickBtn(page, 'Settlement', 'FORGE');
  await waitScene(page, 'Shop');
  const kf = await page.evaluate(() => window.__warlord.scene.getScene('Shop').children.list.filter(c => c.type === 'Text').map(t => t.text).join(' | '));
  check(/Steel Plate/.test(kf) && /Kite Shield/.test(kf) && /Halberd/.test(kf), 'Kingsport forge stocks plate, kite shield and the halberd choice');
  await clickBtn(page, 'Shop', '150 gold');
  s = await gs(page);
  check(s.armor === 'plate' && s.defense >= 4, `bought steel plate (def ${s.defense})`);
  await page.screenshot({ path: `${OUT}/d-kingsport-forge.png` });
  await clickBtn(page, 'Shop', 'LEAVE');
  await clickBtn(page, 'Settlement', 'BARRACKS');
  await waitScene(page, 'Shop');
  await clickBtn(page, 'Shop', '60 gold');
  s = await gs(page);
  check(s.kinds.includes('guard'), `recruited a town guard (${s.kinds.join(',')})`);
  await clickBtn(page, 'Shop', 'LEAVE');
  await clickBtn(page, 'Settlement', 'TO THE MAP');
  await waitScene(page, 'Map');
  await sleep(500);

  // --- palisade reachability on every village (defenders must be able to path to the hero through the gates)
  for (const id of ['ashford', 'millbrook', 'thornhill', 'greywater']) {
    await page.evaluate((vid) => { const S = window.__GameState; S.fortifyStepsDone = 4; const st = S.settlement(vid); st.timesRaided = 0; st.lastRaidDay = null; st.occupied = false; st.sacked = false;
      const g = window.__warlord; g.scene.stop('MapHud'); g.scene.stop('Map'); g.scene.start('Raid', window.__battles.villageBattle(vid)); }, id);
    await waitScene(page, 'Raid');
    await sleep(800);
    const reach = await page.evaluate(() => {
      const r = window.__warlord.scene.getScene('Raid');
      r.flow.update(1, r.hero.x, r.hero.y);
      const f = r.flow; const idx = (x, y) => Math.floor(y / f.cell) * f.cols + Math.floor(x / f.cell);
      // a unit standing in a blocked cell is fine as long as it can step into a reachable neighbour
      const reachable = (x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = Math.floor(x / f.cell) + dx, rr = Math.floor(y / f.cell) + dy; if (c < 0 || rr < 0 || c >= f.cols || rr >= f.rows) continue; if (f.dist[rr * f.cols + c] >= 0) return true; } return false; };
      const badList = r.enemies.filter(e => !reachable(e.x, e.y)).map(e => `${e.kind}@${Math.round(e.x)},${Math.round(e.y)}`);
      return { palisade: r.cfg.palisade, walls: r.obstacles.filter(o => o.kind === 'wall').length, enemies: r.enemies.length, unreachable: badList.length, badList };
    });
    check(reach.palisade && reach.walls > 0 && reach.unreachable === 0, `${id} palisade: ${reach.walls} wall segments, ${reach.unreachable}/${reach.enemies} defenders cut off${reach.badList.length ? ' (' + reach.badList.join(' ') + ')' : ''}`);
    await page.screenshot({ path: `${OUT}/d-palisade-${id}.png` });
  }

  // --- the ranged rule: no shooting on the move, shooting when stopped
  await page.evaluate(() => { const S = window.__GameState; S.owned.bow = true; S.equippedWeapon = 'bow'; S.horse = 'none'; S.save();
    const g = window.__warlord; g.scene.stop('Raid'); g.scene.start('Raid', window.__battles.villageBattle('greywater')); });
  await waitScene(page, 'Raid');
  await sleep(800);
  await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); r.hero.setPosition(640, 700); r.hero.hp = 9999; r.hero.maxHp = 9999; for (const e of r.enemies) e.wakeQuiet(); r.playerInput.joyX = 0; r.playerInput.joyY = 1; });
  await page.evaluate(() => { window.__warlord.scene.getScene('Raid').shots = 0; });
  await sleep(1600);
  const shotsMoving = await page.evaluate(() => window.__warlord.scene.getScene('Raid').shots);
  await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); r.playerInput.joyX = 0; r.playerInput.joyY = 0; r.shots = 0; });
  await sleep(1600);
  const shotsStill = await page.evaluate(() => window.__warlord.scene.getScene('Raid').shots);
  check(shotsMoving === 0 && shotsStill > 0, `ranged rule: ${shotsMoving} shots while running, ${shotsStill} while standing still`);
  await page.screenshot({ path: `${OUT}/d-bow-rule.png` });
  await page.evaluate(() => { const g = window.__warlord; g.scene.stop('Hud'); g.scene.stop('Raid'); g.scene.start('Map'); });
  await waitScene(page, 'Map');

  // --- save / reload keeps conquests
  await page.reload();
  await sleep(1500);
  await clickBtn(page, 'Title', 'CONTINUE');
  check(await waitScene(page, 'Map'), 'CONTINUE loads the save');
  await sleep(600);
  s = await gs(page);
  check(s.settlements.kingsport?.occupied && s.owned.halberd && s.armor === 'plate', 'conquests, the halberd and the plate survived a reload');
  const fps = await page.evaluate(() => window.__warlord.loop.actualFps);
  check(fps > 50, `fps healthy (${fps.toFixed(0)})`);
  check(errors.length === 0, `no console errors/warnings on desktop (${errors.length})`);
  if (errors.length) console.log(errors.slice(0, 20).join('\n'));
  await ctx.close();
}

async function phoneRun(browser) {
  console.log('=== PHONE portrait 390x844 (touch) ===');
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  attachErrorCapture(page, errors);
  await page.goto(URL);
  await sleep(1500);
  await clickBtn(page, 'Title', 'NEW', true);
  check(await waitScene(page, 'Settlement'), 'phone: new warband → camp screen');
  await sleep(500);
  await page.screenshot({ path: `${OUT}/p-camp.png` });
  await clickBtn(page, 'Settlement', 'STABLES', true);
  check(await waitScene(page, 'Shop'), 'phone: tapping a building opens its shop');
  await page.screenshot({ path: `${OUT}/p-stables.png` });
  await clickBtn(page, 'Shop', 'LEAVE', true);
  await clickBtn(page, 'Settlement', 'TO THE MAP', true);
  check(await waitScene(page, 'Map'), 'phone: to the map');
  await sleep(700);
  await page.screenshot({ path: `${OUT}/p-map.png` });
  await noPatrols(page);
  await tapNode(page, 'ashford', true);
  check(await waitPanel(page, 15000), 'phone: tap-to-travel reached Ashford');
  await page.screenshot({ path: `${OUT}/p-ashford.png` });
  await clickBtn(page, 'MapHud', 'RAID', true);
  check(await waitScene(page, 'Raid'), 'phone: raid from the panel');
  await sleep(1000);
  await page.screenshot({ path: `${OUT}/p-raid.png` });
  check(errors.length === 0, `phone: no console errors/warnings (${errors.length})`);
  if (errors.length) console.log(errors.slice(0, 20).join('\n'));
  await ctx.close();
}

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  await desktopRun(browser);
  await phoneRun(browser);
} catch (e) {
  console.log('FAIL exception: ' + (e.stack || e));
  failures++;
}
await browser.close();
console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`);
process.exit(failures ? 1 : 0);
