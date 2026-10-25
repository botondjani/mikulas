import Phaser from 'phaser';
import { Z, txt } from '../view';

/** Zaj-hullámok: előre lefoglalt körök, nincs futás közbeni foglalás. */
export class RipplePool {
  private items: { g: Phaser.GameObjects.Graphics; t: number; max: number; x: number; y: number; color: number }[] = [];

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Layer, size = 10) {
    for (let i = 0; i < size; i++) {
      const g = scene.add.graphics();
      g.setVisible(false);
      parent.add(g);
      this.items.push({ g, t: 1, max: 0, x: 0, y: 0, color: 0xffffff });
    }
  }

  spawn(x: number, y: number, radius: number, color = 0xffffff): void {
    const it = this.items.find((i) => i.t >= 1) ?? this.items[0];
    Object.assign(it, { t: 0, max: radius, x, y, color });
    it.g.setVisible(true);
  }

  update(dt: number): void {
    for (const it of this.items) {
      if (it.t >= 1) continue;
      it.t = Math.min(1, it.t + dt * 1.6);
      const g = it.g;
      g.clear();
      if (it.t >= 1) {
        g.setVisible(false);
        continue;
      }
      g.lineStyle(3, it.color, (1 - it.t) * 0.8);
      g.strokeCircle(it.x, it.y, 10 + it.max * it.t);
      g.lineStyle(2, it.color, (1 - it.t) * 0.4);
      g.strokeCircle(it.x, it.y, 4 + it.max * 0.6 * it.t);
    }
  }
}

/** Lebegő pontszám-feliratok. */
export class PopupPool {
  private items: { t: Phaser.GameObjects.Text; life: number }[] = [];

  constructor(scene: Phaser.Scene, parent: Phaser.GameObjects.Layer, size = 8) {
    for (let i = 0; i < size; i++) {
      const t = txt(scene, 0, 0, '', 26, '#ffffff', { fontStyle: 'bold', stroke: '#06102a', strokeThickness: 5 });
      t.setVisible(false).setDepth(5000);
      parent.add(t);
      this.items.push({ t, life: 0 });
    }
  }

  spawn(x: number, y: number, text: string, color: string): void {
    const it = this.items.find((i) => i.life <= 0) ?? this.items[0];
    it.life = 1.4;
    it.t.setText(text).setColor(color).setPosition(x, y).setVisible(true).setAlpha(1).setScale(0.6);
  }

  update(dt: number): void {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      it.t.y -= 40 * dt;
      it.t.setScale(Math.min(1, it.t.scale + dt * 4));
      it.t.setAlpha(Math.min(1, it.life * 2));
      if (it.life <= 0) it.t.setVisible(false);
    }
  }
}

/** Hópelyhek a képernyőn (képernyő-térben). */
export function addSnow(scene: Phaser.Scene, depth = 800): Phaser.GameObjects.Particles.ParticleEmitter {
  const e = scene.add.particles(0, 0, 'flake', {
    x: { min: -40, max: 1000 },
    y: -10,
    lifespan: 9000,
    speedY: { min: 18, max: 46 },
    speedX: { min: -12, max: 12 },
    scale: { min: 0.35 / Z, max: 1 / Z },
    alpha: { min: 0.35, max: 0.9 },
    frequency: 110,
    maxParticles: 120,
  });
  e.setScrollFactor(0).setDepth(depth);
  e.fastForward(8000);
  return e;
}
