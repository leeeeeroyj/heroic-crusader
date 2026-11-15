// Battle rules. Pure: no Phaser, so tests and the balance probe import it straight from the dev server.
// A battle is played as a generator of events. The scene plays each one back; the two ring events (the hero's strike
// and a foe's blow) wait for an answer, whether the player pressed on the ring.
import { BATTLE, CREATURES, LEVELS, type CreatureId, type Ground } from './config';
import { heroAgi, heroAtk, heroDef, maxHp, maxMp, toNext, type Hero } from './state';

export type Rng = () => number;

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
  /** Beaten: it shakes off the Gloam and runs home. */
  freed: boolean;
}

export interface Battle {
  hero: Hero;
  foes: Foe[];
  ground: Ground;
  /** The region's beacon is cold: the backdrop is drawn grey. */
  dim: boolean;
  rng: Rng;
  outcome: 'won' | 'fled' | 'lost' | null;
}

export type Action = { type: 'fight'; target: number } | { type: 'flee' };

export type BattleEvent =
  | { type: 'say'; text: string }
  /** The hero lunges at a foe; answer true if the player pressed on the ring. */
  | { type: 'heroStrike'; target: number }
  /** `base` is the damage before Valor. */
  | { type: 'foeHurt'; target: number; damage: number; base: number; valor: boolean; big: boolean; text: string }
  /** A foe flashes white: it's about to act. */
  | { type: 'foeReady'; foe: number }
  /** A foe lunges at the hero; answer true if the player pressed on the ring. */
  | { type: 'foeStrike'; foe: number }
  /** `base` is the damage before a guard. */
  | { type: 'heroHurt'; damage: number; base: number; guarded: boolean; text: string }
  | { type: 'freed'; foe: number; text: string }
  | { type: 'fled'; text: string }
  | { type: 'reward'; xp: number; gold: number; text: string }
  | { type: 'levelUp'; lv: number; text: string }
  | { type: 'fall'; text: string };

/** Ring events get the player's answer back; everything else gets undefined. */
export type BattleScript = Generator<BattleEvent, void, boolean | undefined>;

export function makeFoes(ids: readonly CreatureId[]): Foe[] {
  return ids.map((id) => {
    const c = CREATURES[id];
    return { id, name: c.name, hp: c.hp, maxHp: c.hp, atk: c.atk, def: c.def, agi: c.agi, xp: c.xp, gold: c.gold, freed: false };
  });
}

export function newBattle(hero: Hero, ids: readonly CreatureId[], ground: Ground, dim: boolean, rng: Rng): Battle {
  return { hero, foes: makeFoes(ids), ground, dim, rng, outcome: null };
}

export const living = (b: Battle) => b.foes.filter((f) => !f.freed);

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

/** Total Valor and gold for the foes beaten (not the ones that ran or stole away). */
export const rewards = (b: Battle) => ({
  xp: b.foes.reduce((s, f) => s + (f.freed && f.hp <= 0 ? f.xp : 0), 0),
  gold: b.foes.reduce((s, f) => s + (f.freed && f.hp <= 0 ? f.gold : 0), 0),
});

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

const listNames = (names: string[]) => (names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The start of a fight: who appears, and a quick foe may strike first. */
export function* opening(b: Battle): BattleScript {
  const names = b.foes.map((f) => f.name);
  yield { type: 'say', text: names.length === 1 ? `A ${names[0]} blocks the way!` : `${listNames(names)} appear!` };
  const quick = living(b).sort((a, c) => c.agi - a.agi)[0];
  if (quick && quick.agi >= heroAgi(b.hero) + BATTLE.ambushGap && b.rng() < BATTLE.ambushChance) {
    yield { type: 'say', text: `The ${quick.name} strikes before you can act!` };
    yield* foeTurn(b, quick);
    if (b.hero.hp <= 0) yield* fall(b);
  }
}

/** One round: the hero's action, then every foe still standing. */
export function* round(b: Battle, action: Action): BattleScript {
  const h = b.hero;
  if (action.type === 'fight') {
    const foe = b.foes[action.target] && !b.foes[action.target].freed ? b.foes[action.target] : living(b)[0];
    const i = b.foes.indexOf(foe);
    yield { type: 'say', text: `${h.name} attacks!` };
    const valor = (yield { type: 'heroStrike', target: i }) === true;
    const s = strike(h, foe, valor, b.rng);
    foe.hp = Math.max(0, foe.hp - s.damage);
    const text = s.valor ? `VALOR! ${s.damage} damage to the ${foe.name}.` : s.crit ? `A heroic blow! ${s.damage} damage to the ${foe.name}.`
      : s.damage ? `${s.damage} damage to the ${foe.name}.` : `The ${foe.name} shrugs it off.`;
    yield { type: 'foeHurt', target: i, damage: s.damage, base: s.base, valor: s.valor, big: s.valor || s.crit, text };
  } else {
    yield { type: 'say', text: `${h.name} turns to run...` };
    if (fleeWorks(b.rng)) {
      b.outcome = 'fled';
      yield { type: 'fled', text: 'You got away.' };
      return;
    }
    yield { type: 'say', text: "Cut off! You can't escape." };
  }
  yield* sweep(b);
  if (!living(b).length) { yield* victory(b); return; }
  for (const f of turnOrder(b)) {
    yield* foeTurn(b, f);
    if (h.hp <= 0) { yield* fall(b); return; }
  }
}

function* foeTurn(b: Battle, f: Foe): BattleScript {
  const i = b.foes.indexOf(f), h = b.hero;
  yield { type: 'foeReady', foe: i };
  yield { type: 'say', text: `The ${f.name} attacks!` };
  const guard = (yield { type: 'foeStrike', foe: i }) === true;
  const { damage: d, base } = blow(f, h, guard, b.rng);
  h.hp = Math.max(0, h.hp - d);
  const text = guard ? `Guarded! ${h.name} takes only ${d}.` : d ? `${h.name} takes ${d} damage.` : `${h.name} dodges!`;
  yield { type: 'heroHurt', damage: d, base, guarded: guard, text };
}

/** Beaten foes shake off the Gloam and run home. */
function* sweep(b: Battle): BattleScript {
  for (const [i, f] of b.foes.entries()) {
    if (f.freed || f.hp > 0) continue;
    f.freed = true;
    yield { type: 'freed', foe: i, text: `The ${f.name} shakes off the Gloam and runs for home!` };
  }
}

function* victory(b: Battle): BattleScript {
  const { xp, gold } = rewards(b), h = b.hero;
  h.gold += gold;
  b.outcome = 'won';
  yield { type: 'reward', xp, gold, text: `Victory! Valor +${xp}, gold +${gold}.` };
  for (const lv of gainValor(h, xp)) yield { type: 'levelUp', lv, text: `${h.name} is now LV ${lv}!` };
}

function* fall(b: Battle): BattleScript {
  b.outcome = 'lost';
  yield { type: 'fall', text: `${b.hero.name} falls...` };
}

/**
 * Plays a whole battle with a simple policy, for tests and the balance probe: fight the weakest foe, Valor on
 * a share of rings. Returns the outcome and the number of rounds.
 */
export function autoplay(b: Battle, { valorRate = 0, flee = false } = {}) {
  const answer = (e: BattleEvent) => (e.type === 'heroStrike' || e.type === 'foeStrike' ? b.rng() < valorRate : undefined);
  const run = (script: BattleScript) => {
    let r = script.next();
    while (!r.done) r = script.next(answer(r.value));
  };
  run(opening(b));
  let rounds = 0;
  while (!b.outcome && rounds < 200) {
    const weakest = living(b).sort((a, c) => a.hp - c.hp)[0];
    run(round(b, flee ? { type: 'flee' } : { type: 'fight', target: b.foes.indexOf(weakest) }));
    rounds++;
  }
  return { outcome: b.outcome, rounds };
}
