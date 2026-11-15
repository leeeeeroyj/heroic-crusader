<div align="center">

# Heroic Crusader

**Four beacons. One squire. The Gloam.**

A storybook role-playing game about a squire who sets out to relight the beacons of a kingdom gone grey. It runs in the browser with a keyboard or a controller.

### [▶ Play it now](https://leeeeeroyj.github.io/heroic-crusader/)

[![Deploy](https://github.com/leeeeeroyj/heroic-crusader/actions/workflows/deploy.yml/badge.svg)](https://github.com/leeeeeroyj/heroic-crusader/actions/workflows/deploy.yml)
![Phaser 4](https://img.shields.io/badge/Phaser-4-8a5cf6)
![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

![Heroic Crusader: a side-view fight on a sunny meadow. The squire lunges at a Rook, a Puffcap and a Thornhare while the Valor ring closes on the Puffcap, and the command box says Press Z on the ring](docs/screenshot.png)

</div>

## About

Heroic Crusader is an original role-playing game inspired by the mechanics of Chunsoft and Enix's 1986 game *Dragon Quest*. The Gloam has put out the four beacons of a small kingdom, and the land has gone grey. A squire from Brightkeep takes the vow to light them again.

- **A whole kingdom to walk.** Meadow, marsh, snowfields and ruins, joined by roads and bridges, with three towns, a hermit's hut and four beacon towers to find.
- **The land shows what's lit.** Every region stays grey and violet under the Gloam until its beacon burns, then its colour comes back.
- **Side-view fights.** Creatures jump out as you walk, more often on rough ground. Beaten ones aren't killed: they shake off the Gloam and run home.
- **Valor timing.** A ring closes as each blow lands. Press on it for a strike half again as hard, or to halve a blow aimed at you.
- **Hand-drawn map, code-drawn tiles.** Forests, hills, rivers, mountains, roads and battle backdrops are all painted in code.
- **Keyboard or controller,** with hints that follow the last one you touched.

## How to play

- Walk the map a tile at a time. Hold a direction to keep walking.
- Mountains and rivers block the way; bridges and roads get you across.
- Step onto a town or a beacon tower to see its name. Stepping into a town is a night's rest: HP and MP refill.
- The four flames at the top right are the beacons: grey while cold, burning once lit. The wall round Gloam's Hollow, in the far north-east, stays shut until all four burn.
- The top left shows your squire: name, level, HP, MP and gold.

### Fights

- Creatures jump out at random as you walk, never within five steps of the last fight. Roads and bridges are safest (1 step in 48); sand 1 in 30; grass 1 in 22; forest and snow 1 in 14; hills 1 in 12; marsh and rubble 1 in 10. Where a beacon burns, they come a third less often.
- What you meet depends on the ground under you: grass, forest and roads anywhere have the meadow's creatures, and marsh, snow, hills and rubble each have their own, tougher ones.
- **FIGHT** strikes one foe (choose which when there are several). **FLEE** gets you away about two times in three; when it fails, the foes still act. SPELL and ITEM are greyed out: there are no spells or items to use yet.
- You act first, then each foe, quickest first. A foe much quicker than you may strike before your first turn. Each one flashes white before it acts.
- **Valor timing:** a ring closes on the target as each blow lands. Press confirm within about a tenth of a second of it closing: your strike does 1.5 times the damage, or a foe's blow does half. Press too early or late and nothing is lost. Once in a while a strike is a heroic blow that goes straight through armour.
- Beating creatures earns Valor (experience) and gold. Enough Valor raises your level: more HP, MP, attack and defence. LV 2 needs 7 Valor, LV 3 needs 23, LV 4 needs 47.
- If you fall, you wake at the Brightkeep shrine with full HP and half your gold.

| Creature | Found on | HP | Attack | Defence | Agility | Valor | Gold |
|---|---|---|---|---|---|---|---|
| Thornhare | Meadow | 5 | 7 | 3 | 12 | 1 | 2 |
| Rook | Meadow, Hills | 6 | 8 | 4 | 10 | 2 | 3 |
| Puffcap | Meadow, Hills, Marsh | 9 | 8 | 6 | 3 | 3 | 4 |
| Duskbat | Hills | 10 | 11 | 6 | 14 | 4 | 5 |
| Bogtoad | Marsh | 24 | 22 | 14 | 4 | 9 | 10 |
| Marshwisp | Marsh | 16 | 18 | 12 | 18 | 10 | 12 |
| Rotcap | Marsh | 20 | 20 | 14 | 5 | 11 | 12 |
| Frostfang | Snow | 30 | 32 | 20 | 16 | 18 | 20 |
| Rimehare | Snow | 22 | 30 | 18 | 22 | 16 | 15 |
| Frostwisp | Snow | 26 | 26 | 22 | 20 | 20 | 22 |
| Rustguard | Ruins | 40 | 42 | 40 | 8 | 30 | 35 |
| Cairn | Ruins | 60 | 46 | 34 | 4 | 34 | 30 |
| Gloombat | Ruins | 30 | 40 | 26 | 24 | 24 | 25 |

A blow does (attack − defence ÷ 2) × 0.35 to 0.5. Your squire starts at LV 1 with an Oak Stick (+4 attack) and a Quilted Tunic (+2 defence).

## Controls

| Action | Keyboard | Controller |
|---|---|---|
| Walk, choose | Arrows / WASD | D-pad / left stick |
| Confirm; strike or guard on the ring | Z / Space / Enter | A |
| Back | X / Backspace | B |
| Back to the title | Esc | Start |
| Sound on/off | M (or click the speaker) | Back |

## Run it locally

You need [Node.js](https://nodejs.org/) 20.19+ or 22.12+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build to dist/
```

Every push to `main` builds the game and deploys it to GitHub Pages.

## Project layout

```
src/
  main.ts            game setup
  config.ts          tunables: screen, walking, level table, sprites, colours
  state.ts           the journey: the hero, gear and beacons
  world.ts           map rules: walking, regions, paths, encounters
  battle.ts          battle rules, played out as a list of events
  data/maps.ts       the overworld and its sites
  tiles.ts           code-drawn tiles, battle backdrops and recoloured kin
  controls.ts        keyboard and gamepad input
  effects.ts         sparks, shake and flash
  sfx.ts             procedural sound effects
  scenes/            title screen, the world, battles and the HUD
assets/sprites/      the game's 16 × 16 sprites
design/              concept sheet and build plan
tools/sprites.py     sprite search and export script
tools/cdp.mjs        headless Chrome harness for the tests
tools/m*-test.mjs    checks for each milestone
```

## Credits

- **Sprites:** from the CC0 [Angais/pixel-art-atlas-1.4m](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m) collection of AI-generated pixel art, found with [Pixel Search](https://huggingface.co/spaces/cfahlgren1/pixel-search).
- **Font:** [Silkscreen](https://fonts.google.com/specimen/Silkscreen) by Jason Kottke (SIL Open Font License).
- **Engine:** [Phaser](https://phaser.io/).
- **Inspiration:** Chunsoft and Enix's *Dragon Quest*. Heroic Crusader is an original game and isn't affiliated with or endorsed by the original's rights holders.

## License

Code: [MIT](LICENSE). Sprites: CC0. Font: SIL Open Font License.
