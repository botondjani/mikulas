import Phaser from 'phaser';
import { CX, VW, emo } from '../view';
import { sfx, vibrate } from '../../app';
import { Rng } from '../../core/rng';
import { STREET, isHouse } from '../../games/mikulas/types';
import type { MikulasGame } from '../../games/mikulas/game';
import { policeChasing } from '../../games/mikulas/agents/police';

/**
 * Horror mód (csak megjelenítés és hang, a játékszabályok ugyanazok): sötétebb kép,
 * véletlen ijesztések (arc, áramszünet, dörömbölés), üldözéskor kék-piros villogás,
 * a Krampusz közelében szívdobogás, és a Krampusz gyilkos jelenete. Rezgéssel.
 */
export class HorrorFx {
  private D = 1180;
  private tint: Phaser.GameObjects.Rectangle;
  private vignette: Phaser.GameObjects.Image;
  private flash: Phaser.GameObjects.Rectangle;
  private black: Phaser.GameObjects.Rectangle;
  private face: Phaser.GameObjects.Text;
  private rng: Rng;
  private next: number;
  private scare = 0;
  private scareKind: 'face' | 'blackout' | 'bang' = 'face';
  private beatT = 0;
  private murder = false;

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
  ) {
    const fix = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T, d: number): T => {
      o.setScrollFactor(0);
      o.setDepth(this.D + d);
      return o;
    };
    this.tint = fix(scene.add.rectangle(CX, 270, VW, 540, 0x220000, 0.22), 0);
    this.vignette = fix(scene.add.image(CX, 270, 'vignette').setDisplaySize(VW * 1.25, VW * 1.25), 1);
    this.flash = fix(scene.add.rectangle(CX, 270, VW, 540, 0xff0000, 0), 3);
    this.black = fix(scene.add.rectangle(CX, 270, VW, 540, 0x000000, 0), 2);
    this.face = fix(emo(scene, CX, 270, '👹', 260).setVisible(false), 4);
    this.rng = new Rng(g.seed).fork(77);
    this.next = this.rng.range(25, 45);
    g.events.on('gameOver', (e) => {
      if (e.reason === 'krampus') this.startMurder();
      else if (e.reason === 'time') vibrate([300, 100, 300, 100, 600]);
      else vibrate([120, 80, 120]);
    });
  }

  /** Ijesztés indítása (a pálya során véletlenszerűen). */
  private startScare(): void {
    const p = this.g.player;
    const kinds: ('face' | 'blackout' | 'bang')[] = isHouse(p.zone) ? ['face', 'blackout', 'bang'] : ['face', 'bang'];
    this.scareKind = this.rng.pick(kinds);
    this.scare = this.scareKind === 'blackout' ? 1.6 : this.scareKind === 'bang' ? 1.2 : 1;
    const cam = this.scene.cameras.main;
    if (this.scareKind === 'face') {
      this.face.setText(this.rng.pick(['👹', '💀', '👁️', '🤡', '👻'])).setVisible(true).setScale(0.1).setAlpha(1);
      this.face.setPosition(CX + this.rng.range(-200, 200), 270 + this.rng.range(-60, 60));
      sfx.play('jumpscare');
      cam.shake(450, 0.02);
      vibrate([250, 60, 350]);
    } else if (this.scareKind === 'blackout') {
      sfx.play('powerDown');
      sfx.play('bang');
      vibrate([80, 120, 80, 120, 80]);
    } else {
      sfx.play('bang');
      cam.shake(300, 0.012);
      vibrate([90, 140, 90, 140, 90]);
    }
  }

  private startMurder(): void {
    this.murder = true;
    this.face.setText('👹').setVisible(true).setScale(0.15).setAlpha(1).setPosition(CX, 280);
    sfx.play('murder');
    this.scene.cameras.main.shake(900, 0.03);
    vibrate([700, 100, 400]);
  }

  update(dt: number, time: number): void {
    const g = this.g;
    const p = g.player;

    if (this.murder) {
      // a Krampusz arca betölti a képet, piros villanások, majd sötét
      const t = g.over?.t ?? 3;
      this.black.setAlpha(Math.min(1, t * 2));
      this.face.setScale(0.15 + Math.min(1, t * 1.5) * 2).setAngle(Math.sin(time * 0.05) * 6);
      this.flash.setFillStyle(0xff0000, t < 1.4 && Math.floor(t * 5) % 2 === 0 ? 0.55 : 0);
      if (t > 2) this.face.setAlpha(Math.max(0, 1 - (t - 2) * 2));
      return;
    }

    // véletlen ijesztések a faluban
    const playing = (g.phase === 'deliver' || g.phase === 'dawn') && !g.over && !g.clockFrozen;
    if (playing && this.scare <= 0) {
      this.next -= dt;
      if (this.next <= 0) {
        this.next = this.rng.range(30, 60);
        this.startScare();
      }
    }
    if (this.scare > 0) {
      this.scare -= dt;
      if (this.scareKind === 'face') {
        const k = 1 - this.scare;
        this.face.setScale(0.1 + Math.min(1, k * 5) * 1.6).setAlpha(this.scare < 0.5 ? this.scare * 2 : 1);
        this.flash.setFillStyle(0xff0000, k < 0.25 ? 0.45 : 0);
      } else if (this.scareKind === 'blackout') {
        this.black.setAlpha(this.scare > 0.4 ? 1 : this.scare / 0.4);
        if (Math.abs(this.scare - 0.9) < dt) sfx.play('bang');
      } else if (Math.abs(this.scare - 0.6) < dt || Math.abs(this.scare - 0.3) < dt) sfx.play('bang');
      if (this.scare <= 0) {
        this.face.setVisible(false);
        this.black.setAlpha(0);
        this.flash.setFillStyle(0xff0000, 0);
      }
      return;
    }

    // rendőrök üldöznek: kék-piros villogás (lassú, legfeljebb ~2,5 váltás/mp)
    if (policeChasing(g)) {
      const blue = Math.floor(time / 400) % 2 === 0;
      this.flash.setFillStyle(blue ? 0x2a5aff : 0xff2a2a, 0.2);
    } else this.flash.setFillStyle(0xff0000, 0);

    // a Krampusz közelében szívdobogás
    const k = g.krampus;
    if (k.active && p.zone === STREET && !g.over) {
      const d = Math.hypot(k.x - p.x, k.y - p.y);
      if (d < 360) {
        this.beatT -= dt;
        if (this.beatT <= 0) {
          this.beatT = 0.45 + (d / 360) * 0.6;
          sfx.play('heartbeat');
          vibrate([40, 90, 40]);
        }
      }
    }
    this.tint.setAlpha(0.22 + (k.active && k.mode === 'chase' ? 0.1 + 0.05 * Math.sin(time * 0.01) : 0));
    void this.vignette;
  }
}
