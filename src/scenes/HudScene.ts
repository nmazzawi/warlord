// HudScene.ts — screen-space overlay on top of the raid: hero HP, gold, counters, the floating
// virtual joystick, and the two big ability buttons with cooldown wedges.
import Phaser from 'phaser';
import type { PlayerInput } from '../systems/PlayerInput';
import { FONT, safeInsets } from './ui';

export interface HudModel {
  heroHp: number; heroMaxHp: number; gold: number; raid: number;
  troopsAlive: number; troopsTotal: number; enemiesAlive: number;
  hornCd: number; hornMax: number; chargeCd: number; chargeMax: number; boosted: boolean;
}

interface Btn { x: number; y: number; r: number; g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; key: Phaser.GameObjects.Text; pressedUntil: number; }

export class HudScene extends Phaser.Scene {
  private input_!: PlayerInput;
  private model!: HudModel;
  private u = 1;
  private hpBg!: Phaser.GameObjects.Rectangle;
  private hpFg!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private joyBase!: Phaser.GameObjects.Arc;
  private joyKnob!: Phaser.GameObjects.Arc;
  private joyId = -1;
  private joyOrigin = new Phaser.Math.Vector2();
  private joyMax = 48;
  private horn!: Btn;
  private charge!: Btn;
  private intro!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() { super('Hud'); }

  init(data: { input: PlayerInput; model: HudModel }) {
    this.input_ = data.input;
    this.model = data.model;
  }

  create() {
    this.hpBg = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0, 0.5);
    this.hpFg = this.add.rectangle(0, 0, 10, 10, 0x5ec26a, 1).setOrigin(0, 0.5);
    this.hpText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0, 0.5);
    this.goldText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: '#f5c542', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' });
    this.infoText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#e8dcc0', stroke: '#000', strokeThickness: 3 });

    this.joyBase = this.add.circle(0, 0, 50, 0xffffff, 0.12).setStrokeStyle(2, 0xffffff, 0.35).setVisible(false);
    this.joyKnob = this.add.circle(0, 0, 22, 0xffffff, 0.35).setVisible(false);

    this.horn = this.makeBtn('HORN', 'Q', 0xd9a441);
    this.charge = this.makeBtn('CHARGE', 'E', 0x3fa9f5);

    // intro banner (screen space, so it can never be clipped by the map edge)
    this.intro = this.add.text(0, 0, `RAID ${this.model.raid}\nClear the village of its ${this.model.enemiesAlive} defenders`, {
      fontFamily: FONT, fontSize: '22px', color: '#fff8e7', stroke: '#000', strokeThickness: 5, align: 'center', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.hint = this.add.text(0, 0, 'Hold the street: they can only come two at a time.\nIn the open they will surround you.', {
      fontFamily: FONT, fontSize: '13px', color: '#ffe9a8', stroke: '#000', strokeThickness: 4, align: 'center', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.tweens.add({ targets: this.intro, alpha: 0, delay: 3200, duration: 700 });
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 5500, duration: 700 });

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.input.on('gameout', () => this.releaseJoy());
  }

  private makeBtn(label: string, key: string, color: number): Btn {
    const g = this.add.graphics();
    const l = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3, fontStyle: 'bold' }).setOrigin(0.5);
    const k = this.add.text(0, 0, key, { fontFamily: FONT, fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    const b: Btn = { x: 0, y: 0, r: 40, g, label: l, key: k, pressedUntil: 0 };
    (b as unknown as { color: number }).color = color;
    return b;
  }

  private layout() {
    const { width: w, height: h } = this.scale;
    const u = this.u = Phaser.Math.Clamp(Math.min(w, h) / 420, 0.8, 1.7);
    const ins = safeInsets(this);
    const m = 14 * u;
    const left = m + ins.left, top = m + ins.top;
    // HP bar top-left
    this.hpBg.setPosition(left, top + 9 * u).setSize(190 * u, 18 * u);
    this.hpFg.setPosition(left, top + 9 * u).setSize(190 * u, 18 * u);
    this.hpText.setPosition(left + 6 * u, top + 9 * u).setFontSize(Math.round(11 * u));
    this.goldText.setPosition(left, top + 24 * u).setFontSize(Math.round(16 * u));
    this.infoText.setPosition(left, top + 46 * u).setFontSize(Math.round(11 * u)).setLineSpacing(2 * u);
    this.intro.setPosition(w / 2, h * 0.2).setFontSize(Math.round(22 * u)).setWordWrapWidth(w - 4 * m);
    this.hint.setPosition(w / 2, h * 0.2 + 52 * u).setFontSize(Math.round(13 * u)).setWordWrapWidth(w - 4 * m);
    // ability buttons bottom-right, above the home indicator and clear of rounded corners
    const r = 40 * u;
    const by = h - m - r - 6 * u - ins.bottom;
    this.charge.x = w - m - r - 6 * u - ins.right; this.charge.y = by; this.charge.r = r;
    this.horn.x = this.charge.x - r * 2 - 22 * u; this.horn.y = by; this.horn.r = r;
    for (const b of [this.horn, this.charge]) {
      b.label.setPosition(b.x, b.y - 4 * u).setFontSize(Math.round(12 * u));
      b.key.setPosition(b.x, b.y + 12 * u).setFontSize(Math.round(10 * u));
    }
    this.joyMax = 48 * u;
    this.joyBase.setRadius(52 * u);
    this.joyKnob.setRadius(22 * u);
  }

  private hitBtn(p: Phaser.Input.Pointer): Btn | null {
    for (const b of [this.horn, this.charge]) {
      if (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.r * 1.25) return b;
    }
    return null;
  }

  private onDown(p: Phaser.Input.Pointer) {
    const b = this.hitBtn(p);
    if (b) {
      b.pressedUntil = this.time.now + 120;
      if (b === this.horn) this.input_.pressHorn(); else this.input_.pressCharge();
      return;
    }
    if (this.joyId !== -1) return;
    // anywhere else on screen starts a joystick where the thumb landed
    this.joyId = p.id;
    this.joyOrigin.set(p.x, p.y);
    this.joyBase.setPosition(p.x, p.y).setVisible(true);
    this.joyKnob.setPosition(p.x, p.y).setVisible(true);
    this.input_.joyX = 0; this.input_.joyY = 0;
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.joyId) return;
    let dx = p.x - this.joyOrigin.x, dy = p.y - this.joyOrigin.y;
    const d = Math.hypot(dx, dy);
    if (d > this.joyMax) { dx = (dx / d) * this.joyMax; dy = (dy / d) * this.joyMax; }
    // small dead zone so a resting thumb doesn't drift
    const mag = Math.min(1, d / this.joyMax);
    const scaled = mag < 0.12 ? 0 : (mag - 0.12) / 0.88;
    const len = Math.hypot(dx, dy) || 1;
    this.input_.joyX = (dx / len) * scaled;
    this.input_.joyY = (dy / len) * scaled;
    this.joyKnob.setPosition(this.joyOrigin.x + dx, this.joyOrigin.y + dy);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (p.id === this.joyId) this.releaseJoy();
  }

  private releaseJoy() {
    this.joyId = -1;
    this.input_.joyX = 0; this.input_.joyY = 0;
    this.joyBase.setVisible(false);
    this.joyKnob.setVisible(false);
  }

  update() {
    const m = this.model, u = this.u;
    const frac = Phaser.Math.Clamp(m.heroHp / m.heroMaxHp, 0, 1);
    this.hpFg.width = 190 * u * frac;
    this.hpFg.setFillStyle(frac > 0.5 ? 0x5ec26a : frac > 0.25 ? 0xe0b040 : 0xe0453a);
    this.hpText.setText(`${Math.ceil(m.heroHp)} / ${m.heroMaxHp}`);
    this.goldText.setText(`⬤ ${m.gold} gold`);
    this.infoText.setText(`Raid ${m.raid}  ·  Troops ${m.troopsAlive}/${m.troopsTotal}\nDefenders left ${m.enemiesAlive}${m.boosted ? '  ·  RALLIED!' : ''}`);
    this.drawBtn(this.horn, m.hornCd, m.hornMax);
    this.drawBtn(this.charge, m.chargeCd, m.chargeMax);
  }

  private drawBtn(b: Btn, cd: number, max: number) {
    const color = (b as unknown as { color: number }).color;
    const ready = cd <= 0;
    const pressed = this.time.now < b.pressedUntil;
    const r = b.r * (pressed ? 0.9 : 1);
    const g = b.g;
    g.clear();
    g.fillStyle(0x000000, 0.45).fillCircle(b.x + 2, b.y + 3, r);
    g.fillStyle(color, ready ? 1 : 0.45).fillCircle(b.x, b.y, r);
    g.lineStyle(3, 0xffffff, ready ? 0.9 : 0.35).strokeCircle(b.x, b.y, r);
    if (!ready) {
      // dark wedge shrinks clockwise as the cooldown runs out
      const frac = Phaser.Math.Clamp(cd / max, 0, 1);
      g.fillStyle(0x000000, 0.55);
      g.slice(b.x, b.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      g.fillPath();
    } else {
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 180);
      g.lineStyle(2, 0xffffff, 0.25 + 0.35 * pulse).strokeCircle(b.x, b.y, r + 4 + 3 * pulse);
    }
    b.label.setAlpha(ready ? 1 : 0.6);
    b.key.setAlpha(ready ? 1 : 0.6);
  }
}
