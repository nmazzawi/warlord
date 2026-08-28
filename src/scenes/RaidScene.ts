// RaidScene.ts — a battle. Builds the map from a BattleConfig (village raid, road patrol, or the
// siege of Kingsport), spawns everyone, runs the per-frame loop (input → hero → troops → enemies →
// pickups), applies hit-pause, and decides victory/defeat. A siege adds a gate with hit points,
// archers on the wall, and two waves behind it.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { ABILITIES, ENEMIES, EQUIPMENT, SIEGE } from '../config/balance';
import { Hero } from '../entities/Hero';
import { Troop } from '../entities/Troop';
import { Enemy, type EnemyKind } from '../entities/Enemy';
import { Arrow } from '../entities/Arrow';
import { Coin } from '../entities/Coin';
import { Gate } from '../entities/Gate';
import { Unit } from '../entities/Unit';
import { Juice } from '../systems/Juice';
import { PlayerInput } from '../systems/PlayerInput';
import { SurroundManager } from '../systems/Surround';
import { FlowField } from '../systems/FlowField';
import { dealDamage } from '../systems/Combat';
import { setLineOfSightObstacles } from '../systems/LineOfSight';
import { Sound } from '../systems/Sound';
import { COLORS, TEX } from '../systems/Textures';
import { buildLayout, clearOf, LAYOUTS, palisadeFor, type LayoutDef, type Obstacle } from '../world/Layouts';
import type { BattleConfig } from '../world/Battles';
import type { HudModel } from './HudScene';
import type { ResultData } from './ResultScene';

export class RaidScene extends Phaser.Scene {
  hero!: Hero;
  troops: Troop[] = [];
  enemies: Enemy[] = [];
  juice!: Juice;
  flow!: FlowField;
  cfg!: BattleConfig;
  gate: Gate | null = null;
  /** arrows loosed by the hero this battle (used by the smoke test to check the ranged rule) */
  shots = 0;
  private layout!: LayoutDef;
  private obstacles: Obstacle[] = [];
  private surround = new SurroundManager();
  private playerInput!: PlayerInput;
  private hud!: HudModel;
  private huts!: Phaser.Physics.Arcade.StaticGroup;
  private troopGroup!: Phaser.Physics.Arcade.Group;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private arrows!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private freezeUntil = 0;
  private goldEarned = 0;
  private deadTroopIds: number[] = [];
  private over = false;
  private wave2Spawned = false;
  private formationHeading = 0;
  private tmp = new Phaser.Math.Vector2();

  constructor() { super('Raid'); }

  init(data: BattleConfig) { this.cfg = data; }

  create() {
    // Scene objects are reused between battles, so reset everything here.
    this.troops = [];
    this.enemies = [];
    this.gate = null;
    this.shots = 0;
    this.freezeUntil = 0;
    this.goldEarned = 0;
    this.deadTroopIds = [];
    this.over = false;
    this.wave2Spawned = false;
    this.formationHeading = 0;
    this.surround = new SurroundManager();
    this.tweens.timeScale = 1;
    GameState.takeSnapshot();

    const cfg = this.cfg;
    const layout = this.layout = LAYOUTS[cfg.layoutId];
    this.obstacles = [...layout.obstacles, ...(cfg.palisade ? palisadeFor(layout) : [])];
    setLineOfSightObstacles(this.obstacles);
    this.physics.world.setBounds(0, 0, layout.w, layout.h);
    this.huts = buildLayout(this, layout, this.obstacles);
    this.flow = new FlowField(layout.w, layout.h, this.obstacles);
    this.juice = new Juice(this);

    // --- the warband
    const start = clearOf(this.obstacles, layout.heroStart.x, layout.heroStart.y, 14);
    this.hero = new Hero(this, start.x, start.y);
    // (groups re-apply their defaults to every body added, so world-bounds collision must be set here)
    this.troopGroup = this.physics.add.group({ collideWorldBounds: true });
    GameState.troops.forEach((rec, i) => {
      const p = clearOf(this.obstacles, this.hero.x - 30 - i * 12, this.hero.y + (i % 2 ? 26 : -26), 11);
      const t = new Troop(this, p.x, p.y, rec, i);
      this.troops.push(t);
      this.troopGroup.add(t);
    });

    // --- the defenders
    this.enemyGroup = this.physics.add.group({ collideWorldBounds: true });
    const d = cfg.defenders;
    const mult = { hp: d.statMult, dmg: 1 + (d.statMult - 1) * 0.5, gold: d.goldMult };
    const spawn = (kind: EnemyKind, posts: Array<{ x: number; y: number }>, count: number, tweak?: (e: Enemy, i: number) => void) => {
      for (let i = 0; i < count && posts.length; i++) {
        const p = posts[i % posts.length];
        const jitter = i >= posts.length ? 26 : 0;
        const spot = clearOf(this.obstacles, p.x + Phaser.Math.Between(-jitter, jitter), p.y + Phaser.Math.Between(-jitter, jitter), ENEMIES[kind].radius);
        const e = new Enemy(this, spot.x, spot.y, kind, mult);
        tweak?.(e, i);
        this.enemies.push(e);
        this.enemyGroup.add(e);
      }
    };
    if (cfg.kind === 'siege') {
      // archers on the wall (placed ON the wall, not nudged off it), the guard asleep behind it
      const wallPosts = layout.posts.wall ?? [];
      for (let i = 0; i < Math.min(SIEGE.wallArchers, wallPosts.length); i++) {
        const e = new Enemy(this, wallPosts[i].x, wallPosts[i].y, 'archer', mult);
        e.onWall = true;
        e.setDepth(23);
        e.body.setImmovable(true);
        e.body.moves = false;
        this.enemies.push(e);
        this.enemyGroup.add(e);
      }
      spawn('guard', layout.posts.guards ?? [], SIEGE.guards, e => { e.dormant = true; });
      spawn('archer', layout.posts.archers, 2, e => { e.dormant = true; });
    } else {
      spawn('militia', layout.posts.militia, d.militia);
      spawn('archer', layout.posts.archers, d.archers);
      spawn('captain', layout.posts.captains, d.captains);
    }

    this.arrows = this.physics.add.group({ classType: Arrow, maxSize: 60, runChildUpdate: false });
    this.coins = this.physics.add.group({ classType: Coin, maxSize: 60, runChildUpdate: false, collideWorldBounds: true });

    // --- who bumps into what. Your own troops never block you (so alleys stay usable).
    this.physics.add.collider(this.hero, this.huts);
    this.physics.add.collider(this.troopGroup, this.huts);
    this.physics.add.collider(this.enemyGroup, this.huts);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    this.physics.add.collider(this.hero, this.enemyGroup);
    this.physics.add.collider(this.troopGroup, this.enemyGroup);
    this.physics.add.collider(this.coins, this.huts);
    this.physics.add.overlap(this.hero, this.coins, (a, b) => this.collectCoin(a instanceof Coin ? a : (b as Coin)));
    this.physics.add.overlap(this.arrows, this.hero, (a, b) => this.arrowHit(a, b));
    this.physics.add.overlap(this.arrows, this.troopGroup, (a, b) => this.arrowHit(a, b));
    this.physics.add.overlap(this.arrows, this.enemyGroup, (a, b) => this.arrowHit(a, b));
    this.physics.add.collider(this.arrows, this.huts,
      (a, b) => this.arrowHitObstacle(a instanceof Arrow ? a : (b as Arrow), a instanceof Arrow ? (b as Phaser.Physics.Arcade.Sprite) : (a as Phaser.Physics.Arcade.Sprite)),
      (a, b) => { const arrow = (a instanceof Arrow ? a : b) as Arrow; return !arrow.overWalls; });

    // --- the gate (siege)
    if (cfg.kind === 'siege') {
      const gateSprite = (this.huts.getChildren() as Phaser.Physics.Arcade.Sprite[]).find(s => (s.getData('obstacle') as Obstacle | undefined)?.kind === 'gate');
      if (gateSprite) this.gate = new Gate(this, gateSprite, gateSprite.getData('obstacle') as Obstacle, SIEGE.gateHp);
    }

    // --- camera
    this.cameras.main.setBounds(0, 0, layout.w, layout.h);
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);

    // --- input + HUD
    this.playerInput = new PlayerInput();
    this.playerInput.attachKeyboard(this);
    this.hud = {
      title: cfg.title, hint: cfg.hint, name: cfg.name,
      heroHp: this.hero.hp, heroMaxHp: this.hero.maxHp, gold: GameState.gold,
      troopsAlive: this.troops.length, troopsTotal: this.troops.length, enemiesAlive: this.enemies.length,
      hornCd: 0, hornMax: ABILITIES.horn.cooldown, chargeCd: 0, chargeMax: ABILITIES.charge.cooldown, boosted: false,
      defense: GameState.defense, gate: this.gate ? 1 : null,
      objective: cfg.kind === 'siege' ? 'Break the gate' : `Clear ${this.enemies.length} defenders`,
    };
    this.scene.launch('Hud', { input: this.playerInput, model: this.hud });

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.scene.stop('Hud');
      // each map bakes a 1280x960 ground; drop it so phones don't hoard one per village
      this.textures.remove(`ground_${layout.id}`);
    });
  }

  /** Show ~520 world px across the short screen axis — enough to see archers and militia coming. */
  private applyZoom() {
    const { width, height } = this.scale;
    const zoom = Phaser.Math.Clamp(Math.min(width, height) / 520, 0.75, 2.2);
    this.cameras.main.setZoom(zoom);
  }

  /** Hit-pause: stop the physics world for a few ms. Multiple hits extend, never shorten. */
  freeze(ms: number) {
    this.freezeUntil = Math.max(this.freezeUntil, this.time.now + ms);
    this.physics.world.pause();
    this.tweens.timeScale = 0; // slashes and numbers hold on their impact frame too
  }

  update(time: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    if (this.physics.world.isPaused) {
      if (time < this.freezeUntil) { this.syncVisuals(time); return; }
      this.physics.world.resume();
      this.tweens.timeScale = 1;
    }

    const hero = this.hero;
    if (hero.alive) hero.update(dt, this.playerInput);

    // the formation turns with the hero, but lazily so troops don't spin around them
    const targetHeading = Math.atan2(hero.facing.y, hero.facing.x);
    this.formationHeading = Phaser.Math.Angle.RotateTo(this.formationHeading, targetHeading, dt * 4);

    this.flow.update(dt, hero.x, hero.y);
    for (const t of this.troops) if (t.alive) t.update(dt, hero, this.formationHeading);
    this.separateTroops();

    const hunters: Enemy[] = [];
    for (const e of this.enemies) if (e.alive && e.aggro && (e.kind === 'militia' || e.kind === 'guard') && e.target === hero) hunters.push(e);
    this.surround.update(dt, hero, hunters);
    for (const e of this.enemies) if (e.alive) e.update(dt, hero, this.troops);

    for (const c of this.coins.getChildren()) (c as Coin).tick(dt, hero);
    for (const a of this.arrows.getChildren()) (a as Arrow).tick(dt);

    this.syncVisuals(time);
    this.cleanupDead();
    this.syncHud();

    if (!this.over && this.enemies.length === 0) {
      if (this.cfg.kind === 'siege' && !this.wave2Spawned) this.spawnWave2();
      else this.victory();
    }
  }

  /** Troops don't collide with each other (so alleys stay passable) — nudge them apart instead. */
  private separateTroops() {
    const ts = this.troops;
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const a = ts[i], b = ts[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = a.radius + b.radius + 3;
        if (d >= min || d < 0.01) continue;
        const push = ((min - d) / min) * 120;
        a.body.velocity.x -= (dx / d) * push; a.body.velocity.y -= (dy / d) * push;
        b.body.velocity.x += (dx / d) * push; b.body.velocity.y += (dy / d) * push;
      }
    }
  }

  private syncVisuals(now: number) {
    this.hero.syncVisuals(now);
    for (const t of this.troops) t.syncVisuals(now);
    for (const e of this.enemies) e.syncVisuals(now);
    this.gate?.syncVisuals(now);
  }

  private cleanupDead() {
    if (this.enemies.some(e => !e.alive)) {
      this.enemies = this.enemies.filter(e => { if (e.alive) return true; e.destroyUnit(); return false; });
    }
    if (this.troops.some(t => !t.alive)) {
      this.troops = this.troops.filter(t => { if (t.alive) return true; t.destroyUnit(); return false; });
    }
  }

  private syncHud() {
    const h = this.hud;
    h.heroHp = this.hero.hp;
    h.gold = GameState.gold + this.goldEarned;
    h.troopsAlive = this.troops.length;
    h.enemiesAlive = this.enemies.filter(e => !e.dormant).length;
    h.hornCd = this.hero.hornCd;
    h.chargeCd = this.hero.chargeCd;
    h.boosted = this.hero.boosted;
    h.gate = this.gate && this.gate.alive ? this.gate.hp / this.gate.maxHp : null;
  }

  // ---------------------------------------------------------------- combat hooks

  /** The hero's sword connects. */
  heroHit(e: Enemy, damage: number, knockback: number) {
    dealDamage(this, e, damage, this.hero.x, this.hero.y, knockback, 'hero');
  }

  /** Charge bowls into an enemy. */
  chargeHit(e: Enemy) {
    dealDamage(this, e, ABILITIES.charge.damage, this.hero.x, this.hero.y, ABILITIES.charge.knockback, 'charge');
    this.juice.hitStop(50);
    this.juice.shake(4, 80, true);
    Sound.chargeHit();
  }

  /** Something hits the gate. */
  hitGate(damage: number, srcX: number, srcY: number, source: 'hero' | 'troop' | 'arrow') {
    const g = this.gate;
    if (!g || !g.alive) return;
    const amt = Math.round(damage);
    const broke = g.damage(amt);
    const hx = Phaser.Math.Clamp(srcX, g.rect.left, g.rect.right), hy = Phaser.Math.Clamp(srcY, g.rect.top, g.rect.bottom);
    this.juice.damageNumber(hx, hy - 10, String(amt), source === 'troop' ? 0xd9d9d9 : 0xffffff, source === 'hero' ? 18 : 13);
    this.juice.burst(hx, hy, 0xc9a86a, source === 'hero' ? 8 : 4);
    if (source === 'troop') Sound.troopHit();
    if (broke) this.onGateBroken();
  }

  /** The gate falls: the wall opens, the archers climb down, the guard wakes and pours out. */
  private onGateBroken() {
    const g = this.gate!;
    this.juice.burst(g.x, g.y, 0x8a5e34, 40);
    this.juice.shake(9, 400, true);
    this.juice.hitStop(120);
    this.juice.banner(g.x, g.y - 60, 'THE GATE FALLS', '#f5c542', 24);
    Sound.victory();
    this.huts.remove(g.sprite, true, true);
    g.destroy();
    this.obstacles = this.obstacles.filter(o => o !== g.obstacle);
    setLineOfSightObstacles(this.obstacles);
    this.flow = new FlowField(this.layout.w, this.layout.h, this.obstacles);
    const inner = this.layout.posts.wallInner ?? [];
    let k = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.onWall) {
        // climb down and fight from the courtyard
        const p = inner[k++ % Math.max(1, inner.length)] ?? { x: e.x + 60, y: e.y };
        e.onWall = false;
        e.body.moves = true;
        e.body.setImmovable(false);
        e.setDepth(20);
        e.setPosition(p.x, p.y);
      }
      if (e.dormant) { e.dormant = false; e.wakeQuiet(); }
    }
    this.hud.objective = 'Clear the courtyard';
    this.hud.enemiesAlive = this.enemies.length;
  }

  /** Second wave: the garrison captain and his escort come out of the keep. */
  private spawnWave2() {
    this.wave2Spawned = true;
    const posts = this.layout.posts.boss ?? [{ x: this.layout.w / 2, y: this.layout.h / 2 }];
    const mult = { hp: 1, dmg: 1, gold: 1 };
    const boss = new Enemy(this, posts[0].x, posts[0].y, 'boss', mult);
    boss.wakeQuiet();
    this.enemies.push(boss);
    this.enemyGroup.add(boss);
    for (let i = 1; i <= SIEGE.escort && i < posts.length; i++) {
      const e = new Enemy(this, posts[i].x, posts[i].y, 'guard', mult);
      e.wakeQuiet();
      this.enemies.push(e);
      this.enemyGroup.add(e);
    }
    this.juice.banner(boss.x, boss.y - 50, 'THE GARRISON CAPTAIN', '#ff6a4a', 22);
    this.juice.ringPulse(boss.x, boss.y, 0xff3030, 8, 700);
    this.juice.shake(6, 300, true);
    Sound.warHorn();
    this.hud.objective = 'Slay the garrison captain';
  }

  warHorn() {
    for (const t of this.troops) if (t.alive) t.rally();
    this.juice.ringPulse(this.hero.x, this.hero.y, COLORS.gold, 7, 600);
    this.time.delayedCall(140, () => this.juice.ringPulse(this.hero.x, this.hero.y, 0xffffff, 5, 500));
    this.juice.banner(this.hero.x, this.hero.y - 40, 'WAR HORN!', '#f5c542', 16);
    Sound.warHorn();
    this.alertNear(this.hero.x, this.hero.y, 300); // a horn is loud
  }

  /** Wake sleeping defenders near a point (one hop — they don't relay the shout). */
  alertNear(x: number, y: number, radius: number) {
    for (const e of this.enemies) {
      if (!e.alive || e.aggro || e.dormant) continue;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) <= radius) e.wakeQuiet();
    }
  }

  fireArrow(from: Enemy, target: Unit, overWalls = false) {
    const s = ENEMIES.archer;
    const dist = from.distTo(target);
    const t = dist / s.arrowSpeed;
    const px = target.x + target.body.velocity.x * t * 0.7;
    const py = target.y + target.body.velocity.y * t * 0.7;
    this.tmp.set(px - from.x, py - from.y).normalize();
    const x = from.x + this.tmp.x * (from.radius + 8), y = from.y + this.tmp.y * (from.radius + 8);
    const arrow = this.arrows.get(x, y, TEX.arrow) as Arrow | null;
    if (!arrow) return;
    arrow.fire(x, y, this.tmp.x * s.arrowSpeed, this.tmp.y * s.arrowSpeed, from.damageAmount, s.arrowLife, 'enemy', overWalls);
    Sound.arrow();
  }

  /** The hero's bow. Shots at wall archers arc over the wall. */
  fireHeroArrow(x: number, y: number, dir: Phaser.Math.Vector2, damage: number, overWalls = false) {
    const arrow = this.arrows.get(x, y, TEX.arrow) as Arrow | null;
    if (!arrow) return;
    const s = EQUIPMENT.bow;
    this.shots += 1;
    arrow.fire(x, y, dir.x * s.arrowSpeed, dir.y * s.arrowSpeed, damage, s.range / s.arrowSpeed + 0.2, 'player', overWalls);
  }

  private arrowHit(a: unknown, b: unknown) {
    const arrow = (a instanceof Arrow ? a : b) as Arrow;
    const unit = (a instanceof Arrow ? b : a) as Unit;
    if (!arrow.active || !unit.alive || arrow.team === unit.team) return;
    if (unit instanceof Enemy && unit.dormant) return;
    if (unit instanceof Enemy && unit.onWall && !arrow.overWalls) return;
    const vx = arrow.body.velocity.x, vy = arrow.body.velocity.y;
    arrow.kill();
    if (arrow.team === 'player') {
      dealDamage(this, unit, arrow.damageAmount, unit.x - vx, unit.y - vy, 110, 'hero');
      this.juice.hitStop(EQUIPMENT.bow.hitStop);
      this.juice.shake(EQUIPMENT.bow.shake, 60, true);
      Sound.heroHit(1);
    } else {
      dealDamage(this, unit, arrow.damageAmount, unit.x - vx, unit.y - vy, 80, 'enemy');
    }
  }

  private arrowHitObstacle(arrow: Arrow, obstacle: Phaser.Physics.Arcade.Sprite) {
    if (!arrow.active) return;
    const wasPlayer = arrow.team === 'player';
    const dmg = arrow.damageAmount;
    arrow.kill();
    if (wasPlayer && this.gate && this.gate.alive && obstacle === this.gate.sprite) this.hitGate(dmg, arrow.x, arrow.y, 'arrow');
  }

  private collectCoin(coin: Coin) {
    if (!coin.active) return;
    this.goldEarned += coin.value;
    coin.disableBody(true, true);
    Sound.gold();
    this.juice.damageNumber(coin.x, coin.y - 8, `+${coin.value}`, COLORS.gold, 13);
  }

  private spawnCoins(x: number, y: number, total: number) {
    const n = Phaser.Math.Clamp(Math.round(total / 6), 1, 5);
    let left = total;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : Math.round(total / n);
      left -= v;
      const coin = this.coins.get(x, y, TEX.coin) as Coin | null;
      if (coin) coin.spawn(x, y, v);
      else { this.goldEarned += v; this.juice.damageNumber(x, y, `+${v}`, COLORS.gold, 13); }
    }
  }

  /** Called by Unit.die() for hero, troops and enemies alike. */
  onUnitDied(u: Unit) {
    if (u instanceof Hero) {
      if (this.over) return;
      this.over = true;
      this.juice.burst(u.x, u.y, COLORS.hero, 24);
      this.juice.shake(10, 300, true);
      this.freeze(450);
      Sound.defeat();
      this.time.delayedCall(1400, () => this.showResult('defeat'));
    } else if (u instanceof Troop) {
      this.deadTroopIds.push(u.record.id);
      this.juice.burst(u.x, u.y, COLORS.troop, 14);
      this.juice.banner(u.x, u.y - 24, `${u.record.name} has fallen`, '#ff9a8a', 13);
      Sound.troopDie();
    } else if (u instanceof Enemy) {
      const big = u.kind === 'captain' || u.kind === 'boss';
      this.juice.burst(u.x, u.y, 0xffb070, big ? 22 : 10);
      this.spawnCoins(u.x, u.y, u.goldValue);
      Sound.enemyDie();
      if (big) {
        this.juice.shake(8, 200, true);
        this.juice.hitStop(110);
        this.juice.banner(u.x, u.y - 30, u.kind === 'boss' ? 'THE CAPTAIN FALLS — HIS HALBERD IS YOURS' : 'CAPTAIN SLAIN', '#f5c542', 16);
      }
    }
  }

  private victory() {
    this.over = true;
    // sweep up every coin still on the ground — loot you fought for is yours
    let swept = 0;
    for (const c of this.coins.getChildren() as Coin[]) {
      if (!c.active) continue;
      swept += c.value;
      this.goldEarned += c.value;
      c.body.enable = false;
      this.tweens.add({ targets: c, x: this.hero.x, y: this.hero.y, alpha: 0, duration: 500, ease: 'Quad.In',
        onComplete: () => c.disableBody(true, true) });
    }
    if (swept > 0) {
      Sound.gold();
      this.juice.damageNumber(this.hero.x, this.hero.y - 30, `+${swept}`, COLORS.gold, 15);
    }
    Sound.victory();
    const msg = this.cfg.kind === 'patrol' ? 'PATROL ROUTED' : this.cfg.kind === 'siege' ? 'KINGSPORT FALLS' : 'VILLAGE CLEARED';
    this.juice.banner(this.hero.x, this.hero.y - 50, msg, '#f5c542', 22);
    this.time.delayedCall(1100, () => this.showResult('victory'));
  }

  private showResult(outcome: 'victory' | 'defeat') {
    this.scene.stop('Hud');
    const fallen = GameState.troops.filter(t => this.deadTroopIds.includes(t.id)).map(t => t.name);
    const data: ResultData = { outcome, goldEarned: this.goldEarned, fallen, deadTroopIds: [...this.deadTroopIds], battle: this.cfg };
    this.scene.launch('Result', data);
    this.scene.pause();
  }
}
