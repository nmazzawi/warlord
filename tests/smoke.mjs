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
    const d = window.__warlord.scale.displayScale.x || 1;
    for (const c of s.children.list) {
      if (c.type !== 'Container') continue;
      const t = c.list.find(x => x.type === 'Text' && x.text.startsWith(p));
      if (t) return { x: c.x / d, y: c.y / d };
    }
    // a settlement is a street now: its buildings are not containers, they are a picture with its
    // name written under it, and the whole plot is the tap target
    for (const c of s.children.list) {
      if (c.type !== 'Text' || !c.text.startsWith(p)) continue;
      const b = c.getBounds();
      return { x: b.centerX / d, y: b.centerY / d };
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
  let lastX = -1, lastY = -1, stuckTicks = 0, tick = 0, stuckSpells = 0;
  while (Date.now() < end) {
    // when the hero is pinned on a hut, sidestep — but alternate WHICH way round, or a hero wedged
    // against the wrong side of a building slides along it for the rest of the fight and the run
    // times out with two archers alive and untouched
    const wiggleDir = stuckTicks >= 3 ? (stuckSpells % 2 === 0 ? 1 : -1) : 0;
    const st = await page.evaluate(([wiggle, weaken]) => {
      const r = window.__warlord.scene.getScene('Raid');
      if (!r || !r.hero || !r.hero.alive || !r.playerInput || !r.scene.isActive()) return null;
      if (weaken) { for (const e of r.enemies) if (e.hp > 1) e.hp = 1; r.hero.hp = r.hero.maxHp; if (r.gate && r.gate.alive && r.gate.hp > 40) r.gate.hp = 40; }
      let best = null, bd = 1e9;
      if (r.gate && r.gate.alive) { best = { x: r.gate.x - 30, y: Math.max(r.gate.rect.top + 10, Math.min(r.gate.rect.bottom - 10, r.hero.y)) }; bd = Math.hypot(best.x - r.hero.x, best.y - r.hero.y); }
      else for (const e of r.enemies) { if (e.onWall || e.dormant) continue; const d = Math.hypot(e.x - r.hero.x, e.y - r.hero.y); if (d < bd) { bd = d; best = e; } }
      if (!best) { r.playerInput.joyX = 0; r.playerInput.joyY = 0; return { enemies: r.enemies.length, x: r.hero.x, y: r.hero.y, idle: true }; }
      let dx = (best.x - r.hero.x) / (bd || 1), dy = (best.y - r.hero.y) / (bd || 1);
      if (wiggle) { const t = dx; dx = -dy * wiggle; dy = t * wiggle; }
      const go = bd > (r.hero.mode === 'bow' ? 150 : 34);
      r.playerInput.joyX = go ? dx : 0; r.playerInput.joyY = go ? dy : 0;
      return { enemies: r.enemies.length, x: r.hero.x, y: r.hero.y, go };
    }, [wiggleDir, weaken]);
    if (!st) break;
    if (st.enemies === 0 && tick > 4) break;
    // standing still to swing at the gate or at a man in reach is not being stuck — only count it
    // when the hero is trying to CLOSE the distance and getting nowhere
    if (st.go && Math.abs(st.x - lastX) < 3 && Math.abs(st.y - lastY) < 3) stuckTicks++; else stuckTicks = 0;
    if (stuckTicks > 8) { stuckTicks = 0; stuckSpells++; }
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
  // bring the place on screen first (a player would drag to it), then tap where it lands
  const pos = await page.evaluate((nid) => { const m = window.__warlord.scene.getScene('Map'); const n = window.__NODES.find(n => n.id === nid); const cam = m.cameras.main; const d = window.__warlord.scale.displayScale.x || 1;
    cam.stopFollow(); cam.centerOn(n.x, n.y); cam.preRender();
    return { x: (cam.x + (n.x - cam.worldView.x) * cam.zoom) / d, y: (cam.y + (n.y - cam.worldView.y) * cam.zoom) / d }; }, id);
  await sleep(120);
  if (touch) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
};
// no hunting parties: clear the field and stop new ones setting out
const noPatrols = (page) => page.evaluate(() => {
  const S = window.__GameState;
  S.hunters = [];
  S.runHunters = () => null;
});
/** March to a place: tap it, read the day cost off its panel, then confirm. */
const marchTo = async (page, id, touch = false) => {
  await tapNode(page, id, touch);
  if (!(await waitPanel(page, 8000))) return false;
  const labels = await page.evaluate(() => window.__warlord.scene.getScene('MapHud').spec.buttons.map(b => b.label));
  const go = labels.find(l => /^(MARCH|RIDE|WALK IN|GO|ENTER|SIEGE|RAID)/.test(l) && /\(\d+d\)/.test(l));
  if (!go) return (await page.evaluate(() => window.__GameState.location)) === id;
  await clickBtn(page, 'MapHud', go.split(' ')[0]);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const at = await page.evaluate(() => window.__GameState.location);
    if (at === id) return true;
    const modal = await page.evaluate(() => { const h = window.__warlord.scene.getScene('MapHud'); return !!(h.panelOpen && h.panelModal); });
    if (modal) return false;
    await sleep(300);
  }
  return false;
};
/** Every fight now opens with one tap: how the warband stands. Answer it and the battle begins. */
const pickFormation = async (page, kind = 'line') => {
  for (let i = 0; i < 40; i++) {
    const waiting = await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); return !!(r && r.awaitingFormation); });
    if (!waiting) return i > 0;
    const hit = await page.evaluate((k) => {
      const hud = window.__warlord.scene.getScene('Hud');
      if (!hud || !hud.children) return false;
      for (const c of hud.children.list) {
        if (c.type !== 'Container') continue;
        const t = c.list.find(x => x.type === 'Text' && x.text === k.toUpperCase());
        if (t) { c.emit('pointerdown', { id: 1 }); c.emit('pointerup', { id: 1 }); return true; }
      }
      return false;
    }, kind);
    if (!hit) await sleep(120);
    await sleep(120);
  }
  return false;
};

async function raidHere(page, expectKind = 'village') {
  await clickBtn(page, 'MapHud', expectKind === 'siege' ? 'SIEGE' : 'RAID');
  check(await waitScene(page, 'Raid'), `${expectKind} battle started`);
  await pickFormation(page);
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
  const fonts = await page.evaluate(() => ({ cinzel: document.fonts.check('700 20px Cinzel'), nunito: document.fonts.check('700 16px "Nunito Sans"') }));
  check(fonts.cinzel && fonts.nunito, `self-hosted fonts loaded (${JSON.stringify(fonts)})`);
  // the title screen must never write a save
  await page.evaluate(() => { window.__GameState.save(); });
  check(!(await page.evaluate(() => window.__GameState.hasSave())), 'title screen cannot create a save by accident');
  // --- M5.2: the fourteen thrones, plus the outlaw
  const civs = await page.evaluate(() => {
    const C = window.__CIVS;
    const ids = Object.keys(C);
    const bad = [];
    for (const id of ids) {
      const c = C[id];
      const roles = c.troops.map(t => t.role);
      if (!c.heroName || !c.backstory || c.backstory.length < 120) bad.push(`${id}: thin backstory`);
      if (roles.filter(r => r === 'line').length !== 1) bad.push(`${id}: not one line unit`);
      if (roles.filter(r => r === 'elite').length !== 1) bad.push(`${id}: not one elite`);
      if (c.troops.length < 3) bad.push(`${id}: too few units`);
      if (c.troops.some(t => t.wage < 1 || t.cost < 10)) bad.push(`${id}: a free man`);
    }
    const sigs = ids.flatMap(id => C[id].troops.map(t => t.signature));
    return { n: ids.length, bad, unique: new Set(sigs).size, sigs: sigs.length,
      weapons: [...new Set(ids.map(i => C[i].weapon))].sort(), leans: [...new Set(ids.map(i => C[i].lean))].sort() };
  });
  check(civs.n === 15 && civs.bad.length === 0, `fifteen starts, each a whole roster (${civs.bad.join('; ') || 'all sound'})`);
  check(civs.unique === civs.sigs, `every unit's signature is its own (${civs.unique}/${civs.sigs})`);
  check(civs.weapons.length >= 2 && civs.leans.length === 3, `the starts differ in kit and lean (${civs.weapons.join('/')}, ${civs.leans.join('/')})`);
  // choosing one puts your camp in your own country and your own people at your back
  const jp = await page.evaluate(() => {
    const S = window.__GameState;
    S.newRun('japan');
    const camp = window.__NODES.find(n => n.id === 'camp');
    return { home: S.home, campT: camp.territory, campName: camp.name,
      troops: S.troops.map(t => t.kind), meter: S.territoryName(), abroad: S.territoryName('rome'),
      atHome: S.access(window.__NODES.find(n => n.territory === 'japan' && n.kind === 'foreign')?.id ?? 'camp') };
  });
  check(jp.home === 'japan' && jp.campT === 'japan' && jp.troops.every(t => t.startsWith('japan_')),
    `a Japanese start camps in Japan with Japanese troops (${jp.campName})`);
  check(jp.meter === '' && jp.abroad !== '', 'your own country needs no naming on the meter, and everyone else does');
  // and a save written before there was a choice is the Borderland Outlaw
  const preChoice = await page.evaluate(() => {
    const S = window.__GameState;
    S.newRun('rome');
    const save = JSON.parse(JSON.stringify(S.toJSON()));
    delete save.civ;
    S.fromJSON(save);
    const camp = window.__NODES.find(n => n.id === 'camp');
    return { civ: S.civ, home: S.home, camp: { x: camp.x, y: camp.y } };
  });
  check(preChoice.civ === 'outlaw' && preChoice.home === 'homeland' && preChoice.camp.x === 3590 && preChoice.camp.y === 1005,
    `an old save is the Borderland Outlaw, camped where it always was (${preChoice.camp.x},${preChoice.camp.y})`);
  // every realm on the chart now has its shops, its rumors and its own elite — including the four
  // across the water, because three of them can be PLAYED and a start needs a country to stand in
  const realms = await page.evaluate(() => {
    const V = window.__REALM_VISITS;
    const withPlaces = [...new Set(window.__NODES.filter(n => n.kind === 'foreign').map(n => n.territory))];
    const missing = withPlaces.filter(r => !V[r]);
    const camp = ['leather', 'round', 'bow'];
    const pointless = Object.keys(V).filter(r => !V[r].forge.items.some(i => !camp.includes(i)));
    return { realms: withPlaces.length, missing, pointless, elites: [...new Set(Object.keys(V).map(r => V[r].army.elitePlural))].length };
  });
  check(realms.missing.length === 0, `every realm with settlements has an army and a market (${realms.realms}; missing: ${realms.missing.join(', ') || 'none'})`);
  check(realms.pointless.length === 0, `every realm's forge sells something your camp does not (${realms.pointless.join(', ') || 'all do'})`);
  // a country across the water says so plainly, and offers no march
  const overseas = await page.evaluate(() => {
    const S = window.__GameState; S.newRun('outlaw');
    const m = window.__warlord.scene.getScene('Map');
    const heian = window.__NODES.find(n => n.id === 'f_japan_heiankyo');
    return { days: m ? m.routeDays(heian.id) : -1, home: S.home };
  });
  check(overseas.days === 0, 'no road runs from the Borderland to Japan');
  // ...but a start born there is standing in it
  const jpHome = await page.evaluate(() => {
    const S = window.__GameState; S.newRun('japan');
    const city = window.__NODES.find(n => n.territory === 'japan' && n.rank === 'city');
    return { access: S.access(city.id), stars: S.stars(city.id), elite: S.foreignInfo(city.id).elitePlural,
      reach: window.__NODES.filter(n => n.kind === 'foreign' && n.territory === 'japan').length };
  });
  check(jpHome.access === 'visit' && jpHome.elite === 'Samurai' && jpHome.reach >= 9,
    `a Japanese start has a Japan to stand in (${jpHome.reach} places, garrisoned by ${jpHome.elite})`);
  await page.evaluate(() => window.__GameState.newRun('outlaw'));
  await clickBtn(page, 'Title', 'NEW');
  check(await waitScene(page, 'CivSelect'), 'new warband asks which of the fifteen you are');
  await page.screenshot({ path: `${OUT}/d-civselect.png` });
  const shown = await page.evaluate(() => {
    const s2 = window.__warlord.scene.getScene('CivSelect');
    const texts = []; const walk = o => { if (o.type === 'Text') texts.push(o.text); if (o.list) o.list.forEach(walk); };
    s2.children.list.forEach(walk);
    return texts;
  });
  check(shown.some(t => /CHOOSE YOUR START/.test(t)) && shown.some(t => /THE BORDERLAND/.test(t)) && shown.some(t => /ROME/.test(t)),
    'the wall of starts is drawn, the outlaw first');
  await clickBtn(page, 'CivSelect', 'BEGIN');
  check(await waitScene(page, 'Settlement'), 'choosing a start opens its camp');
  check((await gs(page)).location === 'camp', 'and you are standing in it');
  await sleep(500);
  await page.screenshot({ path: `${OUT}/d-camp.png` });

  // --- M5.4: the settlement is a street, not a list
  const street = await page.evaluate(() => {
    const s2 = window.__warlord.scene.getScene('Settlement');
    const imgs = s2.children.list.filter(o => o.type === 'Image');
    const texts = []; const walk = o => { if (o.type === 'Text') texts.push(o.text); if (o.list) o.list.forEach(walk); };
    s2.children.list.forEach(walk);
    return { images: imgs.length, hasMarket: texts.includes('MARKET'), hasForge: texts.includes('FORGE'),
      keys: [...new Set(imgs.map(i => i.texture.key.split('_')[0]))] };
  });
  check(street.images >= 5 && street.keys.includes('lm') && street.keys.includes('town2'),
    `the camp is a town seen from above it (${street.images} pieces: ${street.keys.join(', ')})`);
  check(street.hasMarket && street.hasForge, 'with a market in it as well as a forge');
  // and every landmark keeps its own ground, so no two name plates sit on each other
  const plates = await page.evaluate(() => {
    const s2 = window.__warlord.scene.getScene('Settlement');
    const out = []; const walk = o => { if (o.type === 'Text' && o.text === o.text.toUpperCase() && o.text.length > 2 && o.text.length < 12) {
      const b = o.getBounds(); out.push([o.text, b.centerX, b.centerY, b.width, b.height]); } if (o.list) o.list.forEach(walk); };
    s2.children.list.forEach(walk);
    let hits = 0;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      if (Math.abs(out[i][1] - out[j][1]) < (out[i][3] + out[j][3]) / 2 && Math.abs(out[i][2] - out[j][2]) < (out[i][4] + out[j][4]) / 2) hits++;
    }
    return { n: out.length, hits, w: window.__warlord.scale.width,
      offscreen: out.filter(o => o[1] - o[3] / 2 < 0 || o[1] + o[3] / 2 > window.__warlord.scale.width).map(o => o[0]) };
  });
  check(plates.hits === 0 && plates.offscreen.length === 0,
    `${plates.n} name plates, none on top of another and none off the edge (${plates.offscreen.join(',') || 'all in'})`);
  // every culture builds differently
  const arch = await page.evaluate(() => {
    const seen = {};
    for (const civ of ['rome', 'japan', 'arabia', 'viking', 'mongolia', 'egypt', 'outlaw']) {
      window.__GameState.newRun(civ);
      for (const k of ['Map', 'MapHud', 'CivSelect']) window.__warlord.scene.stop(k);
      window.__warlord.scene.stop('Settlement');
      window.__warlord.scene.start('Settlement', { id: 'camp' });
      seen[civ] = window.__ARCH_OF ? window.__ARCH_OF[window.__GameState.home] : null;
    }
    return seen;
  });
  check(new Set(Object.values(arch)).size >= 6, `the cultures build differently (${JSON.stringify(arch)})`);
  await page.evaluate(() => { window.__GameState.newRun('outlaw'); window.__warlord.scene.stop('Settlement');
    window.__warlord.scene.start('Settlement', { id: 'camp' }); });
  await sleep(700);
  // loot off a body, and a market that buys it
  const trade = await page.evaluate(() => {
    const S = window.__GameState;
    S.gold = 200; S.loot = [];
    S.takeLoot('Helm of Somewhere', 80, 'Somewhere');
    const before = S.gold;
    const paid = S.sellLoot(S.loot[0].id, 1);
    return { paid, gold: S.gold, before, left: S.loot.length };
  });
  check(trade.paid > 0 && trade.gold === trade.before + trade.paid && trade.left === 0,
    `anything you own can be sold (a helm for ${trade.paid} gold)`);
  await page.evaluate(() => { window.__GameState.quests = []; window.__GameState.loot = []; window.__GameState.save(); });

  // --- tap buildings
  await clickBtn(page, 'Settlement', 'FORGE');
  check(await waitScene(page, 'Shop'), 'tapping the Forge opens its panel');
  await page.screenshot({ path: `${OUT}/d-forge.png` });
  await clickBtn(page, 'Shop', 'LEAVE');
  check(!(await activeScenes(page)).includes('Shop'), 'shop closed');
  await page.evaluate(() => { window.__GameState.gold = 300; window.__GameState.save(); });
  await clickBtn(page, 'Settlement', 'BARRACKS');
  await waitScene(page, 'Shop');
  // your own camp stocks your own people now, so hire whoever your start's line unit is
  const hire = await page.evaluate(() => {
    const texts = []; const walk = o => { if (o.type === 'Text') texts.push(o.text); if (o.list) o.list.forEach(walk); };
    window.__warlord.scene.getScene('Shop').children.list.forEach(walk);
    const price = texts.find(t => /^\d+ gold$/.test(t));
    return { price, cost: price ? parseInt(price, 10) : 0, roster: Object.values(window.__CIVS.outlaw.troops).map(t => t.name) };
  });
  check(hire.roster.length >= 3, `the camp hires your own people (${hire.roster.join(', ')})`);
  await clickBtn(page, 'Shop', hire.price);
  let s = await gs(page);
  check(s.troops === 4 && s.gold === 300 - hire.cost, `recruited one for ${hire.cost} (${s.troops} troops, ${s.gold} gold)`);
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
  // --- the atlas of empires: zoom out to the whole Earth, tap a locked realm, one of its cities,
  // --- and a sea road; then come back down to your own roads
  const chart = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    return { realms: m.empireLabels.length, places: m.markers.length, capitals: m.markers.filter(k => k.place.kind === 'capital').length,
      zoom: m.cameras.main.zoom, tex: window.__warlord.textures.exists('world_chart_detail') };
  });
  check(chart.realms === 15 && chart.tex && chart.zoom > 1.5, `atlas drawn: ${chart.realms} realms, territory zoom ${chart.zoom.toFixed(2)}`);
  check(chart.places > 100 && chart.capitals === 13, `every empire has places: ${chart.places} settlements, ${chart.capitals} capitals`);
  for (let i = 0; i < 8; i++) await clickBtn(page, 'MapHud', '−');
  const far = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    return { zoom: m.cameras.main.zoom, detail: m.territoryObjects[0].visible, names: m.empireLabels[0].visible,
      crowns: m.markers.filter(k => k.rank === 0 && k.icon.visible).length,
      lesser: m.markers.filter(k => k.rank > 1 && k.icon.visible).length };
  });
  check(far.zoom < 0.4 && !far.detail && far.names && far.lesser === 0,
    `far out: coastlines, realm names and landmarks only (zoom ${far.zoom.toFixed(2)}, ${far.lesser} lesser places)`);
  check(far.crowns >= 12, `capitals anchor the world view even fully zoomed out (${far.crowns} crowns)`);
  // nothing may overlap anything, at any zoom
  const overlaps = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    const worst = [];
    const was = m.cameras.main.zoom;
    for (const z of [0.3, 0.7, 1.2, 2.2, 3.5]) {
      m.setZoom(z);
      const boxes = [];
      for (const k of m.markers) {
        for (const o of [k.icon, k.label, k.stars]) {
          if (!o.visible) continue;
          const b = o.getBounds();
          boxes.push([b.centerX, b.centerY, b.width * 0.92, b.height * 0.92, k.place.name]);
        }
      }
      let hitCount = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          if (boxes[i][4] === boxes[j][4]) continue;
          if (Math.abs(boxes[i][0] - boxes[j][0]) < (boxes[i][2] + boxes[j][2]) / 2 &&
              Math.abs(boxes[i][1] - boxes[j][1]) < (boxes[i][3] + boxes[j][3]) / 2) hitCount++;
        }
      }
      worst.push({ z, shown: boxes.length, hitCount });
    }
    m.setZoom(was);                       // leave the view exactly as we found it
    m.cameras.main.preRender();
    return worst;
  });
  check(overlaps.every(o => o.hitCount === 0),
    `nothing overlaps at any zoom (${overlaps.map(o => `${o.z}x:${o.shown} shown`).join(', ')})`);
  await page.screenshot({ path: `${OUT}/d-world.png` });
  const tapWorld = (pt) => page.evaluate((p) => { const cam = window.__warlord.scene.getScene('Map').cameras.main; const d = window.__warlord.scale.displayScale.x || 1;
    return { x: (cam.x + (p[0] - cam.worldView.x) * cam.zoom) / d, y: (cam.y + (p[1] - cam.worldView.y) * cam.zoom) / d }; }, pt);
  const rome = await page.evaluate(() => window.__REGIONS.find(r => r.id === 'rome').labelAt);
  let at = await tapWorld(rome);
  await page.mouse.click(at.x, at.y);
  await sleep(400);
  const romeSpec = await page.evaluate(() => { const h = window.__warlord.scene.getScene('MapHud'); return { title: h.spec?.title, lines: (h.spec?.lines ?? []).join(' ') }; });
  check(romeSpec.title === 'THE ROMAN EMPIRE' && /Throne: Roma/.test(romeSpec.lines) && /Roma keeps \d+/.test(romeSpec.lines)
    && /keeps \d+ defenders/.test(romeSpec.lines),
    `a realm's card names what it keeps under arms (${romeSpec.title})`);
  await hidePanel(page);
  // a sea road, wherever it actually runs
  const seaPt = await page.evaluate(() => { const r = window.__SEA_ROUTES.find(r => r.id === 'west'); const a = r.pts[1], b = r.pts[2]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; });
  at = await tapWorld(seaPt);
  await page.mouse.click(at.x, at.y);
  await sleep(400);
  const seaSpec = await page.evaluate(() => { const h = window.__warlord.scene.getScene('MapHud'); return h.spec ? h.spec.lines.join(' ') : ''; });
  check(/No ship will carry you/.test(seaSpec), 'a sea road is locked: "no ship will carry you — yet"');
  await hidePanel(page);
  // mid zoom: capitals and cities appear, towns and villages stay hidden
  const mid = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    const cap = m.markers.find(k => k.place.name === 'Roma');
    m.setZoom(1.0); m.cameras.main.centerOn(cap.place.x, cap.place.y); m.cameras.main.preRender();
    const d = window.__warlord.scale.displayScale.x || 1, cam = m.cameras.main;
    return { cities: m.markers.filter(k => k.rank === 1 && k.icon.visible).length,
      villages: m.markers.filter(k => k.rank === 3 && k.icon.visible).length,
      detail: m.territoryObjects[0].visible,
      x: (cam.x + (cap.place.x - cam.worldView.x) * cam.zoom) / d, y: (cam.y + (cap.place.y - cam.worldView.y) * cam.zoom) / d };
  });
  check(mid.cities > 8 && mid.villages === 0 && !mid.detail, `mid zoom: ${mid.cities} cities in, villages and roads still out`);
  await page.mouse.click(mid.x, mid.y);
  await sleep(400);
  const placeSpec = await page.evaluate(() => { const h = window.__warlord.scene.getScene('MapHud'); return { title: h.spec?.title, lines: (h.spec?.lines ?? []).join(' ') }; });
  check(placeSpec.title === 'ROMA' && /throne of The Roman Empire/.test(placeSpec.lines), `tapping a locked city names it (${placeSpec.title})`);
  await hidePanel(page);
  await page.screenshot({ path: `${OUT}/d-empires.png` });
  // --- M5.1: the chart finished
  const plate = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    const S = window.__GameState;
    // only a place you can actually march on carries a rating; the realms across the water do not
    const reachable = new Set(window.__NODES.filter(n => n.kind === 'foreign').map(n => n.name));
    const rated = m.markers.filter(k => k.stars.text.length === 5).length;
    const missing = m.markers.filter(k => reachable.has(k.place.name) && k.stars.text.length !== 5).map(k => k.place.name);
    const spurious = m.markers.filter(k => !reachable.has(k.place.name) && k.stars.text).map(k => k.place.name);
    return {
      creatures: typeof window.__SEA_CREATURES,
      rated, markers: m.markers.length, want: reachable.size, missing, spurious,
      roma: S.stars('f_rome_roma'), ashford: S.stars('ashford'),
      romaN: S.protection('f_rome_roma'), ashfordN: S.protection('ashford'),
      kushVillage: S.protection(window.__NODES.find(n => n.territory === 'kush' && n.rank === 'village').id),
    };
  });
  check(plate.creatures === 'undefined', 'the oceans carry no creatures at all');
  check(plate.missing.length === 0 && plate.spurious.length === 0,
    `every settlement you can march on carries a rating, and only those (${plate.rated}/${plate.want} of ${plate.markers} plates)`);
  check(plate.romaN === 5 && plate.ashfordN === 1 && plate.kushVillage < plate.romaN,
    `the stars rank the world honestly (Ashford ${plate.ashford}, Roma ${plate.roma})`);
  // the two views the designer wants to judge without hunting for them
  for (const [name, zoom, at] of [['d-kush', 3, [3210, 1720]], ['d-mediterranean', 2.2, [2820, 1230]],
    ['d-europe', 1.0, [2950, 1150]], ['d-americas', 0.9, [800, 1300]]]) {
    await page.evaluate(([z, a]) => {
      const m = window.__warlord.scene.getScene('Map');
      m.cameras.main.stopFollow();
      m.setZoom(z); m.cameras.main.centerOn(a[0], a[1]); m.cameras.main.preRender();
    }, [zoom, at]);
    await sleep(1400);     // the chart repaints once the view settles
    await page.screenshot({ path: `${OUT}/${name}.png` });
  }
  await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); m.zoomToTerritory(); });
  await sleep(300);

  // --- controls: pinch, double click, LOCATE, and no edge scrolling
  await noPatrols(page);
  const wheelAt = async (dy, ctrl) => page.evaluate(([d, c]) => {
    const cv = window.__warlord.canvas;
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: d, ctrlKey: c, clientX: cv.clientWidth / 2, clientY: cv.clientHeight / 2, bubbles: true, cancelable: true }));
  }, [dy, ctrl]);
  const zoomNow = () => page.evaluate(() => window.__warlord.scene.getScene('Map').cameras.main.zoom);
  const z0 = await zoomNow();
  await wheelAt(-120, true); await sleep(150);
  const zIn = await zoomNow();
  check(zIn > z0, `trackpad pinch out zooms IN (${z0.toFixed(3)} -> ${zIn.toFixed(3)})`);
  await wheelAt(120, true); await wheelAt(120, true); await sleep(150);
  const zOut = await zoomNow();
  check(zOut < zIn, `trackpad pinch in zooms OUT (${zIn.toFixed(3)} -> ${zOut.toFixed(3)})`);

  // a double click zooms toward the pointer and must NEVER offer or start a march
  await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); m.setZoom(1.2); m.cameras.main.centerOn(3590, 1005); m.cameras.main.preRender(); });
  await sleep(200);
  const beforeDbl = await page.evaluate(() => { const S = window.__GameState; const m = window.__warlord.scene.getScene('Map');
    return { zoom: m.cameras.main.zoom, day: S.day, pos: { ...S.pos } }; });
  await page.mouse.dblclick(720, 520);
  await sleep(500);
  const afterDbl = await page.evaluate(() => { const S = window.__GameState; const m = window.__warlord.scene.getScene('Map'); const h = window.__warlord.scene.getScene('MapHud');
    return { zoom: m.cameras.main.zoom, day: S.day, pos: { ...S.pos }, panel: h.spec?.title ?? null,
      plan: m.planLine.commandBuffer.length, traveling: m.traveling }; });
  check(afterDbl.zoom > beforeDbl.zoom, `double click zooms in (${beforeDbl.zoom.toFixed(2)} -> ${afterDbl.zoom.toFixed(2)})`);
  check(afterDbl.panel === null && afterDbl.plan === 0 && !afterDbl.traveling,
    `double click never offers a march (panel ${afterDbl.panel}, ${afterDbl.plan} plan strokes)`);
  check(afterDbl.day === beforeDbl.day && afterDbl.pos.x === beforeDbl.pos.x && afterDbl.pos.y === beforeDbl.pos.y,
    'double click never moves the warband');

  // LOCATE flies the camera to the warband and the game keeps running
  await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); m.cameras.main.centerOn(900, 2400); m.cameras.main.preRender(); });
  await sleep(200);
  const locateBtn = await buttonPos(page, 'MapHud', '⌖');
  check(!!locateBtn, 'the LOCATE button is on screen');
  if (locateBtn) {
    await page.mouse.click(locateBtn.x, locateBtn.y);
    await sleep(900);
    const home = await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); const cam = m.cameras.main;
      return { dx: Math.abs(cam.midPoint.x - m.token.x), dy: Math.abs(cam.midPoint.y - m.token.y), fps: window.__warlord.loop.actualFps }; });
    check(home.dx < 40 && home.dy < 40, `LOCATE centres on the warband (off by ${Math.round(home.dx)},${Math.round(home.dy)})`);
    check(home.fps > 5, `the app is still running after LOCATE (${Math.round(home.fps)} fps)`);
    // pressing it again while it is already flying must not stack a second flight
    await page.mouse.click(locateBtn.x, locateBtn.y);
    await page.mouse.click(locateBtn.x, locateBtn.y);
    await sleep(900);
    const twice = await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); const cam = m.cameras.main;
      return { dx: Math.abs(cam.midPoint.x - m.token.x), fps: window.__warlord.loop.actualFps }; });
    check(twice.dx < 40 && twice.fps > 5, `LOCATE twice in a row is still fine (${Math.round(twice.fps)} fps)`);
  }

  // edge scrolling is gone: a mouse parked at the edge moves nothing
  const edgeBefore = await page.evaluate(() => { const c = window.__warlord.scene.getScene('Map').cameras.main; return { x: c.scrollX, y: c.scrollY }; });
  await page.mouse.move(1438, 600);
  await sleep(700);
  const edgeAfter = await page.evaluate(() => { const c = window.__warlord.scene.getScene('Map').cameras.main; return { x: c.scrollX, y: c.scrollY }; });
  check(edgeBefore.x === edgeAfter.x && edgeBefore.y === edgeAfter.y, 'a mouse resting at the screen edge no longer scrolls the map');

  // the road-leg UI is gone: no "3d" written along a road any more
  const dayLabels = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    return m.children.list.filter(c => c.type === 'Text' && /^\d+d$/.test(c.text)).length;
  });
  check(dayLabels === 0, `no day labels drawn on roads (${dayLabels} found)`);

  // --- the foreign gates
  const gates = await page.evaluate(() => {
    const foreign = window.__NODES.filter(n => n.kind === 'foreign');
    return { count: foreign.length, realms: [...new Set(foreign.map(n => n.territory))].sort(),
      capitals: foreign.filter(n => n.capital).length };
  });
  check(gates.count >= 25 && gates.capitals >= 9,
    `${gates.count} foreign gates open in ${gates.realms.length} realms (${gates.capitals} thrones)`);
  // every realm on Earth has settlements now; what separates them is whether a ROAD reaches them
  const overseasReach = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    const out = {};
    for (const r of ['japan', 'aztecs', 'inca', 'viking', 'rome']) {
      const n = window.__NODES.find(x => x.territory === r && x.rank === 'capital');
      out[r] = n ? m.routeDays(n.id) : -1;
    }
    return out;
  });
  check(overseasReach.japan === 0 && overseasReach.aztecs === 0 && overseasReach.inca === 0
    && overseasReach.viking > 0 && overseasReach.rome > 0,
    `no road crosses the water (Japan ${overseasReach.japan}d, the Aztecs ${overseasReach.aztecs}d) while Uppsala is ${overseasReach.viking}d away`);
  const romaDays = await page.evaluate(() => window.__warlord.scene.getScene('Map').routeDays('f_rome_roma'));
  check(romaDays >= 21, `Rome is honestly far: ${romaDays} days' march from the camp`);
  // every gate must be a place the march actually ENDS on — Rome's own point is on a cell this map
  // calls sea, and Korinthos, Kawa and Abdju each stand a few units from a bigger neighbour
  const landsOn = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    const bad = [];
    for (const n of window.__NODES.filter(x => x.kind === 'foreign')) {
      const r = m.planTo(n.id);
      if (!r) continue;                       // across water: no road reaches it, which is its own check
      const end = r.points[r.points.length - 1];
      const at = m.constructor.placeAt(end[0], end[1]);
      if (!at || at.id !== n.id) bad.push(`${n.name} -> ${at ? at.name : 'open country'}`);
    }
    return bad;
  });
  check(landsOn.length === 0, `every foreign gate is a place a march lands on${landsOn.length ? ': ' + landsOn.join(', ') : ''}`);
  // the camera must sit below the status bar on the FIRST map of a page load, not just later ones
  const fitted = await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); const h = window.__warlord.scene.getScene('MapHud');
    return { cam: Math.round(m.cameras.main.y), bar: Math.round(h.mapTop) }; });
  check(Math.abs(fitted.cam - fitted.bar) < 2, `the map starts below the status bar (camera ${fitted.cam}, bar ${fitted.bar})`);
  // a double click that lands on an open panel's MARCH button takes the march back instead of walking
  await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); m.setZoom(1.5); m.cameras.main.centerOn(3400, 1100); m.cameras.main.preRender(); });
  await sleep(500);
  await page.mouse.click(700, 300);
  await sleep(500);
  const marchBtn = await buttonPos(page, 'MapHud', 'MARCH');
  const preDbl = await page.evaluate(() => ({ day: window.__GameState.day, x: window.__GameState.pos.x }));
  if (marchBtn) { await page.mouse.dblclick(marchBtn.x, marchBtn.y); await sleep(1300); }
  const postDbl = await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map');
    return { day: window.__GameState.day, x: window.__GameState.pos.x, traveling: m.traveling }; });
  check(!!marchBtn && postDbl.day === preDbl.day && postDbl.x === preDbl.x && !postDbl.traveling,
    'a double click on the MARCH button takes the march back rather than walking');
  await hidePanel(page);

  // --- the world is hot: every foreign settlement can be attacked
  const war = await page.evaluate(() => {
    const S = window.__GameState;
    const foreign = window.__NODES.filter(n => n.kind === 'foreign');
    const byRank = {};
    for (const n of foreign) byRank[n.rank] = (byRank[n.rank] ?? 0) + 1;
    const sample = (id) => { const i = S.foreignInfo(id); return { total: i.total, elites: i.elites, stat: +i.statMult.toFixed(2), elite: i.elitePlural }; };
    const fringe = foreign.find(n => n.territory === 'rus' && n.rank === 'village');
    return { count: foreign.length, byRank,
      village: sample(fringe.id), villageName: fringe.name,
      romaTown: sample(foreign.find(n => n.territory === 'rome' && n.rank === 'town').id),
      roma: sample('f_rome_roma'), kush: sample('f_kush_meroe'),
      max: Math.max(...foreign.map(n => S.foreignInfo(n.id).total)) };
  });
  check(war.count >= 110 && war.byRank.village >= 15 && war.byRank.capital >= 13,
    `every settlement of every realm is a place you can stand: ${war.count} (${JSON.stringify(war.byRank)})`);
  check(war.village.total < war.romaTown.total && war.romaTown.total < war.roma.total,
    `garrisons climb: a Rus village ${war.village.total}, a Roman town ${war.romaTown.total}, Roma ${war.roma.total}`);
  check(war.kush.total < war.roma.total && war.kush.stat < war.roma.stat,
    `a realm's own strength counts: Meroe ${war.kush.total} at x${war.kush.stat}, Roma ${war.roma.total} at x${war.roma.stat}`);
  check(war.max <= 58, `no battle fields more men than a phone can draw (worst ${war.max})`);
  // a village fields a few of its country's own men; a throne fields a wall of them (checked below)
  check(war.village.elites >= 1 && /\w/.test(war.village.elite), `realms field their own men (${war.village.elites} ${war.village.elite})`);
  // no panel anywhere may still forbid a war
  const locks = await page.evaluate(() => {
    const bad = [];
    const S = window.__GameState;
    for (const r of window.__REGIONS) {
      const v = window.__REALM_VISITS ? window.__REALM_VISITS[r.id] : null;
      if (!v) continue;
      const text = [v.enter, v.army.armyNote, v.army.capitalWarning, v.army.villageNote, v.army.eliteNote].join(' ');
      if (/later age|not yet|you cannot|beyond a|beyond you/i.test(text)) bad.push(r.id);
    }
    return bad;
  });
  check(locks.length === 0, `no realm still says war comes later (${locks.join(', ') || 'none'})`);

  // walk into Rus, the nearest realm, and be a customer in Kiev
  await page.evaluate(() => { const S = window.__GameState; const n = window.__NODES.find(k => k.id === 'f_rus_kiev');
    S.pos = { x: n.x + 60, y: n.y + 60 }; S.location = ''; S.save(); });
  await sleep(200);
  check(await marchTo(page, 'f_rus_kiev'), 'marched into Rus and reached Kiev');
  await waitPanel(page, 6000);
  const inRus = await page.evaluate(() => { const S = window.__GameState; const h = window.__warlord.scene.getScene('MapHud');
    return { territory: S.territory, meter: S.territoryInfamy(), name: S.territoryName(), label: h.infamyLabel.text,
      buttons: (h.spec?.buttons ?? []).map(b => b.label), lines: (h.spec?.lines ?? []).join(' ') }; });
  check(inRus.territory === 'rus' && inRus.meter === 0 && /RUS INFAMY 0/.test(inRus.label),
    `a new realm opens its own meter at nothing (${inRus.label.slice(0, 34)})`);
  check(inRus.buttons.includes('ENTER THE CITY'), `Kiev opens its gates (${inRus.buttons.join(', ')})`);
  check(/\d+ defenders: \d+ militia/.test(inRus.lines) && !/later age/.test(inRus.lines),
    'and prints exactly what is standing in the square');
  check(inRus.buttons.some(b => /^ASSAULT \(\d+\)/.test(b)), `Kiev can be attacked (${inRus.buttons.join(', ')})`);

  await clickBtn(page, 'MapHud', 'ENTER');
  check(await waitScene(page, 'Settlement'), 'entered Kiev as a foreigner');
  const kiev = await page.evaluate(() => {
    // the building cards keep their text inside containers, so walk the tree
    const texts = [];
    const walk = (o) => { if (o.type === 'Text') texts.push(o.text); if (o.list) o.list.forEach(walk); };
    window.__warlord.scene.getScene('Settlement').children.list.forEach(walk);
    return { texts, sub: texts.find(t => /foreigner here/i.test(t)) ?? '' };
  });
  check(/stranger's prices/.test(kiev.sub), `a foreigner pays a foreigner's price (${kiev.sub.slice(0, 48)})`);
  check(kiev.texts.some(t => /^locked — /.test(t)), 'the barracks stays shut to a foreigner');
  check(kiev.texts.some(t => /FORGE/.test(t)) && kiev.texts.some(t => /rumor/.test(t)), 'the forge and the inn are open to a foreigner');
  // and the inn abroad talks about the country you are standing in, not about home
  await page.evaluate(() => window.__warlord.scene.getScene('Settlement').open('inn'));
  await sleep(900);
  const innAbroad = await page.evaluate(() => {
    const texts = [];
    const walk = (o) => { if (o.type === 'Text') texts.push(o.text); if (o.list) o.list.forEach(walk); };
    window.__warlord.scene.getScene('Shop').children.list.forEach(walk);
    return texts.join(' ~ ');
  });
  check(/KORCHMA/.test(innAbroad) && /his own country/.test(innAbroad) && /stranger's prices/.test(innAbroad),
    'the foreign inn is named, and sells its own realm');
  await page.evaluate(() => { const s = window.__warlord.scene.getScene('Settlement'); s.scene.stop('Shop'); s.scene.resume(); });
  await sleep(300);

  // the whole point of the milestone: take a foreign village, and the country remembers
  {
    const before = await page.evaluate(() => ({ ...window.__GameState.realmInfamy }));
    const fought = await page.evaluate(async () => {
      const S = window.__GameState;
      // a ROMAN village: Legionaries, so the shield rule below is a real assertion and not a tautology
      const v = window.__NODES.find(n => n.territory === 'rome' && n.rank === 'village');
      S.pos = { x: v.x, y: v.y }; S.location = v.id;
      const cfg = window.__battles.foreignBattle(v.id);
      for (const k of ['Settlement', 'Shop', 'Map', 'MapHud']) window.__warlord.scene.stop(k);
      window.__warlord.scene.start('Raid', cfg);
      return { id: v.id, name: v.name, elite: cfg.elite.kind, champion: !!cfg.elite.champion,
        total: cfg.defenders.militia + cfg.defenders.archers + cfg.defenders.captains + cfg.elite.count + (cfg.elite.champion ? 1 : 0) };
    });
    check(await waitScene(page, 'Raid'), `assaulted ${fought.name}, a village of Rome`);
    await pickFormation(page);
    const spawned = await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid');
      const k = {}; for (const e of r.enemies) k[e.kind] = (k[e.kind] ?? 0) + 1;
      return { n: r.enemies.length, k, tinted: r.enemies.filter(e => e.liveryTint !== null).length }; });
    check(spawned.n === fought.total && spawned.k[fought.elite] > 0
      && spawned.tinted === spawned.k[fought.elite] + (fought.champion ? 1 : 0),
      `their own men stand with the militia: ${JSON.stringify(spawned.k)}`);
    // a shieldman turns half of everything until he swings; an axeman does not
    const shield = await page.evaluate(() => {
      const r = window.__warlord.scene.getScene('Raid');
      const e = r.enemies.find(x => x.kind === 'shieldman');
      const m = r.enemies.find(x => x.kind === 'militia');
      if (!e || !m) return null;
      e.windingUp = false; const guarded = e.mitigate(20);
      e.windingUp = true; const open = e.mitigate(20);
      e.windingUp = false;
      return { guarded, open, militia: m.mitigate(20) };
    });
    check(!!shield && shield.guarded < shield.open && shield.open === 20 && shield.militia === 20,
      `a shield turns a blow until he swings (${shield && shield.guarded} with it up, ${shield && shield.open} mid-swing)`);
    // win it outright and take the loot
    await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); r.hero.maxHp = 9999; r.hero.hp = 9999; });
    for (let i = 0; i < 120; i++) {
      const done = await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid');
        if (!r || !r.scene.isActive()) return true;
        const alive = r.enemies.filter(e => e.alive);
        for (const e of alive) e.damage(9999, r.hero.x, r.hero.y, 0);
        return alive.length === 0; });
      if (done) break;
      await sleep(120);
    }
    check(await waitScene(page, 'Result', 9000), 'the village falls');
    await clickBtn(page, 'Result', 'LEAVE');
    await waitScene(page, 'Map');
    await sleep(900);
    const after = await page.evaluate(() => { const S = window.__GameState;
      return { rome: S.realmInfamy.rome ?? 0, access: S.access('f_rome_roma'), tier: S.tierIn('rome'),
        why: S.closedReason('f_rome_roma'), rus: S.realmInfamy.rus ?? 0 }; });
    check(after.rome > (before.rome ?? 0) && after.access === 'closed' && after.tier >= 1,
      `Rome remembers: score ${after.rome}, gates ${after.access}, hunting at tier ${after.tier}`);
    check(after.rus === (before.rus ?? 0), 'and the country next door does not care');
    check(/made war in this country/.test(after.why), 'and says why its gates are shut');
    // put the run back where the rest of the suite expects it
    await page.evaluate(() => { const S = window.__GameState; S.realmInfamy = {}; S.hunters = [];
      const c = window.__NODES.find(n => n.id === 'camp'); S.pos = { x: c.x, y: c.y }; S.location = 'camp'; S.save();
      const m = window.__warlord.scene.getScene('Map'); m.token.setPosition(S.pos.x, S.pos.y - 12); m.zoomToTerritory(); });
    await hidePanel(page);
    await sleep(400);
  }

  // --- raid Ashford and just leave
  // --- M5.5 A: legend is command
  const ladder = await page.evaluate(() => {
    const S = window.__GameState;
    const T = window.__TROOP_CAPS;
    const caps = [];
    const was = S.infamy, wasRealm = { ...S.realmInfamy }, wasSteppe = S.steppeInfamy;
    S.realmInfamy = {}; S.steppeInfamy = 0;
    for (const at of [0, 15, 45, 110, 220, 400]) { S.infamy = at; caps.push({ at, tier: S.highestTierName, cap: S.troopCap }); }
    S.infamy = was; S.realmInfamy = wasRealm; S.steppeInfamy = wasSteppe;
    return { caps, tiers: T ? T.length : 0 };
  });
  check(ladder.caps.map(c => c.cap).join(',') === '6,10,16,24,32,40',
    `the cap climbs with the name (${ladder.caps.map(c => `${c.tier} ${c.cap}`).join(' · ')})`);

  // --- M5.3: armies of the world
  const army = await page.evaluate(() => {
    const C = window.__CIVS; const ids = Object.keys(C);
    const abilities = {};
    for (const id of ids) for (const t of C[id].troops) abilities[t.ability] = (abilities[t.ability] ?? 0) + 1;
    const S = window.__GameState;
    const wage = S.wagesPerDay;
    return { abilities, kinds: Object.keys(abilities).length, wage, troops: S.troops.length,
      flat: S.troops.length * 2 };
  });
  check(army.kinds >= 7, `the rosters field ${army.kinds} kinds of behaviour (${JSON.stringify(army.abilities)})`);
  check(army.wage !== army.flat, `every man is paid his own wage (${army.wage} a day for ${army.troops}, not a flat ${army.flat})`);
  // --- M5.5 E: a hunt is weather, not a metronome
  const hunts = await page.evaluate(() => {
    const S = window.__GameState;
    const keep = JSON.parse(JSON.stringify(S.toJSON()));
    // the run stubs runHunters out so battles are predictable; this is the one check that needs the
    // real thing, so drop the stub (it is an own property over the prototype) and put it back after
    const stub = Object.prototype.hasOwnProperty.call(S, 'runHunters') ? S.runHunters : null;
    if (stub) delete S.runHunters;
    S.newRun('outlaw'); S.hunters = []; S.huntQuiet = {};
    S.infamy = 20;                                  // Bandit: nobody bothers yet
    let spawned = 0;
    for (let d = 0; d < 40; d++) { S.runHunters(1); spawned = Math.max(spawned, S.hunters.length); }
    const atBandit = spawned;
    S.infamy = 60; S.hunters = []; spawned = 0;     // Raider: now they come
    for (let d = 0; d < 200; d++) { S.runHunters(1); spawned = Math.max(spawned, S.hunters.length); }
    const atRaider = spawned;
    const why = { tier: S.tierIn(), territory: S.territory, chance: S.patrolChance, at: { ...S.pos },
      quiet: S.huntQuiet[S.territory] ?? null, day: S.day, home: S.home };
    // and putting one down buys quiet
    S.huntQuieted('homeland');
    const quietUntil = S.huntQuiet.homeland - S.day;
    S.hunters = [];
    let duringGrace = 0;
    for (let d = 0; d < 4; d++) { S.runHunters(1); duringGrace = Math.max(duringGrace, S.hunters.length); }
    if (stub) S.runHunters = stub;
    S.fromJSON(keep);
    return { atBandit, atRaider, quietUntil, duringGrace, why };
  });
  check(hunts.atBandit === 0, `nobody hunts a bandit (${hunts.atBandit} parties in 40 days)`);
  check(hunts.atRaider >= 1 && hunts.atRaider <= 1, `a raider is hunted, by one party at a time (${hunts.atRaider}; ${JSON.stringify(hunts.why)})`);
  check(hunts.quietUntil === 5 && hunts.duringGrace === 0,
    `putting a party down buys ${hunts.quietUntil} days of quiet (${hunts.duringGrace} came in them)`);

  // --- M5.5 B: what a garrison is made of, what your men carry, and what you pay them
  const depth = await page.evaluate(() => {
    const S = window.__GameState;
    const keep = JSON.parse(JSON.stringify(S.toJSON()));
    const at = (t, pick) => { const n = window.__NODES.find(pick); return n ? { name: n.name, stars: S.protection(n.id), ...S.foreignInfo(n.id) } : null; };
    const fringe = at('rome', n => n.territory === 'rome' && n.fringe);
    const cap = at('rome', n => n.id === 'f_rome_roma');
    // gear and pay
    S.gearTier = 0; S.payRate = 'full';
    const bare = { atk: S.gear.attack, wage: S.wagesPerDay, dmg: S.moraleDamage };
    S.gearTier = 3; S.payRate = 'double';
    const armed = { atk: S.gear.attack, wage: S.wagesPerDay, dmg: S.moraleDamage };
    S.fromJSON(keep);
    return { fringe: { m: fringe.militia, e: fringe.elites, champion: fringe.champion, stars: fringe.stars },
      cap: { m: cap.militia, e: cap.elites, champion: cap.champion, stars: cap.stars }, bare, armed };
  });
  check(depth.fringe.e === 0 && !depth.fringe.champion && depth.cap.e > depth.cap.m * 0.8 && depth.cap.champion,
    `a hamlet is farmers (${depth.fringe.m}m ${depth.fringe.e}e) and a throne is an army (${depth.cap.m}m ${depth.cap.e}e + champion)`);
  check(depth.armed.atk > depth.bare.atk && depth.armed.wage === depth.bare.wage * 2 && depth.armed.dmg > depth.bare.dmg,
    `gear and pay are levers (+${depth.armed.atk} attack armed, ${depth.armed.wage} a day at double)`);

  // --- M5.5 C: take a country and wear its crown
  const crown = await page.evaluate(() => {
    const S = window.__GameState;
    const keep = JSON.parse(JSON.stringify(S.toJSON()));
    S.newRun('outlaw');
    S.realmInfamy.greece = 20;
    const before = { greece: S.realmInfamy.greece };
    for (const n of window.__NODES.filter(x => x.territory === 'rome' && (x.rank === 'capital' || x.rank === 'city'))) {
      S.settlement(n.id).occupied = true;
    }
    const won = S.checkFealty('rome');
    const all = window.__NODES.filter(n => n.territory === 'rome');
    const out = { won, title: S.title, rules: S.rules('rome'), score: S.realmInfamy.rome ?? 0,
      held: all.filter(n => S.settlement(n.id).occupied).length, of: all.length,
      greeceBefore: before.greece, greeceAfter: S.realmInfamy.greece,
      tribute: S.tributePerDay, access: S.access('f_rome_roma') };
    S.fromJSON(keep);
    return out;
  });
  check(crown.won && crown.held === crown.of && crown.score === 0,
    `taking the throne and the cities takes the country (${crown.held}/${crown.of} bend the knee, the score clears)`);
  check(/Imperator of/.test(crown.title), `and they call you what Rome calls its own (${crown.title})`);
  check(crown.greeceAfter > crown.greeceBefore, `other thrones notice (Greece ${crown.greeceBefore} → ${crown.greeceAfter})`);
  check(crown.tribute > 100 && crown.access === 'occupied', `a country you rule pays you (${crown.tribute} a day)`);

  // --- M5.5 F: every start has a plausible first raid at home
  const firstRaids = await page.evaluate(() => {
    const S = window.__GameState;
    const m = window.__warlord.scene.getScene('Map');
    const out = {};
    // this walks every start in turn, so put the real run back exactly as it was afterwards
    const keep = JSON.parse(JSON.stringify(S.toJSON()));
    for (const civ of Object.keys(window.__CIVS)) {
      S.newRun(civ);
      const near = window.__NODES.filter(n => (n.kind === 'foreign' || n.kind === 'village')
        && Math.hypot(n.x - S.pos.x, n.y - S.pos.y) < 460);
      let easy = 0;
      for (const n of near) { const d = m.routeDays(n.id); if (d > 0 && d <= 12 && S.protection(n.id) === 1) easy++; }
      // and it must be able to walk to its own country: a region outline drawn round Italy also
      // encloses Corsica, and a camp put on Corsica is a Roman start that can never reach Rome.
      const own = window.__NODES.filter(n => n.territory === S.home && n.name && n.id !== 'camp');
      const stranded = own.filter(n => m.routeDays(n.id) <= 0 && n.name !== 'Reykjavik').map(n => n.name);
      out[civ] = { easy, stranded };
    }
    S.fromJSON(keep);
    return out;
  });
  const thin = Object.entries(firstRaids).filter(([, v]) => v.easy < 2).map(([c, v]) => `${c}:${v.easy}`);
  check(thin.length === 0, `every start has two or more one-star places in reach (${thin.join(', ') || 'all fifteen'})`);
  const cutOff = Object.entries(firstRaids).filter(([, v]) => v.stranded.length)
    .map(([c, v]) => `${c} cannot reach ${v.stranded.join('/')}`);
  check(cutOff.length === 0, `every start can march to its own country (${cutOff.join('; ') || 'all fifteen'})`);

  // --- no battle map ships enclosed, split, or with the warband on both sides of a wall
  const maps = await page.evaluate(async () => {
    const L = await import('/src/world/Layouts.ts');
    const C = await import('/src/world/LayoutCheck.ts');
    const bad = [], sieges = [];
    for (const id of Object.keys(L.LAYOUTS)) {
      const l = L.LAYOUTS[id];
      for (const walls of (l.palisade ? [false, true] : [false])) {
        const r = C.prepare(l, walls, walls ? L.palisadeFor(l) : []);
        const posts = C.allPosts({ ...l, posts: r.posts });
        const v = C.inspect(l, r.obstacles, r.spawn, posts);
        const walk = C.walkFrom(l, r.obstacles, r.spawn);
        const aim = r.gate ?? { x: posts.reduce((n, p) => n + p.x, 0) / posts.length, y: posts.reduce((n, p) => n + p.y, 0) / posts.length };
        const stands = C.warbandPosts(r.spawn, aim, 8,
          (x, y) => x > 24 && y > 24 && x < l.w - 24 && y < l.h - 24 && walk.at(x, y));
        const split = stands.filter(q => !walk.at(q.x, q.y)).length;
        const p = l.palisade;
        const inside = walls && p && r.spawn.x > p.x0 && r.spawn.x < p.x1 && r.spawn.y > p.y0 && r.spawn.y < p.y1;
        if (!v.ok) bad.push(`${id}${walls ? '+walls' : ''}: ${v.strandedPosts.length} defenders / ${v.strandedBuildings} buildings cut off`);
        if (split) bad.push(`${id}${walls ? '+walls' : ''}: ${split} troops spawn cut off`);
        if (inside) bad.push(`${id}+walls: warband spawns inside the ring`);
        if (walls && r.gate) sieges.push(`${id} (${r.repaired})`);
        if (walls && r.repaired === 'walls-dropped') bad.push(`${id}+walls: could not be made walkable at all`);
      }
    }
    return { bad, sieges };
  });
  check(maps.bad.length === 0, `every battle map is walkable, and the warband lands on one side of the wall (${maps.bad.join('; ') || 'all twelve'})`);
  check(maps.sieges.length >= 1, `a village that has genuinely closed its wall is a siege with a gate to break (${maps.sieges.join(', ') || 'none'})`);

  // --- the quest board only ever offers work you can walk to, and says how far
  const board = await page.evaluate(async () => {
    const N = await import('/src/world/Notices.ts');
    const bad = [], seen = [];
    for (const n of window.__NODES.filter(x => x.name && x.kind !== 'cross' && x.kind !== 'waypoint').slice(0, 80)) {
      const q = N.noticeFor(n.id);
      if (!q || q.kind !== 'deliver') continue;
      seen.push(q);
      const to = window.__NODES.find(x => x.id === q.to);
      if (!to) { bad.push(`${q.from}: names a place that is not on the chart`); continue; }
      if (!q.days || q.days < 3 || q.days > 12) bad.push(`${q.from} → ${to.name}: ${q.days} days`);
    }
    return { n: seen.length, bad: bad.slice(0, 4) };
  });
  check(board.n >= 10 && board.bad.length === 0,
    `every job on a board is a real place, reachable, three to twelve days out (${board.n} checked${board.bad.length ? ': ' + board.bad.join('; ') : ''})`);

  // --- an old save pointing at somewhere unreachable is re-pointed, not left broken
  const migrated = await page.evaluate(() => {
    const S = window.__GameState;
    const keep = JSON.parse(JSON.stringify(S.toJSON()));
    S.quests = [{ id: 9001, kind: 'deliver', to: 'f_japan_kagoshima', text: 'a dead man\u2019s ring to Kagoshima', reward: 90, from: 'Ashford' }];
    const fixed = S.repairQuests();
    const q = S.quests[0];
    const to = window.__NODES.find(x => x.id === q.to);
    const m = window.__warlord.scene.getScene('Map');
    const reach = to ? m.routeDays(to.id) : 0;
    const out = { fixed, to: to && to.name, reach, text: q.text };
    S.fromJSON(keep);
    return out;
  });
  check(migrated.fixed === 1 && migrated.reach > 0 && migrated.text.includes(migrated.to),
    `a job pointing somewhere no road reaches is re-pointed (now ${migrated.to}, ${migrated.reach}d, "${migrated.text}")`);
  // --- losing costs, and it stays lost
  const beaten = await page.evaluate(() => {
    const S = window.__GameState;
    const keep = JSON.parse(JSON.stringify(S.toJSON()));
    S.gold = 400;
    const before = { gold: S.gold, day: S.day, troops: S.troops.length };
    const dead = S.troops.slice(0, 2).map(t => t.id);
    const names = S.troops.slice(0, 2).map(t => t.name);
    const rep = S.commitDefeat(dead, { kind: 'village', villageId: 'ashford', tier: 1, name: 'Ashford' });
    const stillAlive = S.troops.filter(t => dead.includes(t.id)).length;
    const buried = names.every(n => S.fallen.some(f => f.name === n));
    const out = { before, rep, stillAlive, buried, goldNow: S.gold, dayNow: S.day, at: { x: S.pos.x, y: S.pos.y } };
    S.fromJSON(keep);
    return out;
  });
  check(beaten.stillAlive === 0 && beaten.buried && beaten.rep.fallen.length === 2,
    `the men who fell in a lost fight are dead for good (${beaten.rep.fallen.join(', ')})`);
  check(beaten.rep.goldLost === 200 && beaten.rep.goldLeft >= 25,
    `the victors take half the purse and leave a floor (400 → took ${beaten.rep.goldLost}, left ${beaten.rep.goldLeft})`);
  check(beaten.rep.days >= 3 && beaten.rep.days <= 5 && beaten.dayNow === beaten.before.day + beaten.rep.days,
    `you wake ${beaten.rep.days} days later, and the days really passed (day ${beaten.before.day} → ${beaten.dayNow})`);
  check(!!beaten.rep.wokeAt, `and you wake somewhere friendly (${beaten.rep.wokeAt})`);

  check(await marchTo(page, 'ashford'), 'marched to Ashford');
  let r = await raidHere(page);
  check(r && r.enemies === 11, `Ashford: ${r && r.enemies} defenders`);
  await autoPlay(page, 60);
  await sleep(1800);
  check(await waitScene(page, 'Result'), 'victory result');
  const choices = await page.evaluate(() => window.__warlord.scene.getScene('Result').children.list.filter(c => c.type === 'Container').map(c => c.list.find(t => t.type === 'Text')?.text));
  check(choices.includes('SACK') && choices.includes('OCCUPY') && choices.includes('LEAVE'), `conquest choice offered (${choices.join('/')})`);
  check(!choices.includes('TRY AGAIN') && !choices.includes('FIGHT AGAIN'), 'no battle offers a retry any more');
  await page.screenshot({ path: `${OUT}/d-choice.png` });
  // the phone tab dies right here: the victory must survive a reload
  await page.reload();
  await sleep(1500);
  await clickBtn(page, 'Title', 'CONTINUE');
  await noPatrols(page); // the reload threw away the earlier override
  check(await waitScene(page, 'Result', 6000), 'a won battle reappears as the sack/occupy choice after a reload');
  await sleep(400);
  await clickBtn(page, 'Result', 'LEAVE');
  check(await waitScene(page, 'Map'), 'back on the map');
  await sleep(800);
  s = await gs(page);
  check(s.settlements.ashford?.timesRaided === 1 && s.infamy === 7, `leave: village raided + ruined, infamy ${s.infamy}`);
  await page.screenshot({ path: `${OUT}/d-map-toast.png` });
  const ashSpec = await page.evaluate(() => { const h = window.__warlord.scene.getScene('MapHud'); return h.spec ? { buttons: h.spec.buttons.map(b => b.label), lines: h.spec.lines.join(' ') } : null; });
  check(ashSpec && !ashSpec.buttons.includes('VISIT') && /know your face/.test(ashSpec.lines), `raided village shuts its gates: "${ashSpec && ashSpec.lines.slice(-90)}"`);

  // --- occupy Millbrook
  await hidePanel(page);
  check(await marchTo(page, 'millbrook'), 'marched to Millbrook');
  // --- VISIT as a customer: markup, no recruiting, a rumor at the inn
  await clickBtn(page, 'MapHud', 'VISIT');
  check(await waitScene(page, 'Settlement'), 'visited Millbrook peacefully');
  await sleep(400);
  await page.screenshot({ path: `${OUT}/d-visit.png` });
  // the street writes each building's name and what it is selling as plain text under it
  const street2 = await page.evaluate(() => {
    const out = []; const walk = o => { if (o.type === 'Text') out.push(o.text); if (o.list) o.list.forEach(walk); };
    window.__warlord.scene.getScene('Settlement').children.list.forEach(walk);
    return out;
  });
  check(street2.includes('BARRACKS') && street2.some(t => /^locked — /.test(t)) && street2.includes('INN'),
    `visit street: the barracks stands there locked, the inn is open (${street2.filter(t => t === t.toUpperCase() && t.length > 2 && t.length < 12).join(', ')})`);
  await clickBtn(page, 'Settlement', 'FORGE');
  await waitScene(page, 'Shop');
  const markup = await page.evaluate(() => { const sh = window.__warlord.scene.getScene('Shop'); return { p60: sh.price(60), blurb: sh.children.list.filter(c => c.type === 'Text').map(t => t.text).join(' | ') }; });
  check(markup.p60 === 90 && /visitor prices/.test(markup.blurb), `visitor markup: 60 → ${markup.p60} gold, blurb mentions visitor prices`);
  await page.screenshot({ path: `${OUT}/d-visit-forge.png` });
  await clickBtn(page, 'Shop', 'LEAVE');
  await clickBtn(page, 'Settlement', 'INN');
  await waitScene(page, 'Shop');
  const g0 = (await gs(page)).gold;
  await clickBtn(page, 'Shop', '10 gold');
  const inn = await page.evaluate(() => ({ gold: window.__GameState.gold, heard: window.__GameState.rumorsHeard.length, text: window.__warlord.scene.getScene('Shop').children.list.filter(c => c.type === 'Text').map(t => t.text).join(' | ') }));
  check(inn.gold === g0 - 10 && inn.heard === 1 && /leans in/.test(inn.text), `bought a rumor at the inn (gold ${g0} → ${inn.gold})`);
  await page.screenshot({ path: `${OUT}/d-inn.png` });
  await clickBtn(page, 'Shop', 'LEAVE');
  await clickBtn(page, 'Settlement', 'TO THE MAP');
  await waitScene(page, 'Map');
  await sleep(600);
  if (!(await waitPanel(page, 1500))) await tapNode(page, 'millbrook');
  await sleep(200);
  check(await waitPanel(page, 5000), 'Millbrook panel again');
  r = await raidHere(page);
  await autoPlay(page, 120);
  await sleep(1800);
  await waitScene(page, 'Result');
  if (!(await activeScenes(page)).includes('Result')) console.log('DIAG raid unfinished:', JSON.stringify(await raidState(page)));
  else {
    const btns = await page.evaluate(() => window.__warlord.scene.getScene('Result').children.list.filter(c => c.type === 'Container').map(c => c.list.find(t => t.type === 'Text')?.text));
    if (!btns.includes('OCCUPY')) console.log('DIAG result buttons:', btns.join('/'), JSON.stringify(await gs(page)).slice(0, 300));
  }
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
  check(await marchTo(page, 'camp'), 'marched home broke with 6 mouths to feed');
  s = await gs(page);
  console.log('after the broke trip:', JSON.stringify({ day: s.day, gold: s.gold, unpaid: s.unpaid, deserted: s.deserted, troops: s.troops, tribute: s.tribute, wages: s.wages, loc: s.location, title: await panelTitle(page) }));
  check(s.deserted >= 1 && s.troops < 6, `unpaid troops deserted on the road (${s.deserted} gone, ${s.troops} left)`);
  await page.screenshot({ path: `${OUT}/d-desertion.png` });

  // --- the siege of Kingsport
  await page.evaluate(() => { const S = window.__GameState; S.gold = 500; S.infamy = 20; S.save(); window.__warlord.scene.getScene('Map').refresh(); });
  s = await gs(page);
  check(s.siege, `siege unlocked at ${s.tier}`);
  await hidePanel(page);
  await tapNode(page, 'kingsport');
  check(await waitPanel(page, 5000) && /MARCH \(\d+d\)/.test((await page.evaluate(() => window.__warlord.scene.getScene('MapHud').spec.buttons.map(b => b.label).join(' ')))), 'Kingsport panel previews the march with its day cost before you commit');
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
  check(sc.includes('SACK') && sc.includes('OCCUPY') && sc.includes('LEAVE'), `town: sack, occupy, or leave it to regroup (${sc.join('/')})`);
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
    await pickFormation(page);
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
  await pickFormation(page);
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

  // --- at Raider every unconquered gate shuts
  await page.evaluate(() => { const S = window.__GameState; S.infamy = 45; S.save(); });
  const lock = await page.evaluate(() => ({ grey: window.__GameState.access('greywater'), thorn: window.__GameState.access('thornhill'), king: window.__GameState.access('kingsport') }));
  check(lock.grey === 'closed' && lock.thorn === 'closed' && lock.king === 'occupied', `Raider lockout: ${JSON.stringify(lock)}`);

  // --- the steppe: march to the Border Stones, watch the camps drift, raid one, get hunted, trade at Khoja's
  await page.evaluate(() => { const S = window.__GameState; S.infamy = 20; S.gold = 900; S.location = 'greywater'; S.pendingPath = []; S.save(); const g = window.__warlord; g.scene.stop('MapHud'); g.scene.stop('Map'); g.scene.start('Map'); });
  await waitScene(page, 'Map');
  await sleep(800);
  await noPatrols(page);
  await hidePanel(page);
  const campsBefore = await page.evaluate(() => window.__CAMPS.map(c => window.__campLocation(c)));
  check(await marchTo(page, 'steppe_gate'), 'marched to the Border Stones');
  s = await gs(page);
  check(s.location === 'steppe_gate', `on the steppe (${s.location})`);
  const campsAfter = await page.evaluate(() => window.__CAMPS.map(c => window.__campLocation(c)));
  check(campsBefore.join() !== campsAfter.join(), `roaming camps drifted with the days (${campsBefore.join(',')} → ${campsAfter.join(',')})`);
  await page.screenshot({ path: `${OUT}/d-steppe.png` });
  const meter = await page.evaluate(() => window.__warlord.scene.getScene('MapHud').infamyLabel.text);
  check(/STEPPE INFAMY 0/.test(meter), `the steppe keeps its own reputation (${meter})`);
  // ride to wherever Böke's camp stands and raid it
  await hidePanel(page);
  const target = await page.evaluate(() => window.__campLocation(window.__CAMPS[0]));
  await marchTo(page, target);
  check(await waitPanel(page, 30000), `rode to ${target}`);
  const there = await page.evaluate(() => { const S = window.__GameState; const c = window.__CAMPS.find(c => window.__campLocation(c) === S.location); return c ? c.id : null; });
  if (!there) { await hidePanel(page); const t2 = await page.evaluate(() => window.__campLocation(window.__CAMPS[0])); await marchTo(page, t2); }
  const hereCamp = await page.evaluate(() => { const S = window.__GameState; const c = window.__CAMPS.find(c => window.__campLocation(c) === S.location); return c ? c.name : null; });
  check(!!hereCamp, `standing at a camp (${hereCamp})`);
  await clickBtn(page, 'MapHud', 'RAID');
  check(await waitScene(page, 'Raid'), 'camp raid started');
  await pickFormation(page);
  await sleep(1200);
  r = await raidState(page);
  check(r && r.kind === 'camp' && r.layout === 'steppe' && r.kinds.filter(k => k === 'horsearcher').length === 5, `steppe camp: ${r && r.kinds.join(',')}`);
  await page.screenshot({ path: `${OUT}/d-camp-raid.png` });
  // horse archers fire at a gallop: an enemy arrow loosed while its archer is moving fast
  await page.evaluate(() => { const rr = window.__warlord.scene.getScene('Raid'); for (const e of rr.enemies) e.wakeQuiet(); rr.hero.hp = 9999; rr.hero.maxHp = 9999; });
  let gallopShot = false;
  for (let i = 0; i < 40 && !gallopShot; i++) {
    await sleep(150);
    gallopShot = await page.evaluate(() => { const rr = window.__warlord.scene.getScene('Raid'); const movingArchers = rr.enemies.filter(e => e.kind === 'horsearcher' && e.alive && e.body.speed > 100);
      return movingArchers.some(e => e.windingUp) || (rr.arrows.getChildren().some(a => a.active && a.team === 'enemy') && movingArchers.length > 0); });
  }
  check(gallopShot, 'horse archers draw and shoot while galloping');
  await page.evaluate(() => { const rr = window.__warlord.scene.getScene('Raid'); rr.hero.maxHp = 130; rr.hero.hp = 130; });
  // ten mounted enemies that keep their distance is the longest fight in the game, and a headless
  // software renderer runs it slower than a phone does — give it the same budget as the ambush
  await autoPlay(page, 150);
  await sleep(1800);
  check(await waitScene(page, 'Result', 8000), 'camp plundered');
  const campBtns = await page.evaluate(() => window.__warlord.scene.getScene('Result').children.list.filter(c => c.type === 'Container').map(c => c.list.find(t => t.type === 'Text')?.text));
  check(campBtns.includes('TAKE THE LOOT') && !campBtns.includes('OCCUPY'), `a camp cannot be occupied (${campBtns.join('/')})`);
  await clickBtn(page, 'Result', 'TAKE');
  await waitScene(page, 'Map');
  await sleep(800);
  s = await gs(page);
  const hunted = await page.evaluate(() => ({ hunted: window.__GameState.hunted, steppe: window.__GameState.steppeInfamy, scattered: Object.keys(window.__GameState.campScattered).length }));
  check(hunted.hunted && hunted.steppe === 8 && hunted.scattered === 1, `raiding a camp: scattered, hunted, steppe infamy ${hunted.steppe}`);
  // hunted riders: force the intercept on the next stretch
  await page.evaluate(() => {
    const S = window.__GameState;
    delete S.runHunters;                       // let the real hunters run again
    S.hunters = [{ id: 1, x: S.pos.x + 12, y: S.pos.y + 8, kind: 'steppe', age: 0 }];
  });
  await hidePanel(page);
  await marchTo(page, 'steppe_trade');
  check(await waitPanel(page, 30000) && (await panelTitle(page)) === 'RIDERS', `hunted on the grass: ${await panelTitle(page)}`);
  await clickBtn(page, 'MapHud', 'FIGHT');
  await waitScene(page, 'Raid');
  await pickFormation(page);
  await sleep(700);
  r = await raidState(page);
  check(r && r.kind === 'steppePatrol' && r.layout === 'steppeField', `riders' ambush on the open steppe (${r && r.kinds.length} riders)`);
  await autoPlay(page, 150);                  // eight mounted riders on open ground: the longest fight there is
  await sleep(1800);
  await waitScene(page, 'Result', 8000);
  await clickBtn(page, 'Result', 'BACK');
  await waitScene(page, 'Map');
  // no "resume": you are standing where they caught you, and you carry on under your own steam
  const stood = await page.evaluate(() => ({ ...window.__GameState.pos }));
  check(Number.isFinite(stood.x), `the warband holds the ground it fought on (${Math.round(stood.x)},${Math.round(stood.y)})`);
  await noPatrols(page);
  check(await marchTo(page, 'steppe_trade'), "marched on to Khoja's camp");
  await sleep(900);                                  // let the arrival panel settle before touching it
  if ((await panelTitle(page)) !== "KHOJA'S CAMP") { await hidePanel(page); await tapNode(page, 'steppe_trade'); await waitPanel(page, 8000); }
  await clickBtn(page, 'MapHud', 'ENTER');
  check(await waitScene(page, 'Settlement'), 'entered the neutral trade camp');
  await sleep(400);
  await page.screenshot({ path: `${OUT}/d-khoja.png` });
  await clickBtn(page, 'Settlement', 'FORGE');
  await waitScene(page, 'Shop');
  await clickBtn(page, 'Shop', '220 gold');
  s = await gs(page);
  check(s.owned.composite && s.weapon === 'composite', `bought the composite bow (${s.weapon})`);
  await clickBtn(page, 'Shop', 'LEAVE');
  await clickBtn(page, 'Settlement', 'BARRACKS');
  await waitScene(page, 'Shop');
  await clickBtn(page, 'Shop', '90 gold');
  s = await gs(page);
  check(s.kinds.includes('rider'), `hired a steppe rider (${s.kinds.join(',')})`);
  await clickBtn(page, 'Shop', 'LEAVE');
  await clickBtn(page, 'Settlement', 'TO THE MAP');
  await waitScene(page, 'Map');
  // the composite bow shoots from a slow ride, and arrows pierce
  await page.evaluate(() => { const g = window.__warlord; g.scene.stop('MapHud'); g.scene.stop('Map'); g.scene.start('Raid', window.__battles.steppePatrolBattle()); });
  await waitScene(page, 'Raid');
  await pickFormation(page);
  await sleep(800);
  await page.evaluate(() => { const rr = window.__warlord.scene.getScene('Raid'); rr.hero.setPosition(700, 480); rr.hero.hp = 9999; rr.hero.maxHp = 9999; for (const e of rr.enemies) e.wakeQuiet(); rr.playerInput.joyX = 0; rr.playerInput.joyY = 0.6; rr.shots = 0; });
  await sleep(2000);
  const compShots = await page.evaluate(() => window.__warlord.scene.getScene('Raid').shots);
  check(compShots > 0, `composite bow shoots while moving at 60% (${compShots} shots)`);
  const pierced = await page.evaluate(async () => { const rr = window.__warlord.scene.getScene('Raid'); let best = 0; const t0 = Date.now(); while (Date.now() - t0 < 4000) { for (const a of rr.arrows.getChildren()) if (a.active && a.team === 'player') best = Math.max(best, a.hits.size); await new Promise(r => setTimeout(r, 50)); } return best; });
  check(pierced >= 1, `arrows carry on through targets (max hits seen on one arrow: ${pierced})`);
  const riderFired = await page.evaluate(() => window.__warlord.scene.getScene('Raid').troops.some(t => t.ranged));
  check(riderFired, 'the steppe rider fights mounted and ranged');
  await page.evaluate(() => { const g = window.__warlord; g.scene.stop('Hud'); g.scene.stop('Raid'); g.scene.start('Map'); });
  await waitScene(page, 'Map');
  await sleep(500);

  // --- save / reload keeps conquests
  await page.reload();
  await sleep(1500);
  await clickBtn(page, 'Title', 'CONTINUE');
  check(await waitScene(page, 'Map'), 'CONTINUE loads the save');
  await sleep(600);
  s = await gs(page);
  check(s.settlements.kingsport?.occupied && s.owned.halberd && s.armor === 'plate', 'conquests, the halberd and the plate survived a reload');
  // the map's STEADY frame rate, once the rolling average has forgotten the scene it came from —
  // and a check that the chart is not repainting itself over and over while nothing moves
  await sleep(2600);
  const perf = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    return { fps: window.__warlord.loop.actualFps, paints: m.chart.paints, objects: m.children.list.length };
  });
  check(perf.fps > 30, `map holds a steady frame rate (${perf.fps.toFixed(0)} fps, ${perf.objects} objects)`);
  check(perf.paints <= 3, `the chart repaints only when the view settles (${perf.paints} repaints)`);
  // --- an old save (written before the steppe and before the atlas) still loads, and lands on the new Earth
  await page.evaluate(() => {
    const S = window.__GameState;
    const old = S.toJSON();
    delete old.steppeInfamy; delete old.campScattered; delete old.huntedUntil; delete old.lastSteppePatrolDay;
    delete old.owned.composite;
    delete old.pos; delete old.hunters;         // a save from before free movement knew only which place you were at
    old.gold = 777; old.day = 42; old.location = 'greywater'; old.pendingPath = []; old.resumeTravel = null; old.pendingVictory = null;
    S.save = () => {};   // the page saves on unload; keep it from writing over the old save we inject
    localStorage.setItem('warlord.save.v3', JSON.stringify(old));
  });
  await page.reload();
  await sleep(1500);
  await clickBtn(page, 'Title', 'CONTINUE');
  check(await waitScene(page, 'Map'), 'a pre-atlas save still loads');
  await sleep(900);
  const old = await page.evaluate(() => {
    const S = window.__GameState, m = window.__warlord.scene.getScene('Map');
    const n = window.__NODES.find(n => n.id === 'greywater');
    return { gold: S.gold, day: S.day, where: S.location, steppe: S.steppeInfamy, hunted: S.hunted, composite: S.owned.composite,
      kingsport: !!S.settlements.kingsport?.occupied, onNode: Math.hypot(m.token.x - n.x, m.token.y - n.y) < 40 };
  });
  check(old.gold === 777 && old.day === 42 && old.where === 'greywater' && old.kingsport && old.steppe === 0 && old.hunted === false && old.composite === false && old.onNode,
    `an old save keeps its state and stands on the new chart (gold ${old.gold}, day ${old.day}, at ${old.where})`);

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
  check(await waitScene(page, 'CivSelect'), 'phone: new warband → choose your start');
  await sleep(600);
  await page.screenshot({ path: `${OUT}/p-civselect.png` });
  // pick a start that is NOT the outlaw, so the phone run proves a foreign start works end to end
  const tile = await page.evaluate(() => {
    const s2 = window.__warlord.scene.getScene('CivSelect');
    const d = window.__warlord.scale.displayScale.x || 1;
    // the tiles are the transparent hit rectangles laid over each plate, in civList order
    const hits = s2.children.list.filter(o => o.type === 'Rectangle');
    const t = hits[4];
    return t ? { x: t.x / d, y: t.y / d } : null;
  });
  if (tile) { await page.touchscreen.tap(tile.x, tile.y); await sleep(500); }
  await clickBtn(page, 'CivSelect', 'BEGIN', true);
  check(await waitScene(page, 'Settlement'), 'phone: choosing a start opens its camp');
  const started = await page.evaluate(() => { const S = window.__GameState;
    return { civ: S.civ, home: S.home, troops: S.troops.map(t => t.kind) }; });
  check(started.troops.every(k => k.startsWith(`${started.civ}_`)),
    `phone: started as ${started.civ}, with ${started.civ} troops`);
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
  // pinch out to the whole Earth and drag across it: the atlas has to stay smooth in one thumb
  await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); m.setZoom(0.0001); m.cameras.main.centerOn(2700, 1620); });
  await sleep(800);
  await page.screenshot({ path: `${OUT}/p-world.png` });
  const pan = await page.evaluate(async () => {
    const g = window.__warlord, cam = g.scene.getScene('Map').cameras.main;
    const t0 = performance.now(); let frames = 0, x = cam.scrollX;
    await new Promise(res => {
      const step = () => {
        cam.setScroll(x + Math.sin(frames / 6) * 240, cam.scrollY);   // drag back and forth
        frames++;
        if (performance.now() - t0 > 2000) res(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    return { fps: g.loop.actualFps, frames, zoom: cam.zoom };
  });
  check(pan.fps > 25, `phone: panning the whole atlas stays smooth (${pan.fps.toFixed(0)} fps at zoom ${pan.zoom.toFixed(2)})`);
  await page.evaluate(() => window.__warlord.scene.getScene('Map').zoomToTerritory());
  await sleep(400);
  await noPatrols(page);
  // lifting one finger out of a pinch must not read that finger's whole travel as a drag
  {
    const scroll = () => page.evaluate(() => { const c = window.__warlord.scene.getScene('Map').cameras.main; return [Math.round(c.scrollX), Math.round(c.scrollY)]; });
    const cdp = await page.context().newCDPSession(page);
    const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
    await T('touchStart', [{ x: 150, y: 400, id: 1 }, { x: 250, y: 400, id: 2 }]);
    await T('touchMove', [{ x: 100, y: 400, id: 1 }, { x: 300, y: 400, id: 2 }]);
    await T('touchMove', [{ x: 60, y: 400, id: 1 }, { x: 340, y: 400, id: 2 }]);
    await T('touchEnd', [{ x: 340, y: 400, id: 2 }]);
    const mid = await scroll();
    await T('touchMove', [{ x: 344, y: 402, id: 2 }]);
    await sleep(200);
    const end = await scroll();
    await T('touchEnd', []);
    const jump = Math.round(Math.hypot(end[0] - mid[0], end[1] - mid[1]));
    check(jump < 60, `phone: coming out of a pinch does not fling the map (${jump} units)`);
    await page.evaluate(() => window.__warlord.scene.getScene('Map').zoomToTerritory());
    await sleep(300);
    await hidePanel(page);
  }
  check(await marchTo(page, 'ashford', true), 'phone: tap-to-march reached Ashford');
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
