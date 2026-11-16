import Phaser from 'phaser';
import { BUMP_EVERY, COLORS, CREATURES, ENCOUNTER, HEIGHT, LEVELS, LIGHT, REGION_NAMES, RENDER_SCALE, STEP_TIME, TILE, WIDTH, type CreatureId, type Ground, type ItemId, type SpriteKey } from '../config';
import { Controls } from '../controls';
import { DUNGEONS, floorArea, parseFloor } from '../data/dungeons';
import { SITES, TOWNS } from '../data/maps';
import { openChest } from '../field';
import { PEOPLE, type Person } from '../data/people';
import { writeSave } from '../save';
import { playSound, toggleMute } from '../sfx';
import { face } from '../sprites';
import { STATE, addItem, count, goHome, heroDef, lightRadius, maxHp, maxMp, newJourney, stepEffects, takeItem, wakeAtShrine, type Journey } from '../state';
import { bakeMap } from '../tiles';
import { DIRS, besideStairs, buildDungeon, buildOverworld, buildTown, chestsOn, groundAt, isLit, rng, rollEncounter, tileAt, walkable, type Dir, type WorldMap } from '../world';
import type { BattleData } from './BattleScene';
import { publishHud } from './HudScene';
import type { TalkData } from './TalkScene';

/**
 * The overworld, the towns and the dungeons: grid walking with a following camera, random encounters and the
 * hand-off to battle, townsfolk to talk to, chests, locked doors, the dark, wardens, and the field menu.
 */
export class WorldScene extends Phaser.Scene {
  map!: WorldMap;
  journey!: Journey;
  /** Hero tile position. */
  pos = { x: 0, y: 0 };
  /** The step in progress: where it started and how far through it is (0..1). */
  moving: { fx: number; fy: number; t: number } | null = null;
  facingRight = true;
  /** The way the hero last tried to go: who they talk to. */
  facing: Dir = 'up';
  steps = 0;
  /** Walking, the encounter wipe, or paused under a battle, the field menu or a conversation. */
  mode: 'walk' | 'wipe' | 'battle' | 'menu' | 'talk' = 'walk';
  /** Random numbers for encounters and battles; a dev hook can seed it. */
  rand: () => number = rng(Date.now());
  /** Test switch: no random encounters. */
  calm = false;
  /** The townsfolk of the current town, with their sprites. */
  people: Array<{ p: Person; img: Phaser.GameObjects.Image }> = [];
  /** Things on a dungeon floor: unopened chests, the warden (until its beacon burns) and the brazier. */
  props: Array<{ kind: 'chest' | 'warden' | 'brazier'; x: number; y: number; img: Phaser.GameObjects.Image }> = [];
  /** The beacon a warden fight is for, while one is on. */
  private wardenFight: number | null = null;
  private dark!: Phaser.GameObjects.Graphics;
  private maps = new Map<string, WorldMap>();
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

  get area() {
    return this.journey.area;
  }

  create() {
    this.controls = new Controls(this);
    this.maps.clear();
    if (!this.registry.has(STATE)) this.registry.set(STATE, newJourney());
    this.journey = this.registry.get(STATE) as Journey;
    this.moving = null;
    this.mode = 'walk';
    this.message = null;
    this.people = [];
    this.mapImg = this.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(0);
    this.fires = this.add.graphics().setDepth(1);
    this.heroImg = face(this.add.image(0, 0, 'player'), 'player', true).setDepth(3);
    this.dark = this.add.graphics().setDepth(4);
    this.props = [];
    this.wardenFight = null;
    this.wipeG = this.add.graphics().setDepth(5);
    this.cameras.main.setZoom(RENDER_SCALE).setBackgroundColor(COLORS.night);
    const j = this.journey;
    this.enterArea(j.area, j.at ?? buildOverworld().sites[j.hero.home]);
    this.scene.launch('hud');
    this.cameras.main.fadeIn(300);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { for (const s of ['hud', 'battle', 'menu', 'talk']) this.scene.stop(s); });
  }

  private mapFor(area: string): WorldMap {
    if (!this.maps.has(area)) {
      const f = parseFloor(area);
      this.maps.set(area, area === 'world' ? buildOverworld() : f ? buildDungeon(f.site, f.floor, this.journey.opened) : buildTown(area));
    }
    return this.maps.get(area)!;
  }

  /** Moves the hero into an area (the overworld, a town or a dungeon floor) at a tile, with its map, people and name. */
  enterArea(area: string, at: { x: number; y: number }) {
    // Out of the dungeons, the torch goes out and Glow fades.
    if (!parseFloor(area)) { this.journey.torch = false; this.journey.glow = 0; }
    this.journey.area = area;
    this.map = this.mapFor(area);
    this.pos = { x: at.x, y: at.y };
    this.journey.at = { ...this.pos };
    this.moving = null;
    this.rebake();
    for (const { img } of this.people) img.destroy();
    this.people = (PEOPLE[area] ?? []).map((p) => ({
      p, img: face(this.add.image(p.x * TILE + TILE / 2, p.y * TILE + TILE / 2, p.sprite).setDepth(2), p.sprite as SpriteKey, p.x < 13),
    }));
    this.placeProps();
    const f = parseFloor(area);
    const name = area === 'world' ? SITES[tileAt(this.map, at.x, at.y)]?.name
      : f ? `${SITES[f.site].name}${DUNGEONS[f.site].floors.length > 1 ? `  ·  ${f.floor + 1}F` : ''}` : SITES[area]?.name;
    this.place = name ? { name, t: 2.5 } : null;
    this.drawHero();
    this.followCamera();
  }

  /** Sets out a dungeon floor's chests, its warden (while the beacon is cold) and its brazier. */
  placeProps() {
    for (const { img } of this.props) img.destroy();
    this.props = [];
    const m = this.map;
    if (m.kind !== 'dungeon') return;
    const add = (kind: 'chest' | 'warden' | 'brazier', x: number, y: number, key: string) =>
      this.props.push({ kind, x, y, img: this.add.image(x * TILE + TILE / 2, y * TILE + TILE / 2, key).setDepth(2) });
    for (const c of chestsOn(m, this.journey.opened)) add('chest', c.x, c.y, 'chest');
    const d = DUNGEONS[m.site!], lit = this.cleared(m.site!);
    m.grid.forEach((row, y) => row.forEach((t, x) => { if (t === '^') add('brazier', x, y, 'beacon'); }));
    for (const b of this.props) if (b.kind === 'brazier' && !lit) b.img.setTint(0x5b5670);
    if (m.sites.W && !lit) {
      add('warden', m.sites.W.x, m.sites.W.y, CREATURES[d.warden].slot);
      face(this.props.at(-1)!.img, CREATURES[d.warden].slot as SpriteKey, false);
    }
  }

  /** A dungeon's warden is freed (its beacon burns), or for the Hollow, the Gloam is beaten. */
  cleared(site: string) {
    const b = DUNGEONS[site].beacon;
    return b < 0 ? this.journey.done : this.journey.lit[b];
  }

  private propAt(x: number, y: number) {
    return this.props.find((e) => e.x === x && e.y === y && e.kind !== 'brazier');
  }

  /** Re-draws the map texture when the area or the lit beacons change. */
  rebake() {
    const key = `${this.area}:${this.journey.lit.map(Number).join('')}`;
    if (key === this.bakedFor) return;
    this.bakedFor = key;
    const tex = `map-${this.area}`;
    if (this.textures.exists(tex)) this.textures.remove(tex);
    this.textures.addCanvas(tex, bakeMap(this.map, this.journey.lit));
    this.mapImg.setTexture(tex);
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
    if (!this.moving && this.mode === 'walk' && input.confirm) this.interact();
    // Keep walking while a direction is held: the next step starts the frame the last one ends.
    if (!this.moving && this.mode === 'walk' && input.dir) this.step(input.dir);

    this.drawHero();
    this.followCamera();
    this.drawFires();
    this.drawDark();
    if (this.place) { this.place.t -= dt; if (this.place.t <= 0) this.place = null; }
    if (this.message) { this.message.t -= dt; if (this.message.t <= 0) this.message = null; }
    publishHud(this, this.journey, input.device, 'walk', this.place, this.message);
  }

  private personAt(x: number, y: number) {
    return this.people.find((e) => e.p.x === x && e.p.y === y)?.p;
  }

  /** Tries one step; faces that way either way. Returns whether the hero moved. */
  step(dir: Dir): boolean {
    const [dx, dy] = DIRS[dir];
    if (dx) this.facingRight = dx > 0;
    this.facing = dir;
    const nx = this.pos.x + dx, ny = this.pos.y + dy;
    // Out through a town's gate: back to its tile on the overworld.
    if (this.map.kind === 'town' && (nx < 0 || ny < 0 || nx >= this.map.w || ny >= this.map.h)) {
      this.leaveTown();
      return true;
    }
    const prop = this.propAt(nx, ny);
    if (prop?.kind === 'warden') { this.fightWarden(); return false; }
    if (tileAt(this.map, nx, ny) === '|' && this.map.kind === 'dungeon') { this.tryDoor(nx, ny); return false; }
    if (!walkable(this.map, nx, ny, this.litCount()) || this.personAt(nx, ny) || prop) {
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
    if (this.map.kind === 'town') return;
    const key = tileAt(this.map, this.pos.x, this.pos.y);
    if (this.map.kind === 'dungeon' && (key === '<' || key === '>')) { this.takeStairs(key); return; }
    const site = this.map.kind === 'world' ? SITES[key] : undefined;
    if (site) {
      // Towns and the hermit's hut, or down into a dungeon (a beacon tower, or the Hollow).
      if (site.kind === 'town') this.enterTown(key);
      else this.enterFloor(key, 0, '<');
      return;
    }
    if (this.calm) return;
    const fight = rollEncounter(this.map, this.pos.x, this.pos.y, this.journey.lit, this.journey.sinceFight, this.rand);
    if (!fight) return;
    // Ward and incense: creatures too weak to hurt the hero keep their distance.
    if (this.journey.ward > 0 && fight.foes.every((id) => CREATURES[id].atk <= heroDef(this.journey.hero))) return;
    this.fight(fight.foes, fight.ground);
  }

  /** Onto a dungeon floor, beside its stairs ('<' coming down from above, '>' coming back up from below). */
  enterFloor(site: string, floor: number, by: '<' | '>') {
    playSound(this, 'stairs');
    const area = floorArea(site, floor), m = this.mapFor(area);
    this.enterArea(area, besideStairs(m, m.sites[by]));
    this.cameras.main.fadeIn(300);
    if (floor === 0 && by === '<' && lightRadius(this.journey) <= LIGHT.dark) {
      this.message = { text: "It's pitch dark. A torch, or the Glow spell, would light the way.", t: 3.5 };
    }
  }

  /** Stairs: '>' leads on to the next floor; '<' leads back toward the entrance, and out from the first floor. */
  private takeStairs(t: '<' | '>') {
    const site = this.map.site!, floor = this.map.floor!;
    if (t === '>') { this.enterFloor(site, floor + 1, '<'); return; }
    if (floor > 0) { this.enterFloor(site, floor - 1, '>'); return; }
    playSound(this, 'arrive');
    this.enterArea('world', this.mapFor('world').sites[site]);
    this.cameras.main.fadeIn(300);
  }

  /** A locked door: an iron key opens it for good. */
  private tryDoor(x: number, y: number) {
    if (this.clock < this.bumpAt) return;
    this.bumpAt = this.clock + BUMP_EVERY;
    if (count(this.journey.hero, 'key') <= 0) {
      playSound(this, 'bump');
      this.message = { text: 'The door is locked. An iron key would open it.', t: 2.5 };
      return;
    }
    takeItem(this.journey.hero, 'key');
    this.journey.opened.push(`${this.area}:${x},${y}`);
    this.map.grid[y][x] = '.';
    this.bakedFor = '';
    this.rebake();
    playSound(this, 'unlock');
    this.message = { text: 'The iron key turns, and the door swings open.', t: 2.5 };
  }

  /** Opens the chest at a tile. A full pack leaves it shut. */
  private openChestAt(x: number, y: number) {
    const c = chestsOn(this.map, this.journey.opened).find((e) => e.x === x && e.y === y);
    if (!c) return;
    const r = openChest(this.journey.hero, c.loot);
    this.message = { text: r.text, t: 3 };
    if (!r.ok) { playSound(this, 'bump'); return; }
    playSound(this, 'open');
    this.journey.opened.push(c.id);
    this.map.grid[y][x] = '.';
    this.placeProps();
  }

  /** Bumping into the warden: no way past but through it. */
  fightWarden() {
    const d = DUNGEONS[this.map.site!];
    if (this.mode !== 'walk' || this.cleared(this.map.site!)) return;
    this.fight([d.warden], d.ground);
    this.wardenFight = d.beacon;
  }

  /**
   * The Gloam is beaten: the crusade is complete. The journey is saved at the home shrine, rested, with the flag set,
   * and the ending plays.
   */
  finale() {
    const j = this.journey, h = j.hero;
    j.done = true;
    h.hp = maxHp(h);
    h.mp = maxMp(h);
    h.poisoned = false;
    goHome(j);
    writeSave(j);
    this.cameras.main.fadeOut(0);
    this.time.delayedCall(60, () => this.scene.start('ending'));
  }

  /** A warden is freed: its beacon burns again and its region takes back its colour. */
  lightBeacon(i: number) {
    this.journey.lit[i] = true;
    this.rebake();
    this.placeProps();
    playSound(this, 'beacon');
    this.cameras.main.flash(900, 255, 220, 140);
    const name = Object.entries(DUNGEONS).find(([, d]) => d.beacon === i)![0];
    this.message = {
      text: this.journey.lit.every(Boolean) ? `The ${SITES[name].name} beacon blazes! All four burn, and the Gloam's wall is falling.`
        : `The ${SITES[name].name} beacon blazes! Colour floods back into the ${REGION_NAMES[i].toLowerCase()}.`,
      t: 5,
    };
  }

  /** Into a town from its tile on the overworld, at the gate. */
  enterTown(key: string) {
    playSound(this, 'arrive');
    this.facing = 'up';
    this.enterArea(key, TOWNS[key].arrive);
    this.cameras.main.fadeIn(250);
  }

  private leaveTown() {
    const key = this.area;
    this.enterArea('world', this.mapFor('world').sites[key]);
    this.place = null;
    this.cameras.main.fadeIn(250);
  }

  /** Talks to whoever the hero faces, or across a counter; failing that, anyone right beside them. */
  interact() {
    const { x, y } = this.pos, counter = (cx: number, cy: number) => tileAt(this.map, cx, cy) === 'k';
    const reach = (d: Dir) => {
      const [dx, dy] = DIRS[d];
      return this.personAt(x + dx, y + dy) ?? (counter(x + dx, y + dy) ? this.personAt(x + 2 * dx, y + 2 * dy) : undefined);
    };
    const p = reach(this.facing) ?? (['up', 'down', 'left', 'right'] as Dir[]).map(reach).find(Boolean);
    if (p) { this.talk(p); return; }
    // In a dungeon: the chest ahead, or the warden.
    const [dx, dy] = DIRS[this.facing], prop = this.propAt(x + dx, y + dy);
    if (prop?.kind === 'chest') this.openChestAt(x + dx, y + dy);
    else if (prop?.kind === 'warden') this.fightWarden();
  }

  /** Opens a conversation with someone over the paused map. */
  talk(p: Person) {
    if (this.mode !== 'walk') return;
    this.mode = 'talk';
    this.moving = null;
    this.message = null;
    this.place = null;
    this.drawHero();
    const data: TalkData = { person: p, town: this.area };
    this.scene.launch('talk', data);
    this.scene.bringToTop('talk');
    this.scene.pause();
  }

  /** Called by the talk scene as it closes. */
  closeTalk() {
    this.mode = 'walk';
    this.scene.resume();
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
    const warden = this.wardenFight;
    this.wardenFight = null;
    if (outcome === 'won' && warden !== null && warden >= 0) this.lightBeacon(warden);
    if (outcome === 'won' && warden === -1) { this.finale(); return; }
    if (outcome === 'lost') {
      const lost = wakeAtShrine(this.journey), home = this.journey.hero.home;
      this.facing = 'up';
      this.enterArea(this.journey.area, this.journey.at!);
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
      goHome(this.journey);
      this.facing = 'up';
      this.enterArea(this.journey.area, this.journey.at!);
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

  /** Lit beacons burn on their towers; cold ones show a grey brazier. Underground, a lit brazier glows. */
  private drawFires() {
    const g = this.fires.clear();
    if (this.map.kind === 'dungeon') {
      if (!this.cleared(this.map.site!)) return;
      for (const b of this.props) if (b.kind === 'brazier') g.fillStyle(COLORS.gold, 0.18).fillCircle(b.x * TILE + 8, b.y * TILE + 6, 14 + Math.sin(this.clock * 6) * 1.5);
      return;
    }
    if (this.map.kind !== 'world') return;
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

  /** The dark: tiles fade out past the hero's light, with a dim band at its edge. A lit brazier lights its room. */
  private drawDark() {
    const g = this.dark.clear();
    if (this.map.kind !== 'dungeon') return;
    const p = this.heroPixel(), hx = p.x / TILE, hy = p.y / TILE, r = lightRadius(this.journey);
    const lights = [{ x: hx, y: hy, r }];
    for (const b of this.props) if (b.kind === 'brazier' && this.cleared(this.map.site!)) lights.push({ x: b.x, y: b.y, r: 3 });
    const v = this.cameras.main.worldView;
    const x0 = Math.max(0, Math.floor(v.x / TILE)), y0 = Math.max(0, Math.floor(v.y / TILE));
    const x1 = Math.min(this.map.w - 1, Math.ceil(v.right / TILE)), y1 = Math.min(this.map.h - 1, Math.ceil(v.bottom / TILE));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      // How far past the nearest light's edge this tile is.
      const over = Math.min(...lights.map((l) => Math.hypot(x - l.x, y - l.y) - l.r));
      if (over <= 0.3) continue;
      g.fillStyle(0x05040a, over <= 1.3 ? 0.62 : 0.97).fillRect(x * TILE, y * TILE, TILE, TILE);
    }
  }

  // ---- Dev hooks (reached through the dev-only window handle) ----

  /** Puts the hero on a tile of an area (the overworld unless named), or on an overworld site by its key. */
  teleport(to: string | { x: number; y: number }, area = 'world') {
    if (typeof to === 'string') this.enterArea('world', this.mapFor('world').sites[to]);
    else this.enterArea(area, to);
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
