// main.ts — boots Phaser. Fills the whole browser window and re-lays out on rotation/resize.
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { CampScene } from './scenes/CampScene';
import { RaidScene } from './scenes/RaidScene';
import { HudScene } from './scenes/HudScene';
import { ResultScene } from './scenes/ResultScene';
import { Sound } from './systems/Sound';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1a1410',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  input: { activePointers: 3 }, // thumb on the joystick + a finger on a button at the same time
  disableContextMenu: true,
  render: { antialias: true, pixelArt: false, powerPreference: 'high-performance' },
  scene: [BootScene, CampScene, RaidScene, HudScene, ResultScene],
});

// Browsers only allow audio after a real tap or key press — unlock on the first one.
const unlock = () => Sound.unlock();
window.addEventListener('pointerdown', unlock, { passive: true });
window.addEventListener('keydown', unlock);
window.addEventListener('touchstart', unlock, { passive: true });
