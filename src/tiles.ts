// Code-drawn tiles, baked to one canvas per map state. Ported from the concept sheet's mockup.
import { WIDTH, TILE, type Ground, type Tint } from './config';
import { isLit, rng, tileAt, type WorldMap } from './world';

export const PAL = {
  grass: '#5f9f45', grass2: '#4f8a3a', grass3: '#7dbb55', tree: '#2f6b3a', tree2: '#3f8a46', treeHi: '#6cb35a', trunk: '#6b4a2e',
  hill: '#79a64e', hill2: '#5a8a3c', rock: '#8a8174', rock2: '#5e574f', rockHi: '#b9b0a0', cap: '#f4f6ff',
  water: '#3b74c4', water2: '#5d95dd', water3: '#2c5aa6', road: '#caa56b', road2: '#b38d55',
  marsh: '#56693a', marsh2: '#3c5c55', reed: '#9aac52', snow: '#e8eef8', snow2: '#c9d5ea', ruin: '#9b8f7a', ruin2: '#7d725f', stone: '#c2bcae',
  sand: '#e3cf94', sand2: '#d2bb7c', wood: '#8a5a32', wood2: '#6b4423', roofRed: '#c2493d', roofBlue: '#3f6fb0', roofBlue2: '#2c4f86', roofWhite: '#eef3fb',
  wall: '#efe5cc', wallShade: '#c4b694', door: '#3a2a1e', smoke: '#d9d2c0', flag: '#f3b84a',
  gloam: '#2a1a40', gloam2: '#4a2f73', gloamHi: '#9d7be0', mouth: '#05030a', tower: '#2b2433',
  cobble: '#a69c8a', cobble2: '#8a8172', cobbleHi: '#c2b9a6', floor: '#b07a4a', floor2: '#94633a', carpet: '#a8323a', carpet2: '#c9464b',
  stoneWall: '#7a7486', stoneWall2: '#5c5768', stoneTop: '#a29cb0', counter: '#7a4e2a', counterTop: '#b07f4c', sheet: '#e8e4d8',
  blanket: '#3f6fb0', altar: '#d8d0e8', altar2: '#a89fc0', iron: '#3c3a44', ironHi: '#6a6878', pot: '#9a5a3a', pot2: '#73412a',
  gilt: '#d9b03c', gilt2: '#9e7a22', pane: '#9fc4e8', candle: '#f3e3b0',
} as const;

const LINKS = '=BCVFH1234';

/** Dungeon colours by ground: walls, their top edge, floor, its seams, and a fleck (lichen, rime, bones). */
const DEEP: Partial<Record<Ground, { wall: string; wall2: string; top: string; floor: string; seam: string; fleck: string }>> = {
  barrow: { wall: '#4a3a2c', wall2: '#33281e', top: '#6b5640', floor: '#6e5c48', seam: '#5a4a3a', fleck: '#cfc6b0' },
  belfry: { wall: '#3e5250', wall2: '#2b3a39', top: '#5d7a6a', floor: '#55665c', seam: '#45544c', fleck: '#7fae5e' },
  spire: { wall: '#4e6488', wall2: '#36486a', top: '#a9c4e8', floor: '#7d90b0', seam: '#677a9a', fleck: '#e8eef8' },
  keep: { wall: '#5a4650', wall2: '#3e3038', top: '#7d6670', floor: '#6c5a5e', seam: '#5a4a4e', fleck: '#a8323a' },
};

function paintDungeon(g: CanvasRenderingContext2D, map: WorldMap, t: string, x: number, y: number) {
  const X = x * TILE, Y = y * TILE, r = rng(x * 7919 + y * 104729 + 31), P = DEEP[map.ground!] ?? DEEP.barrow!;
  const f = (c: string, a: number, b: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(X + a, Y + b, w, h); };
  const floor = () => {
    f(P.floor, 0, 0, 16, 16);
    f(P.seam, 0, 7, 16, 1); f(P.seam, 0, 15, 16, 1); f(P.seam, (y % 2) * 8 + 3, 0, 1, 7); f(P.seam, (y % 2) * 8 + 11, 8, 1, 7);
  };
  const wallAt = (wx: number, wy: number) => '#*'.includes(tileAt(map, wx, wy));
  switch (t) {
    case '#': case '*': {
      const ice = t === '*';
      f(ice ? '#2a3a5c' : P.wall2, 0, 0, 16, 16);
      // Ice: dark blue blocks with pale glints. Stone: courses of brick.
      if (ice) { f('#3e5784', 1, 1, 14, 6); f('#3e5784', 1, 8, 14, 6); f('#8fb0dc', 2 + Math.floor(r() * 9), 2, 1, 4); f('#cfe0f6', 3 + Math.floor(r() * 9), 9, 2, 1); }
      else for (let b = 0; b < 16; b += 5) { f(P.wall, 0, b, 16, 4); f(P.wall2, (b / 5) % 2 ? 4 : 10, b, 1, 4); }
      // A lit top edge where the wall meets open floor below it.
      if (!wallAt(x, y + 1)) { f(ice ? '#a9c4e8' : P.top, 0, 13, 16, 3); f(ice ? '#2a3a5c' : P.wall2, 0, 15, 16, 1); }
      break;
    }
    case ',': floor(); for (let i = 0; i < 3; i++) f(P.fleck, Math.floor(r() * 13), Math.floor(r() * 13), 2 + Math.floor(r() * 2), 1); break;
    case '<': case '>': {
      floor();
      // Steps: up toward the light, down into the dark.
      const up = t === '<';
      for (let i = 0; i < 4; i++) {
        const shade = up ? 4 - i : i + 1;
        f(['#d8d0c0', '#b0a690', '#8a806c', '#625a4c', '#3a342c'][shade], 2, 2 + i * 3, 12, 3);
      }
      f(P.wall2, 1, 1, 1, 14); f(P.wall2, 14, 1, 1, 14);
      break;
    }
    case '|':
      floor();
      f(PAL.wood2, 2, 0, 12, 16); f(PAL.wood, 3, 1, 10, 15);
      f(PAL.iron, 2, 3, 12, 2); f(PAL.iron, 2, 11, 12, 2); f(PAL.gilt, 7, 7, 2, 3); f(PAL.door, 7, 9, 2, 1);
      break;
    case '~': f('#1d3550', 0, 0, 16, 16); f('#2c4f75', Math.floor(r() * 10), 4 + Math.floor(r() * 8), 5, 1); f('#2c4f75', Math.floor(r() * 10), Math.floor(r() * 12), 3, 1); break;
    case 'B': f('#1d3550', 0, 0, 16, 16); f(PAL.wood2, 1, 0, 14, 16); for (let b = 1; b < 16; b += 4) f(PAL.wood, 1, b, 14, 3); break;
    case '+': floor(); f(P.wall2, 3, 3, 10, 13); f(P.wall, 4, 2, 8, 13); f(P.top, 4, 2, 8, 2); f(P.wall2, 3, 14, 10, 2); break;
    default: floor();
  }
}

function paintTile(g: CanvasRenderingContext2D, map: WorldMap, t: string, x: number, y: number) {
  if (map.kind === 'dungeon') { paintDungeon(g, map, t, x, y); return; }
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
    // ---- Town tiles ----
    case 'P':
      f(PAL.snow, 0, 0, 16, 16); dots(PAL.snow2, 3, 2, 1);
      f(PAL.trunk, 7, 12, 2, 3); f(PAL.tree, 3, 7, 10, 5); f(PAL.tree, 5, 3, 6, 5); f(PAL.tree2, 7, 1, 2, 3); f(PAL.cap, 4, 7, 4, 1); f(PAL.cap, 6, 3, 3, 1);
      break;
    case 'o':
      f(PAL.cobble, 0, 0, 16, 16);
      for (let b = 0; b < 16; b += 4) { f(PAL.cobble2, 0, b + 3, 16, 1); for (let a = (b / 4) % 2 ? 2 : 6; a < 16; a += 8) f(PAL.cobble2, a, b, 1, 3); }
      dots(PAL.cobbleHi, 3);
      break;
    case 'f': f(PAL.floor, 0, 0, 16, 16); for (let b = 3; b < 16; b += 4) f(PAL.floor2, 0, b, 16, 1); f(PAL.floor2, 5, 0, 1, 3); f(PAL.floor2, 11, 4, 1, 3); f(PAL.floor2, 3, 8, 1, 3); f(PAL.floor2, 9, 12, 1, 3); break;
    case 'c': f(PAL.carpet, 0, 0, 16, 16); f(PAL.gilt, 1, 0, 1, 16); f(PAL.gilt, 14, 0, 1, 16); f(PAL.carpet2, 4, 0, 8, 16); break;
    case '#':
      f(PAL.stoneWall, 0, 0, 16, 16);
      for (let b = 0; b < 16; b += 5) { f(PAL.stoneWall2, 0, b + 4, 16, 1); for (let a = (b / 5) % 2 ? 3 : 8; a < 16; a += 10) f(PAL.stoneWall2, a, b, 1, 4); }
      f(PAL.stoneTop, 0, 0, 16, 2);
      break;
    case 'k': f(PAL.floor, 0, 0, 16, 16); f(PAL.counter, 0, 4, 16, 11); f(PAL.counterTop, 0, 3, 16, 3); f(PAL.floor2, 0, 14, 16, 1); break;
    case 'b': f(PAL.floor, 0, 0, 16, 16); f(PAL.wood2, 2, 1, 12, 14); f(PAL.sheet, 3, 2, 10, 4); f(PAL.blanket, 3, 6, 10, 8); f(PAL.roofBlue2, 3, 6, 10, 1); break;
    case 'a': f(PAL.floor, 0, 0, 16, 16); f(PAL.altar2, 1, 6, 14, 9); f(PAL.altar, 1, 5, 14, 3); f(PAL.candle, 3, 1, 2, 4); f(PAL.candle, 11, 1, 2, 4); f('#ffffff', 3, 0, 2, 1); f('#ffffff', 11, 0, 2, 1); break;
    case 'n': f(PAL.floor, 0, 0, 16, 16); f(PAL.wood2, 5, 9, 6, 6); f(PAL.iron, 2, 4, 12, 5); f(PAL.iron, 0, 4, 3, 2); f(PAL.ironHi, 3, 4, 10, 1); break;
    case 'p': f(PAL.floor, 0, 0, 16, 16); for (const [a, b] of [[1, 2], [8, 5], [3, 9]]) { f(PAL.pot2, a, b + 1, 6, 6); f(PAL.pot, a + 1, b, 4, 6); f(PAL.wood2, a + 2, b - 1, 2, 1); } break;
    case 'q': f(PAL.carpet, 0, 0, 16, 16); f(PAL.gilt2, 2, 2, 12, 13); f(PAL.gilt, 3, 1, 10, 10); f(PAL.carpet2, 5, 3, 6, 7); f(PAL.gilt, 2, 10, 12, 3); break;
    case 'U': case 'W': {
      const snowy = t === 'W';
      f(snowy ? PAL.roofWhite : PAL.roofBlue, 0, 0, 16, 16);
      for (let b = 3; b < 16; b += 4) f(snowy ? PAL.snow2 : PAL.roofBlue2, 0, b, 16, 1);
      break;
    }
    case 'w': f(PAL.wall, 0, 0, 16, 16); f(PAL.wallShade, 0, 0, 16, 2); f(PAL.wood2, 4, 5, 8, 6); f(PAL.pane, 5, 6, 6, 4); f(PAL.wood2, 7, 6, 1, 4); break;
    case 'd': f(PAL.wall, 0, 0, 16, 16); f(PAL.wallShade, 0, 0, 16, 2); f(PAL.door, 4, 4, 8, 12); f(PAL.wood, 5, 5, 6, 11); f(PAL.gilt, 9, 10, 1, 1); break;
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

// ---- Battle backdrops: sky bands, two ridges and the ground, per battle ground ----

const BACKS: Record<Ground, { sky: [string, string, string]; far: string; near: string; ground: string; fleck: string }> = {
  meadow: { sky: ['#86c3ec', '#a2d3f0', '#c3e4f2'], far: '#86b56f', near: '#5f9f45', ground: '#4f8a3a', fleck: '#7dbb55' },
  hills: { sky: ['#8cbfe0', '#a8cfe6', '#c6dfe9'], far: '#6d9a54', near: '#79a64e', ground: '#5a8a3c', fleck: '#8fbd5e' },
  marsh: { sky: ['#7f9b9a', '#93aba5', '#a9bdb0'], far: '#5b6e4a', near: '#4d5f38', ground: '#3c4d2e', fleck: '#9aac52' },
  snow: { sky: ['#9fb6d9', '#b8cae5', '#d3def0'], far: '#f2f6fc', near: '#d9e2f1', ground: '#e8eef8', fleck: '#c9d5ea' },
  ruins: { sky: ['#c9a27a', '#d8b48a', '#e6c89c'], far: '#8a7f6c', near: '#9b8f7a', ground: '#7d725f', fleck: '#b8b2a4' },
  barrow: { sky: ['#140f0c', '#1c1510', '#241b14'], far: '#33271c', near: '#3f3022', ground: '#2e2319', fleck: '#5c4a36' },
  belfry: { sky: ['#0c1416', '#111c1e', '#172527'], far: '#1f3232', near: '#2a403c', ground: '#1d2f2c', fleck: '#4f7a5a' },
  spire: { sky: ['#0e1424', '#141c30', '#1b253c'], far: '#2c3a58', near: '#3b4d70', ground: '#2a3654', fleck: '#9fb6d9' },
  keep: { sky: ['#140c10', '#1c1116', '#24161c'], far: '#352630', near: '#43303a', ground: '#2e2028', fleck: '#7a5260' },
  hollow: { sky: ['#0d0716', '#160c24', '#1f1033'], far: '#2a1a40', near: '#3a2458', ground: '#24163a', fleck: '#9d7be0' },
};
export const BACKDROP_H = 150;
const UNDERGROUND = new Set<Ground>(['barrow', 'belfry', 'spire', 'keep', 'hollow']);

/** A battle backdrop, WIDTH x BACKDROP_H. Under a cold beacon it's drawn grey and violet like the map. */
export function bakeBackdrop(kind: Ground, dim: boolean): HTMLCanvasElement {
  const W = WIDTH, P = BACKS[kind], c = document.createElement('canvas');
  c.width = W; c.height = BACKDROP_H;
  const g = c.getContext('2d')!, r = rng(kind.length * 31 + 7);
  P.sky.forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 30, W, 31); });
  g.fillStyle = P.sky[2]; g.fillRect(0, 90, W, 30);
  const ridge = (col: string, base: number, amp: number, step: number) => {
    g.fillStyle = col;
    let h = amp / 2;
    for (let x = 0; x < W; x += step) { h = Math.min(amp, Math.max(4, h + (r() - 0.5) * amp * 0.6)); g.fillRect(x, base - h, step, BACKDROP_H); }
  };
  ridge(P.far, 92, kind === 'snow' ? 46 : 30, 8);
  ridge(P.near, 112, 18, 6);
  g.fillStyle = P.ground; g.fillRect(0, 118, W, 32);
  g.fillStyle = P.fleck; for (let i = 0; i < 70; i++) g.fillRect(Math.floor(r() * W), 120 + Math.floor(r() * 28), 2, 1);
  if (kind === 'marsh') { g.fillStyle = '#3c5c55'; for (let i = 0; i < 6; i++) g.fillRect(Math.floor(r() * W), 124 + Math.floor(r() * 20), 18 + Math.floor(r() * 20), 3); }
  if (kind === 'ruins') for (const x of [30, 150, 380]) {
    const hh = 24 + Math.floor(r() * 30);
    g.fillStyle = '#c2bcae'; g.fillRect(x, 118 - hh, 10, hh);
    g.fillStyle = '#7d725f'; g.fillRect(x, 118 - hh, 10, 2);
  }
  if (UNDERGROUND.has(kind)) {
    g.fillStyle = '#0c0a10';
    for (let x = 0; x < W; x += 14) { const hh = 6 + Math.floor(r() * 18); g.fillRect(x, 0, 6, hh); g.fillRect(x + 2, hh, 2, 4); }
  }
  if (kind === 'meadow' || kind === 'hills') { g.fillStyle = '#ffffff'; for (const [x, y] of [[60, 18], [250, 30], [340, 12]]) { g.fillRect(x, y, 28, 5); g.fillRect(x + 6, y - 3, 14, 3); } }
  if (dim) {
    g.globalCompositeOperation = 'saturation'; g.fillStyle = 'rgba(128,128,128,0.7)'; g.fillRect(0, 0, W, BACKDROP_H);
    g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(42,26,64,0.3)'; g.fillRect(0, 0, W, BACKDROP_H);
  }
  return c;
}

// ---- Kin: recoloured base creatures (hue turn, saturation and lightness), baked once at load ----

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

/** A recoloured copy of a loaded sprite image. */
export function tintImage(src: CanvasImageSource & { width: number; height: number }, tint: Tint): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  for (let i = 0; i < d.data.length; i += 4) {
    if (!d.data[i + 3]) continue;
    const [h, s, l] = rgbToHsl(d.data[i], d.data[i + 1], d.data[i + 2]);
    const [r, gg, b] = hslToRgb((h + tint.hue / 360 + 1) % 1, clamp(s * (tint.sat ?? 1)), clamp(l * (tint.light ?? 1)));
    d.data[i] = r; d.data[i + 1] = gg; d.data[i + 2] = b;
  }
  g.putImageData(d, 0, 0);
  return c;
}
