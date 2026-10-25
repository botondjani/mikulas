import Phaser from 'phaser';
import { C, CX, RX, VW, button, emo, txt } from '../view';
import { icon, type GiftId } from '../../games/mikulas/types';
import type { MikulasGame } from '../../games/mikulas/game';
import eventsData from '../../games/mikulas/data/events.json';

/** Pakolás: koppintással a zsákból a szánra a kívánt ajándékokat. */
export class PackOverlay {
  private c: Phaser.GameObjects.Container;
  private items: Phaser.GameObjects.Container;
  private timer: Phaser.GameObjects.Graphics;
  private key = '';
  /** a zsák tárgyainak képernyő-pozíciója (a tutorial mutatójához) */
  sackPos = new Map<number, { x: number; y: number }>();
  private hintT?: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
  ) {
    const s = scene;
    this.c = s.add.container(0, 0).setScrollFactor(0).setDepth(1400);
    const bg = s.add.rectangle(CX, 270, VW, 540, 0x06102a, 0.78).setInteractive();
    this.c.add(bg);
    this.c.add(txt(s, CX, 32, `🎒 ${eventsData.pack.title}`, 24, '#ffffff', { fontStyle: 'bold' }));
    this.timer = s.add.graphics();
    this.c.add(this.timer);
    this.c.add(txt(s, 40, 208, '🎒 Zsák', 18, '#c9d7f2').setOrigin(0, 0.5));
    this.c.add(txt(s, 40, 402, '🛷 Szán', 18, '#c9d7f2').setOrigin(0, 0.5));
    if (g.level.hints) {
      this.hintT = txt(s, CX, 512, 'Koppints a zsákban arra, amit a gyerekek kértek!', 16, '#ffe7a8');
      this.c.add(this.hintT);
    }
    this.c.add(
      button(s, RX(850), 476, 'Indulás! ▶', () => g.packDone(), { w: 190, h: 58, size: 24 }).setScrollFactor(0, 0, true),
    );
    this.items = s.add.container(0, 0);
    this.c.add(this.items);
  }

  setVisible(v: boolean): void {
    this.c.setVisible(v);
  }

  update(): void {
    const g = this.g;
    this.hintT?.setVisible(g.hintsEnabled);
    const prog = g.phases.progress;
    this.timer.clear();
    this.timer.fillStyle(0xffffff, 0.15).fillRoundedRect(CX - 250, 56, 500, 10, 5);
    this.timer.fillStyle(prog > 0.75 ? C.red : C.warm, 1).fillRoundedRect(CX - 250, 56, 500 * (1 - prog), 10, 5);
    const key = g.pack.sack.map((p) => p.id).join(',') + '|' + g.pack.sled.map((p) => p.id).join(',');
    if (key === this.key) return;
    this.key = key;
    this.rebuild();
  }

  private rebuild(): void {
    const s = this.scene;
    const g = this.g;
    this.items.removeAll(true);

    // rendelés-kártyák
    const hs = g.level.houses;
    const cw = Math.min(104, 880 / hs.length);
    const satisfied = new Map<GiftId, number>();
    for (const p of g.pack.sled) satisfied.set(p.gift, (satisfied.get(p.gift) ?? 0) + 1);
    hs.forEach((h, i) => {
      const x = CX - ((hs.length - 1) * cw) / 2 + i * cw;
      const have = (satisfied.get(h.wish) ?? 0) > 0;
      if (have) satisfied.set(h.wish, satisfied.get(h.wish)! - 1);
      const card = s.add.graphics();
      card.fillStyle(have ? 0x2f8a52 : 0xeef4ff, 1).fillRoundedRect(x - cw / 2 + 4, 84, cw - 8, 96, 12);
      this.items.add(card);
      this.items.add(txt(s, x, 100, `${i + 1}. ${h.child}`, 14, have ? '#ffffff' : '#132650', { fontStyle: 'bold' }));
      this.items.add(emo(s, x, 140, icon(h.wish), 36));
      if (have) this.items.add(txt(s, x + cw / 2 - 18, 166, '✓', 20, '#ffffff', { fontStyle: 'bold' }));
    });

    // zsák és szán tartalma
    this.sackPos.clear();
    const grid = (list: typeof g.pack.sack, y0: number, onTap: (id: number) => void, dim: boolean) => {
      const per = 9;
      list.forEach((p, i) => {
        const row = Math.floor(i / per);
        const inRow = Math.min(per, list.length - row * per);
        const x = CX - ((inRow - 1) * 80) / 2 + (i % per) * 80;
        const y = y0 + row * 78;
        const b = s.add.graphics();
        b.fillStyle(0x000000, 0.3).fillRoundedRect(x - 34, y - 30, 68, 68, 14);
        b.fillStyle(dim ? 0xffd36b : 0xc9d7f2, 1).fillRoundedRect(x - 34, y - 34, 68, 68, 14);
        this.items.add(b);
        this.items.add(emo(s, x, y, icon(p.gift), 38));
        if (!dim) this.sackPos.set(p.id, { x, y });
        const z = s.add.zone(x, y, 72, 72).setScrollFactor(0).setInteractive({ useHandCursor: true });
        z.on('pointerdown', () => onTap(p.id));
        this.items.add(z);
      });
    };
    grid(g.pack.sack, 250, (id) => g.packAdd(id), false);
    if (g.pack.sled.length) grid(g.pack.sled, 440, (id) => g.packRemove(id), true);
    else this.items.add(txt(s, CX, 440, '(üres – koppints a zsákban!)', 16, '#8a9ac0'));
  }
}
