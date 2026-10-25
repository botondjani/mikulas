import Phaser from 'phaser';
import { RX, button } from '../view';
import type { MikulasGame } from '../../games/mikulas/game';

/** Pakolás az utcán: csak az „Indulás” gomb; a halom és a szán a téren látszik. */
export class PackOverlay {
  private c: Phaser.GameObjects.Container;
  readonly btn = { x: RX(842), y: 300 };

  constructor(scene: Phaser.Scene, g: MikulasGame) {
    this.c = scene.add.container(0, 0).setDepth(1400);
    this.c.add(button(scene, this.btn.x, this.btn.y, 'Kész, indulás! ▶', () => g.packDone(), { w: 210, h: 50, size: 20 }));
    this.c.setScrollFactor(0, 0, true);
  }

  /** a koordináta a gombra esik-e (a joystick ne induljon el) */
  hit(x: number, y: number): boolean {
    return this.c.visible && Math.abs(x - this.btn.x) < 120 && Math.abs(y - this.btn.y) < 30;
  }

  setVisible(v: boolean): void {
    this.c.setVisible(v);
  }

  update(): void {}
}
