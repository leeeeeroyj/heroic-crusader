import Phaser from 'phaser';
import { COLORS, FONT, HEIGHT, HUD_SCALE, TEXT, WIDTH } from '../config';
import { Controls } from '../controls';
import { playSound, toggleMute } from '../sfx';
import { STATE, type Journey } from '../state';
import { bakeMap } from '../tiles';
import { buildOverworld } from '../world';
import { fitCamera } from '../view';

// HUD units (2 per game pixel).
const W = WIDTH * 2, H = HEIGHT * 2;
/** Seconds each page fades in, holds, and fades out. */
const FADE = 0.8;
const BACKDROP = 'ending-map';

interface Page { title?: string; lines: string[]; hold: number }

/** After the Gloam: the story's close over the relit kingdom, then the credits, then back to the title. */
export class EndingScene extends Phaser.Scene {
  /** The page on screen, for tests. */
  page = 0;
  pages: Page[] = [];
  private t = 0;
  private controls!: Controls;
  private map!: Phaser.GameObjects.Image;
  private titleText!: Phaser.GameObjects.Text;
  private bodyText!: Phaser.GameObjects.Text;
  private leaving = false;

  constructor() {
    super('ending');
  }

  create() {
    fitCamera(this, HUD_SCALE);
    this.controls = new Controls(this);
    this.page = 0;
    this.t = 0;
    this.leaving = false;
    const name = (this.registry.get(STATE) as Journey | undefined)?.hero.name ?? 'WREN';
    this.pages = [
      { lines: ['The Gloam broke like a fog at sunrise.'], hold: 3 },
      { lines: ['In Brightkeep the bells rang, and Queen Maren stood on the walls to watch the four beacons burn.'], hold: 4 },
      { lines: ['The creatures the Gloam had soured went home: to the meadows, the reeds, the snow and the old stones.'], hold: 4 },
      { lines: [`And ${name}, a squire no longer, knelt before the queen and rose a knight: the Heroic Crusader.`], hold: 4.5 },
      {
        title: 'HEROIC CRUSADER',
        lines: [
          'Sprites from the CC0 pixel-art atlas by Angais, found with Pixel Search',
          'Silkscreen font by Jason Kottke',
          'Made with Phaser',
          "Inspired by Chunsoft and Enix's Dragon Quest",
        ],
        hold: 6,
      },
      { title: 'THE END', lines: ['Thank you for playing.', '', 'Press Z (or A) for the title'], hold: Infinity },
    ];

    // The whole kingdom, every beacon lit, drifting slowly by under a dark veil.
    if (this.textures.exists(BACKDROP)) this.textures.remove(BACKDROP);
    this.textures.addCanvas(BACKDROP, bakeMap(buildOverworld(), [true, true, true, true]));
    this.map = this.add.image(0, 0, BACKDROP).setOrigin(0).setScale(2);
    this.add.rectangle(0, 0, W, H, COLORS.night, 0.5).setOrigin(0);
    // A darker band behind the words.
    this.add.rectangle(0, H / 2 - 150, W, 300, COLORS.night, 0.7).setOrigin(0);
    const style = { fontFamily: FONT, fontSize: '16px', color: TEXT.ink, align: 'center', lineSpacing: 10 };
    this.titleText = this.add.text(W / 2, H / 2 - 70, '', { ...style, fontSize: '32px', color: TEXT.gold }).setOrigin(0.5);
    this.bodyText = this.add.text(W / 2, H / 2 + 10, '', { ...style, wordWrap: { width: W - 160 } }).setOrigin(0.5);
    this.show();
    this.cameras.main.fadeIn(1200, 255, 244, 214);
    playSound(this, 'beacon');
  }

  private show() {
    const p = this.pages[this.page];
    this.titleText.setText(p.title ?? '');
    this.bodyText.setText(p.lines.join('\n')).setY(p.title ? H / 2 + 30 : H / 2);
    if (p.hold === Infinity) playSound(this, 'victory');
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.t += dt;
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    // The map drifts across, there and back.
    const span = this.map.displayWidth - W, k = (Math.sin(this.time.now / 22000 - Math.PI / 2) + 1) / 2;
    this.map.setPosition(-span * k, -(this.map.displayHeight - H) * 0.45);

    const p = this.pages[this.page], last = this.page === this.pages.length - 1;
    const a = Math.min(1, this.t / FADE, last ? 1 : Math.max(0, (FADE * 2 + p.hold - this.t) / FADE));
    this.titleText.setAlpha(a);
    this.bodyText.setAlpha(a);
    if (this.leaving) return;
    if (last) {
      if (input.confirm && this.t > FADE) this.leave();
      return;
    }
    // Confirm skips ahead to the next page.
    if (this.t >= FADE * 2 + p.hold || (input.confirm && this.t > FADE)) {
      this.page++;
      this.t = 0;
      this.show();
    }
  }

  private leave() {
    this.leaving = true;
    playSound(this, 'select');
    this.registry.remove(STATE);
    this.cameras.main.fadeOut(600);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('title'));
  }
}
