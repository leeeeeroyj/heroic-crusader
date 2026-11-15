import Phaser from 'phaser';
import { COLORS, FONT, HEIGHT, RENDER_SCALE, SPRITES, TEXT, TILE, WIDTH, type SpriteKey } from '../config';
import { Controls } from '../controls';
import { playSound, registerSounds, restoreMute, toggleMute } from '../sfx';
import { face } from '../sprites';
import { STATE, newJourney } from '../state';
import { bakeMap } from '../tiles';
import { buildOverworld } from '../world';
import { fitCamera } from '../view';

const CREATURES: SpriteKey[] = ['hare', 'crow', 'puffcap', 'toad', 'wisp', 'bat', 'wolf', 'rustguard', 'golem'];
const WARDENS: SpriteKey[] = ['warden_meadow', 'warden_marsh', 'warden_snow', 'warden_ruin'];
const BACKDROP = 'title-map';

export class TitleScene extends Phaser.Scene {
  private controls!: Controls;
  private start!: Phaser.GameObjects.Text;
  private padStatus: Phaser.GameObjects.Text | undefined;
  private backdrop!: Phaser.GameObjects.Image;
  private leaving = false;
  private clock = 0;

  constructor() {
    super('title');
  }

  preload() {
    for (const key of SPRITES) this.load.image(key, `sprites/${key}.png`);
  }

  create() {
    this.leaving = false;
    this.padStatus = undefined;
    this.controls = new Controls(this);
    fitCamera(this, RENDER_SCALE);
    registerSounds(this);
    restoreMute(this);
    this.cameras.main.fadeIn(300);

    // The grey kingdom drifts behind the title, under a dark veil.
    if (!this.textures.exists(BACKDROP)) this.textures.addCanvas(BACKDROP, bakeMap(buildOverworld(), [false, false, false, false]));
    this.backdrop = this.add.image(0, -4 * TILE, BACKDROP).setOrigin(0);
    this.add.rectangle(0, 0, WIDTH, HEIGHT, COLORS.night, 0.72).setOrigin(0);

    const cx = WIDTH / 2;
    const text = (x: number, y: number, str: string, size: number, color: string) =>
      this.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5, 0);

    text(cx, 12, 'FOUR BEACONS  ·  ONE SQUIRE  ·  THE GLOAM', 8, TEXT.dim);
    text(cx, 24, 'HEROIC CRUSADER', 24, TEXT.gold);
    text(cx, 54, 'WALK THE DIMMED KINGDOM AND RELIGHT ITS BEACONS.', 8, TEXT.ink);

    face(this.add.image(cx - 104, 86, 'player'), 'player', true).setScale(2);
    CREATURES.forEach((key, i) => face(this.add.image(cx - 60 + i * 18, 80 + (i % 2) * 8, key), key, false));
    WARDENS.forEach((key, i) => face(this.add.image(cx + 120 + (i % 2) * 18, 74 + Math.floor(i / 2) * 18, key), key, false));

    this.start = text(cx, 106, '> NEW JOURNEY <', 16, TEXT.gold);
    // A hit area well beyond the letters, so a thumb finds it.
    this.start.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-24, -8, this.start.width + 48, this.start.height + 16), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    this.start.on('pointerdown', () => this.begin());
    const touchScreen = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    text(cx, 126, touchScreen ? 'TAP NEW JOURNEY' : 'PRESS ENTER, Z OR A, OR CLICK', 8, TEXT.dim);

    const column = (x: number, title: string, keys: string, actions: string) => {
      text(x, 144, title, 8, TEXT.gold);
      this.add.text(x - 4, 155, keys, { fontFamily: FONT, fontSize: '8px', color: TEXT.ink, align: 'right', lineSpacing: 2 }).setOrigin(1, 0);
      this.add.text(x + 4, 155, actions, { fontFamily: FONT, fontSize: '8px', color: TEXT.dim, lineSpacing: 2 });
    };
    column(112, 'KEYBOARD', 'ARROWS / WASD\nZ / SPACE / ENTER\nX / BACKSPACE\nESC\nM', 'WALK, CHOOSE\nCONFIRM\nBACK\nTITLE\nSOUND ON/OFF');
    column(308, 'CONTROLLER', 'D-PAD / STICK\nA\nB\nSTART\nBACK', 'WALK, CHOOSE\nCONFIRM\nBACK\nTITLE\nSOUND ON/OFF');
    this.padStatus = text(cx, 214, '', 8, TEXT.dim);
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.clock += dt;
    // Pan slowly back and forth across the map.
    const span = this.backdrop.width - WIDTH;
    this.backdrop.x = -Math.round((0.5 - 0.5 * Math.cos(this.clock * 0.05)) * span);
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    if (input.confirm) this.begin();
    this.start.setAlpha(Math.sin(this.clock * 4) > -0.5 ? 1 : 0.5);
    const pad = this.controls.pad();
    this.padStatus?.setText(pad ? 'CONTROLLER CONNECTED' : 'USING A CONTROLLER? PRESS ANY BUTTON ON IT').setColor(pad ? TEXT.leaf : TEXT.dim);
  }

  begin() {
    if (this.leaving) return;
    this.leaving = true;
    playSound(this, 'start');
    this.registry.set(STATE, newJourney());
    this.cameras.main.fadeOut(300);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('world'));
  }
}
