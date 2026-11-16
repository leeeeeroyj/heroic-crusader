// Spells and items used on the map, outside battle. Pure: the world scene applies `home` (Homeward) itself.
import { ITEMS, SPELLS, STATUS, type ItemId, type SpellId } from './config';
import { count, heal, known, takeItem, type Journey } from './state';

export type Rng = () => number;
const ri = (rng: Rng, [a, b]: readonly [number, number]) => a + Math.floor(rng() * (b - a + 1));

export interface FieldResult {
  ok: boolean;
  text: string;
  /** Homeward: the world scene sends the hero to their shrine. */
  home?: boolean;
}

/** Spells that can be cast on the map: the hero's field and both-ways spells. */
export const fieldSpells = (j: Journey) => known(j.hero).filter((id) => SPELLS[id].use !== 'battle');
export const fieldItems = (j: Journey) => (Object.keys(ITEMS) as ItemId[]).filter((id) => count(j.hero, id) > 0);

export function castInField(j: Journey, id: SpellId, rng: Rng, dark = false): FieldResult {
  const h = j.hero, sp = SPELLS[id];
  if (!known(h).includes(id)) return { ok: false, text: `${h.name} doesn't know ${sp.name}.` };
  if (sp.use === 'battle') return { ok: false, text: `${sp.name} is for battle.` };
  if (h.mp < sp.mp) return { ok: false, text: `Not enough MP for ${sp.name}.` };
  if (id === 'glow' && !dark) return { ok: false, text: 'Glow lights dark places. It is bright enough here.' };
  h.mp -= sp.mp;
  switch (id) {
    case 'mend': case 'restore': {
      const got = heal(h, ri(rng, SPELLS[id].heal));
      return { ok: true, text: `${h.name} casts ${sp.name} and recovers ${got} HP.` };
    }
    case 'ward':
      j.ward = STATUS.wardSteps;
      return { ok: true, text: `${h.name} casts Ward. Weaker creatures will keep away.` };
    case 'homeward':
      return { ok: true, text: `${h.name} casts Homeward.`, home: true };
    default:
      return { ok: true, text: `${h.name} casts ${sp.name}.` };
  }
}

export function useInField(j: Journey, id: ItemId, rng: Rng): FieldResult {
  const h = j.hero, it = ITEMS[id];
  if (count(h, id) <= 0) return { ok: false, text: `No ${it.name.toLowerCase()} left.` };
  switch (id) {
    case 'herb': {
      takeItem(h, id);
      const got = heal(h, ri(rng, ITEMS.herb.heal));
      return { ok: true, text: `${h.name} chews a herb and recovers ${got} HP.` };
    }
    case 'remedy':
      if (!h.poisoned) return { ok: false, text: `${h.name} isn't poisoned.` };
      takeItem(h, id);
      h.poisoned = false;
      return { ok: true, text: `The remedy works. ${h.name} is no longer poisoned.` };
    case 'incense':
      takeItem(h, id);
      j.ward = Math.max(j.ward, STATUS.incenseSteps);
      return { ok: true, text: 'Sweet smoke curls up. Weaker creatures will keep away.' };
    case 'torch':
      return { ok: false, text: 'Torches are for dark places.' };
    default:
      return { ok: false, text: `The ${it.name.toLowerCase()} opens a locked door.` };
  }
}
