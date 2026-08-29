// MapScene.ts — the overworld. Your warband is a token on a map of roads; tap a place to travel
// there (days pass, wages are paid, tribute comes in), then raid it, enter it, or get stopped on the
// road by a patrol. Kingsport can be besieged once you are infamous enough.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { INFAMY, SIEGE, TRAVEL } from '../config/balance';
import { EDGES, edgeBetween, findPath, MAP, nodeById, NODES, type MapNode } from '../world/WorldMap';
import { patrolBattle, siegeBattle, villageBattle } from '../world/Battles';
import { LAYOUTS } from '../world/Layouts';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import { mulberry32 } from '../utils/rng';
import type { MapHudScene } from './MapHudScene';
import { CSS, FONT, PAL } from './ui';

const TAP_RADIUS = 70;

interface LabelRef { t: Phaser.GameObjects.Text; css: number; }

export class MapScene extends Phaser.Scene {
  private token!: Phaser.GameObjects.Container;
  private status = new Map<string, Phaser.GameObjects.Text>();
  private names = new Map<string, Phaser.GameObjects.Text>();
  private badges = new Map<string, Phaser.GameObjects.Image>();
  private flags = new Map<string, Phaser.GameObjects.Image>();
  private labels: LabelRef[] = [];
  private traveling = false;
  private dragStart = new Phaser.Math.Vector2();
  private camStart = new Phaser.Math.Vector2();
  private dragMoved = false;
  private pendingToast: string | null = null;
  private hud!: MapHudScene;

  constructor() { super('Map'); }

  init(data?: { toast?: string }) { this.pendingToast = data?.toast ?? null; }

  create() {
    this.status.clear();
    this.names.clear();
    this.badges.clear();
    this.flags.clear();
    this.labels = [];
    this.traveling = false;
    this.add.image(0, -MAP.padY, this.groundTexture()).setOrigin(0).setDepth(0);
    this.drawRoads();
    for (const n of NODES) this.drawNode(n);

    // the token is a container so the idle bob (on the image) never fights the travel tween (on the container)
    const here = nodeById(GameState.location);
    const img = this.add.image(0, 0, TEX.mapToken).setScale(1.1);
    this.token = this.add.container(here.x, here.y - 12, [img]).setDepth(10);
    this.tweens.add({ targets: img, y: -4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.cameras.main.setBounds(0, -MAP.padY, MAP.w, MAP.h + 2 * MAP.padY);
    this.applyZoom();
    this.cameras.main.centerOn(this.token.x, this.token.y);
    this.scale.on('resize', this.applyZoom, this);

    this.scene.launch('MapHud');
    this.hud = this.scene.get('MapHud') as MapHudScene;

    // a battle won just before a reload: offer the sack/occupy choice again
    const pv = GameState.pendingVictory;
    if (pv) {
      this.time.delayedCall(60, () => this.scene.launch('Result', { outcome: 'victory', goldEarned: pv.goldEarned, fallen: pv.fallen, deadTroopIds: pv.deadTroopIds,
        battle: { kind: pv.battle.kind, layoutId: 'ashford', name: pv.battle.name, title: '', hint: '', defenders: { militia: 0, archers: 0, captains: 0, statMult: 1, goldMult: 1 }, palisade: false, villageId: pv.battle.villageId, tier: pv.battle.tier } }));
    }

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.cameras.main.setZoom(Phaser.Math.Clamp(this.cameras.main.zoom * (dy > 0 ? 0.9 : 1.1), 0.45, 2.2));
      this.scaleLabels();
    });

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.scene.stop('MapHud');
    });

    // pick up where we left off: a patrol still blocking the road, mid-road after one, mid-journey, or standing somewhere
    this.time.delayedCall(30, () => {
      this.refresh();
      if (this.pendingToast) { this.hud.toast([this.pendingToast], '#f5c542'); this.pendingToast = null; }
      const rt = GameState.resumeTravel;
      if (rt && GameState.patrolPending) {
        const a = nodeById(rt.from), b = nodeById(rt.to);
        this.token.setPosition(Phaser.Math.Linear(a.x, b.x, 0.5), Phaser.Math.Linear(a.y, b.y, 0.5) - 12);
        this.cameras.main.centerOn(this.token.x, this.token.y);
        this.traveling = true;
        this.showPatrolPanel();
      } else if (rt) {
        const a = nodeById(rt.from), b = nodeById(rt.to);
        const edge = edgeBetween(rt.from, rt.to)!;
        this.traveling = true;
        this.cameras.main.startFollow(this.token, true, 0.08, 0.08);
        this.moveToken(a, b, 0.5, 1, () => {
          GameState.resumeTravel = null;
          this.passDays(Math.floor(edge.days / 2));
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
    this.scaleLabels();
  }

  /** Keep world-space labels a readable size on screen whatever the zoom and device pixel ratio. */
  private scaleLabels() {
    const dpr = this.scale.displayScale.x || 1;
    const s = Phaser.Math.Clamp(dpr / this.cameras.main.zoom, 0.9, 2.4);
    for (const l of this.labels) l.t.setScale(s);
    // the status line sits under the (now bigger) name
    for (const [id, name] of this.names) this.status.get(id)?.setY(name.y + name.displayHeight + 1);
  }

  /** Days pass: wages, tribute, desertions. Anything notable is shown as a toast. */
  private passDays(n: number) {
    if (n <= 0) return;
    const events = GameState.advanceDays(n);
    if (events.length) this.hud.toast(events.map(e => e.text), '#ff9a8a');
  }

  // ---------------------------------------------------------------- drawing
  private groundTexture() {
    const key = 'map_ground';
    if (this.textures.exists(key)) return key;
    const rnd = mulberry32(4242);
    const P = MAP.padY;
    const H = MAP.h + 2 * P;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(PAL.earth, 1).fillRect(0, 0, MAP.w, H);
    for (let i = 0; i < 380; i++) {
      const x = rnd() * MAP.w, y = rnd() * H, r = 14 + rnd() * 50;
      g.fillStyle(rnd() > 0.5 ? PAL.earthDeep : PAL.earthHi, 0.5).fillCircle(x, y, r);
    }
    const forests = [[300, 320, 160], [820, 840, 200], [1250, 860, 140], [560, 120, 120], [150, 900, 120], [700, -150, 200], [400, 1120, 180], [1200, 1150, 160], [1000, -120, 150]];
    for (const [fx, fy, fr] of forests) {
      for (let i = 0; i < 60; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * fr;
        g.fillStyle(rnd() > 0.5 ? PAL.leaf : PAL.leafDeep, 0.9).fillCircle(fx + Math.cos(a) * d, fy + P + Math.sin(a) * d, 10 + rnd() * 14);
      }
    }
    for (let i = 0; i < 9; i++) {
      const x = 1080 + i * 36 + rnd() * 20, y = P + 90 + rnd() * 90, s = 30 + rnd() * 40;
      g.fillStyle(0x6d6f68, 1).fillTriangle(x - s, y + s, x + s, y + s, x, y - s);
      g.fillStyle(0xd9dbd6, 1).fillTriangle(x - s * 0.35, y - s * 0.3, x + s * 0.35, y - s * 0.3, x, y - s);
    }
    g.fillStyle(PAL.water, 1).fillEllipse(1040, 780 + P, 180, 100);
    g.fillStyle(0x5a8db0, 0.6).fillEllipse(1030, 772 + P, 120, 60);
    g.generateTexture(key, MAP.w, H);
    g.destroy();
    return key;
  }

  private label(x: number, y: number, str: string, css: number, color: string, originY = 0) {
    const dark = color === CSS.ink || color === CSS.inkSoft;
    const t = this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${css}px`, color, stroke: dark ? '#e7d8b4' : '#000000', strokeThickness: dark ? 0 : Math.max(2, Math.round(css / 4)), fontStyle: 'bold', align: 'center' }).setOrigin(0.5, originY);
    this.labels.push({ t, css });
    return t;
  }

  private drawRoads() {
    const g = this.add.graphics().setDepth(1);
    for (const e of EDGES) {
      const a = nodeById(e.a), b = nodeById(e.b);
      g.lineStyle(14, PAL.dirtDeep, 1).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(9, PAL.dirt, 1).lineBetween(a.x, a.y, b.x, b.y);
      // subtle texture: wheel ruts as a dashed lighter line
      const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      g.lineStyle(2, 0xa88d62, 0.7);
      for (let d = 14; d < len - 14; d += 24) g.lineBetween(a.x + ux * d, a.y + uy * d, a.x + ux * (d + 10), a.y + uy * (d + 10));
      this.label((a.x + b.x) / 2, (a.y + b.y) / 2, `${e.days}d`, 12, CSS.cream, 0.5).setDepth(2).setAlpha(0.95);
    }
  }

  private drawNode(n: MapNode) {
    if (n.kind === 'cross') { this.add.image(n.x, n.y, TEX.mapCross).setDepth(3); return; }
    const tex = n.kind === 'camp' ? TEX.mapCamp : n.kind === 'village' ? TEX.mapVillage : TEX.mapTown;
    this.add.image(n.x + 3, n.y + 5, TEX.shadow).setAlpha(0.4).setDisplaySize(64, 28).setDepth(4);
    this.add.image(n.x, n.y, tex).setDepth(5);
    // a parchment name plate under the name + status
    const plate = this.add.graphics().setDepth(5);
    plate.fillStyle(0x000000, 0.3).fillRoundedRect(-62, 2, 124, 36, 8);
    plate.fillStyle(PAL.ironEdge, 1).fillRoundedRect(-62, -2, 124, 36, 8);
    plate.fillStyle(PAL.parchment, 0.96).fillRoundedRect(-60, 0, 120, 32, 7);
    plate.lineStyle(1, PAL.goldDeep, 0.6).strokeRoundedRect(-57, 3, 114, 26, 5);
    plate.setPosition(n.x, n.y + 28);
    this.labels.push({ t: plate as unknown as Phaser.GameObjects.Text, css: 0 });
    this.names.set(n.id, this.label(n.x, n.y + 30, n.name, 14, CSS.ink).setDepth(6));
    const st = this.label(n.x, n.y + 48, '', 10, CSS.inkSoft);
    st.setDepth(6);
    this.status.set(n.id, st);
    if (n.kind !== 'camp') {
      const badge = this.add.image(n.x, n.y, TEX.mapPalisade).setDepth(4).setScale(1.2).setVisible(false);
      this.badges.set(n.id, badge);
      const flag = this.add.image(n.x + 26, n.y - 26, TEX.mapToken).setDepth(7).setScale(0.6).setVisible(false);
      this.flags.set(n.id, flag);
    }
  }

  /** Refresh every label from the game state (day passed, village raided, infamy grew...). */
  refresh() {
    for (const n of NODES) {
      const st = this.status.get(n.id);
      if (!st) continue;
      if (n.kind === 'camp') { st.setText('Home'); continue; }
      const s = GameState.settlement(n.id);
      const parts: string[] = [];
      let color = CSS.inkSoft;
      const access = GameState.access(n.id);
      if (s.sacked) { parts.push('Sacked — a burnt ruin'); color = '#8a8a8a'; }
      else if (s.occupied) { parts.push(`Yours · +${n.kind === 'town' ? 15 : 4 + (n.tier ?? 1)}/day`); color = '#3f6b2a'; }
      else if (n.kind === 'town') { parts.push(GameState.siegeUnlocked ? 'Walled · siege it' : 'Walled town'); color = GameState.siegeUnlocked ? CSS.danger : CSS.inkSoft; }
      else {
        const info = GameState.villageInfo(n.id);
        if (info.ruined) { parts.push(`Ruined · ${info.daysToRecover}d`); color = '#8a8a8a'; }
        else parts.push(`~${info.total} defenders${info.wealth < 0.95 ? ` · ${Math.round(info.wealth * 100)}% wealth` : ''}`);
        if (info.palisade) parts.push('palisade');
        else if (info.steps > 0) parts.push(`+${info.steps}`);
        if (info.steps > 0 && !info.ruined) color = CSS.danger;
        this.badges.get(n.id)?.setVisible(info.palisade && !info.ruined);
      }
      if (access === 'visit') parts.push('open');
      else if (access === 'closed') parts.push('shut to you');
      st.setText(parts.join(' · ')).setColor(color);
      this.flags.get(n.id)?.setVisible(s.occupied);
      if (s.occupied || s.sacked) this.badges.get(n.id)?.setVisible(false);
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
    if (this.hud.barContains(this.dragStart.x, this.dragStart.y)) return;
    if (this.hud.panelOpen && this.hud.panelContains(this.dragStart.x, this.dragStart.y)) return;
    const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
    if (!this.dragMoved && Math.hypot(dx, dy) < 10 * (this.scale.displayScale.x || 1)) return;
    this.dragMoved = true;
    this.cameras.main.stopFollow();
    const z = this.cameras.main.zoom;
    this.cameras.main.setScroll(this.camStart.x - dx / z, this.camStart.y - dy / z);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.dragMoved) return;
    if (this.hud.barContains(p.downX, p.downY) || this.hud.barContains(p.x, p.y)) return;
    if (this.hud.panelOpen) {
      if (this.hud.panelContains(p.x, p.y) || this.hud.panelModal) return; // the panel's own buttons handle it
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
    // the town shows what you're walking into (and the day cost) BEFORE you pay for the trip; a burnt ruin isn't worth the walk
    if ((best.kind === 'town' && !GameState.settlement(best.id).occupied) || GameState.settlement(best.id).sacked) { this.showNodePanel(best); return; }
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
        this.passDays(Math.ceil(edge.days / 2));
        GameState.resumeTravel = { from, to };
        GameState.patrolPending = true;
        GameState.lastPatrolDay = GameState.day;
        GameState.save();
        this.refresh();
        Sound.patrol();
        this.cameras.main.shake(250, 0.004);
        this.showPatrolPanel();
      } else {
        this.passDays(edge.days);
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

  private routeDays(to: string) {
    const path = findPath(GameState.location, to);
    let days = 0, cur = GameState.location;
    for (const n of path) { days += edgeBetween(cur, n)?.days ?? 0; cur = n; }
    return days;
  }

  // ---------------------------------------------------------------- panels
  /** VISIT (as a customer) when the gates are open to you, otherwise a note on why they are shut. */
  private visitButton(n: MapNode, lines: string[]) {
    const here = GameState.location === n.id;
    const access = GameState.access(n.id);
    if (access === 'visit') {
      lines.push(here ? 'The gates are open to you — you could trade here, or ask at the inn.' : 'Their gates are open to strangers with coin.');
      return here
        ? { label: 'VISIT', color: 0x2f6b8a, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id, visit: true }); } }
        : { label: `WALK IN (${this.routeDays(n.id)}d)`, color: 0x2f6b8a, onPress: () => this.travelTo(n.id) };
    }
    if (access === 'closed') lines.push(GameState.closedReason(n.id));
    return null;
  }

  private showNodePanel(n: MapNode) {
    const leave = { label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() };
    if (n.kind === 'camp') {
      this.hud.showPanel({
        title: 'BANDIT CAMP', lines: ['Your home. Tap the Forge, the Barracks or the Stables to spend your gold. Waiting here still costs wages.'],
        buttons: [{ label: 'ENTER CAMP', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: 'camp' }); } }, leave],
      });
      return;
    }
    const s = GameState.settlement(n.id);
    if (s.sacked) {
      this.hud.showPanel({ title: n.name.toUpperCase(), lines: ['A burnt ruin. Nothing lives here now, and nothing ever will.'], buttons: [leave] });
      return;
    }
    if (s.occupied) {
      const garrison = (GameState.garrisons[n.id] ?? []).map(t => t.name).join(' and ') || 'nobody';
      this.hud.showPanel({
        title: n.name.toUpperCase(),
        lines: [`Yours. ${garrison} hold it for you. Tribute +${n.kind === 'town' ? 15 : 4 + (n.tier ?? 1)} gold a day. Its shops are open to you.`],
        buttons: [{ label: 'ENTER', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id }); } }, leave],
      });
      return;
    }
    if (n.kind === 'town') {
      if (!GameState.siegeUnlocked) {
        const lines = [n.blurb ?? '', `The garrison is far too strong for a nobody. Become a ${INFAMY.tiers[SIEGE.unlockTier].name} (infamy ${INFAMY.tiers[SIEGE.unlockTier].min}) and they will take you seriously.`,
          GameState.location !== n.id ? `The road there takes ${this.routeDays(n.id)} days.` : ''].filter(Boolean);
        const visit = this.visitButton(n, lines);
        this.hud.showPanel({ title: n.name.toUpperCase(), lines, buttons: [...(visit ? [visit] : []), leave] });
      } else {
        const here = GameState.location === n.id;
        const lines = [n.blurb ?? '', `A stone wall with one gate; ${SIEGE.wallArchers} archers on the battlements (only arrows reach them), ${SIEGE.guards} town guards and the garrison captain behind it. Batter the gate, then take the courtyard.`];
        const visit = this.visitButton(n, lines);
        this.hud.showPanel({
          title: n.name.toUpperCase(), lines,
          buttons: [
            here
              ? { label: 'SIEGE', color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', siegeBattle()); } }
              : { label: `MARCH (${this.routeDays(n.id)}d)`, color: 0xa0341f, onPress: () => this.travelTo(n.id) },
            ...(visit ? [visit] : []), leave],
        });
      }
      return;
    }
    const info = GameState.villageInfo(n.id);
    const lines = [n.blurb ?? ''];
    if (info.ruined) lines.push(`Ruined — nothing left to take. They rebuild in ${info.daysToRecover} day${info.daysToRecover === 1 ? '' : 's'}.`);
    else {
      lines.push(`Tier ${info.tier} village  ·  about ${info.total} defenders (${info.militia} militia, ${info.archers} archer${info.archers === 1 ? '' : 's'}, ${info.captains} captain${info.captains === 1 ? '' : 's'})`);
      const gates = LAYOUTS[n.layout ?? 'ashford'].palisade?.gaps.length ?? 0;
      if (info.steps > 0) lines.push(`Fortified: +${info.steps} militia hired since word of you spread${info.palisade ? `, and a palisade with ${gates} gate${gates === 1 ? '' : 's'}` : ''}.`);
      if (info.timesRaided > 0) lines.push(`Raided ${info.timesRaided}× before — they have hired more guards${info.wealth < 0.95 ? `, and their coffers are at ${Math.round(info.wealth * 100)}% (recovering)` : ', and there is more to take'}.`);
    }
    const visit = this.visitButton(n, lines);
    const here = GameState.location === n.id;
    this.hud.showPanel({
      title: n.name.toUpperCase(), lines,
      buttons: [
        here
          ? { label: 'RAID', color: 0xa0341f, enabled: !info.ruined, onPress: () => { GameState.save(); this.scene.start('Raid', villageBattle(n.id)); } }
          : { label: `MARCH (${this.routeDays(n.id)}d)`, color: 0xa0341f, enabled: !info.ruined, onPress: () => this.travelTo(n.id) },
        ...(visit ? [visit] : []), leave,
      ],
    });
  }

  private showPatrolPanel() {
    const p = GameState.patrolConfig();
    const n = p ? p.militia + p.archers + p.captains : 6;
    this.hud.showPanel({
      title: 'ROAD PATROL', modal: true,
      lines: [`${n} riders block the road — your bounty has drawn them. There is no way around.`],
      buttons: [{ label: 'FIGHT', color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', patrolBattle()); } }],
    });
  }
}
