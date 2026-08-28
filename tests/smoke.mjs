// smoke.mjs — automated playthrough in headless Chromium (desktop + emulated phone). Run: npm run smoke
// Title → camp (walk, shop) → map (travel, days) → raid → save/reload → forced patrol → palisaded village → gear → town.
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

// screen-space centre (CSS px) of a button container in a scene, found by its label prefix
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
const gs = (page) => page.evaluate(() => { const g = window.__warlord.scene.getScene('Map') ? null : null; void g; const S = window.__GameState; return S ? { gold: S.gold, day: S.day, infamy: S.infamy, location: S.location, tier: S.infamyTierName, troops: S.troops.length, horse: S.horse, weapon: S.weaponKind, owned: { ...S.owned }, defense: S.defense } : null; });
const raidState = (page) => page.evaluate(() => {
  const r = window.__warlord.scene.getScene('Raid');
  if (!r || !r.hero || !r.scene.isActive()) return null;
  return { heroX: r.hero.x, heroY: r.hero.y, heroHp: r.hero.hp, enemies: r.enemies.length, aggro: r.enemies.filter(e => e.aggro).length, troops: r.troops.length,
    gold: r.hud.gold, kind: r.cfg.kind, layout: r.cfg.layoutId, palisade: r.cfg.palisade, walls: r.obstacles.filter(o => o.kind === 'wall').length, mode: r.hero.mode, scale: r.hero.scaleX, fps: window.__warlord.loop.actualFps };
});
async function clickBtn(page, scene, prefix, touch = false) {
  const b = await buttonPos(page, scene, prefix);
  check(!!b, `found button "${prefix}" in ${scene}`);
  if (!b) throw new Error(`no button ${prefix} in ${scene}`);
  if (touch) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
  await sleep(500);
}
// walk the camp hero to a world point by writing joystick values
async function walkTo(page, x, y, timeoutMs = 9000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const done = await page.evaluate(([tx, ty]) => {
      const c = window.__warlord.scene.getScene('Camp');
      if (!c || !c.hero || !c.playerInput) return true;
      const dx = tx - c.hero.x, dy = ty - c.hero.y, d = Math.hypot(dx, dy);
      if (d < 14) { c.playerInput.joyX = 0; c.playerInput.joyY = 0; return true; }
      c.playerInput.joyX = dx / d; c.playerInput.joyY = dy / d;
      return false;
    }, [x, y]);
    if (done) return true;
    await sleep(80);
  }
  await page.evaluate(() => { const c = window.__warlord.scene.getScene('Camp'); if (c && c.playerInput) { c.playerInput.joyX = 0; c.playerInput.joyY = 0; } });
  return false;
}
// steer the raid hero at the nearest enemy; wiggle when stuck
async function autoPlay(page, seconds) {
  const end = Date.now() + seconds * 1000;
  let lastX = -1, lastY = -1, stuckTicks = 0;
  while (Date.now() < end) {
    const st = await page.evaluate((wiggle) => {
      const r = window.__warlord.scene.getScene('Raid');
      if (!r || !r.hero || !r.hero.alive || !r.playerInput || !r.scene.isActive()) return null;
      let best = null, bd = 1e9;
      for (const e of r.enemies) { const d = Math.hypot(e.x - r.hero.x, e.y - r.hero.y); if (d < bd) { bd = d; best = e; } }
      if (!best) { r.playerInput.joyX = 0; r.playerInput.joyY = 0; return { enemies: 0 }; }
      let dx = (best.x - r.hero.x) / bd, dy = (best.y - r.hero.y) / bd;
      if (wiggle) { const t = dx; dx = -dy; dy = t; }
      const go = bd > (r.hero.mode === 'bow' ? 150 : 34);
      r.playerInput.joyX = go ? dx : 0; r.playerInput.joyY = go ? dy : 0;
      return { enemies: r.enemies.length, x: r.hero.x, y: r.hero.y };
    }, stuckTicks >= 3);
    if (!st || st.enemies === 0) break;
    if (Math.abs(st.x - lastX) < 3 && Math.abs(st.y - lastY) < 3) stuckTicks++; else stuckTicks = 0;
    if (stuckTicks > 5) stuckTicks = 0;
    lastX = st.x; lastY = st.y;
    await sleep(200);
  }
  await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); if (r && r.playerInput) { r.playerInput.joyX = 0; r.playerInput.joyY = 0; } });
}
const weaken = (page) => page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); for (const e of r.enemies) { e.hp = 1; e.wake(); } r.hero.hp = r.hero.maxHp; });
const waitScene = async (page, key, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if ((await activeScenes(page)).includes(key)) return true; await sleep(150); } return false; };
const waitPanel = async (page, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const open = await page.evaluate(() => { const h = window.__warlord.scene.getScene('MapHud'); return !!(h && h.scene.isActive() && h.panelOpen); }); if (open) return true; await sleep(200); } return false; };
const tapNode = async (page, id, touch = false) => {
  const pos = await page.evaluate((nid) => { const m = window.__warlord.scene.getScene('Map'); const n = window.__NODES.find(n => n.id === nid); const cam = m.cameras.main; const d = window.__warlord.scale.displayScale.x || 1;
    return { x: ((n.x - cam.worldView.x) * cam.zoom) / d, y: ((n.y - cam.worldView.y) * cam.zoom) / d }; }, id);
  if (touch) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
};
async function exposeState(page) {
  // GameState is a module singleton; scenes reference it, so grab it from a scene module closure via a debug hook
  await page.evaluate(() => {
    const title = window.__warlord.scene.getScene('Title');
    void title;
  });
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
  check(!!(await page.evaluate(() => window.__GameState)), 'debug handle __GameState exposed');
  await page.screenshot({ path: `${OUT}/d-title.png` });
  await clickBtn(page, 'Title', 'NEW');
  check(await waitScene(page, 'Camp'), 'new warband starts in the walkable camp');
  await sleep(600);
  await page.screenshot({ path: `${OUT}/d-camp.png` });

  // --- walk to the forge and open it
  check(await walkTo(page, 230, 251), 'walked to the forge door');
  const label = await page.evaluate(() => window.__warlord.scene.getScene('Camp').hud.interactLabel);
  check(/FORGE/.test(label || ''), `interact prompt shows the forge (${JSON.stringify(label)})`);
  await page.keyboard.press('e');
  check(await waitScene(page, 'Shop'), 'E opens the shop overlay');
  await sleep(300);
  await page.screenshot({ path: `${OUT}/d-forge.png` });
  const forgeBtns = await page.evaluate(() => window.__warlord.scene.getScene('Shop').children.list.filter(c => c.type === 'Container').map(c => c.list.filter(x => x.type === 'Text').map(t => t.text).join('|')));
  console.log('forge buttons:', JSON.stringify(forgeBtns));
  await clickBtn(page, 'Shop', 'LEAVE');
  check(!(await activeScenes(page)).includes('Shop') && (await activeScenes(page)).includes('Hud'), 'shop closed, camp HUD back');

  // --- leave by the road
  check(await walkTo(page, 90, 560), 'walked to the exit');
  await page.keyboard.press('e');
  check(await waitScene(page, 'Map'), 'left camp onto the world map');
  await sleep(800);
  await page.screenshot({ path: `${OUT}/d-map.png` });
  let s = await gs(page);
  check(s.location === 'camp' && s.day === 1, `on the map at camp, day 1 (${s.location}, day ${s.day})`);

  // --- travel to Ashford (tap the node), raid it
  await tapNode(page, 'ashford');
  check(await waitPanel(page, 15000), 'arrived at Ashford: panel opened');
  s = await gs(page);
  check(s.location === 'ashford' && s.day > 1, `travel moved the token and cost days (${s.location}, day ${s.day})`);
  await page.screenshot({ path: `${OUT}/d-ashford-panel.png` });
  await clickBtn(page, 'MapHud', 'RAID');
  check(await waitScene(page, 'Raid'), 'raid scene started from the map');
  await sleep(800);
  let r = await raidState(page);
  check(r && r.kind === 'village' && r.layout === 'ashford' && r.enemies === 11, `Ashford raid: 11 defenders (${r && r.enemies}, ${r && r.layout})`);
  await weaken(page);
  await autoPlay(page, 60);
  await sleep(1800);
  check(await waitScene(page, 'Result'), 'victory result shown');
  await page.screenshot({ path: `${OUT}/d-victory.png` });
  await clickBtn(page, 'Result', 'BACK');
  check(await waitScene(page, 'Map'), 'back on the map after the raid');
  await sleep(800);
  s = await gs(page);
  check(s.gold > 0 && s.infamy === 8, `loot banked and infamy grew (gold ${s.gold}, infamy ${s.infamy})`);
  const vi = await page.evaluate(() => window.__GameState.villageInfo('ashford'));
  check(vi.timesRaided === 1 && vi.ruined, `Ashford marked raided + ruined (${JSON.stringify({ t: vi.timesRaided, ruined: vi.ruined })})`);
  const raidBtnDisabled = await page.evaluate(() => { const h = window.__warlord.scene.getScene('MapHud'); return h.panelOpen; });
  check(raidBtnDisabled, 'village panel re-opened after the raid');

  // --- save / reload
  await page.reload();
  await sleep(1500);
  await clickBtn(page, 'Title', 'CONTINUE');
  check(await waitScene(page, 'Map'), 'CONTINUE loads the save onto the map');
  await sleep(600);
  const s2 = await gs(page);
  check(s2.gold === s.gold && s2.day === s.day && s2.location === 'ashford', `save restored gold/day/location (${s2.gold}/${s2.day}/${s2.location})`);

  // --- infamy effects: force Raider tier, deterministic patrol on the next road
  await page.evaluate(() => { const S = window.__GameState; S.infamy = 35; S.fortifyStart = S.day - 20; S.save(); window.__warlord.scene.getScene('Map').refresh(); });
  await sleep(300);
  const mb = await page.evaluate(() => window.__GameState.villageInfo('millbrook'));
  check(mb.steps > 0 && mb.palisade, `unraided village fortified over time (+${mb.steps} militia, palisade ${mb.palisade})`);
  const bounty = await page.evaluate(() => window.__GameState.bounty);
  check(bounty === 35 * 12, `bounty shown from infamy (${bounty})`);
  await page.screenshot({ path: `${OUT}/d-map-fortified.png` });
  // guarantee the intercept via the game's own hook (never stub Math.random: Phaser uses it for texture keys)
  await page.evaluate(() => { Object.defineProperty(window.__GameState, 'patrolChance', { get: () => 1, configurable: true }); });
  await page.evaluate(() => window.__warlord.scene.getScene('MapHud').hidePanel());
  await tapNode(page, 'millbrook');
  check(await waitPanel(page, 15000), 'a road patrol intercepted the warband');
  const ptitle = await page.evaluate(() => window.__warlord.scene.getScene('MapHud').spec?.title);
  check(ptitle === 'ROAD PATROL', `patrol panel (${ptitle})`);
  await page.screenshot({ path: `${OUT}/d-patrol.png` });
  // no more surprise patrols for the rest of the run (keeps the test deterministic)
  await page.evaluate(() => { Object.defineProperty(window.__GameState, 'patrolChance', { get: () => 0, configurable: true }); });
  await clickBtn(page, 'MapHud', 'FIGHT');
  check(await waitScene(page, 'Raid'), 'patrol battle started');
  await sleep(700);
  r = await raidState(page);
  check(r && r.kind === 'patrol' && r.layout === 'field' && r.enemies === 11, `open-field patrol battle: ${r && r.enemies} riders on layout ${r && r.layout}`);
  await weaken(page);
  await autoPlay(page, 60);
  await sleep(1800);
  check(await waitScene(page, 'Result'), 'patrol routed');
  await clickBtn(page, 'Result', 'BACK');
  check(await waitScene(page, 'Map'), 'back to the map');
  check(await waitPanel(page, 15000), 'travel resumed after the patrol and reached Millbrook');
  s = await gs(page);
  check(s.location === 'millbrook', `arrived at Millbrook (${s.location})`);

  // --- palisaded village raid
  await clickBtn(page, 'MapHud', 'RAID');
  check(await waitScene(page, 'Raid'), 'Millbrook raid started');
  await sleep(700);
  r = await raidState(page);
  check(r && r.palisade && r.walls > 0 && r.layout === 'millbrook', `palisade walls built (${r && r.walls} segments), layout ${r && r.layout}`);
  await page.screenshot({ path: `${OUT}/d-millbrook.png` });
  await weaken(page);
  await autoPlay(page, 90);
  await sleep(1800);
  check(await waitScene(page, 'Result'), 'Millbrook cleared');
  await clickBtn(page, 'Result', 'BACK');
  await waitScene(page, 'Map');

  // --- gear: go home with gold, buy armor + bow + courser, then raid with the bow
  await page.evaluate(() => { const S = window.__GameState; S.gold = 600; S.save(); window.__warlord.scene.getScene('MapHud').hidePanel(); });
  await tapNode(page, 'camp');
  check(await waitPanel(page, 20000), 'travelled home');
  await clickBtn(page, 'MapHud', 'ENTER');
  check(await waitScene(page, 'Camp'), 'entered the camp from the map');
  await sleep(500);
  check(await walkTo(page, 230, 251), 'walked to the forge');
  await page.keyboard.press('e');
  await waitScene(page, 'Shop');
  await sleep(300);
  await clickBtn(page, 'Shop', '60 gold');   // armor
  await clickBtn(page, 'Shop', '70 gold');   // bow (auto-equips)
  s = await gs(page);
  check(s.owned.armor && s.owned.bow && s.defense === 2 && s.weapon === 'bow' && s.gold === 470, `bought armor + bow (def ${s.defense}, weapon ${s.weapon}, gold ${s.gold})`);
  await page.screenshot({ path: `${OUT}/d-forge-bought.png` });
  await clickBtn(page, 'Shop', 'LEAVE');
  check(await walkTo(page, 760, 521), 'walked to the stables');
  await page.keyboard.press('e');
  await waitScene(page, 'Shop');
  await sleep(300);
  await clickBtn(page, 'Shop', '120 gold'); // courser
  s = await gs(page);
  check(s.horse === 'courser' && s.gold === 350, `bought and mounted the courser (${s.horse}, gold ${s.gold})`);
  await clickBtn(page, 'Shop', 'LEAVE');
  await sleep(300);
  const mounted = await page.evaluate(() => { const c = window.__warlord.scene.getScene('Camp'); return { scale: c.hero.scaleX, mount: !!c.mount }; });
  check(mounted.scale > 1.2 && mounted.mount, `camp hero looks mounted (scale ${mounted.scale})`);
  await page.screenshot({ path: `${OUT}/d-camp-mounted.png` });
  check(await walkTo(page, 560, 241), 'walked to the barracks');
  await page.keyboard.press('e');
  await waitScene(page, 'Shop');
  await sleep(300);
  await clickBtn(page, 'Shop', '35 gold');
  s = await gs(page);
  check(s.troops === 4, `recruited at the barracks (${s.troops} troops)`);
  await clickBtn(page, 'Shop', 'LEAVE');
  await page.keyboard.press('m');
  check(await waitScene(page, 'Map'), 'M returns to the map from camp');
  await sleep(500);
  // ride out and raid Ashford again? it's ruined; test the town instead, then Thornhill with the bow
  await page.evaluate(() => window.__warlord.scene.getScene('MapHud').hidePanel());
  await tapNode(page, 'kingsport');
  check(await waitPanel(page, 30000), 'reached Kingsport');
  const ktitle = await page.evaluate(() => window.__warlord.scene.getScene('MapHud').spec?.title);
  const kbtns = await page.evaluate(() => window.__warlord.scene.getScene('MapHud').spec?.buttons.map(b => b.label));
  check(ktitle === 'KINGSPORT' && kbtns.length === 1, `town is locked with a warning (${ktitle}: ${kbtns})`);
  await page.screenshot({ path: `${OUT}/d-town.png` });
  await page.evaluate(() => window.__warlord.scene.getScene('MapHud').hidePanel());
  await tapNode(page, 'thornhill');
  check(await waitPanel(page, 20000), 'reached Thornhill');
  await clickBtn(page, 'MapHud', 'RAID');
  await waitScene(page, 'Raid');
  await sleep(700);
  r = await raidState(page);
  check(r && r.mode === 'bow' && r.scale > 1.2 && r.troops === 4, `raid hero uses the bow, mounted, 4 troops (${r && r.mode}, ${r && r.scale}, ${r && r.troops})`);
  await weaken(page);
  await autoPlay(page, 20);
  const shot = await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); return r.arrows.getChildren().some(a => a.team === 'player') || r.enemies.length < 17; });
  check(shot, 'bow fired arrows / killed from range');
  await page.screenshot({ path: `${OUT}/d-thornhill-bow.png` });
  await autoPlay(page, 60);
  await sleep(1800);
  check(await waitScene(page, 'Result'), 'Thornhill cleared with the bow');
  await clickBtn(page, 'Result', 'BACK');
  await waitScene(page, 'Map');
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
  await page.screenshot({ path: `${OUT}/p-title.png` });
  await clickBtn(page, 'Title', 'NEW', true);
  check(await waitScene(page, 'Camp'), 'phone: new warband → camp');
  await sleep(600);
  await page.screenshot({ path: `${OUT}/p-camp.png` });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const h0 = await page.evaluate(() => window.__warlord.scene.getScene('Camp').hero.x);
  await touch('touchStart', [{ x: 100, y: 600, id: 1 }]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [{ x: 100 + i * 6, y: 600, id: 1 }]); await sleep(30); }
  await sleep(1200);
  await touch('touchEnd', []);
  const h1 = await page.evaluate(() => window.__warlord.scene.getScene('Camp').hero.x);
  check(h1 > h0 + 80, `phone: joystick walks the hero in camp (${Math.round(h0)} → ${Math.round(h1)})`);
  check(await walkTo(page, 230, 251), 'phone: at the forge door');
  const ib = await page.evaluate(() => { const h = window.__warlord.scene.getScene('Hud'); const d = window.__warlord.scale.displayScale.x || 1; return { x: h.interact.x / d, y: h.interact.y / d, label: h.model.interactLabel }; });
  check(/FORGE/.test(ib.label || ''), `phone: interact button offers the forge (${JSON.stringify(ib.label)})`);
  await page.screenshot({ path: `${OUT}/p-camp-forge.png` });
  await page.touchscreen.tap(ib.x, ib.y);
  check(await waitScene(page, 'Shop'), 'phone: interact button opens the shop');
  await sleep(300);
  await page.screenshot({ path: `${OUT}/p-forge.png` });
  await clickBtn(page, 'Shop', 'LEAVE', true);
  const mapBtn = await buttonPos(page, 'Hud', 'MAP');
  check(!!mapBtn, 'phone: MAP button present in camp');
  await page.touchscreen.tap(mapBtn.x, mapBtn.y);
  check(await waitScene(page, 'Map'), 'phone: MAP button leaves camp');
  await sleep(800);
  await page.screenshot({ path: `${OUT}/p-map.png` });
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
