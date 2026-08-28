// BootScene.ts — bakes the placeholder textures, then hands off to the camp.
import Phaser from 'phaser';
import { generateTextures } from '../systems/Textures';
import { generateGroundTexture } from '../world/Village';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  create() {
    generateTextures(this);
    generateGroundTexture(this);
    this.scene.start('Camp');
  }
}
