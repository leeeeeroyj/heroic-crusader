// Townsfolk: where they stand, what they say, and what they sell. Pure: no Phaser, so tests import it directly.
import type { GearId, ItemId } from '../config';

export type Role = 'talk' | 'queen' | 'inn' | 'shrine' | 'smith' | 'grocer';
export type Stock = Array<{ gear: GearId } | { item: ItemId }>;

export interface Person {
  id: string;
  /** Sprite key: a picked sprite, or a recoloured one from NPC_KIN. */
  sprite: string;
  x: number;
  y: number;
  role: Role;
  /** What they say first (for 'talk', all they say). */
  lines: string[];
  stock?: Stock;
}

const C_SMITH: Stock = [{ gear: 'knife' }, { gear: 'hidevest' }, { gear: 'wicker' }];
const C_GROCER: Stock = [{ item: 'herb' }, { item: 'remedy' }, { item: 'torch' }];
const V_SMITH: Stock = [{ gear: 'knife' }, { gear: 'ironblade' }, { gear: 'hidevest' }, { gear: 'ringcoat' }, { gear: 'buckler' }];
const GROCER: Stock = [{ item: 'herb' }, { item: 'remedy' }, { item: 'incense' }, { item: 'torch' }];
const F_SMITH: Stock = [{ gear: 'ironblade' }, { gear: 'frostbrand' }, { gear: 'ringcoat' }, { gear: 'scalecoat' }, { gear: 'buckler' }, { gear: 'kite' }];
const HERMIT: Stock = [{ item: 'key' }, { item: 'remedy' }, { item: 'torch' }];

/** Inn, shrine, smith and grocer stand in the same places in every town. */
const shops = (inn: string, smith: Stock, grocer: Stock): Person[] => [
  { id: 'innkeeper', sprite: 'merchant', x: 4, y: 3, role: 'inn', lines: [inn] },
  { id: 'keeper', sprite: 'healer', x: 21, y: 3, role: 'shrine', lines: ['Peace be with you. Shall I record your journey here?'] },
  { id: 'smith', sprite: 'merchant', x: 4, y: 11, role: 'smith', lines: ['Steel for the road! What will it be?'], stock: smith },
  { id: 'grocer', sprite: 'merchant', x: 21, y: 11, role: 'grocer', lines: ['Herbs and sundries. Take a torch if you are bound below ground: it is black as pitch down there.'], stock: grocer },
];

export const PEOPLE: Record<string, Person[]> = {
  C: [
    { id: 'queen', sprite: 'queen', x: 12, y: 3, role: 'queen', lines: [] },
    { id: 'guard-l', sprite: 'villager', x: 10, y: 3, role: 'talk', lines: ['Her Majesty has waited long for a squire brave enough to take the vow.'] },
    { id: 'guard-r', sprite: 'villager', x: 15, y: 3, role: 'talk', lines: ['When the Gloam came, the beacons went out one by one. The land has been grey ever since.'] },
    ...shops('Welcome to the Gilded Lamp. A night here is {price} gold. Will you stay?', C_SMITH, C_GROCER),
    { id: 'girl', sprite: 'villager', x: 9, y: 10, role: 'talk', lines: ['Watch the ring when you strike! Press just as it closes and the blow lands half again as hard.', 'It works on their blows too. Time it right and you take half.'] },
    { id: 'farmer', sprite: 'villager', x: 19, y: 13, role: 'talk', lines: ['Keep to the roads if you are tired. The creatures seldom leave the grass and the marsh.'] },
  ],
  V: [
    ...shops('The Reed and Lantern. {price} gold a night. Will you stay?', V_SMITH, GROCER),
    { id: 'fisher', sprite: 'villager', x: 10, y: 4, role: 'talk', lines: ['Bogtoads bite with poison. A remedy, or a word with the shrine keeper, will draw it out.'] },
    { id: 'boy', sprite: 'villager', x: 16, y: 13, role: 'talk', lines: ['The old belfry sank into the marsh, far to the west. They say its bell still rings at night.'] },
  ],
  F: [
    ...shops('Hearth and Fur. {price} gold a night, and the fire is warm. Will you stay?', F_SMITH, GROCER),
    { id: 'hunter', sprite: 'villager', x: 9, y: 4, role: 'talk', lines: ['Frostfangs howl for their pack. Finish a lone one quickly, before the others come.'] },
    { id: 'elder', sprite: 'villager', x: 16, y: 13, role: 'talk', lines: ['Wisps up here can hush a spell on your lips. Keep a herb or two for when they do.'] },
  ],
  H: [
    { id: 'hermit', sprite: 'hermit', x: 12, y: 5, role: 'grocer', lines: ['Hm. A squire. You will want keys for the old places, and something for poison.'], stock: HERMIT },
  ],
};

/** The queen's charge: the first beacon still cold, in order (4 when all burn). */
export const QUEST = [
  'The four beacons are cold, and the Gloam spreads. Begin in the Thornwood, west of here, where the first beacon stands in its barrow.',
  'The Thornwood beacon burns! Next, the Drowned Belfry in the far western marsh. Fenbridge lies on the way.',
  'The marsh is bright again. Now Rime Spire, in the snowfields to the north. Frostholm can shelter you.',
  'Only one remains: Sunder Keep, among the eastern ruins. The hermit there knows its doors.',
  'All four burn, and the Gloam\'s wall has fallen. Its Hollow lies in the north-east. Go, and end this.',
];
