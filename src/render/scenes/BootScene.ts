import Phaser from 'phaser';
import { Z } from '../view';
import { newSeed } from '../../app';

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
    // manók (zöld ruha, hegyes sapka és fül), két változatban
    this.elf('elf', '#2e9b45', '#c8323c');
    this.elf('elf2', '#c8323c', '#2e9b45');
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
    // „Játék”: a főmenü (onnan indítás vagy pályaválasztó)
    else this.scene.start('Menu');
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

  /** Manó: alulról felfelé rajzolva, 40×60-as keretben (talpa a kép alján). */
  private elf(key: string, hat: string, trim: string): void {
    const W = 40;
    const H = 60;
    const c = this.textures.createCanvas(key, Math.ceil(W * Z), Math.ceil(H * Z))!;
    const x = c.getContext();
    x.scale(Z, Z);
    const poly = (pts: number[], fill: string) => {
      x.fillStyle = fill;
      x.beginPath();
      for (let i = 0; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
      x.closePath();
      x.fill();
    };
    // kunkori orrú cipő
    poly([9, 60, 9, 55, 18, 55, 18, 60], '#5a3418');
    poly([22, 60, 22, 55, 31, 55, 31, 60], '#5a3418');
    poly([9, 57, 4, 54, 6, 58], '#5a3418');
    poly([31, 57, 36, 54, 34, 58], '#5a3418');
    // csíkos harisnya
    for (let y = 46; y < 56; y += 4) {
      x.fillStyle = (y / 4) % 2 ? '#ffffff' : trim;
      x.fillRect(11, y, 6, 4);
      x.fillRect(23, y, 6, 4);
    }
    // zöld zubbony cakkos aljjal, öv
    poly([10, 30, 30, 30, 34, 46, 30, 49, 26, 46, 20, 49, 14, 46, 10, 49, 6, 46], '#2e9b45');
    x.fillStyle = '#1f6b30';
    x.fillRect(9, 30, 22, 3);
    x.fillStyle = '#2a1a0e';
    x.fillRect(8, 38, 24, 4);
    x.fillStyle = '#ffd36b';
    x.fillRect(17, 38, 6, 4);
    // karok, kéz
    poly([10, 31, 4, 41, 7, 43, 12, 35], '#2e9b45');
    poly([30, 31, 36, 41, 33, 43, 28, 35], '#2e9b45');
    x.fillStyle = '#f2c9a0';
    x.beginPath();
    x.arc(5.5, 43, 2.5, 0, Math.PI * 2);
    x.arc(34.5, 43, 2.5, 0, Math.PI * 2);
    x.fill();
    // hegyes fül, fej
    poly([10, 22, 2, 15, 11, 26], '#f2c9a0');
    poly([30, 22, 38, 15, 29, 26], '#f2c9a0');
    x.fillStyle = '#f2c9a0';
    x.beginPath();
    x.arc(20, 23, 9.5, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ff9a8a';
    x.beginPath();
    x.arc(14.5, 26, 2, 0, Math.PI * 2);
    x.arc(25.5, 26, 2, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#2a1a0e';
    x.beginPath();
    x.arc(16.5, 22, 1.4, 0, Math.PI * 2);
    x.arc(23.5, 22, 1.4, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#8a3a2a';
    x.lineWidth = 1.2;
    x.beginPath();
    x.arc(20, 25, 3.5, 0.2 * Math.PI, 0.8 * Math.PI);
    x.stroke();
    // hegyes, oldalra konyuló sapka szőrme szegéllyel és csengővel
    poly([9, 17, 31, 17, 28, 9, 35, 4, 22, 6], hat);
    x.fillStyle = '#ffffff';
    x.fillRect(8, 15, 24, 4);
    x.fillStyle = '#ffd36b';
    x.beginPath();
    x.arc(35, 4.5, 2.6, 0, Math.PI * 2);
    x.fill();
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
