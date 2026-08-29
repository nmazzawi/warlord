// shoot-chart.mjs — screenshots of the world chart at several zooms, so the atlas can be eyeballed
// without playing. Run with the dev server up:  node tools/shoot-chart.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';

const URL = process.env.URL || 'http://localhost:5173/';
const OUT = process.env.OUT || 'tests/chart';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const VIEWS = [
  { name: 'world', zoom: 0, at: null },
  { name: 'europe', zoom: 1.0, at: [2950, 1150] },
  { name: 'asia', zoom: 0.9, at: [4150, 1050] },
  { name: 'americas', zoom: 0.9, at: [800, 1300] },
  { name: 'capitals', zoom: 0.62, at: [3050, 1150] },
  { name: 'steppe', zoom: 2.2, at: [4437, 1070] },
  { name: 'homeland', zoom: null, at: null },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/GL Driver/.test(m.text())) errors.push(m.text()); });
await page.goto(URL);
await sleep(2500);

// straight into a new warband, then the map
const btn = await page.evaluate(() => {
  const t = window.__warlord.scene.getScene('Title');
  for (const c of t.children.list) {
    if (c.type !== 'Container') continue;
    const txt = c.list.find(x => x.type === 'Text' && /NEW/.test(x.text));
    if (txt) { const d = window.__warlord.scale.displayScale.x || 1; return { x: c.x / d, y: c.y / d }; }
  }
  return null;
});
if (!btn) throw new Error('no NEW button on the title screen');
await page.mouse.click(btn.x, btn.y);
await sleep(1500);
await page.evaluate(() => { window.__GameState.save(); window.__warlord.scene.getScene('Settlement')?.scene.start('Map'); });
await sleep(2500);
await page.evaluate(() => window.__warlord.scene.getScene('MapHud')?.hidePanel());

for (const v of VIEWS) {
  await page.evaluate(([zoom, at]) => {
    const s = window.__warlord.scene.getScene('Map');
    const cam = s.cameras.main;
    cam.stopFollow();
    if (zoom === 0) s.setZoom(0.0001);
    else if (zoom === null) s.zoomToTerritory();
    else s.setZoom(zoom);
    if (at) cam.centerOn(at[0], at[1]);
    else if (zoom === 0) cam.centerOn(2700, 1620);
    cam.preRender();
  }, [v.zoom, v.at]);
  await sleep(700);
  await page.screenshot({ path: `${OUT}/${v.name}.png` });
  const z = await page.evaluate(() => window.__warlord.scene.getScene('Map').cameras.main.zoom);
  await sleep(900);
  const fps = await page.evaluate(() => window.__warlord.loop.actualFps);
  console.log(`${v.name}: zoom ${z.toFixed(3)}  fps ${fps.toFixed(0)}`);
}
console.log(errors.length ? `ERRORS:\n${errors.slice(0, 8).join('\n')}` : 'no console errors');
await browser.close();
