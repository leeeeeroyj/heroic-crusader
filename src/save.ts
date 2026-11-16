// The one save slot, in localStorage. Every access is guarded: private windows and blocked storage throw, and a
// save from another version, or one edited by hand, is treated as no save at all.
import { GEAR, ITEMS, LEVELS, SAVE, type GearId, type ItemId } from './config';
import { DUNGEONS, parseFloor } from './data/dungeons';
import { OVERWORLD, TOWNS, TOWN_H, TOWN_W } from './data/maps';
import { maxHp, maxMp, type Journey } from './state';

const isInt = (n: unknown, lo: number, hi: number): n is number => Number.isInteger(n) && (n as number) >= lo && (n as number) <= hi;
const isObj = (o: unknown): o is Record<string, unknown> => typeof o === 'object' && o !== null && !Array.isArray(o);

/** Older saves are brought up to date a version at a time. Version 1 (before dungeons) gains the dungeon fields, empty. */
const UPGRADE: Record<number, (j: Record<string, unknown>) => void> = {
  1: (j) => { j.opened = []; j.torch = false; j.glow = 0; },
  /** Version 2 (before the Gloam could be beaten): not done. */
  2: (j) => { j.done = false; },
};

/** The width and height of an area's map, or null if there's no such area. */
function areaSize(area: string): [number, number] | null {
  if (area === 'world') return [OVERWORLD[0].length, OVERWORLD.length];
  if (TOWNS[area]) return [TOWN_W, TOWN_H];
  const f = parseFloor(area);
  if (!f) return null;
  const rows = DUNGEONS[f.site].floors[f.floor];
  return [rows[0].length, rows.length];
}

/** Checks a parsed save's journey field by field; returns a clean copy or null. */
export function parseJourney(d: unknown): Journey | null {
  if (!isObj(d) || !isObj(d.journey)) return null;
  if (d.v !== SAVE.version) {
    if (typeof d.v !== 'number' || !UPGRADE[d.v]) return null;
    for (let v = d.v; v < SAVE.version; v++) UPGRADE[v](d.journey);
  }
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
  const size = typeof j.area === 'string' ? areaSize(j.area) : null;
  if (!size) return null;
  const [w, hgt] = size;
  if (j.at !== null && !(isObj(j.at) && isInt(j.at.x, 0, w - 1) && isInt(j.at.y, 0, hgt - 1))) return null;
  if (!isInt(j.sinceFight, 0, 1e7) || !isInt(j.ward, 0, 1e4) || !isInt(j.glow, 0, 1e4) || typeof j.torch !== 'boolean' || typeof j.done !== 'boolean') return null;
  // Opened chests and doors: 'area:x,y' on a real floor, each at most once.
  if (!Array.isArray(j.opened) || j.opened.length > 200 || new Set(j.opened).size !== j.opened.length) return null;
  for (const o of j.opened) {
    const m = typeof o === 'string' ? /^([1-4G]\.\d):(\d{1,2}),(\d{1,2})$/.exec(o) : null;
    const s = m && parseFloor(m[1]) ? areaSize(m[1]) : null;
    if (!m || !s || Number(m[2]) >= s[0] || Number(m[3]) >= s[1]) return null;
  }
  // Same field order as newJourney(), so a loaded journey serialises exactly as it was saved.
  const hero: Journey['hero'] = {
    name: h.name, lv: h.lv, hp: 0, mp: 0, xp: h.xp, gold: h.gold, home: h.home, gear, items, poisoned: h.poisoned,
  };
  if (!isInt(h.hp, 1, maxHp(hero)) || !isInt(h.mp, 0, maxMp(hero))) return null;
  hero.hp = h.hp;
  hero.mp = h.mp;
  const at = j.at === null ? null : { x: (j.at as { x: number }).x, y: (j.at as { y: number }).y };
  return {
    hero, lit: [...(j.lit as boolean[])], area: j.area as string, at, sinceFight: j.sinceFight, ward: j.ward,
    opened: [...(j.opened as string[])], torch: j.torch, glow: j.glow, done: j.done,
  };
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
