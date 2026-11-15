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

![Heroic Crusader: the squire on a road through green meadow, with the Marsh beacon burning in the top-left corner over the marsh village of Fenbridge, while the snowfields to the north and the ruins to the east are still grey under the Gloam](docs/screenshot.png)

</div>

## About

Heroic Crusader is an original role-playing game inspired by the mechanics of Chunsoft and Enix's 1986 game *Dragon Quest*. The Gloam has put out the four beacons of a small kingdom, and the land has gone grey. A squire from Brightkeep takes the vow to light them again.

- **A whole kingdom to walk.** Meadow, marsh, snowfields and ruins, joined by roads and bridges, with three towns, a hermit's hut and four beacon towers to find.
- **The land shows what's lit.** Every region stays grey and violet under the Gloam until its beacon burns, then its colour comes back.
- **Hand-drawn map, code-drawn tiles.** Forests, hills, rivers, mountains and roads are all painted in code at 16 × 16 pixels.
- **Keyboard or controller,** with hints that follow the last one you touched.

## How to play

- Walk the map a tile at a time. Hold a direction to keep walking.
- Mountains and rivers block the way; bridges and roads get you across.
- Step onto a town or a beacon tower to see its name.
- The four flames at the top right are the beacons: grey while cold, burning once lit. The wall round Gloam's Hollow, in the far north-east, stays shut until all four burn.
- The top left shows your squire: name, level, HP, MP and gold.

## Controls

| Action | Keyboard | Controller |
|---|---|---|
| Walk, choose | Arrows / WASD | D-pad / left stick |
| Confirm | Z / Space / Enter | A |
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
  state.ts           the journey: the hero and the beacons
  world.ts           map rules: walking, regions, paths
  data/maps.ts       the overworld and its sites
  tiles.ts           code-drawn tiles, baked per beacon state
  controls.ts        keyboard and gamepad input
  sfx.ts             procedural sound effects
  scenes/            title screen, the world and the HUD
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
