import Phaser from 'phaser';
import { Z } from '../view';

/**
 * Sötétség egy zónában (pl. áramszünet a gyárban): fekete réteg, amiből a Mikulás körül
 * egy kis folt, zseblámpával pedig a nézési irányba eső fénykúp látszik ki.
 */
export class Darkness {
  readonly rt: Phaser.GameObjects.RenderTexture;
  private brush: Phaser.GameObjects.Graphics;

  /** a sötét réteg a világ (x0, y0, w, h) területét fedi */
  constructor(
    scene: Phaser.Scene,
    private x0: number,
    private y0: number,
    w: number,
    h: number,
    depth: number,
  ) {
    this.rt = scene.add
      .renderTexture(x0, y0, Math.ceil(w * Z), Math.ceil(h * Z))
      .setOrigin(0, 0)
      .setScale(1 / Z)
      .setDepth(depth)
      .setVisible(false);
    this.brush = scene.make.graphics({}, false);
    this.brush.setScale(Z);
  }

  /** (x, y): a Mikulás; dir: amerre néz; lamp: van-e zseblámpája */
  draw(x: number, y: number, dir: number, lamp: boolean, L: { body: number; range: number; half: number }): void {
    const b = this.brush;
    const ox = x - this.x0;
    const oy = y - this.y0;
    b.clear();
    // puha szélek: több, egyre kisebb rétegben "radírozunk"
    for (const [k, a] of [
      [1, 0.35],
      [0.8, 0.35],
      [0.6, 0.5],
    ] as const) {
      b.fillStyle(0xffffff, a).fillCircle(ox, oy - 20, L.body * k);
      if (!lamp) continue;
      const r = L.range * k;
      const h = L.half * (0.6 + 0.4 * k);
      const pts = [{ x: ox + Math.cos(dir) * 10, y: oy - 20 + Math.sin(dir) * 10 }];
      for (let i = 0; i <= 10; i++) {
        const an = dir - h + (2 * h * i) / 10;
        pts.push({ x: ox + Math.cos(an) * r, y: oy - 20 + Math.sin(an) * r });
      }
      b.fillPoints(pts, true);
    }
    this.rt.clear();
    this.rt.fill(0x03060f, 0.97);
    this.rt.erase(b);
    this.rt.setVisible(true);
  }

  hide(): void {
    this.rt.setVisible(false);
  }

  destroy(): void {
    this.brush.destroy();
    this.rt.destroy();
  }
}
