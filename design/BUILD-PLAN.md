# Heroic Crusader: build plan

A compact single-hero role-playing game re-imagined from Chunsoft and Enix's *Dragon Quest* (1986). A squire walks a storybook kingdom gone grey under the Gloam, wins turn-based side-view fights against soured creatures, and relights four beacons to open the Gloam's Hollow. Concept, rules and sprite picks: `design/concept-sheet.html`.

## Scope

**v1** (about 45–60 minutes of play)
- **One hero**, named at the start (default Wren). Levels 1–15; HP, MP, attack (strength + weapon), defence (resilience + armour + shield), agility. Level table and Valor (experience) thresholds in `config.ts`, first pass taken from the concept sheet.
- **Overworld:** one hand-drawn 48 × 26 tile map (the mockup's), code-drawn tiles, grid movement (0.17 s a step), camera follows the hero. Four regions (Meadow, Marsh, Snow, Ruins) plus the sealed Hollow corner. Each unlit region is drawn desaturated and violet-tinted, with drifting fog.
- **Encounters:** classic random encounters, rolled per step from the ground type (road 1/48 … marsh and ruins 1/10), never within 5 steps of the last fight, a third less often in a lit region. Pools by the ground underfoot: marsh, snow, hills and rubble have their own; grass, forest, roads and sand are meadow anywhere.
- **Battle:** a separate side-view scene. Hero on the left at 2×, 1–3 foes on the right at 2× (wardens 3×, the Gloam's second form 4×), code-drawn backdrop of the ground the fight started on. Commands FIGHT, SPELL, ITEM, FLEE. Hero acts, then each foe in agility order (a quick foe may ambush first). Foes flash white before acting. **Valor timing:** a ring closes on the point of impact; press A inside ±0.11 s for a 1.5× strike or a half-damage guard. Can be switched off in settings.
- **Creatures:** 17 (9 sprite families, 8 recoloured kin baked at load): Thornhare, Rook, Puffcap, Duskbat, Bogtoad, Marshwisp, Rotcap, Frostfang, Rimehare, Frostwisp, Rustguard, Cairn, Gloombat, Grim Rook, Shadefang, Ironguard, Obsidian Cairn. Traits: quick, steal, spores (sleep), poison, drain, spark, hush (silence), brace (half damage every other turn), howl (call a third). Beaten creatures are freed, not killed: they flash white, fade and run.
- **Wardens:** Bristleback (Meadow), Sir Croakley (Marsh), Old Rime (Snow), the Hollow Regent (Ruins). Each has a telegraphed big move (glow, breath, wind-up) one turn ahead. No fleeing.
- **The Gloam:** two phases. Phase 1 copies the hero's last spell; at half HP it unmasks at 4× with each warden's trick in rotation. Win → short ending crawl and credits; the save keeps a "crusade complete" flag.
- **Spells (8):** Mend 3, Spark 4, Glow 5, Lull 7, Ward 9, Homeward 10, Flare 12, Restore 14 (learned at these levels).
- **Items:** herbs (max 6), torches, remedies (cure poison), iron keys, ward incense; equipment in three slots, three or four tiers each, sold in town and found in chests.
- **Towns:** Brightkeep (castle town, Queen Maren, start), Fenbridge, Frostholm, and the hermit's hut. One-screen town maps with NPCs (talk with A), smith, grocer, inn, shrine. Shops buy at half price.
- **Saving:** at any shrine, one slot in `localStorage` (versioned JSON). Title offers Continue / New journey. Falling in battle: wake at the last shrine with full HP and half the gold.
- **Dungeons:** four beacon dungeons (1, 2, 3 and 3 floors) and the Hollow (3 floors), hand-drawn ASCII floors. Dark: torch radius about 2 tiles, Glow 4 tiles shrinking over 200 steps. Chests, locked doors, keys, stairs.
- **Beacons:** relighting one restores its region's colour, lifts its fog, cuts encounters there by a third and lights its HUD pip; all four burn the Gloam wall away.
- Keyboard + mouse, controller, touch from the start. Procedural sound. Deployed to GitHub Pages.

**Later**
- Music, a bestiary, a second save slot, save export/import, a boat or other vehicle, optional side dungeon, a companion, New Game+.

**Explicitly not taken from the original:** its title, world, story, names, monster designs, the slime, menus' wording, music and jingles, the map layout and the relic-and-bridge quest structure.

## Architecture

Vite 8.3.8 + Phaser 4.2.1 + TypeScript 7.0.2 (checked 2026-11-14; same as Hedge-Hogger). Node `^20.19.0 || >=22.12.0` (Vite's `engines`). Project files, `view.ts`, `sfx.ts`, `tools/cdp.mjs` and the deploy workflow come from Hedge-Hogger (the newest reference; its harness is already the shared `cdp.mjs` the playbook asks for). `assets/` is Vite's public dir, so `tools/sprites.py build` output is live.

**World model:** a grid, like Hedge-Hogger's fixed screen but with a following camera. No arcade physics. Maps are 2D character grids; each map is baked once into a canvas texture by the tile painter (re-baked when a beacon lights or a door opens) and drawn under the sprites. The camera follows the hero, clamped to the map. Battle is its own scene over the paused world.

| Module | Source | What |
|---|---|---|
| `config.ts` | new | Every tunable: step time, encounter odds and grace steps, region modifier, level table, spells, creature and warden stats, gear and prices, Valor window, palette, sprite list and mirror flags. |
| `data/maps.ts` | new, pure | Overworld (the mockup's ASCII), town maps, dungeon floors, site and door links. |
| `data/people.ts` | new, pure | NPC placements and lines per town, shop stock, quest-line text per beacon count. |
| `world.ts` | new, pure | Grid helpers, `walkable`, BFS, region map, encounter roll and pool pick from a mulberry32 `rng`. Pure so tests can import it from the dev server. |
| `battle.ts` | new, pure | Battle state: turn order, damage and flee formulas, foe AI and traits, status effects, rewards and level-ups. Emits a list of events the scene plays back. |
| `tiles.ts` | from the mockup | Code-drawn tile painters, bake to texture, unlit-region tint, battle backdrops. |
| `tint.ts` | from the mockup | HSL recolour of a base sprite into a kin texture at load. |
| `save.ts` | new | One versioned slot in `localStorage`, every access in try/catch; missing or corrupt → New journey only. |
| `controls.ts` | adapted from HH | Four directions with hold-to-repeat (walking, menu cursor), A, B, MENU, mute; keyboard, mouse, controller, touch; last-used device for hints. |
| `touch.ts` | adapted from HH | D-pad on the left, A and B on the right, in the side bars on wide phones, otherwise the bottom corners; direct taps on menu rows and foes. |
| `effects.ts`, `sfx.ts`, `view.ts` | copied from HH | Sparks, rings, shake in game pixels, flash; synth voices (new set); camera fit at 4× (game) and 2× (HUD). |
| `pilot.ts` | from the mockup | Demo pilot: route walking by BFS and the battle choices. Title attract mode, and the headless balance probe. |
| `scenes/TitleScene.ts` | new | Title, Continue / New journey, name entry (typing, or an on-screen keyboard on touch), settings (Valor timing, text speed). |
| `scenes/WorldScene.ts` | new | Overworld, towns and dungeons: movement, sites, NPCs, chests, doors, stairs, darkness, fog, encounters. |
| `scenes/BattleScene.ts` | new | Plays `battle.ts` events: lunges, flashes, Valor ring, bolts, popups, cleanse fade, level-up. |
| `scenes/HudScene.ts` | adapted | Status bar, MENU chip, beacon pips, sound toggle, hint strip, message and dialogue box, shop and menu panels, banners (behind sprites). |

**Sprites:** 16 × 16 from the concept sheet's picks (`chosen` in `tools/sprite_slots.json`). The squire's art faces left, so `"mirror": true`; it flips to face its walking direction and always faces right in battle. Foes face left as drawn. Chest, beacon, herb, coin and key double as map objects and 8 px HUD icons.

## Milestones

Each one ends playable, tested, committed, pushed and live. Default rhythm: show the result and wait for the go-ahead before each commit.

**Definition of done, every milestone:** its test and every earlier one pass; screenshots looked at; this plan's Status and the README updated (rules, roster, controls, screenshot if the look changed); Part C1 checks; commit as leeeeeroyj; push; the Pages deploy succeeds.

1. **Skeleton + publishing.** Project files, title scene, the overworld baked and walkable with the following camera, unlit-region tint, a minimal HUD (status bar, beacon pips, sound toggle, hint strip), dev hooks, `tools/cdp.mjs` + `tools/m1-test.mjs`, deploy workflow (actions at `checkout@v7`, `setup-node@v7`, `upload-pages-artifact@v5`, `deploy-pages@v5`, re-checked). Create the repo and Pages, MIT licence, README, repo settings (C2–C5). First push.
   *Verify:* title → New journey → map; arrow keys walk a scripted route; mountains and water block; the camera clamps at the edges; `world.ts` imported from the dev server gives BFS reachability from Brightkeep to every site, and the Hollow only with four beacons; no page errors; screenshots at 0 and 4 beacons.
2. **First playable.** Random encounters with the encounter wipe, BattleScene, Meadow creatures, FIGHT and FLEE, Valor timing, Valor and gold, level-ups, defeat → wake at Brightkeep with half the gold.
   *Verify:* a dev hook forces a fight; FIGHT lowers foe HP by the formula's range; a press inside the window scores 1.5× and outside does not; FLEE succeeds about 2 in 3 over 200 seeded tries; a level-up at the threshold; defeat halves gold and places the hero at the shrine.
3. **Full roster and magic.** All 17 creatures and tinted kin, groups of up to 3, target selection, every trait and status, SPELL and ITEM menus, the eight spells (field spells usable from the menu).
   *Verify:* a spawn hook per creature with a screenshot each; spores sleep, poison ticks per step and per turn, Hush blocks spells, drain heals the foe, steal ends the fight for that foe; Lull, Spark, Flare and Mend numbers in range; `battle.ts` imported straight from the dev server for formula tables.
4. **Towns, shops and saving.** Town maps for Brightkeep, Fenbridge, Frostholm and the hermit; NPC dialogue; smith, grocer, inn, shrine; equipment; Queen Maren's next-level line; save and Continue.
   *Verify:* buy and equip changes attack and defence by the item's value; selling pays half; the inn refills HP and MP; save, reload the page, Continue restores position, stats, items, gold and flags; a corrupt save falls back to New journey without errors.
5. **Dungeons, wardens and beacons.** Four beacon dungeons and the Hollow, darkness, torches and Glow, chests, keys, doors, stairs, Homeward; the four wardens and their telegraphs; relighting regions; the Gloam wall; the Gloam's two phases; ending and credits.
   *Verify:* BFS reachability of every floor's stairs and chests given the keys found before each door (no softlock without the hermit's keys); a warden can't be fled; beating each warden lights its beacon, re-tints the region and drops its encounter rate; all four remove the wall; the Gloam changes form at half HP; the ending sets the save flag.
6. **HUD and feedback.** Menu (status, spells, items, equipment, quest line), dialogue box with text speed, banners, sounds for every event, sparks, rings, shake, flashes, fog, beacon glow; prefers-reduced-motion drops shake and flashes.
   *Verify:* a spy on the sound manager hears each voice; screenshots mid-burst keep the hero, foes and the Valor ring readable; frame time in headless Chrome on the map and in a three-foe fight.
7. **Touch and mobile.** D-pad, A and B, side-bar layout on wide phones, tappable menu rows, foes, MENU chip, sound toggle and shop rows; the on-screen keyboard for the hero's name; landscape overlay.
   *Verify:* CDP touch emulation at 844 × 390 and 932 × 390: start a journey, walk, win a fight with a Valor tap, buy a herb, save at a shrine. Then a real phone (needs the user).
8. **Polish.** Balance pass: the autopilot probe plays the critical path from LV 1 and logs time, level and deaths at each warden (target: about LV 4, 7, 10, 13 at the four wardens and about 45–60 minutes in all); then the user's play-through. Final README and hero screenshot.

## Testing

Headless Chrome via CDP (`tools/cdp.mjs` from Hedge-Hogger) with real key, mouse and touch events, as `node tools/mN-test.mjs . <out-dir>`, each test on its own Vite port. Dev builds expose the game as `window.__heroicCrusader` (behind `import.meta.env.DEV`) with hooks: teleport to a site, force a fight with given foes, set level, grant gold or items, light beacons, open the Hollow, seed the `rng`. Pure modules (`world.ts`, `battle.ts`, `data/*`) are imported straight from the dev server. Screenshots looked at for every new screen. Real phone before touch is called done.

## Decisions

- **Name (2026-11-14): Heroic Crusader,** given by the user. Name check below.
- **Direction (2026-11-14, the user's picks):** storybook beacons setting; side-view battles; classic random encounters (no visible monsters, no danger meter); compact solo scope.
- **Re-imagine, don't recreate:** creatures are freed, not slain; four beacons replace the original's relics and bridge; no slime-like creature (teardrop blobs were skipped in the Gloam and villager candidates); Mario-like mushroom-head toads were skipped.
- **Sprite picks (2026-11-14, the user's):** squire 231773 (mirrored), villager 1336911, merchant 773470, shrine keeper 1010566, queen 977723, Thornhare 580368, Puffcap 812181, Rook 308441, Bogtoad 1280386, Marshwisp 460488, Duskbat 1329171, Frostfang 29879, Rustguard 103236, Cairn 1207622, Bristleback 115905, Sir Croakley 492024, Old Rime 636360, the Hollow Regent 713910, the Gloam 1083549, chest 1302426, beacon 145657, herb 588954, coin 269975, key 385663.
- **Valor timing (2026-11-14): kept, on by default,** with a switch in settings.
- **Hero naming on touch (2026-11-14): an on-screen keyboard** (physical keyboard typing on desktop).
- **Milestones (2026-11-14): as many as needed,** per the user. Eight planned; split further if one grows too big.
- **Esc / Start go to the title until the menu exists** (milestone 6), so a player can always leave.
- **Kin are recolours,** baked at load by HSL shift, so 9 sprite families give 17 creatures.
- **Darkness by tile bands** (lit, dim, black) rather than a smooth mask, to keep the pixel look.

## Open questions

- **Name check.** No game, store listing or trademark found for "Heroic Crusader" (searches 2026-11-14). Nearby: THE HEROES CRUSADE (US mark, cancelled 2018), a CRUSADER OF LIGHT filing, *Crusaders of Might and Magic* (3DO, 1999), *Crusader: No Remorse* (Origin/EA, 1995), *Swords & Sandals: Crusader*. Fine for a free personal project; re-check before any commercial use. "Crusader" also carries holy-war associations; the game uses it only in the sense of a knight's vow, with no religious war.
- **Encounter rate:** classic random by the user's choice; if the balance pass finds it grindy, the first lever is the odds table, then the grace steps, before adding anything new.
- **Music:** none in v1 (procedural sound effects only). Revisit after milestone 8.
- **Repo and Pages URL:** `leeeeeroyj/heroic-crusader`, `https://leeeeeroyj.github.io/heroic-crusader/`.

## Status (2026-11-15: milestone 2 done; milestone 3 next)

- **Part A complete (2026-11-14).** The user picked the sprites and answered the open questions (see Decisions). Concept sheet rebuilt with the picks and republished.
- **Milestone 1 (skeleton + publishing) done and published.** Vite 8.3.8 + Phaser 4.2.1 + TypeScript 7.0.2; project files, `view.ts`, `sfx.ts`, `tools/cdp.mjs` and the deploy workflow from Hedge-Hogger (actions confirmed current: `checkout@v7`, `setup-node@v7`, `upload-pages-artifact@v5`, `deploy-pages@v5`). `cdp.mjs` gained Z and X keys.
  - `src/data/maps.ts` (the mockup's overworld and sites), `src/world.ts` (pure: build the map, 4-connect diagonal roads, regions by terrain then nearest beacon, `walkable`, `isLit`, `bfs`, `rng`), `src/tiles.ts` (the mockup's tile painters, baked to one canvas; unlit regions desaturated and violet-tinted; the Gloam wall turns to rubble with all four lit), `src/state.ts` (the journey: hero and beacons, in the registry), `src/controls.ts` (directions held and tapped; confirm, back, menu, mute; keyboard and controller).
  - `TitleScene`: the grey map pans behind a veil; title, hero, creatures and wardens; NEW JOURNEY (Enter, Z, A or click); keyboard and controller tables; controller status.
  - `WorldScene`: grid walking (0.17 s a step, hold to keep walking), facing flip and a one-pixel bob, bump sound on walls, camera centred on the hero and clamped to the map, beacon fires on lit towers, place banner on arriving at a site, Esc / Start back to the title. Dev hooks: `teleport(site | tile)`, `setLit(n | list)`.
  - `HudScene` (2× space): status panel (name, level, HP, MP, gold with coin icon), four beacon pips, tappable speaker, device-matched hint strip on a dark band, place banner.
  - README (per C4, describing the game as it stands), MIT licence (2026, leeeeeroyj), hero screenshot `docs/screenshot.png` staged in the real game with two beacons lit.
- **Verified (M1):** `npm run build` passes (typecheck + bundle). `node tools/m1-test.mjs . <out-dir>`: 25/25. Title runs and every sprite loads; Enter starts a journey in Brightkeep with a LV 1, 15 HP hero on the HUD; holding right walks 7 tiles in 1.2 s; facing follows the walk; water and mountains block; the camera clamps at both corners and centres mid-map; from `world.ts` on the dev server every town and beacon is reachable, the Hollow only with four beacons, every road tile joins a road or site, and regions cover 0–3 plus the Hollow; in the game the wall blocks at 0 beacons and opens at 4, the map re-bakes and the HUD pips follow; stepping onto Fenbridge names it; M toggles sound; Esc returns to the title; no page errors. Screenshots looked at: title, start, two lit, all lit, hero shot.
- **Not in M1, by plan:** encounters and battles (M2), touch controls (M7; the hint tells touch players so), the menu (M6).
- **Renamed for the C1 scan (2026-11-14):** the marsh village is now **Fenbridge**, and the golem slot keeps only its four stone-golem candidates, so the C1 name scan stays clean.
- **Published (2026-11-14):** first commit as leeeeeroyj; the user created `leeeeeroyj/heroic-crusader` (public); description and homepage set; Pages enabled (workflow build); deploy run succeeded; https://leeeeeroyj.github.io/heroic-crusader/ serves the game. Licence detected as MIT. C5 applied and verified: wiki and projects off, delete-branch-on-merge, topics (phaser, typescript, browser-game, rpg), vulnerability alerts, GitHub-owned actions only, "Protect main" ruleset (no deletion, no force-push), secret scanning and push protection on, workflow token read-only, Pages HTTPS enforced, leeeeeroyj the only collaborator, no deploy keys, webhooks, secrets or variables.
- **Milestone 2 (first playable) done (2026-11-15).** The user said "keep building" (standing go-ahead for the plan).
  - `battle.ts` (pure): foes from `CREATURES`, the damage formula, strike (heroic blow 1/24, Valor 1.5x), blow (guard halves), flee 0.66, turn order by agility with luck, ambush by a foe 4+ agility quicker (25%), rewards, `gainValor` with level-ups. A battle is a generator of events; the two ring events wait for the player's answer. `autoplay()` drives the same generator for tests and the balance probe.
  - `world.ts`: `groundAt` (by tile), `encounterOdds` (by tile, lit x2/3, none on sites or in the Hollow's corner), `rollEncounter` (grace 5 steps). `state.ts`: gear slots, attack, defence, agility, `toNext`, `wakeAtShrine`. `tiles.ts`: battle backdrops per ground (grey under a cold beacon), `tintImage` for kin. `sprites.ts`: `creatureTexture`, `bakeKin` (run at the title).
  - `WorldScene`: encounter roll after each step, the spiral wipe (0.6 s), launches `BattleScene` over the paused world, `endFight` (fall: wake at the home shrine, half the gold, message). Stepping into a town refills HP and MP until inns exist (M4). Dev hooks: `fight(ids, ground?)`, `seed(n)`, `calm` (no random fights; the M1 test sets it).
  - `BattleScene`: backdrop, hero 2x facing right, 1-3 foes 2x facing left with shadows, command box (FIGHT, FLEE; SPELL and ITEM dimmed until M3), message box, target cursor, Valor ring (closes over 0.42 s on a strike, 0.32 s on a blow; a press within 0.11 s of closing counts), white flash before a foe acts, damage popups, sparks, shake, freed creatures fade and run, rewards, LEVEL UP, the fall. `effects.ts` copied from Hedge-Hogger.
  - HUD: battle hints, a message box while walking, `publishHud` shared by both scenes. Sounds: encounter, swing, hit, valor, guard, hurt, freed, flee, victory, levelup, fall, rest.
  - `Controls.read()` now reads every key's just-pressed flag each frame (the old `||` chains left flags set for the next frame).
- **Balance (2026-11-15, by a seeded sim of `autoplay`, 400-600 fights a cell):** with the concept sheet's numbers a LV 1 hero won 31% of meadow fights. Softened Thornhare, Rook, Puffcap and Duskbat and gave the Oak Stick +4 (was +2): LV 1 now wins 94% of meadow fights without Valor (losing about 44% HP a fight; Puffcap + Rook is the hard one at 73%), 100% with Valor half the time; hills want LV 2-3. Later regions are only beatable with the shop gear, herbs and spells still to come; the M8 probe re-checks.
- **Decisions (2026-11-15):** encounter pools and backdrops go by the tile underfoot, not the region (the Ruins region's grass begins three tiles from Brightkeep's gate); crow, toad and rustguard art face left (added to `MIRROR`, checked by eye), so every foe faces the hero; the Frostwisp's tint is now a 90 degree turn (170 made it purple, not icy).
- **Verified (M2):** `node tools/m2-test.mjs . <out-dir>`: 28/28, three runs in a row. From the modules: a LV 1 strike always in the formula range with both ends seen; Valor 1.5x; guard half; flee 137/200; no level-up one Valor short, LV 2 at the threshold with HP raised; odds road 1/48, marsh 1/10, lit x2/3, none in towns or the Hollow; none within the grace steps; hills fight on the hills ground; every kin baked. In the game: walking the meadow meets a meadow fight; HUD battle hints; a press inside the window is a Valor strike (5 from base 3) and a guard (1 from 2); a press far too early does nothing extra; FLEE returns to the map; a Thornhare at 6 Valor pays 1 Valor and 2 gold and makes LV 2; a fall at 51 gold wakes in Brightkeep with 26 and full HP and the shrine message; three kin with the target cursor; back returns to the commands; no page errors. M1 test still 25/25. Screenshots looked at: wipe, menu, target, ring, Valor popup, level-up, woke, three kin, hero shot.
- **Next:** milestone 3 (full roster and magic).
