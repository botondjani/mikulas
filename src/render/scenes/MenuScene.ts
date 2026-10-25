import Phaser from 'phaser';
import { C, VIEW_H, VIEW_W, button, drawSky, setupCamera, toggleFullscreen, txt } from '../view';
import { canFullscreen } from '../../fullscreen';
import { addSnow } from '../fx/pools';
import { isUnlocked, newSeed, params, setMuted, sfx } from '../../app';
import { LEVELS } from '../../games/mikulas/levels';
import { installPrompt } from '../install';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    setupCamera(this);
    drawSky(this, VIEW_W, VIEW_H);
    this.drawVillage();
    addSnow(this);

    // ?level=N: egyenesen a pályára (fejlesztéshez)
    if (params.level && this.registry.get('autostarted') !== true) {
      this.registry.set('autostarted', true);
      this.scene.start('Game', { level: params.level, seed: newSeed() });
      return;
    }

    const santa = txt(this, 480, 104, '🎅', 76);
    this.tweens.add({ targets: santa, y: 96, scaleY: 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    txt(this, 480, 186, 'Mikulás-éjszaka', 54, '#ffffff', { fontStyle: 'bold', stroke: '#7a1d1a', strokeThickness: 8 });
    txt(this, 480, 232, 'Ajándékot vigyél, de senki ne ébredjen fel!', 20, '#ffe7a8');

    const next = [...LEVELS].reverse().find((l) => isUnlocked(l.id)) ?? LEVELS[0];
    button(this, 480, 306, '▶  Indítás', () => this.go(() => this.scene.start('Game', { level: next.id, seed: newSeed() })), {
      w: 300,
      h: 66,
      size: 30,
    });
    button(this, 355, 384, '⭐ Pályák', () => this.go(() => this.scene.start('LevelSelect')), { w: 230, h: 56, color: 0xeef4ff, size: 22 });
    button(
      this,
      605,
      384,
      '🎓 Tanuló kör',
      () => this.go(() => this.scene.start('Game', { level: 1, seed: newSeed(), tutorial: true })),
      { w: 230, h: 56, color: 0xeef4ff, size: 22 },
    );

    const mute = button(
      this,
      355,
      458,
      sfx.isMuted ? '🔇 Hang: ki' : '🔊 Hang: be',
      () => {
        setMuted(!sfx.isMuted);
        (mute.list[1] as Phaser.GameObjects.Text).setText(sfx.isMuted ? '🔇 Hang: ki' : '🔊 Hang: be');
        sfx.play('click');
      },
      { w: 230, h: 50, size: 20, color: 0xc9d7f2 },
    );
    if (canFullscreen())
      button(this, 605, 458, '⛶ Teljes képernyő', () => void toggleFullscreen(), { w: 230, h: 50, size: 20, color: 0xc9d7f2 });

    if (!this.sys.game.device.input.touch)
      txt(this, 480, 522, 'Gép: WASD/nyilak – mozgás · E/Szóköz – művelet · Shift/Q – csendben · P – szünet', 14, '#c9d7f2');
    if (installPrompt.available()) {
      button(this, 820, 40, '📲 Főképernyőre', () => void installPrompt.prompt(), { w: 220, h: 48, size: 20, color: 0xffd36b });
    } else if (installPrompt.isIos() && !canFullscreen()) {
      txt(this, 480, 522, 'iPhone: Megosztás ⬆️ → „Főképernyőhöz adás”', 15, '#c9d7f2');
    }
  }

  private go(fn: () => void): void {
    sfx.unlock();
    sfx.play('click');
    fn();
  }

  private drawVillage(): void {
    const g = this.add.graphics();
    g.fillStyle(0x0e2148, 1);
    g.fillEllipse(200, 560, 700, 200);
    g.fillEllipse(760, 570, 800, 220);
    g.fillStyle(C.snowShade, 0.9);
    g.fillRect(0, 500, VIEW_W, 40);
    const houses = [70, 170, 800, 900];
    for (const x of houses) {
      g.fillStyle(0x1b2c55, 1);
      g.fillRect(x - 34, 452, 68, 50);
      g.fillTriangle(x - 44, 456, x + 44, 456, x, 418);
      g.fillStyle(C.snow, 1);
      g.fillTriangle(x - 44, 456, x + 44, 456, x, 418);
      g.fillStyle(0x1b2c55, 1);
      g.fillTriangle(x - 36, 458, x + 36, 458, x, 428);
      g.fillStyle(C.warm, 0.95);
      g.fillRect(x - 20, 466, 14, 14);
      g.fillRect(x + 6, 466, 14, 14);
    }
  }
}
