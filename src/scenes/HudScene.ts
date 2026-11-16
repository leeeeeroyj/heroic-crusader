import Phaser from 'phaser';
import { COLORS, FONT, HEIGHT, HUD_SCALE, HUD_STATE, TEXT, WIDTH } from '../config';
import type { Device } from '../controls';
import { MUTED, toggleMute } from '../sfx';
import { maxHp, maxMp, type Journey } from '../state';
import { fitCamera } from '../view';

export interface HudState {
  name: string;
  lv: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gold: number;
  poisoned: boolean;
  lit: boolean[];
  device: Device;
  /** Walking the map, or in a fight (the battle scene draws its own message window). */
  mode: 'walk' | 'battle';
  /** A place name to show briefly, with seconds left. */
  place: { name: string; t: number } | null;
  /** A line for the message box while walking, with seconds left. */
  message: { text: string; t: number } | null;
}

/** Writes the HUD's state to the registry for the HUD scene to draw. */
export function publishHud(scene: Phaser.Scene, j: Journey, device: Device, mode: HudState['mode'],
  place: HudState['place'] = null, message: HudState['message'] = null) {
  const h = j.hero;
  const state: HudState = {
    name: h.name, lv: h.lv, hp: h.hp, maxHp: maxHp(h), mp: h.mp, maxMp: maxMp(h), gold: h.gold, poisoned: h.poisoned,
    lit: [...j.lit], device, mode, place, message,
  };
  scene.registry.set(HUD_STATE, state);
}

// HUD space is the design size × HUD_SCALE (832 × 456): sprites drawn here at native 16 px come out half the size
// of game sprites, with no resampling. Every number below is in HUD units (2 per game pixel).
const S = HUD_SCALE;
const W = WIDTH * S, H = HEIGHT * S;
const STATUS = { x: 6, y: 6, w: 400, h: 32 };
const PIPS = { x: 676, y: 6, w: 112, h: 32 };
const SPEAKER = { x: W - 34, y: 6, w: 30, h: 32 };
const MESSAGE = { x: 176, y: 344, w: 480, h: 60 };
const TOUCH_SOON = 'TOUCH CONTROLS ARE ON THE WAY: USE A KEYBOARD OR CONTROLLER FOR NOW';
const HINTS: Record<HudState['mode'], Record<Device, string>> = {
  walk: {
    kbm: 'ARROWS / WASD WALK  ·  ESC MENU  ·  M SOUND',
    pad: 'D-PAD / STICK WALK  ·  START MENU  ·  BACK SOUND',
    touch: TOUCH_SOON,
  },
  battle: {
    kbm: 'ARROWS CHOOSE  ·  Z OK  ·  X BACK  ·  Z ON THE RING',
    pad: 'D-PAD CHOOSE  ·  A OK  ·  B BACK  ·  A ON THE RING',
    touch: TOUCH_SOON,
  },
};

/** Storybook panel: dark fill, a gold outer line with clipped corners, a darker inner line. `u` is one game pixel. */
export function drawPanel(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, alpha = 0.92, u = S) {
  g.fillStyle(COLORS.panel, alpha).fillRect(x + u, y + u, w - 2 * u, h - 2 * u);
  g.fillStyle(COLORS.trim);
  g.fillRect(x + 2 * u, y, w - 4 * u, u).fillRect(x + 2 * u, y + h - u, w - 4 * u, u);
  g.fillRect(x, y + 2 * u, u, h - 4 * u).fillRect(x + w - u, y + 2 * u, u, h - 4 * u);
  for (const [cx, cy] of [[x + u, y + u], [x + w - 2 * u, y + u], [x + u, y + h - 2 * u], [x + w - 2 * u, y + h - 2 * u]]) g.fillRect(cx, cy, u, u);
  g.fillStyle(COLORS.trim2).fillRect(x + 2 * u, y + 2 * u, w - 4 * u, u).fillRect(x + 2 * u, y + h - 3 * u, w - 4 * u, u);
}

/** Top bar (name, level, HP, MP, gold; beacon pips; sound toggle), the hint strip and the place banner. */
export class HudScene extends Phaser.Scene {
  private name!: Phaser.GameObjects.Text;
  private lv!: Phaser.GameObjects.Text;
  private hp!: Phaser.GameObjects.Text;
  private mp!: Phaser.GameObjects.Text;
  private gold!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private placeText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private dynamic!: Phaser.GameObjects.Graphics;
  private clock = 0;

  constructor() {
    super('hud');
  }

  create() {
    fitCamera(this, HUD_SCALE);
    const label = (x: number, y: number, text: string, color: string = TEXT.ink) => this.add.text(x, y, text, { fontFamily: FONT, fontSize: '16px', color });
    const g = this.add.graphics();
    drawPanel(g, STATUS.x, STATUS.y, STATUS.w, STATUS.h);
    drawPanel(g, PIPS.x, PIPS.y, PIPS.w, PIPS.h);
    const ty = STATUS.y + 8;
    this.name = label(STATUS.x + 12, ty, '', TEXT.gold);
    this.lv = label(STATUS.x + 78, ty, '');
    this.hp = label(STATUS.x + 134, ty, '');
    this.mp = label(STATUS.x + 250, ty, '');
    this.add.image(STATUS.x + 330, STATUS.y + 16, 'coin');
    this.gold = label(STATUS.x + 344, ty, '');
    this.dynamic = this.add.graphics();
    this.hint = label(W / 2, H - 26, '', TEXT.dim).setOrigin(0.5, 0);
    this.placeText = this.add.text(W / 2, 96, '', { fontFamily: FONT, fontSize: '16px', color: TEXT.gold }).setOrigin(0.5);
    this.messageText = this.add.text(MESSAGE.x + 16, MESSAGE.y + 12, '', {
      fontFamily: FONT, fontSize: '16px', color: TEXT.ink, lineSpacing: 4, wordWrap: { width: MESSAGE.w - 32 },
    });

    // Phones have no M key: the speaker is a tap target, padded for a thumb.
    this.add.zone(W - 64, 0, 64, 48).setOrigin(0).setInteractive({ useHandCursor: true }).on('pointerdown', () => toggleMute(this));
  }

  update(_time: number, delta: number) {
    this.clock += delta / 1000;
    const s = this.registry.get(HUD_STATE) as HudState | undefined;
    if (!s) return;
    this.name.setText(s.name);
    this.lv.setText(`LV${s.lv}`);
    const low = s.hp / s.maxHp < 0.3;
    this.hp.setText(`HP ${s.hp}/${s.maxHp}`).setColor(s.poisoned ? TEXT.leaf : low ? TEXT.hurt : TEXT.ink);
    this.mp.setText(`MP ${s.mp}`);
    this.gold.setText(String(s.gold));
    this.hint.setText(HINTS[s.mode][s.device]);

    const g = this.dynamic.clear();
    // A dark band behind the hint strip keeps it readable over snow and meadow.
    const hw = this.hint.width + 32;
    g.fillStyle(COLORS.night, 0.6).fillRect(W / 2 - hw / 2, H - 30, hw, 24);
    // Beacon pips: a flame each, cold until lit.
    s.lit.forEach((on, i) => this.flame(g, PIPS.x + 22 + i * 24, PIPS.y + 10, on, i));
    this.speaker(g, this.registry.get(MUTED) === true);
    // Place banner: a band behind the name, fading out.
    if (s.place) {
      const a = Math.min(1, s.place.t * 2);
      g.fillStyle(COLORS.night, 0.7 * a).fillRect(0, 76, W, 40);
      g.fillStyle(COLORS.trim2, a).fillRect(0, 76, W, 2).fillRect(0, 114, W, 2);
      this.placeText.setText(s.place.name.toUpperCase()).setAlpha(a);
    } else this.placeText.setText('');
    // Message box: below the hero, above the hint strip.
    if (s.message && s.mode === 'walk') {
      const a = Math.min(1, s.message.t * 3);
      drawPanel(g, MESSAGE.x, MESSAGE.y, MESSAGE.w, MESSAGE.h, 0.92 * a);
      this.messageText.setText(s.message.text).setAlpha(a);
    } else this.messageText.setText('');
  }

  private flame(g: Phaser.GameObjects.Graphics, x: number, y: number, on: boolean, i: number) {
    if (!on) {
      g.fillStyle(COLORS.ashes).fillRect(x - 2, y + 8, 6, 4);
      g.fillStyle(COLORS.ashes2).fillRect(x, y + 4, 2, 4);
      return;
    }
    const fl = Math.floor(this.clock * 10 + i) % 2;
    g.fillStyle(COLORS.ember).fillRect(x - 4, y + 2, 10, 10);
    g.fillStyle(COLORS.gold).fillRect(x - 2, y - fl * 2, 6, 10);
    g.fillStyle(0xfff4c0).fillRect(x, y + 4, 2, 4);
  }

  private speaker(g: Phaser.GameObjects.Graphics, muted: boolean) {
    const x = SPEAKER.x, y = SPEAKER.y + 8;
    g.fillStyle(muted ? COLORS.dim : COLORS.ink);
    g.fillRect(x, y + 4, 4, 6).fillRect(x + 4, y + 2, 2, 10).fillRect(x + 6, y, 2, 14);
    if (muted) for (let i = 0; i < 4; i++) g.fillRect(x + 11 + i * 2, y + 3 + i * 2, 2, 2).fillRect(x + 17 - i * 2, y + 3 + i * 2, 2, 2);
    else g.fillRect(x + 11, y + 4, 2, 6).fillRect(x + 15, y + 2, 2, 10).fillRect(x + 19, y, 2, 14);
  }
}
