// smoke.mjs — automated playthrough in headless Chromium (desktop + emulated phone). Run: npm run smoke

import { chromium, devices } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || 'tests/shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) failures++; };

async function attachErrorCapture(page, errors) {
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/GL Driver Message/.test(m.text())) errors.push(`${m.type()}: ${m.text()}`); });
}

// Find the world-space centre of a Camp/Result button by its label prefix, in screen px.
async function buttonPos(page, sceneKey, prefix) {
  return page.evaluate(([k, p]) => {
    const s = window.__warlord.scene.getScene(k);
    for (const c of s.children.list) {
      if (c.type !== 'Container') continue;
      const t = c.list.find(x => x.type === 'Text' && x.text.startsWith(p));
      if (t) { const d = window.__warlord.scale.displayScale.x || 1; return { x: c.x / d, y: c.y / d }; }
    }
    return null;
  }, [sceneKey, prefix]);
}
const activeScenes = (page) => page.evaluate(() => window.__warlord.scene.getScenes(true).map(s => s.scene.key));
const raidState = (page) => page.evaluate(() => {
  const r = window.__warlord.scene.getScene('Raid');
  if (!r || !r.hero) return null;
  return { heroX: r.hero.x, heroY: r.hero.y, heroHp: r.hero.hp, enemies: r.enemies.length, aggro: r.enemies.filter(e => e.aggro).length,
    troops: r.troops.length, gold: r.hud.gold, hornCd: r.hero.hornCd, chargeCd: r.hero.chargeCd, fps: window.__warlord.loop.actualFps };
});

// Steer the hero (via the joystick values) at the nearest enemy; wiggle when stuck on a hut.
async function autoPlay(page, seconds) {
  const end = Date.now() + seconds * 1000;
  let lastX = -1, lastY = -1, stuckTicks = 0;
  while (Date.now() < end) {
    const st = await page.evaluate((wiggle) => {
      const r = window.__warlord.scene.getScene('Raid');
      if (!r || !r.hero || !r.hero.alive || !r.playerInput) return null;
      let best = null, bd = 1e9;
      for (const e of r.enemies) { const d = Math.hypot(e.x - r.hero.x, e.y - r.hero.y); if (d < bd) { bd = d; best = e; } }
      if (!best) { r.playerInput.joyX = 0; r.playerInput.joyY = 0; return { enemies: 0 }; }
      let dx = (best.x - r.hero.x) / bd, dy = (best.y - r.hero.y) / bd;
      if (wiggle) { const t = dx; dx = -dy; dy = t; }
      const go = bd > 34;
      r.playerInput.joyX = go ? dx : 0; r.playerInput.joyY = go ? dy : 0;
      return { enemies: r.enemies.length, hp: r.hero.hp, x: r.hero.x, y: r.hero.y };
    }, stuckTicks >= 3);
    if (!st || st.enemies === 0) break;
    if (Math.abs(st.x - lastX) < 3 && Math.abs(st.y - lastY) < 3) stuckTicks++; else stuckTicks = 0;
    if (stuckTicks > 5) stuckTicks = 0;
    lastX = st.x; lastY = st.y;
    await sleep(200);
  }
  await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); if (r && r.playerInput) { r.playerInput.joyX = 0; r.playerInput.joyY = 0; } });
}

// Fresh raid, no troops, every militia awake, hero parked at a spot. Returns hp over time / time of death.
async function positioningTrial(page, spot, label, seconds = 16) {
  await page.evaluate(() => { const g = window.__warlord; g.scene.stop('Result'); g.scene.stop('Hud'); g.scene.stop('Raid'); g.scene.start('Raid'); });
  await sleep(700);
  await page.evaluate(({ x, y }) => {
    const r = window.__warlord.scene.getScene('Raid');
    r.hero.setPosition(x, y); r.hero.hp = r.hero.maxHp;
    for (const t of r.troops) t.damage(9999, t.x, t.y, 0);
    for (const e of r.enemies) e.wakeQuiet();
  }, spot);
  const t0 = Date.now();
  let died = null, last = null, samples = [], inReach = [];
  while (Date.now() - t0 < seconds * 1000) {
    await sleep(500);
    const near = await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); if (!r || !r.hero) return -1; return r.enemies.filter(e => e.kind === 'militia' && e.alive && e.edgeDistTo(r.hero) <= 24).length; });
    inReach.push(near);
    await sleep(500);
    const st = await raidState(page);
    if (!st) break;
    samples.push(Math.round(st.heroHp));
    last = st;
    if (st.heroHp <= 0) { died = (Date.now() - t0) / 1000; break; }
  }
  await page.screenshot({ path: `${OUT}/positioning-${label}.png` });
  console.log(`positioning[${label}] hp samples: ${samples.join(',')}${died ? ` — DIED at ${died.toFixed(1)}s` : ''}  enemies left ${last && last.enemies}\n   militia in reach per second: ${inReach.join(',')}`);
  return { died, hp: last ? last.heroHp : 0, enemies: last ? last.enemies : -1 };
}

async function desktopRun(browser) {
  console.log('=== DESKTOP 1440x900 ===');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  await attachErrorCapture(page, errors);
  await page.goto(URL);
  await sleep(1500);
  check((await activeScenes(page)).includes('Camp'), 'camp scene active on load');
  await page.screenshot({ path: `${OUT}/desktop-camp.png` });
  const raidBtn = await buttonPos(page, 'Camp', 'RAID');
  check(!!raidBtn, 'found RAID button');
  await page.mouse.click(raidBtn.x, raidBtn.y);
  await sleep(800);
  const scenes = await activeScenes(page);
  check(scenes.includes('Raid') && scenes.includes('Hud'), `raid + hud active after clicking RAID (${scenes})`);
  const s0 = await raidState(page);
  check(s0.enemies === 11, `raid 1 has 11 defenders (got ${s0.enemies})`);
  check(s0.troops === 3, `3 troops at start (got ${s0.troops})`);
  await page.screenshot({ path: `${OUT}/desktop-raid-start.png` });

  // walk east into the street for 3s
  await page.keyboard.down('d');
  await sleep(3000);
  await page.keyboard.up('d');
  const s1 = await raidState(page);
  check(s1.heroX > s0.heroX + 200, `WASD moves the hero east (${Math.round(s0.heroX)} -> ${Math.round(s1.heroX)})`);
  await page.keyboard.press('q');
  await sleep(100);
  const s2 = await raidState(page);
  check(s2.hornCd > 6, `War Horn went on cooldown (${s2.hornCd.toFixed(1)}s)`);
  await page.screenshot({ path: `${OUT}/desktop-horn.png` });
  await page.keyboard.press('e');
  await sleep(120);
  const s3 = await raidState(page);
  check(s3.chargeCd > 4, `Charge went on cooldown (${s3.chargeCd.toFixed(1)}s)`);
  // keep walking east into the village and fight for a while
  await page.keyboard.down('d');
  await sleep(2500);
  await page.keyboard.up('d');
  await sleep(4000);
  const s4 = await raidState(page);
  console.log('state after fighting:', JSON.stringify(s4));
  check(s4.aggro > 0, `defenders woke up (${s4.aggro} aggro)`);
  check(s4.fps > 50, `fps healthy (${s4.fps.toFixed(0)})`);
  await page.screenshot({ path: `${OUT}/desktop-fight.png` });
  // sample HP over a few seconds: the hero must be taking real damage or killing things
  await sleep(4000);
  const s5 = await raidState(page);
  console.log('state later:', JSON.stringify(s5));
  check(s5.enemies < 11 || s5.heroHp < s4.heroHp, 'combat is happening (enemies died or hero was hurt)');

  // force victory: set all remaining enemies to 1 hp and let the hero mop up
  await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); for (const e of r.enemies) { e.hp = 1; e.wake(); } r.hero.hp = r.hero.maxHp; });
  await autoPlay(page, 45);
  const sEnd = await raidState(page);
  console.log('after autoplay:', JSON.stringify(sEnd));
  check(!sEnd || sEnd.gold > 0, `hero collected gold by walking over coins (${sEnd && sEnd.gold})`);
  await sleep(1800);
  let sc = await activeScenes(page);
  check(sc.includes('Result'), `result scene shown after clearing (${sc})`);
  await page.screenshot({ path: `${OUT}/desktop-victory.png` });
  const back = await buttonPos(page, 'Result', 'RETURN');
  check(!!back, 'victory shows RETURN TO CAMP');
  if (back) { await page.mouse.click(back.x, back.y); await sleep(700); }
  sc = await activeScenes(page);
  check(sc.includes('Camp') && !sc.includes('Raid'), `back at camp, raid stopped (${sc})`);
  const camp = await page.evaluate(() => { const s = window.__warlord.scene.getScene('Camp'); return s.children.list.filter(c => c.type === 'Text').map(t => t.text); });
  console.log('camp texts:', JSON.stringify(camp));
  check(camp.some(t => /before Raid 2/.test(t)), 'camp says before Raid 2');
  check(camp.some(t => /Gold: [1-9]\d*/.test(t)), 'camp shows earned gold');
  await page.screenshot({ path: `${OUT}/desktop-camp2.png` });

  // buy an upgrade if affordable, then raid 2 and force a defeat → retry
  const up = await buttonPos(page, 'Camp', 'Upgrade');
  if (up) { await page.mouse.click(up.x, up.y); await sleep(400); }
  const raid2 = await buttonPos(page, 'Camp', 'RAID 2');
  check(!!raid2, 'RAID 2 button present');
  if (!raid2) throw new Error('no RAID 2 button');
  await page.mouse.click(raid2.x, raid2.y);
  await sleep(800);
  const r2 = await raidState(page);
  check(r2 && r2.enemies === 14, `raid 2 has 14 defenders (got ${r2 && r2.enemies})`);
  await page.evaluate(() => { const r = window.__warlord.scene.getScene('Raid'); r.hero.damage(9999, r.hero.x + 10, r.hero.y, 0); });
  await sleep(2200);
  sc = await activeScenes(page);
  check(sc.includes('Result'), `defeat result shown (${sc})`);
  await page.screenshot({ path: `${OUT}/desktop-defeat.png` });
  const retry = await buttonPos(page, 'Result', 'RETRY');
  check(!!retry, 'defeat shows RETRY RAID');
  if (retry) { await page.mouse.click(retry.x, retry.y); await sleep(900); }
  sc = await activeScenes(page);
  const r3 = await raidState(page);
  check(sc.includes('Raid') && sc.includes('Hud') && !sc.includes('Result'), `retry restarted the raid (${sc})`);
  check(r3 && r3.enemies === 14 && r3.heroHp > 0, `retry reloaded raid 2 fresh (enemies ${r3 && r3.enemies}, hp ${r3 && r3.heroHp})`);
  await sleep(1500);

  // --- does positioning matter? lone hero, all militia awake: inside the street vs. in the open field
  const street = await positioningTrial(page, { x: 380, y: 780 }, 'street');
  const open = await positioningTrial(page, { x: 420, y: 500 }, 'open');
  check(open.died !== null || open.hp < 60, `lone hero in the OPEN gets punished (${open.died ? 'died at ' + open.died.toFixed(1) + 's' : 'hp ' + Math.round(open.hp)})`);
  check(street.died === null || (open.died !== null && street.died > open.died + 3), `lone hero in the STREET survives longer (${street.died ? 'died at ' + street.died.toFixed(1) + 's' : 'alive, hp ' + Math.round(street.hp) + ', enemies left ' + street.enemies})`);
  check(errors.length === 0, `no console errors/warnings on desktop (${errors.length})`);
  if (errors.length) console.log(errors.slice(0, 20).join('\n'));
  await ctx.close();
}

async function phoneRun(browser) {
  console.log('=== PHONE portrait 390x844 (touch) ===');
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  await attachErrorCapture(page, errors);
  await page.goto(URL);
  await sleep(1500);
  await page.screenshot({ path: `${OUT}/phone-camp.png` });
  const sz = await page.evaluate(() => ({ canvas: window.__warlord.canvas.width + 'x' + window.__warlord.canvas.height, css: window.__warlord.canvas.style.width + ' ' + window.__warlord.canvas.style.height, dsf: window.__warlord.scale.displayScale.x }));
  console.log('phone canvas:', JSON.stringify(sz));
  check(sz.canvas === '780x1688', `phone renders at 2x device pixels (${sz.canvas})`);
  const raidBtn = await buttonPos(page, 'Camp', 'RAID');
  check(!!raidBtn, 'phone: found RAID button');
  await page.touchscreen.tap(raidBtn.x, raidBtn.y);
  await sleep(800);
  let sc = await activeScenes(page);
  check(sc.includes('Raid'), `phone: raid started by tap (${sc})`);
  await page.screenshot({ path: `${OUT}/phone-raid-start.png` });

  // raw touch drag = virtual joystick
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  const s0 = await raidState(page);
  await touch('touchStart', [{ x: 100, y: 600, id: 1 }]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [{ x: 100 + i * 6, y: 600, id: 1 }]); await sleep(30); }
  await sleep(2500);
  const s1 = await raidState(page);
  check(s1.heroX > s0.heroX + 150, `phone: joystick drag moves hero east (${Math.round(s0.heroX)} -> ${Math.round(s1.heroX)})`);
  await page.screenshot({ path: `${OUT}/phone-joystick.png` });
  // tap HORN with a second finger while still dragging
  const hud = await page.evaluate(() => { const h = window.__warlord.scene.getScene('Hud'); const d = window.__warlord.scale.displayScale.x || 1; return { horn: { x: h.horn.x / d, y: h.horn.y / d }, charge: { x: h.charge.x / d, y: h.charge.y / d } }; });
  await touch('touchStart', [{ x: 160, y: 600, id: 1 }, { x: hud.horn.x, y: hud.horn.y, id: 2 }]);
  await sleep(60);
  await touch('touchEnd', [{ x: 160, y: 600, id: 1 }]);
  await sleep(200);
  const s2 = await raidState(page);
  check(s2.hornCd > 6, `phone: horn button tapped mid-drag (cd ${s2.hornCd.toFixed(1)})`);
  await page.screenshot({ path: `${OUT}/phone-horn.png` });
  await touch('touchEnd', []);
  await sleep(200);
  const s3 = await raidState(page);
  // after releasing, joystick must be zero: hero should stop moving within a moment
  await sleep(400);
  const s4 = await raidState(page);
  check(Math.abs(s4.heroX - s3.heroX) < 40, 'phone: hero stops when finger lifts');
  await touch('touchStart', [{ x: hud.charge.x, y: hud.charge.y, id: 3 }]);
  await touch('touchEnd', []);
  await sleep(150);
  const s5 = await raidState(page);
  check(s5.chargeCd > 4, `phone: charge button works (cd ${s5.chargeCd.toFixed(1)})`);
  await sleep(2500);
  const s6 = await raidState(page);
  check(s6.fps > 40, `phone: fps ${s6.fps.toFixed(0)}`);
  await page.screenshot({ path: `${OUT}/phone-fight.png` });
  check(errors.length === 0, `phone: no console errors/warnings (${errors.length})`);
  if (errors.length) console.log(errors.slice(0, 20).join('\n'));
  await ctx.close();

  console.log('=== PHONE landscape 844x390 ===');
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 844, height: 390 } });
  const page2 = await ctx2.newPage();
  const errors2 = [];
  await attachErrorCapture(page2, errors2);
  await page2.goto(URL);
  await sleep(1200);
  await page2.screenshot({ path: `${OUT}/phone-land-camp.png` });
  const rb = await buttonPos(page2, 'Camp', 'RAID');
  await page2.touchscreen.tap(rb.x, rb.y);
  await sleep(1000);
  await page2.screenshot({ path: `${OUT}/phone-land-raid.png` });
  check(errors2.length === 0, `landscape: no errors (${errors2.length})`);
  if (errors2.length) console.log(errors2.slice(0, 10).join('\n'));
  await ctx2.close();
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
