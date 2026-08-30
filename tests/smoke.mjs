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
  const fonts = await page.evaluate(() => ({ cinzel: document.fonts.check('700 20px Cinzel'), nunito: document.fonts.check('700 16px "Nunito Sans"') }));
  check(fonts.cinzel && fonts.nunito, `self-hosted fonts loaded (${JSON.stringify(fonts)})`);
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
        for (const o of [k.icon, k.label]) {
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
  check(romeSpec.title === 'THE ROMAN EMPIRE' && /Throne: Roma/.test(romeSpec.lines) && /gates are open to a stranger/.test(romeSpec.lines),
    `tapping a realm gives its card (${romeSpec.title})`);
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
  check(!gates.realms.includes('japan') && !gates.realms.includes('viking') && !gates.realms.includes('aztecs') && !gates.realms.includes('inca'),
    'realms across water stay shut');
  const romaDays = await page.evaluate(() => window.__warlord.scene.getScene('Map').routeDays('f_rome_roma'));
  check(romaDays >= 21, `Rome is honestly far: ${romaDays} days' march from the camp`);
  // every gate must be a place the march actually ENDS on — Rome's own point is on a cell this map
  // calls sea, and Korinthos, Kawa and Abdju each stand a few units from a bigger neighbour
  const landsOn = await page.evaluate(() => {
    const m = window.__warlord.scene.getScene('Map');
    const bad = [];
    for (const n of window.__NODES.filter(x => x.kind === 'foreign')) {
      const r = m.planTo(n.id);
      if (!r) { bad.push(`${n.name}: no route`); continue; }
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
  check(war.count >= 78 && war.byRank.village >= 10 && war.byRank.capital === 9,
    `every place in nine realms can be marched on: ${war.count} (${JSON.stringify(war.byRank)})`);
  check(war.village.total < war.romaTown.total && war.romaTown.total < war.roma.total,
    `garrisons climb: a Rus village ${war.village.total}, a Roman town ${war.romaTown.total}, Roma ${war.roma.total}`);
  check(war.kush.total < war.roma.total && war.kush.stat < war.roma.stat,
    `a realm's own strength counts: Meroe ${war.kush.total} at x${war.kush.stat}, Roma ${war.roma.total} at x${war.roma.stat}`);
  check(war.max <= 58, `no battle fields more men than a phone can draw (worst ${war.max})`);
  check(war.village.elites >= 2 && /\w/.test(war.village.elite), `realms field their own men (${war.village.elites} ${war.village.elite})`);
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
  check(/later age|comes in a/.test(inRus.lines), 'and says plainly that war there is for a later age');
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
  await page.evaluate(() => { const s = window.__warlord.scene.getScene('Settlement'); s.scene.start('Map'); });
  await sleep(1200);
  // put the warband back where the rest of the run expects it
  await page.evaluate(() => { const S = window.__GameState; const n = window.__NODES.find(k => k.id === 'camp');
    S.pos = { x: n.x, y: n.y }; S.location = 'camp'; S.hunters = []; S.save(); });
  await page.evaluate(() => { const m = window.__warlord.scene.getScene('Map'); m.token.setPosition(window.__GameState.pos.x, window.__GameState.pos.y - 12); m.zoomToTerritory(); });
  await hidePanel(page);      // the map reopens on Kiev's card, and a leftover card eats the next tap
  await sleep(400);

  // --- raid Ashford and just leave
  check(await marchTo(page, 'ashford'), 'marched to Ashford');
  let r = await raidHere(page);
  check(r && r.enemies === 11, `Ashford: ${r && r.enemies} defenders`);
  await autoPlay(page, 60);
  await sleep(1800);
  check(await waitScene(page, 'Result'), 'victory result');
  const choices = await page.evaluate(() => window.__warlord.scene.getScene('Result').children.list.filter(c => c.type === 'Container').map(c => c.list.find(t => t.type === 'Text')?.text));
  check(choices.includes('SACK') && choices.includes('OCCUPY') && choices.includes('LEAVE'), `conquest choice offered (${choices.join('/')})`);
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
  const cards = await page.evaluate(() => window.__warlord.scene.getScene('Settlement').children.list.filter(c => c.type === 'Container').map(c => c.list.filter(t => t.type === 'Text').map(t => t.text).join('|')));
  check(cards.some(c => /BARRACKS.*locked/.test(c)) && cards.some(c => /^INN/.test(c)), `visit screen: barracks locked, inn present (${cards.length} cards)`);
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
