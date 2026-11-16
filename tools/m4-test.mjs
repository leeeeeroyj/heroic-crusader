// Milestone 4 check: naming, towns and their people, the queen, smith, grocer, inn and shrine, saving and Continue.
// Usage: node tools/m4-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5227, debugPort: 9395 });
const { evaluate, until, shot, tap, check, sleep, send } = t;
const G = 'window.__heroicCrusader';
const WS = `${G}.scene.getScene('world')`;
const TS = `${G}.scene.getScene('talk')`;
const TI = `${G}.scene.getScene('title')`;
const hero = () => evaluate(`({ ...${WS}.journey.hero, area: ${WS}.area, pos: ${WS}.pos })`);
const press = async (k) => { await tap(k, 30); await sleep(120); };
/** Taps `key` until `expr` reads `want` (taps can merge or drop when headless frames are slow). */
async function moveTo(expr, want, key = 'ArrowDown') {
  for (let i = 0; i < 16 && (await evaluate(expr)) !== want; i++) await press(key);
  return (await evaluate(expr)) === want;
}
/** Stands the hero on a town tile facing a way, and talks. Resolves once the talk scene is up. */
async function talkFrom(area, x, y, facing) {
  await evaluate(`{ ${WS}.teleport({ x: ${x}, y: ${y} }, '${area}'); ${WS}.facing = '${facing}'; }`);
  await sleep(150);
  for (let i = 0; i < 8 && !(await evaluate(`${G}.scene.isActive('talk')`)); i++) await press('z');
  return evaluate(`${G}.scene.isActive('talk') ? ${TS}.chat.person.id : null`);
}
/** Pages through lines until a list opens (or the talk ends). */
async function toList() {
  for (let i = 0; i < 10 && (await evaluate(`${G}.scene.isActive('talk') && !${TS}.rows`)); i++) await press('z');
  return evaluate(`${G}.scene.isActive('talk') && !!${TS}.rows`);
}
/** Pages through until the talk scene closes. */
async function endTalk() {
  for (let i = 0; i < 12 && (await evaluate(`${G}.scene.isActive('talk')`)); i++) await press(await evaluate(`${G}.scene.isActive('talk') && !!${TS}.rows`) ? 'x' : 'z');
  await until(() => evaluate(`!${G}.scene.isActive('talk') && ${WS}.mode === 'walk'`), 5000);
}
const rowLabels = () => evaluate(`${TS}.rows().map((r) => r.label)`);
/** Picks the list row whose label starts with `label`. */
async function pick(label) {
  const i = (await rowLabels()).findIndex((l) => l.startsWith(label));
  if (i < 0) return false;
  await moveTo(`${TS}.cursor`, i);
  await press('z');
  return true;
}

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await sleep(600);

// ---- Pure: maps, people, shops, the inn, the save ----
const pure = await evaluate(`(async () => {
  const M = await import('/src/data/maps.ts'), P = await import('/src/data/people.ts'), W = await import('/src/world.ts');
  const S = await import('/src/state.ts'), Sh = await import('/src/shop.ts'), Sv = await import('/src/save.ts'), C = await import('/src/config.ts');
  const r = {};
  r.sizes = Object.entries(M.TOWNS).map(([k, t]) => k + ':' + t.map.length + 'x' + Math.min(...t.map.map((s) => s.length)) + '-' + Math.max(...t.map.map((s) => s.length)));
  // Everyone stands on open ground, and the hero can reach them from the gate: beside them, or across a counter.
  r.people = [];
  for (const [k, folk] of Object.entries(P.PEOPLE)) {
    const m = W.buildTown(k), arrive = M.TOWNS[k].arrive;
    for (const p of folk) {
      if (!W.walkable(m, p.x, p.y, 0)) { r.people.push(k + ':' + p.id + ' stands on ' + W.tileAt(m, p.x, p.y)); continue; }
      // Walls for the walk: the other people block too.
      const blocked = new Set(folk.filter((o) => o !== p).map((o) => o.x + ',' + o.y));
      const spots = [[0, 1], [0, -1], [1, 0], [-1, 0]].flatMap(([dx, dy]) => W.tileAt(m, p.x + dx, p.y + dy) === 'k' ? [[p.x + 2 * dx, p.y + 2 * dy]] : [[p.x + dx, p.y + dy]]);
      // Flood fill from the gate over open ground, with everyone else (and this person) in the way.
      const seen = new Set([arrive.x + ',' + arrive.y]), queue = [[arrive.x, arrive.y]];
      blocked.add(p.x + ',' + p.y);
      while (queue.length) {
        const [cx, cy] = queue.shift();
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const k2 = (cx + dx) + ',' + (cy + dy);
          if (seen.has(k2) || blocked.has(k2) || !W.walkable(m, cx + dx, cy + dy, 0)) continue;
          seen.add(k2); queue.push([cx + dx, cy + dy]);
        }
      }
      const ok = spots.some(([x, y]) => seen.has(x + ',' + y));
      if (!ok) r.people.push(k + ':' + p.id + ' unreachable');
    }
  }
  r.shrines = Object.entries(M.TOWNS).filter(([, t]) => t.shrine).map(([k, t]) => W.walkable(W.buildTown(k), t.shrine.x, t.shrine.y, 0)).every(Boolean);
  r.gate = Object.keys(M.TOWNS).every((k) => { const m = W.buildTown(k), a = M.TOWNS[k].arrive; return W.walkable(m, a.x, a.y, 0) && W.walkable(m, a.x, m.h - 1, 0); });
  r.noFights = W.encounterOdds(W.buildTown('C'), 12, 13, [false, false, false, false]) === 0;
  r.stock = Object.values(P.PEOPLE).flat().flatMap((p) => p.stock ?? []).filter((w) => !('gear' in w ? C.GEAR[w.gear] : C.ITEMS[w.item])).length;

  // Buying gear: equips it, trades the old piece in at half price, and changes attack by the difference.
  { const j = S.newJourney(), h = j.hero; h.gold = 100;
    const atk0 = S.heroAtk(h), pv = Sh.preview(h, 'knife'), res = Sh.buy(h, { gear: 'knife' });
    r.gear = { ok: res.ok, weapon: h.gear.weapon, atk: S.heroAtk(h) - atk0, want: C.GEAR.knife.power - C.GEAR.stick.power, gold: h.gold, wantGold: 100 - (C.GEAR.knife.price - Math.floor(C.GEAR.stick.price / 2)), pv: pv.then - pv.now, text: res.text };
    r.again = Sh.buy(h, { gear: 'knife' }).ok === false && Sh.canBuy(h, { gear: 'knife' }) === 'owned';
    const def0 = S.heroDef(h); Sh.buy(h, { gear: 'wicker' }); r.shield = S.heroDef(h) - def0 === C.GEAR.wicker.power && h.gear.shield === 'wicker';
    h.gold = 5; r.poor = Sh.buy(h, { gear: 'ironblade' }).ok === false && h.gear.weapon === 'knife' && h.gold === 5; }
  // Items: buy, a full pack, selling at half.
  { const h = S.newJourney().hero; h.gold = 100;
    Sh.buy(h, { item: 'herb' }); r.herb = { count: S.count(h, 'herb'), gold: h.gold };
    S.addItem(h, 'herb', 9); r.full = Sh.canBuy(h, { item: 'herb' }) === 'full';
    const g0 = h.gold; Sh.sell(h, 'herb'); r.sell = { got: h.gold - g0, want: Math.floor(C.ITEMS.herb.price / 2), left: S.count(h, 'herb') };
    r.sellNone = Sh.sell(h, 'key').ok === false; }
  // The inn.
  { const h = S.newJourney().hero; h.hp = 3; h.mp = 0; h.poisoned = true; h.gold = 10;
    const ok = Sh.stay(h, 'C').ok; r.inn = { ok, hp: h.hp === S.maxHp(h), cured: !h.poisoned, gold: h.gold };
    h.hp = 3; h.gold = 2; r.innPoor = !Sh.stay(h, 'C').ok && h.hp === 3 && h.gold === 2; }
  // Waking at the shrine and Homeward: the home town, before its keeper.
  { const j = S.newJourney(); j.hero.home = 'V'; S.wakeAtShrine(j); r.wake = j.area === 'V' && j.at.x === 21 && j.at.y === 4; }
  // The save: a round trip, and everything a corrupt or old save can get wrong.
  { const j = S.newJourney(); j.hero.name = 'ROWAN'; j.hero.gold = 77; j.hero.items = { herb: 3, key: 1 }; j.hero.gear.shield = 'wicker'; j.area = 'V'; j.at = { x: 5, y: 7 }; j.lit = [true, false, false, false];
    const good = { v: C.SAVE.version, journey: JSON.parse(JSON.stringify(j)) };
    r.round = JSON.stringify(Sv.parseJourney(good)) === JSON.stringify(j);
    const bad = (f) => { const d = JSON.parse(JSON.stringify(good)); f(d); return Sv.parseJourney(d) === null; };
    r.rejects = {
      version: bad((d) => { d.v = 0; }), level: bad((d) => { d.journey.hero.lv = 99; }), gear: bad((d) => { d.journey.hero.gear.weapon = 'sword'; }),
      slot: bad((d) => { d.journey.hero.gear.weapon = 'wicker'; }), hp: bad((d) => { d.journey.hero.hp = 0; }), item: bad((d) => { d.journey.hero.items.gem = 1; }),
      count: bad((d) => { d.journey.hero.items.herb = 50; }), area: bad((d) => { d.journey.area = 'Q'; }), at: bad((d) => { d.journey.at = { x: 99, y: 1 }; }),
      name: bad((d) => { d.journey.hero.name = '<b>hi</b>'; }), lit: bad((d) => { d.journey.lit = [true]; }), home: bad((d) => { d.journey.hero.home = 'H'; }),
      empty: Sv.parseJourney(null) === null && Sv.parseJourney('x') === null,
    }; }
  return r;
})()`);
check('every town is 26 x 15', pure.sizes.every((s) => s.endsWith(':15x26-26')), pure.sizes.join(' '));
check('everyone stands on open ground and can be reached from the gate', pure.people.length === 0, pure.people.join(', '));
check('every shrine spot is open ground; every gate is walkable', pure.shrines && pure.gate);
check('no fights in towns', pure.noFights);
check('every shop sells real wares', pure.stock === 0);
check('buying a weapon equips it and attack rises by the difference', pure.gear.ok && pure.gear.weapon === 'knife' && pure.gear.atk === pure.gear.want && pure.gear.pv === pure.gear.want, JSON.stringify(pure.gear));
check('the old weapon is traded in at half price', pure.gear.gold === pure.gear.wantGold, `${pure.gear.gold} vs ${pure.gear.wantGold}: ${pure.gear.text}`);
check("you can't buy what you wear, or what you can't afford", pure.again && pure.poor);
check('a shield adds its defence', pure.shield);
check('buying a herb adds it and costs 10', pure.herb.count === 3 && pure.herb.gold === 90, JSON.stringify(pure.herb));
check('a full pack refuses more', pure.full);
check('selling pays half', pure.sell.got === pure.sell.want && pure.sell.left === 5, JSON.stringify(pure.sell));
check("you can't sell what you haven't got", pure.sellNone);
check('the inn refills HP and MP, cures poison, and costs 6 in Brightkeep', pure.inn.ok && pure.inn.hp && pure.inn.cured && pure.inn.gold === 4, JSON.stringify(pure.inn));
check("no gold, no bed", pure.innPoor);
check('waking puts the hero before their home shrine', pure.wake);
check('a save survives a round trip', pure.round);
check('a corrupt or old save is refused, field by field', Object.values(pure.rejects).every(Boolean), JSON.stringify(pure.rejects));

// ---- Naming ----
await tap('Enter', 30);
await until(() => evaluate(`${TI}.stage === 'name'`), 5000);
for (const k of ['r', 'o', 'w', 'x']) { await tap(k, 30); await sleep(140); }
await tap('Backspace', 30); await sleep(140);
for (const k of ['a', 'n']) { await tap(k, 30); await sleep(140); }
await sleep(300);
await shot('1-naming');
const typed = await evaluate(`${TI}.name`);
check('typing names the squire, and Backspace deletes', typed === 'ROWAN', typed);
await tap('Enter', 30);
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`), 10000);
await evaluate(`${WS}.calm = true`);
await sleep(600);
check('the journey starts with that name', (await hero()).name === 'ROWAN');

// ---- Into Brightkeep and out again ----
// Step off the town tile (retrying: a tap can land before the map takes input), then back on.
for (let i = 0; i < 6 && (await evaluate(`${WS}.pos.y === ${WS}.map.sites.C.y`)); i++) { await press('ArrowDown'); await sleep(350); }
await until(() => evaluate(`!${WS}.moving`), 3000);
for (let i = 0; i < 6 && (await evaluate(`${WS}.area`)) !== 'C'; i++) { await press('ArrowUp'); await sleep(350); }
const inTown = await hero();
check('stepping onto Brightkeep enters the town at its gate', inTown.area === 'C' && inTown.pos.x === 12 && inTown.pos.y === 13, JSON.stringify({ area: inTown.area, pos: inTown.pos }));
await sleep(500);
await shot('2-brightkeep');
for (let i = 0; i < 6 && (await evaluate(`${WS}.area`)) === 'C'; i++) { await press('ArrowDown'); await sleep(350); }
const outside = await evaluate(`({ area: ${WS}.area, pos: ${WS}.pos, c: ${WS}.map.sites.C })`);
check('walking out of the gate returns to the Brightkeep tile', outside.area === 'world' && outside.pos.x === outside.c.x && outside.pos.y === outside.c.y, JSON.stringify(outside));

// ---- The queen ----
check('facing the queen and pressing Z talks to her', (await talkFrom('C', 12, 4, 'up')) === 'queen');
await sleep(300);
const q1 = await evaluate(`${TS}.pages.join(' | ')`);
check("the queen gives the first charge and the Valor still needed", q1.includes('Thornwood') && q1.includes('7 more Valor to reach LV 2'), q1);
await shot('3-queen');
await endTalk();
await evaluate(`${WS}.setLit(1)`);
await talkFrom('C', 12, 4, 'up');
const q2 = await evaluate(`${TS}.pages.join(' | ')`);
check('with a beacon lit she gives the next charge', q2.includes('Drowned Belfry'), q2);
await endTalk();
await evaluate(`${WS}.setLit(0)`);
check('the hero can talk sideways too', (await talkFrom('C', 11, 3, 'right')) === 'queen');
await endTalk();

// ---- The smith: buy a weapon ----
await evaluate(`{ const h = ${WS}.journey.hero; h.gold = 60; }`);
check('across the counter, the smith', (await talkFrom('C', 4, 9, 'down')) === 'smith');
check('the smith offers BUY, SELL and LEAVE', (await toList()) && (await rowLabels()).join() === 'BUY,SELL,LEAVE');
await pick('BUY');
await until(() => evaluate(`${TS}.title === 'BUY'`), 3000);
const wares = await rowLabels();
check("Brightkeep's smith sells the knife, vest and shield", wares.join() === "HUNTER'S KNIFE,HIDE VEST,WICKER SHIELD", wares.join());
const info = await evaluate(`${TS}.rows()[0].info`);
check('the knife shows the attack it gives and the trade-in', info.includes('ATTACK 9 -> 15') && info.includes('worth 5 gold'), info);
await shot('4-smith');
await press('z');
await until(() => evaluate(`${WS}.journey.hero.gear.weapon === 'knife'`), 3000).catch(() => {});
const armed = await hero();
check('buying the knife equips it for 40 gold net', armed.gear.weapon === 'knife' && armed.gold === 20, `${armed.gear.weapon}, ${armed.gold} G`);
await sleep(200);
check('the HUD shows the new gold', (await evaluate(`${G}.registry.get('hud').gold`)) === 20);
check('the knife now shows as worn', (await evaluate(`${TS}.rows()[0].right`)) === 'WORN');
await shot('5-bought');
await endTalk();

// ---- The grocer: buy and sell ----
check('across the counter, the grocer', (await talkFrom('C', 21, 9, 'down')) === 'grocer');
await toList(); await pick('BUY');
await until(() => evaluate(`${TS}.title === 'BUY'`), 3000);
await press('z');
await until(() => evaluate(`${WS}.journey.hero.items.herb === 3`), 3000).catch(() => {});
check('buying a herb', (await hero()).items.herb === 3 && (await hero()).gold === 10);
await press('x');
await until(() => evaluate(`${TS}.title === '' && !!${TS}.rows`), 3000);
await pick('SELL');
await until(() => evaluate(`${TS}.title === 'SELL'`), 3000);
await shot('6-sell');
await press('z');
await until(() => evaluate(`${WS}.journey.hero.items.herb === 2`), 3000).catch(() => {});
const sold = await hero();
check('selling a herb pays 5', sold.items.herb === 2 && sold.gold === 15, JSON.stringify({ herbs: sold.items.herb, gold: sold.gold }));
await endTalk();

// ---- The inn ----
await evaluate(`{ const h = ${WS}.journey.hero; h.hp = 4; }`);
check('across the counter, the innkeeper', (await talkFrom('C', 4, 5, 'up')) === 'innkeeper');
await toList();
check('the inn asks YES or NO', (await rowLabels()).join() === 'YES,NO');
await press('z');
await until(() => evaluate(`${WS}.journey.hero.hp === 15`), 5000).catch(() => {});
const rested = await hero();
check('a night at the inn: full HP for 6 gold', rested.hp === 15 && rested.gold === 9, `HP ${rested.hp}, ${rested.gold} G`);
await sleep(700);
await shot('7-inn');
await endTalk();
await evaluate(`{ const h = ${WS}.journey.hero; h.hp = 4; h.gold = 3; }`);
await talkFrom('C', 4, 5, 'up'); await toList(); await press('z');
await sleep(500);
check('no gold, no bed', (await hero()).hp === 4 && (await evaluate(`${TS}.pages[0] ?? ''`)).includes("haven't enough"));
await endTalk();

// ---- The shrine: cure and record ----
await evaluate(`{ const h = ${WS}.journey.hero; h.poisoned = true; h.gold = 40; }`);
check('the shrine keeper', (await talkFrom('C', 21, 4, 'up')) === 'keeper');
check('the keeper draws out poison', !(await hero()).poisoned);
await toList();
await press('z');
await until(() => evaluate(`!!localStorage.getItem('heroic-crusader-save')`), 3000).catch(() => {});
check('recording the journey saves it', await evaluate(`!!localStorage.getItem('heroic-crusader-save')`));
await sleep(300);
await shot('8-shrine');
await endTalk();

// ---- Fenbridge: record there, then fall and wake there ----
check('the Fenbridge shrine keeper', (await talkFrom('V', 21, 4, 'up')) === 'keeper');
await toList(); await press('z');
await until(() => evaluate(`${WS}.journey.hero.home === 'V'`), 3000).catch(() => {});
await endTalk();
check('recording at Fenbridge makes it home', (await hero()).home === 'V');
await evaluate(`{ ${WS}.seed(5); const h = ${WS}.journey.hero; h.hp = 1; ${WS}.teleport({ x: 30, y: 21 }); ${WS}.fight(['frostfang'], 'snow'); }`);
for (let i = 0; i < 300 && !(await evaluate(`!${G}.scene.isActive('battle') && ${WS}.mode === 'walk' && ${WS}.area !== 'world'`)); i++) {
  const m = await evaluate(`${G}.scene.isActive('battle') ? ${G}.scene.getScene('battle').menu : null`);
  if (m === 'cmd' || m === 'target') await press('Enter');
  await sleep(100);
}
const woke = await hero();
check('after a fall the hero wakes before the Fenbridge shrine', woke.area === 'V' && woke.pos.x === 21 && woke.pos.y === 4, JSON.stringify({ area: woke.area, pos: woke.pos }));
await sleep(400);
await shot('9-woke-fenbridge');

// ---- Save, reload, Continue ----
await evaluate(`{ const h = ${WS}.journey.hero; h.gold = 123; h.items = { herb: 4, remedy: 1 }; h.gear.armour = 'hidevest'; ${WS}.setLit([true, true, false, false]); ${WS}.teleport({ x: 21, y: 5 }, 'V'); }`);
await talkFrom('V', 21, 4, 'up'); await toList(); await press('z');
await sleep(400);
await endTalk();
const before = await evaluate(`JSON.stringify(${WS}.journey)`);
await send('Page.reload');
await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`), 20000);
await sleep(800);
const opts = await evaluate(`${TI}.options.join()`);
check('after a reload the title offers Continue first', opts === 'continue,new', opts);
await shot('10-continue');
await tap('Enter', 30);
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`), 10000);
await sleep(500);
const after = await evaluate(`JSON.stringify(${WS}.journey)`);
check('Continue restores place, stats, pack, gold, gear and beacons', after === before, after === before ? '' : `${before}\n${after}`);
await shot('11-continued');

// ---- A corrupt save ----
await evaluate(`localStorage.setItem('heroic-crusader-save', '{"v":1,"journey":{"hero":"nope"')`);
await send('Page.reload');
await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`), 20000);
await sleep(800);
check('a corrupt save offers only New Journey', (await evaluate(`${TI}.options.join()`)) === 'new');
await evaluate(`localStorage.setItem('heroic-crusader-save', JSON.stringify({ v: 1, journey: { hero: { name: 'X', lv: 999 } } }))`);
await send('Page.reload');
await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`), 20000);
await sleep(800);
check('so does a save with impossible numbers', (await evaluate(`${TI}.options.join()`)) === 'new');
for (let i = 0; i < 20 && !(await evaluate(`${G}.scene.isActive('world')`)); i++) { await tap('Enter', 30); await sleep(400); }
check('and New Journey still starts', await evaluate(`${G}.scene.isActive('world')`));

t.done();
