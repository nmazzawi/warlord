// CampScene.ts — your home, as a place: walk the warlord between the Forge, the Barracks and the
// Stables and step up to a door to trade. The road out leads back to the world map.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { HERO } from '../config/balance';
import { PlayerInput } from '../systems/PlayerInput';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import { mulberry32 } from '../utils/rng';
import type { HudModel } from './HudScene';
import { FONT } from './ui';

export type BuildingId = 'forge' | 'barracks' | 'stables';
interface Building { id: BuildingId; label: string; x: number; y: number; tex: string; w: number; h: number; }

const CAMP = { w: 960, h: 640 };
const BUILDINGS: Building[] = [
  { id: 'forge', label: 'FORGE', x: 230, y: 170, tex: TEX.forge, w: 160, h: 110 },
  { id: 'barracks', label: 'BARRACKS', x: 560, y: 160, tex: TEX.barracks, w: 170, h: 110 },
  { id: 'stables', label: 'STABLES', x: 760, y: 440, tex: TEX.stables, w: 180, h: 110 },
];
const EXIT = { x: 90, y: 560 };
const FIRE = { x: 470, y: 400 };

export class CampScene extends Phaser.Scene {
  private hero!: Phaser.Physics.Arcade.Sprite;
  private mount: Phaser.GameObjects.Image | null = null;
  private facing = new Phaser.Math.Vector2(1, 0);
  private playerInput!: PlayerInput;
  private hud!: HudModel;
  private prompt!: Phaser.GameObjects.Text;
  private troopSprites: Phaser.GameObjects.GameObject[] = [];
  private tmp = new Phaser.Math.Vector2();
  private shopOpen = false;

  constructor() { super('Camp'); }

  create() {
    this.shopOpen = false;
    this.troopSprites = [];
    this.add.image(0, 0, this.groundTexture()).setOrigin(0).setDepth(0);
    this.physics.world.setBounds(0, 0, CAMP.w, CAMP.h);

    const solids = this.physics.add.staticGroup();
    for (const b of BUILDINGS) {
      (solids.create(b.x, b.y, b.tex) as Phaser.Physics.Arcade.Sprite).setDepth(10);
      this.add.text(b.x, b.y - b.h / 2 - 6, b.label, { fontFamily: FONT, fontSize: '15px', color: '#fff8e7', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(12);
      // the doorstep
      this.add.ellipse(b.x, b.y + b.h / 2 + 26, 110, 40, 0xffffff, 0.08).setDepth(1);
    }
    (solids.create(360, 470, TEX.tent) as Phaser.Physics.Arcade.Sprite).setDepth(10);
    (solids.create(600, 500, TEX.tent) as Phaser.Physics.Arcade.Sprite).setDepth(10);
    this.add.image(FIRE.x, FIRE.y, TEX.campfire).setDepth(9);
    const glow = this.add.circle(FIRE.x, FIRE.y, 60, 0xff8a2a, 0.12).setDepth(2);
    this.tweens.add({ targets: glow, alpha: 0.05, scale: 1.15, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.image(EXIT.x + 40, EXIT.y - 40, TEX.signpost).setDepth(10);
    this.add.text(EXIT.x + 40, EXIT.y - 66, 'to the road', { fontFamily: FONT, fontSize: '12px', color: '#ffe9a8', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(12);
    this.add.ellipse(EXIT.x, EXIT.y, 110, 50, 0xffffff, 0.08).setDepth(1);

    // the warlord, dressed as bought
    const scale = GameState.heroScale;
    this.hero = this.physics.add.sprite(180, 470, TEX.hero).setDepth(21).setScale(scale);
    this.hero.setCircle(HERO.radius, 13 - HERO.radius, 13 - HERO.radius).setCollideWorldBounds(true);
    if (GameState.horse !== 'none') this.mount = this.add.image(this.hero.x, this.hero.y + 4, TEX.horse).setDepth(20).setScale(scale);
    this.physics.add.collider(this.hero, solids);
    this.prompt = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#fff8e7', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5, 1).setDepth(50);

    this.cameras.main.setBounds(0, 0, CAMP.w, CAMP.h);
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);

    this.playerInput = new PlayerInput();
    this.playerInput.attachKeyboard(this, 'camp');
    this.input.keyboard?.on('keydown-M', () => this.leave());
    this.hud = {
      mode: 'camp', title: 'BANDIT CAMP', hint: 'Walk up to a building and press ENTER (E).\nThe road at the bottom-left leads to the map.', name: 'Camp',
      heroHp: 1, heroMaxHp: 1, gold: GameState.gold, day: GameState.dateLabel,
      troopsAlive: GameState.troops.length, troopsTotal: GameState.troops.length, enemiesAlive: 0,
      hornCd: 0, hornMax: 1, chargeCd: 0, chargeMax: 1, boosted: false, interactLabel: null, defense: GameState.defense,
    };
    this.scene.launch('Hud', { input: this.playerInput, model: this.hud, onMap: () => this.leave() });
    this.placeTroops();

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.scene.stop('Hud');
      this.scene.stop('Shop');
    });
  }

  private applyZoom() {
    const { width, height } = this.scale;
    this.cameras.main.setZoom(Phaser.Math.Clamp(Math.min(width, height) / 520, 0.75, 2.2));
  }

  private groundTexture() {
    const key = 'ground_camp';
    if (this.textures.exists(key)) return key;
    const rnd = mulberry32(99);
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x4f5e36, 1).fillRect(0, 0, CAMP.w, CAMP.h);
    for (let i = 0; i < 120; i++) {
      const x = rnd() * CAMP.w, y = rnd() * CAMP.h, r = 10 + rnd() * 36;
      g.fillStyle(rnd() > 0.5 ? 0x46552f : 0x5b6b42, 0.5).fillCircle(x, y, r);
    }
    g.fillStyle(0x8a7048, 1).fillEllipse(480, 400, 520, 300);
    g.lineStyle(44, 0x8a7048, 1).beginPath(); g.moveTo(90, 560); g.lineTo(240, 470); g.lineTo(300, 420); g.strokePath();
    g.fillStyle(0x3a2f20, 1).fillCircle(FIRE.x, FIRE.y, 30);
    for (let i = 0; i < 40; i++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 240;
      g.fillStyle(0x6f5a3c, 0.8).fillCircle(480 + Math.cos(a) * d, 400 + Math.sin(a) * d * 0.6, 1.5 + rnd() * 2);
    }
    g.generateTexture(key, CAMP.w, CAMP.h);
    g.destroy();
    return key;
  }

  /** Troops loaf around the fire; rebuilt after the barracks changes the roster. */
  placeTroops() {
    for (const s of this.troopSprites) s.destroy();
    this.troopSprites = [];
    GameState.troops.forEach((t, i) => {
      const a = -0.4 + i * 0.75;
      const x = FIRE.x + Math.cos(a) * 62, y = FIRE.y + 10 + Math.sin(a) * 40;
      const img = this.add.image(x, y, TEX.troop).setDepth(20);
      const label = this.add.text(x, y - 16, t.name, { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9px', color: '#d8ffd8', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 1).setDepth(42);
      this.tweens.add({ targets: img, y: y - 2, duration: 600 + i * 90, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      this.troopSprites.push(img, label);
    });
    this.hud.troopsTotal = GameState.troops.length;
    this.hud.troopsAlive = GameState.troops.length;
  }

  update(_time: number, delta: number) {
    if (this.shopOpen) return;
    const dt = Math.min(delta, 50) / 1000;
    void dt;
    const move = this.playerInput.getMove(this.tmp);
    if (move.lengthSq() > 0.001) this.facing.copy(move).normalize();
    const spd = HERO.speed * GameState.speedMult;
    this.hero.setVelocity(move.x * spd, move.y * spd);
    if (this.mount) this.mount.setPosition(this.hero.x, this.hero.y + 4 * this.hero.scaleY).setFlipX(this.facing.x < 0);

    // near a door?
    let near: Building | null = null;
    for (const b of BUILDINGS) {
      if (Phaser.Math.Distance.Between(this.hero.x, this.hero.y, b.x, b.y + b.h / 2 + 26) < 62) near = b;
    }
    const atExit = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, EXIT.x, EXIT.y) < 62;
    this.hud.interactLabel = near ? `ENTER\n${near.label}` : atExit ? 'LEAVE\nCAMP' : null;
    this.prompt.setPosition(this.hero.x, this.hero.y - 24 * this.hero.scaleY)
      .setText(near ? `${near.label} — ENTER` : atExit ? 'LEAVE CAMP — ENTER' : '').setVisible(!!(near || atExit));
    this.hud.gold = GameState.gold;

    if (this.playerInput.consumeInteract()) {
      if (near) this.openShop(near.id);
      else if (atExit) this.leave();
    }
  }

  private openShop(id: BuildingId) {
    this.shopOpen = true;
    this.hero.setVelocity(0, 0);
    Sound.door();
    this.scene.sleep('Hud');
    this.scene.launch('Shop', {
      building: id,
      onClose: () => {
        this.scene.stop('Shop');
        this.scene.wake('Hud');
        this.scene.resume();
        this.shopOpen = false;
        this.placeTroops();
        this.hud.defense = GameState.defense;
        this.hud.day = GameState.dateLabel;
        this.refreshHeroLook();
      },
    });
    this.scene.pause();
  }

  private refreshHeroLook() {
    const scale = GameState.heroScale;
    this.hero.setScale(scale);
    if (GameState.horse !== 'none' && !this.mount) this.mount = this.add.image(this.hero.x, this.hero.y + 4, TEX.horse).setDepth(20);
    if (GameState.horse === 'none' && this.mount) { this.mount.destroy(); this.mount = null; }
    this.mount?.setScale(scale);
  }

  private leave() {
    GameState.location = 'camp';
    GameState.save();
    this.scene.stop('Hud');
    this.scene.start('Map');
  }
}
