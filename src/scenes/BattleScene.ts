import Phaser from 'phaser';
import { BATTLE, COLORS, CREATURES, FONT, HEIGHT, ITEMS, RENDER_SCALE, SPELLS, TEXT, WIDTH, type CreatureId, type Ground, type ItemId, type SpellId } from '../config';
import { Controls, type Device } from '../controls';
import { Effects } from '../effects';
import {
  battleItems, battleSpells, canCast, canUse, living, newBattle, opening, round, spellTargets,
  type Action, type Battle, type BattleEvent, type BattleScript, type Who,
} from '../battle';
import { playSound, toggleMute } from '../sfx';
import { creatureTexture, face } from '../sprites';
import { STATE, count, type Journey } from '../state';
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
/** Spell and item lists: two columns of three in the message box. */
const LIST_ROWS = 3;
const SPELL_COLOR: Record<string, number> = { mend: COLORS.leaf, restore: COLORS.leaf, lull: COLORS.gloam, hush: COLORS.gloam, spark: COLORS.ember, flare: COLORS.ember };

interface Ring { x: number; y: number; t: number; dur: number; hit: boolean | null; who: 'hero' | 'foe' }
interface Option { label: string; ok: boolean; spell?: SpellId; item?: ItemId }

/** A side-view fight. Plays the battle rules' events back as animation, and asks the player at each ring. */
export class BattleScene extends Phaser.Scene {
  battle!: Battle;
  /** Which menu is open; null while events play. */
  menu: 'cmd' | 'spell' | 'item' | 'target' | null = null;
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
  private zzz = new Map<Phaser.GameObjects.Image, Phaser.GameObjects.Text>();
  private msgText!: Phaser.GameObjects.Text;
  private cmdTexts: Phaser.GameObjects.Text[] = [];
  private listTexts: Phaser.GameObjects.Text[] = [];
  private prompt!: Phaser.GameObjects.Text;
  private ui!: Phaser.GameObjects.Graphics;
  private ringG!: Phaser.GameObjects.Graphics;
  /** Menu cursors, above the panels. */
  private marks!: Phaser.GameObjects.Graphics;
  private pick: ((a: Action) => void) | null = null;
  /** An action waiting for its target, and the menu to go back to. */
  private pending: { action: Action; from: 'cmd' | 'spell' } | null = null;
  private listCursor = 0;
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
    this.pending = null;
    this.controls = new Controls(this);
    fitCamera(this, RENDER_SCALE);
    this.journey = this.registry.get(STATE) as Journey;
    this.battle = newBattle(this.journey.hero, data.foes, data.ground, data.dim, data.rand);

    const key = `back-${data.ground}${data.dim ? '-dim' : ''}`;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, bakeBackdrop(data.ground, data.dim));
    this.add.image(0, 0, key).setOrigin(0);
    this.add.rectangle(0, BACKDROP_H, WIDTH, HEIGHT - BACKDROP_H, 0x0b0e1e).setOrigin(0);
    this.add.rectangle(0, BACKDROP_H, WIDTH, 1, COLORS.trim2).setOrigin(0);

    // Foes facing left, the squire facing right, each with a shadow and a sleep mark.
    this.shadows.clear();
    this.zzz.clear();
    const xs = BATTLE.slots[data.foes.length];
    this.foeImgs = this.battle.foes.map((f, i) => this.addFoe(f.id, xs[i], i));
    this.heroImg = this.track(face(this.add.image(HERO_AT.x, HERO_AT.y, 'player').setScale(2).setDepth(2), 'player', true));

    this.ringG = this.add.graphics().setDepth(10);
    this.fx = new Effects(this, 12);
    this.ui = this.add.graphics().setDepth(20);
    this.marks = this.add.graphics().setDepth(22);
    drawPanel(this.ui, CMD.x, CMD.y, CMD.w, CMD.h, 0.95, 1);
    drawPanel(this.ui, MSG.x, MSG.y, MSG.w, MSG.h, 0.95, 1);
    const text = (x: number, y: number, s: string, color: string = TEXT.ink) =>
      this.add.text(x, y, s, { fontFamily: FONT, fontSize: '8px', color }).setDepth(21);
    this.msgText = text(MSG.x + 8, MSG.y + 7, '').setWordWrapWidth(MSG.w - 16).setLineSpacing(3);
    this.cmdTexts = COMMANDS.map((c, i) => text(CMD.x + 16, CMD.y + 7 + i * 10, c));
    this.listTexts = Array.from({ length: LIST_ROWS * 2 }, (_, i) => text(MSG.x + 18 + Math.floor(i / LIST_ROWS) * 150, MSG.y + 7 + (i % LIST_ROWS) * 13, ''));
    this.prompt = text(CMD.x + CMD.w / 2, CMD.y + CMD.h / 2, '', TEXT.gold).setOrigin(0.5).setAlign('center');

    this.cameras.main.fadeIn(200);
    void this.run();
  }

  /** A foe's sprite: 2x, or 3x for a warden or the Gloam (standing on the same ground line). */
  private addFoe(id: CreatureId, x: number, i: number) {
    const big = 'big' in CREATURES[id] || 'gloam' in CREATURES[id], y = big ? FOE_Y - 8 : FOE_Y + (i % 2) * 8;
    return this.track(face(this.add.image(x, y, creatureTexture(id)).setScale(big ? 3 : 2).setDepth(2), CREATURES[id].slot, false));
  }

  /** Gives a sprite a shadow and a sleep mark that follow it. */
  private track(img: Phaser.GameObjects.Image) {
    const half = img.displayHeight / 2;
    this.shadows.set(img, this.add.ellipse(img.x, img.y + half, img.displayWidth * 0.7, 4, 0x000000, 0.25).setDepth(1));
    this.zzz.set(img, this.add.text(img.x + 10, img.y - 22, 'z', { fontFamily: FONT, fontSize: '8px', color: TEXT.gloam }).setDepth(3).setVisible(false));
    return img;
  }

  private async run() {
    await this.play(opening(this.battle));
    while (this.alive && !this.battle.outcome) {
      // Asleep, the hero has no say in the round.
      const action = this.battle.heroSleep > 0 ? { type: 'fight' as const, target: 0 } : await this.choose();
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
    this.openCommands(0);
    return new Promise((resolve) => { this.pick = resolve; });
  }

  private openCommands(cursor: number) {
    this.menu = 'cmd';
    this.cursor = cursor;
    this.say(`What will ${this.battle.hero.name} do?`);
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

  private sprite(who: Who) {
    return who === 'hero' ? this.heroImg : this.foeImgs[who];
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
    const end = this.time.now + ms, tint = img.getData('tint') as number | undefined;
    const rest = () => (tint ? img.setTint(tint).setTintMode(Phaser.TintModes.MULTIPLY) : img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY));
    const ev = this.time.addEvent({
      delay: 40, loop: true, callback: () => {
        if (this.time.now >= end) { rest(); ev.remove(); return; }
        if (img.tintMode === Phaser.TintModes.FILL) rest();
        else img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      },
    });
  }

  /** A braced foe keeps a cool tint until it lowers its guard. */
  private setRestTint(img: Phaser.GameObjects.Image, tint: number | null) {
    img.setData('tint', tint ?? undefined);
    if (tint) img.setTint(tint).setTintMode(Phaser.TintModes.MULTIPLY);
    else img.clearTint();
  }

  /** Lays the foes out for however many there are now (a howl brings a third). */
  private relayout() {
    const xs = BATTLE.slots[this.foeImgs.length];
    this.foeImgs.forEach((img, i) => this.tweens.add({ targets: img, x: xs[i], y: img.scale > 2 ? FOE_Y - 8 : FOE_Y + (i % 2) * 8, duration: 300, ease: 'Quad.out' }));
  }

  private async show(e: BattleEvent): Promise<boolean | undefined> {
    const h = this.heroImg;
    switch (e.type) {
      case 'say':
        this.say(e.text);
        await this.wait(450);
        return undefined;
      case 'heroStrike': {
        const img = this.foeImgs[e.target], dur = BATTLE.strikeRing;
        playSound(this, 'swing');
        this.tweens.add({ targets: h, x: HERO_AT.x + 44, duration: dur * 1000, ease: 'Quad.in' });
        return this.ringAt(img.x, img.y, dur, 'hero');
      }
      case 'foeHurt': {
        const img = this.foeImgs[e.target];
        this.say(e.text);
        playSound(this, e.valor ? 'valor' : 'hit');
        this.flicker(img, 300);
        this.popup(img.x, img.y - 18, String(e.damage), e.big ? TEXT.gold : e.fire ? '#ffb070' : '#ffffff', e.big);
        this.fx.burst(img.x, img.y, e.fire ? [COLORS.ember, 0xffd27a] : [0xffffff, 0xffd27a, COLORS.gold], e.big ? [18, 90, 450] : [9, 60, 350]);
        this.fx.shake(e.big ? 3 : 1.5);
        this.tweens.add({ targets: h, x: HERO_AT.x, duration: 240, ease: 'Quad.out' });
        await this.wait(650);
        return undefined;
      }
      case 'miss': {
        const img = this.foeImgs[e.target];
        this.say(e.text);
        playSound(this, 'swing');
        this.tweens.add({ targets: img, x: img.x + 10, duration: 120, yoyo: true, ease: 'Quad.out' });
        this.tweens.add({ targets: h, x: HERO_AT.x, duration: 240, ease: 'Quad.out' });
        await this.wait(550);
        return undefined;
      }
      case 'foeReady': {
        const img = this.foeImgs[e.foe];
        img.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        await this.wait(260);
        this.setRestTint(img, (img.getData('tint') as number | undefined) ?? null);
        img.setTintMode(Phaser.TintModes.MULTIPLY);
        await this.wait(120);
        return undefined;
      }
      case 'tell': {
        const img = this.foeImgs[e.foe];
        this.say(e.text);
        playSound(this, 'tell');
        this.setRestTint(img, 0xffc070);
        this.fx.burst(img.x, img.y, [COLORS.gold, COLORS.ember], [12, 30, 700]);
        await this.wait(1100);
        return undefined;
      }
      case 'big': {
        const img = this.foeImgs[e.foe];
        this.say(e.text);
        playSound(this, 'roar');
        this.setRestTint(img, null);
        this.fx.flash(0.35);
        this.fx.shake(3);
        await this.wait(700);
        return undefined;
      }
      case 'unmask': {
        const img = this.foeImgs[e.foe];
        this.say(e.text);
        playSound(this, 'roar');
        this.fx.flash(0.6);
        this.fx.shake(5);
        this.fx.burst(img.x, img.y, [COLORS.gloam, 0x2a1a40, 0xffffff], [30, 90, 900]);
        this.tweens.add({ targets: img, scale: 4, y: FOE_Y - 16, duration: 900, ease: 'Back.out' });
        await this.wait(1600);
        return undefined;
      }
      case 'foeStrike': {
        const img = this.foeImgs[e.foe], x0 = img.x, dur = BATTLE.guardRing;
        this.tweens.add({ targets: img, x: x0 - 30, duration: dur * 1000, ease: 'Quad.in', yoyo: true, hold: 60 });
        return this.ringAt(h.x, h.y, dur, 'foe');
      }
      case 'heroHurt': {
        this.say(e.text);
        playSound(this, e.guarded ? 'guard' : e.kind === 'poison' ? 'poison' : e.damage ? 'hurt' : 'swing');
        if (e.damage) this.flicker(h, 300);
        const color = e.guarded ? TEXT.gold : e.kind === 'poison' ? TEXT.leaf : e.kind === 'fire' ? '#ffb070' : TEXT.hurt;
        this.popup(h.x, h.y - 20, String(e.damage), color);
        const sparks = e.guarded ? [COLORS.gold, 0xffffff] : e.kind === 'poison' ? [COLORS.leaf, 0x4f8a3a] : [0xff6b5e, 0xffffff];
        this.fx.burst(h.x, h.y, sparks, [e.damage ? 8 : 3, 60, 300]);
        if (e.damage && e.kind !== 'poison') this.fx.shake(Math.min(4, 1 + e.damage / 6));
        await this.wait(650);
        return undefined;
      }
      case 'cast': {
        const img = this.sprite(e.who);
        this.say(e.text);
        playSound(this, 'cast');
        this.fx.burst(img.x, img.y, [SPELL_COLOR[e.spell] ?? COLORS.gold, 0xffffff], [14, 40, 500]);
        await this.wait(500);
        return undefined;
      }
      case 'bolt': {
        const from = this.sprite(e.from), to = this.sprite(e.to);
        playSound(this, 'bolt');
        const bolt = this.add.rectangle(from.x, from.y, 6, 6, COLORS.ember).setDepth(14).setStrokeStyle(1, 0xfff4c0);
        await new Promise<void>((resolve) => this.tweens.add({ targets: bolt, x: to.x, y: to.y, duration: 220, ease: 'Quad.in', onComplete: () => resolve() }));
        bolt.destroy();
        return undefined;
      }
      case 'heal': {
        const img = this.sprite(e.who);
        this.say(e.text);
        playSound(this, 'heal');
        this.popup(img.x, img.y - 22, `+${e.amount}`, TEXT.leaf);
        this.fx.burst(img.x, img.y, [COLORS.leaf, 0xffffff], [10, 30, 600]);
        await this.wait(700);
        return undefined;
      }
      case 'status': {
        const img = this.sprite(e.who);
        this.say(e.text);
        if (e.status === 'brace') this.setRestTint(img, e.on ? 0x9db4ff : null);
        if (e.on && e.status === 'sleep') playSound(this, 'sleep');
        if (e.on && e.status === 'poison') { playSound(this, 'poison'); this.popup(img.x, img.y - 22, 'POISON', TEXT.leaf); }
        if (e.on && e.status === 'hush') this.popup(img.x, img.y - 22, 'HUSHED', TEXT.gloam);
        if (!e.on && e.status === 'poison') playSound(this, 'heal');
        await this.wait(650);
        return undefined;
      }
      case 'leave': {
        const img = this.foeImgs[e.foe];
        this.say(e.text);
        playSound(this, 'flee');
        this.popup(h.x, h.y - 24, `-${e.gold} G`, TEXT.gold);
        this.tweens.add({ targets: img, y: img.y - 70, x: img.x + 30, alpha: 0, duration: 600, ease: 'Quad.in' });
        await this.wait(800);
        return undefined;
      }
      case 'join': {
        const f = this.battle.foes[e.foe];
        playSound(this, 'howl');
        const img = this.addFoe(f.id, WIDTH + 20, e.foe).setAlpha(0);
        this.foeImgs.push(img);
        this.tweens.add({ targets: img, alpha: 1, duration: 300 });
        this.relayout();
        this.say(e.text);
        await this.wait(750);
        return undefined;
      }
      case 'freed': {
        const img = this.foeImgs[e.foe];
        this.say(e.text);
        playSound(this, 'freed');
        img.setData('tint', undefined).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
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
        if (e.xp) playSound(this, 'victory');
        await this.waitOrSkip(e.xp ? 1600 : 900);
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

    // Shadows and sleep marks follow their sprites.
    const b = this.battle;
    for (const [img, sh] of this.shadows) sh.setPosition(img.x, sh.y).setVisible(img.alpha > 0.05);
    for (const [img, z] of this.zzz) {
      const i = this.foeImgs.indexOf(img), asleep = img === this.heroImg ? b.heroSleep > 0 : (b.foes[i]?.sleep ?? 0) > 0 && img.alpha > 0.5;
      z.setVisible(asleep).setPosition(img.x + 10, img.y - 22 - (Math.floor(this.clock * 3) % 3)).setText(Math.floor(this.clock * 2) % 2 ? 'z' : 'Z');
    }
    this.drawUi();
    publishHud(this, this.journey, this.device, 'battle');
  }

  /** The SPELL or ITEM list, as the message box shows it. */
  private options(): Option[] {
    const b = this.battle;
    if (this.menu === 'spell') return battleSpells(b).map((id) => ({ label: `${SPELLS[id].name.toUpperCase()} ${SPELLS[id].mp}`, ok: canCast(b, id), spell: id }));
    if (this.menu === 'item') return battleItems(b).map((id) => ({ label: `${ITEMS[id].name.toUpperCase()} x${count(b.hero, id)}`, ok: canUse(b, id), item: id }));
    return [];
  }

  private commandReady(i: number) {
    const b = this.battle;
    return i === 1 ? battleSpells(b).length > 0 : i === 2 ? battleItems(b).length > 0 : true;
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
      if (!this.commandReady(this.cursor)) { playSound(this, 'bump'); this.say(c === 'SPELL' ? 'No spells learned yet.' : 'Nothing to use.'); return; }
      playSound(this, 'select');
      if (c === 'FLEE') this.commit({ type: 'flee' });
      else if (c === 'FIGHT') this.aimOrCommit({ type: 'fight', target: this.battle.foes.indexOf(foes[0]) }, 'cmd');
      else { this.menu = c === 'SPELL' ? 'spell' : 'item'; this.listCursor = 0; }
      return;
    }
    if (this.menu === 'spell' || this.menu === 'item') {
      const opts = this.options(), n = opts.length;
      if (tapped === 'up' || tapped === 'down') { this.listCursor = (this.listCursor + (tapped === 'up' ? n - 1 : 1)) % n; playSound(this, 'select'); }
      if (tapped === 'left' || tapped === 'right') {
        const to = this.listCursor + (tapped === 'left' ? -LIST_ROWS : LIST_ROWS);
        if (to >= 0 && to < n) { this.listCursor = to; playSound(this, 'select'); }
      }
      if (back) { playSound(this, 'select'); this.openCommands(this.menu === 'spell' ? 1 : 2); return; }
      if (!confirm) return;
      const o = opts[this.listCursor];
      if (!o?.ok) { playSound(this, 'bump'); return; }
      playSound(this, 'select');
      if (o.spell) {
        const action: Action = { type: 'spell', spell: o.spell, target: this.battle.foes.indexOf(foes[0]) };
        if (spellTargets(o.spell)) this.aimOrCommit(action, 'spell');
        else this.commit(action);
      } else if (o.item) this.commit({ type: 'item', item: o.item });
      return;
    }
    // Choosing a target: left/right (or up/down) across the living foes.
    if (tapped) {
      const step = tapped === 'left' || tapped === 'up' ? -1 : 1;
      this.cursor = (this.cursor + step + foes.length) % foes.length;
      playSound(this, 'select');
    }
    if (back && this.pending) {
      playSound(this, 'select');
      if (this.pending.from === 'spell') this.menu = 'spell';
      else this.openCommands(0);
      this.pending = null;
      return;
    }
    if (confirm && this.pending) {
      playSound(this, 'select');
      const a = this.pending.action;
      const target = this.battle.foes.indexOf(foes[this.cursor]);
      this.pending = null;
      this.commit(a.type === 'fight' ? { ...a, target } : a.type === 'spell' ? { ...a, target } : a);
    }
  }

  /** Commits now if there's only one foe to aim at, else opens the target cursor. */
  private aimOrCommit(action: Action, from: 'cmd' | 'spell') {
    if (living(this.battle).length === 1) { this.commit(action); return; }
    this.pending = { action, from };
    this.menu = 'target';
    this.cursor = 0;
  }

  private commit(a: Action) {
    this.menu = null;
    const pick = this.pick;
    this.pick = null;
    pick?.(a);
  }

  private drawUi() {
    const listing = this.menu === 'spell' || this.menu === 'item';
    // Command list: dimmed while events play; SPELL and ITEM dim when there's nothing to choose.
    this.cmdTexts.forEach((t, i) => {
      const sel = (this.menu === 'cmd' || listing) && i === this.cursor && (this.menu === 'cmd' || (this.menu === 'spell' ? i === 1 : i === 2));
      t.setVisible(!this.ring).setColor(!this.commandReady(i) ? '#5d5a78' : sel ? TEXT.gold : this.menu === 'cmd' ? TEXT.ink : TEXT.dim);
    });
    const opts = listing ? this.options() : [];
    this.listTexts.forEach((t, i) => {
      const o = opts[i];
      t.setVisible(!!o).setText(o?.label ?? '').setColor(!o?.ok ? '#5d5a78' : i === this.listCursor ? TEXT.gold : TEXT.ink);
    });
    this.msgText.setVisible(!listing);
    const press = this.device === 'pad' ? 'A' : 'Z';
    this.prompt.setText(this.ring ? (this.ring.who === 'hero' ? `PRESS ${press}\nON THE RING` : `PRESS ${press}\nTO GUARD`) : '');

    const m = this.marks.clear(), g = this.ringG.clear();
    if (this.menu === 'cmd') m.fillStyle(COLORS.gold).fillRect(CMD.x + 9, CMD.y + 9 + this.cursor * 10, 3, 4);
    if (listing && opts.length) {
      const c = this.listCursor;
      m.fillStyle(COLORS.gold).fillRect(MSG.x + 10 + Math.floor(c / LIST_ROWS) * 150, MSG.y + 9 + (c % LIST_ROWS) * 13, 3, 4);
    }
    if (this.menu === 'target') {
      const f = living(this.battle)[this.cursor];
      if (f) {
        const img = this.foeImgs[this.battle.foes.indexOf(f)], y = img.y - 26 + (Math.floor(this.clock * 4) % 2);
        g.fillStyle(COLORS.gold).fillRect(img.x - 3, y, 7, 2).fillRect(img.x - 2, y + 2, 5, 1).fillRect(img.x - 1, y + 3, 3, 1).fillRect(img.x, y + 4, 1, 1);
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
