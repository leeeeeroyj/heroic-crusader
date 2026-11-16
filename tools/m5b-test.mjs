// Milestone 5b check: the Hollow, the Gloam's two forms, the ending and credits, and the "crusade complete" save.
// Usage: node tools/m5b-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5230, debugPort: 9393 });
const { evaluate, until, shot, tap, check, sleep, send } = t;
const G = 'window.__heroicCrusader';
const WS = `${G}.scene.getScene('world')`;
const BS = `${G}.scene.getScene('battle')`;
const ES = `${G}.scene.getScene('ending')`;
const TI = `${G}.scene.getScene('title')`;
const TS = `${G}.scene.getScene('talk')`;
const where = () => evaluate(`({ area: ${WS}.area, pos: ${WS}.pos })`);
const press = async (k) => { await tap(k, 30); await sleep(150); };
async function tapUntil(key, expr, tries = 8) {
  for (let i = 0; i < tries && !(await evaluate(expr)); i++) { await press(key); await sleep(250); }
  return evaluate(expr);
}

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await sleep(600);

// ---- Pure: the Gloam's rules, and the save flag ----
const pure = await evaluate(`(async () => {
  const B = await import('/src/battle.ts'), S = await import('/src/state.ts'), W = await import('/src/world.ts'), C = await import('/src/config.ts');
  const D = await import('/src/data/dungeons.ts'), Sv = await import('/src/save.ts');
  const r = {};
  r.parse = [D.parseFloor('G.2'), D.parseFloor('G.3'), D.parseFloor('H.0')].map((x) => x && x.site + x.floor).join();
  const fresh = () => { const j = S.newJourney(); j.hero.lv = 15; j.hero.hp = 999; j.hero.mp = 999; const b = B.newBattle(j.hero, ['gloam'], 'hollow', false, W.rng(4)); b.foes[0].hp = 400; return b; };
  // Masked: it copies the hero's last spell, once.
  { const b = fresh(), f = b.foes[0];
    b.lastSpell = 'mend'; const hp0 = f.hp; const ev = B.runScript(B.foeTurn(b, f));
    r.mend = f.hp > hp0 && ev.some((e) => e.type === 'cast' && e.who === 0 && e.spell === 'mend') && b.lastSpell === null;
    b.lastSpell = 'spark'; const h0 = b.hero.hp; B.runScript(B.foeTurn(b, f)); r.spark = h0 - b.hero.hp >= 8 && h0 - b.hero.hp <= 12;
    b.lastSpell = 'lull'; B.runScript(B.foeTurn(b, f)); r.lull = b.heroSleep === 1;
    const plain = B.runScript(B.foeTurn(b, f)); r.plain = plain.some((e) => e.type === 'foeStrike') && !plain.some((e) => e.type === 'tell'); }
  // A spell cast in a round sets lastSpell.
  { const b = fresh(); B.runScript(B.round(b, { type: 'spell', spell: 'mend' }), () => false); r.sets = b.foes[0].hp >= 400; }
  // Unmasking at half HP: once, stronger, then the stolen moves in turn, each told first.
  { const b = fresh(), f = b.foes[0]; f.hp = Math.floor(f.maxHp / 2) + 1; f.def = 0; const atk0 = f.atk;
    const ev = B.runScript(B.round(b, { type: 'fight', target: 0 }), (e) => false);
    r.unmask = ev.some((e) => e.type === 'unmask') && !f.masked && f.atk === atk0 + C.GLOAM_UNMASKED.atk;
    f.hp = 9999; f.maxHp = 99999; f.def = 999;
    const names = [];
    for (let i = 0; i < 12; i++) { const e2 = B.runScript(B.foeTurn(b, f), () => false); b.hero.hp = 999; const big = e2.find((e) => e.type === 'big'); if (big) names.push(big.text); }
    r.order = names.slice(0, 4).join(' | ') === C.GLOAM_UNMASKED.moves.map((m) => m.name).join(' | ');
    const again = B.runScript(B.round(b, { type: 'fight', target: 0 }), () => false); r.once = !again.some((e) => e.type === 'unmask'); }
  // No fleeing it, no Lull; beating it: the dawn, no Valor.
  { const b = fresh(); B.runScript(B.round(b, { type: 'flee' }), () => false); r.flee = b.outcome !== 'fled';
    const c = fresh(); B.runScript(B.round(c, { type: 'spell', spell: 'lull' }), () => false); r.nolull = c.foes[0].sleep === 0;
    const d = fresh(); d.foes[0].hp = 1; d.foes[0].def = 0; d.foes[0].masked = false; const xp0 = d.hero.xp;
    const ev = B.runScript(B.round(d, { type: 'fight', target: 0 }), () => false);
    r.win = d.outcome === 'won' && d.hero.xp === xp0 && ev.some((e) => e.type === 'freed' && e.text.includes('fog at sunrise')) && ev.some((e) => e.type === 'reward' && e.text.includes('Morning comes')); }
  // The save keeps the flag; a version 2 save upgrades to not done.
  { const j = S.newJourney(); j.done = true;
    r.round = Sv.parseJourney({ v: C.SAVE.version, journey: JSON.parse(JSON.stringify(j)) })?.done === true;
    const old = JSON.parse(JSON.stringify(S.newJourney())); delete old.done;
    r.upgrade = Sv.parseJourney({ v: 2, journey: old })?.done === false;
    const bad = JSON.parse(JSON.stringify(j)); bad.done = 'yes'; r.bad = Sv.parseJourney({ v: C.SAVE.version, journey: bad }) === null;
    const hollow = JSON.parse(JSON.stringify(j)); hollow.area = 'G.1'; hollow.at = { x: 1, y: 1 }; hollow.opened = ['G.1:14,10'];
    r.hollowSave = !!Sv.parseJourney({ v: C.SAVE.version, journey: hollow }); }
  return r;
})()`);
check("the Hollow's floors are areas; others aren't", pure.parse === 'G2,,', pure.parse);
check('masked, the Gloam copies Mend and heals itself, once', pure.mend);
check('it copies Spark at the hero (8-12)', pure.spark);
check('it copies Lull: the hero nods off', pure.lull);
check('with nothing to copy, it just attacks', pure.plain);
check("the hero's spell is what it copies", pure.sets);
check('below half its HP it unmasks, stronger', pure.unmask);
check("unmasked, it uses the wardens' moves in turn", pure.order);
check('it unmasks only once', pure.once);
check("no fleeing the Gloam, and Lull doesn't touch it", pure.flee && pure.nolull);
check('beating it brings the dawn, not Valor', pure.win);
check('the save keeps "crusade complete"; version 2 saves upgrade; a bad flag is refused', pure.round && pure.upgrade && pure.bad);
check('a save in the Hollow is valid', pure.hollowSave);

// ---- In the game: through the wall, down the Hollow, the Gloam ----
for (let i = 0; i < 20 && !(await evaluate(`${G}.scene.isActive('world')`)); i++) { await tap('Enter', 30); await sleep(400); }
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`), 10000);
await evaluate(`{ ${WS}.calm = true; ${WS}.setLevel(15); const h = ${WS}.journey.hero; h.gear.weapon = 'frostbrand'; h.gear.armour = 'dawnmail'; h.gear.shield = 'kite'; }`);
await sleep(400);
const hollowSite = await evaluate(`${WS}.map.sites.G`);
// Below the Gloam's wall, which stands between the hills and the Hollow.
await evaluate(`${WS}.setLit(3); ${WS}.teleport({ x: ${hollowSite.x}, y: ${hollowSite.y + 2} })`);
await sleep(200);
await press('ArrowUp');
await sleep(300);
check('with three beacons the wall stands', (await evaluate(`${WS}.area`)) === 'world' && (await evaluate(`${WS}.pos.y`)) === hollowSite.y + 2);
await evaluate(`${WS}.setLit(4); ${WS}.teleport({ x: ${hollowSite.x}, y: ${hollowSite.y + 2} })`);
await sleep(200);
await tapUntil('ArrowUp', `${WS}.area === 'G.0'`);
check('with all four it falls, and stepping onto the Hollow goes down into it', (await where()).area === 'G.0');
await evaluate(`${WS}.journey.torch = true`);
await sleep(500);
await shot('1-hollow');

// Walk the stairs: 1F to 2F to 3F.
const stairsTo = async (next) => {
  await evaluate(`{ const s = ${WS}.map.sites['>']; const b = { x: s.x, y: s.y + 1 }; const ok = (p) => ${WS}.map.grid[p.y]?.[p.x] === '.'; const p = [b, { x: s.x, y: s.y - 1 }, { x: s.x - 1, y: s.y }, { x: s.x + 1, y: s.y }].find(ok); ${WS}.teleport(p, ${WS}.area); window.__dir = p.y > s.y ? 'ArrowUp' : p.y < s.y ? 'ArrowDown' : p.x < s.x ? 'ArrowRight' : 'ArrowLeft'; }`);
  return tapUntil(await evaluate('window.__dir'), `${WS}.area === '${next}'`);
};
check('stairs lead to 2F', await stairsTo('G.1'));
check('and to the top', await stairsTo('G.2'));
const gloamAt = await evaluate(`${WS}.props.filter((p) => p.kind === 'warden').map((p) => ({ x: p.x, y: p.y }))[0]`);
check('the Gloam waits at the top', gloamAt && gloamAt.x === 15 && gloamAt.y === 3, JSON.stringify(gloamAt));
await evaluate(`{ ${WS}.teleport({ x: 15, y: 4 }, 'G.2'); ${WS}.facing = 'up'; }`);
await sleep(500);
await shot('2-gloam-on-map');
await tapUntil('z', `${G}.scene.isActive('battle')`);
await until(() => evaluate(`${G}.scene.isActive('battle') && ${BS}.menu === 'cmd'`), 15000);
check('the Gloam fight opens at 3x', await evaluate(`${BS}.foeImgs[0].scale === 3 && ${BS}.battle.foes[0].gloam`));
check('with its own line', await evaluate(`${BS}.log[0].text.includes('The Gloam is here')`));
await shot('3-gloam-masked');
// Knock it just under half: it unmasks and grows.
await evaluate(`{ const f = ${BS}.battle.foes[0]; f.hp = Math.floor(f.maxHp / 2) + 2; f.def = 0; ${WS}.journey.hero.hp = 999; }`);
await evaluate(`${BS}.cursor = 0`);
await press('z');
await until(() => evaluate(`${BS}.log.some((e) => e.type === 'unmask')`), 15000).catch(() => {});
await sleep(1500);
check('below half, it unmasks and grows to 4x', await evaluate(`${BS}.log.some((e) => e.type === 'unmask') && Math.abs(${BS}.foeImgs[0].scale - 4) < 0.01`));
await shot('4-gloam-unmasked');
await evaluate(`{ const f = ${BS}.battle.foes[0]; f.hp = 1; f.big = null; f.charged = false; ${WS}.journey.hero.hp = 999; }`);
for (let i = 0; i < 300 && (await evaluate(`${G}.scene.isActive('battle')`)); i++) {
  const m = await evaluate(`${BS}.menu`);
  if (m === 'spell' || m === 'item') await press('x');
  else if (m === 'cmd') { await evaluate(`${BS}.cursor = 0`); await press('z'); }
  await sleep(100);
}
await until(() => evaluate(`${G}.scene.isActive('ending')`), 15000).catch(() => {});
check('beating the Gloam plays the ending', await evaluate(`${G}.scene.isActive('ending')`));
const saved = await evaluate(`JSON.parse(localStorage.getItem('heroic-crusader-save') || 'null')`);
check('and saves the journey, complete and rested, at the home shrine', saved?.journey?.done === true && saved.journey.area === 'C' && saved.journey.at.x === 21 && saved.journey.at.y === 4, JSON.stringify(saved?.journey && { done: saved.journey.done, area: saved.journey.area, at: saved.journey.at }));
await sleep(2500);
await shot('5-ending');
const lines = await evaluate(`${ES}.pages[3].lines[0]`);
check("the ending names the squire", lines.includes('WREN') && lines.includes('Heroic Crusader'), lines);
for (let i = 0; i < 12 && (await evaluate(`${ES}.page`)) < 4; i++) { await press('z'); await sleep(1000); }
await sleep(1200);
check('the credits follow', (await evaluate(`${ES}.page`)) === 4);
await shot('6-credits');
for (let i = 0; i < 6 && (await evaluate(`${ES}.page`)) < 5; i++) { await press('z'); await sleep(1000); }
await sleep(1200);
check('then THE END', (await evaluate(`${ES}.page`)) === 5);
await shot('7-the-end');
await tapUntil('z', `${G}.scene.isActive('title')`, 10);
await until(() => evaluate(`${G}.scene.isActive('title') && ${TI}.options.length > 0`), 10000);
await sleep(800);
const opts = await evaluate(`${TI}.options.join()`);
check('Z returns to the title, which offers Continue', opts === 'continue,new', opts);
check('marked complete', await evaluate(`${TI}.optionTexts[0].text.includes('COMPLETE')`));
await shot('8-title-complete');

// Continue: home, the queen's thanks, and the Gloam gone for good.
await tap('Enter', 30);
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`), 10000);
await sleep(500);
const home = await where();
check('Continue wakes at the Brightkeep shrine', home.area === 'C' && home.pos.x === 21 && home.pos.y === 4, JSON.stringify(home));
await evaluate(`{ ${WS}.teleport({ x: 12, y: 4 }, 'C'); ${WS}.facing = 'up'; }`);
await tapUntil('z', `${G}.scene.isActive('talk')`);
check('the queen gives thanks', (await evaluate(`${TS}.pages[0]`)).includes('bright again'));
await shot('9-queen-thanks');
for (let i = 0; i < 6 && (await evaluate(`${G}.scene.isActive('talk')`)); i++) await press('z');
await evaluate(`${WS}.teleport({ x: 15, y: 5 }, 'G.2')`);
await sleep(300);
check("the Hollow's heart stands empty", await evaluate(`!${WS}.props.some((p) => p.kind === 'warden')`));

// A save from before the ending (version 2) still continues.
await evaluate(`(() => { const j = JSON.parse(JSON.stringify(${WS}.journey)); delete j.done; j.area = 'C'; j.at = { x: 21, y: 4 }; localStorage.setItem('heroic-crusader-save', JSON.stringify({ v: 2, journey: j })); })()`);
await send('Page.reload');
await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`), 20000);
await sleep(800);
check('a version 2 save still offers Continue, not complete', (await evaluate(`${TI}.options.join()`)) === 'continue,new' && !(await evaluate(`${TI}.optionTexts[0].text.includes('COMPLETE')`)));

t.done();
