// MapScene.ts — the overworld. Your warband is a token on a map of roads; tap a place to travel
// there (days pass), then raid it, enter it, or get stopped on the road by a patrol.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { INFAMY, TRAVEL } from '../config/balance';
import { EDGES, edgeBetween, findPath, MAP, nodeById, NODES, type MapNode } from '../world/WorldMap';
import { patrolBattle, villageBattle } from '../world/Battles';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import { mulberry32 } from '../utils/rng';
import type { MapHudScene } from './MapHudScene';
import { FONT } from './ui';

const TAP_RADIUS = 64;

export class MapScene extends Phaser.Scene {
  private token!: Phaser.GameObjects.Image;
  private status = new Map<string, Phaser.GameObjects.Text>();
  private badges = new Map<string, Phaser.GameObjects.Image>();
  private traveling = false;
  private dragStart = new Phaser.Math.Vector2();
  private camStart = new Phaser.Math.Vector2();
  private dragMoved = false;
  private hud!: MapHudScene;

  constructor() { super('Map'); }

  create() {
    this.status.clear();
    this.badges.clear();
    this.traveling = false;
    this.add.image(0, -MAP.padY, this.groundTexture()).setOrigin(0).setDepth(0);
    this.drawRoads();
    for (const n of NODES) this.drawNode(n);

    const here = nodeById(GameState.location);
    this.token = this.add.image(here.x, here.y - 12, TEX.mapToken).setDepth(10).setScale(1.1);
    this.tweens.add({ targets: this.token, y: '-=4', duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.cameras.main.setBounds(0, -MAP.padY, MAP.w, MAP.h + 2 * MAP.padY);
    this.applyZoom();
    this.cameras.main.centerOn(this.token.x, this.token.y);
    this.scale.on('resize', this.applyZoom, this);

    this.scene.launch('MapHud');
    this.hud = this.scene.get('MapHud') as MapHudScene;

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1), 0.45, 2.2));
    });

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.scene.stop('MapHud');
    });

    // pick up where we left off: mid-road after a patrol, mid-journey, or standing somewhere
    this.time.delayedCall(30, () => {
      this.refresh();
      const rt = GameState.resumeTravel;
      if (rt) {
        GameState.resumeTravel = null;
        GameState.save();
        const a = nodeById(rt.from), b = nodeById(rt.to);
        const edge = edgeBetween(rt.from, rt.to)!;
        this.traveling = true;
        this.cameras.main.startFollow(this.token, true, 0.08, 0.08);
        this.moveToken(a, b, 0.5, 1, () => {
          GameState.advanceDays(Math.floor(edge.days / 2));
          GameState.save();
          Sound.travel();
          this.refresh();
          this.stepPath();
        });
      } else if (GameState.pendingPath.length) {
        this.stepPath();
      } else {
        const node = nodeById(GameState.location);
        if (node.kind !== 'cross' && node.kind !== 'camp') this.showNodePanel(node);
      }
    });
  }

  /** "Cover" zoom: the world always fills the screen (pan to see the rest), never a black band. */
  private applyZoom() {
    const { width, height } = this.scale;
    const zoom = Phaser.Math.Clamp(Math.max(width / MAP.w, height / (MAP.h + 2 * MAP.padY)), 0.6, 2.0);
    this.cameras.main.setZoom(zoom);
  }

  // ---------------------------------------------------------------- drawing
  private groundTexture() {
    const key = 'map_ground';
    if (this.textures.exists(key)) return key;
    const rnd = mulberry32(4242);
    const P = MAP.padY;
    const H = MAP.h + 2 * P;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x6a7d4a, 1).fillRect(0, 0, MAP.w, H);
    for (let i = 0; i < 380; i++) {
      const x = rnd() * MAP.w, y = rnd() * H, r = 14 + rnd() * 50;
      g.fillStyle(rnd() > 0.5 ? 0x5f7242 : 0x748a52, 0.5).fillCircle(x, y, r);
    }
    // forests (node-band coordinates, shifted down by the padding)
    const forests = [[300, 320, 160], [820, 840, 200], [1250, 860, 140], [560, 120, 120], [150, 900, 120], [700, -150, 200], [400, 1120, 180], [1200, 1150, 160], [1000, -120, 150]];
    for (const [fx, fy, fr] of forests) {
      for (let i = 0; i < 60; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * fr;
        g.fillStyle(rnd() > 0.5 ? 0x3f5a32 : 0x34502a, 0.9).fillCircle(fx + Math.cos(a) * d, fy + P + Math.sin(a) * d, 10 + rnd() * 14);
      }
    }
    // mountains, top right
    for (let i = 0; i < 9; i++) {
      const x = 1080 + i * 36 + rnd() * 20, y = P + 90 + rnd() * 90, s = 30 + rnd() * 40;
      g.fillStyle(0x6d6f68, 1).fillTriangle(x - s, y + s, x + s, y + s, x, y - s);
      g.fillStyle(0xd9dbd6, 1).fillTriangle(x - s * 0.35, y - s * 0.3, x + s * 0.35, y - s * 0.3, x, y - s);
    }
    // a lake
    g.fillStyle(0x3d6a8a, 1).fillEllipse(1040, 780 + P, 180, 100);
    g.fillStyle(0x5a8db0, 0.6).fillEllipse(1030, 772 + P, 120, 60);
    g.generateTexture(key, MAP.w, H);
    g.destroy();
    return key;
  }

  private drawRoads() {
    const g = this.add.graphics().setDepth(1);
    for (const e of EDGES) {
      const a = nodeById(e.a), b = nodeById(e.b);
      g.lineStyle(12, 0x5a4630, 1).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(7, 0x9a7d55, 1).lineBetween(a.x, a.y, b.x, b.y);
      // day cost at the midpoint
      this.add.text((a.x + b.x) / 2, (a.y + b.y) / 2, `${e.days}d`, { fontFamily: FONT, fontSize: '12px', color: '#fff3d0', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5).setDepth(2).setAlpha(0.9);
    }
  }

  private drawNode(n: MapNode) {
    if (n.kind === 'cross') { this.add.image(n.x, n.y, TEX.mapCross).setDepth(3); return; }
    const tex = n.kind === 'camp' ? TEX.mapCamp : n.kind === 'village' ? TEX.mapVillage : TEX.mapTown;
    this.add.image(n.x, n.y, tex).setDepth(5);
    this.add.text(n.x, n.y + 30, n.name, { fontFamily: FONT, fontSize: '17px', color: '#fff8e7', stroke: '#000', strokeThickness: 4, fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(6);
    const st = this.add.text(n.x, n.y + 50, '', { fontFamily: FONT, fontSize: '11px', color: '#e8dcc0', stroke: '#000', strokeThickness: 3, align: 'center' }).setOrigin(0.5, 0).setDepth(6);
    this.status.set(n.id, st);
    if (n.kind === 'village') {
      const badge = this.add.image(n.x, n.y, TEX.mapPalisade).setDepth(4).setScale(1.2).setVisible(false);
      this.badges.set(n.id, badge);
    }
  }

  /** Refresh every label from the game state (day passed, village raided, infamy grew...). */
  refresh() {
    for (const n of NODES) {
      const st = this.status.get(n.id);
      if (!st) continue;
      if (n.kind === 'camp') st.setText('Home');
      else if (n.kind === 'town') st.setText('LOCKED — garrison');
      else {
        const info = GameState.villageInfo(n.id);
        const parts: string[] = [];
        if (info.ruined) parts.push(`Ruined · ${info.daysToRecover}d`);
        else parts.push(`~${info.total} defenders`);
        if (info.palisade) parts.push('palisade');
        else if (info.steps > 0) parts.push(`fortified +${info.steps}`);
        if (info.timesRaided > 0 && !info.ruined) parts.push(`raided ×${info.timesRaided}`);
        st.setText(parts.join(' · ')).setColor(info.ruined ? '#9a9a9a' : info.steps > 0 ? '#ffb0a0' : '#e8dcc0');
        this.badges.get(n.id)?.setVisible(info.palisade && !info.ruined);
      }
    }
    this.hud?.refresh();
  }

  // ---------------------------------------------------------------- input: drag to pan, tap to travel
  private onDown(p: Phaser.Input.Pointer) {
    this.dragStart.set(p.x, p.y);
    this.camStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    this.dragMoved = false;
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!p.isDown) return;
    const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
    if (!this.dragMoved && Math.hypot(dx, dy) < 10 * (this.scale.displayScale.x || 1)) return;
    if (this.hud.panelOpen && this.hud.panelContains(this.dragStart.x, this.dragStart.y)) return;
    this.dragMoved = true;
    this.cameras.main.stopFollow();
    const z = this.cameras.main.zoom;
    this.cameras.main.setScroll(this.camStart.x - dx / z, this.camStart.y - dy / z);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.dragMoved) return;
    if (this.hud.panelOpen) {
      if (this.hud.panelContains(p.x, p.y)) return; // the panel's own buttons handle it
      this.hud.hidePanel();
      return;
    }
    if (this.traveling) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    let best: MapNode | null = null, bd = TAP_RADIUS;
    for (const n of NODES) {
      if (n.kind === 'cross') continue;
      const d = Phaser.Math.Distance.Between(wp.x, wp.y, n.x, n.y);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) return;
    if (best.id === GameState.location) { this.showNodePanel(best); return; }
    this.travelTo(best.id);
  }

  // ---------------------------------------------------------------- travel
  private travelTo(id: string) {
    const path = findPath(GameState.location, id);
    if (!path.length) return;
    GameState.pendingPath = path;
    GameState.save();
    this.hud.hidePanel();
    this.stepPath();
  }

  private stepPath() {
    const next = GameState.pendingPath[0];
    if (!next) {
      this.traveling = false;
      const node = nodeById(GameState.location);
      if (node.kind !== 'cross') this.showNodePanel(node);
      return;
    }
    const from = GameState.location, to = next;
    const edge = edgeBetween(from, to);
    if (!edge) { GameState.pendingPath = []; GameState.save(); this.traveling = false; return; }
    this.traveling = true;
    this.cameras.main.startFollow(this.token, true, 0.08, 0.08);
    // does a road patrol find you on this stretch?
    const canPatrol = GameState.day - GameState.lastPatrolDay >= INFAMY.patrolCooldownDays;
    const intercepted = GameState.patrolChance > 0 && canPatrol && Math.random() < GameState.patrolChance;
    const a = nodeById(from), b = nodeById(to);
    this.moveToken(a, b, 0, intercepted ? 0.5 : 1, () => {
      GameState.pendingPath = GameState.pendingPath.slice(1);
      GameState.location = to;
      if (intercepted) {
        GameState.advanceDays(Math.ceil(edge.days / 2));
        GameState.resumeTravel = { from, to };
        GameState.lastPatrolDay = GameState.day;
        GameState.save();
        this.refresh();
        Sound.patrol();
        this.cameras.main.shake(250, 0.004);
        this.showPatrolPanel();
      } else {
        GameState.advanceDays(edge.days);
        GameState.save();
        Sound.travel();
        this.refresh();
        this.stepPath();
      }
    });
  }

  private moveToken(a: MapNode, b: MapNode, f0: number, f1: number, done: () => void) {
    const x0 = Phaser.Math.Linear(a.x, b.x, f0), y0 = Phaser.Math.Linear(a.y, b.y, f0) - 12;
    const x1 = Phaser.Math.Linear(a.x, b.x, f1), y1 = Phaser.Math.Linear(a.y, b.y, f1) - 12;
    this.token.setPosition(x0, y0);
    const dur = (Math.hypot(x1 - x0, y1 - y0) / TRAVEL.tokenSpeed) * 1000;
    this.tweens.add({ targets: this.token, x: x1, y: y1, duration: Math.max(200, dur), ease: 'Sine.InOut', onComplete: done });
  }

  // ---------------------------------------------------------------- panels
  private showNodePanel(n: MapNode) {
    if (n.kind === 'camp') {
      this.hud.showPanel({
        title: 'BANDIT CAMP', lines: ['Your home. Walk between the Forge, the Barracks and the Stables to spend your gold.'],
        buttons: [
          { label: 'ENTER CAMP', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Camp'); } },
          { label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() },
        ],
      });
    } else if (n.kind === 'town') {
      this.hud.showPanel({
        title: n.name.toUpperCase(), lines: [n.blurb ?? '', 'The garrison is far too strong for your warband. Not yet.'],
        buttons: [{ label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() }],
      });
    } else {
      const info = GameState.villageInfo(n.id);
      const lines = [n.blurb ?? ''];
      if (info.ruined) lines.push(`Ruined — nothing left to take. They rebuild in ${info.daysToRecover} day${info.daysToRecover === 1 ? '' : 's'}.`);
      else {
        lines.push(`Tier ${info.tier} village  ·  about ${info.total} defenders (${info.militia} militia, ${info.archers} archer${info.archers === 1 ? '' : 's'}, ${info.captains} captain${info.captains === 1 ? '' : 's'})`);
        if (info.steps > 0) lines.push(`Fortified: +${info.steps} militia hired since word of you spread${info.palisade ? ', and a palisade with a single gate' : ''}.`);
        if (info.timesRaided > 0) lines.push(`Raided ${info.timesRaided}× before — they have hired more guards, but there is more to take.`);
      }
      this.hud.showPanel({
        title: n.name.toUpperCase(), lines,
        buttons: [
          { label: 'RAID', color: 0xa0341f, enabled: !info.ruined, onPress: () => { GameState.save(); this.scene.start('Raid', villageBattle(n.id)); } },
          { label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() },
        ],
      });
    }
  }

  private showPatrolPanel() {
    const p = GameState.patrolConfig();
    const n = p ? p.militia + p.archers + p.captains : 6;
    this.hud.showPanel({
      title: 'ROAD PATROL', lines: [`${n} riders block the road — your bounty has drawn them. There is no way around.`],
      buttons: [{ label: 'FIGHT', color: 0xa0341f, onPress: () => { this.scene.start('Raid', patrolBattle()); } }],
    });
  }
}
