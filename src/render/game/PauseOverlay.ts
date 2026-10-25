import Phaser from 'phaser';
import { CX, VW, button, txt } from '../view';

export interface PauseActions {
  resume(): void;
  restart(): void;
  toggleMute(): string;
  /** hangerő léptetése (100 → 60 → 30 %) */
  cycleVolume(): string;
  toggleVibrate(): string;
  menu(): void;
}

export interface PauseLabels {
  mute: string;
  volume: string;
  vibrate: string;
}

export class PauseOverlay {
  private c: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, a: PauseActions, labels: PauseLabels) {
    this.c = scene.add.container(0, 0).setScrollFactor(0).setDepth(3000).setVisible(false);
    this.c.add(scene.add.rectangle(CX, 270, VW, 540, 0x06102a, 0.85).setInteractive());
    this.c.add(txt(scene, CX, 70, '⏸️ Szünet', 42, '#ffffff', { fontStyle: 'bold' }));
    this.c.add(button(scene, CX, 160, '▶ Folytatás', a.resume, { w: 340, h: 66, size: 28 }));
    this.c.add(button(scene, CX, 240, '↻ Újrakezdés', a.restart, { w: 340, h: 58, color: 0xeef4ff }));
    // a gomb felirata a művelet eredménye
    const toggle = (x: number, y: number, label: string, fn: () => string) => {
      const b = button(scene, x, y, label, () => (b.list[1] as Phaser.GameObjects.Text).setText(fn()), { w: 300, h: 58, size: 22, color: 0xc9d7f2 });
      this.c.add(b);
    };
    toggle(CX - 160, 320, labels.mute, a.toggleMute);
    toggle(CX + 160, 320, labels.volume, a.cycleVolume);
    toggle(CX - 160, 400, labels.vibrate, a.toggleVibrate);
    this.c.add(button(scene, CX + 160, 400, '🏠 Menü', a.menu, { w: 300, h: 58, size: 22, color: 0xc9d7f2 }));
    this.c.setScrollFactor(0, 0, true);
  }

  get visible(): boolean {
    return this.c.visible;
  }

  setVisible(v: boolean): void {
    this.c.setVisible(v);
  }
}
