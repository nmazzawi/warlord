// MapHudScene.ts — screen-space overlay for the world map: date, gold, troops, the infamy meter,
// your bounty, and the pop-up panel for whatever place you're standing at.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { INFAMY } from '../config/balance';
import { FONT, makeButton, safeInsets, uiUnit } from './ui';

export interface PanelButton { label: string; color?: number; enabled?: boolean; onPress: () => void; }
export interface PanelSpec { title: string; lines: string[]; buttons: PanelButton[]; }

export class MapHudScene extends Phaser.Scene {
  private u = 1;
  private bar!: Phaser.GameObjects.Rectangle;
  private dateText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private troopText!: Phaser.GameObjects.Text;
  private infamyLabel!: Phaser.GameObjects.Text;
  private infamyBg!: Phaser.GameObjects.Rectangle;
  private infamyFg!: Phaser.GameObjects.Rectangle;
  private bountyText!: Phaser.GameObjects.Text;
  private titleBtn!: Phaser.GameObjects.Container;
  private panelObjects: Phaser.GameObjects.GameObject[] = [];
  private panelRect: Phaser.Geom.Rectangle | null = null;
  private spec: PanelSpec | null = null;

  constructor() { super('MapHud'); }

  create() {
    this.panelObjects = [];
    this.panelRect = null;
    this.spec = null;
    this.bar = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.55).setOrigin(0);
    const t = (size: number, color: string) => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 3, fontStyle: 'bold' });
    this.dateText = t(14, '#fff8e7');
    this.goldText = t(16, '#f5c542');
    this.troopText = t(12, '#c8f0c8');
    this.infamyLabel = t(12, '#ffb0b0');
    this.infamyBg = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0, 0.5);
    this.infamyFg = this.add.rectangle(0, 0, 10, 10, 0xc03030, 1).setOrigin(0, 0.5);
    this.bountyText = t(12, '#e0b0b0');
    this.titleBtn = makeButton(this, 0, 0, { width: 96, height: 36, label: 'SAVE & QUIT', color: 0x444444, fontSize: 11,
      onPress: () => { GameState.save(); this.scene.stop('Map'); this.scene.start('Title'); } });
    this.layout();
    this.refresh();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  private layout() {
    const { width: w, height: h } = this.scale;
    const u = this.u = uiUnit(w, h);
    const ins = safeInsets(this);
    const m = 10 * u;
    const top = ins.top;
    const left = m + ins.left;
    this.bar.setPosition(0, 0).setSize(w, top + 62 * u);
    this.dateText.setPosition(left, top + 6 * u).setFontSize(Math.round(13 * u));
    this.goldText.setPosition(left, top + 24 * u).setFontSize(Math.round(16 * u));
    this.troopText.setPosition(left, top + 44 * u).setFontSize(Math.round(11 * u));
    const ix = Math.min(w * 0.5, left + 230 * u);
    const btnW = 96 * u;
    const colW = Math.max(120 * u, w - ix - btnW - 2 * m - ins.right);
    this.infamyLabel.setPosition(ix, top + 6 * u).setFontSize(Math.round(11 * u)).setWordWrapWidth(colW);
    this.infamyBg.setPosition(ix, top + 30 * u).setSize(Math.min(150 * u, colW), 12 * u);
    this.infamyFg.setPosition(ix, top + 30 * u).setSize(Math.min(150 * u, colW), 12 * u);
    this.bountyText.setPosition(ix, top + 40 * u).setFontSize(Math.round(11 * u)).setWordWrapWidth(colW);
    this.titleBtn.setPosition(w - m - ins.right - btnW / 2, top + 24 * u).setScale(u);
    if (this.spec) this.showPanel(this.spec);
    void h;
  }

  /** Re-read the game state (called by the map after every arrival / purchase). */
  refresh() {
    this.dateText.setText(GameState.dateLabel);
    this.goldText.setText(`⬤ ${GameState.gold} gold`);
    this.troopText.setText(`Troops ${GameState.troops.length}   ·   ${GameState.weaponKind === 'bow' ? 'Bow' : ['Rusty Sword', 'Iron Sword', 'Warlord Blade'][GameState.weaponTier - 1]}${GameState.horse !== 'none' ? '  ·  mounted' : ''}${GameState.defense ? `  ·  DEF ${GameState.defense}` : ''}`);
    const tier = GameState.infamyTier;
    const next = GameState.infamyNextMin;
    const cur = INFAMY.tiers[tier].min;
    const frac = next === null ? 1 : Phaser.Math.Clamp((GameState.infamy - cur) / (next - cur), 0, 1);
    this.infamyLabel.setText(`INFAMY ${GameState.infamy}  ·  ${GameState.infamyTierName.toUpperCase()}${next !== null ? `  (${INFAMY.tiers[tier + 1].name} at ${next})` : ''}`);
    this.infamyFg.width = this.infamyBg.width * frac;
    this.bountyText.setText(GameState.bounty > 0 ? `Bounty: ${GameState.bounty} gold` : 'No bounty yet');
  }

  get panelOpen() { return this.spec !== null; }
  panelContains(x: number, y: number) { return !!this.panelRect && this.panelRect.contains(x, y); }

  showPanel(spec: PanelSpec) {
    this.hidePanel();
    this.spec = spec;
    const { width: w, height: h } = this.scale;
    const u = this.u;
    const ins = safeInsets(this);
    const pw = Math.min(w * 0.94, 460 * u);
    const cx = w / 2;
    const lineTexts: Phaser.GameObjects.Text[] = [];
    let contentH = 16 * u;
    const title = this.add.text(0, 0, spec.title, { fontFamily: FONT, fontSize: `${Math.round(20 * u)}px`, color: '#f5c542', fontStyle: 'bold', align: 'center', wordWrap: { width: pw - 30 * u } }).setOrigin(0.5, 0);
    contentH += title.height + 8 * u;
    for (const l of spec.lines) {
      const t = this.add.text(0, 0, l, { fontFamily: FONT, fontSize: `${Math.round(12 * u)}px`, color: '#e8dcc0', align: 'center', wordWrap: { width: pw - 30 * u } }).setOrigin(0.5, 0);
      lineTexts.push(t);
      contentH += t.height + 5 * u;
    }
    const bh = 48 * u;
    contentH += 10 * u + bh + 14 * u;
    const py = h - ins.bottom - 16 * u - contentH;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.4).fillRoundedRect(cx - pw / 2 + 3, py + 4, pw, contentH, 14);
    bg.fillStyle(0x2a2118, 0.96).fillRoundedRect(cx - pw / 2, py, pw, contentH, 14);
    bg.lineStyle(3, 0xf5deb3, 0.9).strokeRoundedRect(cx - pw / 2, py, pw, contentH, 14);
    this.panelObjects.push(bg, title, ...lineTexts);
    let y = py + 16 * u;
    title.setPosition(cx, y); y += title.height + 8 * u;
    for (const t of lineTexts) { t.setPosition(cx, y); y += t.height + 5 * u; }
    y += 10 * u;
    const n = spec.buttons.length;
    const gap = 10 * u;
    const bw = Math.min(200 * u, (pw - 30 * u - gap * (n - 1)) / n);
    const startX = cx - ((bw + gap) * (n - 1)) / 2;
    spec.buttons.forEach((b, i) => {
      const btn = makeButton(this, startX + i * (bw + gap), y + bh / 2, { width: bw, height: bh, label: b.label, color: b.color, enabled: b.enabled, fontSize: Math.round(15 * u), onPress: b.onPress });
      this.panelObjects.push(btn);
    });
    this.panelRect = new Phaser.Geom.Rectangle(cx - pw / 2, py, pw, contentH);
    // panel above the top bar; background under the text, buttons on top
    for (const o of this.panelObjects) (o as unknown as Phaser.GameObjects.Components.Depth).setDepth(o === bg ? 19 : o.type === 'Container' ? 21 : 20);
  }

  hidePanel() {
    for (const o of this.panelObjects) o.destroy();
    this.panelObjects = [];
    this.panelRect = null;
    this.spec = null;
  }
}
