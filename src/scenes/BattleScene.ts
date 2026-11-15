import Phaser from 'phaser';
import { BATTLE, COLORS, CREATURES, FONT, HEIGHT, RENDER_SCALE, TEXT, WIDTH, type CreatureId, type Ground } from '../config';
import { Controls, type Device } from '../controls';
import { Effects } from '../effects';
import { living, newBattle, opening, round, type Action, type Battle, type BattleEvent, type BattleScript } from '../battle';
import { playSound, toggleMute } from '../sfx';
import { creatureTexture, face } from '../sprites';
import { STATE, type Journey } from '../state';
import { BACKDROP_H, bakeBackdrop } from '../tiles';
import { fitCamera } from '../view';
import { drawPanel, publishHud } from './HudScene';
import type { WorldScene } from './WorldScene';

export interface BattleData {
  foes: CreatureId[];
  ground: Ground;
  dim: boolean;
  rand: () => number;
}

/** Registry key: Valor timing on (the default) or off. */
export const VALOR_SETTING = 'valorTiming';

const HERO_AT = { x: 88, y: 112 };
const FOE_Y = 104;
const CMD = { x: 8, y: 156, w: 84, h: 52 };
const MSG = { x: 98, y: 156, w: 310, h: 52 };
const COMMANDS = ['FIGHT', 'SPELL', 'ITEM', 'FLEE'] as const;
/** Commands that work yet: spells and items arrive with the full roster. */
const READY = new Set(['FIGHT', 'FLEE']);

interface Ring { x: number; y: number; t: number; dur: number; hit: boolean | null; who: 'hero' | 'foe' }

/** A side-view fight. Plays the battle rules' events back as animation, and asks the player at each ring. */
export class BattleScene extends Phaser.Scene {
  battle!: Battle;
  /** Command cursor and target cursor; `menu` is null while events play. */
  menu: 'cmd' | 'target' | null = null;
  cursor = 0;
  ring: Ring | null = null;
  /** Every event played, for tests. */
  log: BattleEvent[] = [];
  private controls!: Controls;
  private fx!: Effects;
  private journey!: Journey;
  private heroImg!: Phaser.GameObjects.Image;
  private foeImgs: Phaser.GameObjects.Image[] = [];
  /** Each sprite's shadow, kept under it as it lunges. */
  private shadows = new Map<Phaser.GameObjects.Image, Phaser.GameObjects.Ellipse>();
  private msgText!: Phaser.GameObjects.Text;
  private cmdTexts: Phaser.GameObjects.Text[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private ui!: Phaser.GameObjects.Graphics;
  private ringG!: Phaser.GameObjects.Graphics;
  private pick: ((a: Action) => void) | null = null;
  private skip: (() => void) | null = null;
  private ringDone: ((hit: boolean) => void) | null = null;
  private device: Device = 'kbm';
  private alive = true;
  private clock = 0;

  constructor() {
    super('battle');
  }

  create(data: BattleData) {
    this.alive = true;
    this.log = [];
    this.menu = null;
    this.ring = null;
    this.controls = new Controls(this);
    fitCamera(this, RENDER_SCALE);
    this.journey = this.registry.get(STATE) as Journey;
    this.battle = newBattle(this.journey.hero, data.foes, data.ground, data.dim, data.rand);

    const key = `back-${data.ground}${data.dim ? '-dim' : ''}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, bakeBackdrop(data.ground, data.dim));
    this.add.image(0, 0, key).setOrigin(0);
    this.add.rectangle(0, BACKDROP_H, WIDTH, HEIGHT - BACKDROP_H, 0x0b0e1e).setOrigin(0);
    this.add.rectangle(0, BACKDROP_H, WIDTH, 1, COLORS.trim2).setOrigin(0);

    // Foes facing left, the squire facing right, each with a shadow.
    this.shadows.clear();
    const xs = BATTLE.slots[data.foes.length];
    const withShadow = (img: Phaser.GameObjects.Image) => {
      this.shadows.set(img, this.add.ellipse(img.x, img.y + 16, 22, 4, 0x000000, 0.25).setDepth(img.depth - 1));
      return img;
    };
    this.foeImgs = this.battle.foes.map((f, i) =>
      withShadow(face(this.add.image(xs[i], FOE_Y + (i % 2) * 8, creatureTexture(f.id)).setScale(2).setDepth(2), CREATURES[f.id].slot, false)));
    this.heroImg = withShadow(face(this.add.image(HERO_AT.x, HERO_AT.y, 'player').setScale(2).setDepth(2), 'player', true));

    this.ringG = this.add.graphics().setDepth(10);
    this.fx = new Effects(this, 12);
    this.ui = this.add.graphics().setDepth(20);
    drawPanel(this.ui, CMD.x, CMD.y, CMD.w, CMD.h, 0.95, 1);
    drawPanel(this.ui, MSG.x, MSG.y, MSG.w, MSG.h, 0.95, 1);
    const text = (x: number, y: number, s: string, color: string = TEXT.ink) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: '8px', color }).setDepth(21);
    this.msgText = text(MSG.x + 8, MSG.y + 7, '').setWordWrapWidth(MSG.w - 16).setLineSpacing(3);
    this.cmdTexts = COMMANDS.map((c, i) => text(CMD.x + 16, CMD.y + 7 + i * 10, c));
    this.prompt = text(CMD.x + CMD.w / 2, CMD.y + CMD.h / 2, '', TEXT.gold).setOrigin(0.5);

    this.cameras.main.fadeIn(200);
    void this.run();
  }

  private async run() {
    await this.play(opening(this.battle));
    while (this.alive && !this.battle.outcome) {
      const action = await this.choose();
      await this.play(round(this.battle, action));
    }
    if (this.alive) await this.finish();
  }

  private async play(script: BattleScript) {
    let r = script.next();
    while (!r.done && this.alive) {
      this.log.push(r.value);
      const answer = await this.show(r.value);
      r = script.next(answer);
    }
  }

  /** Waits for the player's command (and target, if there's a choice). */
  private choose(): Promise<Action> {
    this.menu = 'cmd';
    this.cursor = 0;
    this.say(`What will ${this.battle.hero.name} do?`);
    return new Promise((resolve) => { this.pick = resolve; });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  /** Waits up to `ms`, or until the player presses confirm. */
  private waitOrSkip(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => { if (this.skip) { this.skip = null; ev.remove(); resolve(); } };
      const ev = this.time.delayedCall(ms, done);
      this.skip = done;
    });
  }

  private say(text: string) {
    this.msgText.setText(text);
  }

  private foeCentre(i: number) {
    const img = this.foeImgs[i];
    return { x: img.x, y: img.y };
  }

  /** The ring closes on (x, y) over `dur` seconds; the answer is whether the player pressed on it. */
  private ringAt(x: number, y: number, dur: number, who: Ring['who']): Promise<boolean> {
    if (this.registry.get(VALOR_SETTING) === false) return this.wait(dur * 1000).then(() => false);
    this.ring = { x, y, t: 0, dur, hit: null, who };
    return new Promise((resolve) => { this.ringDone = resolve; });
  }

  private popup(x: number, y: number, s: string, color: string, big = false) {
    const t = this.add.text(x, y, s, { fontFamily: FONT, fontSize: big ? '16px' : '8px', color, stroke: '#0b0e1e', strokeThickness: 2 })
      .setOrigin(0.5).setDepth(15);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 900, ease: 'Quad.out', onComplete: () => t.destroy() });
  }

  private flicker(img: Phaser.GameObjects.Image, ms: number) {
    const end = this.time.now + ms;
    const ev = this.time.addEvent({
      delay: 40, loop: true, callback: () => {
        if (this.time.now >= end) { img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY); ev.remove(); return; }
        if (img.isTinted) img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        else img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      },
    });
  }

  private async show(e: BattleEvent): Promise<boolean | undefined> {
    const h = this.heroImg;
    switch (e.type) {
      case 'say':
        this.say(e.text);
        await this.wait(450);
        return undefined;
      case 'heroStrike': {
        const c = this.foeCentre(e.target), dur = BATTLE.strikeRing;
        playSound(this, 'swing');
        this.tweens.add({ targets: h, x: HERO_AT.x + 44, duration: dur * 1000, ease: 'Quad.in' });
        return this.ringAt(c.x, c.y, dur, 'hero');
      }
      case 'foeHurt': {
        const c = this.foeCentre(e.target);
        this.say(e.text);
        playSound(this, e.valor ? 'valor' : 'hit');
        this.flicker(this.foeImgs[e.target], 300);
        this.popup(c.x, c.y - 18, String(e.damage), e.big ? TEXT.gold : '#ffffff', e.big);
        this.fx.burst(c.x, c.y, [0xffffff, 0xffd27a, COLORS.gold], e.big ? [18, 90, 450] : [9, 60, 350]);
        this.fx.shake(e.big ? 3 : 1.5);
        this.tweens.add({ targets: h, x: HERO_AT.x, duration: 240, ease: 'Quad.out' });
        await this.wait(650);
        return undefined;
      }
      case 'foeReady': {
        const img = this.foeImgs[e.foe];
        img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        await this.wait(260);
        img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
        await this.wait(120);
        return undefined;
      }
      case 'foeStrike': {
        const img = this.foeImgs[e.foe], x0 = img.x, dur = BATTLE.guardRing;
        this.tweens.add({ targets: img, x: x0 - 30, duration: dur * 1000, ease: 'Quad.in', yoyo: true, hold: 60 });
        return this.ringAt(h.x, h.y, dur, 'foe');
      }
      case 'heroHurt':
        this.say(e.text);
        playSound(this, e.guarded ? 'guard' : e.damage ? 'hurt' : 'swing');
        if (e.damage) this.flicker(h, 300);
        this.popup(h.x, h.y - 20, String(e.damage), e.guarded ? TEXT.gold : TEXT.hurt);
        this.fx.burst(h.x, h.y, e.guarded ? [COLORS.gold, 0xffffff] : [0xff6b5e, 0xffffff], [e.damage ? 8 : 3, 60, 300]);
        if (e.damage) this.fx.shake(Math.min(4, 1 + e.damage / 6));
        await this.wait(650);
        return undefined;
      case 'freed': {
        const img = this.foeImgs[e.foe];
        this.say(e.text);
        playSound(this, 'freed');
        img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        this.fx.burst(img.x, img.y, [0xffffff, COLORS.gold], [10, 40, 600]);
        this.tweens.add({ targets: img, alpha: 0, y: img.y - 10, duration: 700, ease: 'Quad.in' });
        await this.wait(850);
        return undefined;
      }
      case 'fled':
        this.say(e.text);
        playSound(this, 'flee');
        face(h, 'player', false);
        this.tweens.add({ targets: h, x: -24, duration: 500, ease: 'Quad.in' });
        await this.wait(650);
        return undefined;
      case 'reward':
        this.say(e.text);
        playSound(this, 'victory');
        await this.waitOrSkip(1600);
        return undefined;
      case 'levelUp':
        this.say(e.text);
        playSound(this, 'levelup');
        this.popup(h.x, h.y - 30, 'LEVEL UP', TEXT.gold, true);
        this.fx.burst(h.x, h.y, [COLORS.gold, 0xffffff], [20, 80, 600]);
        await this.waitOrSkip(1600);
        return undefined;
      case 'fall':
        this.say(e.text);
        playSound(this, 'fall');
        this.fx.flash(0.5);
        this.fx.shake(4);
        this.tweens.add({ targets: h, angle: -90, y: h.y + 6, duration: 500, ease: 'Quad.in' });
        await this.wait(1800);
        return undefined;
    }
  }

  private finish(): Promise<void> {
    const outcome = this.battle.outcome!;
    this.alive = false;
    return new Promise((resolve) => {
      this.cameras.main.fadeOut(outcome === 'lost' ? 500 : 250);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        const world = this.scene.get('world') as WorldScene;
        world.endFight(outcome);
        this.scene.resume('world');
        this.scene.stop();
        resolve();
      });
    });
  }

  update(_time: number, delta: number) {
    const dt = Math.min(0.05, delta / 1000);
    this.clock += dt;
    const input = this.controls.read();
    this.device = input.device;
    if (input.mute) toggleMute(this);
    this.fx.update(dt);

    if (this.ring) {
      const r = this.ring;
      r.t += dt;
      if (input.confirm && r.hit === null) r.hit = Math.abs(r.dur - r.t) <= BATTLE.valorWindow;
      if (r.t >= r.dur + BATTLE.valorWindow) {
        const hit = r.hit === true;
        this.ring = null;
        this.ringDone?.(hit);
        this.ringDone = null;
      }
    } else if (input.confirm && this.skip) this.skip();
    else if (this.menu) this.menuInput(input.tapped, input.confirm, input.back);

    for (const [img, sh] of this.shadows) sh.setPosition(img.x, sh.y).setVisible(img.alpha > 0.05);
    this.drawUi();
    publishHud(this, this.journey, this.device, 'battle');
  }

  private menuInput(tapped: string | null, confirm: boolean, back: boolean) {
    const foes = living(this.battle);
    if (this.menu === 'cmd') {
      if (tapped === 'up' || tapped === 'down') {
        this.cursor = (this.cursor + (tapped === 'up' ? COMMANDS.length - 1 : 1)) % COMMANDS.length;
        playSound(this, 'select');
      }
      if (!confirm) return;
      const c = COMMANDS[this.cursor];
      if (!READY.has(c)) { playSound(this, 'bump'); this.say(`${c === 'SPELL' ? 'No spells learned yet.' : 'Nothing to use yet.'}`); return; }
      playSound(this, 'select');
      if (c === 'FLEE') { this.commit({ type: 'flee' }); return; }
      if (foes.length === 1) { this.commit({ type: 'fight', target: this.battle.foes.indexOf(foes[0]) }); return; }
      this.menu = 'target';
      this.cursor = 0;
      this.say('Which foe?');
      return;
    }
    // Choosing a target: left/right (or up/down) across the living foes.
    if (tapped) {
      const step = tapped === 'left' || tapped === 'up' ? -1 : 1;
      this.cursor = (this.cursor + step + foes.length) % foes.length;
      playSound(this, 'select');
    }
    if (back) { this.menu = 'cmd'; this.cursor = 0; this.say(`What will ${this.battle.hero.name} do?`); return; }
    if (confirm) {
      playSound(this, 'select');
      this.commit({ type: 'fight', target: this.battle.foes.indexOf(foes[this.cursor]) });
    }
  }

  private commit(a: Action) {
    this.menu = null;
    const pick = this.pick;
    this.pick = null;
    pick?.(a);
  }

  private drawUi() {
    // Command list: dimmed while events play, the unready ones always dim.
    this.cmdTexts.forEach((t, i) => {
      const c = COMMANDS[i], sel = this.menu === 'cmd' && i === this.cursor;
      t.setVisible(!this.ring).setColor(!READY.has(c) ? '#5d5a78' : sel ? TEXT.gold : this.menu ? TEXT.ink : TEXT.dim);
    });
    const press = this.device === 'pad' ? 'A' : 'Z';
    this.prompt.setText(this.ring ? (this.ring.who === 'hero' ? `PRESS ${press}\nON THE RING` : `PRESS ${press}\nTO GUARD`) : '').setAlign('center');

    const g = this.ringG.clear();
    if (this.menu === 'cmd') {
      g.fillStyle(COLORS.gold).fillRect(CMD.x + 9, CMD.y + 9 + this.cursor * 10, 3, 4);
    }
    if (this.menu === 'target') {
      const f = living(this.battle)[this.cursor];
      if (f) {
        const c = this.foeCentre(this.battle.foes.indexOf(f)), y = c.y - 26 + (Math.floor(this.clock * 4) % 2);
        g.fillStyle(COLORS.gold).fillRect(c.x - 3, y, 7, 2).fillRect(c.x - 2, y + 2, 5, 1).fillRect(c.x - 1, y + 3, 3, 1).fillRect(c.x, y + 4, 1, 1);
        this.say(`Which foe? The ${f.name}.`);
      }
    }
    // Valor ring: closes on the point of impact.
    if (this.ring) {
      const r = this.ring, k = Phaser.Math.Clamp(1 - r.t / r.dur, 0, 1), rr = 6 + k * 26;
      const color = r.hit === true ? COLORS.gold : COLORS.ink, alpha = r.hit === false ? 0.3 : 0.9;
      g.lineStyle(3, 0x0b0e1e, alpha * 0.6).strokeCircle(r.x, r.y, rr);
      g.lineStyle(2, color, alpha).strokeCircle(r.x, r.y, rr);
      g.lineStyle(1, COLORS.gold, 0.8).strokeCircle(r.x, r.y, 6);
    }
  }
}
