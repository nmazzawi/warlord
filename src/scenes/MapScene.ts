// MapScene.ts — the world chart: an atlas of empires on one sheet of parchment. Pan and zoom freely
// from the whole Earth (coastlines and the names of twelve realms) through their capitals and cities,
// down to the roads and villages of the small borderland you actually rule. Your warband is a token;
// tap a place to travel there (days pass, wages are paid, tribute comes in), then raid it, enter it,
// visit it — or get stopped on the road. The steppe has camps that move and riders that hunt raiders.
// Everything outside your reach is drawn muted: it is the content plan, visible from day one.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { INFAMY, SIEGE, STEPPE, TRAVEL } from '../config/balance';
import { EDGES, edgeBetween, findPath, nodeById, NODES, type MapNode, type Territory } from '../world/WorldMap';
import { campBattle, patrolBattle, siegeBattle, steppePatrolBattle, villageBattle } from '../world/Battles';
import { LAYOUTS } from '../world/Layouts';
import { CAMPS, campAt, campById, campLocation } from '../world/Steppe';
import { CHART, chartTexture, distToPolyline, drawChart, regionAt, REGIONS, SEA_ROUTES, type ChartLayers, type Region } from '../world/WorldChart';
import type { AtlasPlace } from '../world/AtlasData';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import type { MapHudScene } from './MapHudScene';
import { CSS, DISPLAY, FONT, PAL } from './ui';

interface LabelRef { t: Phaser.GameObjects.Text; css: number; }
interface Marker { place: AtlasPlace; empire: Region; icon: Phaser.GameObjects.Image; k: number; major: boolean; }
/** A settlement name and how many rows it has been dropped to clear its neighbours. */
interface StackedName { t: Phaser.GameObjects.Text; baseY: number; row: number; major: boolean; }
/** Anything the level of detail can fade out (Graphics and Containers only have a single alpha). */
interface Fadeable { alpha: number; visible: boolean; setAlpha(v: number): unknown; setVisible(v: boolean): unknown; }

const MAX_ZOOM = 5;
/** How far in the chart is drawn: the whole Earth, then capitals, then every road and hut. */
const BAND = { major: [0.55, 0.85], minor: [1.3, 1.8], empire: [1.15, 1.95] };
/** One line of a stacked place name, in the same units the names are drawn at. */
const ROW = 20;

export class MapScene extends Phaser.Scene {
  private token!: Phaser.GameObjects.Container;
  private chart!: ChartLayers;
  private status = new Map<string, Phaser.GameObjects.Text>();
  private names = new Map<string, Phaser.GameObjects.Text>();
  private badges = new Map<string, Phaser.GameObjects.Image>();
  private flags = new Map<string, Phaser.GameObjects.Image>();
  private campIcons = new Map<string, Phaser.GameObjects.Container>();
  private labels: LabelRef[] = [];
  private empireLabels: Phaser.GameObjects.Text[] = [];
  private territoryObjects: Fadeable[] = [];
  private majorObjects: Fadeable[] = [];
  private minorObjects: Fadeable[] = [];
  /** Palisade rings and your own banners: the game state decides whether they are shown at all, the
   *  zoom only decides how strongly they are drawn. */
  private stateObjects: Fadeable[] = [];
  private markers: Marker[] = [];
  private stacked: StackedName[] = [];
  private icons: Phaser.GameObjects.Image[] = [];
  private traveling = false;
  private dragStart = new Phaser.Math.Vector2();
  private camStart = new Phaser.Math.Vector2();
  private dragMoved = false;
  private pinchDist = 0;
  private pinchZoom = 1;
  private pendingToast: string | null = null;
  private hud!: MapHudScene;

  constructor() { super('Map'); }

  init(data?: { toast?: string }) { this.pendingToast = data?.toast ?? null; }

  create() {
    this.status.clear(); this.names.clear(); this.badges.clear(); this.flags.clear(); this.campIcons.clear();
    this.labels = []; this.empireLabels = []; this.territoryObjects = []; this.majorObjects = []; this.minorObjects = []; this.stateObjects = [];
    this.markers = []; this.stacked = []; this.icons = [];
    this.traveling = false; this.pinchDist = 0;

    // the chart: a baked sea with its hatching, monsters and rose, then land and empires as sharp vectors
    this.cameras.main.setBackgroundColor(0x241c12);
    this.add.image(0, 0, chartTexture(this)).setOrigin(0).setDisplaySize(CHART.w, CHART.h).setDepth(0);
    this.chart = drawChart(this);

    for (const r of REGIONS) {
      const [cx, cy] = r.labelAt;
      this.empireLabels.push(this.add.text(cx, cy, MapScene.titleLines(r.name), {
        fontFamily: DISPLAY, fontSize: '64px', color: r.enterable ? CSS.ink : '#5c4b33', fontStyle: 'bold', letterSpacing: 6, align: 'center',
      }).setOrigin(0.5).setDepth(3).setLineSpacing(-10));
      const named = r.places.map(p => this.drawPlace(r, p));
      MapScene.stackNames(named, this.scale.displayScale.x || 1);
    }
    this.drawRoads();
    for (const n of NODES) this.drawNode(n);
    for (const c of CAMPS) this.drawCamp(c.id, c.name);

    // the token is a container so the idle bob (on the image) never fights the travel tween (on the container)
    const here = nodeById(GameState.location);
    const img = this.add.image(0, 0, TEX.mapToken).setScale(1.1);
    this.token = this.add.container(here.x, here.y - 12, [img]).setDepth(10);
    this.tweens.add({ targets: img, y: -4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.cameras.main.setBounds(0, 0, CHART.w, CHART.h);
    this.zoomToTerritory();
    this.scale.on('resize', this.onResize, this);

    this.scene.launch('MapHud');
    this.hud = this.scene.get('MapHud') as MapHudScene;
    this.hud.onZoom = dir => this.zoomBy(dir > 0 ? 1.5 : 1 / 1.5);

    // a battle won just before a reload: offer the sack/occupy choice again
    const pv = GameState.pendingVictory;
    if (pv) {
      this.time.delayedCall(60, () => this.scene.launch('Result', { outcome: 'victory', goldEarned: pv.goldEarned, fallen: pv.fallen, deadTroopIds: pv.deadTroopIds,
        battle: { kind: pv.battle.kind, layoutId: 'ashford', name: pv.battle.name, title: '', hint: '', defenders: { militia: 0, archers: 0, captains: 0, statMult: 1, goldMult: 1 }, palisade: false, villageId: pv.battle.villageId, campId: pv.battle.campId, tier: pv.battle.tier } }));
    }

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? 1 / 1.12 : 1.12));

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
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
        this.showPatrolPanel(a.territory === 'steppe' && b.territory === 'steppe');
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

  // ---------------------------------------------------------------- zoom & level of detail
  /** Zoomed all the way out, the whole chart fits on the screen with the table showing round it. */
  private minZoom() { const { width, height } = this.scale; return Math.min(width / CHART.w, height / CHART.h) * 0.98; }
  private setZoom(z: number) {
    this.cameras.main.setZoom(Phaser.Math.Clamp(z, this.minZoom(), MAX_ZOOM));
    this.applyLOD();
  }
  private zoomBy(f: number) { this.setZoom(this.cameras.main.zoom * f); }
  private onResize() { this.setZoom(this.cameras.main.zoom); }

  /** Close enough to see the roads of whichever territory you are standing in. */
  private territoryBox(t: Territory) {
    const ns = NODES.filter(n => n.territory === t);
    const xs = ns.map(n => n.x), ys = ns.map(n => n.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 190, h: y1 - y0 + 190 };
  }
  private zoomToTerritory(t: Territory = GameState.territory) {
    const b = this.territoryBox(t);
    const bar = 130 * (this.scale.displayScale.x || 1);   // the status bar covers the top of the screen
    const fit = Math.min(this.scale.width / b.w, (this.scale.height - bar) / b.h);
    // never frame a territory below the zoom where its own roads and places are drawn: a narrow phone
    // screen would otherwise open on blank parchment with nothing to tap
    const zoom = Phaser.Math.Clamp(Math.max(fit, BAND.minor[1] + 0.05), this.minZoom(), MAX_ZOOM);
    this.setZoom(zoom);
    this.cameras.main.centerOn(b.cx, b.cy - bar / 2 / zoom);
  }

  /** Realm names are wrapped narrow: at world zoom a wide name walks all over its neighbours. */
  private static titleLines(name: string) {
    const words = name.toUpperCase().split(' ');
    const lines: string[] = [];
    for (const w of words) {
      const last = lines[lines.length - 1];
      if (last && last.length + 1 + w.length <= 12) lines[lines.length - 1] = `${last} ${w}`;
      else lines.push(w);
    }
    return lines.join('\n');
  }

  private static fade(zoom: number, band: number[]) { return Phaser.Math.Clamp((zoom - band[0]) / (band[1] - band[0]), 0, 1); }

  /** Far out: coastlines and the names of empires. Mid: capitals and cities. Close: towns, roads, camps. */
  private applyLOD() {
    const zoom = this.cameras.main.zoom;
    const dpr = this.scale.displayScale.x || 1;
    this.chart.setInkZoom(zoom);
    const s = Phaser.Math.Clamp(dpr / zoom, 0.35, 2.6);
    for (const l of this.labels) l.t.setScale(s);
    for (const n of this.stacked) n.t.setY(n.baseY + n.row * ROW * s);   // stacked names keep one line apart
    for (const [id, name] of this.names) this.status.get(id)?.setY(name.y + name.displayHeight + 1);

    const detail = MapScene.fade(zoom, BAND.minor);
    const major = MapScene.fade(zoom, BAND.major);
    const empire = 1 - MapScene.fade(zoom, BAND.empire);
    const set = (objs: Fadeable[], a: number) => { for (const o of objs) { o.setAlpha(a); o.setVisible(a > 0.02); } };
    set(this.territoryObjects, detail);
    for (const o of this.stateObjects) o.setAlpha(detail);   // shown or not is the game state's call
    set(this.minorObjects, detail);
    set(this.majorObjects, major);
    for (const t of this.empireLabels) {
      // realm names hold 13 CSS px — but never grow past a size that would make twelve of them collide
      // on a narrow phone showing the whole Earth, so far out they shrink with the world instead
      t.setScale(Phaser.Math.Clamp(Math.min((dpr * 13) / (zoom * 64), 52 / 64), 0.18, 2.4)).setAlpha(empire * 0.9).setVisible(empire > 0.02);
    }
    for (const m of this.markers) m.icon.setScale(Phaser.Math.Clamp((m.k * dpr) / zoom, 0.14, 1.15));

    const iconScale = Phaser.Math.Clamp(0.75 / zoom, 0.28, 1.1);
    for (const i of this.icons) {
      const k = i.texture.key;
      i.setScale(k === TEX.mapPalisade ? iconScale * 1.2 : k === TEX.mapToken ? iconScale * 0.6 : iconScale);
      if (k === TEX.shadow) i.setDisplaySize(52 * iconScale, 24 * iconScale);
    }
    for (const [, c] of this.campIcons) c.setScale(iconScale);
    (this.token.list[0] as Phaser.GameObjects.Image).setScale(Phaser.Math.Clamp((0.9 * dpr) / zoom, 0.3, 2));
  }

  /** Days pass: wages, tribute, desertions, camps drift. Anything notable is shown as a toast. */
  private passDays(n: number) {
    if (n <= 0) return;
    const events = GameState.advanceDays(n);
    if (events.length) this.hud.toast(events.map(e => e.text), '#ff9a8a');
  }

  // ---------------------------------------------------------------- drawing
  private label(x: number, y: number, str: string, css: number, color: string, originY = 0, group: Fadeable[] = this.territoryObjects, halo?: string) {
    const dark = color === CSS.ink || color === CSS.inkSoft;
    const stroke = halo ?? (dark ? '#e7d8b4' : '#000000');
    const thick = halo ? Math.max(3, Math.round(css / 2.6)) : dark ? 0 : Math.max(2, Math.round(css / 4));
    const t = this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${css}px`, color, stroke, strokeThickness: thick, fontStyle: 'bold', align: 'center' }).setOrigin(0.5, originY);
    this.labels.push({ t, css });
    group.push(t);
    return t;
  }

  /** Names of neighbouring places would sit on top of each other in a compact realm, so each one that
   *  would collide with a name already placed drops a row — the way a cartographer stacks them. The
   *  measurement is done at the zoom where that rank of name fades in, because the names hold a
   *  constant size on screen rather than in the world. */
  private static stackNames(items: StackedName[], dpr: number) {
    const scaleFor = (major: boolean) => Phaser.Math.Clamp(dpr / (major ? BAND.major[1] : BAND.minor[1]), 0.35, 2.6);
    const placed: Array<{ x: number; y: number; hw: number; hh: number }> = [];
    const order = [...items].sort((a, b) => (a.major === b.major ? a.t.x - b.t.x : a.major ? -1 : 1));
    for (const it of order) {
      const s = scaleFor(it.major);
      const hw = (it.t.width * s) / 2, hh = (it.t.height * s) / 2;
      for (it.row = 0; it.row < 7; it.row++) {
        const y = it.baseY + it.row * ROW * s + hh;
        if (placed.some(q => Math.abs(q.x - it.t.x) < q.hw + hw && Math.abs(q.y - y) < q.hh + hh)) continue;
        placed.push({ x: it.t.x, y, hw, hh });
        break;
      }
    }
  }

  /** One of the world's own settlements: a marker you cannot reach yet, drawn as a promise. */
  private drawPlace(empire: Region, p: AtlasPlace): StackedName {
    const major = p.kind === 'capital' || p.kind === 'city';
    const group = major ? this.majorObjects : this.minorObjects;
    const tex = p.kind === 'capital' ? TEX.mapCapital : p.kind === 'city' ? TEX.mapCity : p.kind === 'town' ? TEX.mapTownSmall : TEX.mapVillageSmall;
    const icon = this.add.image(p.x, p.y, tex).setOrigin(0.5, 1).setDepth(p.kind === 'capital' ? 3.6 : 3.5).setTint(0x6b5738);
    group.push(icon);
    const k = p.kind === 'capital' ? 36 / 50 : p.kind === 'city' ? 29 / 44 : p.kind === 'town' ? 22 / 34 : 17 / 28;
    this.markers.push({ place: p, empire, icon, k, major });
    const t = this.label(p.x, p.y + 5, p.name, p.kind === 'capital' ? 21 : p.kind === 'city' ? 18 : 15, '#3d2f1c', 0, group, '#f2e6c8');
    t.setDepth(3.4).setAlpha(0);
    const entry: StackedName = { t, baseY: p.y + 5, row: 0, major };
    this.stacked.push(entry);
    return entry;
  }

  private drawRoads() {
    const g = this.add.graphics().setDepth(1);
    this.territoryObjects.push(g);
    for (const e of EDGES) {
      const a = nodeById(e.a), b = nodeById(e.b);
      const steppe = a.territory === 'steppe' && b.territory === 'steppe';
      g.lineStyle(steppe ? 3 : 4, PAL.dirtDeep, steppe ? 0.5 : 0.9).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(steppe ? 1.5 : 2.4, steppe ? 0xb9a87a : PAL.dirt, 1).lineBetween(a.x, a.y, b.x, b.y);
      const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      g.lineStyle(0.8, 0xa88d62, 0.7);
      for (let d = 4; d < len - 4; d += 7) g.lineBetween(a.x + ux * d, a.y + uy * d, a.x + ux * (d + 3), a.y + uy * (d + 3));
      this.label((a.x + b.x) / 2, (a.y + b.y) / 2, `${e.days}d`, 11, CSS.cream, 0.5).setDepth(2).setAlpha(0.95);
    }
  }

  private plate(x: number, y: number, w: number) {
    const plate = this.add.graphics().setDepth(5);
    plate.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, 2, w, 34, 7);
    plate.fillStyle(PAL.ironEdge, 1).fillRoundedRect(-w / 2, -2, w, 34, 7);
    plate.fillStyle(PAL.parchment, 0.96).fillRoundedRect(-w / 2 + 2, 0, w - 4, 30, 6);
    plate.lineStyle(1, PAL.goldDeep, 0.6).strokeRoundedRect(-w / 2 + 5, 3, w - 10, 24, 4);
    plate.setPosition(x, y);
    this.labels.push({ t: plate as unknown as Phaser.GameObjects.Text, css: 0 });
    this.territoryObjects.push(plate);
    return plate;
  }

  private icon(x: number, y: number, tex: string, depth = 5) {
    const sh = this.add.image(x + 2, y + 3, TEX.shadow).setAlpha(0.35).setDepth(4).setName('shadow');
    this.territoryObjects.push(sh);
    this.icons.push(sh);
    const i = this.add.image(x, y, tex).setDepth(depth);
    this.icons.push(i);
    this.territoryObjects.push(i);
    return i;
  }

  private drawNode(n: MapNode) {
    if (n.kind === 'cross') { this.territoryObjects.push(this.add.image(n.x, n.y, TEX.mapCross).setDepth(3).setScale(0.5)); return; }
    const tex = n.kind === 'camp' ? TEX.mapCamp : n.kind === 'village' ? TEX.mapVillage : n.kind === 'town' ? TEX.mapTown
      : n.kind === 'waypoint' ? TEX.mapWaypoint : n.kind === 'trade' ? TEX.mapTrade : TEX.mapGate;
    this.icon(n.x, n.y, tex);
    const small = n.kind === 'waypoint' || n.kind === 'gate';
    this.plate(n.x, n.y + 10, small ? 96 : 120);
    this.names.set(n.id, this.label(n.x, n.y + 12, n.name, small ? 11 : 13, CSS.ink).setDepth(6));
    const st = this.label(n.x, n.y + 28, '', 9, CSS.inkSoft);
    st.setDepth(6);
    this.status.set(n.id, st);
    if (n.kind === 'village' || n.kind === 'town') {
      const badge = this.add.image(n.x, n.y, TEX.mapPalisade).setDepth(4).setVisible(false);
      this.badges.set(n.id, badge);
      this.stateObjects.push(badge);
      this.icons.push(badge);
      const flag = this.add.image(n.x + 12, n.y - 12, TEX.mapToken).setDepth(7).setVisible(false);
      this.flags.set(n.id, flag);
      this.stateObjects.push(flag);
      this.icons.push(flag);
    }
  }

  /** A roaming camp: yurts that stand at a waypoint today and somewhere else tomorrow. */
  private drawCamp(id: string, name: string) {
    const c = this.add.container(0, 0).setDepth(7);
    const img = this.add.image(0, -14, TEX.mapYurts);
    const label = this.add.text(0, 12, name, { fontFamily: FONT, fontSize: '12px', color: CSS.cream, stroke: '#000', strokeThickness: 3, fontStyle: 'bold' }).setOrigin(0.5, 0);
    c.add([img, label]);
    this.campIcons.set(id, c);
    this.territoryObjects.push(c);
  }

  /** Refresh every label from the game state (day passed, village raided, infamy grew, camps moved...). */
  refresh() {
    for (const n of NODES) {
      const st = this.status.get(n.id);
      if (!st) continue;
      if (n.kind === 'camp') { st.setText('Home'); continue; }
      if (n.kind === 'gate') { st.setText('the steppe begins'); continue; }
      if (n.kind === 'trade') { st.setText('neutral · open to all'); continue; }
      if (n.kind === 'waypoint') {
        const camp = campAt(n.id);
        st.setText(camp ? `${camp.leader}'s camp is here` : 'empty grass').setColor(camp ? CSS.danger : CSS.inkSoft);
        continue;
      }
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
    for (const camp of CAMPS) {
      const at = campLocation(camp);
      const c = this.campIcons.get(camp.id)!;
      if (!at) { c.setVisible(false); continue; }
      const n = nodeById(at);
      c.setVisible(true).setPosition(n.x + 22, n.y - 26);
    }
    this.hud?.refresh();
    this.applyLOD();
  }

  // ---------------------------------------------------------------- input: drag to pan, pinch/wheel to zoom, tap to travel
  private twoFingers() {
    const ps = this.input.manager.pointers.filter(p => p.isDown);
    return ps.length >= 2 ? [ps[0], ps[1]] : null;
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.dragStart.set(p.x, p.y);
    this.camStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    this.dragMoved = false;
    const tf = this.twoFingers();
    if (tf) { this.pinchDist = Phaser.Math.Distance.Between(tf[0].x, tf[0].y, tf[1].x, tf[1].y); this.pinchZoom = this.cameras.main.zoom; this.dragMoved = true; }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!p.isDown) return;
    const tf = this.twoFingers();
    if (tf && this.pinchDist > 0) {
      const d = Phaser.Math.Distance.Between(tf[0].x, tf[0].y, tf[1].x, tf[1].y);
      this.setZoom(this.pinchZoom * (d / this.pinchDist));
      this.dragMoved = true;
      return;
    }
    if (this.hud.barContains(this.dragStart.x, this.dragStart.y) || this.hud.zoomContains(this.dragStart.x, this.dragStart.y)) return;
    if (this.hud.panelOpen && this.hud.panelContains(this.dragStart.x, this.dragStart.y)) return;
    const dx = p.x - this.dragStart.x, dy = p.y - this.dragStart.y;
    if (!this.dragMoved && Math.hypot(dx, dy) < 10 * (this.scale.displayScale.x || 1)) return;
    this.dragMoved = true;
    this.cameras.main.stopFollow();
    const z = this.cameras.main.zoom;
    this.cameras.main.setScroll(this.camStart.x - dx / z, this.camStart.y - dy / z);
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (!this.twoFingers()) this.pinchDist = 0;
    if (this.dragMoved) return;
    if (this.hud.barContains(p.downX, p.downY) || this.hud.barContains(p.x, p.y) || this.hud.zoomContains(p.x, p.y)) return;
    if (this.hud.panelOpen) {
      if (this.hud.panelContains(p.x, p.y) || this.hud.panelModal) return;
      this.hud.hidePanel();
      return;
    }
    if (this.traveling) return;
    const zoom = this.cameras.main.zoom;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    // one of your own places?
    const tapR = Math.max(18, 34 / zoom);
    let best: MapNode | null = null, bd = tapR;
    if (MapScene.fade(zoom, BAND.minor) > 0.3) {
      for (const n of NODES) {
        if (n.kind === 'cross') continue;
        const d = Phaser.Math.Distance.Between(wp.x, wp.y, n.x, n.y);
        if (d < bd) { bd = d; best = n; }
      }
      // a camp's yurts sit beside their waypoint — tapping them means that waypoint
      for (const [id, c] of this.campIcons) {
        const at = c.visible ? campLocation(campById(id)) : null;
        if (!at) continue;
        const d = Phaser.Math.Distance.Between(wp.x, wp.y, c.x, c.y - 4);
        if (d < bd + 8) { bd = d; best = nodeById(at); }
      }
    }
    if (best) {
      if (best.id === GameState.location) { this.showNodePanel(best); return; }
      if (best.kind !== 'waypoint' && best.kind !== 'gate' && best.kind !== 'trade') { // grass keeps no settlement record
        const s = GameState.settlement(best.id);
        if ((best.kind === 'town' && !s.occupied) || s.sacked) { this.showNodePanel(best); return; }
      }
      this.travelTo(best.id);
      return;
    }
    // one of the world's places — but only the ones you can actually see right now
    let mark: Marker | null = null, md = Math.max(16, 30 / zoom);
    for (const m of this.markers) {
      if (!m.icon.visible || m.icon.alpha < 0.35) continue;
      const d = Phaser.Math.Distance.Between(wp.x, wp.y, m.place.x, m.place.y - 6 / zoom);
      if (d < md) { md = d; mark = m; }
    }
    if (mark) { this.showPlacePanel(mark); return; }
    // the name of a realm, written across it — the most obvious thing on the chart to tap
    let named: Region | null = null, nd = Infinity;
    for (let i = 0; i < this.empireLabels.length; i++) {
      const t = this.empireLabels[i];
      if (!t.visible || t.alpha <= 0.15 || !t.getBounds().contains(wp.x, wp.y)) continue;
      const d = Phaser.Math.Distance.Between(wp.x, wp.y, t.x, t.y);   // names overlap when zoomed out
      if (d < nd) { nd = d; named = REGIONS[i]; }
    }
    if (named) { this.showRegionPanel(named); return; }
    // a sea road?
    for (const r of SEA_ROUTES) if (distToPolyline(wp.x, wp.y, r.pts) < Math.max(14, 30 / zoom)) { this.showSeaPanel(r.name); return; }
    // an empire?
    const region = regionAt(wp.x, wp.y);
    if (region) this.showRegionPanel(region);
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
    // does a patrol find you on this stretch? (the steppe hunts camp-raiders far harder)
    const a = nodeById(from), b = nodeById(to);
    const steppe = b.territory === 'steppe' && a.territory === 'steppe';
    let intercepted = false;
    if (steppe) {
      const canPatrol = GameState.day - GameState.lastSteppePatrolDay >= 2;
      const chance = GameState.hunted ? STEPPE.huntChance : (INFAMY.interceptChance[GameState.steppeTier] ?? 0);
      intercepted = chance > 0 && canPatrol && Math.random() < chance;
    } else {
      const canPatrol = GameState.day - GameState.lastPatrolDay >= INFAMY.patrolCooldownDays;
      intercepted = GameState.patrolChance > 0 && canPatrol && Math.random() < GameState.patrolChance;
    }
    this.moveToken(a, b, 0, intercepted ? 0.5 : 1, () => {
      GameState.pendingPath = GameState.pendingPath.slice(1);
      GameState.location = to;
      if (intercepted) {
        this.passDays(Math.ceil(edge.days / 2));
        GameState.resumeTravel = { from, to };
        GameState.patrolPending = true;
        if (steppe) GameState.lastSteppePatrolDay = GameState.day; else GameState.lastPatrolDay = GameState.day;
        GameState.save();
        this.refresh();
        Sound.patrol();
        this.cameras.main.shake(250, 0.004);
        this.showPatrolPanel(steppe);
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
    this.tweens.add({ targets: this.token, x: x1, y: y1, duration: Phaser.Math.Clamp(dur, 400, 2600), ease: 'Sine.InOut', onComplete: done });
  }

  private routeDays(to: string) {
    const path = findPath(GameState.location, to);
    let days = 0, cur = GameState.location;
    for (const n of path) { days += edgeBetween(cur, n)?.days ?? 0; cur = n; }
    return days;
  }

  // ---------------------------------------------------------------- panels
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

  private zoomInButton(t: Territory) {
    return { label: 'ZOOM IN', color: 0x2f6b8a, onPress: () => { this.hud.hidePanel(); this.zoomToTerritory(t); } };
  }

  /** The card for a realm: what it is, who sits on its throne, and whether you can go there. */
  private showRegionPanel(r: Region) {
    const leave = { label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() };
    if (r.territory === 'homeland') { this.hud.showPanel({ title: r.name.toUpperCase(), lines: [r.note], buttons: [this.zoomInButton('homeland'), leave] }); return; }
    if (r.territory === 'steppe') {
      const here = GameState.territory === 'steppe';
      this.hud.showPanel({ title: r.name.toUpperCase(), lines: [r.note, here ? 'You are on the grass now.' : `The Border Stones are ${this.routeDays('steppe_gate')} days from where you stand.`],
        buttons: [here ? this.zoomInButton('steppe')
          : { label: `MARCH (${this.routeDays('steppe_gate')}d)`, color: 0xa0341f, onPress: () => this.travelTo('steppe_gate') }, leave] });
      return;
    }
    const great = r.places.filter(p => p.kind === 'capital' || p.kind === 'city').map(p => p.name);
    const lesser = r.places.length - great.length;
    const lines = [r.note];
    if (r.throne) lines.push(`Throne: ${r.throne}`);
    if (great.length) lines.push(`${great.join(' · ')}${lesser > 0 ? `, and ${lesser} lesser places` : ''}`);
    lines.push('Not yet — your road ends at the steppe.');
    this.hud.showPanel({ title: r.name.toUpperCase(), lines, buttons: [leave] });
  }

  /** One of the world's settlements, seen from very far away. */
  private showPlacePanel(m: Marker) {
    const rank = m.place.kind === 'capital' ? `The throne of ${m.empire.name}` : m.place.kind === 'city' ? `A great city of ${m.empire.name}`
      : m.place.kind === 'town' ? `A town of ${m.empire.name}` : `A village of ${m.empire.name}`;
    this.hud.showPanel({
      title: m.place.name.toUpperCase(),
      lines: [m.place.note, rank, 'Not yet — your road ends at the steppe.'],
      buttons: [{ label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() }],
    });
  }

  private showSeaPanel(name: string) {
    this.hud.showPanel({ title: name.toUpperCase(), lines: ['No ship will carry you — yet.'], buttons: [{ label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() }] });
  }

  private showNodePanel(n: MapNode) {
    const leave = { label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() };
    const here = GameState.location === n.id;
    if (n.kind === 'camp') {
      this.hud.showPanel({
        title: 'BANDIT CAMP', lines: ['Your home. Tap the Forge, the Barracks or the Stables to spend your gold. Waiting here still costs wages.'],
        buttons: [{ label: 'ENTER CAMP', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: 'camp' }); } }, leave],
      });
      return;
    }
    if (n.kind === 'gate') {
      this.hud.showPanel({ title: n.name.toUpperCase(), lines: [n.blurb ?? '', 'Beyond here there are no villages — only camps that move, a neutral trader, and riders who shoot at a gallop.'], buttons: [leave] });
      return;
    }
    if (n.kind === 'trade') {
      this.hud.showPanel({
        title: n.name.toUpperCase(), lines: [n.blurb ?? '', 'Steppe riders for hire, the composite bow, a courser, and an innkeeper who has heard things.'],
        buttons: [here ? { label: 'ENTER', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id }); } } : { label: `RIDE THERE (${this.routeDays(n.id)}d)`, color: 0x2f6b8a, onPress: () => this.travelTo(n.id) }, leave],
      });
      return;
    }
    if (n.kind === 'waypoint') {
      const camp = campAt(n.id);
      const lines = [camp ? `${camp.name} stands here today — ${STEPPE.camp.horsearchers} horse archers, ${STEPPE.camp.riders} riders and their noyan. Tomorrow it will have moved on.` : 'Empty grass today. The camps drift one waypoint a day.'];
      const elsewhere = CAMPS.filter(c => campLocation(c) && campLocation(c) !== n.id).map(c => `${c.name} at ${nodeById(campLocation(c)!).name}`);
      if (elsewhere.length) lines.push(elsewhere.join(' · '));
      if (GameState.hunted) lines.push(`Riders are hunting you (${GameState.huntedUntil - GameState.day} more days).`);
      const buttons = [];
      if (camp && here) buttons.push({ label: 'RAID', color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', campBattle(camp.id)); } });
      else if (camp) buttons.push({ label: `RIDE (${this.routeDays(n.id)}d)`, color: 0xa0341f, onPress: () => this.travelTo(n.id) });
      buttons.push(leave);
      this.hud.showPanel({ title: n.name.toUpperCase(), lines, buttons });
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
        buttons: [here ? { label: 'ENTER', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id }); } } : { label: `GO (${this.routeDays(n.id)}d)`, color: 0x2f6b8a, onPress: () => this.travelTo(n.id) }, leave],
      });
      return;
    }
    if (n.kind === 'town') {
      if (!GameState.siegeUnlocked) {
        const lines = [n.blurb ?? '', `The garrison is far too strong for a nobody. Become a ${INFAMY.tiers[SIEGE.unlockTier].name} (infamy ${INFAMY.tiers[SIEGE.unlockTier].min}) and they will take you seriously.`,
          !here ? `The road there takes ${this.routeDays(n.id)} days.` : ''].filter(Boolean);
        const visit = this.visitButton(n, lines);
        this.hud.showPanel({ title: n.name.toUpperCase(), lines, buttons: [...(visit ? [visit] : []), leave] });
      } else {
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

  private showPatrolPanel(steppe: boolean) {
    if (steppe) {
      const p = STEPPE.patrol;
      this.hud.showPanel({
        title: 'RIDERS', modal: true,
        lines: [GameState.hunted ? `The camps' riders have found you — ${p.horsearchers} horse archers and ${p.riders} lancers, circling. No outrunning horses on the grass.` : `${p.horsearchers + p.riders} steppe riders wheel in from the grass. They shoot at a gallop.`],
        buttons: [{ label: 'FIGHT', color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', steppePatrolBattle()); } }],
      });
      return;
    }
    const p = GameState.patrolConfig();
    const n = p ? p.militia + p.archers + p.captains : 6;
    this.hud.showPanel({
      title: 'ROAD PATROL', modal: true,
      lines: [`${n} riders block the road — your bounty has drawn them. There is no way around.`],
      buttons: [{ label: 'FIGHT', color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', patrolBattle()); } }],
    });
  }
}
