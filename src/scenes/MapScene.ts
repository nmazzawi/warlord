// MapScene.ts — the world chart: an atlas of empires on one sheet of parchment. Pan and zoom freely
// from the whole Earth (coastlines and the names of twelve realms) through their capitals and cities,
// down to the roads and villages of the small borderland you actually rule. Your warband is a token;
// tap a place to travel there (days pass, wages are paid, tribute comes in), then raid it, enter it,
// visit it — or get stopped on the road. The steppe has camps that move and riders that hunt raiders.
// Everything outside your reach is drawn muted: it is the content plan, visible from day one.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { INFAMY, SIEGE, STEPPE } from '../config/balance';
import { EDGES, nodeById, NODES, type MapNode, type Territory } from '../world/WorldMap';
import { route as findRoute, terrain, totalLength, type Route } from '../world/Terrain';
import { CONTACT } from '../world/Hunters';
import type { Pt } from '../world/geo';
import { campBattle, patrolBattle, siegeBattle, steppePatrolBattle, villageBattle } from '../world/Battles';
import { LAYOUTS } from '../world/Layouts';
import { CAMPS, campAt, campById, campLocation } from '../world/Steppe';
import { bbox, CHART, distToPolyline, REGIONS, SEA_ROUTES, type Region } from '../world/WorldChart';
import { ChartLayer } from '../world/ChartLayer';
import type { AtlasPlace } from '../world/AtlasData';
import { TEX } from '../systems/Textures';
import { Sound } from '../systems/Sound';
import type { MapHudScene } from './MapHudScene';
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
  icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text;
  rank: number;          // 0 capital, 1 city, 2 town, 3 village
  iconPx: number;        // how tall the marker is drawn, in CSS pixels
  labelPx: number;       // and how big its name is set
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
  private hunterIcons = new Map<number, Phaser.GameObjects.Container>();
  private lastTap = 0;
  private lastTapAt = new Phaser.Math.Vector2();
  private edgePan = new Phaser.Math.Vector2();

  constructor() { super('Map'); }

  init(data?: { toast?: string }) { this.pendingToast = data?.toast ?? null; }

  create() {
    this.status.clear(); this.names.clear(); this.badges.clear(); this.flags.clear(); this.campIcons.clear();
    this.labels = []; this.empireLabels = []; this.territoryObjects = []; this.stateObjects = [];
    this.markers = []; this.icons = [];
    this.traveling = false; this.pinchDist = 0;

    // the chart itself, repainted at whatever zoom you settle on
    this.cameras.main.setBackgroundColor(0x241c12);
    this.chart = new ChartLayer(this);
    terrain(MapScene.roadSegments());

    for (const r of REGIONS) {
      const [cx, cy] = r.labelAt;
      this.empireLabels.push(this.add.text(cx, cy, MapScene.titleLines(r.name), {
        fontFamily: DISPLAY, fontSize: '64px', color: r.enterable ? CSS.ink : '#5c4b33', fontStyle: 'bold', letterSpacing: 6, align: 'center',
      }).setOrigin(0.5).setDepth(3).setLineSpacing(-10).setPadding(0, 0, 14, 0));
      for (const p of r.places) this.drawPlace(r, p);
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
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const now = this.time.now;
      if (now - this.lastTap < 320 && Phaser.Math.Distance.Between(p.x, p.y, this.lastTapAt.x, this.lastTapAt.y) < 40 * (this.scale.displayScale.x || 1)) {
        this.zoomAt(p.x, p.y, 1.6);              // double tap: a step in, toward what you pointed at
        this.lastTap = 0;
        return;
      }
      this.lastTap = now;
      this.lastTapAt.set(p.x, p.y);
    });

    this.scene.launch('MapHud');
    this.hud = this.scene.get('MapHud') as MapHudScene;
    this.hud.onZoom = dir => this.zoomBy(dir > 0 ? 1.5 : 1 / 1.5);
    this.hud.onLocate = () => this.locate();
    this.fitViewport();

    // a battle won just before a reload: offer the sack/occupy choice again
    const pv = GameState.pendingVictory;
    if (pv) {
      this.time.delayedCall(60, () => this.scene.launch('Result', { outcome: 'victory', goldEarned: pv.goldEarned, fallen: pv.fallen, deadTroopIds: pv.deadTroopIds,
        battle: { kind: pv.battle.kind, layoutId: 'ashford', name: pv.battle.name, title: '', hint: '', defenders: { militia: 0, archers: 0, captains: 0, statMult: 1, goldMult: 1 }, palisade: false, villageId: pv.battle.villageId, campId: pv.battle.campId, tier: pv.battle.tier } }));
    }

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, dx: number, dy: number, _dz: number, ev?: WheelEvent) => {
      // a trackpad sends small fractional deltas and real sideways movement; a mouse wheel does not
      const trackpadPan = Math.abs(dx) > 0.5 || (!Number.isInteger(dy) && Math.abs(dy) < 40);
      if (ev?.ctrlKey) { this.zoomAt(p.x, p.y, dy > 0 ? 1 / 1.06 : 1.06); return; }
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

    // pick up where we left off: a patrol still blocking the road, mid-road after one, mid-journey, or standing somewhere
    this.time.delayedCall(30, () => {
      this.refresh();
      if (this.pendingToast) { this.hud.toast([this.pendingToast], '#f5c542'); this.pendingToast = null; }
      if (GameState.patrolPending) {
        this.showPatrolPanel(GameState.territory === 'steppe');
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

    const detail = MapScene.fade(zoom, BAND.minor);
    const empire = 1 - MapScene.fade(zoom, BAND.empire);
    const set = (objs: Fadeable[], a: number) => { for (const o of objs) { o.setAlpha(a); o.setVisible(a > 0.02); } };
    set(this.territoryObjects, detail);
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

  /** Every frame: nudge the camera if the mouse is resting at a screen edge, and let the chart notice
   *  when we have settled somewhere new so it can repaint itself sharp. */
  update(_t: number, dt: number) {
    if (this.edgePan.x || this.edgePan.y) {
      const cam = this.cameras.main;
      cam.stopFollow();
      const k = (dt / 16) * (14 / cam.zoom);
      cam.setScroll(cam.scrollX + this.edgePan.x * k, cam.scrollY + this.edgePan.y * k);
    }
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
    this.markers.push({ place: p, empire, icon, label, rank, iconPx: RANK[rank].icon, labelPx: RANK[rank].label });
  }

  /** Decide, for the zoom we have settled on, which settlements can be shown without anything touching
   *  anything else. A settlement occupies its marker AND its name together, the way a cartographer
   *  thinks of it; where two of them would touch, the lesser one steps aside until you come closer.
   *  Every box is worked out in world units scaled from screen sizes, so the answer does not depend on
   *  where the camera happens to be pointing — only on how far in you are. */
  private layoutMarkers() {
    const zoom = this.cameras.main.zoom;
    const dpr = this.scale.displayScale.x || 1;
    const u = dpr / zoom;                                   // one CSS pixel, in world units
    const order = [...this.markers].sort((a, b) => a.rank - b.rank || a.place.x - b.place.x);
    const taken: Array<[number, number, number, number]> = [];       // everything that is written
    const solid: Array<[number, number, number, number]> = [];       // and the things that are drawn
    const hit = (b: [number, number, number, number], list: Array<[number, number, number, number]>) =>
      list.some(q => Math.abs(q[0] - b[0]) < (q[2] + b[2]) / 2 && Math.abs(q[1] - b[1]) < (q[3] + b[3]) / 2);
    // the name of a realm outranks every settlement NAME in it — but a crown may still stand under a
    // letter of it, because a capital is a landmark and must not vanish from the world view
    for (const t of this.empireLabels) {
      if (!t.visible || t.alpha <= 0.15) continue;
      taken.push([t.x, t.y, t.width * t.scaleX, t.height * t.scaleY]);
    }
    // your own places hold their ground: an empire's village never writes over one of your villages
    if (MapScene.fade(zoom, BAND.minor) > 0.3) {
      for (const n of NODES) {
        if (n.kind === 'cross') continue;
        taken.push([n.x, n.y, 40 * u, 40 * u]);
        solid.push([n.x, n.y, 40 * u, 40 * u]);
        taken.push([n.x, n.y + 20 * u, 124 * u, 38 * u]);
      }
    }
    for (const m of order) {
      const spec = RANK[m.rank];
      const scale = (spec.icon * u) / m.icon.height;        // a constant height on screen
      const lscale = (spec.label * u) / LABEL_BASE;
      const iw = m.icon.width * scale * 0.85, ih = spec.icon * u;
      const lw = m.label.width * lscale, lh = m.label.height * lscale;
      const gap = 2 * u;
      // a settlement asks for its marker AND its name; if there is no room for both it keeps the marker
      // and gives up the name, and only steps aside entirely when even the marker will not fit
      const both: [number, number, number, number] =
        [m.place.x, m.place.y + (gap + lh - ih) / 2, Math.max(iw, lw), ih + gap + lh];
      const alone: [number, number, number, number] = [m.place.x, m.place.y - ih / 2, iw, ih];
      if (zoom < spec.from) { m.icon.setVisible(false); m.label.setVisible(false); continue; }
      const named = !hit(both, taken);
      if (!named && hit(alone, solid)) { m.icon.setVisible(false); m.label.setVisible(false); continue; }
      taken.push(named ? both : alone);
      solid.push(named ? both : alone);   // what is actually drawn, so nothing later lands on a name
      m.icon.setVisible(true).setScale(scale).setAlpha(m.rank === 0 ? 1 : 0.92);
      m.label.setVisible(named).setScale(lscale).setPosition(m.place.x, m.place.y + gap);
    }
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
    this.edgePan.set(0, 0);
    this.dragStart.set(p.x, p.y);
    this.camStart.set(this.cameras.main.scrollX, this.cameras.main.scrollY);
    this.dragMoved = false;
    const tf = this.twoFingers();
    if (tf) { this.pinchDist = Phaser.Math.Distance.Between(tf[0].x, tf[0].y, tf[1].x, tf[1].y); this.pinchZoom = this.cameras.main.zoom; this.dragMoved = true; }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (!p.isDown) {
      // resting near a screen edge nudges the map along (desktop only — a finger is never "resting")
      const { width, height } = this.scale;
      const band = 26 * (this.scale.displayScale.x || 1);
      const top = this.hud?.mapTop ?? 0;
      this.edgePan.set(
        p.x < band ? -1 : p.x > width - band ? 1 : 0,
        p.y < top + band ? (p.y > top ? -1 : 0) : p.y > height - band ? 1 : 0,
      );
      return;
    }
    this.edgePan.set(0, 0);
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
      // every tap shows you what you are looking at, and what the march would cost, before you commit
      if (best.id !== GameState.location) {
        const r = findRoute([GameState.pos.x, GameState.pos.y], [best.x, best.y], !!GameState.horse);
        if (r) this.drawPlan(r); else this.clearPlan();
      } else this.clearPlan();
      this.showNodePanel(best);
      return;
    }
    // one of the world's places — but only the ones you can actually see right now
    let mark: Marker | null = null, md = Infinity;
    for (const m of this.markers) {
      if (!m.icon.visible) continue;
      // the target is the marker as drawn: a crown seen from orbit is not a giant hitbox
      const h = m.icon.height * m.icon.scaleY;
      const d = Phaser.Math.Distance.Between(wp.x, wp.y, m.place.x, m.place.y - h / 2);
      if (d < Math.max(h * 0.8, 10 / zoom) && d < md) { md = d; mark = m; }
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
    // otherwise: march there, if it is ground a warband can walk
    if (this.hud.panelOpen) this.hud.hidePanel();
    this.offerMarch(wp.x, wp.y);
  }

  // ---------------------------------------------------------------- travel: march where you like
  /** The road network, as line segments, so the terrain grid knows where a road speeds you up. */
  private static roadSegments() {
    return EDGES.map(e => {
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
    const at = NODES.find(n => n.kind !== 'cross' && Math.hypot(n.x - end[0], n.y - end[1]) < 22);
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
          GameState.pos = { x: at[0], y: at[1] };
          const here = NODES.find(n => n.kind !== 'cross' && Math.hypot(n.x - at[0], n.y - at[1]) < 22);
          GameState.location = here ? here.id : '';
          this.passDays(1);
          const caught = GameState.runHunters(1);
          GameState.save();
          this.refresh();
          if (caught) {
            this.clearPlan();
            this.traveling = false;
            GameState.patrolPending = true;
            Sound.patrol();
            this.cameras.main.shake(250, 0.004);
            this.showPatrolPanel(caught.kind === 'steppe');
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
    const n = nodeById(id);
    const r = findRoute([GameState.pos.x, GameState.pos.y], [n.x, n.y], !!GameState.horse);
    if (!r) { this.hud.toast(['No way through — there is water in the way.'], '#ff9a8a'); return; }
    this.hud.hidePanel();
    this.drawPlan(r);
    this.walk(r);
  }

  private routeDays(to: string) {
    const n = nodeById(to);
    const r = findRoute([GameState.pos.x, GameState.pos.y], [n.x, n.y], !!GameState.horse);
    return r ? r.days : 0;
  }

  /** Smoothly bring the camera back to the warband. */
  private locate() {
    this.cameras.main.stopFollow();
    this.cameras.main.pan(this.token.x, this.token.y, 420, 'Sine.InOut');
  }

  /** Zoom a step, keeping whatever is under the pointer roughly under the pointer. */
  private zoomAt(sx: number, sy: number, factor: number) {
    const cam = this.cameras.main;
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
    const leave = { label: 'Leave', color: 0x555555, onPress: () => { this.hud.hidePanel(); this.clearPlan(); } };
    const here = GameState.location === n.id;
    // anywhere you are not standing can be marched to, whatever kind of place it is
    const march = here ? null : { label: `MARCH (${this.routeDays(n.id)}d)`, color: 0x2f6b8a, onPress: () => this.travelTo(n.id) };
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
          : march!,
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
