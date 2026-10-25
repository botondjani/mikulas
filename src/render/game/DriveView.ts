import Phaser from 'phaser';
import { C, CX, Z, emo, txt } from '../view';
import { PopupPool, RipplePool } from '../fx/pools';
import { drawGroundObstacle } from './StreetView';
import type { MikulasGame } from '../../games/mikulas/game';
import type { Vec } from '../../core/geom';

const CHUNK = 1300;

/** A szánút a gyárból a faluig: havas táj, akadályok, csillagok, a szán a rénszarvasokkal. */
export class DriveView {
  readonly layer: Phaser.GameObjects.Layer;
  readonly ripples: RipplePool;
  readonly popups: PopupPool;
  private dyn: Phaser.GameObjects.Graphics;
  private stars = new Map<Vec, Phaser.GameObjects.Text>();
  private santa: Phaser.GameObjects.Text;
  private deer: Phaser.GameObjects.Text[] = [];
  private bar: Phaser.GameObjects.Graphics;
  private sledIcon: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    private g: MikulasGame,
  ) {
    const R = g.road;
    this.layer = scene.add.layer();
    // statikus háttér darabokban sütve (egy textúra ne legyen túl széles)
    const gr = scene.add.graphics();
    this.drawStatic(gr);
    gr.setScale(Z);
    for (let x = 0; x < R.w; x += CHUNK) {
      const rt = scene.add.renderTexture(x, 0, CHUNK * Z, 540 * Z).setOrigin(0, 0).setScale(1 / Z).setDepth(0);
      rt.draw(gr, -x * Z, 0);
      this.layer.add(rt);
    }
    gr.destroy();

    for (const o of R.obstacles) {
      const e = { pine: '🌲', snowman: '⛄' }[o.kind as string];
      if (e) this.layer.add(emo(scene, o.rect.x + o.rect.w / 2, o.rect.y + o.rect.h / 2 - 8, e, 46).setDepth(o.rect.y + o.rect.h));
    }
    // díszfák az út szélén (nem akadályok)
    for (let x = 120; x < R.w; x += 170) {
      this.layer.add(emo(scene, x + ((x * 7) % 60), R.band.y - 30, '🌲', 34).setDepth(R.band.y - 10).setAlpha(0.9));
      this.layer.add(emo(scene, x + 80 + ((x * 3) % 50), R.band.y + R.band.h + 40, '🌲', 38).setDepth(R.band.y + R.band.h + 60));
    }
    this.layer.add(emo(scene, 90, R.start.y - 10, '🏭', 110).setDepth(R.start.y + 60));
    this.layer.add(emo(scene, R.finishX + 120, R.start.y - 10, '🏘️', 110).setDepth(R.start.y + 60));
    this.layer.add(
      txt(scene, R.finishX + 120, R.band.y - 18, 'Falu', 20, '#ffe7a8', { fontStyle: 'bold', stroke: '#3a1a0a', strokeThickness: 4 }).setDepth(900),
    );

    for (const s of R.stars) {
      const t = emo(scene, s.x, s.y, '⭐', 28).setDepth(s.y);
      this.stars.set(s, t);
      this.layer.add(t);
    }

    this.dyn = scene.add.graphics().setDepth(2);
    this.layer.add(this.dyn);
    for (let i = 0; i < 2; i++) {
      const t = emo(scene, 0, 0, '🦌', 40).setFlipX(true);
      this.deer.push(t);
      this.layer.add(t);
    }
    this.santa = emo(scene, 0, 0, '🎅', 44).setOrigin(0.5, 0.85);
    this.layer.add(this.santa);
    this.ripples = new RipplePool(scene, this.layer);
    this.popups = new PopupPool(scene, this.layer);

    // haladás-sáv (képernyő-térben)
    this.bar = scene.add.graphics().setScrollFactor(0).setDepth(1150);
    this.sledIcon = emo(scene, 0, 0, '🛷', 24).setScrollFactor(0).setDepth(1151);
    this.layer.add([this.bar, this.sledIcon]);
    this.layer.add(emo(scene, CX - 168, 514, '🏭', 20).setScrollFactor(0).setDepth(1151));
    this.layer.add(emo(scene, CX + 168, 514, '🏘️', 20).setScrollFactor(0).setDepth(1151));
  }

  destroy(): void {
    this.layer.destroy(true);
  }

  private drawStatic(gr: Phaser.GameObjects.Graphics): void {
    const R = this.g.road;
    const B = R.band;
    gr.fillStyle(0xbfcbe6, 1).fillRect(0, 0, R.w, 540);
    // halvány hóbuckák a mezőn
    for (let x = 0; x < R.w; x += 90) {
      gr.fillStyle(0xd3ddf2, 1).fillEllipse(x + ((x * 13) % 40), 60 + ((x * 7) % 50), 120, 30);
      gr.fillStyle(0xd3ddf2, 1).fillEllipse(x + 40, 480 + ((x * 11) % 40), 140, 34);
    }
    // az út: kitaposott hó, nyomvonalakkal
    gr.fillStyle(0xe6edfb, 1).fillRect(0, B.y, R.w, B.h);
    gr.fillStyle(0xa9b6d6, 1).fillRect(0, B.y - 6, R.w, 6).fillRect(0, B.y + B.h, R.w, 6);
    gr.lineStyle(2, 0xcdd7ee, 1);
    for (const y of [B.y + B.h * 0.3, B.y + B.h * 0.7]) gr.lineBetween(0, y, R.w, y);
    for (const o of R.obstacles) drawGroundObstacle(gr, o);
    // cél: kockás vonal
    for (let y = B.y, k = 0; y < B.y + B.h; y += 20, k++) {
      gr.fillStyle(k % 2 ? 0x222222 : 0xffffff, 1).fillRect(R.finishX, y, 20, 20);
      gr.fillStyle(k % 2 ? 0xffffff : 0x222222, 1).fillRect(R.finishX + 20, y, 20, 20);
    }
  }

  update(dt: number, time: number): void {
    const g = this.g;
    const R = g.road;
    const p = g.player;
    const d = this.dyn;
    d.clear();

    // felvett csillagok eltűnnek
    const left = new Set(R.stars);
    for (const [s, t] of this.stars) {
      if (!left.has(s)) {
        t.destroy();
        this.stars.delete(s);
      } else t.setScale(1 + 0.12 * Math.sin(time * 0.008 + s.x));
    }

    // a szán: rázkódik ütközéskor
    const shake = g.driveBump > 0 ? Math.sin(time * 0.09) * 6 * g.driveBump : 0;
    const x = p.x + shake;
    const y = p.y + Math.sin(time * 0.02) * 1.5 * p.speed01;
    // sebesség-csíkok
    if (p.speed01 > 0.5) {
      d.lineStyle(2, 0xffffff, (p.speed01 - 0.5) * 1.6);
      for (let i = 0; i < 4; i++) {
        const ly = y - 20 + i * 14;
        const lx = x - 70 - ((time * 0.6 + i * 37) % 60);
        d.lineBetween(lx, ly, lx - 40 * p.speed01, ly);
      }
    }
    d.fillStyle(0x000000, 0.2).fillEllipse(x + 30, y + 22, 170, 22);
    // szán test + talpak
    d.fillStyle(0xe0b040, 1).fillRect(x - 46, y + 14, 92, 5);
    d.fillStyle(C.red, 1).fillRoundedRect(x - 42, y - 14, 84, 30, 10);
    d.lineStyle(2, 0xe0b040, 1).strokeRoundedRect(x - 40, y - 12, 80, 26, 9);
    this.santa.setPosition(x - 8, y + 4).setDepth(y + 20);
    // rénszarvasok előtte, a gyeplővel
    this.deer.forEach((t, i) => {
      const dx = x + 70 + i * 52;
      const dy = y + 4 + Math.sin(time * 0.02 * (0.5 + p.speed01) + i * 2) * 3;
      t.setPosition(dx, dy).setDepth(y + 20);
    });
    d.lineStyle(1.5, 0x5a3a1a, 1).lineBetween(x + 30, y - 4, x + 120, y - 6);

    // haladás-sáv felül
    const bw = 300;
    const bx = CX - bw / 2;
    const by = 516;
    const pr = Math.max(0, Math.min(1, (p.x - R.start.x) / (R.finishX - R.start.x)));
    this.bar.clear();
    this.bar.fillStyle(0x06102a, 0.6).fillRoundedRect(bx - 34, by - 16, bw + 68, 32, 14);
    this.bar.fillStyle(0xffffff, 0.25).fillRoundedRect(bx, by - 4, bw, 8, 4);
    this.bar.fillStyle(0x5ad17a, 1).fillRoundedRect(bx, by - 4, Math.max(8, bw * pr), 8, 4);
    this.sledIcon.setPosition(bx + bw * pr, by - 2);

    this.ripples.update(dt);
    this.popups.update(dt);
  }
}
