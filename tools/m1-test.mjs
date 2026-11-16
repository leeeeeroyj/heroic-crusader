// Milestone 1 check: title, a new journey, walking the overworld, blocking, the camera, regions and beacons, the HUD.
// Usage: node tools/m1-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5221, debugPort: 9391 });
const { evaluate, until, shot, tap, down, up, check, sleep } = t;
const G = 'window.__heroicCrusader';
const WS = `${G}.scene.getScene('world')`;
const hold = async (k, ms) => { await down(k); await sleep(ms); await up(k); await sleep(250); };
const pos = () => evaluate(`({ ...${WS}.pos, moving: !!${WS}.moving })`);
const settle = () => until(() => evaluate(`!${WS}.moving`));

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
await sleep(900);
await shot('1-title');
check('title scene runs', true);
const missing = await evaluate(`(async () => { const { SPRITES } = await import('/src/config.ts'); return SPRITES.filter((k) => !${G}.textures.exists(k)); })()`);
check('every sprite slot loaded', missing.length === 0, missing.join(', '));

// Enter starts a new journey, then Enter again keeps the default name.
for (let i = 0; i < 20 && !(await evaluate(`${G}.scene.isActive('world')`)); i++) { await tap('Enter', 30); await sleep(400); }
await until(() => evaluate(`${G}.scene.isActive('world') && ${G}.scene.isActive('hud')`));
await evaluate(`${WS}.calm = true`); // no random fights while this test walks about
await sleep(900);
await shot('2-start');
const home = await evaluate(`${WS}.map.sites.C`);
let p = await pos();
check('a new journey starts in Brightkeep', p.x === home.x && p.y === home.y, JSON.stringify(p));
const hud = await evaluate(`${G}.registry.get('hud')`);
check('HUD shows a level 1 hero at full HP', hud.lv === 1 && hud.hp === 15 && hud.maxHp === 15 && hud.name === 'WREN', JSON.stringify(hud).slice(0, 120));
check('Brightkeep is named on arrival', hud.place?.name === 'Brightkeep');

// Walking: a held key keeps stepping, one tile per 0.17 s of game time (slow frames slow the game clock, not the pace).
const c0 = await evaluate(`${WS}.clock`);
await hold('ArrowRight', 1200);
const c1 = await evaluate(`${WS}.clock`);
await settle();
p = await pos();
const stepped = p.x - home.x, expect = (c1 - c0) / 0.17;
check('holding right walks east tile by tile', p.y === home.y && stepped >= 3 && Math.abs(stepped - expect) <= 2, `${stepped} tiles in ${(c1 - c0).toFixed(2)} s of game time`);
check('the hero faces the way it walks', await evaluate(`${WS}.facingRight === true`));
await hold('ArrowLeft', 200); await settle();
check('a left step turns the hero round', await evaluate(`${WS}.facingRight === false`));

// Blocking: water and mountains.
await evaluate(`${WS}.teleport({ x: 17, y: 21 })`);
await hold('ArrowRight', 500); await settle();
p = await pos();
check('water blocks', p.x === 17 && p.y === 21, JSON.stringify(p));
await evaluate(`${WS}.teleport({ x: 5, y: 20 })`);
await hold('ArrowLeft', 500); await settle();
p = await pos();
check('mountains block', p.x === 5 && p.y === 20, JSON.stringify(p));

// Camera: centred on the hero, clamped at the map's edges.
const view = () => evaluate(`(() => { const v = ${WS}.cameras.main.worldView; return { x: Math.round(v.x), y: Math.round(v.y), w: Math.round(v.width), h: Math.round(v.height) }; })()`);
await evaluate(`${WS}.teleport({ x: 2, y: 5 })`); await sleep(200);
let v = await view();
check('camera clamps at the top-left corner', v.x === 0 && v.y === 0 && v.w === 416 && v.h === 228, JSON.stringify(v));
await evaluate(`${WS}.teleport({ x: 40, y: 23 })`); await sleep(200);
v = await view();
check('camera clamps at the bottom-right corner', v.x + v.w === 768 && v.y + v.h === 416, JSON.stringify(v));
await evaluate(`${WS}.teleport({ x: 24, y: 12 })`); await sleep(200);
v = await view();
check('camera centres the hero mid-map', v.x === 24 * 16 + 8 - 208 && v.y === 12 * 16 + 8 - 114, JSON.stringify(v));

// Reachability straight from the pure module.
const reach = await evaluate(`(async () => {
  const w = await import('/src/world.ts'); const m = w.buildOverworld(); const from = m.sites.C; const out = {};
  for (const k of ['V', 'F', 'H', '1', '2', '3', '4']) out[k] = w.bfs(m, from, m.sites[k], 0).length;
  out.G3 = w.bfs(m, from, m.sites.G, 3).length; out.G4 = w.bfs(m, from, m.sites.G, 4).length;
  const road = m.grid.flatMap((row, y) => row.map((t, x) => ({ t, x, y }))).filter((c) => c.t === '=');
  const linked = road.every((c) => [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dy]) => '=BCVFH1234G'.includes(m.grid[c.y + dy]?.[c.x + dx] ?? 'M')));
  return { out, linked, regions: [...new Set(m.region.flat())].sort() };
})()`);
const sites = Object.entries(reach.out).filter(([k]) => !k.startsWith('G'));
check('every town and beacon is reachable from Brightkeep', sites.every(([, n]) => n > 0), JSON.stringify(reach.out));
check('the Hollow is sealed until all four beacons burn', reach.out.G3 === 0 && reach.out.G4 > 0);
check('every road tile joins another road or a site', reach.linked);
check('tiles fall in the four regions and the Hollow', JSON.stringify(reach.regions) === '[-1,0,1,2,3]', JSON.stringify(reach.regions));

// The Gloam wall, in the game.
await evaluate(`${WS}.teleport({ x: 40, y: 5 })`);
await hold('ArrowUp', 300); await settle();
p = await pos();
check('the Gloam wall blocks with the beacons cold', p.y === 5, JSON.stringify(p));
await evaluate(`${WS}.setLit(4)`);
await hold('ArrowUp', 300); await settle();
p = await pos();
check('with all four lit the wall is gone', p.y < 5, JSON.stringify(p));
check('the map re-bakes for the new beacons', await evaluate(`${WS}.bakedFor === 'world:1111'`));
const pips = await evaluate(`${G}.registry.get('hud').lit`);
check('HUD pips follow the beacons', pips.every(Boolean));
await evaluate(`${WS}.teleport({ x: 37, y: 10 })`); await sleep(500);
await shot('3-all-lit');

// Regions: two lit, by Fenbridge, plus the place banner on arrival.
await evaluate(`${WS}.setLit(2); ${WS}.teleport({ x: 9, y: 12 })`);
await hold('ArrowLeft', 150); await settle(); await sleep(150);
const place = await evaluate(`${G}.registry.get('hud').place?.name`);
check('stepping onto Fenbridge names it', place === 'Fenbridge', String(place));
await sleep(300);
await shot('4-two-lit');

// Sound toggle and leaving.
const m0 = await evaluate(`${G}.registry.get('muted') === true`);
await tap('m'); await sleep(150);
check('M toggles sound', (await evaluate(`${G}.registry.get('muted') === true`)) !== m0);
await tap('m'); await sleep(150);
await tap('Escape');
await until(() => evaluate(`${G}.scene.isActive('menu')`));
check('Esc opens the field menu', true);
// Taps can merge or drop when headless frames are slow: tap until the cursor is on BACK TO TITLE.
const MS = `${G}.scene.getScene('menu')`;
for (let i = 0; i < 12 && (await evaluate(`${MS}.cursor`)) !== 2; i++) { await tap('ArrowDown', 30); await sleep(150); }
await tap('Enter', 30);
await until(() => evaluate(`${G}.scene.isActive('title') && !${G}.scene.isActive('hud')`));
check('BACK TO TITLE returns to the title', true);

t.done();
