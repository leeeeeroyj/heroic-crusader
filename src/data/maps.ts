// Map data. Pure: no Phaser, so tests import it straight from the dev server.

/**
 * The overworld, 48 × 26 tiles. M mountain, ~ water, x Gloam wall (gone when all four beacons burn), . grass,
 * , flowers, T forest, h hills, m marsh, * snow, r ruins, = road, B bridge, : sand.
 * Sites: C Brightkeep, V Fenbridge, F Frostholm, H the hermit, 1-4 the beacon dungeons, G Gloam's Hollow.
 */
export const OVERWORLD = [
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
  'MMMMMM******MMMM*******MMMM**3**MMMMMMMMMMMMMMMM',
  'MMMM****T*****MM**T*****MM***=***MMMMxxxxxxMMMMM',
  'MMM***TT********************~=****MMMxxGxxxMMMMM',
  'MMM**TTT***F=========*****~~=****MMMMxxxxxxMMMMM',
  'MM*****T*****=****T****~~**==****hhhhhh==hhMMMMM',
  'MM**********=*********~~**=**hhhhhhhhh=hhhhhMMMM',
  'MMmm*******=*****MM***~**=*hhhhhhhhhh=hhhhhrMMMM',
  'MMm2mm*****=****MMMM**~*=*hhhhhhhh===hhhhrrrMMMM',
  'MMmm=mmm***=***MMMMM**B=hhhhhh====hhhhhrrrrrMMMM',
  'MMmmm=mmmm,,=,,,MMM..~~=...........hhhrrrrrrMMMM',
  'MMmmmm=mmm,,=,,....~~~.=..TT.......=hrrrrrrrMMMM',
  'MMmmmmm=V==B=......~~~.=.TTTT.....=.hrrrrrrrMMMM',
  'MMmmmmmmmm,,=,.....~~~~=..TT.....=...rrrrrrrMMMM',
  'MMMmmmmmm,,,=,......~~~=........=....=rrrrrrMMMM',
  'MMMmmmmm,,..=.......~~~=.......=..H==.rrrrrrMMMM',
  'MMMMmmm,,...=.......~~B=......=......=rrrrrrMMMM',
  'MMMMMmm,....=......~~..=.....=.......=.rr4rrMMMM',
  'MMMMMm,.TT..=......~~..=....=........====rrrMMMM',
  'MMMMM,.TTTT.=.....~~...=...=...hh.........rMMMMM',
  'MMMMM.TT1TT.======B=====C==.....hhh........MMMMM',
  'MMMMM.TTTTT.......~~....=.........hh.......MMMMM',
  'MMMMMM.TTT........~~....=,,,..............MMMMMM',
  'MMMMMMM...........~~....,,,,,............MMMMMMM',
  'MMMMMMMM:::::::::~~~~:::::::::::::::::::MMMMMMMM',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
] as const;

export type SiteKind = 'town' | 'beacon' | 'hollow';
export interface Site {
  name: string;
  kind: SiteKind;
  /** Beacon index 0-3, for beacon sites. */
  beacon?: number;
}

export const SITES: Record<string, Site> = {
  C: { name: 'Brightkeep', kind: 'town' },
  V: { name: 'Fenbridge', kind: 'town' },
  F: { name: 'Frostholm', kind: 'town' },
  H: { name: "Hermit's Hut", kind: 'town' },
  1: { name: 'Thornwood Barrow', kind: 'beacon', beacon: 0 },
  2: { name: 'Drowned Belfry', kind: 'beacon', beacon: 1 },
  3: { name: 'Rime Spire', kind: 'beacon', beacon: 2 },
  4: { name: 'Sunder Keep', kind: 'beacon', beacon: 3 },
  G: { name: "Gloam's Hollow", kind: 'hollow' },
};

/** Ground that always belongs to one region (0 Meadow, 1 Marsh, 2 Snow, 3 Ruins); other tiles take the nearest beacon's. */
export const TERRAIN_REGION: Record<string, number> = {
  m: 1, V: 1, 2: 1, '*': 2, F: 2, 3: 2, r: 3, h: 3, H: 3, 4: 3, ',': 0, T: 0, C: 0, 1: 0,
};
/** The Hollow's corner: x at or beyond this, y at or above `y`. It belongs to no region and lights only with all four. */
export const HOLLOW_CORNER = { x: 36, y: 5 } as const;

/**
 * Town maps, one screen each (26 × 15). Walk out through the gap at the bottom to leave.
 * . grass, , flowers, T tree, P snowy pine, ~ water, B bridge, m marsh, * snow, o cobbles, f floor, c carpet,
 * # wall, k counter (talk across it), b bed, a altar, n anvil, p pots, q throne, U / W roofs (blue / snowy), w house
 * front, d door.
 */
export const TOWNS: Record<string, { map: readonly string[]; region: number; arrive: { x: number; y: number }; shrine?: { x: number; y: number } }> = {
  // Brightkeep
  C: {
    region: 0,
    arrive: { x: 12, y: 13 },
    shrine: { x: 21, y: 4 },
    map: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTT',
      'T######T##########T######T',
      'T#bffb#T#fffqqfff#T#faaf#T',
      'T#ffff#T#fffccfff#T#ffff#T',
      'T#kkkk#T#fffccfff#T#ffff#T',
      'T#ffff#T#fffccfff#T#ffff#T',
      'T###f##.####cc####.###f##T',
      'T.oooooooooooooooooooooo.T',
      'T.##f###.,,.oo.,,.###f##.T',
      'T.#ffff#..T.oo.T..#ffff#.T',
      'T.#kkkk#....oo....#kkkk#.T',
      'T.#fffn#.,..oo..,.#pfff#.T',
      'T.######..,.oo.,..######.T',
      'TT..........oo..........TT',
      'TTTTTTTTTT..oo..TTTTTTTTTT',
    ],
  },
  // Fenbridge
  V: {
    region: 1,
    arrive: { x: 12, y: 13 },
    shrine: { x: 21, y: 4 },
    map: [
      '~~~~~~~~~~~~~~~~~~~~~~~~~~',
      'm######m....~~....m######m',
      'm#bffb#mUUU.~~.UUUm#faaf#m',
      'm#ffff#mwdw.~~.wdwm#ffff#m',
      'm#kkkk#m....BB....m#ffff#m',
      'm#ffff#m.m..~~..m.m#ffff#m',
      'm###f##.....~~.....###f##m',
      'm.oooooooooooooooooooooo.m',
      'm.##f###.m,.oo.,m.###f##.m',
      'm.#ffff#..m.oo.T..#ffff#.m',
      'm.#kkkk#....oo....#kkkk#.m',
      'm.#fffn#.,m.oo.m,.#pfff#.m',
      'm.######..,.oo.,..######.m',
      'mm..........oo..........mm',
      '~~~~~~~~~~..oo..~~~~~~~~~~',
    ],
  },
  // Frostholm
  F: {
    region: 2,
    arrive: { x: 12, y: 13 },
    shrine: { x: 21, y: 4 },
    map: [
      'PPPPPPPPPPPPPPPPPPPPPPPPPP',
      'P######P**********P######P',
      'P#bffb#PWWW****WWWP#faaf#P',
      'P#ffff#Pwdw****wdwP#ffff#P',
      'P#kkkk#P****oo****P#ffff#P',
      'P#ffff#P*P**oo**P*P#ffff#P',
      'P###f##*****oo*****###f##P',
      'P*oooooooooooooooooooooo*P',
      'P*##f###***.oo.***###f##*P',
      'P*#ffff#**P.oo.P**#ffff#*P',
      'P*#kkkk#*...oo...*#kkkk#*P',
      'P*#fffn#***.oo.***#pfff#*P',
      'P*######*.*.oo.*.*######*P',
      'PP**********oo**********PP',
      'PPPPPPPPPP**oo**PPPPPPPPPP',
    ],
  },
  // the hermit's clearing
  H: {
    region: 3,
    arrive: { x: 12, y: 13 },
    map: [
      'TTTTTTTTTTTTTTTTTTTTTTTTTT',
      'TTTTTT..............TTTTTT',
      'TTTT.....,......,.....TTTT',
      'TTT.......######.......TTT',
      'TT........#pffp#........TT',
      'TT..,.....#ffff#.....,..TT',
      'TT........#kkkk#........TT',
      'TT....T...#ffff#...T....TT',
      'TTT.......###f##.......TTT',
      'TTT.........oo.........TTT',
      'TTTT..,.....oo.....,..TTTT',
      'TTTT........oo........TTTT',
      'TTTTT.......oo.......TTTTT',
      'TTTTTT......oo......TTTTTT',
      'TTTTTTTTTT..oo..TTTTTTTTTT',
    ],
  },
};

export const TOWN_W = 26;
export const TOWN_H = 15;
