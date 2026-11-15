// The journey's state: the hero and the beacons. Pure data, kept in the game registry under STATE.
import { HERO, LEVELS } from './config';

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
}

export interface Journey {
  hero: Hero;
  /** One per beacon: Meadow, Marsh, Snow, Ruins. */
  lit: boolean[];
  /** Tile position on the overworld; null means "at home". */
  at: { x: number; y: number } | null;
}

export const levelRow = (lv: number) => LEVELS[Math.max(1, Math.min(LEVELS.length, lv)) - 1];
export const maxHp = (h: Hero) => levelRow(h.lv)[1];
export const maxMp = (h: Hero) => levelRow(h.lv)[2];

export function newJourney(): Journey {
  const hero: Hero = { name: HERO.name, lv: 1, hp: 0, mp: 0, xp: 0, gold: HERO.gold, home: HERO.home };
  hero.hp = maxHp(hero);
  hero.mp = maxMp(hero);
  return { hero, lit: [false, false, false, false], at: null };
}
