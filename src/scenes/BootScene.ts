// BootScene.ts — bakes the placeholder textures, then hands off to the title screen.
import Phaser from 'phaser';
import { generateTextures } from '../systems/Textures';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    generateTextures(this);
    this.scene.start('Title');
  }
}
