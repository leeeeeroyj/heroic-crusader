// Milestone 3 check: the full roster and its traits, spells and items in battle and on the map, the field menu.
// Usage: node tools/m3-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5226, debugPort: 9396 });
const { evaluate, until, shot, tap, check, sleep } = t;
const G = 'window.__heroicCrusader';
const WS = `${G}.scene.getScene('world')`;
const BS = `${G}.scene.getScene('battle')`;
const MS = `${G}.scene.getScene('menu')`;
const inBattle = () => evaluate(`${G}.scene.isActive('battle')`);
const cmdOpen = () => until(() => evaluate(`${G}.scene.isActive('battle') && ${BS}.menu === 'cmd'`), 15000);
const backOnMap = () => until(() => evaluate(`!${G}.scene.isActive('battle') && ${WS}.mode === 'walk' && ${G}.scene.isActive('world')`), 30000);
/** Taps a key and leaves a gap: two taps inside one frame would count once. */
const press = async (k) => { await tap(k, 30); await sleep(110); };
/** Taps `key` until `expr` reads `want`. Taps can merge or drop when headless frames are slow, so it checks each time. */
async function moveTo(expr, want, key = 'ArrowDown') {
  for (let i = 0; i < 16 && (await evaluate(expr)) !== want; i++) await press(key);
  return (await evaluate(expr)) === want;
}
/** Presses confirm until `expr` is true. */
async function confirmUntil(expr, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await evaluate(expr)) return true; await press('Enter'); await sleep(150); }
  return evaluate(expr);
}

/** Picks FIGHT (and the first target) until the battle ends. */
async function fightItOut() {
  for (let i = 0; i < 400 && (await inBattle()); i++) {
    const s = await evaluate(`${G}.scene.isActive('battle') ? { m: ${BS}.menu, c: ${BS}.cursor } : null`);
    if (s?.m === 'cmd' && s.c !== 0) await press('ArrowUp');
    else if (s?.m === 'cmd' || s?.m === 'target') await press('Enter');
    else if (s?.m === 'spell' || s?.m === 'item') await press('x');
    await sleep(60);
  }
  await backOnMap();
}

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await sleep(600);
// Enter starts a new journey, then Enter again keeps the default name.
for (let i = 0; i < 20 && !(await evaluate(`${G}.scene.isActive('world')`)); i++) { await tap('Enter', 30); await sleep(400); }
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`));
await sleep(500);
await evaluate(`${WS}.calm = true`);

// ---- Pure rules: traits, statuses, spells and items, with the chances forced ----
const pure = await evaluate(`(async () => {
  const B = await import('/src/battle.ts'), S = await import('/src/state.ts'), C = await import('/src/config.ts'), F = await import('/src/field.ts'), W = await import('/src/world.ts');
  const at = (lv) => { const j = S.newJourney(), h = j.hero; h.lv = lv; h.hp = S.maxHp(h); h.mp = S.maxMp(h); h.xp = C.LEVELS[lv - 1][5]; return j; };
  const zero = () => 0, high = () => 0.99;
  const fight = (lv, ids, rng = zero) => { const j = at(lv); return { j, b: B.newBattle(j.hero, ids, 'meadow', false, rng) }; };
  const types = (ev) => ev.map((e) => e.type);
  const r = {};

  r.roster = Object.keys(C.CREATURES).length;
  r.pools = Object.entries(C.POOLS).flatMap(([g, groups]) => groups.flat().filter((id) => !C.CREATURES[id]).map((id) => g + ':' + id));
  r.kin = Object.entries(C.CREATURES).filter(([, c]) => 'tint' in c).map(([id]) => id).filter((id) => !${G}.textures.exists('kin-' + id));

  // Spores (sleep): the hero nods off and loses the next action.
  { const { b } = fight(1, ['puffcap']);
    const ev = B.runScript(B.foeTurn(b, b.foes[0]));
    const next = B.runScript(B.round(b, { type: 'fight', target: 0 }));
    r.sleep = { slept: ev.some((e) => e.type === 'status' && e.status === 'sleep' && e.on), noStrike: !next.some((e) => e.type === 'heroStrike'), awake: next.some((e) => e.type === 'status' && e.who === 'hero' && e.status === 'sleep' && !e.on) }; }

  // Poison: a Bogtoad bite, a sting each round, a bite each step, never below 1 HP.
  { const { b } = fight(10, ['bogtoad']);
    B.runScript(B.foeTurn(b, b.foes[0]));
    r.bite = b.hero.poisoned;
    const { b: b2 } = fight(10, ['rustguard'], high); b2.hero.poisoned = true; b2.foes[0].sleep = 3;
    const ev = B.runScript(B.round(b2, { type: 'fight', target: 0 }));
    const last = ev.at(-1);
    r.roundSting = last.type === 'heroHurt' && last.kind === 'poison' && last.damage === Math.floor(S.maxHp(b2.hero) / 16);
    const j = S.newJourney(); j.hero.poisoned = true; j.hero.hp = 3;
    const lost = [1, 2, 3, 4].map(() => S.stepEffects(j));
    r.steps = { lost, hp: j.hero.hp }; }

  // Hush: no spells for the rest of the fight; MP isn't spent.
  { const { b } = fight(10, ['frostwisp']);
    B.runScript(B.foeTurn(b, b.foes[0]));
    const mp = b.hero.mp, ev = B.runScript(B.round(b, { type: 'spell', spell: 'mend' }));
    r.hush = { hushed: b.hushed, canCast: B.canCast(b, 'mend'), mp: b.hero.mp === mp, words: ev.some((e) => e.type === 'say' && e.text.includes("won't come")) }; }

  // Drain: the Duskbat drinks half the damage it does.
  { const { b } = fight(1, ['duskbat']); const f = b.foes[0]; f.hp = 4;
    const ev = B.runScript(B.foeTurn(b, f)), hurt = ev.find((e) => e.type === 'heroHurt'), heal = ev.find((e) => e.type === 'heal');
    r.drain = { dmg: hurt.damage, healed: heal?.amount, hp: f.hp, ok: heal?.amount === Math.ceil(hurt.damage * 0.5) && f.hp === 4 + heal.amount }; }

  // Steal: the Rook snatches gold and flies off; no reward for it.
  { const { b } = fight(1, ['rook']); const g0 = b.hero.gold, xp0 = b.hero.xp;
    const ev = B.runScript(B.round(b, { type: 'fight', target: 0 }));
    const leave = ev.find((e) => e.type === 'leave');
    r.steal = { left: !!leave, gold: g0 - b.hero.gold, took: leave?.gold, outcome: b.outcome, xp: b.hero.xp - xp0 }; }

  // Howl: another Frostfang joins, up to three.
  { const { b } = fight(10, ['frostfang']);
    const ev = B.runScript(B.foeTurn(b, b.foes[0]));
    B.runScript(B.foeTurn(b, b.foes[0]));
    const third = B.runScript(B.foeTurn(b, b.foes[0]));
    r.howl = { joined: ev.some((e) => e.type === 'join' && e.foe === 1), count: b.foes.length, capped: third.some((e) => e.type === 'foeStrike') }; }

  // Brace: the Cairn braces every other turn and takes half damage meanwhile.
  { const { b } = fight(10, ['cairn']); const f = b.foes[0];
    B.runScript(B.foeTurn(b, f));
    const braced = f.braced, want = Math.floor(B.strike(b.hero, f, false, high).damage / 2);
    b.rng = high;
    const ev = B.runScript(B.round(b, { type: 'fight', target: 0 }));
    const hurt = ev.find((e) => e.type === 'foeHurt');
    r.brace = { braced, damage: hurt.damage, want, lowered: !f.braced && ev.some((e) => e.type === 'status' && e.status === 'brace' && !e.on) }; }

  // Evade, quick, twice, a foe's Spark.
  { const { b } = fight(10, ['marshwisp']); const hp = b.foes[0].hp;
    const ev = B.runScript(B.round(b, { type: 'fight', target: 0 }));
    r.evade = ev.some((e) => e.type === 'miss') && b.foes[0].hp === hp;
    const { b: b2 } = fight(10, ['marshwisp']);
    const sp = B.runScript(B.foeTurn(b2, b2.foes[0])).find((e) => e.type === 'heroHurt');
    r.spark = sp?.kind === 'fire' && sp.damage === 6;
    const { b: b3 } = fight(10, ['thornhare']);
    const q = types(B.runScript(B.round(b3, { type: 'fight', target: 0 })));
    r.quick = q.indexOf('foeReady') >= 0 && q.indexOf('foeReady') < q.indexOf('heroStrike');
    const { b: b4 } = fight(15, ['rimehare']);
    r.twice = types(B.runScript(B.foeTurn(b4, b4.foes[0]))).filter((x) => x === 'foeStrike').length; }

  // Spells: ranges over many seeded casts; MP spent; Lull puts everything to sleep and a hurt sleeper wakes.
  { const rng = W.rng(3), seen = { spark: [], flare: [], mend: [] };
    for (let i = 0; i < 300; i++) {
      const { b } = fight(15, ['cairn', 'cairn'], rng);
      b.foes.forEach((f) => { f.traits = {}; f.sleep = 9; });
      const mp = b.hero.mp;
      const ev = B.runScript(B.round(b, { type: 'spell', spell: i % 2 ? 'flare' : 'spark', target: 1 }));
      const hits = ev.filter((e) => e.type === 'foeHurt');
      (i % 2 ? seen.flare : seen.spark).push(...hits.map((e) => e.damage));
      if (i === 0) r.sparkOne = hits.length === 1 && hits[0].target === 1 && b.hero.mp === mp - C.SPELLS.spark.mp;
      if (i === 1) r.flareAll = hits.length === 2 && b.hero.mp === mp - C.SPELLS.flare.mp;
      const { b: m } = fight(15, ['cairn'], rng); m.hero.hp = 1; m.foes[0].sleep = 9;
      B.runScript(B.round(m, { type: 'spell', spell: 'mend' })); seen.mend.push(m.hero.hp - 1);
    }
    const span = (a) => [Math.min(...a), Math.max(...a)];
    r.ranges = { spark: span(seen.spark), flare: span(seen.flare), mend: span(seen.mend) };
    const { b } = fight(10, ['thornhare', 'thornhare', 'thornhare']);
    B.runScript(B.round(b, { type: 'spell', spell: 'lull' }));
    r.lull = b.foes.map((f) => f.sleep);
    const { b: w } = fight(15, ['cairn']); w.foes[0].sleep = 2; w.foes[0].traits = {}; w.rng = high;
    const ev = B.runScript(B.round(w, { type: 'fight', target: 0 }));
    r.wake = w.foes[0].sleep === 0 && ev.some((e) => e.type === 'foeHurt' && e.text.includes('wakes')); }

  // Items in battle: herb heals and is used up; remedy only when poisoned.
  { const { b } = fight(5, ['cairn']); b.foes[0].sleep = 9; b.hero.hp = 5;
    B.runScript(B.round(b, { type: 'item', item: 'herb' }));
    r.herb = { hp: b.hero.hp - 5, left: S.count(b.hero, 'herb') };
    S.addItem(b.hero, 'remedy');
    r.remedy = { early: B.canUse(b, 'remedy') };
    b.hero.poisoned = true;
    r.remedy.poisoned = B.canUse(b, 'remedy');
    B.runScript(B.round(b, { type: 'item', item: 'remedy' }));
    r.remedy.cured = !b.hero.poisoned && S.count(b.hero, 'remedy') === 0;
    const room = C.ITEMS.herb.max - S.count(b.hero, 'herb');
    r.cap = S.addItem(b.hero, 'herb', 20) === room && S.count(b.hero, 'herb') === C.ITEMS.herb.max; }

  // Learning: a level-up names the new spell.
  { const { b } = fight(2, ['thornhare']); b.hero.xp = C.LEVELS[2][5] - 1; b.foes[0].hp = 1; b.foes[0].traits = {}; b.rng = high;
    const ev = B.runScript(B.round(b, { type: 'fight', target: 0 }));
    const up = ev.find((e) => e.type === 'levelUp');
    r.learn = up?.lv === 3 && up.learned.join() === 'mend' && up.text.includes('Learned Mend'); }

  // On the map: field spells and items.
  { const j = at(15), h = j.hero;
    r.fieldSpells = F.fieldSpells(j).join();
    h.hp = 10; const mend = F.castInField(j, 'mend', zero);
    r.fieldMend = mend.ok && h.hp === 10 + C.SPELLS.mend.heal[0] && h.mp === S.maxMp(h) - C.SPELLS.mend.mp;
    r.glow = !F.castInField(j, 'glow', zero).ok && F.castInField(j, 'glow', zero, true).ok;
    F.castInField(j, 'ward', zero); r.ward = j.ward === C.STATUS.wardSteps;
    r.home = F.castInField(j, 'homeward', zero).home === true;
    h.mp = 0; r.noMp = !F.castInField(j, 'mend', zero).ok;
    const j2 = at(1);
    r.lv1 = { spells: F.fieldSpells(j2).length, items: F.fieldItems(j2).join() };
    r.noSpell = !F.castInField(j2, 'mend', zero).ok;
    S.addItem(j2.hero, 'incense'); j2.ward = 0; F.useInField(j2, 'incense', zero);
    r.incense = j2.ward === C.STATUS.incenseSteps;
    r.remedyIdle = !F.useInField(j2, 'remedy', zero).ok; }
  return r;
})()`);

check('the roster has 17 creatures and every pool names real ones', pure.roster === 17 && pure.pools.length === 0, `${pure.roster}; ${pure.pools.join(', ')}`);
check('every recoloured kin is baked', pure.kin.length === 0, pure.kin.join(', '));
check('spores put the hero to sleep for a turn', pure.sleep.slept && pure.sleep.noStrike && pure.sleep.awake, JSON.stringify(pure.sleep));
check('a Bogtoad bite poisons', pure.bite);
check('poison stings each round (1/16 of max HP)', pure.roundSting);
check('poison bites each step but never below 1 HP', pure.steps.lost.join() === '1,1,0,0' && pure.steps.hp === 1, JSON.stringify(pure.steps));
check('Hush stops spells and keeps the MP', pure.hush.hushed && !pure.hush.canCast && pure.hush.mp && pure.hush.words, JSON.stringify(pure.hush));
check('drain heals the Duskbat by half the damage', pure.drain.ok, JSON.stringify(pure.drain));
check('a Rook steals gold, flies off and pays nothing', pure.steal.left && pure.steal.gold === pure.steal.took && pure.steal.outcome === 'won' && pure.steal.xp === 0, JSON.stringify(pure.steal));
check('a howl brings another Frostfang, up to three', pure.howl.joined && pure.howl.count === 3 && pure.howl.capped, JSON.stringify(pure.howl));
check('a braced Cairn takes half damage, then lowers its guard', pure.brace.braced && pure.brace.damage === pure.brace.want && pure.brace.lowered, JSON.stringify(pure.brace));
check('a wisp can dodge a strike', pure.evade);
check("a Marshwisp's Spark does fire damage", pure.spark);
check('a quick Thornhare can act before the hero', pure.quick);
check('a Rimehare bites twice', pure.twice === 2, String(pure.twice));
check('Spark hits one foe, Flare hits all, both cost MP', pure.sparkOne && pure.flareAll);
check('Spark 8-12, Flare 22-30, Mend 17-23 over 300 casts', pure.ranges.spark.join() === '8,12' && pure.ranges.flare.join() === '22,30' && pure.ranges.mend.join() === '17,23', JSON.stringify(pure.ranges));
check('Lull puts all three to sleep for 2-3 turns', pure.lull.every((s) => s >= 2 && s <= 3), pure.lull.join());
check('a sleeping foe wakes when hurt', pure.wake);
check('a herb heals 22-28 and is used up', pure.herb.hp >= 22 && pure.herb.hp <= 28 && pure.herb.left === 1, JSON.stringify(pure.herb));
check('a remedy works only when poisoned, and cures', !pure.remedy.early && pure.remedy.poisoned && pure.remedy.cured, JSON.stringify(pure.remedy));
check('the pack holds at most 6 herbs', pure.cap);
check('LV 3 learns Mend, and the message says so', pure.learn);
check('LV 15 can cast Mend, Glow, Ward, Homeward and Restore on the map', pure.fieldSpells === 'mend,glow,ward,homeward,restore', pure.fieldSpells);
check('Mend on the map heals and spends MP', pure.fieldMend);
check('Glow only works in the dark', pure.glow);
check('Ward lasts 200 steps; incense 120', pure.ward && pure.incense);
check('Homeward sends the hero home', pure.home);
check('no MP, or no such spell, means no casting', pure.noMp && pure.noSpell);
check('LV 1 has no field spells and starts with herbs', pure.lv1.spells === 0 && pure.lv1.items === 'herb', JSON.stringify(pure.lv1));
check("a remedy isn't wasted when not poisoned", pure.remedyIdle);

// ---- On the map: poison per step, a town rest cures it, Ward turns weak creatures away ----
const road = await evaluate(`(() => { const m = ${WS}.map; for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.grid[y][x] === '.' && m.region[y][x] === 0) return { x, y }; })()`);
await evaluate(`{ const h = ${WS}.journey.hero; h.poisoned = true; h.hp = 4; ${WS}.teleport(${JSON.stringify(road)}); for (let i = 0; i < 5; i++) ${WS}.arrive(); }`);
const stung = await evaluate(`({ hp: ${WS}.journey.hero.hp, hud: ${G}.registry.get('hud').poisoned })`);
check('walking poisoned costs HP, down to 1', stung.hp === 1, JSON.stringify(stung));
await sleep(200);
check('the HUD knows the hero is poisoned', await evaluate(`${G}.registry.get('hud').poisoned`));
await shot('1-poisoned');
await evaluate(`{ ${WS}.journey.hero.poisoned = false; ${WS}.journey.hero.hp = 15; }`);

await evaluate(`{ ${WS}.setLevel(10); ${WS}.calm = false; ${WS}.journey.ward = 50; ${WS}.journey.sinceFight = 20; ${WS}.rand = () => 0; ${WS}.teleport(${JSON.stringify(road)}); ${WS}.arrive(); }`);
check('with Ward on, meadow creatures keep away', await evaluate(`${WS}.mode === 'walk'`));
await evaluate(`{ ${WS}.journey.ward = 0; ${WS}.journey.sinceFight = 20; ${WS}.arrive(); }`);
check('with Ward worn off, they come again', await evaluate(`${WS}.mode !== 'walk'`));
await cmdOpen();
await evaluate(`${WS}.seed(4)`);
await fightItOut();
await evaluate(`${WS}.calm = true`);

// ---- In battle: the SPELL and ITEM menus ----
await evaluate(`{ ${WS}.seed(31); ${WS}.setLevel(12); ${WS}.give('herb', 6); ${WS}.give('remedy', 2); ${WS}.journey.hero.hp = 30; ${WS}.fight(['bogtoad', 'rotcap', 'bogtoad'], 'marsh'); }`);
await cmdOpen();
// Sturdy, harmless foes, so the fight outlasts the menus.
await evaluate(`${BS}.battle.foes.forEach((f) => { f.traits = {}; f.atk = 1; f.hp = f.maxHp = 200; })`);
check('SPELL is under the cursor', await moveTo(`${BS}.cursor`, 1));
await press('Enter');
check('SPELL opens the spell list', await until(() => evaluate(`${BS}.menu === 'spell'`), 3000).catch(() => false));
const spells = await evaluate(`${BS}.options().map((o) => o.label)`);
check('the list shows battle spells with their MP', spells.join() === 'MEND 3,SPARK 2,LULL 2,FLARE 5', spells.join());
await shot('2-spell-menu');
check('Lull is under the cursor', await moveTo(`${BS}.listCursor`, 2));
await press('Enter');
await until(() => evaluate(`${BS}.log.some((e) => e.type === 'cast' && e.spell === 'lull')`), 8000);
await until(() => evaluate(`${BS}.log.some((e) => e.type === 'status' && e.status === 'sleep')`), 8000);
await sleep(500);
await shot('3-lull');
check('Lull in the game puts foes to sleep', await evaluate(`${BS}.battle.foes.some((f) => f.sleep > 0)`));
await cmdOpen();
// Flare: every foe takes fire.
await moveTo(`${BS}.cursor`, 1);
await press('Enter');
await until(() => evaluate(`${BS}.menu === 'spell'`), 3000);
await moveTo(`${BS}.listCursor`, 3);
await press('Enter');
await until(() => evaluate(`${BS}.log.filter((e) => e.type === 'bolt').length >= 2`), 8000);
await sleep(150);
await shot('4-flare');
await until(() => evaluate(`${BS}.log.filter((e) => e.type === 'foeHurt' && e.fire).length >= 3 || !${G}.scene.isActive('battle')`), 10000);
check('Flare hits all three', await evaluate(`${BS}.log.filter((e) => e.type === 'foeHurt' && e.fire).length >= 3`));
await until(() => evaluate(`!${G}.scene.isActive('battle') || ${BS}.menu === 'cmd'`), 15000);
if (await inBattle()) {
  // ITEM: a herb.
  await evaluate(`${WS}.journey.hero.hp = 20`);
  await moveTo(`${BS}.cursor`, 2);
  await press('Enter');
  check('ITEM opens the pack', await until(() => evaluate(`${BS}.menu === 'item'`), 3000).catch(() => false));
  const items = await evaluate(`${BS}.options().map((o) => o.label + (o.ok ? '' : '-'))`);
  check('the pack shows herbs, and a remedy greyed out while not poisoned', items.join() === 'HERB x6,REMEDY x2-', items.join());
  await shot('5-item-menu');
  await press('Enter');
  await until(() => evaluate(`${BS}.log.some((e) => e.type === 'heal' && e.who === 'hero')`), 8000);
  check('a herb in battle heals', await evaluate(`${WS}.journey.hero.hp > 20 && ${WS}.journey.hero.items.herb === 5`));
  // Hushed: the spells grey out.
  await until(() => evaluate(`!${G}.scene.isActive('battle') || ${BS}.menu === 'cmd'`), 15000);
}
if (await inBattle()) {
  await evaluate(`${BS}.battle.hushed = true`);
  await moveTo(`${BS}.cursor`, 1);
  await press('Enter');
  await until(() => evaluate(`${BS}.menu === 'spell'`), 3000);
  check('hushed, every spell is greyed out', await evaluate(`${BS}.options().every((o) => !o.ok)`));
  await shot('6-hushed');
  await press('x');
  check('back leaves the spell list', await until(() => evaluate(`${BS}.menu === 'cmd'`), 3000).catch(() => false));
  await evaluate(`${BS}.battle.foes.forEach((f) => { f.hp = Math.min(f.hp, 1); f.def = 0; })`);
}
await fightItOut();

// ---- Traits on screen: a howl, a theft ----
await evaluate(`{ ${WS}.journey.hero.hp = 200; ${WS}.fight(['frostfang'], 'snow'); }`);
await cmdOpen();
await evaluate(`{ const b = ${BS}.battle; b.rng = () => 0; }`);
await press('Enter');
await until(() => evaluate(`${BS}.log.some((e) => e.type === 'join') || !${G}.scene.isActive('battle')`), 10000);
await sleep(700);
await shot('7-howl');
check('a howl brings a second Frostfang onto the screen', await evaluate(`${BS}.battle.foes.length === 2 && ${BS}.foeImgs.length === 2`));
await evaluate(`{ const b = ${BS}.battle; b.rng = Math.random; b.foes.forEach((f) => { f.hp = 1; f.def = 0; f.traits = {}; }); }`);
await fightItOut();

await evaluate(`{ ${WS}.journey.hero.gold = 50; ${WS}.fight(['rook']); }`);
await cmdOpen();
await evaluate(`{ const b = ${BS}.battle; b.rng = () => 0; b.foes[0].hp = 99; b.foes[0].maxHp = 99; }`);
await press('Enter');
await until(() => evaluate(`${BS}.log.some((e) => e.type === 'leave') || !${G}.scene.isActive('battle')`), 10000);
await sleep(300);
await shot('8-theft');
await backOnMap();
check('the Rook flew off with the gold and the fight ended', await evaluate(`${WS}.journey.hero.gold === 47`), String(await evaluate(`${WS}.journey.hero.gold`)));

// ---- The whole roster, three at a time ----
const roster = await evaluate(`(async () => Object.keys((await import('/src/config.ts')).CREATURES))()`);
const grounds = ['meadow', 'marsh', 'snow', 'ruins', 'dungeon', 'hollow'];
for (let i = 0; i < roster.length; i += 3) {
  const ids = roster.slice(i, i + 3), ground = grounds[i / 3];
  await evaluate(`{ ${WS}.journey.hero.hp = 200; ${WS}.fight(${JSON.stringify(ids)}, '${ground}'); }`);
  await cmdOpen();
  await sleep(200);
  await shot(`9-roster-${String(i / 3 + 1)}`);
  await evaluate(`${BS}.battle.foes.forEach((f) => { f.hp = 1; f.def = 0; f.traits = {}; })`);
  await fightItOut();
}
check('every creature appeared in a fight', true, `${roster.length} creatures`);

// ---- The field menu ----
await evaluate(`{ ${WS}.setLevel(10); const h = ${WS}.journey.hero; h.hp = 20; h.poisoned = true; ${WS}.give('remedy', 1); ${WS}.teleport(${JSON.stringify(road)}); }`);
await sleep(200);
await tap('Escape', 30);
check('Esc opens the field menu', await until(() => evaluate(`${G}.scene.isActive('menu')`), 5000).catch(() => false));
await sleep(300);
await shot('10-field-menu');
await press('Enter');
check('SPELL lists the field spells', await until(() => evaluate(`${MS}.page === 'spell'`), 3000).catch(() => false));
await press('Enter');
await until(() => evaluate(`${MS}.note.includes('Mend')`), 3000).catch(() => {});
check('Mend from the menu heals', await evaluate(`${WS}.journey.hero.hp > 20`), await evaluate(`${MS}.note`));
await shot('11-field-mend');
await press('x');
await until(() => evaluate(`${MS}.page === 'top'`), 3000);
await moveTo(`${MS}.cursor`, 1);
await press('Enter');
await until(() => evaluate(`${MS}.page === 'item'`), 3000);
const remedyRow = await evaluate(`${MS}.rowsFor().findIndex((r) => r.item === 'remedy')`);
await moveTo(`${MS}.cursor`, remedyRow);
await press('Enter');
await until(() => evaluate(`!${WS}.journey.hero.poisoned`), 3000).catch(() => {});
check('a remedy from the menu cures poison', await evaluate(`!${WS}.journey.hero.poisoned`), await evaluate(`${MS}.note`));
// Homeward.
await press('x');
await until(() => evaluate(`${MS}.page === 'top'`), 3000);
await moveTo(`${MS}.cursor`, 0);
await press('Enter');
await until(() => evaluate(`${MS}.page === 'spell'`), 3000);
const homeRow = await evaluate(`${MS}.rowsFor().findIndex((r) => r.spell === 'homeward')`);
await moveTo(`${MS}.cursor`, homeRow);
await press('Enter');
await until(() => evaluate(`!${G}.scene.isActive('menu') && ${WS}.mode === 'walk'`), 5000);
const home = await evaluate(`({ area: ${WS}.area, at: ${WS}.pos })`);
check('Homeward takes the hero back to the Brightkeep shrine', home.area === 'C' && home.at.x === 21 && home.at.y === 4, JSON.stringify(home));
await sleep(500);
await shot('12-homeward');
// Esc closes the menu again and walking resumes.
await tap('Escape', 30);
await until(() => evaluate(`${G}.scene.isActive('menu')`), 5000);
await sleep(200);
await tap('Escape', 30);
await until(() => evaluate(`!${G}.scene.isActive('menu') && ${WS}.mode === 'walk'`), 5000);
await sleep(400);
check("closing the menu doesn't open it again", await evaluate(`!${G}.scene.isActive('menu') && ${WS}.mode === 'walk'`));

t.done();
