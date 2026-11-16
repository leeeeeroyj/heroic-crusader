// Milestone 2 check: random encounters, the battle scene, FIGHT and FLEE, Valor timing, rewards, level-ups and falling.
// Usage: node tools/m2-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5222, debugPort: 9392 });
const { evaluate, until, shot, tap, down, up, check, sleep } = t;
const G = 'window.__heroicCrusader';
const WS = `${G}.scene.getScene('world')`;
const BS = `${G}.scene.getScene('battle')`;
const hero = () => evaluate(`({ ...${WS}.journey.hero, at: ${WS}.pos })`);
const inBattle = () => evaluate(`${G}.scene.isActive('battle')`);
const menuOpen = () => until(() => evaluate(`${G}.scene.isActive('battle') && ${BS}.menu === 'cmd'`), 10000);
/** Taps a key and leaves a gap: two taps inside one frame would count once. */
const press = async (k) => { await tap(k, 30); await sleep(90); };
const backOnMap = () => until(() => evaluate(`!${G}.scene.isActive('battle') && ${WS}.mode === 'walk' && ${G}.scene.isActive('world')`), 20000);

/** Picks FIGHT (and the first target) until the battle ends. */
async function fightItOut() {
  for (let i = 0; i < 400 && (await inBattle()); i++) {
    const s = await evaluate(`${G}.scene.isActive('battle') ? { m: ${BS}.menu, c: ${BS}.cursor } : null`);
    if (s?.m === 'cmd' && s.c !== 0) await press('ArrowUp');
    else if (s?.m === 'cmd' || s?.m === 'target') await press('Enter');
    await sleep(60);
  }
  await backOnMap();
}

/** Waits for the next ring and presses Z inside the window (true) or well before it (false). Returns the ring's who. */
async function pressOnRing(inside) {
  await until(() => evaluate(`!!(${G}.scene.isActive('battle') && ${BS}.ring)`), 10000, 10);
  const who = await evaluate(`${BS}.ring.who`);
  // Wait on the ring's own clock (game time, which lags the wall clock when frames are slow), and aim 0.1 s early:
  // the press reaches the game a frame or more later, and the window is 0.11 s either side.
  if (inside) await until(() => evaluate(`!${BS}.ring || ${BS}.ring.t >= ${BS}.ring.dur - 0.1`), 5000, 5);
  await tap('z', 30);
  return who;
}

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await sleep(600);
await tap('Enter');
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`));
await sleep(500);

// ---- Pure rules, straight from the modules ----
const pure = await evaluate(`(async () => {
  const B = await import('/src/battle.ts'), S = await import('/src/state.ts'), C = await import('/src/config.ts'), W = await import('/src/world.ts');
  const r = {};
  // Damage range: thousands of rolls of the LV 1 hero on a Puffcap.
  const j = S.newJourney(), atk = S.heroAtk(j.hero), foe = B.makeFoes(['puffcap'])[0], base = atk - foe.def / 2;
  const lo = Math.max(1, Math.round(base * C.BATTLE.dmgLo)), hi = Math.round(base * C.BATTLE.dmgHi);
  const clo = Math.round(atk * 0.45), chi = Math.round(atk * 0.55);
  const rng = W.rng(1); let ok = true, seen = new Set();
  for (let i = 0; i < 3000; i++) { const s = B.strike(j.hero, foe, false, rng); seen.add(s.damage); if (!(s.crit ? s.damage >= clo && s.damage <= chi : s.damage >= lo && s.damage <= hi)) ok = false; }
  r.range = { ok, lo, hi, seen: [...seen].sort((a, b) => a - b), hitsEnds: seen.has(lo) && seen.has(hi) };
  // Valor multiplies, a guard halves.
  const v = B.strike(j.hero, foe, true, W.rng(5)), nv = B.strike(j.hero, foe, false, W.rng(5));
  r.valor = { v: v.damage, nv: nv.damage, ok: v.damage === Math.round(Math.max(nv.damage, 1) * 1.5) };
  const g = B.blow(B.makeFoes(['bogtoad'])[0], j.hero, true, W.rng(9));
  r.guard = g.damage === Math.floor(g.base / 2);
  // Flee: 200 seeded tries.
  let fled = 0;
  for (let i = 0; i < 200; i++) {
    const b = B.newBattle(S.newJourney().hero, ['thornhare'], 'meadow', false, W.rng(1000 + i));
    const sc = B.round(b, { type: 'flee' }); let x = sc.next(); while (!x.done) x = sc.next(false);
    if (b.outcome === 'fled') fled++;
  }
  r.fled = fled;
  // Level-up at the threshold, and not before.
  const h = S.newJourney().hero;
  r.lvBefore = B.gainValor(h, C.LEVELS[1][5] - 1).length;
  const ups = B.gainValor(h, 1);
  r.lvAt = { ups, lv: h.lv, hp: h.hp, max: S.maxHp(h) };
  // Encounters: odds by ground, a third less where lit, none on sites or in the Hollow, none within the grace steps.
  const m = W.buildOverworld();
  const find = (t) => { for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.grid[y][x] === t && m.region[y][x] >= 0) return { x, y }; };
  const road = find('='), marsh = find('m'), hill = find('h'), town = m.sites.C, hollow = m.sites.G;
  const none = [false, false, false, false];
  r.odds = {
    road: W.encounterOdds(m, road.x, road.y, none), marsh: W.encounterOdds(m, marsh.x, marsh.y, none),
    marshLit: W.encounterOdds(m, marsh.x, marsh.y, [false, true, false, false]),
    town: W.encounterOdds(m, town.x, town.y, none), hollow: W.encounterOdds(m, hollow.x, hollow.y, none),
  };
  r.grace = W.rollEncounter(m, marsh.x, marsh.y, none, C.ENCOUNTER.grace, () => 0) === null && W.rollEncounter(m, marsh.x, marsh.y, none, C.ENCOUNTER.grace + 1, () => 0) !== null;
  r.hillsGround = W.groundAt(m, hill.x, hill.y);
  r.kin = Object.entries(C.CREATURES).filter(([, c]) => 'tint' in c).map(([id]) => id).filter((id) => !${G}.textures.exists('kin-' + id));
  return r;
})()`);
check('a LV 1 strike lands in the formula range, ends included', pure.range.ok && pure.range.hitsEnds, `${pure.range.lo}-${pure.range.hi}, seen ${pure.range.seen.join(',')}`);
check('Valor makes a strike 1.5x', pure.valor.ok, `${pure.valor.nv} -> ${pure.valor.v}`);
check('a guard halves a blow', pure.guard);
check('fleeing works about 2 in 3 (200 seeded tries)', pure.fled >= 116 && pure.fled <= 148, `${pure.fled}/200`);
check('no level-up one Valor short of the threshold', pure.lvBefore === 0);
check('a level-up at the threshold raises HP with it', pure.lvAt.lv === 2 && pure.lvAt.ups.join() === '2' && pure.lvAt.hp === pure.lvAt.max, JSON.stringify(pure.lvAt));
check('encounter odds: road 1/48, marsh 1/10, a third less when lit', Math.abs(pure.odds.road - 1 / 48) < 1e-9 && Math.abs(pure.odds.marsh - 0.1) < 1e-9 && Math.abs(pure.odds.marshLit - 0.1 * 2 / 3) < 1e-9);
check('no fights in towns or the Hollow', pure.odds.town === 0 && pure.odds.hollow === 0);
check('no fight within the grace steps', pure.grace);
check('hills fight on the hills ground', pure.hillsGround === 'hills');
check('every recoloured kin is baked', pure.kin.length === 0, pure.kin.join(', '));

// ---- A random encounter from walking ----
await evaluate(`${WS}.seed(7); ${WS}.teleport({ x: 22, y: 17 }); ${WS}.journey.sinceFight = 10`);
let met = false;
for (let i = 0; i < 12 && !met; i++) {
  await down(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await sleep(900); await up(i % 2 ? 'ArrowLeft' : 'ArrowRight');
  await sleep(200);
  met = await evaluate(`${WS}.mode !== 'walk'`);
}
check('walking the meadow leads to a random fight', met);
if (met) {
  await sleep(150);
  await shot('1-wipe');
  await menuOpen();
  const open = await evaluate(`({ foes: ${BS}.battle.foes.map((f) => f.id), ground: ${BS}.battle.ground, hud: ${G}.registry.get('hud').mode, steps: ${WS}.journey.sinceFight })`);
  check('the fight is from the meadow pool on meadow ground', open.ground === 'meadow' && open.foes.every((f) => ['thornhare', 'rook', 'puffcap'].includes(f)), JSON.stringify(open));
  check('the HUD switches to battle hints', open.hud === 'battle');
  await shot('2-battle-menu');
  await fightItOut();
}

// ---- Valor timing, in the game ----
await evaluate(`${WS}.seed(11); ${WS}.journey.hero.hp = 15; ${WS}.fight(['puffcap'])`);
await menuOpen();
// Plain blows only here: spores would take the place of the blow this check guards against.
await evaluate(`${BS}.battle.foes[0].traits = {}`);
await press('Enter');
await pressOnRing(true);
await until(() => evaluate(`${BS}.log.some((e) => e.type === 'foeHurt')`), 5000);
let hurt = await evaluate(`${BS}.log.find((e) => e.type === 'foeHurt')`);
check('a press inside the window is a Valor strike: 1.5x', hurt.valor && hurt.damage === Math.round(Math.max(hurt.base, 1) * 1.5), JSON.stringify(hurt));
await shot('3-valor');
// The puffcap's blow: guard it.
await pressOnRing(true);
await until(() => evaluate(`${BS}.log.some((e) => e.type === 'heroHurt')`), 5000);
const guarded = await evaluate(`${BS}.log.find((e) => e.type === 'heroHurt')`);
check('a press inside the window guards: half damage', guarded.guarded && guarded.damage === Math.floor(guarded.base / 2), JSON.stringify(guarded));
// Next round: press far too early.
await menuOpen();
await press('Enter');
await pressOnRing(false);
await until(() => evaluate(`${BS}.log.filter((e) => e.type === 'foeHurt').length === 2`), 5000);
hurt = await evaluate(`${BS}.log.filter((e) => e.type === 'foeHurt')[1]`);
check('a press outside the window does nothing extra', !hurt.valor && hurt.damage === hurt.base, JSON.stringify(hurt));
await fightItOut();

// ---- Fleeing, in the game ----
let fledInGame = false;
for (let s = 0; s < 6 && !fledInGame; s++) {
  await evaluate(`${WS}.seed(${300 + s}); ${WS}.journey.hero.hp = 15; ${WS}.fight(['rook'])`);
  await menuOpen();
  for (let k = 0; k < 8 && (await evaluate(`${BS}.cursor`)) !== 3; k++) await press('ArrowDown');
  check(`FLEE is under the cursor (try ${s + 1})`, await evaluate(`${BS}.cursor === 3`));
  await press('Enter');
  await until(() => evaluate(`!${G}.scene.isActive('battle') || ${BS}.menu === 'cmd'`), 15000);
  fledInGame = await evaluate(`!${G}.scene.isActive('battle') || ${BS}.battle.outcome === 'fled'`);
  if (!fledInGame) await fightItOut();
  else await backOnMap();
}
check('FLEE gets the hero away and back to the map', fledInGame);

// ---- Rewards and a level-up ----
await evaluate(`{ ${WS}.seed(21); const h = ${WS}.journey.hero; h.lv = 1; h.xp = 6; h.hp = 15; h.gold = 20; ${WS}.fight(['thornhare']); }`);
await menuOpen();
await shot('4-thornhare');
let levelShot = false;
for (let i = 0; i < 400 && (await inBattle()); i++) {
  const s = await evaluate(`${G}.scene.isActive('battle') ? { m: ${BS}.menu, up: ${BS}.log.some((e) => e.type === 'levelUp') } : null`);
  if (s?.up && !levelShot) { await sleep(300); await shot('5-level-up'); levelShot = true; }
  if (s?.m === 'cmd') await press('Enter');
  await sleep(100);
}
await backOnMap();
const after = await hero();
check('beating the Thornhare pays Valor and gold', after.xp === 7 && after.gold === 22, `xp ${after.xp}, gold ${after.gold}`);
check('Valor at the threshold makes the hero LV 2', after.lv === 2 && levelShot, `LV ${after.lv}`);

// ---- Falling ----
await evaluate(`{ ${WS}.seed(5); const h = ${WS}.journey.hero; h.hp = 1; h.gold = 51; ${WS}.teleport({ x: 30, y: 21 }); ${WS}.fight(['frostfang'], 'snow'); }`);
await menuOpen();
await shot('6-snow');
await fightItOut();
await sleep(400);
const fell = await hero();
const home = await evaluate(`${WS}.map.sites.C`);
check('a fall wakes the hero at the Brightkeep shrine', fell.at.x === home.x && fell.at.y === home.y, JSON.stringify(fell.at));
check('a fall costs half the gold and restores HP', fell.gold === 26 && fell.hp === 22, `gold ${fell.gold}, HP ${fell.hp}`);
const msg = await evaluate(`${G}.registry.get('hud').message?.text ?? ''`);
check('the shrine keeper says what happened', msg.includes('Half your gold (25)'), msg);
await sleep(300);
await shot('7-woke');

// ---- A three-foe fight and the kin look right ----
await evaluate(`${WS}.fight(['rimehare', 'frostwisp', 'gloombat'], 'ruins')`);
await menuOpen();
await press('Enter'); await press('ArrowRight');
await sleep(200);
const target = await evaluate(`({ menu: ${BS}.menu, cursor: ${BS}.cursor })`);
check('with three foes FIGHT asks which one, and the cursor moves', target.menu === 'target' && target.cursor === 1, JSON.stringify(target));
await shot('8-three-kin');
await press('x');
check('back returns to the commands', await evaluate(`${BS}.menu === 'cmd'`));

t.done();
