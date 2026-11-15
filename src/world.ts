// Grid rules for maps. Pure: no Phaser, so tests import it straight from the dev server.
import { HOLLOW_CORNER, OVERWORLD, SITES, TERRAIN_REGION } from './data/maps';

export interface Point { x: number; y: number }

export interface WorldMap {
  w: number;
  h: number;
  /** grid[y][x]: one character per tile. */
  grid: string[][];
  /** Where each site character sits. */
  sites: Record<string, Point>;
  /** Region per tile: 0-3 for the beacons, -1 for the Hollow's corner. */
  region: number[][];
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
  return { w, h, grid, sites, region };
}

export const tileAt = (map: WorldMap, x: number, y: number) => map.grid[y]?.[x] ?? 'M';

/** Mountains and water block; the Gloam wall blocks until all four beacons burn. */
export function walkable(map: WorldMap, x: number, y: number, litCount: number) {
  const t = tileAt(map, x, y);
  if (t === 'x') return litCount >= 4;
  return t !== 'M' && t !== '~';
}

/** Whether a tile shows as lit: its region's beacon burns (the Hollow's corner needs all four). */
export function isLit(map: WorldMap, x: number, y: number, lit: readonly boolean[]) {
  const r = map.region[y]?.[x] ?? 0;
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
