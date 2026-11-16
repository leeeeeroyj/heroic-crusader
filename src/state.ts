// The journey's state: the hero and the beacons. Pure data, kept in the game registry under STATE.
import { GEAR, HERO, ITEMS, LEVELS, LIGHT, SPELLS, START_GEAR, START_ITEMS, STATUS, type GearId, type ItemId, type SpellId } from './config';
import { TOWNS } from './data/maps';

export const STATE = 'journey';

export interface Hero {
  name: string;
  lv: number;
  hp: number;
  mp: number;
  /** Valor (experience). */
  xp: number;
  gold: number;
  /** Site key of the shrine the hero last saved at; where they wake after a fall. */
  home: string;
  gear: { weapon: GearId | null; armour: GearId | null; shield: GearId | null };
  /** The pack: how many of each item. */
  items: Partial<Record<ItemId, number>>;
  /** Poison lasts until cured: a remedy, a rest in town, or the shrine. */
  poisoned: boolean;
}

export interface Journey {
  hero: Hero;
  /** One per beacon: Meadow, Marsh, Snow, Ruins. */
  lit: boolean[];
  /** Where the hero is: 'world' for the overworld, a town's site key, or a dungeon floor ('2.1'). */
  area: string;
  /** Tile position in that area; null means the overworld's Brightkeep tile (a new journey). */
  at: { x: number; y: number } | null;
  /** Steps walked since the last fight. */
  sinceFight: number;
  /** Steps of Ward left: weaker creatures leave the hero alone. */
  ward: number;
  /** Chests and locked doors opened, as `area:x,y`. */
  opened: string[];
  /** A torch burns until the hero leaves the dungeon. */
  torch: boolean;
  /** Steps of Glow left. */
  glow: number;
  /** The Gloam is beaten: the crusade is complete. */
  done: boolean;
}

export const levelRow = (lv: number) => LEVELS[Math.max(1, Math.min(LEVELS.length, lv)) - 1];
export const maxHp = (h: Hero) => levelRow(h.lv)[1];
export const maxMp = (h: Hero) => levelRow(h.lv)[2];
const power = (id: GearId | null) => (id ? GEAR[id].power : 0);
export const heroAtk = (h: Hero) => levelRow(h.lv)[3] + power(h.gear.weapon);
export const heroDef = (h: Hero) => levelRow(h.lv)[4] + power(h.gear.armour) + power(h.gear.shield);
export const heroAgi = (h: Hero) => HERO.agility + h.lv;
/** Valor still needed for the next level (0 at the top). */
export const toNext = (h: Hero) => (h.lv < LEVELS.length ? LEVELS[h.lv][5] - h.xp : 0);
/** Spells learned by this level, in the order they're learned. */
export const known = (h: Hero) => (Object.keys(SPELLS) as SpellId[]).filter((id) => SPELLS[id].lv <= h.lv);
export const count = (h: Hero, id: ItemId) => h.items[id] ?? 0;
/** Adds items up to the pack's limit; returns how many fitted. */
export function addItem(h: Hero, id: ItemId, n = 1): number {
  const fit = Math.max(0, Math.min(n, ITEMS[id].max - count(h, id)));
  h.items[id] = count(h, id) + fit;
  return fit;
}
export function takeItem(h: Hero, id: ItemId): boolean {
  if (count(h, id) <= 0) return false;
  h.items[id] = count(h, id) - 1;
  return true;
}
/** Heals up to the maximum; returns the HP actually gained. */
export function heal(h: Hero, amount: number): number {
  const got = Math.max(0, Math.min(amount, maxHp(h) - h.hp));
  h.hp += got;
  return got;
}

export function newJourney(): Journey {
  const hero: Hero = {
    name: HERO.name, lv: 1, hp: 0, mp: 0, xp: 0, gold: HERO.gold, home: HERO.home, gear: { ...START_GEAR }, items: { ...START_ITEMS }, poisoned: false,
  };
  hero.hp = maxHp(hero);
  hero.mp = maxMp(hero);
  return { hero, lit: [false, false, false, false], area: 'world', at: null, sinceFight: 0, ward: 0, opened: [], torch: false, glow: 0, done: false };
}

/** Puts the hero in their home town, before the shrine keeper (Homeward, and waking after a fall). */
export function goHome(j: Journey) {
  const town = TOWNS[j.hero.home];
  j.area = j.hero.home;
  j.at = { ...(town.shrine ?? town.arrive) };
  j.sinceFight = 0;
}

/** After a fall: the shrine keeper tends the hero at their last shrine, for half their gold. Returns the gold lost. */
export function wakeAtShrine(j: Journey): number {
  const h = j.hero, lost = Math.floor(h.gold / 2);
  h.gold -= lost;
  h.hp = maxHp(h);
  h.mp = maxMp(h);
  h.poisoned = false;
  goHome(j);
  j.ward = 0;
  return lost;
}

/** How far the hero can see in the dark, in tiles: bare, by torch, or by Glow (fading as its steps run out). */
export function lightRadius(j: Journey): number {
  const glow = j.glow > 0 ? LIGHT.torch + Math.ceil(((LIGHT.glow - LIGHT.torch) * j.glow) / LIGHT.glowSteps) : 0;
  return Math.max(LIGHT.dark, j.torch ? LIGHT.torch : 0, glow);
}

/** One step on the map: poison bites (never below 1 HP), and Ward and Glow wear off. Returns the HP lost. */
export function stepEffects(j: Journey): number {
  if (j.ward > 0) j.ward--;
  if (j.glow > 0) j.glow--;
  const h = j.hero;
  if (!h.poisoned || h.hp <= 1) return 0;
  const lost = Math.min(STATUS.poisonStep, h.hp - 1);
  h.hp -= lost;
  return lost;
}
