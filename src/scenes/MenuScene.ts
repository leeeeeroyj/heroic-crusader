import Phaser from 'phaser';
import { COLORS, FONT, HUD_SCALE, ITEMS, SPELLS, TEXT, type ItemId, type SpellId } from '../config';
import { Controls } from '../controls';
import { parseFloor } from '../data/dungeons';
import { castInField, fieldItems, fieldSpells, useInField } from '../field';
import { playSound, toggleMute } from '../sfx';
import { STATE, count, maxHp, maxMp, toNext, type Journey } from '../state';
import { fitCamera } from '../view';
import { drawPanel, publishHud } from './HudScene';
import type { WorldScene } from './WorldScene';

// HUD units (2 per game pixel), like the HUD.
const BOX = { x: 236, y: 64, w: 360, h: 300 };
const ROW = 26;
const TOP = ['SPELL', 'ITEM', 'BACK TO TITLE'] as const;

interface Row { label: string; ok: boolean; spell?: SpellId; item?: ItemId }

/** The field menu over the paused map: a short status, spells and items for the road, and the way back to the title. */
export class MenuScene extends Phaser.Scene {
  page: 'top' | 'spell' | 'item' = 'top';
  cursor = 0;
  /** The last thing that happened, shown at the foot of the box. */
  note = '';
  private controls!: Controls;
  private journey!: Journey;
  private head!: Phaser.GameObjects.Text;
  private stats!: Phaser.GameObjects.Text;
  private rows: Phaser.GameObjects.Text[] = [];
  private noteText!: Phaser.GameObjects.Text;
  private g!: Phaser.GameObjects.Graphics;
  private rand: () => number = Math.random;

  constructor() {
    super('menu');
  }

  create(data: { rand: () => number }) {
    fitCamera(this, HUD_SCALE);
    this.controls = new Controls(this);
    this.journey = this.registry.get(STATE) as Journey;
    this.rand = data.rand;
    this.page = 'top';
    this.cursor = 0;
    this.note = '';
    const g = this.add.graphics();
    drawPanel(g, BOX.x, BOX.y, BOX.w, BOX.h, 0.96);
    const text = (x: number, y: number, color: string = TEXT.ink) => this.add.text(x, y, '', { fontFamily: FONT, fontSize: '16px', color });
    this.head = text(BOX.x + 24, BOX.y + 18, TEXT.gold);
    this.stats = text(BOX.x + 24, BOX.y + 44, TEXT.dim).setLineSpacing(6);
    this.rows = Array.from({ length: 6 }, (_, i) => text(BOX.x + 48, BOX.y + 128 + i * ROW));
    this.noteText = text(BOX.x + 24, BOX.y + BOX.h - 52, TEXT.leaf).setWordWrapWidth(BOX.w - 48).setLineSpacing(4);
    this.g = this.add.graphics();
    playSound(this, 'open');
  }

  rowsFor(): Row[] {
    const j = this.journey, h = j.hero;
    if (this.page === 'spell') return fieldSpells(j).map((id) => ({ label: `${SPELLS[id].name.toUpperCase()}  ${SPELLS[id].mp} MP`, ok: h.mp >= SPELLS[id].mp, spell: id }));
    if (this.page === 'item') return fieldItems(j).map((id) => ({ label: `${ITEMS[id].name.toUpperCase()}  x${count(h, id)}`, ok: true, item: id }));
    return TOP.map((label, i) => ({ label, ok: i === 0 ? fieldSpells(j).length > 0 : i === 1 ? fieldItems(j).length > 0 : true }));
  }

  update() {
    const input = this.controls.read();
    if (input.mute) toggleMute(this);
    // The map is paused, so the menu keeps the HUD's numbers current.
    publishHud(this, this.journey, input.device, 'walk');
    const rows = this.rowsFor(), n = Math.max(1, rows.length);
    if (input.tapped === 'up' || input.tapped === 'down') { this.cursor = (this.cursor + (input.tapped === 'up' ? n - 1 : 1)) % n; playSound(this, 'select'); }
    if (input.menu || (input.back && this.page === 'top')) { this.close(); return; }
    if (input.back) { this.page = 'top'; this.cursor = 0; playSound(this, 'select'); }
    else if (input.confirm) this.choose(rows[this.cursor]);
    this.draw();
  }

  private choose(row: Row | undefined) {
    if (!row) return;
    if (!row.ok) { playSound(this, 'bump'); this.note = this.page === 'top' ? 'Nothing there yet.' : 'Not enough MP.'; return; }
    playSound(this, 'select');
    const j = this.journey;
    if (this.page === 'top') {
      if (row.label === 'SPELL') { this.page = 'spell'; this.cursor = 0; }
      else if (row.label === 'ITEM') { this.page = 'item'; this.cursor = 0; }
      else this.close('title');
      return;
    }
    const dark = parseFloor(j.area) !== null;
    const r = row.spell ? castInField(j, row.spell, this.rand, dark) : useInField(j, row.item!, this.rand, dark);
    this.note = r.text;
    playSound(this, !r.ok ? 'bump' : row.spell === 'homeward' || row.spell === 'ward' || row.spell === 'glow' || row.item === 'incense' || row.item === 'torch' ? 'cast' : 'heal');
    if (r.home) { this.close('home'); return; }
    // Keep the cursor on the list if an item ran out.
    this.cursor = Math.min(this.cursor, Math.max(0, this.rowsFor().length - 1));
    if (!this.rowsFor().length) { this.page = 'top'; this.cursor = 0; }
  }

  private close(then: 'title' | 'home' | null = null) {
    const world = this.scene.get('world') as WorldScene;
    this.scene.stop();
    world.closeMenu(then, this.note);
  }

  private draw() {
    const h = this.journey.hero, j = this.journey;
    this.head.setText(`${h.name}  ·  LV ${h.lv}`);
    const lines = [`HP ${h.hp}/${maxHp(h)}   MP ${h.mp}/${maxMp(h)}   GOLD ${h.gold}`, `VALOR ${h.xp}   TO NEXT LV ${toNext(h)}`];
    const marks = [h.poisoned ? 'POISONED' : '', j.ward > 0 ? `WARD ${j.ward} STEPS` : ''].filter(Boolean).join('   ');
    this.stats.setText(marks ? [...lines, marks] : lines);
    const rows = this.rowsFor();
    this.rows.forEach((t, i) => {
      const r = rows[i];
      t.setText(r?.label ?? '').setColor(!r?.ok ? '#5d5a78' : i === this.cursor ? TEXT.gold : TEXT.ink);
    });
    this.noteText.setText(this.note);
    const g = this.g.clear();
    if (rows.length) g.fillStyle(COLORS.gold).fillRect(BOX.x + 28, BOX.y + 134 + this.cursor * ROW, 6, 8);
    g.fillStyle(COLORS.trim2).fillRect(BOX.x + 24, BOX.y + 112, BOX.w - 48, 2);
  }
}
