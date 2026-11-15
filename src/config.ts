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
  /** Agility is this plus the level. */
  agility: 6,
} as const;

/** Equipment: what each piece adds to attack (weapons) or defence (armour, shields). Shops arrive with the towns. */
export const GEAR = {
  stick: { slot: 'weapon', name: 'Oak Stick', power: 4 },
  tunic: { slot: 'armour', name: 'Quilted Tunic', power: 2 },
} as const;
export type GearId = keyof typeof GEAR;
export const START_GEAR: { weapon: GearId | null; armour: GearId | null; shield: GearId | null } = { weapon: 'stick', armour: 'tunic', shield: null };

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
/** Sprites whose art faces left (checked by eye, 2026-11-15); the rest face right or the viewer. */
export const MIRROR: ReadonlySet<SpriteKey> = new Set(['player', 'crow', 'toad', 'rustguard']);

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

// ---- Creatures and encounters ----

/** A recolour of a base sprite (hue turn in degrees, saturation and lightness multipliers), baked at load. */
export interface Tint { hue: number; sat?: number; light?: number }

export interface CreatureDef {
  name: string;
  slot: SpriteKey;
  tint?: Tint;
  hp: number;
  atk: number;
  def: number;
  agi: number;
  /** Valor and gold for freeing it. */
  xp: number;
  gold: number;
}

/**
 * First-pass numbers from the concept sheet; the balance pass tunes them. Traits arrive with the full roster.
 * Meadow and hills creatures were softened (2026-11-15) so a LV 1 hero wins about 19 fights in 20 without Valor.
 */
export const CREATURES = {
  thornhare: { name: 'Thornhare', slot: 'hare', hp: 5, atk: 7, def: 3, agi: 12, xp: 1, gold: 2 },
  rook: { name: 'Rook', slot: 'crow', hp: 6, atk: 8, def: 4, agi: 10, xp: 2, gold: 3 },
  puffcap: { name: 'Puffcap', slot: 'puffcap', hp: 9, atk: 8, def: 6, agi: 3, xp: 3, gold: 4 },
  duskbat: { name: 'Duskbat', slot: 'bat', hp: 10, atk: 11, def: 6, agi: 14, xp: 4, gold: 5 },
  bogtoad: { name: 'Bogtoad', slot: 'toad', hp: 24, atk: 22, def: 14, agi: 4, xp: 9, gold: 10 },
  marshwisp: { name: 'Marshwisp', slot: 'wisp', hp: 16, atk: 18, def: 12, agi: 18, xp: 10, gold: 12 },
  rotcap: { name: 'Rotcap', slot: 'puffcap', tint: { hue: 95, sat: 0.9, light: 0.9 }, hp: 20, atk: 20, def: 14, agi: 5, xp: 11, gold: 12 },
  frostfang: { name: 'Frostfang', slot: 'wolf', hp: 30, atk: 32, def: 20, agi: 16, xp: 18, gold: 20 },
  rimehare: { name: 'Rimehare', slot: 'hare', tint: { hue: 190, sat: 0.6, light: 1.1 }, hp: 22, atk: 30, def: 18, agi: 22, xp: 16, gold: 15 },
  frostwisp: { name: 'Frostwisp', slot: 'wisp', tint: { hue: 90, sat: 0.6, light: 1.2 }, hp: 26, atk: 26, def: 22, agi: 20, xp: 20, gold: 22 },
  rustguard: { name: 'Rustguard', slot: 'rustguard', hp: 40, atk: 42, def: 40, agi: 8, xp: 30, gold: 35 },
  cairn: { name: 'Cairn', slot: 'golem', hp: 60, atk: 46, def: 34, agi: 4, xp: 34, gold: 30 },
  gloombat: { name: 'Gloombat', slot: 'bat', tint: { hue: 250, sat: 0.9, light: 0.85 }, hp: 30, atk: 40, def: 26, agi: 24, xp: 24, gold: 25 },
} as const satisfies Record<string, CreatureDef>;
export type CreatureId = keyof typeof CREATURES;

/** Battle grounds: the backdrop and the encounter pool. Meadow hills have their own. */
export const GROUNDS = ['meadow', 'hills', 'marsh', 'snow', 'ruins'] as const;
export type Ground = (typeof GROUNDS)[number];

/** What can jump out on each ground: one group is picked at random. */
export const POOLS: Record<Ground, CreatureId[][]> = {
  meadow: [['thornhare'], ['rook'], ['puffcap'], ['thornhare', 'thornhare'], ['rook', 'thornhare'], ['puffcap', 'rook']],
  hills: [['rook', 'rook'], ['puffcap'], ['duskbat', 'duskbat']],
  marsh: [['bogtoad'], ['marshwisp'], ['rotcap'], ['bogtoad', 'marshwisp'], ['puffcap', 'rotcap']],
  snow: [['frostfang'], ['rimehare'], ['frostwisp'], ['frostfang', 'rimehare']],
  ruins: [['rustguard'], ['cairn'], ['gloombat', 'gloombat'], ['rustguard', 'gloombat']],
};

export const ENCOUNTER = {
  /** Chance of a fight per step, by tile. Roads are safest, marsh and ruins the worst. */
  odds: { '=': 1 / 48, B: 1 / 48, ':': 1 / 30, '.': 1 / 22, ',': 1 / 22, T: 1 / 14, h: 1 / 12, m: 1 / 10, '*': 1 / 14, r: 1 / 10 } as Record<string, number>,
  /** Steps after a fight with no new one. */
  grace: 5,
  /** Odds are multiplied by this where the region's beacon burns. */
  litFactor: 2 / 3,
  /** Seconds the encounter wipe takes. */
  wipe: 0.6,
} as const;

export const BATTLE = {
  /** A blow does (attack - defence / 2) times a random factor in this range. */
  dmgLo: 0.35,
  dmgHi: 0.5,
  /** The hero's heroic blow: this chance, for 45-55% of attack, ignoring armour. */
  critChance: 1 / 24,
  /** Valor timing: a press within this many seconds of the ring closing. */
  valorWindow: 0.11,
  valorStrike: 1.5,
  /** Seconds the ring takes to close: on the hero's strike, and on a foe's blow. */
  strikeRing: 0.42,
  guardRing: 0.32,
  fleeChance: 0.66,
  /** A foe this much quicker than the hero may strike before the first turn. */
  ambushGap: 4,
  ambushChance: 0.25,
  /** Up to three foes stand at these x positions. */
  slots: { 1: [304], 2: [282, 344], 3: [262, 316, 370] } as Record<number, number[]>,
} as const;
