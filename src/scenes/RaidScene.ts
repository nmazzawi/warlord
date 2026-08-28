// RaidScene.ts — the battle. Builds the village, spawns everyone, runs the per-frame loop
// (input → hero → troops → enemies → pickups), applies hit-pause, and decides victory/defeat.
import Phaser from 'phaser';
import { GameState } from '../state/GameState';
import { ABILITIES, ENEMIES, raidConfig } from '../config/balance';
import { Hero } from '../entities/Hero';
import { Troop } from '../entities/Troop';
import { Enemy, type EnemyKind } from '../entities/Enemy';
import { Arrow } from '../entities/Arrow';
import { Coin } from '../entities/Coin';
import { Unit } from '../entities/Unit';
import { Juice } from '../systems/Juice';
import { PlayerInput } from '../systems/PlayerInput';
import { SurroundManager } from '../systems/Surround';
import { FlowField } from '../systems/FlowField';
import { dealDamage } from '../systems/Combat';
import { Sound } from '../systems/Sound';
import { COLORS, TEX } from '../systems/Textures';
import { buildVillage, HUTS, SPAWNS, WORLD } from '../world/Village';
import type { HudModel } from './HudScene';
import type { ResultData } from './ResultScene';

export class RaidScene extends Phaser.Scene {
  hero!: Hero;
  troops: Troop[] = [];
  enemies: Enemy[] = [];
  juice!: Juice;
  flow!: FlowField;
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
  private formationHeading = 0;
  private tmp = new Phaser.Math.Vector2();

  constructor() { super('Raid'); }

  create() {
    // Scene objects are reused between raids, so reset everything here.
    this.troops = [];
    this.enemies = [];
    this.freezeUntil = 0;
    this.goldEarned = 0;
    this.deadTroopIds = [];
    this.over = false;
    this.formationHeading = 0;
    this.surround = new SurroundManager();
    this.tweens.timeScale = 1;
    GameState.takeSnapshot();
    const cfg = raidConfig(GameState.raidNumber);

    this.physics.world.setBounds(0, 0, WORLD.w, WORLD.h);
    this.huts = buildVillage(this);
    this.flow = new FlowField(WORLD.w, WORLD.h, HUTS);
    this.juice = new Juice(this);

    // --- the warband
    this.hero = new Hero(this, SPAWNS.hero.x, SPAWNS.hero.y, GameState.weaponTier);
    // (groups re-apply their defaults to every body added, so world-bounds collision must be set here)
    this.troopGroup = this.physics.add.group({ collideWorldBounds: true });
    GameState.troops.forEach((rec, i) => {
      const t = new Troop(this, this.hero.x - 30 - i * 12, this.hero.y + (i % 2 ? 26 : -26), rec, i);
      this.troops.push(t);
      this.troopGroup.add(t);
    });

    // --- the defenders
    this.enemyGroup = this.physics.add.group({ collideWorldBounds: true });
    const mult = { hp: cfg.hpMult, dmg: cfg.dmgMult, gold: cfg.goldMult };
    const spawn = (kind: EnemyKind, posts: Array<{ x: number; y: number }>, count: number) => {
      for (let i = 0; i < count; i++) {
        const p = posts[i % posts.length];
        const jitter = i >= posts.length ? 26 : 0;
        const spot = this.clearOfHuts(p.x + Phaser.Math.Between(-jitter, jitter), p.y + Phaser.Math.Between(-jitter, jitter), ENEMIES[kind].radius);
        const e = new Enemy(this, spot.x, spot.y, kind, mult);
        this.enemies.push(e);
        this.enemyGroup.add(e);
      }
    };
    spawn('militia', SPAWNS.militia, cfg.militia);
    spawn('archer', SPAWNS.archers, cfg.archers);
    spawn('captain', SPAWNS.captains, cfg.captains);

    this.arrows = this.physics.add.group({ classType: Arrow, maxSize: 40, runChildUpdate: false });
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
    this.physics.add.collider(this.arrows, this.huts, (a, b) => { const arrow = a instanceof Arrow ? a : (b as Arrow); arrow.kill(); });

    // --- camera
    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h);
    this.cameras.main.startFollow(this.hero, true, 0.1, 0.1);
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);

    // --- input + HUD
    this.playerInput = new PlayerInput();
    this.playerInput.attachKeyboard(this);
    this.hud = {
      heroHp: this.hero.hp, heroMaxHp: this.hero.maxHp, gold: GameState.gold, raid: GameState.raidNumber,
      troopsAlive: this.troops.length, troopsTotal: this.troops.length, enemiesAlive: this.enemies.length,
      hornCd: 0, hornMax: ABILITIES.horn.cooldown, chargeCd: 0, chargeMax: ABILITIES.charge.cooldown, boosted: false,
    };
    this.scene.launch('Hud', { input: this.playerInput, model: this.hud });

    this.events.once('shutdown', () => {
      this.scale.off('resize', this.applyZoom, this);
      this.scene.stop('Hud');
    });

  }

  /** Nudge a spawn point out of any hut it overlaps, so layout edits can't bury a defender in a wall. */
  private clearOfHuts(x: number, y: number, r: number) {
    for (let tries = 0; tries < 8; tries++) {
      const hit = HUTS.find(h => x + r > h.x - h.w / 2 && x - r < h.x + h.w / 2 && y + r > h.y - h.h / 2 && y - r < h.y + h.h / 2);
      if (!hit) break;
      const dx = x - hit.x, dy = y - hit.y;
      const len = Math.hypot(dx, dy) || 1;
      x += (dx / len) * 30; y += (dy / len) * 30;
    }
    return { x, y };
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
    for (const e of this.enemies) if (e.alive && e.aggro && e.kind === 'militia' && e.target === hero) hunters.push(e);
    this.surround.update(dt, hero, hunters);
    for (const e of this.enemies) if (e.alive) e.update(dt, hero, this.troops);

    for (const c of this.coins.getChildren()) (c as Coin).tick(dt, hero);
    for (const a of this.arrows.getChildren()) (a as Arrow).tick(dt);

    this.syncVisuals(time);
    this.cleanupDead();
    this.syncHud();

    if (!this.over && this.enemies.length === 0) this.victory();
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
    h.enemiesAlive = this.enemies.length;
    h.hornCd = this.hero.hornCd;
    h.chargeCd = this.hero.chargeCd;
    h.boosted = this.hero.boosted;
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
      if (!e.alive || e.aggro) continue;
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) <= radius) e.wakeQuiet();
    }
  }

  fireArrow(from: Enemy, target: Unit) {
    const s = ENEMIES.archer;
    const dist = from.distTo(target);
    const t = dist / s.arrowSpeed;
    const px = target.x + target.body.velocity.x * t * 0.7;
    const py = target.y + target.body.velocity.y * t * 0.7;
    this.tmp.set(px - from.x, py - from.y).normalize();
    const x = from.x + this.tmp.x * (from.radius + 8), y = from.y + this.tmp.y * (from.radius + 8);
    const arrow = this.arrows.get(x, y, TEX.arrow) as Arrow | null;
    if (!arrow) return;
    arrow.fire(x, y, this.tmp.x * s.arrowSpeed, this.tmp.y * s.arrowSpeed, from.damageAmount, s.arrowLife);
    Sound.arrow();
  }

  private arrowHit(a: unknown, b: unknown) {
    const arrow = (a instanceof Arrow ? a : b) as Arrow;
    const unit = (a instanceof Arrow ? b : a) as Unit;
    if (!arrow.active || !unit.alive) return;
    const vx = arrow.body.velocity.x, vy = arrow.body.velocity.y;
    arrow.kill();
    dealDamage(this, unit, arrow.damageAmount, unit.x - vx, unit.y - vy, 80, 'enemy');
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
      this.juice.burst(u.x, u.y, 0xffb070, u.kind === 'captain' ? 22 : 10);
      this.spawnCoins(u.x, u.y, u.goldValue);
      Sound.enemyDie();
      if (u.kind === 'captain') {
        this.juice.shake(8, 200, true);
        this.juice.hitStop(110);
        this.juice.banner(u.x, u.y - 30, 'CAPTAIN SLAIN', '#f5c542', 16);
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
    this.juice.banner(this.hero.x, this.hero.y - 50, 'VILLAGE CLEARED', '#f5c542', 22);
    this.time.delayedCall(1100, () => this.showResult('victory'));
  }

  private showResult(outcome: 'victory' | 'defeat') {
    this.scene.stop('Hud');
    const fallen = GameState.troops.filter(t => this.deadTroopIds.includes(t.id)).map(t => t.name);
    const data: ResultData = { outcome, goldEarned: this.goldEarned, fallen, raidNumber: GameState.raidNumber };
    if (outcome === 'victory') GameState.commitVictory(this.goldEarned, this.deadTroopIds);
    this.scene.launch('Result', data);
    this.scene.pause();
  }
}
