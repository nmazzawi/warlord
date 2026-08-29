// HudScene.ts — screen-space overlay on top of a battle: hero HP, gold, counters, the floating
// joystick, the two big ability buttons with cooldown wedges, and the intro banner.
import Phaser from 'phaser';
import type { PlayerInput } from '../systems/PlayerInput';
import { Joystick } from '../systems/Joystick';
import { CSS, displayStyle, dprOf, FONT, PAL, safeInsets, uiStyle } from './ui';

export interface HudModel {
  title: string; hint: string; name: string;
  heroHp: number; heroMaxHp: number; gold: number;
  troopsAlive: number; troopsTotal: number; enemiesAlive: number;
  hornCd: number; hornMax: number; chargeCd: number; chargeMax: number; boosted: boolean;
  defense: number;
  weapon: string;
  /** siege: gate HP fraction (or null) */
  gate: number | null;
  objective: string;
}

interface Btn { x: number; y: number; r: number; g: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text; key: Phaser.GameObjects.Text; pressedUntil: number; color: number; }

export class HudScene extends Phaser.Scene {
  private input_!: PlayerInput;
  private model!: HudModel;
  private u = 1;
  private hpBg!: Phaser.GameObjects.Rectangle;
  private hpFg!: Phaser.GameObjects.Rectangle;
  private hpText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private objectiveText!: Phaser.GameObjects.Text;
  private joystick!: Joystick;
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
    this.input_.joyX = 0; this.input_.joyY = 0;
    this.hpBg = this.add.rectangle(0, 0, 10, 10, PAL.ironEdge, 0.85).setOrigin(0, 0.5).setStrokeStyle(2, PAL.gold, 0.8);
    this.hpFg = this.add.rectangle(0, 0, 10, 10, 0x6f9a4f, 1).setOrigin(0, 0.5);
    this.hpText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: '#ffffff', stroke: '#000', strokeThickness: 3, fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.goldText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '16px', color: CSS.goldHi, stroke: '#000', strokeThickness: 4, fontStyle: 'bold' });
    this.infoText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: CSS.cream, stroke: '#000', strokeThickness: 3, fontStyle: 'bold' });
    this.objectiveText = this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '12px', color: CSS.goldHi, stroke: '#000', strokeThickness: 3, fontStyle: 'bold' });

    this.horn = this.makeBtn('HORN', 'Q', PAL.gold);
    this.charge = this.makeBtn('CHARGE', 'E', PAL.ember);
    this.joystick = new Joystick(this, this.input_, p => this.hitBtn(p) !== null);

    this.intro = this.add.text(0, 0, `${this.model.title}\n${this.model.objective}`, { ...displayStyle(22, CSS.goldHi), align: 'center' }).setOrigin(0.5);
    this.hint = this.add.text(0, 0, this.model.hint, uiStyle(13, CSS.cream, { stroke: true })).setOrigin(0.5);
    this.tweens.add({ targets: this.intro, alpha: 0, delay: 3200, duration: 700 });
    this.tweens.add({ targets: this.hint, alpha: 0, delay: 5500, duration: 700 });

    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.input_.joyX = 0; this.input_.joyY = 0;
    });
    this.input.on('pointerdown', this.onDown, this);
  }

  private makeBtn(label: string, key: string, color: number): Btn {
    const g = this.add.graphics();
    const l = this.add.text(0, 0, label, { fontFamily: FONT, fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3, fontStyle: 'bold', align: 'center' }).setOrigin(0.5);
    const k = this.add.text(0, 0, key, { fontFamily: FONT, fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
    return { x: 0, y: 0, r: 40, g, label: l, key: k, pressedUntil: 0, color };
  }

  private layout() {
    const { width: w, height: h } = this.scale;
    const dpr = dprOf(this);
    const u = this.u = Phaser.Math.Clamp(Math.min(w, h) / dpr / 420, 0.8, 1.7) * dpr;
    const ins = safeInsets(this);
    const m = 14 * u;
    const left = m + ins.left, top = m + ins.top;
    this.hpBg.setPosition(left, top + 9 * u).setSize(190 * u, 18 * u);
    this.hpFg.setPosition(left, top + 9 * u).setSize(190 * u, 18 * u);
    this.hpText.setPosition(left + 6 * u, top + 9 * u).setFontSize(Math.round(11 * u));
    this.goldText.setPosition(left, top + 24 * u).setFontSize(Math.round(16 * u));
    this.infoText.setPosition(left, top + 46 * u).setFontSize(Math.round(11 * u)).setLineSpacing(2 * u);
    this.objectiveText.setPosition(left, top + 78 * u).setFontSize(Math.round(11 * u));
    this.intro.setPosition(w / 2, h * 0.2).setFontSize(Math.round(22 * u)).setWordWrapWidth(w - 4 * m);
    this.hint.setPosition(w / 2, h * 0.2 + 52 * u).setFontSize(Math.round(13 * u)).setWordWrapWidth(w - 4 * m);
    const r = 40 * u;
    const by = h - m - r - 6 * u - ins.bottom;
    this.charge.x = w - m - r - 6 * u - ins.right; this.charge.y = by; this.charge.r = r;
    this.horn.x = this.charge.x - r * 2 - 22 * u; this.horn.y = by; this.horn.r = r;
    for (const b of [this.horn, this.charge]) {
      b.label.setPosition(b.x, b.y - 4 * u).setFontSize(Math.round(12 * u));
      b.key.setPosition(b.x, b.y + 12 * u).setFontSize(Math.round(10 * u));
    }
    this.joystick.layout(u);
  }

  private hitBtn(p: Phaser.Input.Pointer): Btn | null {
    for (const b of [this.horn, this.charge]) {
      if (Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= b.r * 1.25) return b;
    }
    return null;
  }

  private onDown(p: Phaser.Input.Pointer) {
    const b = this.hitBtn(p);
    if (!b) return;
    b.pressedUntil = this.time.now + 120;
    if (b === this.horn) this.input_.pressHorn(); else this.input_.pressCharge();
  }

  update() {
    const m = this.model, u = this.u;
    const frac = Phaser.Math.Clamp(m.heroHp / m.heroMaxHp, 0, 1);
    this.hpFg.width = 190 * u * frac;
    this.hpFg.setFillStyle(frac > 0.5 ? 0x6f9a4f : frac > 0.25 ? PAL.gold : PAL.dangerHi);
    this.hpText.setText(`${Math.ceil(m.heroHp)} / ${m.heroMaxHp}${m.defense ? `   ·   DEF ${m.defense}` : ''}`);
    this.goldText.setText(`⬤ ${m.gold} gold`);
    this.infoText.setText(`${m.name}  ·  ${m.weapon}  ·  Troops ${m.troopsAlive}/${m.troopsTotal}\nDefenders left ${m.enemiesAlive}${m.boosted ? '  ·  RALLIED!' : ''}`);
    this.objectiveText.setText(m.gate !== null ? `GATE ${Math.ceil(m.gate * 100)}%  ·  ${m.objective}` : m.objective);
    this.drawBtn(this.horn, m.hornCd, m.hornMax);
    this.drawBtn(this.charge, m.chargeCd, m.chargeMax);
  }

  private drawBtn(b: Btn, cd: number, max: number) {
    const ready = cd <= 0;
    const pressed = this.time.now < b.pressedUntil;
    const r = b.r * (pressed ? 0.9 : 1);
    const g = b.g;
    g.clear();
    g.fillStyle(0x000000, 0.45).fillCircle(b.x + 2, b.y + 4, r + 3);
    g.fillStyle(PAL.ironEdge, 1).fillCircle(b.x, b.y, r + 3);
    g.fillStyle(b.color, ready ? 1 : 0.45).fillCircle(b.x, b.y, r);
    g.fillStyle(0xffffff, ready ? 0.18 : 0.08).fillEllipse(b.x, b.y - r * 0.45, r * 1.3, r * 0.7);
    g.lineStyle(2, PAL.goldHi, ready ? 0.9 : 0.35).strokeCircle(b.x, b.y, r - 1);
    if (!ready) {
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
