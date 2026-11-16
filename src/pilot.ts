// Attract mode's pilot (?attract): a made-up journey to show off, a short walk to where creatures roam, and the
// fight. Battles take battle.ts's `policy`. Nothing here reads or writes the save.
import { LEVELS, POOLS, type CreatureId, type GearId, type Ground } from './config';
import { SITES } from './data/maps';
import { maxHp, maxMp, newJourney, type Journey } from './state';
import { DIRS, encounterOdds, groundAt, tileAt, walkable, type Dir, type Point, type WorldMap } from './world';

/** One showcase per region: the town to set out from, the ground to fight on, and the level and gear it wants. */
const SHOWCASE: ReadonlyArray<{ start: string; ground: Ground; lv: number; gear: [GearId, GearId, GearId] }> = [
  { start: 'C', ground: 'meadow', lv: 2, gear: ['knife', 'hidevest', 'wicker'] },
  { start: 'V', ground: 'marsh', lv: 5, gear: ['ironblade', 'ringcoat', 'buckler'] },
  { start: 'F', ground: 'snow', lv: 8, gear: ['frostbrand', 'scalecoat', 'kite'] },
  { start: 'H', ground: 'ruins', lv: 11, gear: ['frostbrand', 'scalecoat', 'kite'] },
];

/** The ground a demo's fight should be on. */
export const demoGround = (seed: number) => SHOWCASE[seed % SHOWCASE.length].ground;

/** A demo journey: the seed picks the region, with the beacons before it lit (and every other time round, its own). */
export function demoJourney(seed: number, sites: Record<string, Point>): Journey {
  const i = seed % SHOWCASE.length, s = SHOWCASE[i], j = newJourney(), h = j.hero;
  h.lv = s.lv;
  h.xp = LEVELS[s.lv - 1][5];
  h.gear = { weapon: s.gear[0], armour: s.gear[1], shield: s.gear[2] };
  h.items = { herb: 3 };
  h.gold = 60 * (i + 1);
  h.hp = maxHp(h);
  h.mp = maxMp(h);
  j.lit = [0, 1, 2, 3].map((k) => k < i + (Math.floor(seed / SHOWCASE.length) % 2));
  j.area = 'world';
  j.at = { ...sites[s.start] };
  return j;
}

/**
 * A walk of 8 to 13 steps to ground where creatures roam (`want`'s, if there's any in reach), never across a site (a
 * town or dungeon would take the hero inside). Empty if there's nowhere to go.
 */
export function demoRoute(map: WorldMap, from: Point, lit: readonly boolean[], rand: () => number, want?: Ground): Point[] {
  const litCount = lit.filter(Boolean).length, key = (x: number, y: number) => y * map.w + x, start = key(from.x, from.y);
  const prev = new Map<number, number>([[start, -1]]), depth = new Map<number, number>([[start, 0]]);
  const queue = [start], ends: number[] = [];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i], cx = cur % map.w, cy = Math.floor(cur / map.w), d = depth.get(cur)!;
    if (d >= 8 && encounterOdds(map, cx, cy, lit) > 0) ends.push(cur);
    if (d >= 13) continue;
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = cx + dx, ny = cy + dy, n = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || prev.has(n) || !walkable(map, nx, ny, litCount) || SITES[tileAt(map, nx, ny)]) continue;
      prev.set(n, cur);
      depth.set(n, d + 1);
      queue.push(n);
    }
  }
  const wanted = ends.filter((c) => groundAt(map, c % map.w, Math.floor(c / map.w)) === want);
  const pick = wanted.length ? wanted : ends;
  if (!pick.length) return [];
  const out: Point[] = [];
  for (let c = pick[Math.floor(rand() * pick.length)]; c !== start; c = prev.get(c)!) out.push({ x: c % map.w, y: Math.floor(c / map.w) });
  return out.reverse();
}

/** The way from one tile to the next one beside it. */
export function dirTo(from: Point, to: Point): Dir {
  return to.x > from.x ? 'right' : to.x < from.x ? 'left' : to.y > from.y ? 'down' : 'up';
}

/** The creatures for a fight on this tile, from its ground's pool. */
export function demoFoes(map: WorldMap, at: Point, rand: () => number): { foes: CreatureId[]; ground: Ground } {
  const ground = groundAt(map, at.x, at.y), pool = POOLS[ground];
  return { foes: pool[Math.floor(rand() * pool.length)], ground };
}
