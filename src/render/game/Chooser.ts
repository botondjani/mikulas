import Phaser from 'phaser';
import { C, emo, txt } from '../view';
import { GIFTS, TOOLS, STREET, icon, type HandItem, type ToolId } from '../../games/mikulas/types';
import type { MikulasGame } from '../../games/mikulas/game';
import itemsData from '../../games/mikulas/data/items.json';

interface Slot {
  id: HandItem | ToolId;
  count: number;
}

/** A szánnál megjelenő tárgyválasztó sor (koppintás vagy 1–9 billentyű). */
export class Chooser {
  private c: Phaser.GameObjects.Container;
  private key = '';
  slots: Slot[] = [];
  readonly y = 482;
  rects: { x: number; y: number; w: number }[] = [];

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
    private onPick: (id: string) => void,
  ) {
    this.c = scene.add.container(0, 0).setScrollFactor(0).setDepth(1300).setVisible(false);
  }

  get visible(): boolean {
    return this.c.visible;
  }

  /** a koordináta a választó gombjaira esik-e (a joystick ne induljon el) */
  hit(x: number, y: number): boolean {
    if (!this.c.visible) return false;
    return this.rects.some((r) => Math.abs(x - r.x) <= r.w / 2 + 4 && Math.abs(y - r.y) <= r.w / 2 + 4);
  }

  update(): void {
    const g = this.g;
    const p = g.player;
    const s = g.street.sledCenter;
    const show =
      (g.phase === 'deliver' || g.phase === 'dawn') &&
      p.zone === STREET &&
      Math.hypot(p.x - s.x, p.y - s.y) < g.tuning.sledRadius;
    this.c.setVisible(show);
    if (!show) return;
    const slots: Slot[] = [
      ...GIFTS.filter((id) => g.sledStock[id] > 0).map((id) => ({ id, count: g.sledStock[id] })),
      { id: 'candy' as const, count: -1 },
      ...TOOLS.filter((id) => g.toolStock[id] > 0).map((id) => ({ id, count: g.toolStock[id] })),
    ];
    const key = JSON.stringify(slots) + p.hand.item + p.pocket.item;
    if (key === this.key) return;
    this.key = key;
    this.slots = slots;
    this.rebuild();
  }

  private rebuild(): void {
    this.c.removeAll(true);
    this.rects = [];
    const isTool = (id: string) => (TOOLS as string[]).includes(id);
    const gifts = this.slots.filter((sl) => !isTool(sl.id));
    const tools = this.slots.filter((sl) => isTool(sl.id));
    this.row(gifts, this.y, 0, '🛷 A szánról:');
    if (tools.length) this.row(tools, this.y - 78, gifts.length, '🧰 Eszközök (zsebbe):');
  }

  private row(slots: Slot[], y: number, firstIdx: number, title: string): void {
    const s = this.scene;
    const p = this.g.player;
    const W = 62;
    const gap = 8;
    const total = slots.length * (W + gap) - gap;
    let x = 480 - total / 2 + W / 2;
    const bg = s.add.graphics();
    bg.fillStyle(0x06102a, 0.55).fillRoundedRect(x - W / 2 - 10, y - W / 2 - 20, Math.max(total, 150) + 20, W + 28, 14);
    this.c.add(bg);
    this.c.add(txt(s, x - W / 2, y - W / 2 - 10, title, 12, '#c9d7f2').setOrigin(0, 0.5));
    slots.forEach((sl, i) => {
      const held = p.hand.item === sl.id || p.pocket.item === sl.id;
      const tool = (TOOLS as string[]).includes(sl.id);
      const g = s.add.graphics();
      g.fillStyle(held ? C.warm : tool ? 0x3a5a8a : 0xeef4ff, held ? 1 : 0.92);
      g.fillRoundedRect(x - W / 2, y - W / 2 + 4, W, W - 4, 12);
      this.c.add(g);
      this.c.add(emo(s, x, y + (tool ? 6 : 2), icon(sl.id), tool ? 26 : 32));
      if (sl.count > 1) this.c.add(txt(s, x + W / 2 - 10, y + W / 2 - 12, `${sl.count}`, 14, tool ? '#ffffff' : '#3a2200', { fontStyle: 'bold' }));
      if (tool) this.c.add(txt(s, x, y - W / 2 + 13, itemsData.tools[sl.id as ToolId].name, 11, '#ffffff'));
      else this.c.add(txt(s, x - W / 2 + 9, y - W / 2 + 13, `${firstIdx + i + 1}`, 11, '#7a8aaa'));
      const zone = s.add.zone(x, y + 2, W, W).setScrollFactor(0).setInteractive({ useHandCursor: true });
      const id = sl.id;
      zone.on('pointerdown', () => this.onPick(id));
      this.c.add(zone);
      this.rects.push({ x, y, w: W });
      x += W + gap;
    });
  }

  pickIndex(i: number): void {
    const sl = this.slots[i];
    if (this.c.visible && sl) this.onPick(sl.id);
  }
}
