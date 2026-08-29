// BootScene.ts — bakes the placeholder textures, waits for the two bundled fonts, then hands off
// to the title screen (so no text is ever drawn in a fallback face and cached that way).
import Phaser from 'phaser';
import { generateTextures } from '../systems/Textures';
import { DISPLAY, FONT } from './ui';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    generateTextures(this);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    const ready = fonts
      ? Promise.all([fonts.load(`700 20px ${DISPLAY}`), fonts.load(`900 20px ${DISPLAY}`), fonts.load(`400 16px ${FONT}`), fonts.load(`700 16px ${FONT}`)]).catch(() => undefined)
      : Promise.resolve(undefined);
    let started = false;
    const go = () => { if (!started) { started = true; this.scene.start('Title'); } };
    void ready.then(go);
    this.time.delayedCall(2500, go); // never wait forever on a slow font
  }
}
