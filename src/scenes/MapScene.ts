// MapScene.ts — the world chart: an atlas of empires on one sheet of parchment. Pan and zoom freely
// from the whole Earth (coastlines and the names of twelve realms) through their capitals and cities,
// down to the roads and villages of the small borderland you actually rule. Your warband is a token;
// tap a place to travel there (days pass, wages are paid, tribute comes in), then raid it, enter it,
// visit it — or get stopped on the road. The steppe has camps that move and riders that hunt raiders.
// Everything outside your reach is drawn muted: it is the content plan, visible from day one.
import Phaser from 'phaser';
import { GameState, type Quest } from '../state/GameState';
import { FOREIGN, INFAMY, SIEGE, STEPPE } from '../config/balance';
import { capitalOf, drawnEdges, FOREIGN_SETTLEMENTS as FOREIGN_PLACES, nodeById, NODES, tradesWithForeigners, type MapNode, type Territory } from '../world/WorldMap';
import { visitOf } from '../world/Realms';
import { route as findRoute, routeToPlace, terrain, totalLength, type Route } from '../world/Terrain';
import { CONTACT } from '../world/Hunters';
import type { Pt } from '../world/geo';
import { campBattle, foreignBattle, foreignPatrolBattle, many, patrolBattle, siegeBattle, steppePatrolBattle, villageBattle } from '../world/Battles';
import { LAYOUTS } from '../world/Layouts';
import { CAMPS, campAt, campById, campLocation } from '../world/Steppe';
import { bbox, CHART, distToPolyline, REGIONS, SEA_ROUTES, type Region } from '../world/WorldChart';
import { ChartLayer } from '../world/ChartLayer';
import type { AtlasPlace } from '../world/AtlasData';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import type { MapHudScene, PanelButton } from './MapHudScene';
import { CSS, DISPLAY, FONT, PAL } from './ui';

/** How far the sea is painted beyond the chart's own frame. */
const EDGE = 520;

/** The point a given distance along a polyline. */
function pointAt(pts: Pt[], want: number): Pt {
  let left = want;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (left <= len) return [ax + ((bx - ax) * left) / len, ay + ((by - ay) * left) / len];
    left -= len;
  }
  return pts[pts.length - 1];
}

interface LabelRef { t: Phaser.GameObjects.Text; css: number; }
/** One of the world's settlements on the chart: a marker pinned to its exact spot and a name under it,
 *  both held at a constant size on screen whatever the zoom. */
interface Marker {
  place: AtlasPlace; empire: Region;
  icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; stars: Phaser.GameObjects.Text;
  rank: number;          // 0 capital, 1 city, 2 town, 3 village
  iconPx: number;        // how tall the marker is drawn, in CSS pixels
  labelPx: number;       // and how big its name is set
  /** What took the room its name needed, when it could not be written. Null when it was. */
  blockedBy?: string | null;
}
/** What each rank looks like, and how far in you must be before it is worth drawing at all. */
const RANK = [
  { icon: 26, label: 15, from: 0 },      // capital — a landmark at every zoom
  { icon: 20, label: 13, from: 0.5 },    // city
  { icon: 15, label: 11, from: 1.05 },   // town
  { icon: 12, label: 10, from: 1.5 },    // village
];
/** Names are rendered once at this size and only ever scaled down, which is what keeps them sharp. */
const LABEL_BASE = 22;
/** Anything the level of detail can fade out (Graphics and Containers only have a single alpha). */
interface Fadeable { alpha: number; visible: boolean; setAlpha(v: number): unknown; setVisible(v: boolean): unknown; }

const MAX_ZOOM = 5;
/** Past this the chart is ground underfoot, not an index, and its settlements scale with it. */
const GROUND_ZOOM = 1.5;
/** How much of the world's growth a marker takes for itself past that. The rest becomes elbow room. */
const MARKER_GROWTH = 0.45;
/** Close enough that a place must always be VISIBLE, even where there is no room to write its name. */
const CLOSE_ZOOM = 2.1;
/** How far in the chart is drawn: the whole Earth, then capitals, then every road and hut. */
const BAND = { major: [0.55, 0.85], minor: [1.3, 1.8], empire: [1.15, 1.95] };

export class MapScene extends Phaser.Scene {
  private token!: Phaser.GameObjects.Container;
  private status = new Map<string, Phaser.GameObjects.Text>();
  private names = new Map<string, Phaser.GameObjects.Text>();
  private badges = new Map<string, Phaser.GameObjects.Image>();
  private flags = new Map<string, Phaser.GameObjects.Image>();
  private campIcons = new Map<string, Phaser.GameObjects.Container>();
  private labels: LabelRef[] = [];
  private empireLabels: Phaser.GameObjects.Text[] = [];
  /** Which realm's name gets the ground when two would collide: the largest claim wins. */
  private empireOrder: number[] = [];
  private territoryObjects: Fadeable[] = [];

  /** Palisade rings and your own banners: the game state decides whether they are shown at all, the
   *  zoom only decides how strongly they are drawn. */
  private stateObjects: Fadeable[] = [];
  private markers: Marker[] = [];
  private chart!: ChartLayer;
  private icons: Phaser.GameObjects.Image[] = [];
  private traveling = false;
  private dragStart = new Phaser.Math.Vector2();
  private camStart = new Phaser.Math.Vector2();
  private dragMoved = false;
  private pinchDist = 0;
  private pinchZoom = 1;
  private pendingToast: string | null = null;
  private hud!: MapHudScene;
  /** The line drawn for the march being offered or walked. */
  private planLine!: Phaser.GameObjects.Graphics;
  private questPulse: Phaser.GameObjects.Graphics | null = null;
  /** The little flags over places a job points at, kept by settlement id. */
  private questPins = new Map<string, Phaser.GameObjects.Text>();
  /** What was drawn for each of your own places, so a quest can hold one out of the fade. */
  private nodeArt = new Map<string, Fadeable[]>();
  private hunterIcons = new Map<number, Phaser.GameObjects.Container>();
  // far in the past, so the very first tap after the map opens can never be read as the second half
  // of a double tap (the scene clock starts at zero)
  private lastTap = -1e9;
  private lastTapAt = new Phaser.Math.Vector2();
  /** Set by a double click so the pointer-up that ends it cannot also be read as a tap on the map. */
  private swallowTap = false;
  /** Worked-out marches, thrown away the moment the warband moves. */
  private routeCache = new Map<string, Route | null>();
  private marchAt = -1e9;
  private legsDone = 0;

  constructor() { super('Map'); }

  init(data?: { toast?: string }) { this.pendingToast = data?.toast ?? null; }

  create() {
    this.status.clear(); this.names.clear(); this.badges.clear(); this.flags.clear(); this.campIcons.clear();
    this.labels = []; this.empireLabels = []; this.territoryObjects = []; this.stateObjects = [];
    this.nodeArt.clear(); this.questPins.clear();
    this.markers = []; this.icons = [];
    this.traveling = false; this.pinchDist = 0;

    // the chart itself, repainted at whatever zoom you settle on
    this.cameras.main.setBackgroundColor(0x241c12);
    this.chart = new ChartLayer(this);
    terrain(MapScene.roadSegments());

    for (const r of REGIONS) {
      const [cx, cy] = r.labelAt;
      this.empireLabels.push(this.add.text(cx, cy, MapScene.titleLines(GameState.rules(r.id) ? `\u265B ${r.name}` : r.name), {
        fontFamily: DISPLAY, fontSize: '64px', color: r.enterable ? CSS.ink : '#5c4b33', fontStyle: 'bold', letterSpacing: 6, align: 'center',
      }).setOrigin(0.5).setDepth(3).setLineSpacing(-10).setPadding(0, 0, 14, 0));
      for (const p of r.places) this.drawPlace(r, p);
      // and the border hamlets, which the atlas never named but a warband very much cares about
      for (const h of FOREIGN_PLACES) {
        if (h.territory !== r.id || !h.fringe) continue;
        this.drawPlace(r, { name: h.name, kind: 'village', x: h.x, y: h.y, note: h.blurb ?? '' });
      }
    }
    const claimArea = (r: Region) => { const bb = bbox(r.poly); return bb.w * bb.h * (r.enterable ? 1e6 : 1); };
    this.empireOrder = REGIONS.map((_r, i) => i).sort((a, b) => claimArea(REGIONS[b]) - claimArea(REGIONS[a]));
    this.drawRoads();
    for (const n of NODES) this.drawNode(n);
    for (const c of CAMPS) this.drawCamp(c.id, c.name);

    // the token is a container so the idle bob (on the image) never fights the travel tween (on the container)
    this.planLine = this.add.graphics().setDepth(9);
    const img = this.add.image(0, 0, TEX.mapToken).setScale(1.1);
    this.token = this.add.container(GameState.pos.x, GameState.pos.y - 12, [img]).setDepth(10);
    this.tweens.add({ targets: img, y: -4, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    // the sea runs past the frame of the chart, so a wide monitor never shows a dead strip beside it
    this.cameras.main.setBounds(-EDGE, -EDGE, CHART.w + EDGE * 2, CHART.h + EDGE * 2);
    this.zoomToTerritory();
    this.cameras.main.centerOn(this.token.x, this.token.y);
    this.cameras.main.preRender();
    this.chart.refresh(this.cameras.main);
    this.scale.on('resize', this.onResize, this);
    // A double click or double tap is a ZOOM and nothing else: it throws away any march being offered
    // and swallows the tap that follows it, so you can never zoom in and set off walking by accident.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const now = this.time.now;
      // the first half of a double click may have gone into a panel sitting over the map (its MARCH
      // button, most dangerously) — the HUD is a scene above this one and swallows the pointer, so ask
      // it when it was last pressed and treat that as the first tap
      const hudAt = this.hud?.lastPanelPressAt ?? -1e9;
      const useHud = hudAt > this.lastTap;
      const prevAt = useHud ? hudAt : this.lastTap;
      const prev = useHud ? this.hud.lastPanelPress : this.lastTapAt;
      if (now - prevAt < 320 && Phaser.Math.Distance.Between(p.x, p.y, prev.x, prev.y) < 40 * (this.scale.displayScale.x || 1)) {
        if (this.hud?.panelOpen && !this.hud.panelModal) this.hud.hidePanel();
        // the first click of a double click can land on the MARCH button of a panel that is sitting
        // over the map. If a march has only just been ordered and not a single day of it has been
        // walked yet, this was that click: take it back.
        if (this.traveling && this.legsDone === 0 && this.time.now - this.marchAt < 600) this.abortMarch();
        else if (!this.traveling) this.clearPlan();
        this.zoomAt(p.x, p.y, 1.6);              // double tap: a step in, toward what you pointed at
        this.lastTap = 0;
        if (this.hud) this.hud.lastPanelPressAt = -1e9;
        this.swallowTap = true;
        return;
      }
      this.lastTap = now;
      this.lastTapAt.set(p.x, p.y);
    });

    this.scene.launch('MapHud');
    this.hud = this.scene.get('MapHud') as MapHudScene;
    this.hud.onZoom = dir => this.zoomBy(dir > 0 ? 1.5 : 1 / 1.5);
    this.hud.onLocate = () => this.locate();
    this.hud.onQuestFind = q => this.showQuest(q);
    this.hud.onQuestRoute = q => this.routeToQuest(q);
    this.markQuestPins();
    // a save written by an older map may have left the warband on a rock: say so, once, plainly
    if (GameState.rescuedTo) {
      const where = GameState.rescuedTo;
      GameState.rescuedTo = null;
      GameState.save();
      this.time.delayedCall(400, () => this.hud.toast([
        `The old chart had you on a rock with no road off it.`,
        `Your warband is at ${where}. Nothing else is lost.`,
      ], '#f5c542'));
    }
    this.fitViewport();

    // a battle won just before a reload: offer the sack/occupy choice again
    const pv = GameState.pendingVictory;
    if (pv) {
      this.time.delayedCall(60, () => this.scene.launch('Result', { outcome: 'victory', goldEarned: pv.goldEarned, fallen: pv.fallen, deadTroopIds: pv.deadTroopIds,
        battle: { kind: pv.battle.kind, layoutId: 'ashford', name: pv.battle.name, title: '', hint: '', defenders: { militia: 0, archers: 0, captains: 0, statMult: 1, goldMult: 1 }, palisade: false, villageId: pv.battle.villageId, campId: pv.battle.campId, tier: pv.battle.tier, realm: pv.battle.realm, rank: pv.battle.rank } }));
    }

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number) => {
      // A trackpad pinch reaches the browser as a wheel event with ctrl held — that is the ONLY way a
      // page can see one. Phaser does not pass the raw event to this callback, so read it off the
      // pointer, which is where Phaser parks it. Pinch out is a negative delta: in. Pinch in: out.
      const ev = p.event as WheelEvent | undefined;
      if (ev && ev.ctrlKey) { this.zoomAt(p.x, p.y, dy < 0 ? 1.06 : 1 / 1.06); return; }
      // a trackpad sends small fractional deltas and real sideways movement; a mouse wheel does not
      const trackpadPan = Math.abs(dx) > 0.5 || (!Number.isInteger(dy) && Math.abs(dy) < 40);
      if (trackpadPan) {
        const z = this.cameras.main.zoom;
        this.cameras.main.stopFollow();
        this.cameras.main.setScroll(this.cameras.main.scrollX + dx / z, this.cameras.main.scrollY + dy / z);
        return;
      }
      this.zoomAt(p.x, p.y, dy > 0 ? 1 / 1.12 : 1.12);
    });

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.scene.stop('MapHud');
    });

    // pick up where we left off: a hunting party on top of you, or standing somewhere
    this.time.delayedCall(30, () => {
      // the HUD is a scene of its own and had not been built yet when the camera was first fitted, so
      // on the very first map of a page load its bar height read as zero and the top of the chart sat
      // under it. Now that it exists, fit again and re-centre on the warband.
      this.fitViewport();
      this.cameras.main.centerOn(this.token.x, this.token.y);
      this.cameras.main.preRender();
      this.chart.refresh(this.cameras.main);
      this.refresh();
      if (this.pendingToast) { this.hud.toast([this.pendingToast], '#f5c542'); this.pendingToast = null; }
      if (GameState.patrolPending) {
        this.showPatrolPanel(GameState.patrolFrom);
      } else if (GameState.location) {
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
  private onResize() { this.fitViewport(); this.setZoom(this.cameras.main.zoom); }

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
      if (last && last.length + 1 + w.length <= 14) lines[lines.length - 1] = `${last} ${w}`;
      else lines.push(w);
    }
    return lines.join('\n');
  }

  private static fade(zoom: number, band: number[]) { return Phaser.Math.Clamp((zoom - band[0]) / (band[1] - band[0]), 0, 1); }

  /** Far out: coastlines and the names of empires. Mid: capitals and cities. Close: towns, roads, camps. */
  private applyLOD() {
    const zoom = this.cameras.main.zoom;
    const dpr = this.scale.displayScale.x || 1;
    const s = Phaser.Math.Clamp(dpr / zoom, 0.35, 2.6);
    for (const l of this.labels) l.t.setScale(s);
    for (const [id, name] of this.names) this.status.get(id)?.setY(name.y + name.displayHeight + 1);
    this.layoutQuestPins();

    const detail = MapScene.fade(zoom, BAND.minor);
    const empire = 1 - MapScene.fade(zoom, BAND.empire);
    const set = (objs: Fadeable[], a: number) => { for (const o of objs) { o.setAlpha(a); o.setVisible(a > 0.02); } };
    set(this.territoryObjects, detail);
    // and a place you are carrying work to is held out of that fade entirely
    for (const id of GameState.questTargets()) {
      for (const ob of this.nodeArt.get(id) ?? []) { ob.setAlpha(1); ob.setVisible(true); }
    }
    for (const o of this.stateObjects) o.setAlpha(detail);   // shown or not is the game state's call
    // realm names hold 13 CSS px — but never grow past a size that would make twelve of them collide
    // on a narrow phone showing the whole Earth, so far out they shrink with the world instead. Where
    // two names would still touch, the smaller realm's name waits until you zoom in far enough for it.
    const escale = Phaser.Math.Clamp(Math.min((dpr * 13) / (zoom * 64), 52 / 64), 0.18, 2.4);
    const claimed: Array<[number, number, number, number]> = [];
    for (const i of this.empireOrder) {
      const t = this.empireLabels[i];
      t.setScale(escale).setAlpha(empire * 0.9);
      if (empire <= 0.02) { t.setVisible(false); continue; }
      const b: [number, number, number, number] = [t.x, t.y, t.width * escale * 0.9, t.height * escale * 0.85];
      const clash = claimed.some(q => Math.abs(q[0] - b[0]) < (q[2] + b[2]) / 2 && Math.abs(q[1] - b[1]) < (q[3] + b[3]) / 2);
      t.setVisible(!clash);
      if (!clash) claimed.push(b);
    }
    this.layoutMarkers();

    const iconScale = Phaser.Math.Clamp(0.75 / zoom, 0.28, 1.1);
    for (const i of this.icons) {
      const k = i.texture.key;
      i.setScale(k === TEX.mapPalisade ? iconScale * 1.2 : k === TEX.mapToken ? iconScale * 0.6 : iconScale);
      if (k === TEX.shadow) i.setDisplaySize(52 * iconScale, 24 * iconScale);
    }
    for (const [, c] of this.campIcons) c.setScale(iconScale);
    const hs = Phaser.Math.Clamp((0.8 * dpr) / zoom, 0.25, 1.6);
    for (const [, c] of this.hunterIcons) c.setScale(hs);
    (this.token.list[0] as Phaser.GameObjects.Image).setScale(Phaser.Math.Clamp((0.9 * dpr) / zoom, 0.3, 2));
  }

  /** Every frame: let the chart notice when we have settled somewhere new, so it can repaint itself
   *  sharp at that zoom. Nothing else moves the camera on its own — the map only goes where you send it. */
  update() {
    this.chart?.tick(this.cameras.main);
  }

  /** The parties out looking for you, drawn where they actually are. */
  private drawHunters() {
    const live = new Set<number>();
    for (const h of GameState.hunters) {
      live.add(h.id);
      let c = this.hunterIcons.get(h.id);
      if (!c) {
        const img = this.add.image(0, 0, TEX.mapHunters);
        const ring = this.add.circle(0, 0, CONTACT, 0xa0341f, 0.1).setStrokeStyle(2, 0xa0341f, 0.35);
        c = this.add.container(h.x, h.y, [ring, img]).setDepth(9.5);
        this.hunterIcons.set(h.id, c);
      }
      c.setPosition(h.x, h.y).setVisible(true);
    }
    for (const [id, c] of this.hunterIcons) if (!live.has(id)) { c.destroy(); this.hunterIcons.delete(id); }
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

  /** One of the world's own settlements: a marker pinned to its spot, and its name a fixed drop below. */
  private drawPlace(empire: Region, p: AtlasPlace) {
    const rank = p.kind === 'capital' ? 0 : p.kind === 'city' ? 1 : p.kind === 'town' ? 2 : 3;
    const tex = p.kind === 'capital' ? TEX.mapCapital : p.kind === 'city' ? TEX.mapCity : p.kind === 'town' ? TEX.mapTownSmall : TEX.mapVillageSmall;
    const icon = this.add.image(p.x, p.y, tex).setOrigin(0.5, 1).setDepth(3.5 + (3 - rank) * 0.02).setTint(0x6b5738);
    const dpr = this.scale.displayScale.x || 1;
    const label = this.add.text(p.x, p.y, p.name, {
      fontFamily: FONT, fontSize: `${LABEL_BASE}px`, color: '#3d2f1c', stroke: '#f2e6c8',
      strokeThickness: LABEL_BASE / 2.6, fontStyle: 'bold', align: 'center',
      resolution: Phaser.Math.Clamp(dpr * 1.2, 2, 3),
    }).setOrigin(0.5, 0).setDepth(3.4);
    // the protection rating, written small under the name: what a glance at the plate has to tell you
    const stars = this.add.text(p.x, p.y, '', {
      fontFamily: FONT, fontSize: `${LABEL_BASE}px`, color: '#7a3b2a', stroke: '#f2e6c8',
      strokeThickness: LABEL_BASE / 3.2, align: 'center', resolution: Phaser.Math.Clamp(dpr * 1.2, 2, 3),
    }).setOrigin(0.5, 0).setDepth(3.35);
    this.markers.push({ place: p, empire, icon, label, stars, rank, iconPx: RANK[rank].icon, labelPx: RANK[rank].label });
  }

  /** Decide, for the zoom we have settled on, which settlements can be shown without anything touching
   *  anything else. A settlement occupies its marker AND its name together, the way a cartographer
   *  thinks of it; where two of them would touch, the lesser one steps aside until you come closer.
   *  Every box is worked out in world units scaled from screen sizes, so the answer does not depend on
   *  where the camera happens to be pointing — only on how far in you are. */
  private layoutMarkers() {
    const zoom = this.cameras.main.zoom;
    const dpr = this.scale.displayScale.x || 1;
    // A marker holds a constant size on screen while you are looking at the world, which is what
    // keeps a world view legible instead of a wall of overlapping crowns. Past the close band the
    // map stops being an index and becomes ground you are standing on, so from there the markers
    // grow with it — your own camp and its plate are drawn in world units and do exactly that, and
    // a Roman village has no business being a speck beside them.
    //
    // But they grow SLOWER than the ground does. If they kept a constant size in world units, the
    // crowding would be frozen: zooming into the valley of Mexico would never reveal one more name
    // than it showed at arm's length, because every claim grew exactly as fast as the room did. The
    // exponent is what makes zooming in mean something — the marker still gets bigger on the screen,
    // and it takes up less of the ground while it does.
    const ze = zoom <= GROUND_ZOOM ? zoom : GROUND_ZOOM * Math.pow(zoom / GROUND_ZOOM, MARKER_GROWTH);
    const u = dpr / ze;                                      // one CSS pixel, in world units
    // Your own settlements are laid out by applyLOD, not by this, and they take up what IT gives them:
    // a plate and a name held at a constant size on screen until the clamp catches. Claim that, or a
    // close view has every atlas name stepping aside for a box far bigger than the plate it stands for.
    const hu = Phaser.Math.Clamp(dpr / zoom, 0.35, 2.6);
    const questNames = new Set<string>();
    for (const id of GameState.questTargets()) { try { questNames.add(nodeById(id).name); } catch { /* gone from the chart */ } }
    // and they are laid out FIRST, so they claim their name before anything else can take the room
    const order = [...this.markers].sort((a, b) =>
      Number(questNames.has(b.place.name)) - Number(questNames.has(a.place.name)) || a.rank - b.rank || a.place.x - b.place.x);
    type Box = [number, number, number, number, string?];
    const taken: Box[] = [];       // everything that is written
    const solid: Box[] = [];       // and the things that are drawn
    const blocker = (b: Box, list: Box[]) =>
      list.find(q => Math.abs(q[0] - b[0]) < (q[2] + b[2]) / 2 && Math.abs(q[1] - b[1]) < (q[3] + b[3]) / 2);
    const hit = (b: Box, list: Box[]) => !!blocker(b, list);
    // the name of a realm outranks every settlement NAME in it — but a crown may still stand under a
    // letter of it, because a capital is a landmark and must not vanish from the world view
    for (const t of this.empireLabels) {
      if (!t.visible || t.alpha <= 0.15) continue;
      taken.push([t.x, t.y, t.width * t.scaleX, t.height * t.scaleY, `realm name ${t.text}`]);
    }
    // your own places hold their ground: an empire's village never writes over one of your villages
    if (MapScene.fade(zoom, BAND.minor) > 0.3) {
      for (const n of NODES) {
        if (n.kind === 'cross' || n.kind === 'foreign') continue;
        taken.push([n.x, n.y, 24, 24, n.name]);             // the marker itself is drawn in world units
        solid.push([n.x, n.y, 24, 24, n.name]);
        // the plate is opaque and drawn over the atlas, so a marker that would end up behind it is
        // not a marker at all — it steps aside like anything else that cannot fit
        taken.push([n.x, n.y + 10 + 17 * hu, 124 * hu, 38 * hu, `${n.name} plate`]);
        solid.push([n.x, n.y + 10 + 17 * hu, 124 * hu, 38 * hu, `${n.name} plate`]);
      }
    }
    for (const m of order) {
      const spec = RANK[m.rank];
      const scale = (spec.icon * u) / m.icon.height;        // a constant height on screen
      const lscale = (spec.label * u) / LABEL_BASE;
      // the claim must be as wide as the thing actually drawn: at 0.85 two crowns could sit 15% inside
      // each other and still both believe they had room (Athenai and Sparta, three units apart)
      const iw = m.icon.width * scale * 0.95, ih = spec.icon * u;
      const lw = m.label.width * lscale, lh = m.label.height * lscale;
      const gap = 2 * u;
      // the rating is set at three-fifths of the name and only appears once the name does, so a world
      // view stays a world view and a close view tells you what you are looking at
      const sscale = lscale * 0.6;
      const sh = m.stars.text ? m.stars.height * sscale : 0;
      // a settlement asks for its marker AND its name; if there is no room for both it keeps the marker
      // and gives up the name, and only steps aside entirely when even the marker will not fit
      const both: Box =
        [m.place.x, m.place.y + (gap + lh + sh - ih) / 2, Math.max(iw, lw, m.stars.width * sscale), ih + gap + lh + sh, m.place.name];
      const alone: Box = [m.place.x, m.place.y - ih / 2, iw, ih, m.place.name];
      // and if the ground below is spoken for — the camp's own banner is a wide thing at close range —
      // the name goes above the marker instead. Moving the writing is what a cartographer does before
      // he gives up on naming a place at all.
      const drop = gap + lh + sh;
      // the claim runs from the top of the writing down to the foot of the marker, exactly as below
      const above: Box =
        [both[0], m.place.y - (ih + drop + gap) / 2, both[2], ih + drop + gap, m.place.name];
      // a place you are carrying work to is never hidden, however far out you pull
      if (zoom < spec.from && !questNames.has(m.place.name)) {
        m.icon.setVisible(false); m.label.setVisible(false); m.stars.setVisible(false); continue;
      }
      let named = !hit(both, taken), up = false;
      if (!named && !hit(above, taken)) { named = true; up = true; }
      // why a name could not be written, kept for the harness — a place nobody can read is a bug
      m.blockedBy = named ? null : (blocker(both, taken)?.[4] ?? 'another place');
      const box = named ? (up ? above : both) : alone;
      // Standing over a place and not being shown it at all is worse than a crowded chart: you tap
      // what looks like open ground and a panel names somewhere that was never drawn. Close in, a
      // settlement always keeps its marker; it is only far out that it may step aside entirely.
      if (!named && hit(alone, solid) && zoom < CLOSE_ZOOM) {
        m.icon.setVisible(false); m.label.setVisible(false); m.stars.setVisible(false); continue;
      }
      taken.push(box);
      solid.push(box);                    // what is actually drawn, so nothing later lands on a name
      const ly = up ? m.place.y - ih - drop - gap : m.place.y + gap;
      m.icon.setVisible(true).setScale(scale).setAlpha(m.rank === 0 ? 1 : 0.92);
      m.label.setVisible(named).setScale(lscale).setPosition(m.place.x, ly);
      m.stars.setVisible(named && !!m.stars.text).setScale(sscale).setPosition(m.place.x, ly + lh);
    }
  }

  private drawRoads() {
    const g = this.add.graphics().setDepth(1);
    this.territoryObjects.push(g);
    for (const e of drawnEdges(GameState.home)) {
      const a = nodeById(e.a), b = nodeById(e.b);
      const steppe = a.territory === 'steppe' && b.territory === 'steppe';
      g.lineStyle(steppe ? 3 : 4, PAL.dirtDeep, steppe ? 0.5 : 0.9).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(steppe ? 1.5 : 2.4, steppe ? 0xb9a87a : PAL.dirt, 1).lineBetween(a.x, a.y, b.x, b.y);
      const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
      g.lineStyle(0.8, 0xa88d62, 0.7);
      for (let d = 4; d < len - 4; d += 7) g.lineBetween(a.x + ux * d, a.y + uy * d, a.x + ux * (d + 3), a.y + uy * (d + 3));
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
    // foreign cities are drawn by the atlas as crowns and towers already; they are only in NODES so
    // that you can stand on them, so there is nothing to draw here
    if (n.kind === 'foreign') return;
    if (n.kind === 'cross') { this.territoryObjects.push(this.add.image(n.x, n.y, TEX.mapCross).setDepth(3).setScale(0.5)); return; }
    const tex = n.kind === 'camp' ? TEX.mapCamp : n.kind === 'village' ? TEX.mapVillage : n.kind === 'town' ? TEX.mapTown
      : n.kind === 'waypoint' ? TEX.mapWaypoint : n.kind === 'trade' ? TEX.mapTrade : TEX.mapGate;
    // remembered per place, so a settlement you are carrying work to can be kept on the chart when
    // the rest of its neighbours fade out
    const mine: Fadeable[] = [];
    mine.push(this.icon(n.x, n.y, tex));
    const small = n.kind === 'waypoint' || n.kind === 'gate';
    mine.push(this.plate(n.x, n.y + 10, small ? 96 : 120) as unknown as Fadeable);
    this.names.set(n.id, this.label(n.x, n.y + 12, n.name, small ? 11 : 13, CSS.ink).setDepth(6));
    mine.push(this.names.get(n.id)!);
    this.nodeArt.set(n.id, mine);
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
    // a crown shows on the country's name the moment it is won
    for (let i = 0; i < REGIONS.length; i++) {
      const want = MapScene.titleLines(GameState.rules(REGIONS[i].id) ? `\u265B ${REGIONS[i].name}` : REGIONS[i].name);
      if (this.empireLabels[i] && this.empireLabels[i].text !== want) this.empireLabels[i].setText(want);
    }
    // how well each place is held, as it stands today — a city you took reads one star, a ruin none
    for (const m of this.markers) {
      const n = FOREIGN_PLACES.find(f => f.territory === m.empire.id && f.name === m.place.name);
      m.stars.setText(n ? GameState.stars(n.id) : '');
    }
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
      // your own places carry the same rating as everybody else's, so the whole chart reads one way
      const rating = GameState.stars(n.id);
      st.setText(rating ? `${rating}  ${parts.join(' · ')}` : parts.join(' · ')).setColor(color);
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
    this.drawHunters();
    this.hud?.refresh();
    this.applyLOD();
  }

  // ---------------------------------------------------------------- input: drag to pan, pinch/wheel to zoom, tap to travel
  private twoFingers() {
    const ps = this.input.manager.pointers.filter(p => p.isDown);
    return ps.length >= 2 ? [ps[0], ps[1]] : null;
  }

  private onDown(p: Phaser.Input.Pointer) {
    this.cameras.main.panEffect.reset();   // a hand on the map cancels the LOCATE flight
    this.dragStart.set(p.x, p.y);
    this.camStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    this.dragMoved = false;
    const tf = this.twoFingers();
    if (tf) { this.pinchDist = Phaser.Math.Distance.Between(tf[0].x, tf[0].y, tf[1].x, tf[1].y); this.pinchZoom = this.cameras.main.zoom; this.dragMoved = true; }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!p.isDown) return;                       // the map only moves when you move it
    const tf = this.twoFingers();
    if (tf && this.pinchDist > 0) {
      const d = Phaser.Math.Distance.Between(tf[0].x, tf[0].y, tf[1].x, tf[1].y);
      this.setZoom(this.pinchZoom * (d / this.pinchDist));
      this.dragMoved = true;
      return;
    }
    if (!tf && this.pinchDist > 0) {
      // one finger came off a pinch. The finger still down has travelled a long way since the pinch
      // began, and reading that as a drag would fling the map across the world — so start the drag
      // again from where that finger is now.
      this.pinchDist = 0;
      this.dragStart.set(p.x, p.y);
      this.camStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
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
    if (this.swallowTap) { this.swallowTap = false; return; }
    if (this.dragMoved) return;
    if (this.hud.barContains(p.downX, p.downY) || this.hud.barContains(p.x, p.y) || this.hud.zoomContains(p.x, p.y)) return;
    if (this.hud.panelOpen) {
      if (this.hud.panelContains(p.x, p.y) || this.hud.panelModal) return;
      this.hud.hidePanel();
      return;
    }
    if (this.traveling) return;
    const zoom = this.cameras.main.zoom;
    const u = this.scale.displayScale.x || 1;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    // one of your own places?
    const tapR = Math.max(18, 34 / zoom);
    let best: MapNode | null = null, bd = tapR;
    if (MapScene.fade(zoom, BAND.minor) > 0.3) {
      for (const n of NODES) {
        // a foreign city is claimed through the crown or tower drawn for it further down: it stands
        // shoulder to shoulder with its own towns (Ostia is a stone's throw from Rome) and a fat
        // radius here would swallow every one of its neighbours' taps
        if (n.kind === 'cross' || n.kind === 'foreign') continue;
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
      // every tap shows you what you are looking at, and what the march would cost, before you commit
      if (best.id !== GameState.location) {
        const r = this.planTo(best.id);
        if (r) this.drawPlan(r); else this.clearPlan();
      } else this.clearPlan();
      this.showNodePanel(best);
      return;
    }
    // One of the world's places. Two ways to claim a tap, and the nearer one wins:
    //   the marker AS DRAWN — a crown seen from orbit is not a giant hitbox, but a thumb is wider
    //   than a crown, so the target never shrinks below a finger's width; and
    //   the place itself, marker or no marker — the label layout hides a settlement whose bigger
    //   neighbour claimed the space (Tibur lives under Rome's crown at every zoom), and every one of
    //   those can be marched on and attacked, so every one of them has to be reachable.
    let mark: Marker | null = null, md = Infinity;
    for (const m of this.markers) {
      if (!m.icon.visible) continue;
      const h = m.icon.height * m.icon.scaleY;
      const d = Phaser.Math.Distance.Between(wp.x, wp.y, m.place.x, m.place.y - h / 2);
      if (d < Math.max(h * 0.9, 22 * u / zoom) && d < Math.max(md, 0)) {
        md = Phaser.Math.Distance.Between(wp.x, wp.y, m.place.x, m.place.y);   // compare on the POINT
        mark = m;
      }
    }
    let hidden: MapNode | null = null, hd = Math.max(14, 26 * u / zoom);
    if (zoom > this.minZoom() * 2.2) {
      for (const n of FOREIGN_PLACES) {
        const d = Phaser.Math.Distance.Between(wp.x, wp.y, n.x, n.y);
        if (d < hd) { hd = d; hidden = n; }
      }
    }
    if (hidden && (!mark || hd < md)) { this.showNodePanel(hidden); return; }
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
    // otherwise: march there, if it is ground a warband can walk
    if (this.hud.panelOpen) this.hud.hidePanel();
    this.offerMarch(wp.x, wp.y);
  }

  // ---------------------------------------------------------------- travel: march where you like
  /** Which place you are standing on, if any. The NEAREST one — Abdju and Waset, Korinthos and
   *  Athenai, Kawa and Kerma are real neighbours a few units apart, and taking whichever came first
   *  in the list would have put you in the wrong city. */
  private static placeAt(x: number, y: number, r = 22): MapNode | null {
    let best: MapNode | null = null, bd = r;
    for (const n of NODES) {
      if (n.kind === 'cross') continue;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** The road network, as line segments, so the terrain grid knows where a road speeds you up. */
  private static roadSegments() {
    return drawnEdges(GameState.home).map(e => {
      const a = nodeById(e.a), b = nodeById(e.b);
      return [[a.x, a.y], [b.x, b.y]] as [[number, number], [number, number]];
    });
  }

  /** Work out the march to a point and offer it, with what it will cost in days. */
  private offerMarch(x: number, y: number) {
    const r = findRoute([GameState.pos.x, GameState.pos.y], [x, y], !!GameState.horse);
    if (!r) { this.hud.toast(['No way through — there is water in the way.'], '#ff9a8a'); return; }
    this.drawPlan(r);
    const end = r.points[r.points.length - 1];
    const at = MapScene.placeAt(end[0], end[1]);
    this.hud.showPanel({
      title: at ? at.name.toUpperCase() : 'MARCH',
      lines: [at ? (at.blurb ?? 'A place worth the walk.') : 'Open country. Your warband can be there and make camp.',
        `${r.days} day${r.days === 1 ? '' : 's'} of marching${GameState.horse ? ', mounted' : ''}.`],
      buttons: [
        { label: `MARCH (${r.days}d)`, color: 0x2f6b8a, onPress: () => { this.hud.hidePanel(); this.walk(r); } },
        { label: 'Leave', color: 0x555555, onPress: () => { this.hud.hidePanel(); this.clearPlan(); } },
      ],
    });
  }

  /** Put the warband back where it was standing and forget the march. Only ever called before the
   *  first day of it has passed, so there is nothing else to undo. */
  private abortMarch() {
    this.tweens.killTweensOf(this.token);
    this.token.setPosition(GameState.pos.x, GameState.pos.y - 12);
    this.cameras.main.stopFollow();
    this.traveling = false;
    this.clearPlan();
  }

  private drawPlan(r: Route) {
    const z = this.cameras.main.zoom;
    this.planLine.clear().lineStyle(3 / z, PAL.goldHi, 0.9);
    const pts = r.points.map(([x, y]) => new Phaser.Geom.Point(x, y));
    this.planLine.strokePoints(pts, false, false);
    this.planLine.fillStyle(PAL.goldHi, 0.9).fillCircle(r.points[r.points.length - 1][0], r.points[r.points.length - 1][1], 5 / z);
  }
  private clearPlan() { this.planLine.clear(); }

  /** Walk it, a day at a time: wages are paid, hunters move, and one of them may catch you on the way. */
  private walk(r: Route) {
    this.traveling = true;
    this.marchAt = this.time.now;
    this.legsDone = 0;
    this.cameras.main.startFollow(this.token, true, 0.08, 0.08);
    const legs = Math.max(1, r.days);
    const total = totalLength(r.points);
    let leg = 0;
    const stepOn = () => {
      leg++;
      const want = (leg / legs) * total;
      const at = pointAt(r.points, want);
      const dur = Phaser.Math.Clamp((total / legs) * 9, 260, 900);
      this.tweens.add({
        targets: this.token, x: at[0], y: at[1] - 12, duration: dur, ease: 'Sine.InOut',
        onComplete: () => {
          this.legsDone++;
          GameState.pos = { x: at[0], y: at[1] };
          const here = MapScene.placeAt(at[0], at[1]);
          GameState.location = here ? here.id : '';
          const crossed = GameState.noteRealm();
          if (crossed) this.hud.toast([crossed, 'Nobody here has heard of you.'], '#f5c542');
          // anything you were carrying to this place is delivered by standing in it
          if (here) {
            const paid = GameState.settleQuests(here.id);
            if (paid.length) {
              this.hud.toast(paid.map(q => `Delivered ${q.text}: +${q.reward} gold.`), '#c8f0c8');
              this.hud.refreshQuests();
              this.markQuestPins();
            }
          }
          this.passDays(1);
          const caught = GameState.runHunters(1);
          GameState.save();
          this.refresh();
          if (caught) {
            this.clearPlan();
            this.traveling = false;
            GameState.patrolPending = true;
            GameState.patrolFrom = caught.kind;
            Sound.patrol();
            this.cameras.main.shake(250, 0.004);
            this.showPatrolPanel(caught.kind);
            return;
          }
          if (leg < legs) { stepOn(); return; }
          this.clearPlan();
          this.traveling = false;
          Sound.travel();
          const node = GameState.location ? nodeById(GameState.location) : null;
          if (node && node.kind !== 'cross') this.showNodePanel(node);
        },
      });
    };
    stepOn();
  }

  /** March to one of the places on the map (the settlement panels still work this way). */
  private travelTo(id: string) {
    const r = this.planTo(id);
    if (!r) { this.hud.toast(['No way through — there is water in the way.'], '#ff9a8a'); return; }
    this.hud.hidePanel();
    this.drawPlan(r);
    this.walk(r);
  }

  /** The march to a place, worked out once. A panel asks for the cost, then the button asks again, and
   *  the tap that opened it asked already — over a grid this size that is three searches of the whole
   *  world for one tap, which a phone feels. They are all the same answer until you move. */
  private planTo(id: string): Route | null {
    const key = `${Math.round(GameState.pos.x)},${Math.round(GameState.pos.y)},${id},${GameState.horse ? 1 : 0}`;
    if (!this.routeCache.has(key)) {
      if (this.routeCache.size > 40) this.routeCache.clear();
      const n = nodeById(id);
      this.routeCache.set(key, routeToPlace([GameState.pos.x, GameState.pos.y], [n.x, n.y], !!GameState.horse));
    }
    return this.routeCache.get(key) ?? null;
  }

  private routeDays(to: string) {
    return this.planTo(to)?.days ?? 0;
  }

  /** Smoothly bring the camera back to the warband. Pressing it again while it is already flying
   *  restarts the flight rather than stacking a second one on top of the first. */
  private locate() {
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.panEffect.reset();
    // NOT an ease NAME: the camera's pan looks its ease up in a table directly (unlike a tween, which
    // is forgiving about spelling), and an unknown name leaves it holding a string where a function
    // should be — it then throws on every frame and the whole game appears to freeze. Pass the
    // function itself and there is nothing to spell wrong.
    cam.pan(this.token.x, this.token.y, 420, Phaser.Math.Easing.Sine.InOut, true);
  }

  /**
   * A place you are carrying work to is never allowed to fade out of the chart. It keeps a small pin
   * above it at every zoom, and its marker is exempted from the level-of-detail rules that hide
   * lesser places when you pull back — you can always see where you are going.
   */
  private markQuestPins() {
    const want = new Set(GameState.questTargets());
    for (const [id, pin] of this.questPins) {
      if (want.has(id)) continue;
      pin.destroy();
      this.questPins.delete(id);
    }
    for (const id of want) {
      if (this.questPins.has(id)) continue;
      let n;
      try { n = nodeById(id); } catch { continue; }
      const pin = this.add.text(n.x, n.y, '⚑', { fontFamily: FONT, fontSize: '22px', color: '#f5c542', stroke: '#2b1d0e', strokeThickness: 4 })
        .setOrigin(0.5, 1.6).setDepth(8.5);
      this.questPins.set(id, pin);
    }
    this.layoutQuestPins();
  }

  /** The pins hold a constant size on screen, like the markers they stand over. */
  private layoutQuestPins() {
    const dpr = this.scale.displayScale.x || 1;
    const s = Phaser.Math.Clamp(dpr / this.cameras.main.zoom, 0.3, 2.2);
    for (const pin of this.questPins.values()) pin.setScale(s).setVisible(true);
  }

  /**
   * Show me where this work is: fly to it, open it out far enough to read, and put a pulse on the
   * marker so the eye finds it among everything else on the plate.
   */
  private showQuest(q: Quest) {
    const target = this.questPoint(q);
    if (!target) { this.hud.toast(['That job has nowhere left to point at.'], '#ff9a8a'); return; }
    const cam = this.cameras.main;
    cam.stopFollow();
    cam.panEffect.reset();
    if (cam.zoom < 1.6) this.setZoom(1.6);
    cam.pan(target.x, target.y, 460, Phaser.Math.Easing.Sine.InOut, true);
    this.pulseAt(target.x, target.y);
  }

  /** And the second tap: the same march the map itself offers, days and all, to confirm. */
  private routeToQuest(q: Quest) {
    const target = this.questPoint(q);
    if (!target) { this.hud.toast(['That job has nowhere left to point at.'], '#ff9a8a'); return; }
    if (this.traveling) { this.hud.toast(['You are already on the road.'], '#ff9a8a'); return; }
    this.offerMarch(target.x, target.y);
  }

  /** Where a job points, if it points anywhere on the chart. */
  private questPoint(q: Quest): { x: number; y: number } | null {
    if (q.kind !== 'deliver' || !q.to) return null;
    try { const n = nodeById(q.to); return { x: n.x, y: n.y }; } catch { return null; }
  }

  /** A ring that opens and fades on a spot, twice — enough to catch the eye, not enough to nag. */
  private pulseAt(x: number, y: number) {
    this.questPulse?.destroy();
    const g = this.add.graphics().setDepth(9.5);
    this.questPulse = g;
    let n = 0;
    const ring = () => {
      n++;
      const o = { r: 10, a: 0.9 };
      this.tweens.add({
        targets: o, r: 70, a: 0, duration: 900, ease: 'Sine.Out',
        onUpdate: () => { g.clear().lineStyle(3, 0xf5c542, o.a).strokeCircle(x, y, o.r); },
        onComplete: () => { if (n < 3) ring(); else { g.destroy(); if (this.questPulse === g) this.questPulse = null; } },
      });
    };
    ring();
  }

  /** Zoom a step, keeping whatever is under the pointer roughly under the pointer. */
  private zoomAt(sx: number, sy: number, factor: number) {
    const cam = this.cameras.main;
    cam.panEffect.reset();                       // zooming takes the camera off the LOCATE flight
    const before = cam.getWorldPoint(sx, sy);
    this.setZoom(cam.zoom * factor);
    cam.preRender();
    const after = cam.getWorldPoint(sx, sy);
    cam.stopFollow();
    cam.setScroll(cam.scrollX + (before.x - after.x), cam.scrollY + (before.y - after.y));
  }

  /** Keep the camera below the status bar, so the bar never covers the map or eats a tap. */
  private fitViewport() {
    const top = Math.round(this.hud?.mapTop ?? 0);
    const { width, height } = this.scale;
    this.cameras.main.setViewport(0, top, width, Math.max(80, height - top));
  }

  // ---------------------------------------------------------------- panels
  private visitButton(n: MapNode, lines: string[]) {
    const here = GameState.location === n.id;
    const access = GameState.access(n.id);
    if (access === 'visit') {
      lines.push(here ? 'The gates are open to you — you could trade here, or ask at the inn.' : 'Their gates are open to strangers with coin.');
      return here
        ? { label: 'VISIT', color: 0x2f6b8a, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id, visit: true }); } }
        : null;                                 // from afar the march button above already takes you there
    }
    if (access === 'closed') lines.push(GameState.closedReason(n.id));
    return null;
  }

  /** What a foreign realm's card says: what it keeps under arms, and how far its throne is. */
  private foreignLines(r: Region): string[] {
    const v = visitOf(r.id);
    if (!v) return ['Across water, and no ship will carry you — yet.'];
    const cap = capitalOf(r.id);
    if (GameState.rules(r.id)) {
      const cap = capitalOf(r.id);
      return [`Yours. They call you ${GameState.title}.`,
        'Its gates are open, its prices are your prices, and its riders ride for you now.',
        cap ? `The throne sits at ${cap.name}.` : ''].filter(Boolean);
    }
    const out = [v.army.armyNote];
    // the smallest place in the realm, so the card names a fight you could actually pick
    const untouched = (n: MapNode) => { const st = GameState.settlement(n.id); return !st.sacked && !st.occupied; };
    const cap0 = capitalOf(r.id);
    if (cap0 && this.routeDays(cap0.id) <= 0 && !GameState.isHome(r.id)) {
      return [v.army.armyNote, 'No road runs to this country from where you stand. There is water in the way, and no ship.'];
    }
    const fringe = FOREIGN_PLACES.filter(n => n.territory === r.id && n.rank === 'village' && untouched(n) && this.routeDays(n.id) > 0)
      .sort((a, b) => this.routeDays(a.id) - this.routeDays(b.id))[0];
    if (fringe) {
      const f = GameState.foreignInfo(fringe.id);
      const fd = this.routeDays(fringe.id);
      out.push(`Their smallest place, ${fringe.name}, keeps ${f.total} defenders — ${fd} day${fd === 1 ? '' : 's'}' march.`);
    }
    if (cap && untouched(cap)) {
      const c = GameState.foreignInfo(cap.id);
      out.push(`${cap.name} keeps ${c.total}, and is ${this.routeDays(cap.id)} days away.`);
    } else if (cap) {
      out.push(`${cap.name} is already yours to answer for.`);
    }
    const infamy = GameState.territoryInfamy(r.id);
    if (infamy > 0) out.push(`They have a score with you: ${infamy}. Their gates are shut and their riders are out.`);
    return out;
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
    lines.push(...this.foreignLines(r));
    const cap = visitOf(r.id) ? capitalOf(r.id) : null;
    const capDays = cap ? this.routeDays(cap.id) : 0;
    this.hud.showPanel({ title: r.name.toUpperCase(), lines,
      buttons: [
        ...(cap && capDays > 0 && GameState.location !== cap.id ? [{ label: `MARCH TO ${cap.name.toUpperCase()} (${capDays}d)`, color: 0x2f6b8a, onPress: () => this.travelTo(cap.id) }] : []),
        ...(cap ? [this.zoomInButton(r.id)] : []),
        leave] });
  }

  /** One of the world's settlements, seen from very far away. */
  private showPlacePanel(m: Marker) {
    const open = FOREIGN_PLACES.find(n => n.territory === m.empire.id && n.name === m.place.name);
    if (open) { this.showNodePanel(open); return; }
    const rank = m.place.kind === 'capital' ? `The throne of ${m.empire.name}.` : m.place.kind === 'city' ? `A great city of ${m.empire.name}.`
      : m.place.kind === 'town' ? `A town of ${m.empire.name}.` : `A village of ${m.empire.name}.`;
    this.hud.showPanel({
      title: m.place.name.toUpperCase(),
      lines: [m.place.note, rank, 'Across water, and no ship will carry you — yet.'],
      buttons: [{ label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() }],
    });
  }

  private showSeaPanel(name: string) {
    this.hud.showPanel({ title: name.toUpperCase(), lines: ['No ship will carry you — yet.'], buttons: [{ label: 'Leave', color: 0x555555, onPress: () => this.hud.hidePanel() }] });
  }

  private showNodePanel(n: MapNode) {
    const leave = { label: 'Leave', color: 0x555555, onPress: () => { this.hud.hidePanel(); this.clearPlan(); } };
    const here = GameState.location === n.id;
    // anywhere you are not standing can be marched to — if a road actually reaches it. Japan, the
    // Aztecs and the Inca have no road to them from anywhere, and the panel must say so rather than
    // offer a march of nought days.
    const days = here ? 0 : this.routeDays(n.id);
    const march = here || days <= 0 ? null : { label: `MARCH (${days}d)`, color: 0x2f6b8a, onPress: () => this.travelTo(n.id) };
    if (n.kind === 'foreign') { this.showForeignPanel(n, here, march, leave); return; }
    if (n.kind === 'camp') {
      this.hud.showPanel({
        title: 'BANDIT CAMP', lines: ['Your home. Tap the Forge, the Barracks or the Stables to spend your gold. Waiting here still costs wages.'],
        buttons: [...(march ? [march] : [{ label: 'ENTER CAMP', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: 'camp' }); } }]), leave],
      });
      return;
    }
    if (n.kind === 'gate') {
      this.hud.showPanel({ title: n.name.toUpperCase(), lines: [n.blurb ?? '', 'Beyond here there are no villages — only camps that move, a neutral trader, and riders who shoot at a gallop.'], buttons: [...(march ? [march] : []), leave] });
      return;
    }
    if (n.kind === 'trade') {
      this.hud.showPanel({
        title: n.name.toUpperCase(), lines: [n.blurb ?? '', 'Steppe riders for hire, the composite bow, a courser, and an innkeeper who has heard things.'],
        buttons: [here ? { label: 'ENTER', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id }); } } : march!, leave],
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
      else if (march) buttons.push(march);
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
        buttons: [here ? { label: 'ENTER', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id }); } } : march!, leave],
      });
      return;
    }
    if (n.kind === 'town') {
      if (!GameState.siegeUnlocked) {
        const lines = [n.blurb ?? '', `${GameState.stars(n.id)}   The garrison is far too strong for a nobody. Become a ${INFAMY.tiers[SIEGE.unlockTier].name} (infamy ${INFAMY.tiers[SIEGE.unlockTier].min}) and they will take you seriously.`,
          !here ? `${this.routeDays(n.id)} days' march from where you stand.` : ''].filter(Boolean);
        const visit = this.visitButton(n, lines);
        this.hud.showPanel({ title: n.name.toUpperCase(), lines, buttons: [...(visit ? [visit] : []), leave] });
      } else {
        const lines = [n.blurb ?? '', `${GameState.stars(n.id)}   A stone wall with one gate; ${SIEGE.wallArchers} archers on the battlements (only arrows reach them), ${SIEGE.guards} town guards and the garrison captain behind it. Batter the gate, then take the courtyard.`];
        const visit = this.visitButton(n, lines);
        this.hud.showPanel({
          title: n.name.toUpperCase(), lines,
          buttons: [
            here
              ? { label: 'SIEGE', color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', siegeBattle()); } }
              : march!,
            ...(visit ? [visit] : []), leave],
        });
      }
      return;
    }
    const info = GameState.villageInfo(n.id);
    const lines = [n.blurb ?? ''];
    if (info.ruined) lines.push(`Ruined — nothing left to take. They rebuild in ${info.daysToRecover} day${info.daysToRecover === 1 ? '' : 's'}.`);
    else {
      lines.push(`${GameState.stars(n.id)}   Tier ${info.tier} village  ·  about ${info.total} defenders (${info.militia} militia, ${info.archers} archer${info.archers === 1 ? '' : 's'}, ${info.captains} captain${info.captains === 1 ? '' : 's'})`);
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
          : march!,
        ...(visit ? [visit] : []), leave,
      ],
    });
  }

  /**
   * A foreign settlement. Every one of them can be attacked, so the panel's job is to tell you the
   * truth about what is standing there and then get out of the way. Nothing here says no.
   */
  private showForeignPanel(n: MapNode, here: boolean, march: PanelButton | null, leave: PanelButton) {
    const v = visitOf(n.territory);
    const realm = REGIONS.find(r => r.id === n.territory);
    const st = GameState.settlement(n.id);
    const info = GameState.foreignInfo(n.id);
    const rankLine = n.rank === 'capital' ? `The throne of ${realm?.name ?? 'a foreign realm'}.`
      : n.rank === 'city' ? `A great city of ${realm?.name ?? 'a foreign realm'}.`
      : n.rank === 'town' ? `A town of ${realm?.name ?? 'a foreign realm'}.`
      : `A village of ${realm?.name ?? 'a foreign realm'}.`;
    const lines = [n.blurb ?? '', rankLine];

    if (st.sacked) {
      this.hud.showPanel({ title: n.name.toUpperCase(), lines: [...lines, 'You burned it. Nothing lives here now.'], buttons: [...(march ? [march] : []), leave] });
      return;
    }
    if (st.occupied) {
      const garrison = (GameState.garrisons[n.id] ?? []).map(t => t.name).join(' and ') || 'nobody';
      this.hud.showPanel({
        title: n.name.toUpperCase(),
        lines: [...lines, `Yours, and a long way from home. ${garrison} hold it. Tribute +${FOREIGN.tribute[n.rank ?? 'town']} gold a day.`],
        buttons: [here ? { label: 'ENTER', color: 0x3f7a3f, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id }); } } : march!, leave],
      });
      return;
    }

    // the intel: exactly what is in the square, and what their own men are
    const parts = [`${info.militia} militia`];
    if (info.archers) parts.push(many(info.archers, 'archer', 'archers'));
    if (info.captains) parts.push(many(info.captains, 'captain', 'captains'));
    if (info.elites) parts.push(many(info.elites, info.eliteName, info.elitePlural));
    if (info.champion) parts.push('and their champion');
    lines.push(`${GameState.stars(n.id)}   ${info.total} defenders: ${parts.join(', ')}.`);
    if (v) lines.push(v.army.eliteNote);
    if (info.reforms > 0) lines.push(`Their line closes over its dead: expect ${info.reforms} more of them before it breaks.`);
    if (n.rank === 'capital' && v) lines.push(v.army.capitalWarning);
    else if (n.rank === 'village' && v) lines.push(v.army.villageNote);
    if (!here) {
      const d = this.routeDays(n.id);
      lines.push(d > 0 ? `${d} day${d === 1 ? '' : 's'}' march from where you stand.`
        : 'No road runs there from where you stand. There is water in the way, and no ship.');
    }

    const buttons: PanelButton[] = [];
    if (here) {
      buttons.push({ label: `ASSAULT (${info.total})`, color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', foreignBattle(n.id)); } });
      if (GameState.access(n.id) === 'foreign' && tradesWithForeigners(n)) {
        buttons.push({ label: 'ENTER THE CITY', color: 0x2f6b8a, onPress: () => { GameState.save(); this.scene.start('Settlement', { id: n.id, visit: true }); } });
      } else if (GameState.access(n.id) === 'closed') {
        lines.push(GameState.closedReason(n.id));
      }
    } else if (march) buttons.push(march);
    buttons.push(leave);
    this.hud.showPanel({ title: n.name.toUpperCase(), lines, buttons });
  }

  private showPatrolPanel(where: Territory) {
    // a realm you have drawn steel in sends its own men after you, in its own colours
    if (where !== 'homeland' && where !== 'steppe') {
      const p = GameState.foreignPatrol(where);
      const n = p.militia + p.archers + p.captains + p.elites;
      this.hud.showPanel({
        title: p.title, modal: true,
        lines: [`${n} of them have run you down inside their own borders — ${p.militia} on foot, ${many(p.archers, 'archer', 'archers')}${p.captains ? `, ${many(p.captains, 'captain', 'captains')}` : ''} and ${many(p.elites, p.eliteName, p.elitePlural)}.`,
          'You made war in this country. This is the country answering.'],
        buttons: [{ label: 'FIGHT', color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', foreignPatrolBattle(where)); } }],
      });
      return;
    }
    if (where === 'steppe') {
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
      title: 'HUNTERS', modal: true,
      lines: [`${n} riders have run you down — your bounty brought them out. They are on top of you; there is no outriding them now.`],
      buttons: [{ label: 'FIGHT', color: 0xa0341f, onPress: () => { GameState.save(); this.scene.start('Raid', patrolBattle()); } }],
    });
  }
}
