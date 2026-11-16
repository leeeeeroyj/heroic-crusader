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
- **Creatures with tricks.** Rooks snatch your gold, wolves howl for the pack, toads poison, wisps hush your spells, cairns brace behind stone.
- **Eight spells** learned as you rise, from Mend and Spark to Flare and Homeward.
- **Four beacon dungeons,** dark below ground, with chests, locked vaults and a warden at the top of each. Free the warden and its beacon burns again.
- **Towns to rest in.** Three towns and a hermit's hut, with a smith, a grocer, an inn and a shrine where you record your journey. Name your squire, save, and carry on later.
- **Hand-drawn map, code-drawn tiles.** Forests, hills, rivers, mountains, roads and battle backdrops are all painted in code.
- **Keyboard or controller,** with hints that follow the last one you touched.

## How to play

- Walk the map a tile at a time. Hold a direction to keep walking.
- Mountains and rivers block the way; bridges and roads get you across.
- Step onto a town to go in; walk out through the gap at the bottom to leave. Step onto a beacon tower to go down into its dungeon.
- Esc (or Start) opens the menu: your squire's status, spells and items to use on the road, and the way back to the title.
- The four flames at the top right are the beacons: grey while cold, burning once lit. The wall round Gloam's Hollow, in the far north-east, stays shut until all four burn.
- The top left shows your squire: name, level, HP, MP and gold. HP turns green while you're poisoned.

### Towns

- Walk up to someone and press Z (or A) to talk. Shopkeepers stand behind their counters: talk to them across it.
- **Queen Maren**, in Brightkeep's hall, tells you where to go next and how much Valor you need for your next level.
- **The smith** sells weapons, armour and shields. Buying a piece puts it on and trades your old one in for half its price, so you pay the difference. The shop shows how much your attack or defence will change before you buy.
- **The grocer** sells herbs, remedies, incense and torches, and buys what's in your pack for half price.
- **The inn** refills HP and MP and cures poison for a few gold (6 in Brightkeep, 12 in Fenbridge, 20 in Frostholm).
- **The shrine keeper** cures poison for free and records your journey. Your last shrine is where you wake if you fall, and where Homeward takes you.
- The hermit, out east, sells iron keys.

### Saving

- Your journey is saved only at a shrine, in one slot in this browser. The title screen then offers **Continue**.
- **New journey** asks for your squire's name: type up to eight letters, then press Enter. A controller keeps the name Wren.

### Dungeons

- Under each beacon tower is a dungeon: the Thornwood Barrow (one floor), the Drowned Belfry (two), Rime Spire (three) and Sunder Keep (three). Stairs lead on; the stairs you came by lead back, and out.
- It's dark down there. Bare, you see a tile round you. A **torch** lights two tiles until you leave; the **Glow** spell lights four, fading to two over 200 steps. Use either from the menu.
- Press Z (or A) facing a **chest** to open it. Gear goes on if it beats what you wear; otherwise you strip it for half its price. If your pack is full, the chest stays shut until you make room.
- **Locked doors** take an iron key each and stay open after. They only ever guard treasure: the way to every warden is open. Keys turn up in chests, and the hermit sells them.
- At the top of each dungeon a **warden** guards the beacon's brazier. Walk into it, or press Z facing it, to fight. There's no fleeing a warden, and Lull won't touch it. Every third turn it gathers itself, and the turn after it lets loose its big move: heal up or get ready to guard when you see it coming.
- Free the warden and the beacon burns: its region gets its colour back, and creatures there come a third less often.

| Warden | Guards | HP | Attack | Defence | Valor | Gold | Big move |
|---|---|---|---|---|---|---|---|
| Bristleback | Thornwood Barrow | 64 | 24 | 12 | 60 | 80 | a charge: 2 times a blow (guard it on the ring) |
| Sir Croakley | Drowned Belfry | 150 | 46 | 30 | 200 | 200 | 14-20 damage and poison, no guarding |
| Old Rime | Rime Spire | 210 | 58 | 40 | 500 | 400 | 22-30 damage, no guarding |
| Hollow Regent | Sunder Keep | 200 | 72 | 44 | 900 | 600 | takes 20-26 HP and heals itself by as much |

### Fights

- Creatures jump out at random as you walk, never within five steps of the last fight. Roads and bridges are safest (1 step in 48); sand 1 in 30; grass 1 in 22; forest and snow 1 in 14; hills 1 in 12; marsh and rubble 1 in 10; dungeon floors 1 in 16. Where a beacon burns, they come a third less often.
- What you meet depends on the ground under you: grass, forest and roads anywhere have the meadow's creatures, and marsh, snow, hills, rubble and each dungeon have their own, tougher ones.
- **FIGHT** strikes one foe (choose which when there are several). **SPELL** casts a spell you know, if you have the MP. **ITEM** uses something from your pack. **FLEE** gets you away about two times in three; when it fails, the foes still act.
- You act first, then each foe, quickest first. A foe much quicker than you may strike before your first turn, and a quick one may act before you in any round. Each one flashes white before it acts.
- **Valor timing:** a ring closes on the target as each blow lands. Press confirm within about a tenth of a second of it closing: your strike does 1.5 times the damage, or a foe's blow does half. Press too early or late and nothing is lost. Once in a while a strike is a heroic blow that goes straight through armour.
- Beating creatures earns Valor (experience) and gold. Enough Valor raises your level: more HP, MP, attack and defence. LV 2 needs 7 Valor, LV 3 needs 23, LV 4 needs 47.
- **Sleep** costs you your next turn. **Poison** stings each round and each step on the map (never below 1 HP) until a remedy or a night's rest cures it. **Hush** stops your spells for the rest of the fight. A sleeping foe wakes when it's hurt; a braced one takes half damage.
- If you fall, you wake at your last shrine with full HP and half your gold.

| Creature | Found on | HP | Attack | Defence | Agility | Valor | Gold | Tricks |
|---|---|---|---|---|---|---|---|---|
| Thornhare | Meadow | 5 | 7 | 3 | 12 | 1 | 2 | quick: may strike before you |
| Rook | Meadow, Hills, Thornwood Barrow | 6 | 8 | 4 | 10 | 2 | 3 | snatches gold and flies off |
| Puffcap | Meadow, Hills, Marsh, Thornwood Barrow | 9 | 8 | 6 | 3 | 3 | 4 | spores put you to sleep |
| Duskbat | Hills, Thornwood Barrow, Drowned Belfry | 10 | 11 | 6 | 14 | 4 | 5 | drinks half the HP it takes |
| Bogtoad | Marsh, Drowned Belfry | 24 | 22 | 14 | 4 | 9 | 10 | bite can poison |
| Marshwisp | Marsh, Drowned Belfry | 16 | 18 | 12 | 18 | 10 | 12 | casts Spark (6-10); dodges strikes |
| Rotcap | Marsh, Drowned Belfry | 20 | 20 | 14 | 5 | 11 | 12 | spores poison |
| Frostfang | Snow, Rime Spire | 30 | 32 | 20 | 16 | 18 | 20 | howls for help |
| Rimehare | Snow, Rime Spire | 22 | 30 | 18 | 22 | 16 | 15 | bites twice |
| Frostwisp | Snow, Rime Spire | 26 | 26 | 22 | 20 | 20 | 22 | casts Hush; dodges strikes |
| Rustguard | Ruins, Sunder Keep | 40 | 42 | 40 | 8 | 30 | 35 | — |
| Cairn | Ruins, Sunder Keep | 60 | 46 | 34 | 4 | 34 | 30 | braces every other turn |
| Gloombat | Ruins, Sunder Keep | 30 | 40 | 26 | 24 | 24 | 25 | drinks all the HP it takes |
| Grim Rook | Ruins, Sunder Keep | 28 | 36 | 24 | 22 | 22 | 28 | snatches gold and flies off; casts Spark (12-18) |
| Shadefang | Sunder Keep | 50 | 56 | 34 | 26 | 45 | 40 | howls for help |
| Ironguard | Sunder Keep | 64 | 60 | 60 | 10 | 55 | 60 | — |

A blow does (attack − defence ÷ 2) × 0.35 to 0.5. Your squire starts at LV 1 with an Oak Stick (+4 attack), a Quilted Tunic (+2 defence), two herbs and 20 gold.

| Gear | Slot | Adds | Price | Where |
|---|---|---|---|---|
| Oak Stick | Weapon | +4 attack | — | You start with it |
| Hunter's Knife | Weapon | +10 attack | 45 | Brightkeep, Fenbridge |
| Iron Blade | Weapon | +18 attack | 180 | Fenbridge, Frostholm |
| Frostbrand | Weapon | +28 attack | 520 | Frostholm, a chest in Rime Spire |
| Quilted Tunic | Armour | +2 defence | — | You start with it |
| Hide Vest | Armour | +6 defence | 35 | Brightkeep, Fenbridge |
| Ring Coat | Armour | +12 defence | 150 | Fenbridge, Frostholm |
| Scale Coat | Armour | +20 defence | 440 | Frostholm |
| Dawn Mail | Armour | +28 defence | — | a chest in Sunder Keep |
| Wicker Shield | Shield | +3 defence | 25 | Brightkeep |
| Iron Buckler | Shield | +8 defence | 120 | Fenbridge, Frostholm, a chest in Thornwood Barrow |
| Kite Shield | Shield | +14 defence | 360 | Frostholm, a chest in Drowned Belfry |

### Spells and items

| Spell | Learned at | MP | Where | What it does |
|---|---|---|---|---|
| Mend | LV 3 | 3 | Both | Heals 17-23 HP |
| Spark | LV 4 | 2 | Battle | 8-12 fire damage to one foe |
| Glow | LV 5 | 2 | Map | Lights 4 tiles round you underground, fading over 200 steps |
| Lull | LV 7 | 2 | Battle | Puts foes to sleep for 2-3 turns (each resists 1 time in 4) |
| Ward | LV 9 | 2 | Map | Weaker creatures keep away for 200 steps |
| Homeward | LV 10 | 6 | Map | Takes you back to your home shrine |
| Flare | LV 12 | 5 | Battle | 22-30 fire damage to every foe |
| Restore | LV 14 | 8 | Both | Heals 75-90 HP |

A **herb** (10 gold) heals 22-28 HP, in battle or on the road; the pack holds up to six. A **remedy** (12) cures poison. **Incense** (30) keeps weaker creatures away for 120 steps. "Weaker" means too weak to hurt you through your armour. A **torch** (8) lights a dungeon until you leave it. An **iron key** (40) opens one locked door.

## Controls

| Action | Keyboard | Controller |
|---|---|---|
| Walk, choose | Arrows / WASD | D-pad / left stick |
| Confirm; talk; open; strike or guard on the ring | Z / Space / Enter | A |
| Back | X / Backspace | B |
| Menu (status, spells, items, title) | Esc | Start |
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
  state.ts           the journey: the hero, gear, pack and beacons
  shop.ts            buying, selling and the inn
  save.ts            the save slot, checked field by field when it's read
  world.ts           map rules: walking, regions, paths, encounters, dungeon floors
  battle.ts          battle rules, played out as a list of events
  field.ts           spells, items and chests on the map
  data/maps.ts       the overworld, its sites and the town maps
  data/people.ts     townsfolk, their lines and their shops
  data/dungeons.ts   the beacon dungeons: floors, chests and wardens
  tiles.ts           code-drawn tiles, battle backdrops and recoloured kin
  controls.ts        keyboard and gamepad input
  effects.ts         sparks, shake and flash
  sfx.ts             procedural sound effects
  scenes/            title screen, the world, towns and dungeons, battles, talking, the menu and the HUD
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
