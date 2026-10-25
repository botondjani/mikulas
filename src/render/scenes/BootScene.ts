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
    // időjárás és sötétség: nagy, középen átlátszó "fátylak" (nagyra nagyítva, hogy a szélük ne látsszon)
    this.veil('blizzard', '225,232,248', [
      [0.04, 0],
      [0.06, 0.6],
      [0.12, 0.97],
    ]);
    this.veil('fog', '140,150,172', [
      [0.03, 0],
      [0.07, 0.55],
      [0.12, 0.95],
    ]);
    // horror: sötét keret a képernyő szélén
    this.veil('vignette', '0,0,0', [
      [0.24, 0],
      [0.4, 0.55],
      [0.5, 0.85],
    ]);
    const mode = this.registry.get('startMode');
    this.registry.set('startMode', null);
    if (mode === 'tutorial') this.scene.start('Game', { level: 1, seed: newSeed(), tutorial: true });
    else if (mode === 'play' && !params.level) {
      const next = [...LEVELS].reverse().find((l) => isUnlocked(l.id)) ?? LEVELS[0];
      this.scene.start('Game', { level: next.id, seed: newSeed() });
    } else this.scene.start('Menu');
  }

  /** Középen átlátszó, kifelé átlátszatlan kör alakú textúra (a megállók: [sugár 0..0.5, átlátszatlanság]). */
  private veil(key: string, rgb: string, stops: [number, number][]): void {
    const size = 1024;
    const c = this.textures.createCanvas(key, size, size)!;
    const ctx = c.getContext();
    const grd = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grd.addColorStop(0, `rgba(${rgb},0)`);
    for (const [o, a] of stops) grd.addColorStop(o * 2, `rgba(${rgb},${a})`);
    grd.addColorStop(1, `rgba(${rgb},1)`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    c.refresh();
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
