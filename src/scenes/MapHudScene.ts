// MapHudScene.ts — screen-space overlay for the world map: the ledger (gold, wages, tribute), date,
// the infamy meter and bounty, pop-up panels for places, and toasts for things that happened on the road.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { INFAMY, PAY } from '../config/balance';
import { CSS, displayStyle, dprOf, drawPanel, FONT, makeButton, PAL, safeInsets, uiStyle, uiUnit } from './ui';

export interface PanelButton { label: string; color?: number; enabled?: boolean; onPress: () => void; }
export interface PanelSpec { title: string; lines: string[]; buttons: PanelButton[]; modal?: boolean; }

export class MapHudScene extends Phaser.Scene {
  private u = 1;
  private barBottom = 0;
  private bar!: Phaser.GameObjects.Rectangle;
  private barLine!: Phaser.GameObjects.Rectangle;
  private dateText!: Phaser.GameObjects.Text;
  private goldText!: Phaser.GameObjects.Text;
  private ledgerText!: Phaser.GameObjects.Text;
  private infamyLabel!: Phaser.GameObjects.Text;
  private infamyBg!: Phaser.GameObjects.Rectangle;
  private infamyFg!: Phaser.GameObjects.Rectangle;
  private bountyText!: Phaser.GameObjects.Text;
  private titleBtn!: Phaser.GameObjects.Container;
  private locate!: Phaser.GameObjects.Container;
  private zoomIn!: Phaser.GameObjects.Container;
  private zoomOut!: Phaser.GameObjects.Container;
  onZoom: ((dir: number) => void) | null = null;
  /** Take me back to my warband. */
  onLocate: (() => void) | null = null;
  private hintText: Phaser.GameObjects.Text | null = null;
  private toastText: Phaser.GameObjects.Text | null = null;
  private panelObjects: Phaser.GameObjects.GameObject[] = [];
  private panelRect: Phaser.Geom.Rectangle | null = null;
  private spec: PanelSpec | null = null;
  /** When a press last landed on a pop-up panel, and where. A scene above the map SWALLOWS the pointer
   *  — the map never sees it — so the map cannot tell that the first half of a double click went into
   *  a panel button. It reads these instead. */
  lastPanelPressAt = -1e9;
  lastPanelPress = new Phaser.Math.Vector2();

  constructor() { super('MapHud'); }

  create() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.panelContains(p.x, p.y)) return;
      this.lastPanelPressAt = this.time.now;
      this.lastPanelPress.set(p.x, p.y);
    });
    this.panelObjects = [];
    this.panelRect = null;
    this.spec = null;
    this.toastText = null;
    this.hintText = null;
    this.bar = this.add.rectangle(0, 0, 10, 10, PAL.iron, 0.92).setOrigin(0);
    this.barLine = this.add.rectangle(0, 0, 10, 2, PAL.gold, 0.7).setOrigin(0);
    const t = (size: number, color: string) => this.add.text(0, 0, '', { fontFamily: FONT, fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 2, fontStyle: 'bold' });
    this.dateText = t(13, CSS.cream);
    this.goldText = t(16, CSS.goldHi);
    this.ledgerText = t(11, CSS.greenSoft);
    this.infamyLabel = t(11, CSS.dangerHi);
    this.infamyBg = this.add.rectangle(0, 0, 10, 10, PAL.ironEdge, 1).setOrigin(0, 0.5).setStrokeStyle(1, PAL.gold, 0.5);
    this.infamyFg = this.add.rectangle(0, 0, 10, 10, PAL.danger, 1).setOrigin(0, 0.5);
    this.bountyText = t(11, CSS.steel);
    this.titleBtn = makeButton(this, 0, 0, { width: 96, height: 36, label: 'SAVE & QUIT', tone: 'ghost', fontSize: 11,
      onPress: () => { GameState.save(); this.scene.stop('Map'); this.scene.start('Title'); } });
    this.zoomIn = makeButton(this, 0, 0, { width: 44, height: 44, label: '+', tone: 'neutral', fontSize: 24, onPress: () => this.onZoom?.(1) });
    this.zoomOut = makeButton(this, 0, 0, { width: 44, height: 44, label: '−', tone: 'neutral', fontSize: 24, onPress: () => this.onZoom?.(-1) });
    this.locate = makeButton(this, 0, 0, { width: 44, height: 44, label: '⌖', tone: 'neutral', fontSize: 24, onPress: () => this.onLocate?.() });
    if (!GameState.seenMapHint) {
      this.hintText = this.add.text(0, 0, 'Tap anywhere on land to march there. Drag to look around, double-tap to zoom in, ⌖ to find yourself.', uiStyle(14, CSS.goldHi, { stroke: true })).setOrigin(0.5, 0).setDepth(30);
      this.tweens.add({ targets: this.hintText, alpha: 0, delay: 6000, duration: 700, onComplete: () => { this.hintText?.destroy(); this.hintText = null; } });
      GameState.seenMapHint = true;
    }
    this.layout();
    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.layout, this));
  }

  private layout() {
    const { width: w, height: h } = this.scale;
    const u = this.u = uiUnit(w, h, dprOf(this));
    const ins = safeInsets(this);
    const m = 10 * u;
    const top = ins.top;
    const left = m + ins.left;
    const portrait = h > w * 1.1;
    const barH = (portrait ? 108 : 64) * u;
    this.barBottom = top + barH;
    this.bar.setPosition(0, 0).setSize(w, this.barBottom);
    this.barLine.setPosition(0, this.barBottom - 2).setSize(w, 2);
    this.dateText.setPosition(left, top + 6 * u).setFontSize(Math.round(12 * u));
    this.goldText.setPosition(left, top + 22 * u).setFontSize(Math.round(16 * u));
    this.ledgerText.setPosition(left, top + 44 * u).setFontSize(Math.round(10 * u)).setWordWrapWidth(portrait ? w - left - m - ins.right : Math.min(w * 0.46, 420 * u), true);
    const btnW = 96 * u;
    this.titleBtn.setPosition(w - m - ins.right - btnW / 2, top + 20 * u).setScale(u);
    this.titleBtn.setData('baseScale', u);
    // zoom buttons: bottom-right, thumb reach
    const zx = w - m - ins.right - 24 * u;
    this.zoomIn.setPosition(zx, h - ins.bottom - m - 24 * u - 54 * u).setScale(u); this.zoomIn.setData('baseScale', u);
    this.zoomOut.setPosition(zx, h - ins.bottom - m - 24 * u).setScale(u); this.zoomOut.setData('baseScale', u);
    this.locate.setPosition(zx, h - ins.bottom - m - 24 * u - 108 * u).setScale(u); this.locate.setData('baseScale', u);
    // the infamy column: on portrait phones it drops to a second row
    const ix = portrait ? left : Math.min(w * 0.5, left + 230 * u);
    const iy = portrait ? top + 74 * u : top + 4 * u;
    const colW = portrait ? w - left - m - ins.right : Math.max(120 * u, w - ix - btnW - 2 * m - ins.right);
    this.infamyLabel.setPosition(ix, iy).setFontSize(Math.round(10 * u)).setWordWrapWidth(0, false);
    this.infamyBg.setPosition(ix, iy + 22 * u).setSize(Math.min(150 * u, colW), 10 * u);
    this.infamyFg.setPosition(ix, iy + 22 * u).setSize(Math.min(150 * u, colW), 10 * u);
    this.bountyText.setPosition(ix + Math.min(150 * u, colW) + 8 * u, iy + 22 * u).setOrigin(0, 0.5).setFontSize(Math.round(10 * u));
    this.hintText?.setPosition(w / 2, this.barBottom + 8 * u).setFontSize(Math.round(14 * u)).setWordWrapWidth(w - 4 * m);
    if (this.spec) this.showPanel(this.spec);
    this.refresh();
  }

  /** Re-read the game state (called by the map after every arrival / purchase / resize). */
  refresh() {
    this.dateText.setText(GameState.dateLabel);
    this.goldText.setText(`⬤ ${GameState.gold} gold`);
    const wages = GameState.wagesPerDay, tribute = GameState.tributePerDay, net = tribute - wages;
    const pay = GameState.payRate === 'full' ? '' : ` (${PAY[GameState.payRate].label} pay)`;
    const unpaid = GameState.unpaidDays > 0;
    this.ledgerText.setText(`Troops ${GameState.troops.length}/${GameState.troopCap}  ·  wages −${wages}/day${pay}  ·  tribute +${tribute}/day  ·  net ${net >= 0 ? '+' : ''}${net}/day${unpaid ? '   ·   UNPAID — the men grumble' : ''}`)
      .setColor(unpaid ? '#ff9a8a' : net >= 0 ? '#c8f0c8' : '#ffe9a8');
    // the meter shows how the territory you stand in sees you
    const where = GameState.territoryName();
    const value = GameState.territoryInfamy();
    const tier = GameState.tierOf(value);
    const next = INFAMY.tiers[tier + 1]?.min ?? null;
    const cur = INFAMY.tiers[tier].min;
    const frac = next === null ? 1 : Phaser.Math.Clamp((value - cur) / (next - cur), 0, 1);
    this.infamyLabel.setText(`${where ? `${where} ` : ''}INFAMY ${value}  ·  ${INFAMY.tiers[tier].name.toUpperCase()}${next !== null ? `  (${INFAMY.tiers[tier + 1].name} at ${next})` : ''}${GameState.hunted ? '  ·  HUNTED' : ''}`);
    this.infamyFg.width = this.infamyBg.width * frac;
    // a king is not a man with a price on his head
    this.bountyText.setText(GameState.title ? GameState.title
      : GameState.bounty > 0 ? `bounty ${GameState.bounty}g (homeland)` : 'no bounty yet');
  }

  get panelOpen() { return this.spec !== null; }
  get panelModal() { return !!this.spec?.modal; }
  panelContains(x: number, y: number) { return !!this.panelRect && this.panelRect.contains(x, y); }
  barContains(_x: number, y: number) { return y <= this.barBottom; }
  /** the zoom buttons' area, so taps there never reach the map */
  zoomContains(x: number, y: number) {
    return [this.zoomIn, this.zoomOut, this.locate].some(b => Math.abs(x - b.x) < 26 * this.u && Math.abs(y - b.y) < 26 * this.u);
  }

  /** Where the map may draw: everything below the bar. */
  get mapTop() { return this.barBottom; }

  /** A few lines that fade after a moment — desertions, unpaid wages, conquest summaries. */
  toast(lines: string[], color = '#ffe9a8') {
    this.toastText?.destroy();
    const { width: w } = this.scale;
    const u = this.u;
    // sits under the first-visit hint when both are showing
    const ty = this.barBottom + 12 * u + (this.hintText && this.hintText.active ? this.hintText.height + 8 * u : 0);
    const t = this.add.text(w / 2, ty, lines.join('\n'), uiStyle(13 * u, color, { stroke: true, wrap: w * 0.9 })).setOrigin(0.5, 0).setDepth(31);
    this.toastText = t;
    this.tweens.add({ targets: t, alpha: 0, delay: 4500, duration: 700, onComplete: () => { if (this.toastText === t) this.toastText = null; t.destroy(); } });
  }

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
    const title = this.add.text(0, 0, spec.title, { ...displayStyle(20 * u, CSS.emberDeep, false), align: 'center', wordWrap: { width: pw - 30 * u } }).setOrigin(0.5, 0);
    contentH += title.height + 8 * u;
    for (const l of spec.lines) {
      const t = this.add.text(0, 0, l, uiStyle(12 * u, CSS.ink, { bold: false, wrap: pw - 30 * u })).setOrigin(0.5, 0);
      lineTexts.push(t);
      contentH += t.height + 5 * u;
    }
    const bh = 48 * u;
    contentH += 10 * u + bh + 14 * u;
    const py = h - ins.bottom - 16 * u - contentH;
    const bg = drawPanel(this.add.graphics(), cx - pw / 2, py, pw, contentH);
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
