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
    txt(this, CX, 52, 'Válassz éjszakát!', 40, '#ffffff', { fontStyle: 'bold', stroke: '#7a1d1a', strokeThickness: 6 });

    const s = save.get();
    LEVELS.forEach((l, i) => {
      const x = CX - 300 + i * 300;
      const y = 270;
      const open = isUnlocked(l.id);
      const stars = s.stars[l.id] ?? 0;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3);
      g.fillRoundedRect(x - 128, y - 150 + 6, 256, 300, 24);
      g.fillStyle(open ? 0x22407e : 0x1a2747, 1);
      g.fillRoundedRect(x - 128, y - 150, 256, 300, 24);
      g.lineStyle(3, open ? C.warm : 0x3a4a70, 1);
      g.strokeRoundedRect(x - 128, y - 150, 256, 300, 24);
      txt(this, x, y - 105, open ? ['🏘️', '🏡', '🏔️'][i] ?? '🏠' : '🔒', 56);
      txt(this, x, y - 40, `${l.id}. ${l.name}`, 28, '#ffffff', { fontStyle: 'bold' });
      txt(this, x, y - 6, l.subtitle, 16, '#c9d7f2', { align: 'center', wordWrap: { width: 220 } });
      txt(this, x, y + 30, `${l.houses.length} ház`, 18, '#ffe7a8');
      txt(this, x, y + 72, '★'.repeat(stars) + '☆'.repeat(3 - stars), 40, stars ? '#ffd36b' : '#5a6a90');
      if (s.best[l.id] !== undefined) txt(this, x, y + 112, `Legjobb: ${s.best[l.id]} pont`, 16, '#c9d7f2');
      else if (!open) txt(this, x, y + 112, 'Előbb az előzőt, 1 csillaggal', 15, '#8a9ac0');
      if (open) {
        const zone = this.add.zone(x, y, 256, 300).setInteractive({ useHandCursor: true });
        zone.on('pointerup', () => {
          sfx.unlock();
          sfx.play('click');
          this.scene.start('Game', { level: l.id, seed: newSeed() });
        });
      }
    });
    button(this, 110, 500, '◀ Vissza', () => this.scene.start('Menu'), { w: 170, h: 52, size: 22, color: 0xc9d7f2 });
  }
}
