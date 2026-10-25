import Phaser from 'phaser';
import { Z } from '../view';
import { isUnlocked, newSeed, params } from '../../app';
import { LEVELS } from '../../games/mikulas/levels';

/** Minden textúra kódból készül, nincs külső kép. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.radial('flake', 8, [
      [0, 'rgba(255,255,255,1)'],
      [0.5, 'rgba(255,255,255,0.8)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    this.radial('smoke', 24, [
      [0, 'rgba(220,228,245,0.55)'],
      [1, 'rgba(220,228,245,0)'],
    ]);
    this.radial('glow', 128, [
      [0, 'rgba(255,214,120,0.9)'],
      [0.4, 'rgba(255,190,90,0.35)'],
      [1, 'rgba(255,170,60,0)'],
    ]);
    this.radial('lamp', 128, [
      [0, 'rgba(255,230,170,0.55)'],
      [1, 'rgba(255,230,170,0)'],
    ]);
    this.star('spark', 10);
    // hóvihar: középen átlátszó, kifelé fehéresszürke
    const size = 1024;
    const c = this.textures.createCanvas('blizzard', size, size)!;
    const ctx = c.getContext();
    const grd = ctx.createRadialGradient(size / 2, size / 2, 40, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(225,232,248,0)');
    grd.addColorStop(0.16, 'rgba(225,232,248,0.6)');
    grd.addColorStop(0.32, 'rgba(225,232,248,0.97)');
    grd.addColorStop(1, 'rgba(225,232,248,1)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    c.refresh();
    // köd: kis tiszta folt a Mikulás körül, kifelé sűrű szürke
    const fc = this.textures.createCanvas('fog', size, size)!;
    const fctx = fc.getContext();
    const fg = fctx.createRadialGradient(size / 2, size / 2, 30, size / 2, size / 2, size / 2);
    fg.addColorStop(0, 'rgba(150,160,180,0)');
    fg.addColorStop(0.14, 'rgba(150,160,180,0.55)');
    fg.addColorStop(0.3, 'rgba(140,150,172,0.96)');
    fg.addColorStop(1, 'rgba(140,150,172,1)');
    fctx.fillStyle = fg;
    fctx.fillRect(0, 0, size, size);
    fc.refresh();
    const mode = this.registry.get('startMode');
    this.registry.set('startMode', null);
    if (mode === 'tutorial') this.scene.start('Game', { level: 1, seed: newSeed(), tutorial: true });
    else if (mode === 'play' && !params.level) {
      const next = [...LEVELS].reverse().find((l) => isUnlocked(l.id)) ?? LEVELS[0];
      this.scene.start('Game', { level: next.id, seed: newSeed() });
    } else this.scene.start('Menu');
  }

  private radial(key: string, r: number, stops: [number, string][]): void {
    const s = Math.ceil(r * 2 * Z);
    const c = this.textures.createCanvas(key, s, s)!;
    const ctx = c.getContext();
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    for (const [o, col] of stops) g.addColorStop(o, col);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    c.refresh();
  }

  private star(key: string, r: number): void {
    const s = Math.ceil(r * 2 * Z);
    const c = this.textures.createCanvas(key, s, s)!;
    const ctx = c.getContext();
    ctx.translate(s / 2, s / 2);
    ctx.fillStyle = '#fff6c8';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = (i % 2 ? 0.4 : 1) * (s / 2);
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.fill();
    c.refresh();
  }
}
