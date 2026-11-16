// Shops and inns. Pure: no Phaser, so tests import it straight from the dev server.
import { GEAR, INN, ITEMS, type GearId, type GearSlot, type ItemId } from './config';
import { addItem, count, heroAtk, heroDef, maxHp, maxMp, takeItem, type Hero } from './state';

export type Ware = { gear: GearId } | { item: ItemId };

export const wareName = (w: Ware) => ('gear' in w ? GEAR[w.gear].name : ITEMS[w.item].name);
export const price = (w: Ware) => ('gear' in w ? GEAR[w.gear].price : ITEMS[w.item].price);
/** Shops buy at half price. */
export const half = (n: number) => Math.floor(n / 2);

/** The piece a new one would replace, and what the smith pays for it. */
export function tradeIn(h: Hero, id: GearId): { old: GearId | null; refund: number } {
  const old = h.gear[GEAR[id].slot as GearSlot];
  return { old, refund: old ? half(GEAR[old].price) : 0 };
}

/** What the hero actually pays: the price, less the trade-in for gear. */
export const cost = (h: Hero, w: Ware) => price(w) - ('gear' in w ? tradeIn(h, w.gear).refund : 0);

export type Verdict = 'ok' | 'gold' | 'full' | 'owned';
export function canBuy(h: Hero, w: Ware): Verdict {
  if ('gear' in w && h.gear[GEAR[w.gear].slot as GearSlot] === w.gear) return 'owned';
  if ('item' in w && count(h, w.item) >= ITEMS[w.item].max) return 'full';
  return h.gold >= cost(h, w) ? 'ok' : 'gold';
}

/** Attack or defence now, and with this piece on. */
export function preview(h: Hero, id: GearId) {
  const slot = GEAR[id].slot as GearSlot, stat = slot === 'weapon' ? 'ATTACK' : 'DEFENCE';
  const now = slot === 'weapon' ? heroAtk(h) : heroDef(h);
  const old = h.gear[slot];
  return { stat, now, then: now - (old ? GEAR[old].power : 0) + GEAR[id].power };
}

export function buy(h: Hero, w: Ware): { ok: boolean; text: string } {
  const v = canBuy(h, w), name = wareName(w);
  if (v === 'owned') return { ok: false, text: `You already carry the ${name}.` };
  if (v === 'full') return { ok: false, text: `Your pack can't hold another ${name.toLowerCase()}.` };
  if (v === 'gold') return { ok: false, text: "You haven't enough gold." };
  h.gold -= cost(h, w);
  if ('item' in w) {
    addItem(h, w.item);
    return { ok: true, text: `${name} added to your pack.` };
  }
  const { old, refund } = tradeIn(h, w.gear);
  h.gear[GEAR[w.gear].slot as GearSlot] = w.gear;
  return { ok: true, text: `${h.name} equips the ${name}.${old ? ` The ${GEAR[old].name} fetched ${refund} gold.` : ''}` };
}

/** Items the hero could sell: everything in the pack. */
export const sellable = (h: Hero) => (Object.keys(ITEMS) as ItemId[]).filter((id) => count(h, id) > 0);

export function sell(h: Hero, id: ItemId): { ok: boolean; text: string } {
  if (!takeItem(h, id)) return { ok: false, text: 'You have none to sell.' };
  const n = half(ITEMS[id].price);
  h.gold += n;
  return { ok: true, text: `${ITEMS[id].name} sold for ${n} gold.` };
}

/** A night at the inn: HP and MP refilled and poison sweated out, for the town's price. */
export function stay(h: Hero, town: string): { ok: boolean; text: string } {
  const p = INN[town];
  if (h.gold < p) return { ok: false, text: "You haven't enough gold. Come back when you do." };
  h.gold -= p;
  h.hp = maxHp(h);
  h.mp = maxMp(h);
  h.poisoned = false;
  return { ok: true, text: 'Good morning! You look well rested.' };
}
