// main.ts — boots Phaser. Fills the whole browser window, renders at the device's real pixel
// density (capped at 2x so mid-range phones stay smooth), and re-lays out on rotation/resize.
import Phaser from 'phaser';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/700.css';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { MapScene } from './scenes/MapScene';
import { MapHudScene } from './scenes/MapHudScene';
import { SettlementScene } from './scenes/SettlementScene';
import { ShopScene } from './scenes/ShopScene';
import { RaidScene } from './scenes/RaidScene';
import { HudScene } from './scenes/HudScene';
import { ResultScene } from './scenes/ResultScene';
import { Sound } from './systems/Sound';
import { GameState } from './state/GameState';
import { NODES } from './world/WorldMap';
import { campBattle, patrolBattle, siegeBattle, steppePatrolBattle, villageBattle } from './world/Battles';
import { CAMPS, campLocation } from './world/Steppe';
import { REGIONS, SEA_ROUTES } from './world/WorldChart';
import { STEPPE } from './config/balance';

const dpr = Math.min(window.devicePixelRatio || 1, 2);
const px = (css: number) => Math.max(1, Math.floor(css * dpr));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1a1410',
  scale: {
    // NONE + zoom 1/dpr: the canvas has dpr× as many pixels as its CSS size, so shapes and text are crisp.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: px(window.innerWidth),
    height: px(window.innerHeight),
    zoom: 1 / dpr,
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  input: { activePointers: 3 }, // thumb on the joystick + a finger on a button at the same time
  disableContextMenu: true,
  render: { antialias: true, pixelArt: false, powerPreference: 'high-performance' },
  scene: [BootScene, TitleScene, MapScene, MapHudScene, SettlementScene, ShopScene, RaidScene, HudScene, ResultScene],
});

// Keep the canvas matched to the window (Phaser's own resize handling is off in NONE mode).
let fitTimer = 0;
const fit = () => {
  const w = px(window.innerWidth), h = px(window.innerHeight);
  if (game.scale.width !== w || game.scale.height !== h) game.scale.resize(w, h);
};
const fitSoon = () => { window.clearTimeout(fitTimer); fitTimer = window.setTimeout(fit, 60); };
window.addEventListener('resize', fitSoon);
window.addEventListener('orientationchange', fitSoon);
window.visualViewport?.addEventListener('resize', fitSoon);

// Debug handle so automated smoke tests (and curious developers) can poke at scenes from the console.
(window as unknown as { __warlord: Phaser.Game; __GameState: typeof GameState; __NODES: typeof NODES }).__warlord = game;
(window as unknown as { __GameState: typeof GameState }).__GameState = GameState;
(window as unknown as { __NODES: typeof NODES }).__NODES = NODES;
(window as unknown as { __battles: object }).__battles = { villageBattle, siegeBattle, patrolBattle, campBattle, steppePatrolBattle };
(window as unknown as { __CAMPS: typeof CAMPS; __campLocation: typeof campLocation; __REGIONS: typeof REGIONS }).__CAMPS = CAMPS;
(window as unknown as { __campLocation: typeof campLocation }).__campLocation = campLocation;
(window as unknown as { __REGIONS: typeof REGIONS }).__REGIONS = REGIONS;
(window as unknown as { __SEA_ROUTES: typeof SEA_ROUTES }).__SEA_ROUTES = SEA_ROUTES;
(window as unknown as { __STEPPE: typeof STEPPE }).__STEPPE = STEPPE;

// Save when the tab is hidden or closed (belt and braces — the game also saves at every safe point).
window.addEventListener('pagehide', () => GameState.save());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') GameState.save(); });

// Browsers only allow audio after a real tap or key press — unlock on the first one (and again after
// iOS interrupts the audio for a call or an app switch).
const unlock = () => Sound.unlock();
for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, unlock, { passive: true });
}
