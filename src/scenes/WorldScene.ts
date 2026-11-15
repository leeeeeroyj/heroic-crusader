import Phaser from 'phaser';
import { BUMP_EVERY, COLORS, HEIGHT, HUD_STATE, RENDER_SCALE, STEP_TIME, TILE, WIDTH } from '../config';
import { Controls, type Device } from '../controls';
import { SITES } from '../data/maps';
import { playSound, toggleMute } from '../sfx';
import { face } from '../sprites';
import { STATE, maxHp, maxMp, newJourney, type Journey } from '../state';
import { bakeMap } from '../tiles';
import { DIRS, buildOverworld, tileAt, walkable, type Dir, type WorldMap } from '../world';
import type { HudState } from './HudScene';

const MAP_KEY = 'overworld';

/** The overworld: grid walking with a following camera. Fights, towns and dungeons hang off this scene later. */
export class WorldScene extends Phaser.Scene {
  map!: WorldMap;
  journey!: Journey;
  /** Hero tile position. */
  pos = { x: 0, y: 0 };
  /** The step in progress: where it started and how far through it is (0..1). */
  moving: { fx: number; fy: number; t: number } | null = null;
  facingRight = true;
  steps = 0;
  private controls!: Controls;
  private heroImg!: Phaser.GameObjects.Image;
  private mapImg!: Phaser.GameObjects.Image;
  private fires!: Phaser.GameObjects.Graphics;
  private bumpAt = 0;
  private place: { name: string; t: number } | null = null;
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
    this.place = null;
    this.bakedFor = '';
    this.mapImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(0);
    this.rebake();
    this.fires = this.add.graphics().setDepth(1);
    this.heroImg = face(this.add.image(0, 0, 'player'), 'player', true).setDepth(2);
    this.cameras.main.setZoom(RENDER_SCALE).setBackgroundColor(COLORS.night);
    this.place = { name: SITES[this.journey.hero.home]?.name ?? '', t: 2.5 };
    this.scene.launch('hud');
    this.cameras.main.fadeIn(300);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scene.stop('hud'));
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
    if (input.menu) { this.leave(); return; }
    this.rebake();

    if (this.moving) {
      this.moving.t += dt / STEP_TIME;
      if (this.moving.t >= 1) { this.moving = null; this.arrive(); }
    }
    // Keep walking while a direction is held: the next step starts the frame the last one ends.
    if (!this.moving && input.dir) this.step(input.dir);

    this.drawHero();
    this.followCamera();
    this.drawFires();
    if (this.place) { this.place.t -= dt; if (this.place.t <= 0) this.place = null; }
    this.writeHud(input.device);
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
    this.journey.at = { ...this.pos };
    const site = SITES[tileAt(this.map, this.pos.x, this.pos.y)];
    if (site) {
      this.place = { name: site.name, t: 2.5 };
      playSound(this, 'arrive');
    }
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

  private writeHud(device: Device) {
    const h = this.journey.hero;
    const state: HudState = {
      name: h.name, lv: h.lv, hp: h.hp, maxHp: maxHp(h), mp: h.mp, maxMp: maxMp(h), gold: h.gold,
      lit: [...this.journey.lit], device, place: this.place,
    };
    this.registry.set(HUD_STATE, state);
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

  leave() {
    this.registry.remove(STATE);
    this.cameras.main.fadeOut(250);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('title'));
  }
}
