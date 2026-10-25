import Phaser from 'phaser';
import { CX, VW, button, txt } from '../view';

export interface PauseActions {
  resume(): void;
  restart(): void;
  toggleMute(): string;
  menu(): void;
}

export class PauseOverlay {
  private c: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, a: PauseActions, muteLabel: string) {
    this.c = scene.add.container(0, 0).setScrollFactor(0).setDepth(3000).setVisible(false);
    this.c.add(scene.add.rectangle(CX, 270, VW, 540, 0x06102a, 0.82).setInteractive());
    this.c.add(txt(scene, CX, 90, '⏸️ Szünet', 44, '#ffffff', { fontStyle: 'bold' }));
    this.c.add(button(scene, CX, 190, '▶ Folytatás', a.resume, { w: 320, h: 66, size: 28 }));
    this.c.add(button(scene, CX, 276, '↻ Újrakezdés', a.restart, { w: 320, h: 60, color: 0xeef4ff }));
    const mute = button(
      scene,
      CX,
      356,
      muteLabel,
      () => (mute.list[1] as Phaser.GameObjects.Text).setText(a.toggleMute()),
      { w: 320, h: 60, color: 0xc9d7f2 },
    );
    this.c.add(mute);
    this.c.add(button(scene, CX, 436, '🏠 Menü', a.menu, { w: 320, h: 60, color: 0xc9d7f2 }));
    this.c.setScrollFactor(0, 0, true);
  }

  get visible(): boolean {
    return this.c.visible;
  }

  setVisible(v: boolean): void {
    this.c.setVisible(v);
  }
}
