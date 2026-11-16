import Phaser from 'phaser';
import { COLORS, FONT, GEAR, HUD_SCALE, INN, ITEMS, LEVELS, STATUS, TEXT, type ItemId } from '../config';
import { Controls } from '../controls';
import { SITES } from '../data/maps';
import { QUEST, type Person } from '../data/people';
import { writeSave } from '../save';
import { playSound, toggleMute } from '../sfx';
import { buy, canBuy, cost, half, preview, sell, sellable, stay, tradeIn, wareName, type Ware } from '../shop';
import { STATE, count, toNext, type Journey } from '../state';
import { fitCamera } from '../view';
import { drawPanel, publishHud } from './HudScene';
import type { WorldScene } from './WorldScene';

export interface TalkData {
  person: Person;
  /** The town's site key. */
  town: string;
}

// HUD units (2 per game pixel).
const BOX = { x: 96, y: 300, w: 640, h: 112 };
const LIST = { x: 476, y: 52, w: 340, rows: 7 };
const ROW = 26;

const ABOUT: Record<ItemId, string> = {
  herb: `Heals ${ITEMS.herb.heal[0]}-${ITEMS.herb.heal[1]} HP.`,
  remedy: 'Cures poison.',
  incense: `Weaker creatures keep away for ${STATUS.incenseSteps} steps.`,
  torch: 'Lights the way in dark places.',
  key: 'Opens one locked door.',
};

interface Row { label: string; right?: string; ok: boolean; info?: string; act: () => void }

/** A conversation over the paused map: lines to page through, then the inn, the shrine or a shop's lists. */
export class TalkScene extends Phaser.Scene {
  /** Lines still to show; the first is on screen. */
  pages: string[] = [];
  /** A list to choose from, when one is open. */
  rows: (() => Row[]) | null = null;
  cursor = 0;
  /** What the last purchase or sale did, shown in place of the row's description. */
  note = '';
  private after: (() => void) | null = null;
  private onBack: (() => void) | null = null;
  private title = '';
  private controls!: Controls;
  private journey!: Journey;
  private chat!: TalkData;
  private g!: Phaser.GameObjects.Graphics;
  private text!: Phaser.GameObjects.Text;
  private head!: Phaser.GameObjects.Text;
  private labels: Phaser.GameObjects.Text[] = [];
  private rights: Phaser.GameObjects.Text[] = [];
  private clock = 0;
  private busy = false;

  constructor() {
    super('talk');
  }

  create(data: TalkData) {
    fitCamera(this, HUD_SCALE);
    this.controls = new Controls(this);
    this.journey = this.registry.get(STATE) as Journey;
    this.chat = data;
    this.rows = null;
    this.note = '';
    this.busy = false;
    this.g = this.add.graphics();
    const t = (x: number, y: number, color: string = TEXT.ink) => this.add.text(x, y, '', { fontFamily: FONT, fontSize: '16px', color });
    this.text = t(BOX.x + 20, BOX.y + 16).setWordWrapWidth(BOX.w - 48).setLineSpacing(8);
    this.head = t(LIST.x + 20, LIST.y + 14, TEXT.gold);
    this.labels = Array.from({ length: LIST.rows }, (_, i) => t(LIST.x + 40, LIST.y + 48 + i * ROW));
    this.rights = Array.from({ length: LIST.rows }, (_, i) => t(LIST.x + LIST.w - 20, LIST.y + 48 + i * ROW).setOrigin(1, 0));
    playSound(this, 'open');
    this.begin();
  }

  private get hero() {
    return this.journey.hero;
  }

  /** Shows lines one page at a time; then runs `after`, or closes. */
  say(lines: string[], after: (() => void) | null = null) {
    this.rows = null;
    this.pages = [...lines];
    this.after = after;
  }

  /** Opens a list. `rows` is re-read every frame, so prices and counts stay current. */
  choose(title: string, rows: () => Row[], onBack: () => void) {
    this.title = title;
    this.rows = rows;
    this.onBack = onBack;
    this.cursor = 0;
    this.note = '';
  }

  private begin() {
    const p = this.chat.person, h = this.hero, town = this.chat.town;
    const fill = (s: string) => s.replace('{price}', String(INN[town] ?? 0));
    switch (p.role) {
      case 'queen': {
        // Her charge is the first beacon still cold (or the Hollow, once all four burn).
        const cold = this.journey.lit.indexOf(false), lit = cold < 0 ? 4 : cold;
        const next = h.lv < LEVELS.length ? `You need ${toNext(h)} more Valor to reach LV ${h.lv + 1}.` : 'No knight of the realm stands stronger than you.';
        this.say([`Welcome, ${h.name}. ${QUEST[lit]}`, next]);
        break;
      }
      case 'inn':
        this.say(p.lines.map(fill), () => this.yesNo(() => this.sleep(), 'Rest well another time.'));
        break;
      case 'shrine': {
        const lines = h.poisoned ? ['The keeper lays a hand on your brow. The poison is drawn out.', ...p.lines] : p.lines;
        if (h.poisoned) { h.poisoned = false; playSound(this, 'heal'); }
        this.say(lines, () => this.yesNo(() => this.record(), 'Walk in the light.'));
        break;
      }
      case 'smith': case 'grocer':
        this.say(p.lines, () => this.shopTop());
        break;
      default:
        this.say(p.lines);
    }
  }

  private yesNo(yes: () => void, no: string) {
    this.choose('', () => [
      { label: 'YES', ok: true, act: yes },
      { label: 'NO', ok: true, act: () => this.say([no]) },
    ], () => this.say([no]));
  }

  private sleep() {
    const r = stay(this.hero, this.chat.town);
    if (!r.ok) { playSound(this, 'bump'); this.say([r.text]); return; }
    this.rows = null;
    this.busy = true;
    playSound(this, 'rest');
    this.cameras.main.fadeOut(500);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.cameras.main.fadeIn(500);
      this.busy = false;
      this.say([r.text]);
    });
  }

  private record() {
    const town = this.chat.town;
    this.hero.home = town;
    const ok = writeSave(this.journey);
    playSound(this, ok ? 'rest' : 'bump');
    this.say([ok
      ? `Your journey is recorded. Should you fall, you will wake here in ${SITES[town].name}.`
      : "The record won't hold: this browser isn't letting the page save. Your journey goes on, unsaved."]);
  }

  private shopTop() {
    const stock = this.chat.person.stock ?? [];
    this.choose('', () => [
      { label: 'BUY', ok: stock.length > 0, act: () => this.choose('BUY', () => this.buyRows(), () => this.shopTop()) },
      { label: 'SELL', ok: true, act: () => this.choose('SELL', () => this.sellRows(), () => this.shopTop()) },
      { label: 'LEAVE', ok: true, act: () => this.say(['Come again!']) },
    ], () => this.say(['Come again!']));
  }

  private buyRows(): Row[] {
    const h = this.hero;
    return (this.chat.person.stock ?? []).map((w: Ware) => {
      const v = canBuy(h, w);
      let info: string;
      if ('gear' in w) {
        const pv = preview(h, w.gear), { old, refund } = tradeIn(h, w.gear);
        info = v === 'owned' ? `You already carry the ${GEAR[w.gear].name}.`
          : `${pv.stat} ${pv.now} -> ${pv.then}.${old ? ` Your ${GEAR[old].name} is worth ${refund} gold in trade.` : ''}`;
      } else info = `${ABOUT[w.item]} You have ${count(h, w.item)}.`;
      return { label: wareName(w).toUpperCase(), right: v === 'owned' ? 'WORN' : `${cost(h, w)} G`, ok: v === 'ok', info, act: () => this.trade(buy(h, w)) };
    });
  }

  private sellRows(): Row[] {
    const h = this.hero;
    return sellable(h).map((id) => ({
      label: `${ITEMS[id].name.toUpperCase()} x${count(h, id)}`, right: `${half(ITEMS[id].price)} G`, ok: true,
      info: `I'll give you ${half(ITEMS[id].price)} gold for it.`, act: () => this.trade(sell(h, id)),
    }));
  }

  private trade(r: { ok: boolean; text: string }) {
    playSound(this, r.ok ? 'coin' : 'bump');
    this.note = r.text;
  }

  update(_time: number, delta: number) {
    this.clock += delta / 1000;
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    publishHud(this, this.journey, input.device, 'talk');
    if (this.busy) { this.draw(); return; }
    if (input.menu) { this.close(); return; }
    if (this.rows) {
      const rows = this.rows(), n = rows.length;
      if (n && (input.tapped === 'up' || input.tapped === 'down')) {
        this.cursor = (this.cursor + (input.tapped === 'up' ? n - 1 : 1)) % n;
        this.note = '';
        playSound(this, 'select');
      }
      this.cursor = Math.min(this.cursor, Math.max(0, n - 1));
      if (input.back) { playSound(this, 'select'); this.onBack?.(); }
      else if (input.confirm) {
        const row = rows[this.cursor];
        if (!row) { playSound(this, 'select'); this.onBack?.(); }
        else if (!row.ok) { playSound(this, 'bump'); if (row.info) this.note = row.info; }
        else { playSound(this, 'select'); row.act(); }
      }
    } else if (input.confirm || input.back) {
      playSound(this, 'select');
      this.pages.shift();
      if (!this.pages.length) {
        const after = this.after;
        this.after = null;
        if (after) after();
        else { this.close(); return; }
      }
    }
    this.draw();
  }

  private close() {
    const world = this.scene.get('world') as WorldScene;
    this.scene.stop();
    world.closeTalk();
  }

  private draw() {
    const g = this.g.clear();
    drawPanel(g, BOX.x, BOX.y, BOX.w, BOX.h, 0.96);
    const rows = this.rows?.() ?? null;
    if (rows) {
      const shown = rows.slice(0, LIST.rows), h = 48 + Math.max(1, shown.length) * ROW + 10;
      drawPanel(g, LIST.x, LIST.y, LIST.w, h, 0.96);
      this.head.setText(this.title ? `${this.title}  ·  GOLD ${this.hero.gold}` : `GOLD ${this.hero.gold}`);
      this.labels.forEach((t, i) => {
        const r = shown[i];
        t.setText(r?.label ?? (i === 0 && !shown.length ? 'NOTHING' : '')).setColor(!r || !r.ok ? '#5d5a78' : i === this.cursor ? TEXT.gold : TEXT.ink);
      });
      this.rights.forEach((t, i) => t.setText(shown[i]?.right ?? '').setColor(shown[i]?.ok ? TEXT.dim : '#5d5a78'));
      if (shown.length) g.fillStyle(COLORS.gold).fillRect(LIST.x + 20, LIST.y + 54 + this.cursor * ROW, 6, 8);
      this.text.setText(this.note || rows[this.cursor]?.info || this.prompt());
    } else {
      this.head.setText('');
      for (const t of [...this.labels, ...this.rights]) t.setText('');
      this.text.setText(this.pages[0] ?? '');
      // More to come: a bobbing arrow.
      if (this.pages.length > 1 || this.after) {
        const y = BOX.y + BOX.h - 22 + (Math.floor(this.clock * 3) % 2) * 2;
        g.fillStyle(COLORS.gold).fillRect(BOX.x + BOX.w - 36, y, 10, 2).fillRect(BOX.x + BOX.w - 34, y + 2, 6, 2).fillRect(BOX.x + BOX.w - 32, y + 4, 2, 2);
      }
    }
  }

  private prompt() {
    const role = this.chat.person.role;
    if (role === 'inn' || role === 'shrine') return this.chat.person.lines[0].replace('{price}', String(INN[this.chat.town] ?? 0));
    return this.title === 'SELL' ? 'What will you sell?' : 'What can I do for you?';
  }
}
