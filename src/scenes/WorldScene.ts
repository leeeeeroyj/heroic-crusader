import Phaser from 'phaser';
import { BUMP_EVERY, COLORS, CREATURES, ENCOUNTER, HEIGHT, LEVELS, RENDER_SCALE, STEP_TIME, TILE, WIDTH, type CreatureId, type Ground, type ItemId } from '../config';
import { Controls } from '../controls';
import { SITES } from '../data/maps';
import { playSound, toggleMute } from '../sfx';
import { face } from '../sprites';
import { STATE, addItem, heroDef, maxHp, maxMp, newJourney, stepEffects, wakeAtShrine, type Journey } from '../state';
import { bakeMap } from '../tiles';
import { DIRS, buildOverworld, groundAt, isLit, rng, rollEncounter, tileAt, walkable, type Dir, type WorldMap } from '../world';
import type { BattleData } from './BattleScene';
import { publishHud } from './HudScene';

const MAP_KEY = 'overworld';

/** The overworld: grid walking with a following camera, random encounters, and the hand-off to battle. */
export class WorldScene extends Phaser.Scene {
  map!: WorldMap;
  journey!: Journey;
  /** Hero tile position. */
  pos = { x: 0, y: 0 };
  /** The step in progress: where it started and how far through it is (0..1). */
  moving: { fx: number; fy: number; t: number } | null = null;
  facingRight = true;
  steps = 0;
  /** Walking, the encounter wipe, or paused under a battle or the field menu. */
  mode: 'walk' | 'wipe' | 'battle' | 'menu' = 'walk';
  /** Random numbers for encounters and battles; a dev hook can seed it. */
  rand: () => number = rng(Date.now());
  /** Test switch: no random encounters. */
  calm = false;
  private controls!: Controls;
  private heroImg!: Phaser.GameObjects.Image;
  private mapImg!: Phaser.GameObjects.Image;
  private fires!: Phaser.GameObjects.Graphics;
  private wipeG!: Phaser.GameObjects.Graphics;
  private wipeT = 0;
  private pending: BattleData | null = null;
  private bumpAt = 0;
  private place: { name: string; t: number } | null = null;
  private message: { text: string; t: number } | null = null;
  private clock = 0;
  private bakedFor = '';

  constructor() {
    super('world');
  }

  create() {
    this.controls = new Controls(this);
    this.map = buildOverworld();
    if (!this.registry.has(STATE)) this.registry.set(STATE, newJourney());
    this.journey = this.registry.get(STATE) as Journey;
    const start = this.journey.at ?? this.map.sites[this.journey.hero.home];
    this.pos = { ...start };
    this.moving = null;
    this.mode = 'walk';
    this.message = null;
    this.bakedFor = '';
    this.mapImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(0);
    this.rebake();
    this.fires = this.add.graphics().setDepth(1);
    this.heroImg = face(this.add.image(0, 0, 'player'), 'player', true).setDepth(2);
    this.wipeG = this.add.graphics().setDepth(5);
    this.cameras.main.setZoom(RENDER_SCALE).setBackgroundColor(COLORS.night);
    this.place = { name: SITES[this.journey.hero.home]?.name ?? '', t: 2.5 };
    this.scene.launch('hud');
    this.cameras.main.fadeIn(300);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.scene.stop('hud'); this.scene.stop('battle'); });
  }

  /** Re-draws the map texture when the lit beacons change. */
  rebake() {
    const key = this.journey.lit.map(Number).join('');
    if (key === this.bakedFor) return;
    this.bakedFor = key;
    if (this.textures.exists(MAP_KEY)) this.textures.remove(MAP_KEY);
    this.textures.addCanvas(MAP_KEY, bakeMap(this.map, this.journey.lit));
    this.mapImg.setTexture(MAP_KEY);
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.clock += dt;
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (this.mode === 'wipe') {
      this.wipeT += dt;
      this.drawWipe(this.wipeT / ENCOUNTER.wipe);
      if (this.wipeT >= ENCOUNTER.wipe) this.openBattle();
      return;
    }
    if (input.menu && this.mode === 'walk') { this.openMenu(); return; }
    this.rebake();

    if (this.moving) {
      this.moving.t += dt / STEP_TIME;
      if (this.moving.t >= 1) { this.moving = null; this.arrive(); }
    }
    // Keep walking while a direction is held: the next step starts the frame the last one ends.
    if (!this.moving && this.mode === 'walk' && input.dir) this.step(input.dir);

    this.drawHero();
    this.followCamera();
    this.drawFires();
    if (this.place) { this.place.t -= dt; if (this.place.t <= 0) this.place = null; }
    if (this.message) { this.message.t -= dt; if (this.message.t <= 0) this.message = null; }
    publishHud(this, this.journey, input.device, 'walk', this.place, this.message);
  }

  /** Tries one step; faces that way either way. Returns whether the hero moved. */
  step(dir: Dir): boolean {
    const [dx, dy] = DIRS[dir];
    if (dx) this.facingRight = dx > 0;
    const nx = this.pos.x + dx, ny = this.pos.y + dy;
    if (!walkable(this.map, nx, ny, this.litCount())) {
      if (this.clock >= this.bumpAt) { playSound(this, 'bump'); this.bumpAt = this.clock + BUMP_EVERY; }
      return false;
    }
    this.moving = { fx: this.pos.x, fy: this.pos.y, t: 0 };
    this.pos = { x: nx, y: ny };
    return true;
  }

  private arrive() {
    this.steps++;
    this.journey.sinceFight++;
    this.journey.at = { ...this.pos };
    if (stepEffects(this.journey) > 0) {
      playSound(this, 'poison');
      this.cameras.main.flash(120, 90, 160, 70);
    }
    const site = SITES[tileAt(this.map, this.pos.x, this.pos.y)];
    if (site) {
      this.place = { name: site.name, t: 2.5 };
      if (site.kind === 'town') this.rest(site.name);
      else playSound(this, 'arrive');
      return;
    }
    if (this.calm) return;
    const fight = rollEncounter(this.map, this.pos.x, this.pos.y, this.journey.lit, this.journey.sinceFight, this.rand);
    if (!fight) return;
    // Ward and incense: creatures too weak to hurt the hero keep their distance.
    if (this.journey.ward > 0 && fight.foes.every((id) => CREATURES[id].atk <= heroDef(this.journey.hero))) return;
    this.fight(fight.foes, fight.ground);
  }

  /** Until towns have inns, walking into one is a night's rest. It cures poison too. */
  private rest(name: string) {
    const h = this.journey.hero;
    if (h.hp === maxHp(h) && h.mp === maxMp(h) && !h.poisoned) { playSound(this, 'arrive'); return; }
    h.hp = maxHp(h);
    h.mp = maxMp(h);
    h.poisoned = false;
    this.message = { text: `You rest in ${name}. HP and MP restored.`, t: 2.5 };
    playSound(this, 'rest');
  }

  /** Starts a fight: the wipe closes over the map, then the battle scene opens. */
  fight(foes: CreatureId[], ground: Ground = groundAt(this.map, this.pos.x, this.pos.y)) {
    if (this.mode !== 'walk') return;
    this.moving = null;
    this.drawHero();
    this.mode = 'wipe';
    this.wipeT = 0;
    this.journey.sinceFight = 0;
    this.pending = { foes, ground, dim: !isLit(this.map, this.pos.x, this.pos.y, this.journey.lit), rand: this.rand };
    playSound(this, 'encounter');
  }

  /** Classic encounter wipe: tiles go dark in a spiral from the edges in. `k` runs 0..1. */
  private drawWipe(k: number) {
    const v = this.cameras.main.worldView, g = this.wipeG.clear().fillStyle(0x06070f);
    const cols = Math.ceil(WIDTH / TILE), rows = Math.ceil(HEIGHT / TILE), n = Math.floor(Math.min(1, k) * cols * rows);
    let x0 = 0, y0 = 0, x1 = cols - 1, y1 = rows - 1, c = 0;
    const cell = (x: number, y: number) => { g.fillRect(v.x + x * TILE, v.y + y * TILE, TILE, TILE); c++; };
    while (c < n && x0 <= x1 && y0 <= y1) {
      for (let x = x0; x <= x1 && c < n; x++) cell(x, y0);
      y0++;
      for (let y = y0; y <= y1 && c < n; y++) cell(x1, y);
      x1--;
      for (let x = x1; x >= x0 && c < n; x--) cell(x, y1);
      y1--;
      for (let y = y1; y >= y0 && c < n; y--) cell(x0, y);
      x0++;
    }
  }

  private openBattle() {
    this.mode = 'battle';
    this.scene.launch('battle', this.pending!);
    this.scene.bringToTop('hud');
    this.scene.pause();
  }

  /** Called by the battle scene as it closes. */
  endFight(outcome: 'won' | 'fled' | 'lost') {
    this.mode = 'walk';
    this.wipeG.clear();
    this.journey.sinceFight = 0;
    if (outcome === 'lost') {
      const lost = wakeAtShrine(this.journey), home = this.journey.hero.home;
      this.pos = { ...this.map.sites[home] };
      this.journey.at = { ...this.pos };
      this.message = { text: `The shrine keeper in ${SITES[home].name} tends your wounds. Half your gold (${lost}) is gone.`, t: 4 };
    }
    this.drawHero();
    this.followCamera();
    this.cameras.main.fadeIn(outcome === 'lost' ? 600 : 250);
  }

  /** Opens the field menu over the paused map. */
  openMenu() {
    if (this.mode !== 'walk') return;
    this.mode = 'menu';
    this.moving = null;
    this.message = null;
    this.place = null;
    this.drawHero();
    this.scene.launch('menu', { rand: this.rand });
    this.scene.bringToTop('menu');
    this.scene.pause();
  }

  /** Called by the menu as it closes: back to the title, Homeward, or just walking on with what happened. */
  closeMenu(then: 'title' | 'home' | null, note: string) {
    this.mode = 'walk';
    this.scene.resume();
    if (then === 'title') { this.leave(); return; }
    if (then === 'home') {
      const home = this.journey.hero.home;
      this.pos = { ...this.map.sites[home] };
      this.journey.at = { ...this.pos };
      this.journey.sinceFight = 0;
      this.place = { name: SITES[home].name, t: 2.5 };
      this.drawHero();
      this.followCamera();
      this.cameras.main.flash(300, 255, 244, 192);
      return;
    }
    if (note) this.message = { text: note, t: 2.5 };
  }

  litCount() {
    return this.journey.lit.filter(Boolean).length;
  }

  /** The hero's position in map pixels (top-left of its tile), part way through a step. */
  heroPixel() {
    if (!this.moving) return { x: this.pos.x * TILE, y: this.pos.y * TILE };
    const k = Math.min(1, this.moving.t);
    return { x: (this.moving.fx + (this.pos.x - this.moving.fx) * k) * TILE, y: (this.moving.fy + (this.pos.y - this.moving.fy) * k) * TILE };
  }

  private drawHero() {
    const p = this.heroPixel();
    const bob = this.moving && this.moving.t < 0.5 ? 1 : 0;
    face(this.heroImg, 'player', this.facingRight).setPosition(p.x + TILE / 2, p.y + TILE / 2 - bob);
  }

  /** Centres the hero, clamped so the view never shows past the map's edge. */
  private followCamera() {
    const p = this.heroPixel(), mw = this.map.w * TILE, mh = this.map.h * TILE;
    const cx = Phaser.Math.Clamp(p.x + TILE / 2, WIDTH / 2, mw - WIDTH / 2);
    const cy = Phaser.Math.Clamp(p.y + TILE / 2, HEIGHT / 2, mh - HEIGHT / 2);
    this.cameras.main.centerOn(Math.round(cx), Math.round(cy));
  }

  /** Lit beacons burn on their towers; cold ones show a grey brazier. */
  private drawFires() {
    const g = this.fires.clear();
    ['1', '2', '3', '4'].forEach((k, i) => {
      const s = this.map.sites[k], x = s.x * TILE + 8, y = s.y * TILE - 2;
      if (!this.journey.lit[i]) {
        g.fillStyle(COLORS.ashes).fillRect(x - 1, y + 2, 3, 2);
        g.fillStyle(COLORS.ashes2).fillRect(x, y, 1, 2);
        return;
      }
      g.fillStyle(COLORS.gold, 0.16).fillCircle(x, y + 4, 13 + Math.sin(this.clock * 6) * 1.5);
      const fl = Math.floor(this.clock * 10 + i) % 2;
      g.fillStyle(COLORS.ember).fillRect(x - 2, y + 1, 5, 4);
      g.fillStyle(COLORS.gold).fillRect(x - 1, y - fl, 3, 4);
      g.fillStyle(0xfff4c0).fillRect(x, y + 2, 1, 2);
    });
  }

  // ---- Dev hooks (reached through the dev-only window handle) ----

  /** Puts the hero on a tile or a site key. */
  teleport(to: string | { x: number; y: number }) {
    const p = typeof to === 'string' ? this.map.sites[to] : to;
    this.pos = { x: p.x, y: p.y };
    this.moving = null;
    this.journey.at = { ...this.pos };
  }

  /** Lights the first n beacons (or an explicit list). */
  setLit(n: number | boolean[]) {
    this.journey.lit = Array.isArray(n) ? [...n] : [0, 1, 2, 3].map((i) => i < n);
  }

  /** Puts items in the pack (up to its limit). */
  give(id: ItemId, n = 1) {
    return addItem(this.journey.hero, id, n);
  }

  /** Sets the hero's level, with Valor, HP and MP to match. */
  setLevel(lv: number) {
    const h = this.journey.hero;
    h.lv = Math.max(1, Math.min(LEVELS.length, lv));
    h.xp = LEVELS[h.lv - 1][5];
    h.hp = maxHp(h);
    h.mp = maxMp(h);
  }

  /** Seeds the random numbers for encounters and battles. */
  seed(n: number) {
    this.rand = rng(n);
  }

  leave() {
    this.registry.remove(STATE);
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('title'));
  }
}
