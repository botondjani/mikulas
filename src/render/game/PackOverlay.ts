import Phaser from 'phaser';
import { RX, button } from '../view';
import type { MikulasGame } from '../../games/mikulas/game';

/** Pakolás az utcán: csak az „Indulás” gomb; a halom és a szán a téren látszik. */
export class PackOverlay {
  private c: Phaser.GameObjects.Container;
  readonly btn = { x: RX(790), y: 300 };

  constructor(scene: Phaser.Scene, g: MikulasGame) {
    this.c = scene.add.container(0, 0).setDepth(1400);
    // az indulás már a szán megtolásával történik (sárga gomb a szán végénél); gomb nincs
    void g;
    void button;
    this.c.setScrollFactor(0, 0, true);
  }

  /** a koordináta a gombra esik-e (a joystick ne induljon el) */
  hit(x: number, y: number): boolean {
    void x;
    void y;
    return false;
  }

  setVisible(v: boolean): void {
    this.c.setVisible(v);
  }

  update(): void {}
}
