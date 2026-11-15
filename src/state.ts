// The journey's state: the hero and the beacons. Pure data, kept in the game registry under STATE.
import { GEAR, HERO, LEVELS, START_GEAR, type GearId } from './config';

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
}

export interface Journey {
  hero: Hero;
  /** One per beacon: Meadow, Marsh, Snow, Ruins. */
  lit: boolean[];
  /** Tile position on the overworld; null means "at home". */
  at: { x: number; y: number } | null;
  /** Steps walked since the last fight. */
  sinceFight: number;
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

export function newJourney(): Journey {
  const hero: Hero = { name: HERO.name, lv: 1, hp: 0, mp: 0, xp: 0, gold: HERO.gold, home: HERO.home, gear: { ...START_GEAR } };
  hero.hp = maxHp(hero);
  hero.mp = maxMp(hero);
  return { hero, lit: [false, false, false, false], at: null, sinceFight: 0 };
}

/** After a fall: the shrine keeper tends the hero at their last shrine, for half their gold. Returns the gold lost. */
export function wakeAtShrine(j: Journey): number {
  const h = j.hero, lost = Math.floor(h.gold / 2);
  h.gold -= lost;
  h.hp = maxHp(h);
  h.mp = maxMp(h);
  j.at = null;
  j.sinceFight = 0;
  return lost;
}
