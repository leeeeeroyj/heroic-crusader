// Every tunable in one place. No Phaser imports, so pure modules and tests can load it straight from the dev server.

export const WIDTH = 416;
export const HEIGHT = 228;
export const TILE = 16;

/**
 * The canvas renders at this multiple of the design size. Game scenes zoom their cameras by it, and the HUD scene
 * zooms by half as much, so native 16 px sprites show at half size there without being shrunk.
 */
export const RENDER_SCALE = 4;
export const HUD_SCALE = RENDER_SCALE / 2;

export const FONT = 'Silkscreen, monospace';

/** Seconds per tile step on the map. Holding a direction keeps walking. */
export const STEP_TIME = 0.17;
/** Minimum gap between bump sounds when walking into a wall. */
export const BUMP_EVERY = 0.25;

export const HERO = {
  name: 'WREN',
  /** Where a new journey starts: a site key from data/maps.ts. */
  home: 'C',
  gold: 20,
} as const;

/**
 * Level table: level, max HP, max MP, strength, resilience, Valor needed to reach it.
 * A first pass from the concept sheet; the balance pass tunes it.
 */
export const LEVELS: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [1, 15, 0, 5, 3, 0], [2, 22, 4, 7, 4, 7], [3, 28, 8, 9, 6, 23], [4, 34, 12, 12, 7, 47], [5, 40, 16, 15, 9, 110],
  [6, 47, 20, 18, 11, 220], [7, 54, 25, 21, 13, 400], [8, 61, 30, 24, 15, 650], [9, 68, 35, 28, 17, 1000], [10, 76, 40, 32, 19, 1500],
  [11, 84, 45, 36, 21, 2200], [12, 92, 50, 40, 23, 3100], [13, 100, 55, 44, 25, 4300], [14, 110, 62, 48, 27, 5800], [15, 120, 70, 52, 30, 7800],
];

export const REGION_NAMES = ['Meadow', 'Marsh', 'Snow', 'Ruins'] as const;

/** Every sprite exported by tools/sprites.py. */
export const SPRITES = [
  'player', 'villager', 'merchant', 'healer', 'queen',
  'hare', 'puffcap', 'crow', 'toad', 'wisp', 'bat', 'wolf', 'rustguard', 'golem',
  'warden_meadow', 'warden_marsh', 'warden_snow', 'warden_ruin', 'gloam',
  'chest', 'beacon', 'herb', 'coin', 'key',
] as const;
export type SpriteKey = (typeof SPRITES)[number];
/** Sprites whose art faces left: flipped to face right at rest. */
export const MIRROR: ReadonlySet<SpriteKey> = new Set(['player']);

/** Registry key for the HUD's state, written by the world scene each frame. */
export const HUD_STATE = 'hud';

export const COLORS = {
  night: 0x10142a,
  panel: 0x141a33,
  trim: 0xe9d9a6,
  trim2: 0x6b5a2e,
  ink: 0xf1e9d4,
  dim: 0xa7a5c2,
  gold: 0xf3b84a,
  ember: 0xff7a3d,
  ashes: 0x5b5670,
  ashes2: 0x3c3850,
} as const;
export const TEXT = {
  ink: '#f1e9d4',
  dim: '#a7a5c2',
  gold: '#f3b84a',
  gloam: '#9d7be0',
  leaf: '#8fd07a',
  hurt: '#ff6b5e',
} as const;
