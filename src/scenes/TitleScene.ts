import Phaser from 'phaser';
import { COLORS, FONT, HEIGHT, HERO, RENDER_SCALE, SPRITES, TEXT, TILE, WIDTH, type SpriteKey } from '../config';
import { Controls } from '../controls';
import { playSound, registerSounds, restoreMute, toggleMute } from '../sfx';
import { bakeKin, face } from '../sprites';
import { readSave } from '../save';
import { STATE, newJourney, type Journey } from '../state';
import { bakeMap } from '../tiles';
import { buildOverworld } from '../world';
import { fitCamera } from '../view';

const CREATURES: SpriteKey[] = ['hare', 'crow', 'puffcap', 'toad', 'wisp', 'bat', 'wolf', 'rustguard', 'golem'];
const WARDENS: SpriteKey[] = ['warden_meadow', 'warden_marsh', 'warden_snow', 'warden_ruin'];
const BACKDROP = 'title-map';

const NAME_MAX = 8;

export class TitleScene extends Phaser.Scene {
  /** The title's menu, or typing the squire's name. */
  stage: 'menu' | 'name' = 'menu';
  options: Array<'continue' | 'new'> = ['new'];
  cursor = 0;
  /** The name as typed so far (empty means the default). */
  name = '';
  private save: Journey | null = null;
  /** The last key event typed, so one that arrives twice types once. */
  private lastKey = '';
  private controls!: Controls;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private naming!: Phaser.GameObjects.Container;
  private nameText!: Phaser.GameObjects.Text;
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
    this.stage = 'menu';
    this.name = '';
    this.save = readSave();
    this.options = this.save ? ['continue', 'new'] : ['new'];
    this.cursor = 0;
    this.controls = new Controls(this);
    fitCamera(this, RENDER_SCALE);
    registerSounds(this);
    bakeKin(this);
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

    const s = this.save;
    const labels = { continue: s ? `CONTINUE  ${s.hero.name}  LV ${s.hero.lv}` : '', new: 'NEW JOURNEY' };
    const top = this.options.length > 1 ? 98 : 106;
    this.optionTexts = this.options.map((o, i) => {
      const t = text(cx, top + i * 14, labels[o], this.options.length > 1 ? 8 : 16, TEXT.ink);
      // A hit area well beyond the letters, so a thumb finds it.
      t.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-24, -6, t.width + 48, t.height + 12), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
      t.on('pointerdown', () => { if (this.stage === 'menu') { this.cursor = i; this.choose(); } });
      return t;
    });
    const touchScreen = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    text(cx, 126, touchScreen ? 'TAP TO CHOOSE' : 'ARROWS CHOOSE  ·  ENTER, Z OR A TO START', 8, TEXT.dim);

    // Naming the squire: a panel over the title.
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.night, 0.97).fillRect(cx - 160, 70, 320, 76).lineStyle(1, COLORS.gold).strokeRect(cx - 160, 70, 320, 76);
    this.nameText = text(cx, 96, '', 16, TEXT.gold);
    this.naming = this.add.container(0, 0, [
      panel, text(cx, 80, 'NAME YOUR SQUIRE', 8, TEXT.ink), this.nameText,
      text(cx, 120, touchScreen ? 'TAP TO BEGIN' : 'TYPE UP TO 8 LETTERS  ·  ENTER TO BEGIN  ·  ESC BACK', 8, TEXT.dim),
      text(cx, 131, 'A CONTROLLER KEEPS THE NAME WREN', 8, TEXT.dim),
    ]).setDepth(10).setVisible(false);
    panel.setInteractive(new Phaser.Geom.Rectangle(cx - 160, 70, 320, 76), Phaser.Geom.Rectangle.Contains).on('pointerdown', () => { if (this.stage === 'name') this.begin(); });
    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => this.type(e));

    const column = (x: number, title: string, keys: string, actions: string) => {
      text(x, 144, title, 8, TEXT.gold);
      this.add.text(x - 4, 155, keys, { fontFamily: FONT, fontSize: '8px', color: TEXT.ink, align: 'right', lineSpacing: 2 }).setOrigin(1, 0);
      this.add.text(x + 4, 155, actions, { fontFamily: FONT, fontSize: '8px', color: TEXT.dim, lineSpacing: 2 });
    };
    column(112, 'KEYBOARD', 'ARROWS / WASD\nZ / SPACE / ENTER\nX / BACKSPACE\nESC\nM', 'WALK, CHOOSE\nCONFIRM\nBACK\nMENU\nSOUND ON/OFF');
    column(308, 'CONTROLLER', 'D-PAD / STICK\nA\nB\nSTART\nBACK', 'WALK, CHOOSE\nCONFIRM\nBACK\nMENU\nSOUND ON/OFF');
    this.padStatus = text(cx, 214, '', 8, TEXT.dim);
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.clock += dt;
    // Pan slowly back and forth across the map.
    const span = this.backdrop.width - WIDTH;
    this.backdrop.x = -Math.round((0.5 - 0.5 * Math.cos(this.clock * 0.05)) * span);
    const input = this.controls.read();
    if (this.stage === 'name') {
      // The keyboard types here (see type()); a controller can only take the default name, or go back.
      if (input.device === 'pad' && input.confirm) this.begin();
      else if (input.device === 'pad' && input.back) this.stage = 'menu';
      this.nameText.setText((this.name || '') + (Math.sin(this.clock * 6) > 0 ? '_' : ' ')).setColor(TEXT.gold);
      if (!this.name) this.nameText.setText(`${HERO.name}${Math.sin(this.clock * 6) > 0 ? '_' : ' '}`).setColor(TEXT.dim);
      this.naming.setVisible(true);
      return;
    }
    this.naming.setVisible(false);
    if (input.mute) toggleMute(this);
    const n = this.options.length;
    if (input.tapped === 'up' || input.tapped === 'down') { this.cursor = (this.cursor + (input.tapped === 'up' ? n - 1 : 1)) % n; playSound(this, 'select'); }
    if (input.confirm) this.choose();
    this.optionTexts.forEach((t, i) => {
      const on = i === this.cursor, label = t.text.replace(/^> | <$/g, '');
      t.setText(on && n > 1 ? `> ${label} <` : label).setColor(on ? TEXT.gold : TEXT.ink).setAlpha(on && Math.sin(this.clock * 4) <= -0.5 ? 0.5 : 1);
    });
    const pad = this.controls.pad();
    this.padStatus?.setText(pad ? 'CONTROLLER CONNECTED' : 'USING A CONTROLLER? PRESS ANY BUTTON ON IT').setColor(pad ? TEXT.leaf : TEXT.dim);
  }

  /** The highlighted option: carry on from the save, or name a new squire. */
  choose() {
    if (this.leaving) return;
    if (this.options[this.cursor] === 'continue' && this.save) { this.go(this.save); return; }
    // Phones have no keyboard yet (the on-screen one comes with touch): start with the default name.
    if (this.controls.device === 'touch') { this.begin(); return; }
    playSound(this, 'select');
    this.stage = 'name';
    this.name = '';
  }

  /** Typing the name: letters and spaces, Backspace, Enter to begin, Esc to go back. */
  private type(e: KeyboardEvent) {
    if (this.stage !== 'name' || this.leaving || e.repeat) return;
    // Some systems deliver the same key event more than once (Phaser guards its own keys the same way).
    const id = `${e.key}@${e.timeStamp}`;
    if (id === this.lastKey) return;
    this.lastKey = id;
    if (e.key === 'Enter') this.begin();
    else if (e.key === 'Escape') { this.stage = 'menu'; playSound(this, 'select'); }
    else if (e.key === 'Backspace') this.name = this.name.slice(0, -1);
    else if (/^[a-zA-Z ]$/.test(e.key) && this.name.length < NAME_MAX && !(e.key === ' ' && !this.name)) { this.name += e.key.toUpperCase(); playSound(this, 'select'); }
  }

  /** A new journey, with the typed name (or the default). */
  begin() {
    const j = newJourney();
    j.hero.name = this.name.trim() || HERO.name;
    this.go(j);
  }

  private go(j: Journey) {
    if (this.leaving) return;
    this.leaving = true;
    playSound(this, 'start');
    this.registry.set(STATE, j);
    this.cameras.main.fadeOut(300);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('world'));
  }
}
