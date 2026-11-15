// Code-drawn tiles, baked to one canvas per map state. Ported from the concept sheet's mockup.
import { TILE } from './config';
import { isLit, rng, tileAt, type WorldMap } from './world';

export const PAL = {
  grass: '#5f9f45', grass2: '#4f8a3a', grass3: '#7dbb55', tree: '#2f6b3a', tree2: '#3f8a46', treeHi: '#6cb35a', trunk: '#6b4a2e',
  hill: '#79a64e', hill2: '#5a8a3c', rock: '#8a8174', rock2: '#5e574f', rockHi: '#b9b0a0', cap: '#f4f6ff',
  water: '#3b74c4', water2: '#5d95dd', water3: '#2c5aa6', road: '#caa56b', road2: '#b38d55',
  marsh: '#56693a', marsh2: '#3c5c55', reed: '#9aac52', snow: '#e8eef8', snow2: '#c9d5ea', ruin: '#9b8f7a', ruin2: '#7d725f', stone: '#c2bcae',
  sand: '#e3cf94', sand2: '#d2bb7c', wood: '#8a5a32', wood2: '#6b4423', roofRed: '#c2493d', roofBlue: '#3f6fb0', roofBlue2: '#2c4f86', roofWhite: '#eef3fb',
  wall: '#efe5cc', wallShade: '#c4b694', door: '#3a2a1e', smoke: '#d9d2c0', flag: '#f3b84a',
  gloam: '#2a1a40', gloam2: '#4a2f73', gloamHi: '#9d7be0', mouth: '#05030a', tower: '#2b2433',
} as const;

const LINKS = '=BCVFH1234';

function paintTile(g: CanvasRenderingContext2D, map: WorldMap, t: string, x: number, y: number) {
  const X = x * TILE, Y = y * TILE, r = rng(x * 7919 + y * 104729 + 17);
  const f = (c: string, a: number, b: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(X + a, Y + b, w, h); };
  const dots = (c: string, n: number, w = 1, h = 1) => { for (let i = 0; i < n; i++) f(c, Math.floor(r() * (16 - w)), Math.floor(r() * (16 - h)), w, h); };
  const grass = () => { f(PAL.grass, 0, 0, 16, 16); dots(PAL.grass2, 5, 2, 1); dots(PAL.grass3, 3); };
  switch (t) {
    case '.': grass(); break;
    case ',': grass(); for (const c of ['#f2d16b', '#f28fb0', '#ffffff', '#f2d16b']) dots(c, 1); break;
    case 'T': grass(); for (const [a, b] of [[1, 2], [8, 6]]) { f(PAL.trunk, a + 3, b + 6, 2, 3); f(PAL.tree, a, b, 8, 7); f(PAL.tree2, a + 1, b, 6, 6); f(PAL.treeHi, a + 2, b + 1, 2, 2); } break;
    case 'h': grass(); f(PAL.hill2, 1, 9, 14, 4); f(PAL.hill, 3, 6, 10, 5); f(PAL.grass3, 5, 6, 4, 1); break;
    case 'M':
      f(PAL.rock2, 0, 0, 16, 16);
      for (const [a, b] of [[0, 4], [6, 1]]) {
        for (let i = 0; i < 5; i++) f(PAL.rock, a + 4 - i, b + i * 2, (i + 1) * 2, 2);
        f(PAL.cap, a + 4, b, 2, 2); f(PAL.rockHi, a + 3, b + 3, 1, 3);
      }
      break;
    case '~': f(PAL.water, 0, 0, 16, 16); dots(PAL.water2, 3, 3, 1); dots(PAL.water3, 2, 2, 1); break;
    case '=': {
      grass();
      const link = (dx: number, dy: number) => LINKS.includes(tileAt(map, x + dx, y + dy));
      f(PAL.road, 5, 5, 6, 6);
      if (link(-1, 0)) f(PAL.road, 0, 5, 6, 6);
      if (link(1, 0)) f(PAL.road, 10, 5, 6, 6);
      if (link(0, -1)) f(PAL.road, 5, 0, 6, 6);
      if (link(0, 1)) f(PAL.road, 5, 10, 6, 6);
      f(PAL.road2, 6 + Math.floor(r() * 4), 6 + Math.floor(r() * 4), 1, 1);
      break;
    }
    case 'B': f(PAL.water, 0, 0, 16, 16); f(PAL.wood, 0, 3, 16, 10); for (let i = 0; i < 16; i += 4) f(PAL.wood2, i, 3, 1, 10); f(PAL.wood2, 0, 3, 16, 1); f(PAL.wood2, 0, 12, 16, 1); break;
    case 'm': f(PAL.marsh, 0, 0, 16, 16); f(PAL.marsh2, Math.floor(r() * 8), Math.floor(r() * 8) + 2, 7, 3); dots(PAL.reed, 4, 1, 3); break;
    case '*': f(PAL.snow, 0, 0, 16, 16); dots(PAL.snow2, 5, 2, 1); dots('#ffffff', 2); break;
    case 'r': f(PAL.ruin, 0, 0, 16, 16); dots(PAL.ruin2, 6, 2, 2); if (r() < 0.35) { f(PAL.stone, 6, 3, 4, 10); f(PAL.ruin2, 6, 3, 4, 1); f(PAL.rockHi, 7, 4, 1, 8); } break;
    case ':': f(PAL.sand, 0, 0, 16, 16); dots(PAL.sand2, 5, 2, 1); break;
    case 'x': f(PAL.gloam, 0, 0, 16, 16); dots(PAL.gloam2, 6, 3, 2); dots(PAL.gloamHi, 2); break;
    case 'C':
      grass(); f(PAL.wallShade, 1, 6, 14, 9); f(PAL.wall, 2, 6, 12, 8);
      for (const a of [0, 11]) { f(PAL.wall, a, 2, 5, 13); f(PAL.roofRed, a, 0, 5, 3); }
      f(PAL.roofRed, 5, 3, 6, 3); f(PAL.door, 7, 10, 2, 5); f(PAL.flag, 8, 0, 1, 3);
      break;
    case 'V': case 'F': {
      const snowy = t === 'F';
      if (snowy) f(PAL.snow, 0, 0, 16, 16); else grass();
      for (const [a, b] of [[1, 3], [8, 7]]) {
        f(PAL.wall, a, b + 3, 7, 5); f(snowy ? PAL.roofWhite : PAL.roofBlue, a - 1, b, 9, 4);
        f(snowy ? PAL.snow2 : PAL.roofBlue2, a - 1, b + 3, 9, 1); f(PAL.door, a + 3, b + 5, 2, 3);
      }
      break;
    }
    case 'H': grass(); f(PAL.wood, 3, 7, 10, 7); f(PAL.wood2, 2, 4, 12, 4); f(PAL.door, 7, 10, 2, 4); f(PAL.smoke, 10, 1, 2, 4); break;
    case '1': case '2': case '3': case '4': {
      const base = { 1: PAL.grass, 2: PAL.marsh, 3: PAL.snow, 4: PAL.ruin }[t];
      f(base, 0, 0, 16, 16); f(PAL.rock2, 4, 5, 8, 11); f(PAL.stone, 5, 5, 6, 10); f(PAL.rock2, 3, 3, 10, 3); f(PAL.rockHi, 6, 7, 1, 7); f(PAL.tower, 7, 11, 2, 4);
      break;
    }
    case 'G': f(PAL.gloam, 0, 0, 16, 16); f(PAL.mouth, 3, 5, 10, 11); f(PAL.gloam2, 2, 4, 12, 2); f(PAL.gloamHi, 7, 8, 2, 2); break;
    default: grass();
  }
}

/** The whole map as one canvas. Unlit regions are desaturated and tinted violet; the wall becomes rubble when all four burn. */
export function bakeMap(map: WorldMap, lit: readonly boolean[]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = map.w * TILE; c.height = map.h * TILE;
  const g = c.getContext('2d')!;
  const allLit = lit.every(Boolean);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    const t = map.grid[y][x];
    paintTile(g, map, t === 'x' && allLit ? 'r' : t, x, y);
  }
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
    if (isLit(map, x, y, lit)) continue;
    g.globalCompositeOperation = 'saturation';
    g.fillStyle = 'rgba(128,128,128,0.75)';
    g.fillRect(x * TILE, y * TILE, TILE, TILE);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(42,26,64,0.32)';
    g.fillRect(x * TILE, y * TILE, TILE, TILE);
  }
  return c;
}
