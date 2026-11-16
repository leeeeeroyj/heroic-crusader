// The one save slot, in localStorage. Every access is guarded: private windows and blocked storage throw, and a
// save from another version, or one edited by hand, is treated as no save at all.
import { GEAR, ITEMS, LEVELS, SAVE, type GearId, type ItemId } from './config';
import { OVERWORLD, TOWNS, TOWN_H, TOWN_W } from './data/maps';
import { maxHp, maxMp, type Journey } from './state';

const isInt = (n: unknown, lo: number, hi: number): n is number => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;
const isObj = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o);

/** Checks a parsed save's journey field by field; returns a clean copy or null. */
export function parseJourney(d: unknown): Journey | null {
  if (!isObj(d) || d.v !== SAVE.version || !isObj(d.journey)) return null;
  const j = d.journey, h = j.hero;
  if (!isObj(h) || typeof h.name !== 'string' || !/^[A-Z ]{1,8}$/.test(h.name)) return null;
  if (!isInt(h.lv, 1, LEVELS.length) || !isInt(h.xp, 0, 1e7) || !isInt(h.gold, 0, 1e7)) return null;
  if (typeof h.home !== 'string' || !TOWNS[h.home]?.shrine) return null;
  if (!isObj(h.gear) || !isObj(h.items) || typeof h.poisoned !== 'boolean') return null;
  const gear = { weapon: null, armour: null, shield: null } as Journey['hero']['gear'];
  for (const slot of ['weapon', 'armour', 'shield'] as const) {
    const id = h.gear[slot];
    if (id === null) continue;
    if (typeof id !== 'string' || !(id in GEAR) || GEAR[id as GearId].slot !== slot) return null;
    gear[slot] = id as GearId;
  }
  const items: Partial<Record<ItemId, number>> = {};
  for (const [id, n] of Object.entries(h.items)) {
    if (!(id in ITEMS) || !isInt(n, 0, ITEMS[id as ItemId].max)) return null;
    items[id as ItemId] = n;
  }
  if (!Array.isArray(j.lit) || j.lit.length !== 4 || !j.lit.every((b) => typeof b === 'boolean')) return null;
  if (typeof j.area !== 'string' || (j.area !== 'world' && !TOWNS[j.area])) return null;
  const w = j.area === 'world' ? OVERWORLD[0].length : TOWN_W, hgt = j.area === 'world' ? OVERWORLD.length : TOWN_H;
  if (j.at !== null && !(isObj(j.at) && isInt(j.at.x, 0, w - 1) && isInt(j.at.y, 0, hgt - 1))) return null;
  if (!isInt(j.sinceFight, 0, 1e7) || !isInt(j.ward, 0, 1e4)) return null;
  // Same field order as newJourney(), so a loaded journey serialises exactly as it was saved.
  const hero: Journey['hero'] = {
    name: h.name, lv: h.lv, hp: 0, mp: 0, xp: h.xp, gold: h.gold, home: h.home, gear, items, poisoned: h.poisoned,
  };
  if (!isInt(h.hp, 1, maxHp(hero)) || !isInt(h.mp, 0, maxMp(hero))) return null;
  hero.hp = h.hp;
  hero.mp = h.mp;
  const at = j.at === null ? null : { x: (j.at as { x: number }).x, y: (j.at as { y: number }).y };
  return { hero, lit: [...(j.lit as boolean[])], area: j.area, at, sinceFight: j.sinceFight, ward: j.ward };
}

export function writeSave(j: Journey): boolean {
  try {
    localStorage.setItem(SAVE.key, JSON.stringify({ v: SAVE.version, journey: j }));
    return true;
  } catch {
    return false;
  }
}

export function readSave(): Journey | null {
  try {
    const raw = localStorage.getItem(SAVE.key);
    return raw ? parseJourney(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
