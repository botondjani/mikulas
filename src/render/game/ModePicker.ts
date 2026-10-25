import Phaser from 'phaser';
import { CX, VW, button, txt } from '../view';

/** Pályaindításkor: normál vagy horror mód (a horrornál figyelmeztetéssel). */
export class ModePicker {
  private c: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, title: string, last: boolean, onPick: (horror: boolean) => void) {
    this.c = scene.add.container(0, 0).setScrollFactor(0).setDepth(3500);
    this.c.add(scene.add.rectangle(CX, 270, VW, 540, 0x06102a, 0.9).setInteractive());
    this.c.add(txt(scene, CX, 70, title, 34, '#ffffff', { fontStyle: 'bold', stroke: '#7a1d1a', strokeThickness: 6 }));
    this.c.add(txt(scene, CX, 118, 'Milyen legyen az éjszaka?', 20, '#ffe7a8'));
    const pick = (h: boolean) => {
      this.c.destroy(true);
      onPick(h);
    };
    const normal = button(scene, CX - 190, 230, '🎄 Normál', () => pick(false), { w: 320, h: 92, size: 32 });
    const horror = button(scene, CX + 190, 230, '💀 Horror', () => pick(true), { w: 320, h: 92, size: 32, color: 0xb8322d, textColor: '#ffffff' });
    this.c.add([normal, horror]);
    // az utoljára választott módot kiemeljük
    const sel = last ? horror : normal;
    const ring = scene.add.graphics();
    ring.lineStyle(4, 0xffffff, 0.9).strokeRoundedRect(sel.x - 170, sel.y - 54, 340, 108, 54);
    this.c.add(ring);
    this.c.add(
      txt(
        scene,
        CX + 190,
        330,
        'Ijesztő, hangos meglepetések,\nvillogó fények és rezgés.\nNem kisgyerekeknek!\nFényérzékenyeknek nem ajánlott.',
        16,
        '#ffb0a8',
        { align: 'center' },
      ),
    );
    this.c.add(txt(scene, CX - 190, 312, 'A megszokott karácsonyi éjszaka.', 16, '#c9d7f2', { align: 'center' }));
    this.c.add(txt(scene, CX, 440, 'A horror módban teljesített pálya 💀 jelet kap.', 16, '#c9d7f2'));
    this.c.setScrollFactor(0, 0, true);
  }
}
