// Grid rules for maps. Pure: no Phaser, so tests import it straight from the dev server.
import { ENCOUNTER, POOLS, type CreatureId, type Ground } from './config';
import { DUNGEONS, floorArea } from './data/dungeons';
import { HOLLOW_CORNER, OVERWORLD, SITES, TERRAIN_REGION, TOWNS } from './data/maps';

export interface Point { x: number; y: number }

export interface WorldMap {
  /** The overworld, a town (no fights; walk out of the bottom to leave) or a dungeon floor (dark). */
  kind: 'world' | 'town' | 'dungeon';
  w: number;
  h: number;
  /** grid[y][x]: one character per tile. */
  grid: string[][];
  /** Where each site character sits. */
  sites: Record<string, Point>;
  /** Region per tile: 0-3 for the beacons, -1 for the Hollow's corner, -2 underground (never greyed). */
  region: number[][];
  /** Dungeon floors: the dungeon's site key, the floor, and its battle ground. */
  site?: string;
  floor?: number;
  ground?: Ground;
}

/** Seeded random numbers (mulberry32). */
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
export type Dir = keyof typeof DIRS;

/** Builds the overworld: pads rows, gives diagonal road steps a corner tile, finds sites and assigns regions. */
export function buildOverworld(): WorldMap {
  const w = Math.max(...OVERWORLD.map((r) => r.length)), h = OVERWORLD.length;
  const grid = OVERWORLD.map((r) => (r + 'M'.repeat(w)).slice(0, w).split(''));
  const at = (x: number, y: number) => grid[y]?.[x] ?? 'M';
  const road = (x: number, y: number) => '=B'.includes(at(x, y));
  const open = (x: number, y: number) => '.,:hT*mr'.includes(at(x, y));
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (grid[y][x] !== '=') continue;
    for (const dx of [1, -1]) {
      if (!road(x + dx, y + 1) || road(x + dx, y) || road(x, y + 1)) continue;
      if (open(x + dx, y)) grid[y][x + dx] = '=';
      else if (open(x, y + 1)) grid[y + 1][x] = '=';
    }
  }
  const sites: Record<string, Point> = {};
  grid.forEach((row, y) => row.forEach((t, x) => { if (SITES[t]) sites[t] = { x, y }; }));
  const beacons = ['1', '2', '3', '4'].map((k) => sites[k]);
  const region = grid.map((row, y) => row.map((t, x) => {
    if (x >= HOLLOW_CORNER.x && y <= HOLLOW_CORNER.y) return -1;
    if (t in TERRAIN_REGION) return TERRAIN_REGION[t];
    let best = 0, bd = Infinity;
    beacons.forEach((b, i) => { const d = Math.abs(b.x - x) + Math.abs(b.y - y) * 1.2; if (d < bd) { bd = d; best = i; } });
    return best;
  }));
  return { kind: 'world', w, h, grid, sites, region };
}

/** Builds a town's map: its grid, and its region's beacon for every tile. */
export function buildTown(key: string): WorldMap {
  const t = TOWNS[key], grid = t.map.map((r) => r.split(''));
  return { kind: 'town', w: grid[0].length, h: grid.length, grid, sites: {}, region: grid.map((r) => r.map(() => t.region)) };
}

/**
 * Builds one dungeon floor. `opened` lists the chests and doors already opened (as `area:x,y`): they become floor.
 * The warden's tile becomes floor too; its spot is kept in `sites.W` (the scene stands the warden there until the
 * beacon burns). `sites` also holds the stairs, '<' and '>'.
 */
export function buildDungeon(site: string, floor: number, opened: readonly string[] = []): WorldMap {
  const d = DUNGEONS[site], area = floorArea(site, floor), grid = d.floors[floor].map((r) => r.split(''));
  const sites: Record<string, Point> = {};
  grid.forEach((row, y) => row.forEach((t, x) => {
    if ('<>W'.includes(t)) sites[t] = { x, y };
    if (t === 'W' || ('$|'.includes(t) && opened.includes(`${area}:${x},${y}`))) row[x] = '.';
  }));
  return { kind: 'dungeon', w: grid[0].length, h: grid.length, grid, sites, region: grid.map((r) => r.map(() => -2)), site, floor, ground: d.ground };
}

/** The chests on a dungeon floor, in reading order, with what each holds; opened ones are left out. */
export function chestsOn(map: WorldMap, opened: readonly string[]) {
  if (map.kind !== 'dungeon') return [];
  const d = DUNGEONS[map.site!], area = floorArea(map.site!, map.floor!), out: Array<{ x: number; y: number; id: string; loot: (typeof d.loot)[number][number] }> = [];
  let i = 0;
  d.floors[map.floor!].forEach((row, y) => row.split('').forEach((t, x) => {
    if (t !== '$') return;
    const id = `${area}:${x},${y}`;
    if (!opened.includes(id)) out.push({ x, y, id, loot: d.loot[map.floor!][i] });
    i++;
  }));
  return out;
}

/** Where the hero stands on arriving by a stairway: the first open tile beside it (below, above, right, left). */
export function besideStairs(map: WorldMap, stairs: Point): Point {
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const x = stairs.x + dx, y = stairs.y + dy;
    if ('.,B'.includes(tileAt(map, x, y))) return { x, y };
  }
  return stairs;
}

/** Town ground you can walk on; everything else (walls, counters, roofs, trees, water, furniture) blocks. */
const TOWN_WALK = '.,*mofcB';
/** Dungeon floor, stairs and planks; walls, water, pillars, chests, locked doors and the brazier block. */
const DUNGEON_WALK = '.,<>B';

export const tileAt = (map: WorldMap, x: number, y: number) => map.grid[y]?.[x] ?? 'M';

/** Mountains and water block; the Gloam wall blocks until all four beacons burn. In towns, only open ground. */
export function walkable(map: WorldMap, x: number, y: number, litCount: number) {
  const t = tileAt(map, x, y);
  if (map.kind === 'town') return TOWN_WALK.includes(t);
  if (map.kind === 'dungeon') return DUNGEON_WALK.includes(t);
  if (t === 'x') return litCount >= 4;
  return t !== 'M' && t !== '~';
}

/** Whether a tile shows as lit: its region's beacon burns (the Hollow's corner needs all four). */
export function isLit(map: WorldMap, x: number, y: number, lit: readonly boolean[]) {
  const r = map.region[y]?.[x] ?? 0;
  if (r === -2) return true;
  return r === -1 ? lit.every(Boolean) : Boolean(lit[r]);
}

/** Shortest 4-way path from `from` to `to` (excluding `from`), or [] when there is none. */
export function bfs(map: WorldMap, from: Point, to: Point, litCount: number): Point[] {
  const key = (x: number, y: number) => y * map.w + x;
  const prev = new Map<number, number>([[key(from.x, from.y), -1]]);
  const queue = [key(from.x, from.y)], goal = key(to.x, to.y);
  for (let i = 0; i < queue.length && !prev.has(goal); i++) {
    const cur = queue[i], cx = cur % map.w, cy = Math.floor(cur / map.w);
    for (const [dx, dy] of Object.values(DIRS)) {
      const nx = cx + dx, ny = cy + dy, n = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h || prev.has(n) || !walkable(map, nx, ny, litCount)) continue;
      prev.set(n, cur);
      queue.push(n);
    }
  }
  if (!prev.has(goal)) return [];
  const out: Point[] = [];
  for (let c = goal; c !== key(from.x, from.y); c = prev.get(c)!) out.push({ x: c % map.w, y: Math.floor(c / map.w) });
  return out.reverse();
}

const TILE_GROUND: Record<string, Ground> = { m: 'marsh', '*': 'snow', r: 'ruins', h: 'hills' };

/**
 * The battle ground under a tile, which picks the backdrop and the encounter pool. It goes by the ground itself, not
 * the region: grass, forest and roads are meadow anywhere (some ruins-region grass is three steps from Brightkeep),
 * so danger rises as the hero steps onto marsh, snow, hills and rubble.
 */
export function groundAt(map: WorldMap, x: number, y: number): Ground {
  if (map.ground) return map.ground;
  return TILE_GROUND[tileAt(map, x, y)] ?? 'meadow';
}

/**
 * Chance of a fight on this tile per step: none in towns, on sites or in the Hollow's corner, a third less where the
 * beacon burns; dungeon floors have their own odds (none on the stairs).
 */
export function encounterOdds(map: WorldMap, x: number, y: number, lit: readonly boolean[]): number {
  if (map.kind === 'town') return 0;
  if (map.kind === 'dungeon') return '.,'.includes(tileAt(map, x, y)) ? ENCOUNTER.dungeon : 0;
  const odds = ENCOUNTER.odds[tileAt(map, x, y)] ?? 0;
  const r = map.region[y]?.[x] ?? 0;
  if (r < 0) return 0;
  return lit[r] ? odds * ENCOUNTER.litFactor : odds;
}

/** Rolls for a fight after a step. Never within the grace steps of the last one. */
export function rollEncounter(map: WorldMap, x: number, y: number, lit: readonly boolean[], sinceFight: number, rand: () => number):
  { ground: Ground; foes: CreatureId[] } | null {
  if (sinceFight <= ENCOUNTER.grace || rand() >= encounterOdds(map, x, y, lit)) return null;
  const ground = groundAt(map, x, y), pool = POOLS[ground];
  return { ground, foes: pool[Math.floor(rand() * pool.length)] };
}
