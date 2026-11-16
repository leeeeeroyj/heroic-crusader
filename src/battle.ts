// Battle rules. Pure: no Phaser, so tests and the balance probe import it straight from the dev server.
// A battle is played as a generator of events. The scene plays each one back; the two ring events (the hero's strike
// and a foe's blow) wait for an answer, whether the player pressed on the ring.
import { BATTLE, CREATURES, GLOAM_UNMASKED, ITEMS, LEVELS, SPELLS, STATUS, type BigMove, type CreatureDef, type CreatureId, type Ground, type ItemId, type SpellId, type Traits } from './config';
import { count, heal, heroAgi, heroAtk, heroDef, maxHp, maxMp, takeItem, toNext, type Hero } from './state';

export type Rng = () => number;
const ri = (rng: Rng, [a, b]: readonly [number, number]) => a + Math.floor(rng() * (b - a + 1));

export interface Foe {
  id: CreatureId;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  agi: number;
  xp: number;
  gold: number;
  traits: Traits;
  /** Beaten: it shakes off the Gloam and runs home. */
  freed: boolean;
  /** Left the fight (stole and flew off): no reward. */
  gone: boolean;
  /** Turns of sleep left. */
  sleep: number;
  /** Braced: takes half damage until its next turn. */
  braced: boolean;
  /** Turns taken, for bracing every other turn. */
  turns: number;
  /** Wardens shrug off Lull and can't be fled. */
  warden: boolean;
  /** A warden's big move, and its beat: every third turn it tells, and the next it strikes. */
  big: BigMove | null;
  beat: number;
  charged: boolean;
  /** The Gloam, masked (copying spells) until half its HP is gone; then `move` steps through its stolen moves. */
  gloam: boolean;
  masked: boolean;
  move: number;
}

export interface Battle {
  hero: Hero;
  foes: Foe[];
  ground: Ground;
  /** The region's beacon is cold: the backdrop is drawn grey. */
  dim: boolean;
  rng: Rng;
  outcome: 'won' | 'fled' | 'lost' | null;
  /** Turns of sleep the hero has left. */
  heroSleep: number;
  /** Hushed: no spells for the rest of the fight. */
  hushed: boolean;
  /** The hero's last spell, until the masked Gloam copies it. */
  lastSpell: SpellId | null;
}

/** The hero, or a foe by its index. */
export type Who = 'hero' | number;

export type Action =
  | { type: 'fight'; target: number }
  | { type: 'spell'; spell: SpellId; target?: number }
  | { type: 'item'; item: ItemId }
  | { type: 'flee' };

export type StatusName = 'sleep' | 'poison' | 'hush' | 'brace';

export type BattleEvent =
  | { type: 'say'; text: string }
  /** The hero lunges at a foe; answer true if the player pressed on the ring. */
  | { type: 'heroStrike'; target: number }
  /** `base` is the damage before Valor. */
  | { type: 'foeHurt'; target: number; damage: number; base: number; valor: boolean; big: boolean; fire?: boolean; text: string }
  | { type: 'miss'; target: number; text: string }
  /** A foe flashes white: it's about to act. */
  | { type: 'foeReady'; foe: number }
  /** A warden gathers itself: its big move comes next turn. */
  | { type: 'tell'; foe: number; text: string }
  /** The big move lands now (its damage follows as heroHurt). */
  | { type: 'big'; foe: number; text: string }
  /** The Gloam drops its mask and grows. */
  | { type: 'unmask'; foe: number; text: string }
  /** A foe lunges at the hero; answer true if the player pressed on the ring. */
  | { type: 'foeStrike'; foe: number }
  /** `base` is the damage before a guard. */
  | { type: 'heroHurt'; damage: number; base: number; guarded: boolean; kind?: 'fire' | 'poison'; text: string }
  | { type: 'cast'; who: Who; spell: SpellId | 'hush'; text: string }
  | { type: 'bolt'; from: Who; to: Who }
  | { type: 'heal'; who: Who; amount: number; text: string }
  | { type: 'status'; who: Who; status: StatusName; on: boolean; text: string }
  /** A foe stole gold and flew off. */
  | { type: 'leave'; foe: number; gold: number; text: string }
  /** A new foe joined (a howl). */
  | { type: 'join'; foe: number; text: string }
  | { type: 'freed'; foe: number; text: string }
  | { type: 'fled'; text: string }
  | { type: 'reward'; xp: number; gold: number; text: string }
  | { type: 'levelUp'; lv: number; learned: SpellId[]; text: string }
  | { type: 'fall'; text: string };

/** Ring events get the player's answer back; everything else gets undefined. */
export type BattleScript = Generator<BattleEvent, void, boolean | undefined>;

export function makeFoe(id: CreatureId): Foe {
  const c: CreatureDef = CREATURES[id];
  return {
    id, name: c.name, hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def, agi: c.agi, xp: c.xp, gold: c.gold, traits: c.traits ?? {},
    freed: false, gone: false, sleep: 0, braced: false, turns: 0, warden: !!(c.big || c.gloam), big: c.big ?? null, beat: 0, charged: false,
    gloam: !!c.gloam, masked: !!c.gloam, move: 0,
  };
}
export const makeFoes = (ids: readonly CreatureId[]) => ids.map(makeFoe);

export function newBattle(hero: Hero, ids: readonly CreatureId[], ground: Ground, dim: boolean, rng: Rng): Battle {
  const foes = makeFoes(ids);
  // Bracers start on a random beat.
  for (const f of foes) if (f.traits.brace) f.turns = rng() < 0.5 ? 0 : 1;
  return { hero, foes, ground, dim, rng, outcome: null, heroSleep: 0, hushed: false, lastSpell: null };
}

/** Foes still in the fight. */
export const living = (b: Battle) => b.foes.filter((f) => !f.freed && !f.gone);

/** One blow: (attack - defence / 2) times a random factor. Too weak to hurt: half the time 1, else 0. */
export function damage(atk: number, def: number, rng: Rng): number {
  const base = atk - def / 2;
  if (base <= 0) return rng() < 0.5 ? 0 : 1;
  return Math.max(1, Math.round(base * (BATTLE.dmgLo + rng() * (BATTLE.dmgHi - BATTLE.dmgLo))));
}

/** The hero's strike. A heroic blow (rare) ignores armour; Valor multiplies whatever landed. */
export function strike(hero: Hero, foe: Foe, valor: boolean, rng: Rng) {
  let dmg = damage(heroAtk(hero), foe.def, rng);
  const crit = rng() < BATTLE.critChance;
  if (crit) dmg = Math.round(heroAtk(hero) * (0.45 + rng() * 0.1));
  const base = dmg;
  if (valor) dmg = Math.round(Math.max(dmg, 1) * BATTLE.valorStrike);
  return { damage: dmg, base, crit, valor };
}

/** A foe's blow at the hero; a Valor guard halves it. */
export function blow(foe: Foe, hero: Hero, guard: boolean, rng: Rng) {
  const base = damage(foe.atk, heroDef(hero), rng);
  return { damage: guard ? Math.floor(base / 2) : base, base };
}

export const fleeWorks = (rng: Rng) => rng() < BATTLE.fleeChance;

/** Foes act in agility order, with some luck in it. */
export function turnOrder(b: Battle): Foe[] {
  return living(b).map((f) => ({ f, k: f.agi + b.rng() * 8 })).sort((a, c) => c.k - a.k).map((e) => e.f);
}

/** Total Valor and gold for the foes beaten (not the ones that stole away). */
export const rewards = (b: Battle) => ({
  xp: b.foes.reduce((s, f) => s + (f.freed ? f.xp : 0), 0),
  gold: b.foes.reduce((s, f) => s + (f.freed ? f.gold : 0), 0),
});

/** Spells and items the hero can use in this fight right now. */
export const battleSpells = (b: Battle) => (Object.keys(SPELLS) as SpellId[]).filter((id) => SPELLS[id].lv <= b.hero.lv && SPELLS[id].use !== 'field');
export const canCast = (b: Battle, id: SpellId) => !b.hushed && b.hero.mp >= SPELLS[id].mp;
export const battleItems = (b: Battle) => (['herb', 'remedy'] as ItemId[]).filter((id) => count(b.hero, id) > 0);
export const canUse = (b: Battle, id: ItemId) => count(b.hero, id) > 0 && (id !== 'remedy' || b.hero.poisoned);
/** Spells that need a target picked when there's more than one foe. */
export const spellTargets = (id: SpellId) => id === 'spark';

/** Adds Valor and raises the level as far as it reaches. HP and MP grow by the new maximums' gain. Returns new levels. */
export function gainValor(hero: Hero, xp: number): number[] {
  hero.xp += xp;
  const out: number[] = [];
  while (hero.lv < LEVELS.length && toNext(hero) <= 0) {
    const hp0 = maxHp(hero), mp0 = maxMp(hero);
    hero.lv++;
    hero.hp += maxHp(hero) - hp0;
    hero.mp += maxMp(hero) - mp0;
    out.push(hero.lv);
  }
  return out;
}

/** A foe's name in a sentence: "the Rook", but "Bristleback". */
const the = (f: Foe): string => ((CREATURES[f.id] as CreatureDef).proper ? f.name : `the ${f.name}`);
const The = (f: Foe): string => ((CREATURES[f.id] as CreatureDef).proper ? f.name : `The ${f.name}`);

const listNames = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The start of a fight: who appears, and a quick foe may strike first. */
export function* opening(b: Battle): BattleScript {
  const names = b.foes.map((f) => f.name), intro = CREATURES[b.foes[0].id] as CreatureDef;
  yield { type: 'say', text: intro.intro ?? (names.length === 1 ? `A ${names[0]} blocks the way!` : `${listNames(names)} appear!`) };
  const quick = living(b).sort((a, c) => c.agi - a.agi)[0];
  if (quick && quick.agi >= heroAgi(b.hero) + BATTLE.ambushGap && b.rng() < BATTLE.ambushChance) {
    yield { type: 'say', text: `${The(quick)} strikes before you can act!` };
    yield* foeTurn(b, quick);
    if (b.hero.hp <= 0) yield* fall(b);
  }
}

/** One round: quick foes may go first, then the hero's action, then every foe still standing, then poison. */
export function* round(b: Battle, action: Action): BattleScript {
  const h = b.hero;
  const early = living(b).filter((f) => f.traits.quick && f.sleep === 0 && b.rng() < 0.5);
  for (const f of early) {
    yield* foeTurn(b, f);
    if (h.hp <= 0) { yield* fall(b); return; }
  }
  if (b.heroSleep > 0) {
    b.heroSleep--;
    yield { type: 'say', text: `${h.name} is fast asleep...` };
    if (b.heroSleep === 0) yield { type: 'status', who: 'hero', status: 'sleep', on: false, text: `${h.name} wakes up.` };
  } else if (action.type === 'fight') yield* heroFight(b, action.target);
  else if (action.type === 'spell') yield* heroSpell(b, action.spell, action.target);
  else if (action.type === 'item') yield* heroItem(b, action.item);
  else if (living(b).some((f) => f.warden)) {
    yield { type: 'say', text: `${h.name} turns to run, but ${the(living(b).find((f) => f.warden)!)} bars the way!` };
  } else {
    yield { type: 'say', text: `${h.name} turns to run...` };
    if (fleeWorks(b.rng)) {
      b.outcome = 'fled';
      yield { type: 'fled', text: 'You got away.' };
      return;
    }
    yield { type: 'say', text: "Cut off! You can't escape." };
  }
  for (const f of living(b)) if (f.gloam && f.masked && f.hp > 0 && f.hp <= f.maxHp / 2) yield* unmask(b, f);
  yield* sweep(b);
  if (!living(b).length) { yield* victory(b); return; }
  for (const f of turnOrder(b)) {
    if (early.includes(f) || f.freed || f.gone) continue;
    yield* foeTurn(b, f);
    if (h.hp <= 0) { yield* fall(b); return; }
  }
  if (!living(b).length) { yield* victory(b); return; }
  if (h.poisoned && h.hp > 1) {
    const d = Math.min(h.hp - 1, Math.max(1, Math.floor(maxHp(h) * STATUS.poisonRound)));
    h.hp -= d;
    yield { type: 'heroHurt', damage: d, base: d, guarded: false, kind: 'poison', text: `The poison stings. ${h.name} loses ${d} HP.` };
  }
}

/** Picks the foe a blow or spell lands on: the chosen one if it's still there, else the first that is. */
function aim(b: Battle, target: number | undefined): Foe {
  const f = target === undefined ? undefined : b.foes[target];
  return f && !f.freed && !f.gone ? f : living(b)[0];
}

/** Damage to a foe: halved when braced; a sleeper wakes when hurt. Returns the damage done and extra words. */
function hurtFoe(f: Foe, dmg: number): { d: number; note: string } {
  const d = f.braced ? Math.floor(dmg / 2) : dmg;
  f.hp = Math.max(0, f.hp - d);
  let note = f.braced ? ' It is braced.' : '';
  if (f.sleep > 0 && d > 0 && f.hp > 0) { f.sleep = 0; note += ` ${The(f)} wakes up!`; }
  return { d, note };
}

function* heroFight(b: Battle, target: number): BattleScript {
  const h = b.hero, foe = aim(b, target), i = b.foes.indexOf(foe);
  yield { type: 'say', text: `${h.name} attacks!` };
  const valor = (yield { type: 'heroStrike', target: i }) === true;
  if (foe.traits.evade && b.rng() < foe.traits.evade) {
    yield { type: 'miss', target: i, text: `${The(foe)} dodges!` };
    return;
  }
  const s = strike(h, foe, valor, b.rng);
  const { d, note } = hurtFoe(foe, s.damage);
  const text = (s.valor ? `VALOR! ${d} damage to ${the(foe)}.` : s.crit ? `A heroic blow! ${d} damage to ${the(foe)}.`
    : d ? `${d} damage to ${the(foe)}.` : `${The(foe)} shrugs it off.`) + note;
  yield { type: 'foeHurt', target: i, damage: d, base: s.base, valor: s.valor, big: s.valor || s.crit, text };
}

function* heroSpell(b: Battle, id: SpellId, target: number | undefined): BattleScript {
  const h = b.hero, sp = SPELLS[id];
  if (b.hushed) { yield { type: 'say', text: `${h.name} tries to cast ${sp.name}, but the words won't come!` }; return; }
  if (h.mp < sp.mp) { yield { type: 'say', text: `Not enough MP for ${sp.name}.` }; return; }
  h.mp -= sp.mp;
  b.lastSpell = id;
  yield { type: 'cast', who: 'hero', spell: id, text: `${h.name} casts ${sp.name}!` };
  if (id === 'mend' || id === 'restore') {
    const got = heal(h, ri(b.rng, SPELLS[id].heal));
    yield { type: 'heal', who: 'hero', amount: got, text: `${h.name} recovers ${got} HP.` };
  } else if (id === 'spark' || id === 'flare') {
    const targets = id === 'spark' ? [aim(b, target)] : living(b);
    for (const f of targets) {
      const i = b.foes.indexOf(f);
      yield { type: 'bolt', from: 'hero', to: i };
      const { d, note } = hurtFoe(f, ri(b.rng, SPELLS[id].dmg));
      yield { type: 'foeHurt', target: i, damage: d, base: d, valor: false, big: false, fire: true, text: `${d} fire damage to ${the(f)}.${note}` };
    }
  } else if (id === 'lull') {
    for (const f of living(b)) {
      const i = b.foes.indexOf(f);
      if (!f.warden && b.rng() < STATUS.lullChance) {
        f.sleep = ri(b.rng, STATUS.lullTurns);
        yield { type: 'status', who: i, status: 'sleep', on: true, text: `${The(f)} falls asleep.` };
      } else yield { type: 'say', text: `${The(f)} resists.` };
    }
  } else yield { type: 'say', text: 'Nothing happens.' };
}

function* heroItem(b: Battle, id: ItemId): BattleScript {
  const h = b.hero;
  if (!canUse(b, id)) { yield { type: 'say', text: `${h.name} can't use that now.` }; return; }
  takeItem(h, id);
  if (id === 'herb') {
    const got = heal(h, ri(b.rng, ITEMS.herb.heal));
    yield { type: 'heal', who: 'hero', amount: got, text: `${h.name} chews a herb and recovers ${got} HP.` };
  } else if (id === 'remedy') {
    h.poisoned = false;
    yield { type: 'status', who: 'hero', status: 'poison', on: false, text: `The remedy works. ${h.name} is no longer poisoned.` };
  }
}

/** One foe's turn: asleep, bracing, a trick (howl, Spark, Hush, spores) or its blows. Exported for tests. */
export function* foeTurn(b: Battle, f: Foe): BattleScript {
  const i = b.foes.indexOf(f), h = b.hero, t = f.traits;
  if (f.freed || f.gone) return;
  if (f.sleep > 0) {
    f.sleep--;
    yield f.sleep ? { type: 'say', text: `${The(f)} is fast asleep.` } : { type: 'status', who: i, status: 'sleep', on: false, text: `${The(f)} wakes up!` };
    return;
  }
  if (t.brace) {
    f.turns++;
    if (f.turns % 2 === 1) {
      f.braced = true;
      yield { type: 'status', who: i, status: 'brace', on: true, text: `${The(f)} braces itself.` };
      return;
    }
    if (f.braced) { f.braced = false; yield { type: 'status', who: i, status: 'brace', on: false, text: `${The(f)} lowers its guard.` }; }
  }
  if (f.gloam && f.masked && b.lastSpell) {
    const id = b.lastSpell;
    b.lastSpell = null;
    yield* mirror(b, f, id);
    return;
  }
  if (f.big) {
    f.beat++;
    if (f.charged) { f.charged = false; yield* bigMove(b, f, f.big); return; }
    if (f.beat % 3 === 2) {
      f.charged = true;
      yield { type: 'tell', foe: i, text: f.big.tell };
      return;
    }
  }
  yield { type: 'foeReady', foe: i };
  if (t.howl && b.foes.length < 3 && b.rng() < t.howl) {
    b.foes.push(makeFoe(f.id));
    yield { type: 'say', text: `${The(f)} howls!` };
    yield { type: 'join', foe: b.foes.length - 1, text: `Another ${f.name} joins the hunt!` };
    return;
  }
  if (t.spark && b.rng() < t.spark.chance) {
    yield { type: 'cast', who: i, spell: 'spark', text: `${The(f)} casts Spark!` };
    yield { type: 'bolt', from: i, to: 'hero' };
    const d = Math.min(h.hp, ri(b.rng, t.spark.dmg));
    h.hp -= d;
    yield { type: 'heroHurt', damage: d, base: d, guarded: false, kind: 'fire', text: `${h.name} takes ${d} fire damage.` };
    return;
  }
  if (t.hush && !b.hushed && b.rng() < t.hush) {
    b.hushed = true;
    yield { type: 'cast', who: i, spell: 'hush', text: `${The(f)} casts Hush!` };
    yield { type: 'status', who: 'hero', status: 'hush', on: true, text: `${h.name}'s spells are hushed!` };
    return;
  }
  if (t.spores && b.rng() < t.spores.chance) {
    yield { type: 'say', text: `${The(f)} puffs a cloud of spores!` };
    if (b.rng() < 0.5) {
      if (t.spores.effect === 'sleep') {
        b.heroSleep = STATUS.sleepTurns;
        yield { type: 'status', who: 'hero', status: 'sleep', on: true, text: `${h.name} nods off!` };
      } else if (!h.poisoned) {
        h.poisoned = true;
        yield { type: 'status', who: 'hero', status: 'poison', on: true, text: `${h.name} is poisoned!` };
      } else yield { type: 'say', text: `${h.name} coughs.` };
    } else yield { type: 'say', text: `${h.name} holds their breath.` };
    return;
  }
  for (let k = 0; k < (t.twice ? 2 : 1); k++) {
    yield { type: 'say', text: k ? `${The(f)} bites again!` : `${The(f)} attacks!` };
    const guard = (yield { type: 'foeStrike', foe: i }) === true;
    const { damage: d0, base } = blow(f, h, guard, b.rng);
    const d = Math.min(h.hp, d0);
    h.hp -= d;
    yield { type: 'heroHurt', damage: d, base, guarded: guard, text: guard ? `Guarded! ${h.name} takes only ${d}.` : d ? `${h.name} takes ${d} damage.` : `${h.name} dodges!` };
    if (h.hp <= 0) return;
    if (d > 0 && t.drain) {
      const got = Math.min(f.maxHp - f.hp, Math.ceil(d * t.drain));
      f.hp += got;
      if (got > 0) yield { type: 'heal', who: i, amount: got, text: `${The(f)} drinks ${got} HP.` };
    }
    if (d > 0 && t.poison && !h.poisoned && b.rng() < t.poison) {
      h.poisoned = true;
      yield { type: 'status', who: 'hero', status: 'poison', on: true, text: `${h.name} is poisoned!` };
    }
    if (k === 0 && t.steal && h.gold > 0 && b.rng() < t.steal) {
      const g = Math.min(h.gold, ri(b.rng, [3, 8]));
      h.gold -= g;
      f.gone = true;
      yield { type: 'leave', foe: i, gold: g, text: `${The(f)} snatches ${g} gold and flies off!` };
      return;
    }
  }
}

/** The masked Gloam turns the hero's own spell back on them. */
function* mirror(b: Battle, f: Foe, id: SpellId): BattleScript {
  const i = b.foes.indexOf(f), h = b.hero, sp = SPELLS[id];
  yield { type: 'cast', who: i, spell: id, text: `${The(f)} casts ${sp.name}, mocking you!` };
  if (id === 'mend' || id === 'restore') {
    const got = Math.min(f.maxHp - f.hp, ri(b.rng, SPELLS[id].heal));
    f.hp += got;
    yield { type: 'heal', who: i, amount: got, text: `${The(f)} recovers ${got} HP.` };
  } else if (id === 'spark' || id === 'flare') {
    yield { type: 'bolt', from: i, to: 'hero' };
    const d = Math.min(h.hp, ri(b.rng, SPELLS[id].dmg));
    h.hp -= d;
    yield { type: 'heroHurt', damage: d, base: d, guarded: false, kind: 'fire', text: `${h.name} takes ${d} fire damage.` };
  } else if (id === 'lull') {
    b.heroSleep = STATUS.sleepTurns;
    yield { type: 'status', who: 'hero', status: 'sleep', on: true, text: `${h.name} nods off!` };
  } else yield { type: 'say', text: 'Nothing happens.' };
}

/** At half its HP the Gloam drops its mask: stronger, and armed with the wardens' moves, each told a turn ahead. */
function* unmask(b: Battle, f: Foe): BattleScript {
  f.masked = false;
  f.atk += GLOAM_UNMASKED.atk;
  f.move = 0;
  f.big = GLOAM_UNMASKED.moves[0];
  f.beat = 1;
  f.charged = false;
  b.lastSpell = null;
  yield { type: 'unmask', foe: b.foes.indexOf(f), text: "The Gloam's mask cracks! Its true shape pours out, vast and dark." };
}

/** A warden's big move, told a turn ahead. The unmasked Gloam moves on to its next stolen move. */
function* bigMove(b: Battle, f: Foe, big: BigMove): BattleScript {
  const i = b.foes.indexOf(f), h = b.hero;
  if (f.gloam) { f.move = (f.move + 1) % GLOAM_UNMASKED.moves.length; f.big = GLOAM_UNMASKED.moves[f.move]; }
  yield { type: 'big', foe: i, text: big.name };
  if (big.kind === 'blow') {
    const guard = (yield { type: 'foeStrike', foe: i }) === true;
    const base = Math.round(damage(f.atk, heroDef(h), b.rng) * (big.mult ?? 2));
    const d = Math.min(h.hp, guard ? Math.floor(base / 2) : base);
    h.hp -= d;
    yield { type: 'heroHurt', damage: d, base, guarded: guard, text: guard ? `Guarded! ${h.name} takes only ${d}.` : `${h.name} takes ${d} damage!` };
    return;
  }
  const d = Math.min(h.hp, ri(b.rng, big.dmg ?? [10, 10]));
  h.hp -= d;
  yield { type: 'heroHurt', damage: d, base: d, guarded: false, kind: big.kind === 'breath' ? 'fire' : undefined, text: `${h.name} takes ${d} damage!` };
  if (h.hp <= 0) return;
  if (big.kind === 'drain') {
    const got = Math.min(f.maxHp - f.hp, d);
    f.hp += got;
    if (got > 0) yield { type: 'heal', who: i, amount: got, text: `${The(f)} drinks ${got} HP.` };
  }
  if (big.poison && !h.poisoned) {
    h.poisoned = true;
    yield { type: 'status', who: 'hero', status: 'poison', on: true, text: `${h.name} is poisoned!` };
  }
}

/** Beaten foes shake off the Gloam and run home. */
function* sweep(b: Battle): BattleScript {
  for (const [i, f] of b.foes.entries()) {
    if (f.freed || f.gone || f.hp > 0) continue;
    f.freed = true;
    yield { type: 'freed', foe: i, text: f.gloam ? 'The Gloam breaks apart like fog at sunrise!' : `${The(f)} shakes off the Gloam and runs for home!` };
  }
}

function* victory(b: Battle): BattleScript {
  const { xp, gold } = rewards(b), h = b.hero;
  h.gold += gold;
  b.outcome = 'won';
  if (!b.foes.some((f) => f.freed)) { yield { type: 'reward', xp: 0, gold: 0, text: 'The foes are gone.' }; return; }
  if (b.foes.some((f) => f.gloam)) { yield { type: 'reward', xp: 0, gold: 0, text: 'The Gloam is gone. Morning comes to the kingdom.' }; return; }
  yield { type: 'reward', xp, gold, text: `Victory! Valor +${xp}, gold +${gold}.` };
  for (const lv of gainValor(h, xp)) {
    const learned = (Object.keys(SPELLS) as SpellId[]).filter((id) => SPELLS[id].lv === lv);
    const words = learned.length ? ` Learned ${learned.map((id) => SPELLS[id].name).join(' and ')}.` : '';
    yield { type: 'levelUp', lv, learned, text: `${h.name} is now LV ${lv}!${words}` };
  }
}

function* fall(b: Battle): BattleScript {
  b.outcome = 'lost';
  yield { type: 'fall', text: `${b.hero.name} falls...` };
}

/** Runs a script to its end, answering rings with `answer`. Returns the events. */
export function runScript(script: BattleScript, answer: (e: BattleEvent) => boolean | undefined = () => undefined): BattleEvent[] {
  const out: BattleEvent[] = [];
  let r = script.next();
  while (!r.done) { out.push(r.value); r = script.next(answer(r.value)); }
  return out;
}

/**
 * A simple policy, for tests, the balance probe and the attract-mode demo: when low, Restore, Mend or a herb (herbs
 * first while the Gloam is masked, since it copies spells), else strike the weakest foe.
 */
export function policy(b: Battle, useHeals = true): Action {
  const h = b.hero, low = h.hp < maxHp(h) * 0.35, mirror = living(b).some((f) => f.gloam && f.masked);
  const spell = (['restore', 'mend'] as SpellId[]).find((id) => battleSpells(b).includes(id) && canCast(b, id));
  if (useHeals && low && mirror && canUse(b, 'herb')) return { type: 'item', item: 'herb' };
  if (useHeals && low && spell) return { type: 'spell', spell };
  if (useHeals && low && canUse(b, 'herb')) return { type: 'item', item: 'herb' };
  return { type: 'fight', target: b.foes.indexOf(living(b).sort((a, c) => a.hp - c.hp)[0]) };
}

/**
 * Plays a whole battle with `policy` (or fleeing every round), Valor on a share of rings. Returns the outcome and the
 * number of rounds.
 */
export function autoplay(b: Battle, { valorRate = 0, flee = false, heal: useHeals = true } = {}) {
  const answer = (e: BattleEvent) => (e.type === 'heroStrike' || e.type === 'foeStrike' ? b.rng() < valorRate : undefined);
  runScript(opening(b), answer);
  let rounds = 0;
  while (!b.outcome && rounds < 200) {
    const action: Action = flee ? { type: 'flee' } : policy(b, useHeals);
    runScript(round(b, action), answer);
    rounds++;
  }
  return { outcome: b.outcome, rounds };
}
