// Milestone 5a check: the beacon dungeons (floors, stairs, dark, chests, doors), the wardens, and relighting.
// Usage: node tools/m5-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5228, debugPort: 9394 });
const { evaluate, until, shot, tap, check, sleep, send } = t;
const G = 'window.__heroicCrusader';
const WS = `${G}.scene.getScene('world')`;
const BS = `${G}.scene.getScene('battle')`;
const MS = `${G}.scene.getScene('menu')`;
const TI = `${G}.scene.getScene('title')`;
const hud = () => evaluate(`${G}.registry.get('hud')`);
const where = () => evaluate(`({ area: ${WS}.area, pos: ${WS}.pos })`);
const press = async (k) => { await tap(k, 30); await sleep(150); };
/** Taps until `expr` reads `want`; taps can be lost when headless frames are slow. */
async function tapUntil(key, expr, tries = 8) {
  for (let i = 0; i < tries && !(await evaluate(expr)); i++) { await press(key); await sleep(250); }
  return evaluate(expr);
}
/** Stands the hero on a tile of an area, facing a way. */
async function stand(area, x, y, facing = 'up') {
  await evaluate(`{ ${WS}.teleport({ x: ${x}, y: ${y} }, '${area}'); ${WS}.facing = '${facing}'; }`);
  await sleep(150);
}
/** Plays a battle out: picks FIGHT (or backs out of lists) whenever the commands are up. */
async function fightItOut() {
  for (let i = 0; i < 400 && (await evaluate(`${G}.scene.isActive('battle')`)); i++) {
    const m = await evaluate(`${BS}.menu`);
    if (m === 'spell' || m === 'item') await press('x');
    else if (m === 'cmd') { await evaluate(`${BS}.cursor = 0`); await press('z'); }
    else if (m === 'target') await press('z');
    await sleep(100);
  }
  await until(() => evaluate(`!${G}.scene.isActive('battle') && ${WS}.mode === 'walk'`), 10000);
}

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await sleep(600);

// ---- Pure: the floors, the rules, the save ----
const pure = await evaluate(`(async () => {
  const D = await import('/src/data/dungeons.ts'), W = await import('/src/world.ts'), C = await import('/src/config.ts');
  const B = await import('/src/battle.ts'), S = await import('/src/state.ts'), F = await import('/src/field.ts'), Sv = await import('/src/save.ts');
  const r = { floors: [], ways: [], doors: [], chests: [], loot: [], stairs: [] };
  for (const [site, d] of Object.entries(D.DUNGEONS)) d.floors.forEach((rows, fi) => {
    const tag = site + '.' + fi, w = rows[0].length, last = fi === d.floors.length - 1;
    const n = (c) => rows.join('').split(c).length - 1;
    if (!rows.every((row) => row.length === w) || w < 26 || rows.length < 15) r.floors.push(tag + ' size');
    if (n('<') !== 1 || n('>') !== (last ? 0 : 1) || n('W') !== (last ? 1 : 0) || (last && n('^') < 1)) r.floors.push(tag + ' stairs/warden/brazier');
    if (n('$') !== d.loot[fi].length) r.floors.push(tag + ' chests ' + n('$') + ' vs loot ' + d.loot[fi].length);
    for (const l of d.loot[fi]) if (!('gold' in l) && !('item' in l ? C.ITEMS[l.item] : C.GEAR[l.gear])) r.loot.push(tag + ' ' + JSON.stringify(l));
    // With every door shut and no key: from the stairs in, the way on (the next stairs, or the warden) is open.
    const m = W.buildDungeon(site, fi), from = W.besideStairs(m, m.sites['<']);
    if (!W.walkable(m, from.x, from.y, 0)) r.stairs.push(tag + ' arrival');
    if (m.sites['>'] && !W.walkable(m, ...Object.values(W.besideStairs(m, m.sites['>'])), 0)) r.stairs.push(tag + ' return');
    const goal = m.sites['>'] ?? m.sites.W;
    const reach = (to) => (to.x === from.x && to.y === from.y) || W.bfs(m, from, to, 0).length > 0;
    if (!reach(goal)) r.ways.push(tag);
    // Every door can be walked up to; every chest can be reached once the doors are open.
    const near = (mm, x, y) => [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dx, dy]) => W.walkable(mm, x + dx, y + dy, 0) && (x + dx === from.x && y + dy === from.y || W.bfs(mm, from, { x: x + dx, y: y + dy }, 0).length > 0));
    const open = W.buildDungeon(site, fi, rows.flatMap((row, y) => row.split('').flatMap((c, x) => c === '|' ? [tag + ':' + x + ',' + y] : [])));
    rows.forEach((row, y) => row.split('').forEach((c, x) => {
      if (c === '|' && !near(m, x, y)) r.doors.push(tag + ' ' + x + ',' + y);
      if (c === '$' && !near(open, x, y)) r.chests.push(tag + ' ' + x + ',' + y);
    }));
  });
  // Encounters underground.
  { const m = W.buildDungeon('2', 0), s = m.sites['<'], f = W.besideStairs(m, s);
    r.odds = { floor: W.encounterOdds(m, f.x, f.y, [false, false, false, false]), stairs: W.encounterOdds(m, s.x, s.y, [false, false, false, false]) };
    const seen = new Set(); const rand = W.rng(3);
    for (let i = 0; i < 400; i++) { const e = W.rollEncounter(m, f.x, f.y, [false, false, false, false], 99, rand); if (e) seen.add(e.ground + ':' + e.foes.join('+')); }
    r.pool = [...seen].every((k) => k.startsWith('belfry:')) && seen.size > 1; }
  // Wardens: the intro, no fleeing, no Lull, the tell a turn ahead, then the big move.
  const fresh = (lv, foe) => { const j = S.newJourney(); j.hero.lv = lv; j.hero.hp = S.maxHp(j.hero); j.hero.mp = S.maxMp(j.hero); return B.newBattle(j.hero, [foe], 'barrow', false, W.rng(9)); };
  { const b = fresh(10, 'bristleback');
    r.intro = B.runScript(B.opening(b))[0].text;
    let fled = 0; for (let i = 0; i < 100; i++) { const bb = fresh(15, 'bristleback'); B.runScript(B.round(bb, { type: 'flee' })); if (bb.outcome === 'fled') fled++; }
    r.fled = fled;
    const bb = fresh(15, 'bristleback'); bb.foes[0].hp = 999; B.runScript(B.round(bb, { type: 'spell', spell: 'lull' })); r.lull = bb.foes[0].sleep; }
  { // Beats: 1 a blow, 2 the tell, 3 the charge (twice a blow, halved by a guard).
    const b = fresh(15, 'bristleback'), f = b.foes[0]; f.hp = 9999; b.hero.hp = 9999;
    const turn = (guard) => B.runScript(B.foeTurn(b, f), (e) => e.type === 'foeStrike' ? guard : undefined);
    const t1 = turn(false), t2 = turn(false), t3 = turn(false);
    r.beats = [t1.some((e) => e.type === 'heroHurt') && !t1.some((e) => e.type === 'tell'), t2.some((e) => e.type === 'tell') && !t2.some((e) => e.type === 'heroHurt'), t3.some((e) => e.type === 'big')];
    const big = t3.find((e) => e.type === 'heroHurt'), atk = f.atk, def = S.heroDef(b.hero);
    const lo = Math.round(Math.max(1, Math.round((atk - def / 2) * C.BATTLE.dmgLo)) * 2), hi = Math.round(Math.round((atk - def / 2) * C.BATTLE.dmgHi) * 2);
    r.charge = { d: big.damage, lo, hi };
    turn(false); turn(false); const g = turn(true).find((e) => e.type === 'heroHurt');
    r.guard = g.guarded && g.damage === Math.floor(g.base / 2); }
  { const b = fresh(15, 'croakley'), f = b.foes[0]; f.hp = 9999; b.hero.hp = 9999; f.traits = {};
    B.runScript(B.foeTurn(b, f)); B.runScript(B.foeTurn(b, f)); const ev = B.runScript(B.foeTurn(b, f));
    const d = ev.find((e) => e.type === 'heroHurt').damage; r.breath = d >= 14 && d <= 20 && b.hero.poisoned && !ev.some((e) => e.type === 'foeStrike'); }
  { const b = fresh(15, 'regent'), f = b.foes[0]; f.hp = 100; b.hero.hp = 9999;
    B.runScript(B.foeTurn(b, f)); B.runScript(B.foeTurn(b, f)); const ev = B.runScript(B.foeTurn(b, f));
    const d = ev.find((e) => e.type === 'heroHurt').damage; r.drain = f.hp === 100 + d && d >= 20 && d <= 26; }
  // Chests.
  { const h = S.newJourney().hero; h.gold = 0;
    r.gold = F.openChest(h, { gold: 40 }).ok && h.gold === 40;
    r.item = F.openChest(h, { item: 'remedy', n: 2 }).text;
    S.addItem(h, 'herb', 9); r.full = !F.openChest(h, { item: 'herb', n: 2 }).ok && S.count(h, 'herb') === 6;
    r.better = F.openChest(h, { gear: 'buckler' }).ok && h.gear.shield === 'buckler';
    const g0 = h.gold; F.openChest(h, { gear: 'wicker' }); r.worse = h.gear.shield === 'buckler' && h.gold - g0 === Math.floor(C.GEAR.wicker.price / 2); }
  // Light.
  { const j = S.newJourney(); r.light = [S.lightRadius(j)];
    j.torch = true; r.light.push(S.lightRadius(j));
    j.glow = C.LIGHT.glowSteps; r.light.push(S.lightRadius(j));
    j.glow = 100; r.light.push(S.lightRadius(j));
    j.glow = 1; S.stepEffects(j); r.light.push(j.glow, S.lightRadius(j));
    r.torchOutside = !F.useInField(S.newJourney(), 'torch', Math.random, false).ok;
    const k = S.newJourney(); S.addItem(k.hero, 'torch', 1); r.torchInside = F.useInField(k, 'torch', Math.random, true).ok && k.torch && S.count(k.hero, 'torch') === 0; }
  // The save: version 1 upgrades; dungeon areas and opened chests round-trip; bad ones are refused.
  { const j = S.newJourney(); j.area = '3.1'; j.at = { x: 3, y: 8 }; j.opened = ['3.1:5,4', '1.0:22,7']; j.torch = true; j.glow = 50;
    r.round = JSON.stringify(Sv.parseJourney({ v: C.SAVE.version, journey: JSON.parse(JSON.stringify(j)) })) === JSON.stringify(j);
    const old = JSON.parse(JSON.stringify(S.newJourney())); delete old.opened; delete old.torch; delete old.glow;
    const up = Sv.parseJourney({ v: 1, journey: old }); r.upgrade = !!up && up.opened.length === 0 && up.torch === false && up.glow === 0;
    const bad = (f) => { const d = { v: C.SAVE.version, journey: JSON.parse(JSON.stringify(j)) }; f(d.journey); return Sv.parseJourney(d) === null; };
    r.rejects = [bad((x) => { x.area = '5.0'; }), bad((x) => { x.area = '1.1'; }), bad((x) => { x.at = { x: 40, y: 1 }; }), bad((x) => { x.opened = ['9.0:1,1']; }),
      bad((x) => { x.opened = ['3.1:5,4', '3.1:5,4']; }), bad((x) => { x.opened = ['3.1:99,4']; }), bad((x) => { x.torch = 'yes'; }), bad((x) => { x.glow = -1; })]; }
  return r;
})()`);
check('every floor is at least 26 x 15, with its stairs, chests to match its loot, and a warden and brazier at the top', pure.floors.length === 0 && pure.loot.length === 0, [...pure.floors, ...pure.loot].join('; '));
check('with every door shut and no keys, the way to each warden is open', pure.ways.length === 0, pure.ways.join(', '));
check('every stairway has open ground beside it', pure.stairs.length === 0, pure.stairs.join(', '));
check('every locked door can be walked up to', pure.doors.length === 0, pure.doors.join(', '));
check('every chest can be reached once the doors are open', pure.chests.length === 0, pure.chests.join(', '));
check('fights underground: 1 in 16 a step on the floor, none on the stairs', pure.odds.floor === 1 / 16 && pure.odds.stairs === 0, JSON.stringify(pure.odds));
check("the Belfry's creatures come from its own pool", pure.pool);
check('a warden announces itself', pure.intro.startsWith('Bristleback, warden of the Thornwood'), pure.intro);
check("a warden can't be fled, in 100 tries", pure.fled === 0, String(pure.fled));
check('a warden shrugs off Lull', pure.lull === 0);
check('a warden attacks, then tells, then strikes', pure.beats.every(Boolean), JSON.stringify(pure.beats));
check("Bristleback's charge is a double blow", pure.charge.d >= pure.charge.lo && pure.charge.d <= pure.charge.hi, JSON.stringify(pure.charge));
check('a Valor guard halves the charge', pure.guard);
check("Sir Croakley's bog breath does 14-20, poisons, and can't be guarded", pure.breath);
check("the Regent's gloom wave heals it by what it takes", pure.drain);
check('a chest of gold', pure.gold);
check('a chest of two remedies says so', pure.item === 'Inside the chest: 2 remedies.', pure.item);
check('a full pack leaves the chest shut', pure.full);
check('better gear goes on; worse is stripped for half its price', pure.better && pure.worse);
check('light: 1 bare, 2 by torch, 4 by Glow, fading to 3 then 2; Glow wears off by the step', pure.light.join() === '1,2,4,3,0,2', pure.light.join());
check('a torch lights only underground, and is used up', pure.torchOutside && pure.torchInside);
check('a save in a dungeon round-trips, chests and torch included', pure.round);
check('a version 1 save upgrades with nothing opened', pure.upgrade);
check('bad dungeon saves are refused', pure.rejects.every(Boolean), JSON.stringify(pure.rejects));

// ---- In the game ----
for (let i = 0; i < 20 && !(await evaluate(`${G}.scene.isActive('world')`)); i++) { await tap('Enter', 30); await sleep(400); }
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`), 10000);
await evaluate(`{ ${WS}.calm = true; ${WS}.setLevel(4); const h = ${WS}.journey.hero; h.gear.weapon = 'knife'; h.gear.armour = 'hidevest'; h.gear.shield = 'wicker'; }`);
await sleep(500);

// Into the Barrow from the overworld.
const barrow = await evaluate(`${WS}.map.sites['1']`);
await evaluate(`${WS}.teleport({ x: ${barrow.x}, y: ${barrow.y + 1} })`);
await sleep(200);
await tapUntil('ArrowUp', `${WS}.area === '1.0'`);
const inside = await where();
check('stepping onto the barrow goes down into it, beside the stairs', inside.area === '1.0' && inside.pos.x === 15 && inside.pos.y === 15, JSON.stringify(inside));
check('without a light, the hero is warned of the dark', ((await hud()).message?.text ?? '').includes('pitch dark'));
const darkTiles = await evaluate(`${WS}.dark.commandBuffer.length`);
await sleep(500);
await shot('1-dark');

// A torch from the menu.
await evaluate(`${WS}.give('torch', 1)`);
await tap('Escape', 30);
await until(() => evaluate(`${G}.scene.isActive('menu')`), 5000);
await sleep(200);
await tapUntil('ArrowDown', `${MS}.cursor === 1`);
await press('z');
await until(() => evaluate(`${MS}.page === 'item'`), 3000);
const torchRow = await evaluate(`${MS}.rowsFor().findIndex((r) => r.item === 'torch')`);
for (let i = 0; i < 8 && (await evaluate(`${MS}.cursor`)) !== torchRow; i++) await press('ArrowDown');
await press('z');
await until(() => evaluate(`${WS}.journey.torch === true`), 3000).catch(() => {});
check('a torch lit from the menu burns', await evaluate(`${WS}.journey.torch === true`));
await tapUntil('Escape', `!${G}.scene.isActive('menu') && ${WS}.mode === 'walk'`);
await sleep(300);
check('by torchlight, less is dark', (await evaluate(`${WS}.dark.commandBuffer.length`)) < darkTiles, `${darkTiles} before`);
await shot('2-torch');

// A chest, then the locked door with no key, then with the key, then the vault.
await stand('1.0', 22, 8);
await press('ArrowUp');
await sleep(200);
check('the locked door holds without a key', (await evaluate(`${WS}.map.grid[7][22]`)) === '|' && ((await hud()).message?.text ?? '').includes('locked'));
await stand('1.0', 5, 8);
await tapUntil('z', `${WS}.journey.hero.items.key === 1`);
check('Z on a chest opens it: an iron key', (await evaluate(`${WS}.journey.hero.items.key`)) === 1 && (await evaluate(`${WS}.journey.opened.includes('1.0:5,7')`)));
check('an opened chest is gone from the floor', await evaluate(`!${WS}.props.some((p) => p.kind === 'chest' && p.x === 5 && p.y === 7)`));
await shot('3-chest');
await stand('1.0', 22, 8);
await tapUntil('ArrowUp', `${WS}.map.grid[7][22] === '.'`);
check('the key opens the door and is used up', (await evaluate(`${WS}.map.grid[7][22]`)) === '.' && (await evaluate(`${WS}.journey.hero.items.key`)) === 0);
await stand('1.0', 25, 5);
await tapUntil('z', `${WS}.journey.hero.gear.shield === 'buckler'`);
check('the vault holds an Iron Buckler, and it goes on', await evaluate(`${WS}.journey.hero.gear.shield === 'buckler'`));
await shot('4-vault');

// The warden.
await stand('1.0', 14, 4);
await sleep(300);
await shot('5-warden-on-map');
await tapUntil('z', `${G}.scene.isActive('battle')`);
await until(() => evaluate(`${G}.scene.isActive('battle') && ${BS}.menu === 'cmd'`), 15000);
check('Z before the warden starts its fight, drawn three times as large', await evaluate(`${BS}.foeImgs[0].scale === 3 && ${BS}.battle.foes[0].warden`));
await sleep(200);
await shot('6-warden-battle');
await evaluate(`{ const f = ${BS}.battle.foes[0]; f.beat = 1; ${WS}.journey.hero.hp = 999; }`);
await evaluate(`${BS}.cursor = 3`);
await press('z');
await until(() => evaluate(`${BS}.log.some((e) => e.type === 'tell') || ${BS}.menu === 'cmd'`), 15000);
await sleep(400);
check('FLEE: the warden bars the way, then gathers itself', await evaluate(`${BS}.log.some((e) => e.type === 'say' && e.text.includes('bars the way')) && ${BS}.log.some((e) => e.type === 'tell')`));
await shot('7-tell');
await evaluate(`{ const f = ${BS}.battle.foes[0]; f.hp = 1; f.def = 0; f.big = null; f.charged = false; }`);
await fightItOut();
await sleep(300);
const lit = await evaluate(`${WS}.journey.lit`);
check('freeing the warden lights the beacon', lit[0] === true && !lit[1], JSON.stringify(lit));
check('the warden is gone and the brazier burns', await evaluate(`!${WS}.props.some((p) => p.kind === 'warden') && ${WS}.props.some((p) => p.kind === 'brazier' && !p.img.isTinted)`));
check('the beacon message names it', ((await hud()).message?.text ?? '').includes('Thornwood Barrow beacon blazes'));
check('the HUD pip lights', (await hud()).lit[0] === true);
await sleep(400);
await shot('8-lit');

// Out by the stairs, onto a brighter meadow.
await stand('1.0', 15, 15, 'down');
await tapUntil('ArrowDown', `${WS}.area === 'world'`);
const outside = await where();
check('the stairs lead out onto the barrow tile', outside.area === 'world' && outside.pos.x === barrow.x && outside.pos.y === barrow.y, JSON.stringify(outside));
check('the torch goes out on leaving', await evaluate(`${WS}.journey.torch === false`));
check('the overworld re-bakes with the beacon lit', await evaluate(`${WS}.bakedFor === 'world:1000'`));
await sleep(600);
await shot('9-meadow');

// Stairs between floors, both ways.
await stand('2.0', 5, 4);
await tapUntil('ArrowUp', `${WS}.area === '2.1'`);
const up1 = await where();
check("the Belfry's stairs lead on to its second floor", up1.area === '2.1', JSON.stringify(up1));
await sleep(300);
await shot('10-belfry-2f');
await evaluate(`{ const s = ${WS}.map.sites['<'], p = ${WS}.pos; ${WS}.teleport(p, '2.1'); }`);
const back = await evaluate(`(() => { const s = ${WS}.map.sites['<'], p = ${WS}.pos; return { dx: s.x - p.x, dy: s.y - p.y }; })()`);
const dir = back.dy < 0 ? 'ArrowUp' : back.dy > 0 ? 'ArrowDown' : back.dx < 0 ? 'ArrowLeft' : 'ArrowRight';
await tapUntil(dir, `${WS}.area === '2.0'`);
const down1 = await where();
check('and back down beside the stairs they came by', down1.area === '2.0' && Math.abs(down1.pos.x - 5) + Math.abs(down1.pos.y - 3) === 1, JSON.stringify(down1));

// Glow from the menu, then Homeward out.
await evaluate(`{ ${WS}.setLevel(10); ${WS}.journey.torch = false; }`);
await tap('Escape', 30);
await until(() => evaluate(`${G}.scene.isActive('menu')`), 5000);
await press('z');
await until(() => evaluate(`${MS}.page === 'spell'`), 3000);
const glowRow = await evaluate(`${MS}.rowsFor().findIndex((r) => r.spell === 'glow')`);
for (let i = 0; i < 8 && (await evaluate(`${MS}.cursor`)) !== glowRow; i++) await press('ArrowDown');
await press('z');
await until(() => evaluate(`${WS}.journey.glow > 0`), 3000).catch(() => {});
check('Glow from the menu lights the dark', (await evaluate(`${WS}.journey.glow`)) === 200);
await tapUntil('Escape', `!${G}.scene.isActive('menu') && ${WS}.mode === 'walk'`);
await sleep(300);
await shot('11-glow');
await tap('Escape', 30);
await until(() => evaluate(`${G}.scene.isActive('menu')`), 5000);
await press('z');
await until(() => evaluate(`${MS}.page === 'spell'`), 3000);
const homeRow = await evaluate(`${MS}.rowsFor().findIndex((r) => r.spell === 'homeward')`);
for (let i = 0; i < 8 && (await evaluate(`${MS}.cursor`)) !== homeRow; i++) await press('ArrowDown');
await press('z');
await until(() => evaluate(`${WS}.area === 'C'`), 5000).catch(() => {});
check('Homeward lifts the hero out to the home shrine, and Glow ends', (await evaluate(`${WS}.area`)) === 'C' && (await evaluate(`${WS}.journey.glow`)) === 0);

// A fall underground wakes at the shrine.
await stand('3.0', 12, 11);
await evaluate(`{ ${WS}.seed(5); const h = ${WS}.journey.hero; h.hp = 1; h.lv = 1; h.gear.armour = null; h.gear.shield = null; ${WS}.fight(['frostfang']); }`);
for (let i = 0; i < 300 && !(await evaluate(`!${G}.scene.isActive('battle') && ${WS}.mode === 'walk' && ${WS}.area === 'C'`)); i++) {
  const m = await evaluate(`${G}.scene.isActive('battle') ? ${BS}.menu : null`);
  if (m === 'cmd' || m === 'target') await press('Enter');
  await sleep(100);
}
check('a fall in a dungeon wakes the hero at the shrine', (await where()).area === 'C');
check("the dungeon's backdrop was the Spire's", await evaluate(`${G}.textures.exists('back-spire')`));

// Continue in a dungeon: chests stay open.
await evaluate(`(async () => {
  const Sv = await import('/src/save.ts'); const j = ${WS}.journey; j.hero.lv = 4; j.hero.hp = 30;
  j.area = '1.0'; j.at = { x: 15, y: 15 }; Sv.writeSave(j);
})()`);
await send('Page.reload');
await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`), 20000);
await sleep(800);
await tap('Enter', 30);
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`), 10000);
await sleep(500);
const cont = await where();
check('Continue returns the hero to the barrow floor', cont.area === '1.0' && cont.pos.x === 15 && cont.pos.y === 15, JSON.stringify(cont));
check('with its opened chests and door still open, and the warden still freed', await evaluate(`${WS}.props.filter((p) => p.kind === 'chest').length === 2 && ${WS}.map.grid[7][22] === '.' && !${WS}.props.some((p) => p.kind === 'warden')`));
await shot('12-continued');

t.done();
