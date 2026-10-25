import Phaser from 'phaser';
import { C, Z, bake, emo, img, txt } from '../view';
import { PopupPool, RipplePool } from '../fx/pools';
import { icon } from '../../games/mikulas/types';
import type { MikulasGame, HouseState } from '../../games/mikulas/game';
import { rayRect, type Rect } from '../../core/geom';

/** Egy ház belseje kimetszett alaprajzként. Belépéskor épül fel. */
export class InteriorView {
  readonly layer: Phaser.GameObjects.Layer;
  readonly ripples: RipplePool;
  readonly popups: PopupPool;
  private dyn: Phaser.GameObjects.Graphics;
  private player: Phaser.GameObjects.Text;
  private carry: Phaser.GameObjects.Text;
  private pocket: Phaser.GameObjects.Text;
  private child: Phaser.GameObjects.Text;
  private zzz: Phaser.GameObjects.Text;
  private grandpa?: Phaser.GameObjects.Text;
  private gpZzz?: Phaser.GameObjects.Text;
  private gift: Phaser.GameObjects.Text;
  private bootCandy: Phaser.GameObjects.Text;
  private bells: Phaser.GameObjects.Text[] = [];
  private fire: Phaser.GameObjects.Text;
  private fireGlow: Phaser.GameObjects.Image;
  private lights: Phaser.GameObjects.Graphics;
  private targetLabel: Phaser.GameObjects.Text;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;
  private walkT = 0;
  private conePts: number[] = [];

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
    readonly house: HouseState,
  ) {
    const it = house.interior;
    this.layer = scene.add.layer();
    const bg = scene.add.graphics();
    this.drawStatic(bg);
    this.layer.add(bake(scene, bg, 960, 540).setDepth(0));

    this.fireGlow = img(scene, it.fireplace.x + 60, it.fireplace.y + 50, 'glow', 2).setBlendMode(Phaser.BlendModes.ADD).setDepth(1);
    this.fire = emo(scene, it.fireplace.x + 60, it.fireplace.y + 24, '🔥', 30).setDepth(2);
    const tree = emo(scene, it.tree.x + it.tree.w / 2, it.tree.y + 30, '🎄', 104).setDepth(it.tree.y + it.tree.h);
    this.lights = scene.add.graphics().setDepth(it.tree.y + it.tree.h + 1);
    this.gift = emo(scene, it.treeSpot.x, it.treeSpot.y - 4, '', 34).setDepth(it.treeSpot.y);
    const boot = emo(scene, it.bootSpot.x - 20, it.bootSpot.y + 4, '🥾', 30).setDepth(60);
    this.bootCandy = emo(scene, it.bootSpot.x - 8, it.bootSpot.y - 14, '🍬', 18).setDepth(61).setVisible(false);
    this.layer.add([this.fireGlow, this.fire, tree, this.lights, this.gift, boot, this.bootCandy]);
    this.layer.add(emo(scene, it.toybox.x + 32, it.toybox.y + 22, '🧩', 26).setDepth(it.toybox.y + 50));

    // álombuborék: mit kért a gyerek
    const dream = scene.add.graphics().setDepth(70);
    dream.fillStyle(0xffffff, 0.92).fillCircle(706, 128, 30).fillCircle(742, 160, 7).fillCircle(752, 172, 4);
    this.layer.add([dream, emo(scene, 706, 128, icon(house.def.wish), 34).setDepth(71)]);
    this.child = emo(scene, it.childBed.x, it.childBed.y, '😴', 40).setDepth(it.bed.y + 40);
    this.zzz = txt(scene, it.childBed.x + 30, it.childBed.y - 30, 'z', 22, '#c9d7f2', { fontStyle: 'bold' }).setDepth(900);
    this.layer.add([this.child, this.zzz]);
    if (house.grandpa) {
      this.grandpa = emo(scene, house.grandpa.x, house.grandpa.y - 6, '👴', 44).setDepth(it.armchair.y + 70);
      this.gpZzz = txt(scene, house.grandpa.x + 28, house.grandpa.y - 40, '💤', 22).setDepth(901);
      this.layer.add([this.grandpa, this.gpZzz]);
    }
    for (let i = 0; i < 3; i++) {
      const b = emo(scene, 0, 0, '🔔', 26).setVisible(false).setDepth(800);
      this.bells.push(b);
      this.layer.add(b);
    }

    this.dyn = scene.add.graphics().setDepth(5);
    this.player = emo(scene, 0, 0, '🎅', 60).setOrigin(0.5, 0.85);
    this.carry = emo(scene, 0, 0, '', 32);
    this.pocket = emo(scene, 0, 0, '', 22);
    this.targetLabel = txt(scene, 0, 0, '', 20, '#3a2200', {
      backgroundColor: '#ffd36b',
      padding: { x: 8, y: 4 },
      fontStyle: 'bold',
    }).setDepth(4000);
    this.burst = scene.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 170 },
      lifespan: 900,
      scale: { start: 3 / Z, end: 0 },
      gravityY: 160,
      emitting: false,
    });
    this.burst.setDepth(4500);
    this.layer.add([this.dyn, this.player, this.carry, this.pocket, this.targetLabel, this.burst]);
    this.ripples = new RipplePool(scene, this.layer);
    this.popups = new PopupPool(scene, this.layer);
  }

  destroy(): void {
    this.layer.destroy(true);
  }

  burstAt(x: number, y: number): void {
    this.burst.explode(30, x, y);
  }

  private drawStatic(gr: Phaser.GameObjects.Graphics): void {
    const it = this.house.interior;
    // sötét keret: a ház kimetszve
    gr.fillStyle(0x06102a, 1);
    gr.fillRect(0, 0, 960, 540);
    // nappali: fapadló
    const L = it.living;
    gr.fillStyle(0x9a6a46, 1);
    gr.fillRect(L.x, L.y, L.w, L.h);
    gr.lineStyle(1, 0x7d5236, 0.8);
    for (let y = L.y + 22; y < L.y + L.h; y += 22) gr.lineBetween(L.x, y, L.x + L.w, y);
    for (let y = L.y; y < L.y + L.h; y += 22)
      for (let x = L.x + ((y / 22) % 2 ? 40 : 90); x < L.x + L.w; x += 120) gr.lineBetween(x, y, x, y + 22);
    // szőnyeg
    gr.fillStyle(0x8a2f3a, 1);
    gr.fillRoundedRect(220, 250, 240, 140, 18);
    gr.lineStyle(4, 0xd9a441, 0.8);
    gr.strokeRoundedRect(232, 262, 216, 116, 12);
    // gyerekszoba: szőnyegpadló
    const K = it.kidroom;
    gr.fillStyle(0x5f7fb8, 1);
    gr.fillRect(K.x, K.y, K.w, K.h);
    gr.fillStyle(0x6a8cc6, 1);
    for (let x = K.x + 10; x < K.x + K.w; x += 40) for (let y = K.y + 10; y < K.y + K.h; y += 40) gr.fillCircle(x, y, 3);
    // nyikorgó padlólapok (halványan látszanak)
    for (const c of it.creaks) {
      gr.fillStyle(0xb08058, 1);
      gr.fillRect(c.x, c.y, c.w, c.h);
      gr.lineStyle(1, 0x5e3a22, 0.9);
      gr.lineBetween(c.x + 10, c.y + 8, c.x + 22, c.y + 14);
      gr.lineBetween(c.x + 22, c.y + 14, c.x + 30, c.y + 10);
    }
    // külső falak
    gr.fillStyle(0x3a2a22, 1);
    const B = it.bounds;
    gr.fillRect(B.x - 16, B.y - 16, B.w + 32, 16);
    gr.fillRect(B.x - 16, B.y + B.h, B.w + 32, 16);
    gr.fillRect(B.x - 16, B.y - 16, 16, B.h + 32);
    gr.fillRect(B.x + B.w, B.y - 16, 16, B.h + 32);
    for (const w of it.walls) this.wall(gr, w);
    // ablak a csizmánál és a gyerekszobában (holdfény)
    gr.fillStyle(0x9ec4ff, 1);
    gr.fillRect(690, B.y - 14, 68, 12);
    gr.fillRect(B.x - 14, it.bootSpot.y - 34, 12, 68);
    gr.fillStyle(0xffffff, 0.12);
    gr.fillTriangle(690, B.y, 758, B.y, 764, B.y + 110);
    gr.fillTriangle(B.x, it.bootSpot.y - 34, B.x, it.bootSpot.y + 34, B.x + 110, it.bootSpot.y + 40);
    // ajtó
    gr.fillStyle(0x6b4024, 1);
    gr.fillRect(it.doorSpot.x - 34, B.y + B.h, 68, 16);
    gr.fillStyle(0xd9a441, 1);
    gr.fillCircle(it.doorSpot.x + 22, B.y + B.h + 8, 3);
    // kandalló
    const F = it.fireplace;
    gr.fillStyle(0x7d7d88, 1);
    gr.fillRect(F.x, F.y - 10, F.w, F.h + 10);
    gr.fillStyle(0x5f5f6a, 1);
    for (let x = F.x; x < F.x + F.w; x += 20) gr.fillRect(x + 2, F.y - 8, 16, 8);
    gr.fillStyle(0x1a0c08, 1);
    gr.fillRect(F.x + 30, F.y + 8, 60, F.h - 8);
    // fotel
    if (this.house.grandpa) {
      const A = it.armchair;
      gr.fillStyle(0x2f5d4a, 1);
      gr.fillRoundedRect(A.x, A.y, A.w, A.h, 14);
      gr.fillStyle(0x3f7a60, 1);
      gr.fillRoundedRect(A.x + 10, A.y + 8, A.w - 20, A.h - 18, 10);
    }
    // ágy
    const Bd = it.bed;
    gr.fillStyle(0x6b4024, 1);
    gr.fillRoundedRect(Bd.x - 4, Bd.y - 4, Bd.w + 8, Bd.h + 8, 10);
    gr.fillStyle(0xffffff, 1);
    gr.fillRoundedRect(Bd.x + 18, Bd.y + 6, Bd.w - 36, 34, 10);
    gr.fillStyle(0xd94b6a, 1);
    gr.fillRoundedRect(Bd.x + 4, Bd.y + 52, Bd.w - 8, Bd.h - 56, 8);
    gr.fillStyle(0xf07a94, 1);
    for (let x = Bd.x + 16; x < Bd.x + Bd.w - 8; x += 24) gr.fillCircle(x, Bd.y + 90, 5);
    // játékláda
    gr.fillStyle(0xc0853c, 1);
    gr.fillRoundedRect(it.toybox.x, it.toybox.y, it.toybox.w, it.toybox.h, 6);
    // kijárat-jelek
    gr.fillStyle(0xffd36b, 0.2);
    gr.fillCircle(it.doorSpot.x, it.doorSpot.y, 30);
    gr.fillCircle(it.fireSpot.x, it.fireSpot.y, 30);
    // fenyő alatti hely
    gr.fillStyle(0xffffff, 0.12);
    gr.fillEllipse(it.treeSpot.x, it.treeSpot.y + 6, 80, 26);
    // szobanevek
    this.layer.add(txt(this.scene, 300, 528, `${this.house.idx + 1}. ház · nappali`, 15, '#c9d7f2').setDepth(1));
    this.layer.add(txt(this.scene, 734, 528, `${this.house.def.child} szobája`, 15, '#c9d7f2').setDepth(1));
  }

  private wall(gr: Phaser.GameObjects.Graphics, w: Rect): void {
    gr.fillStyle(0x3a2a22, 1);
    gr.fillRect(w.x, w.y, w.w, w.h);
    gr.fillStyle(0x4d382d, 1);
    gr.fillRect(w.x + 3, w.y, w.w - 6, w.h);
  }

  update(dt: number, time: number): void {
    const g = this.g;
    const h = this.house;
    const it = h.interior;
    const p = g.player;
    const d = this.dyn;
    d.clear();

    // tűz és fények
    this.fire.setScale(1 + 0.08 * Math.sin(time * 0.02), 1 + 0.12 * Math.sin(time * 0.031));
    this.fireGlow.setAlpha(0.65 + 0.15 * Math.sin(time * 0.013));
    this.lights.clear();
    const cols = [0xff5a5a, 0xffd36b, 0x6ad1ff, 0x7aff8a];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const on = Math.sin(time * 0.004 + i * 1.7) > -0.2;
      this.lights.fillStyle(cols[i % 4], on ? 1 : 0.3);
      this.lights.fillCircle(it.tree.x + 26 + Math.cos(a) * (14 + i * 2), it.tree.y + i * 7 - 10, 3);
    }
    this.gift.setText(h.gift ? icon(h.gift) : '');
    this.bootCandy.setVisible(h.bootFilled);

    // gyerek
    const c = h.child;
    const asleep = c.mode === 'asleep';
    this.child.setText(asleep ? (c.meter.ratio >= 0.7 ? '😣' : '😴') : '🧒').setPosition(c.x, c.y);
    this.child.setDepth(asleep ? it.bed.y + 40 : c.y + 10);
    this.zzz.setVisible(asleep);
    if (asleep) {
      const zt = (time * 0.0008) % 1;
      this.zzz.setPosition(c.x + 26 + zt * 16, c.y - 26 - zt * 30).setAlpha(1 - zt).setText(c.meter.ratio >= 0.7 ? '💭' : 'z');
    } else this.cone(c.x, c.y, c.dir, g.tuning.child.halfAngle, g.tuning.child.range, c.suspicion);

    // nagypapa
    const gp = h.grandpa;
    if (gp && this.grandpa && this.gpZzz) {
      const awake = gp.mode === 'awake';
      this.grandpa.setText(awake ? (gp.distract > 0 ? '🧐' : '👴') : '😪');
      this.gpZzz.setVisible(!awake);
      if (!awake) this.gpZzz.setY(gp.y - 40 - ((time * 0.02) % 10));
      if (awake) this.cone(gp.x, gp.y, gp.dir, g.tuning.grandpa.halfAngle, g.tuning.grandpa.range, gp.suspicion);
    }
    let bi = 0;
    for (const gi of g.ground)
      if (gi.kind === 'bell' && gi.zone === h.idx && bi < this.bells.length)
        this.bells[bi++].setPosition(gi.x, gi.y + Math.sin(time * 0.03) * 2).setRotation(Math.sin(time * 0.02) * 0.4).setVisible(true);
    for (; bi < this.bells.length; bi++) this.bells[bi].setVisible(false);

    // célpont
    const t = g.target;
    if (t && p.zone === h.idx && t.kind !== 'bell') {
      const pulse = 1 + 0.12 * Math.sin(time * 0.008);
      d.lineStyle(3, C.warm, 0.9);
      d.strokeCircle(t.x, t.y, 28 * pulse);
      this.targetLabel.setText(`${t.icon} ${t.label}`).setPosition(t.x, t.y - 56).setVisible(true);
    } else this.targetLabel.setVisible(false);

    // Mikulás
    const vis = p.zone === h.idx;
    this.player.setVisible(vis);
    this.carry.setVisible(vis);
    this.pocket.setVisible(vis);
    if (vis) {
      this.walkT += dt * (6 + 9 * p.speed01) * (p.speed01 > 0.05 ? 1 : 0);
      const sq = p.speed01 > 0.05 ? Math.sin(this.walkT) * (p.quiet ? 0.035 : 0.08) : Math.sin(time * 0.004) * 0.02;
      const crouch = p.quiet ? 0.9 : 1;
      this.player.setPosition(p.x, p.y).setScale((1 - sq * 0.6) * crouch, (1 + sq) * crouch).setDepth(p.y);
      if (Math.abs(p.vx) > 5) this.player.setFlipX(p.vx > 0);
      d.fillStyle(0x000000, 0.25).fillEllipse(p.x, p.y + 2, 46, 16);
      if (p.quiet) {
        d.lineStyle(2, 0xffffff, 0.4);
        d.strokeEllipse(p.x, p.y + 2, 60, 22);
      }
      this.carry.setText(p.hand.item ? icon(p.hand.item) : '').setPosition(p.x, p.y - 80).setDepth(p.y + 1);
      this.pocket.setText(p.pocket.item ? icon(p.pocket.item) : '').setPosition(p.x + 30, p.y - 56).setDepth(p.y + 1);
    }

    this.ripples.update(dt);
    this.popups.update(dt);
  }

  /** Látókúp a falakkal kivágva: sárga, gyanú esetén pirosodik. */
  private cone(x: number, y: number, dir: number, half: number, range: number, susp: number): void {
    const d = this.dyn;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xfff2a0),
      Phaser.Display.Color.ValueToColor(0xff3a3a),
      100,
      susp * 100,
    );
    const c = Phaser.Display.Color.GetColor(col.r, col.g, col.b);
    const pts = this.conePts;
    pts.length = 0;
    pts.push(x, y);
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const a = dir - half + (2 * half * i) / N;
      const dx = Math.cos(a) * range;
      const dy = Math.sin(a) * range;
      let t = 1;
      for (const r of this.house.interior.blockers) t = Math.min(t, rayRect(x, y, dx, dy, r));
      pts.push(x + dx * t, y + dy * t);
    }
    d.fillStyle(c, 0.22 + 0.25 * susp);
    d.beginPath();
    d.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) d.lineTo(pts[i], pts[i + 1]);
    d.closePath();
    d.fillPath();
    d.lineStyle(2, c, 0.6);
    d.strokePath();
    if (susp > 0.05) {
      d.fillStyle(0xff3a3a, 1);
      d.fillRoundedRect(x - 22, y - 70, 44 * susp, 6, 3);
    }
  }
}
