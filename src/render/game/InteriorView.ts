import Phaser from 'phaser';
import { C, Z, bake, emo, img, txt } from '../view';
import { PopupPool, RipplePool } from '../fx/pools';
import { icon } from '../../games/mikulas/types';
import type { MikulasGame, HouseState } from '../../games/mikulas/game';
import { rayRect, type Rect } from '../../core/geom';
import { Darkness } from '../fx/darkness';

/** Egy ház belseje kimetszett alaprajzként. Belépéskor épül fel. */
export class InteriorView {
  readonly layer: Phaser.GameObjects.Layer;
  readonly ripples: RipplePool;
  readonly popups: PopupPool;
  private dyn: Phaser.GameObjects.Graphics;
  private player: Phaser.GameObjects.Text;
  private child: Phaser.GameObjects.Text;
  private zzz: Phaser.GameObjects.Text;
  /** a többi alvó (szülők, testvér) */
  private others: { face: Phaser.GameObjects.Text; zzz: Phaser.GameObjects.Text }[] = [];
  private dark: Darkness | null = null;
  private grandpa?: Phaser.GameObjects.Text;
  private gpZzz?: Phaser.GameObjects.Text;
  private gift: Phaser.GameObjects.Text;
  private cat?: Phaser.GameObjects.Text;
  private bells: Phaser.GameObjects.Text[] = [];
  private fire: Phaser.GameObjects.Text;
  private fireGlow: Phaser.GameObjects.Image;
  private lights: Phaser.GameObjects.Graphics;
  private plant: Phaser.GameObjects.Text;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;
  private walkT = 0;
  private conePts: number[] = [];
  private tvScreen?: Phaser.GameObjects.Graphics;

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
    this.layer.add([this.fireGlow, this.fire, tree, this.lights, this.gift]);
    this.layer.add(emo(scene, it.toybox.x + 32, it.toybox.y + 22, '🧩', 26).setDepth(it.toybox.y + 50));
    for (const f of it.furniture) {
      const e = { plant: '🪴', table: '🕯️', sofa: '', shelf: '' }[f.kind];
      if (e) this.layer.add(emo(scene, f.rect.x + f.rect.w / 2, f.rect.y + f.rect.h / 2 - 6, e, f.kind === 'plant' ? 34 : 24).setDepth(f.rect.y + f.rect.h));
    }
    if (it.tv) {
      this.tvScreen = scene.add.graphics().setDepth(it.tv.y + it.tv.h + 1);
      this.layer.add(this.tvScreen);
    }

    // álombuborék: mit kért a gyerek
    const dream = scene.add.graphics().setDepth(70);
    const dd = it.dream;
    const toBed = Math.sign(it.childBed.x - dd.x) || 1;
    dream.fillStyle(0xffffff, 0.92).fillCircle(dd.x, dd.y, 30).fillCircle(dd.x + toBed * 36, dd.y + 32, 7).fillCircle(dd.x + toBed * 46, dd.y + 44, 4);
    this.layer.add([dream, emo(scene, dd.x, dd.y, icon(house.def.wish), 34).setDepth(71)]);
    this.child = emo(scene, it.childBed.x, it.childBed.y, '😴', 40).setDepth(it.bed.y + 40);
    this.zzz = txt(scene, it.childBed.x + 30, it.childBed.y - 30, 'z', 22, '#c9d7f2', { fontStyle: 'bold' }).setDepth(900);
    this.layer.add([this.child, this.zzz]);
    for (const o of house.others) {
      const face = emo(scene, o.x, o.y, '😴', o.kind === 'parents' ? 36 : 38);
      const zzz = txt(scene, o.x + 30, o.y - 30, 'z', 20, '#c9d7f2', { fontStyle: 'bold' }).setDepth(900);
      this.others.push({ face, zzz });
      this.layer.add([face, zzz]);
    }
    // sötét ház: csak a zseblámpa (és a kandalló meg a fa fénye) látszik
    if (house.dark) {
      this.dark = new Darkness(scene, -300, 0, 1560, 540, 4800);
      this.layer.add(this.dark.rt);
    }
    if (house.grandpa) {
      const gm = house.grandpa.kind === 'grandma';
      this.grandpa = emo(scene, house.grandpa.x, house.grandpa.y - 6, gm ? '👵' : '👴', 44).setDepth(it.armchair.y + 70);
      this.gpZzz = txt(scene, house.grandpa.x + 28, house.grandpa.y - 40, gm ? '🧶' : '💤', 22).setDepth(901);
      this.layer.add([this.grandpa, this.gpZzz]);
    }
    if (house.cat) {
      this.cat = emo(scene, house.cat.x, house.cat.y, '🐈', 34).setOrigin(0.5, 0.8).setDepth(house.cat.y);
      this.layer.add(this.cat);
    }
    for (let i = 0; i < 3; i++) {
      const b = emo(scene, 0, 0, '🔔', 26).setVisible(false).setDepth(800);
      this.bells.push(b);
      this.layer.add(b);
    }

    // sötét házban a látókúpok a sötét réteg fölött látszanak (látni, merre néz egy ébren lévő)
    this.dyn = scene.add.graphics().setDepth(house.dark ? 4801 : 5);
    this.player = emo(scene, 0, 0, '🎅', 50).setOrigin(0.5, 0.85);
    this.plant = emo(scene, 0, 0, '🪴', 62).setOrigin(0.5, 0.9).setVisible(false);
    this.layer.add(this.plant);
    this.burst = scene.add.particles(0, 0, 'spark', {
      speed: { min: 60, max: 170 },
      lifespan: 900,
      scale: { start: 3 / Z, end: 0 },
      gravityY: 160,
      emitting: false,
    });
    this.burst.setDepth(4500);
    this.layer.add([this.dyn, this.player, this.burst]);
    this.ripples = new RipplePool(scene, this.layer);
    this.popups = new PopupPool(scene, this.layer);
  }

  destroy(): void {
    this.dark?.destroy();
    this.layer.destroy(true);
  }

  burstAt(x: number, y: number): void {
    this.burst.explode(30, x, y);
  }

  private drawStatic(gr: Phaser.GameObjects.Graphics): void {
    const it = this.house.interior;
    const floors = [
      [0x9a6a46, 0x7d5236, 0x5f7fb8, 0x6a8cc6],
      [0xa77b52, 0x8a6040, 0x6b9b7a, 0x7aae8a],
      [0x8c5e3c, 0x6e4529, 0xb87fa0, 0xc890b0],
      [0xb08860, 0x907050, 0x8c7cc0, 0x9c8cd0],
    ][it.palette % 4];
    // sötét keret: a ház kimetszve
    gr.fillStyle(0x06102a, 1);
    gr.fillRect(0, 0, 960, 540);
    // padló szobánként: fa a nappaliban, csempe az előszobában, szőnyeg a hálószobákban
    const L = it.living;
    for (const r of it.rooms) {
      const R = r.rect;
      if (r.kind === 'living') {
        gr.fillStyle(floors[0], 1).fillRect(R.x, R.y, R.w, R.h);
        gr.lineStyle(1, floors[1], 0.8);
        for (let y = R.y + 22; y < R.y + R.h; y += 22) gr.lineBetween(R.x, y, R.x + R.w, y);
        for (let y = R.y; y < R.y + R.h; y += 22)
          for (let x = R.x + ((y / 22) % 2 ? 40 : 90); x < R.x + R.w; x += 120) gr.lineBetween(x, y, x, Math.min(R.y + R.h, y + 22));
        // szőnyeg a nappali közepén
        const rx = R.x + R.w / 2;
        const ry = R.y + R.h / 2 + 10;
        const rw = Math.min(240, R.w - 120);
        const rh = Math.min(140, R.h - 100);
        gr.fillStyle(0x8a2f3a, 1).fillRoundedRect(rx - rw / 2, ry - rh / 2, rw, rh, 18);
        gr.lineStyle(4, 0xd9a441, 0.8).strokeRoundedRect(rx - rw / 2 + 12, ry - rh / 2 + 12, rw - 24, rh - 24, 12);
      } else if (r.kind === 'hall') {
        gr.fillStyle(0xb8b0a0, 1).fillRect(R.x, R.y, R.w, R.h);
        for (let x = R.x; x < R.x + R.w; x += 40)
          for (let y = R.y; y < R.y + R.h; y += 40) if (((x - R.x) / 40 + (y - R.y) / 40) % 2 === 0) gr.fillStyle(0x9a9284, 1).fillRect(x, y, 40, Math.min(40, R.y + R.h - y));
      } else {
        const [a1, a2] = r.kind === 'kid' ? [floors[2], floors[3]] : r.kind === 'parents' ? [0x7a6a8a, 0x8a7a9a] : r.kind === 'sibling' ? [0x6a9a8a, 0x7aaa9a] : [0x6a6a70, 0x7a7a80];
        gr.fillStyle(a1, 1).fillRect(R.x, R.y, R.w, R.h);
        gr.fillStyle(a2, 1);
        for (let x = R.x + 10; x < R.x + R.w; x += 40) for (let y = R.y + 10; y < R.y + R.h; y += 40) gr.fillCircle(x, y, 3);
      }
    }
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
    // ablakok (holdfény)
    for (const win of [it.bootWindow, it.kidWindow]) {
      gr.fillStyle(0x9ec4ff, 1);
      gr.fillRect(win.x, win.y, win.w, win.h);
      gr.fillStyle(0xffffff, 0.1);
      if (win.h > win.w) {
        const inX = win.x < B.x + B.w / 2 ? B.x : B.x + B.w;
        const dir = win.x < B.x + B.w / 2 ? 1 : -1;
        gr.fillTriangle(inX, win.y, inX, win.y + win.h, inX + dir * 110, win.y + win.h + 6);
      } else gr.fillTriangle(win.x, B.y, win.x + win.w, B.y, win.x + win.w + 6, B.y + 110);
    }
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
    // tévé
    if (it.tv) {
      gr.fillStyle(0x222222, 1);
      gr.fillRoundedRect(it.tv.x, it.tv.y, it.tv.w, it.tv.h, 4);
    }
    // bútorok
    for (const f of it.furniture) {
      const r = f.rect;
      if (f.kind === 'sofa') {
        gr.fillStyle(0x6a3a5a, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 12);
        gr.fillStyle(0x8a4a74, 1).fillRoundedRect(r.x + 8, r.y + 8, r.w - 16, r.h - 14, 8);
      } else if (f.kind === 'table') {
        gr.fillStyle(0x7a4a2a, 1).fillRoundedRect(r.x, r.y, r.w, r.h, 8);
        gr.fillStyle(0xf4e8d0, 0.9).fillCircle(r.x + r.w / 2, r.y + r.h / 2, r.w / 3);
      } else if (f.kind === 'shelf') {
        gr.fillStyle(0x5a3a22, 1).fillRect(r.x, r.y, r.w, r.h);
        const cols = [0xd9413b, 0x3b6e8f, 0xffd36b, 0x3f7a55];
        for (let x = r.x + 4, k = 0; x < r.x + r.w - 8; x += 10, k++) gr.fillStyle(cols[k % 4], 1).fillRect(x, r.y + 3, 7, r.h - 6);
      } else {
        gr.fillStyle(0x000000, 0.2).fillEllipse(r.x + r.w / 2, r.y + r.h, r.w + 4, 10);
      }
    }
    // ágyak (a szülőké dupla, két párnával)
    for (const z of it.sleepers) {
      const Bd = z.bed;
      const quilt = z.kind === 'parents' ? [0x4a6ab0, 0x6a8ad0] : z.kind === 'sibling' ? [0x3f9a6a, 0x5fba8a] : [0xd94b6a, 0xf07a94];
      gr.fillStyle(0x6b4024, 1);
      gr.fillRoundedRect(Bd.x - 4, Bd.y - 4, Bd.w + 8, Bd.h + 8, 10);
      gr.fillStyle(0xffffff, 1);
      if (z.kind === 'parents') {
        gr.fillRoundedRect(Bd.x + 10, Bd.y + 6, Bd.w / 2 - 16, 30, 10);
        gr.fillRoundedRect(Bd.x + Bd.w / 2 + 6, Bd.y + 6, Bd.w / 2 - 16, 30, 10);
      } else gr.fillRoundedRect(Bd.x + 18, Bd.y + 6, Bd.w - 36, 30, 10);
      gr.fillStyle(quilt[0], 1);
      gr.fillRoundedRect(Bd.x + 4, Bd.y + 44, Bd.w - 8, Bd.h - 48, 8);
      gr.fillStyle(quilt[1], 1);
      for (let x = Bd.x + 16; x < Bd.x + Bd.w - 8; x += 24) gr.fillCircle(x, Bd.y + Bd.h - 30, 5);
    }
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
    // a ház száma
    this.layer.add(txt(this.scene, L.x + L.w / 2, 528, `${this.house.idx + 1}. ház`, 15, '#c9d7f2').setDepth(1));
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

    // macska: ha közel mész, nyávog (elbújva is); hallal lecsendesíthető
    const cat = h.cat;
    if (cat && this.cat) {
      const fed = cat.mode === 'fed';
      this.cat.setText(fed ? '🐈💤' : cat.meowAnim > 0 ? '🙀' : '🐈').setScale(cat.meowAnim > 0 ? 1.25 : 1);
      if (!fed && p.zone === h.idx && Math.hypot(p.x - cat.x, p.y - cat.y) < g.tuning.cat.radius + 120) {
        d.lineStyle(2, C.red, 0.25 + 0.2 * Math.sin(time * 0.01)).strokeCircle(cat.x, cat.y - 10, g.tuning.cat.radius);
      }
    }

    // gyerek
    const c = h.child;
    const asleep = c.mode === 'asleep';
    this.child.setText(asleep ? (c.meter.ratio >= 0.7 ? '😣' : '😴') : '🧒').setPosition(c.x, c.y);
    this.child.setDepth(asleep ? it.bed.y + 40 : h.dark ? 4802 : c.y + 10);
    this.zzz.setVisible(asleep);
    if (asleep) {
      const zt = (time * 0.0008) % 1;
      this.zzz.setPosition(c.x + 26 + zt * 16, c.y - 26 - zt * 30).setAlpha(1 - zt).setText(c.meter.ratio >= 0.7 ? '💭' : 'z');
    } else this.cone(c.x, c.y, c.dir, g.tuning.child.halfAngle, g.tuning.child.range, c.suspicion);
    h.others.forEach((o, i) => {
      const v = this.others[i];
      const zz = o.mode === 'asleep';
      const awakeFace = o.kind === 'parents' ? '👨' : '🧒';
      v.face.setText(zz ? (o.meter.ratio >= 0.7 ? '😣' : o.kind === 'parents' ? '😴😴' : '😴') : awakeFace).setPosition(o.x, o.y).setDepth(zz ? o.home.y + 40 : h.dark ? 4802 : o.y + 10);
      v.zzz.setVisible(zz);
      if (zz) {
        const zt = (time * 0.0007 + i * 0.4) % 1;
        v.zzz.setPosition(o.x + 30 + zt * 16, o.y - 26 - zt * 30).setAlpha(1 - zt).setText(o.meter.ratio >= 0.7 ? '💭' : 'z');
      } else this.cone(o.x, o.y, o.dir, g.tuning.child.halfAngle, g.tuning.child.range, o.suspicion);
    });
    if (this.dark) {
      if (p.zone === h.idx) {
        const lights = [
          { x: it.fireplace.x + 60, y: it.fireplace.y + 40, r: 110 },
          { x: it.tree.x + it.tree.w / 2, y: it.tree.y + 30, r: 80 },
        ];
        this.dark.draw(p.x, p.y, p.dir, p.flashlight, g.tuning.light, lights, h.litRooms);
      } else this.dark.hide();
    }

    // nagypapa
    const gp = h.grandpa;
    if (gp && this.grandpa && this.gpZzz) {
      const K = gp.kind === 'tv' ? g.tuning.tv : gp.kind === 'grandma' ? g.tuning.grandma : g.tuning.grandpa;
      if (gp.kind === 'grandma') {
        this.grandpa.setText(gp.mode === 'look' ? '🧐' : '👵');
        // kötés közben a fonal mozog; ha abbahagyja, kérdőjel: mindjárt felnéz!
        this.gpZzz.setVisible(true).setText(gp.mode === 'knit' ? '🧶' : gp.mode === 'pause' ? '❓' : '');
        this.gpZzz.setPosition(gp.x + 28 + (gp.mode === 'knit' ? Math.sin(time * 0.02) * 3 : 0), gp.y - 30);
      } else {
        const awake = gp.mode === 'awake';
        const waking = gp.mode === 'waking';
        this.grandpa.setText(awake ? (gp.distract > 0 ? '🧐' : '👴') : waking ? '🥱' : '😪');
        this.gpZzz.setVisible(!awake).setText(waking ? '❗' : '💤');
        if (gp.mode === 'dozing') this.gpZzz.setY(gp.y - 40 - ((time * 0.02) % 10));
        else this.gpZzz.setY(gp.y - 44);
      }
      // sötétben az ébren lévő nagyszülő is látszik
      if (h.dark) this.grandpa.setDepth(gp.mode === 'awake' || gp.mode === 'look' || gp.mode === 'waking' ? 4802 : it.armchair.y + 70);
      if (gp.mode === 'awake' || gp.mode === 'look') this.cone(gp.x, gp.y, gp.dir, K.halfAngle, K.range, gp.suspicion);
      // figyelmeztetés: mindjárt figyelni fog, a látókúp narancssárga (még nem lát)
      else if (gp.mode === 'waking' || gp.mode === 'pause')
        this.cone(gp.x, gp.y, gp.dir, K.halfAngle, K.range, 0, 0xff9a3a, 0.12 + 0.12 * Math.abs(Math.sin(time * 0.012)));
    }
    if (this.tvScreen && it.tv) {
      const on = gp?.mode === 'awake';
      const t = it.tv;
      const cols = [0x6ad1ff, 0xa0ffcf, 0xffe08a, 0xc9a0ff];
      this.tvScreen.clear();
      this.tvScreen.fillStyle(on ? cols[Math.floor(time / 400) % 4] : 0x1a2233, on ? 0.9 : 1);
      this.tvScreen.fillRect(t.x + 6, t.y + 4, t.w - 12, t.h - 10);
    }
    let bi = 0;
    for (const gi of g.ground)
      if (gi.kind === 'bell' && gi.zone === h.idx && bi < this.bells.length)
        this.bells[bi++].setPosition(gi.x, gi.y + Math.sin(time * 0.03) * 2).setRotation(Math.sin(time * 0.02) * 0.4).setVisible(true);
    for (; bi < this.bells.length; bi++) this.bells[bi].setVisible(false);

    this.drawGuide(time);
    // csengő a zsebben, nagyszülő a házban: látszik, hova esik, ha eldobod
    if (p.zone === h.idx && p.pocket.has('bell') && h.grandpa) {
      const L = it.living;
      const bx = Math.max(L.x + 20, Math.min(L.x + L.w - 20, p.x + Math.cos(p.dir) * 150));
      const by = Math.max(L.y + 20, Math.min(L.y + L.h - 20, p.y + Math.sin(p.dir) * 150));
      d.lineStyle(2, 0x7ad1ff, 0.7);
      for (let i = 0; i < 6; i++) {
        const t0 = i / 6;
        const t1 = t0 + 0.08;
        d.lineBetween(p.x + (bx - p.x) * t0, p.y + (by - p.y) * t0, p.x + (bx - p.x) * t1, p.y + (by - p.y) * t1);
      }
      d.strokeCircle(bx, by, 14 + 3 * Math.sin(time * 0.01));
    }

    // célpont (felirat nélkül): sárga a művelet-gomb, kék az eszköz-gomb célja
    const pulse = 1 + 0.12 * Math.sin(time * 0.008);
    const t = g.target;
    if (t && p.zone === h.idx && t.kind !== 'tree') d.lineStyle(3, C.warm, 0.9).strokeCircle(t.x, t.y, 28 * pulse);
    const tt = g.toolTarget;
    if (tt && p.zone === h.idx && tt.kind !== 'bell') d.lineStyle(3, 0x7ad1ff, 0.95).strokeCircle(tt.x, tt.y - 10, 32 * pulse);

    // Mikulás
    const vis = p.zone === h.idx;
    this.player.setVisible(vis);
    if (!vis) this.plant.setVisible(false);
    if (vis) {
      this.walkT += dt * (6 + 9 * p.speed01) * (p.speed01 > 0.05 ? 1 : 0);
      const sq = p.speed01 > 0.05 ? Math.sin(this.walkT) * (p.quiet ? 0.035 : 0.08) : Math.sin(time * 0.004) * 0.02;
      const crouch = p.hidden ? 0.72 : p.quiet ? 0.9 : 1;
      this.player.setPosition(p.x, p.y).setScale((1 - sq * 0.6) * crouch, (1 + sq) * crouch).setDepth(p.y);
      if (Math.abs(p.vx) > 5) this.player.setFlipX(p.vx > 0);
      d.fillStyle(0x000000, 0.25).fillEllipse(p.x, p.y + 2, 46, 16);
      if (p.quiet) {
        d.lineStyle(2, 0xffffff, 0.4);
        d.strokeEllipse(p.x, p.y + 2, 60, 22);
      }
      // elbújva: a Mikulás egy cserepes virág mögé guggol
      this.plant
        .setVisible(p.hidden)
        .setPosition(p.x + (p.hidden ? Math.sin(time * 0.004) * 1.5 : 0), p.y + 8)
        .setDepth(p.y + 2)
        .setRotation(p.speed01 > 0.05 ? Math.sin(time * 0.02) * 0.06 : 0);
      this.player.setAlpha(p.hidden ? 0.85 : 1);
    }

    this.ripples.update(dt);
    this.popups.update(dt);
  }

  /** Hova kell menni: a fa alatti hely villog (rossz ajándéknál piros), különben halványan a kijáratok. */
  private drawGuide(time: number): void {
    const h = this.house;
    const it = h.interior;
    const p = this.g.player;
    const d = this.dyn;
    const hand = p.hand.item;
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.008);
    if (hand && hand !== 'candy' && h.status === 'pending' && !h.gift) {
      const spot = it.treeSpot;
      const col = hand !== h.def.wish ? C.red : C.warm;
      d.fillStyle(col, 0.18 + 0.12 * pulse).fillCircle(spot.x, spot.y, 40);
      d.lineStyle(4, col, 0.6 + 0.4 * pulse).strokeCircle(spot.x, spot.y, 40 + 4 * pulse);
      return;
    }
    d.lineStyle(3, C.warm, 0.25 + 0.25 * pulse);
    d.strokeCircle(it.fireSpot.x, it.fireSpot.y, 30);
    d.strokeCircle(it.doorSpot.x, it.doorSpot.y, 30);
  }

  /** Látókúp a falakkal kivágva: sárga, gyanú esetén pirosodik. */
  private cone(x: number, y: number, dir: number, half: number, range: number, susp: number, base = 0xfff2a0, alpha?: number): void {
    const d = this.dyn;
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(base),
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
    d.fillStyle(c, alpha ?? 0.22 + 0.25 * susp);
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
