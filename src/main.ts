// main.ts — boots Phaser. Fills the whole browser window, renders at the device's real pixel
// density (capped at 2x so mid-range phones stay smooth), and re-lays out on rotation/resize.
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CampScene } from './scenes/CampScene';
import { RaidScene } from './scenes/RaidScene';
import { HudScene } from './scenes/HudScene';
import { ResultScene } from './scenes/ResultScene';
import { Sound } from './systems/Sound';

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
  scene: [BootScene, CampScene, RaidScene, HudScene, ResultScene],
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
(window as unknown as { __warlord: Phaser.Game }).__warlord = game;

// Browsers only allow audio after a real tap or key press — unlock on the first one (and again after
// iOS interrupts the audio for a call or an app switch).
const unlock = () => Sound.unlock();
for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown']) {
  window.addEventListener(ev, unlock, { passive: true });
}
