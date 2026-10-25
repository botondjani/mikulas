import Phaser from 'phaser';
import { CX, VW, button, txt } from '../view';
import type { GameMode } from '../../games/mikulas/modes';

/**
 * Pályaindításkor: nehézség (normál / hard) és hangulat (normál / horror) – a kettő
 * kombinálható, így minden pálya négyféleképpen játszható.
 */
export class ModePicker {
  private c: Phaser.GameObjects.Container;
  private mode: Required<GameMode>;
  private sel: Phaser.GameObjects.Graphics;
  private warn: Phaser.GameObjects.Text;
  private btns: Record<string, Phaser.GameObjects.Container> = {};

  constructor(scene: Phaser.Scene, title: string, last: GameMode, onPick: (m: Required<GameMode>) => void) {
    this.mode = { hard: !!last.hard, horror: !!last.horror };
    this.c = scene.add.container(0, 0).setScrollFactor(0).setDepth(3500);
    this.c.add(scene.add.rectangle(CX, 270, VW, 540, 0x06102a, 0.92).setInteractive());
    this.c.add(txt(scene, CX, 54, title, 32, '#ffffff', { fontStyle: 'bold', stroke: '#7a1d1a', strokeThickness: 6 }));
    // vissza a főmenübe (másik pálya választásához)
    this.c.add(button(scene, CX - 340, 54, '◀ Vissza', () => scene.scene.start('Menu'), { w: 150, h: 50, size: 20, color: 0xeef4ff }));
    this.sel = scene.add.graphics();
    this.c.add(this.sel);
    const row = (y: number, label: string, a: [string, () => void, number, string], b: [string, () => void, number, string], keys: [string, string]) => {
      this.c.add(txt(scene, CX - 330, y, label, 20, '#ffe7a8', { fontStyle: 'bold' }).setOrigin(0, 0.5));
      this.btns[keys[0]] = button(scene, CX - 20, y, a[0], a[1], { w: 250, h: 70, size: 26, color: a[2], textColor: a[3] });
      this.btns[keys[1]] = button(scene, CX + 250, y, b[0], b[1], { w: 250, h: 70, size: 26, color: b[2], textColor: b[3] });
      this.c.add([this.btns[keys[0]], this.btns[keys[1]]]);
    };
    row(
      150,
      'Nehézség',
      ['🙂 Normál', () => this.set({ hard: false }), 0xffd36b, '#3a2200'],
      ['🔥 Hard', () => this.set({ hard: true }), 0xff8a3a, '#3a1200'],
      ['normal', 'hard'],
    );
    row(
      250,
      'Hangulat',
      ['🎄 Karácsonyi', () => this.set({ horror: false }), 0xc9d7f2, '#132650'],
      ['💀 Horror', () => this.set({ horror: true }), 0xb8322d, '#ffffff'],
      ['cozy', 'horror'],
    );
    this.warn = txt(scene, CX, 334, 'Horror: ijesztő, hangos meglepetések, villogó fények és rezgés. Nem kisgyerekeknek! Fényérzékenyeknek nem ajánlott.', 15, '#ffb0a8', {
      align: 'center',
      wordWrap: { width: 700 },
    });
    this.c.add(this.warn);
    this.c.add(
      button(
        scene,
        CX,
        440,
        '▶ Indulás',
        () => {
          this.c.destroy(true);
          onPick(this.mode);
        },
        { w: 320, h: 76, size: 32 },
      ),
    );
    this.c.add(txt(scene, CX, 506, 'Minden módban külön jelvény jár: 🎄 🔥 💀 ☠️', 15, '#c9d7f2'));
    this.c.setScrollFactor(0, 0, true);
    this.draw();
  }

  private set(m: GameMode): void {
    Object.assign(this.mode, m);
    this.draw();
  }

  /** a kiválasztott gombok körül fehér keret */
  private draw(): void {
    this.sel.clear().lineStyle(4, 0xffffff, 0.95);
    for (const k of [this.mode.hard ? 'hard' : 'normal', this.mode.horror ? 'horror' : 'cozy']) {
      const b = this.btns[k];
      this.sel.strokeRoundedRect(b.x - 133, b.y - 43, 266, 86, 43);
    }
    this.warn.setAlpha(this.mode.horror ? 1 : 0.35);
  }
}
