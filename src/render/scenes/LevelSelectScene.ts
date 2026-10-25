import Phaser from 'phaser';
import { C, CX, VIEW_H, VW, button, drawSky, setupCamera, txt } from '../view';
import { addSnow } from '../fx/pools';
import { isUnlocked, newSeed, save, sfx } from '../../app';
import { LEVELS } from '../../games/mikulas/levels';

export class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super('LevelSelect');
  }

  create(): void {
    setupCamera(this);
    drawSky(this, VW, VIEW_H, 11);
    addSnow(this);
    txt(this, CX, 46, 'Válassz éjszakát!', 34, '#ffffff', { fontStyle: 'bold', stroke: '#7a1d1a', strokeThickness: 6 });

    const s = save.get();
    const icons = ['🏘️', '🏡', '🧊', '🏔️', '🌨️', '🐕', '👵', '🎄'];
    // 4 oszlop, 2 sor
    const W = 214;
    const Hc = 196;
    LEVELS.forEach((l, i) => {
      const x = CX + (i % 4 - 1.5) * (W + 14);
      const y = 192 + Math.floor(i / 4) * (Hc + 14);
      const open = isUnlocked(l.id);
      const stars = s.stars[l.id] ?? 0;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(x - W / 2, y - Hc / 2 + 5, W, Hc, 20);
      g.fillStyle(open ? 0x22407e : 0x1a2747, 1);
      g.fillRoundedRect(x - W / 2, y - Hc / 2, W, Hc, 20);
      g.lineStyle(3, open ? C.warm : 0x3a4a70, 1);
      g.strokeRoundedRect(x - W / 2, y - Hc / 2, W, Hc, 20);
      txt(this, x, y - 66, open ? (icons[i] ?? '🏠') : '🔒', 36);
      txt(this, x, y - 28, `${l.id}. ${l.name}`, l.name.length > 14 ? 16 : 19, '#ffffff', { fontStyle: 'bold' });
      txt(this, x, y + 6, l.subtitle, 12, '#c9d7f2', { align: 'center', wordWrap: { width: W - 24 } });
      txt(this, x, y + 40, `${l.houses.length} ház`, 14, '#ffe7a8');
      txt(this, x, y + 66, '★'.repeat(stars) + '☆'.repeat(3 - stars), 26, stars ? '#ffd36b' : '#5a6a90');
      if (s.best[l.id] !== undefined) txt(this, x, y + 88, `Legjobb: ${s.best[l.id]}`, 12, '#c9d7f2');
      else if (!open) txt(this, x, y + 88, 'Előbb az előzőt, 1 csillaggal', 11, '#8a9ac0');
      if (open) {
        const zone = this.add.zone(x, y, W, Hc).setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => {
          sfx.unlock();
          sfx.play('click');
          this.scene.start('Game', { level: l.id, seed: newSeed() });
        });
      }
    });
    button(this, 90, 46, '◀ Vissza', () => this.scene.start('Menu'), { w: 140, h: 44, size: 18, color: 0xc9d7f2 });
  }
}
