// Pause: on the map, P and the page going to the background open the field menu (which stops the world), and P closes
// it. In a fight, P, Esc and the page going to the background pause it: the Valor ring, timers and tweens stop, and
// the panel's TITLE goes back to the title. (Heroic Crusader keeps no high score: it's a saved journey.)
// Usage: node tools/pause-test.mjs <project-dir> <out-dir>
import { session } from './cdp.mjs';

const [project, out] = process.argv.slice(2);
const t = await session({ project, out, port: 5252, debugPort: 9422 });
const { evaluate, until, shot, tap, check, sleep } = t;
const G = 'window.__heroicCrusader';
const WS = `${G}.scene.getScene('world')`;
const BS = `${G}.scene.getScene('battle')`;
const press = async (k) => { await tap(k, 30); await sleep(120); };
const hide = () => evaluate(`Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange'))`);
// Phaser's own loop sleeps on the same event: wake it.
const show = () => evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'))`);

await until(() => evaluate(`!!(${G} && ${G}.scene.isActive('title'))`));
for (let i = 0; i < 20 && !(await evaluate(`${G}.scene.isActive('world')`)); i++) { await tap('Enter', 30); await sleep(400); }
await until(() => evaluate(`${G}.scene.isActive('world') && ${WS}.mode === 'walk'`), 5000);
await evaluate(`${WS}.calm = true`);
await sleep(500);

// ---- On the map ----
await press('p');
await until(() => evaluate(`${G}.scene.isActive('menu')`), 2000).catch(() => {});
check('P opens the field menu, and the world stops', await evaluate(`${G}.scene.isActive('menu') && ${G}.scene.isPaused('world')`));
await press('p');
await until(() => evaluate(`!${G}.scene.isActive('menu')`), 2000).catch(() => {});
check('P closes it again', await evaluate(`!${G}.scene.isActive('menu') && ${WS}.mode === 'walk' && !${G}.scene.isPaused('world')`));
await hide();
await sleep(150);
check('the page going to the background opens the menu', await evaluate(`${G}.scene.isActive('menu')`));
await show();
await sleep(200);
await press('Escape');
await until(() => evaluate(`${WS}.mode === 'walk'`), 2000).catch(() => {});

// ---- In a fight ----
await evaluate(`${WS}.fight(['thornhare'])`);
await until(() => evaluate(`${G}.scene.isActive('battle') && ${BS}.menu === 'cmd'`), 10000);
await press('p');
check('P pauses a fight', await evaluate(`${BS}.paused && ${BS}.time.paused && ${BS}.pauseMenu.visible`));
await shot('1-battle-paused');
const c = await evaluate(`${BS}.clock`);
await sleep(500);
check('the fight holds still while paused', (await evaluate(`${BS}.clock`)) === c);
await press('p');
check('P again resumes', !(await evaluate(`${BS}.paused || ${BS}.time.paused`)));
await press('Escape');
check('Esc pauses too', await evaluate(`${BS}.paused`));
await press('Escape');
check('and Esc resumes', !(await evaluate(`${BS}.paused`)));

// The Valor ring stops closing while paused, and goes on after.
await press('Enter');
await until(() => evaluate(`!!${BS}.ring && ${BS}.ring.t > 0.05`), 10000, 10);
await evaluate(`${BS}.setPaused(true)`);
const r = await evaluate(`${BS}.ring.t`);
await sleep(600);
check('the Valor ring stops closing', (await evaluate(`${BS}.ring && ${BS}.ring.t`)) === r, `t ${r.toFixed(2)}`);
await evaluate(`${BS}.setPaused(false)`);
await until(() => evaluate(`!${BS}.ring`), 3000).then(() => check('and finishes after', true), () => check('and finishes after', false));

await until(() => evaluate(`!${G}.scene.isActive('battle') || ${BS}.menu === 'cmd'`), 15000);
if (!(await evaluate(`${G}.scene.isActive('battle')`))) {
  await until(() => evaluate(`${WS}.mode === 'walk'`), 5000);
  await evaluate(`${WS}.fight(['thornhare'])`);
  await until(() => evaluate(`${G}.scene.isActive('battle') && ${BS}.menu === 'cmd'`), 10000);
}
await hide();
await sleep(150);
check('the page going to the background pauses a fight', await evaluate(`${BS}.paused`));
await show();
await sleep(200);
await press('ArrowRight');
await press('Enter');
await until(() => evaluate(`${G}.scene.isActive('title')`), 4000).catch(() => {});
await sleep(400);
check('TITLE goes back to the title, and the map and HUD close', await evaluate(`${G}.scene.isActive('title') && !${G}.scene.isActive('world') && !${G}.scene.isActive('hud') && !${G}.scene.isActive('battle')`));
for (let i = 0; i < 20 && !(await evaluate(`${G}.scene.isActive('world')`)); i++) { await tap('Enter', 30); await sleep(400); }
await sleep(400);
check('a new journey after that runs', await evaluate(`${WS}.mode === 'walk' && !${G}.scene.isPaused('world')`));
t.done();
