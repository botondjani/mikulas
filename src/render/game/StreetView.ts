import Phaser from 'phaser';
import { C, Z, bake, emo, img, txt } from '../view';
import { PopupPool, RipplePool } from '../fx/pools';
import { STREET, icon } from '../../games/mikulas/types';
import type { MikulasGame, HouseState } from '../../games/mikulas/game';
import { childAwake } from '../../games/mikulas/agents/child';

const ROOFS = [0x9c3b3b, 0x3b6e8f, 0x6b4a8a, 0x3f7a55, 0x9a6a2e, 0x7a3b5e, 0x2f6f6a, 0x8a4a3a];

interface HouseView {
  wish: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Image;
  windows: Phaser.GameObjects.Graphics;
  dog?: Phaser.GameObjects.Text;
  dogFx?: Phaser.GameObjects.Text;
  cat?: Phaser.GameObjects.Text;
  cloud: Phaser.GameObjects.Text;
  lit: boolean;
}

/** Az utca megjelenítése (felülnézet). */
export class StreetView {
  readonly layer: Phaser.GameObjects.Layer;
  readonly ripples: RipplePool;
  readonly popups: PopupPool;
  private dyn: Phaser.GameObjects.Graphics;
  private views: HouseView[] = [];
  private player: Phaser.GameObjects.Text;
  private carry: Phaser.GameObjects.Text;
  private pocket: Phaser.GameObjects.Text;
  private krampus: Phaser.GameObjects.Text;
  private candies: Phaser.GameObjects.Text[] = [];
  private sledPile: Phaser.GameObjects.Text;
  private targetLabel: Phaser.GameObjects.Text;
  private blizzard: Phaser.GameObjects.Image;
  private guides: Phaser.GameObjects.Text[] = [];
  private edge: Phaser.GameObjects.Text;
  private burst: Phaser.GameObjects.Particles.ParticleEmitter;
  private walkT = 0;

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
  ) {
    this.layer = scene.add.layer();
    const st = g.street;
    const bg = scene.add.graphics();
    this.drawStatic(bg);
    this.layer.add(bake(scene, bg, st.w, st.h).setDepth(0));

    // lámpák fénye az út mentén
    for (let x = 140; x < st.w; x += 320) {
      for (const y of [214, 326]) {
        const l = img(scene, x, y, 'lamp', 0.9).setBlendMode(Phaser.BlendModes.ADD).setDepth(1).setAlpha(0.45);
        this.layer.add(l);
      }
    }

    for (const h of g.houses) this.views.push(this.makeHouse(h));

    // szán és rénszarvasok
    const sc = st.sledCenter;
    this.layer.add(emo(scene, st.reindeer.x + 22, st.reindeer.y + 16, '🦌', 34).setDepth(st.reindeer.y + 30));
    this.layer.add(emo(scene, st.reindeer.x + 66, st.reindeer.y + 20, '🦌', 34).setDepth(st.reindeer.y + 32));
    this.sledPile = emo(scene, sc.x + 4, sc.y - 8, '🎁🎁', 26).setDepth(sc.y + 30);
    this.layer.add(this.sledPile);

    this.dyn = scene.add.graphics().setDepth(2);
    this.layer.add(this.dyn);

    for (let i = 0; i < 4; i++) {
      const c = emo(scene, 0, 0, '🍬', 24).setVisible(false);
      this.candies.push(c);
      this.layer.add(c);
    }
    this.krampus = emo(scene, 0, 0, '👹', 46).setOrigin(0.5, 0.85).setVisible(false);
    this.player = emo(scene, 0, 0, '🎅', 44).setOrigin(0.5, 0.85);
    this.carry = emo(scene, 0, 0, '', 26);
    this.pocket = emo(scene, 0, 0, '', 18);
    this.targetLabel = txt(scene, 0, 0, '', 18, '#3a2200', {
      backgroundColor: '#ffd36b',
      padding: { x: 8, y: 4 },
      fontStyle: 'bold',
    }).setDepth(4000);
    this.layer.add([this.krampus, this.player, this.carry, this.pocket, this.targetLabel]);

    this.burst = scene.add.particles(0, 0, 'spark', {
      speed: { min: 50, max: 140 },
      lifespan: 900,
      scale: { start: 2.4 / Z, end: 0 },
      gravityY: 120,
      emitting: false,
    });
    this.burst.setDepth(4500);
    this.layer.add(this.burst);

    for (let i = 0; i < 4; i++) {
      const a = emo(scene, 0, 0, '⬇️', 34).setDepth(4600).setVisible(false);
      this.guides.push(a);
      this.layer.add(a);
    }
    // a képernyőn kívüli célház felé mutató nyíl (képernyő-térben)
    this.edge = emo(scene, 0, 0, '', 40).setScrollFactor(0).setDepth(1250).setVisible(false);

    this.blizzard = scene.add.image(0, 0, 'blizzard').setDisplaySize(2200, 2200).setDepth(4800).setAlpha(0);
    this.layer.add(this.blizzard);

    this.ripples = new RipplePool(scene, this.layer);
    this.popups = new PopupPool(scene, this.layer);
  }

  private drawStatic(gr: Phaser.GameObjects.Graphics): void {
    const st = this.g.street;
    // havas talaj holdfényben
    gr.fillStyle(0x6f84b8, 1);
    gr.fillRect(0, 0, st.w, st.h);
    // út
    gr.fillStyle(0x56689a, 1);
    gr.fillRect(0, 215, st.w, 110);
    gr.fillStyle(0x6275a8, 1);
    for (const y of [236, 300]) gr.fillRect(0, y, st.w, 6);
    gr.lineStyle(2, 0x8a9cca, 0.7);
    gr.lineBetween(0, 215, st.w, 215);
    gr.lineBetween(0, 325, st.w, 325);
    // hóbuckák
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < st.w / 14; i++) {
      gr.fillStyle(0x8c9fd0, 0.6);
      gr.fillEllipse(rnd() * st.w, rnd() < 0.5 ? 20 + rnd() * 190 : 330 + rnd() * 200, 20 + rnd() * 30, 8 + rnd() * 8);
    }
    // lámpaoszlopok
    for (let x = 140; x < st.w; x += 320)
      for (const y of [210, 330]) {
        gr.fillStyle(0x2a3550, 1);
        gr.fillCircle(x, y, 6);
        gr.fillStyle(0xfff0c0, 1);
        gr.fillCircle(x, y, 3);
      }

    for (const h of this.g.houses) {
      const hs = h.street;
      const b = hs.body;
      const front = hs.top ? b.y + b.h : b.y;
      // ösvény az ajtótól az útig
      gr.fillStyle(0x7e92c4, 1);
      if (hs.top) gr.fillRect(hs.cx - 16, front, 32, 215 - front);
      else gr.fillRect(hs.cx - 16, 325, 32, front - 325);
      // kerítés a kertek között
      gr.lineStyle(3, 0x6a5440, 0.9);
      const fy1 = hs.top ? front + 4 : 330;
      const fy2 = hs.top ? 210 : front - 4;
      for (const fx of [b.x - 22, b.x + b.w + 22]) {
        gr.lineBetween(fx, fy1, fx, fy2);
        for (let y = fy1; y < fy2; y += 12) gr.fillStyle(0x6a5440, 1).fillRect(fx - 3, y, 6, 4);
      }
      // árnyék és tető
      gr.fillStyle(0x000000, 0.18);
      gr.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      const roof = ROOFS[h.idx % ROOFS.length];
      gr.fillStyle(Phaser.Display.Color.IntegerToColor(roof).darken(25).color, 1);
      gr.fillRect(b.x, b.y, b.w, b.h);
      gr.fillStyle(roof, 1);
      gr.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // tetőgerinc és cserépsorok
      gr.lineStyle(3, Phaser.Display.Color.IntegerToColor(roof).darken(35).color, 1);
      gr.lineBetween(b.x + 6, b.y + b.h / 2, b.x + b.w - 6, b.y + b.h / 2);
      gr.lineStyle(1, Phaser.Display.Color.IntegerToColor(roof).lighten(12).color, 0.6);
      for (let y = b.y + 16; y < b.y + b.h - 6; y += 12) gr.lineBetween(b.x + 8, y, b.x + b.w - 8, y);
      // hó a tetőn
      gr.fillStyle(0xd6e0f5, 0.85);
      gr.fillEllipse(b.x + 40, b.y + 18, 70, 18);
      gr.fillEllipse(b.x + b.w - 50, b.y + b.h - 18, 80, 18);
      // kémény
      gr.fillStyle(0x7a3a2a, 1);
      gr.fillRect(hs.chimney.x - 12, hs.chimney.y - 12, 24, 24);
      gr.fillStyle(0x2a1a14, 1);
      gr.fillRect(hs.chimney.x - 7, hs.chimney.y - 7, 14, 14);
      gr.fillStyle(C.snow, 1);
      gr.fillRect(hs.chimney.x - 12, hs.chimney.y - 14, 24, 4);
      // ajtó a homlokzaton
      gr.fillStyle(0x5a3520, 1);
      gr.fillRect(hs.cx - 13, hs.top ? front - 6 : front, 26, 6);
      // létra a kéményhez
      gr.lineStyle(3, 0xc89a60, 1);
      const lx = hs.ladder.x;
      const ly1 = hs.top ? front + 12 : front - 12;
      const ly2 = hs.chimney.y + (hs.top ? 16 : -16);
      gr.lineBetween(lx - 7, ly1, lx - 7, ly2);
      gr.lineBetween(lx + 7, ly1, lx + 7, ly2);
      for (let y = Math.min(ly1, ly2) + 6; y < Math.max(ly1, ly2); y += 10) gr.lineBetween(lx - 7, y, lx + 7, y);
      // szaloncukros zsák
      gr.fillStyle(0x8a5a3c, 1);
      gr.fillCircle(hs.sack.x, hs.sack.y, 13);
      gr.fillStyle(0xa8754f, 1);
      gr.fillCircle(hs.sack.x - 3, hs.sack.y - 3, 7);
      gr.fillStyle(0x6a3f28, 1);
      gr.fillRect(hs.sack.x - 6, hs.sack.y - 15, 12, 5);
      // kívánság-buborék a tetőn
      const cy = b.y + b.h / 2;
      gr.fillStyle(0xffffff, 0.95);
      gr.fillCircle(hs.cx - 30, cy - 4, 25);
      gr.fillTriangle(hs.cx - 14, cy + 14, hs.cx - 4, cy + 24, hs.cx - 6, cy + 8);
    }

    // szán
    const sl = this.g.street.sled;
    gr.fillStyle(0x000000, 0.2);
    gr.fillRoundedRect(sl.x + 4, sl.y + 8, sl.w, sl.h, 14);
    gr.fillStyle(0xe0b040, 1);
    gr.fillRect(sl.x - 4, sl.y + sl.h - 6, sl.w + 8, 5);
    gr.fillRect(sl.x - 4, sl.y + 1, sl.w + 8, 5);
    gr.fillStyle(C.red, 1);
    gr.fillRoundedRect(sl.x, sl.y + 4, sl.w, sl.h - 8, 12);
    gr.fillStyle(0xf06a5a, 1);
    gr.fillRoundedRect(sl.x + 8, sl.y + 8, sl.w - 16, 10, 5);
    // gyeplő a rénszarvasokig
    gr.lineStyle(2, 0x6a3f28, 1);
    const rd = this.g.street.reindeer;
    gr.lineBetween(sl.x, sl.y + 14, rd.x + rd.w - 10, rd.y + 14);
    gr.lineBetween(sl.x, sl.y + sl.h - 14, rd.x + rd.w - 10, rd.y + rd.h - 10);
  }

  private makeHouse(h: HouseState): HouseView {
    const s = this.scene;
    const hs = h.street;
    const b = hs.body;
    const cy = b.y + b.h / 2;
    const front = hs.top ? b.y + b.h : b.y;
    const smoke = s.add.particles(hs.chimney.x, hs.chimney.y, 'smoke', {
      lifespan: 2600,
      speedY: { min: -26, max: -14 },
      speedX: { min: 4, max: 14 },
      scale: { start: 0.5 / Z, end: 1.8 / Z },
      alpha: { start: 0.55, end: 0 },
      frequency: 420,
    });
    smoke.setDepth(3);
    this.layer.add(smoke);

    const glow = img(s, hs.cx, front, 'glow', 1.1).setBlendMode(Phaser.BlendModes.ADD).setDepth(1).setAlpha(0);
    const windows = s.add.graphics().setDepth(2);
    this.layer.add([glow, windows]);

    // kívánság-buborék a tetőn
    const wish = emo(s, hs.cx - 30, cy - 4, icon(h.def.wish), 30).setDepth(4);
    const name = txt(s, hs.cx + 30, cy - 6, `${h.idx + 1}. ${h.def.child}`, 17, '#ffffff', {
      fontStyle: 'bold',
      stroke: '#06102a',
      strokeThickness: 4,
    }).setDepth(4);
    const status = emo(s, hs.cx - 30, cy - 4, '', 30).setDepth(5);
    const cloud = emo(s, hs.cx + 64, cy + 14, '💭', 22).setDepth(5).setVisible(false);
    this.layer.add([wish, name, status, cloud]);
    const v: HouseView = { wish, name, status, glow, windows, cloud, lit: false };
    if (h.dog) {
      v.dog = emo(s, hs.dog.x, hs.dog.y, '🐕', 34).setOrigin(0.5, 0.8);
      v.dogFx = txt(s, hs.dog.x, hs.dog.y - 36, 'Vau!', 18, '#ffffff', {
        fontStyle: 'bold',
        stroke: '#7a1d1a',
        strokeThickness: 4,
      })
        .setDepth(4000)
        .setVisible(false);
      this.layer.add([v.dog, v.dogFx]);
    }
    if (h.cat) {
      v.cat = emo(s, hs.catYard.x, hs.catYard.y, '🐈', 26).setOrigin(0.5, 0.8);
      this.layer.add(v.cat);
    }
    this.drawWindows(h, v, false);
    return v;
  }

  private drawWindows(h: HouseState, v: HouseView, lit: boolean): void {
    const hs = h.street;
    const front = hs.top ? hs.body.y + hs.body.h : hs.body.y;
    const y = hs.top ? front - 5 : front;
    v.windows.clear();
    v.windows.fillStyle(lit ? 0xffd36b : 0x24345e, 1);
    for (const dx of [-62, -36, 36, 62]) v.windows.fillRect(hs.cx + dx - 9, y, 18, 5);
  }

  /** a ház ablakai kigyulladnak (sikeres kézbesítés) */
  lightHouse(idx: number): void {
    const v = this.views[idx];
    const h = this.g.houses[idx];
    v.lit = true;
    this.drawWindows(h, v, true);
    this.scene.tweens.add({ targets: v.glow, alpha: 0.85, duration: 700 });
  }

  burstAt(x: number, y: number): void {
    this.burst.explode(24, x, y);
  }

  update(dt: number, time: number): void {
    const g = this.g;
    const p = g.player;
    const d = this.dyn;
    d.clear();

    for (const h of g.houses) this.updateHouse(h, this.views[h.idx], time);

    // szán rakománya
    const left = Object.values(g.sledStock).reduce((a, b) => a + b, 0);
    this.sledPile.setText(left > 0 ? '🎁'.repeat(Math.min(3, left)) : '');

    // szaloncukrok a földön
    let ci = 0;
    for (const it of g.ground) {
      if (it.zone !== STREET || it.kind !== 'candy' || ci >= this.candies.length) continue;
      this.candies[ci++].setPosition(it.x, it.y).setVisible(true).setDepth(it.y);
    }
    for (; ci < this.candies.length; ci++) this.candies[ci].setVisible(false);

    // Krampusz
    const k = g.krampus;
    this.krampus.setVisible(k.active);
    if (k.active) {
      const bob = Math.sin(time * 0.012) * 3;
      this.krampus.setPosition(k.x, k.y + bob).setDepth(k.y);
      this.krampus.setFlipX(k.x > p.x);
      d.fillStyle(0x000000, 0.25).fillEllipse(k.x, k.y + 2, 36, 12);
      if (k.mode === 'chase') {
        d.lineStyle(2, C.red, 0.5 + 0.3 * Math.sin(time * 0.02));
        d.strokeCircle(k.x, k.y - 14, 34);
      }
    }

    this.drawGuides(time);

    // célpont kiemelése
    const t = g.target;
    if (t && p.zone === STREET && t.kind !== 'dropCandy') {
      const pulse = 1 + 0.12 * Math.sin(time * 0.008);
      d.lineStyle(3, C.warm, 0.9);
      d.strokeCircle(t.x, t.y, 22 * pulse);
      this.targetLabel.setText(`${t.icon} ${t.label}`).setPosition(t.x, t.y - 46).setVisible(true);
    } else this.targetLabel.setVisible(false);

    // Mikulás
    const vis = p.zone === STREET;
    this.player.setVisible(vis);
    this.carry.setVisible(vis);
    this.pocket.setVisible(vis);
    if (vis) {
      this.walkT += dt * (6 + 10 * p.speed01) * (p.speed01 > 0.05 ? 1 : 0);
      const sq = p.speed01 > 0.05 ? Math.sin(this.walkT) * (p.quiet ? 0.04 : 0.08) : Math.sin(time * 0.004) * 0.02;
      this.player.setPosition(p.x, p.y).setScale(1 - sq * 0.6, 1 + sq).setDepth(p.y);
      if (Math.abs(p.vx) > 5) this.player.setFlipX(p.vx > 0);
      this.player.setAlpha(p.busyKind === 'caught' && p.busy > 0 ? (Math.floor(time / 100) % 2 ? 0.3 : 1) : 1);
      d.fillStyle(0x000000, 0.25).fillEllipse(p.x, p.y + 2, 34, 12);
      if (p.quiet) {
        d.lineStyle(2, 0xffffff, 0.35);
        d.strokeEllipse(p.x, p.y + 2, 44, 16);
      }
      this.carry.setText(p.hand.item ? icon(p.hand.item) : '').setPosition(p.x, p.y - 60).setDepth(p.y + 1);
      this.pocket.setText(p.pocket.item ? icon(p.pocket.item) : '').setPosition(p.x + 22, p.y - 40).setDepth(p.y + 1);
    }

    // hóvihar
    const bz = g.blizzard > 0 ? Math.min(1, g.blizzard, (g.tuning.blizzard.duration - g.blizzard) * 0.8) : 0;
    this.blizzard.setAlpha(this.blizzard.alpha + (bz - this.blizzard.alpha) * Math.min(1, dt * 3));
    this.blizzard.setPosition(p.x, p.y - 20);

    this.ripples.update(dt);
    this.popups.update(dt);
  }

  /** Merre menjen: a kézben lévő ajándék házához, vagy üres kézzel a szánhoz. */
  private drawGuides(time: number): void {
    const g = this.g;
    const p = g.player;
    const d = this.dyn;
    for (const a of this.guides) a.setVisible(false);
    this.edge.setVisible(false);
    if (p.zone !== STREET || (g.phase !== 'deliver' && g.phase !== 'dawn')) return;
    const bob = Math.abs(Math.sin(time * 0.006)) * 10;
    const pulse = 0.55 + 0.45 * Math.sin(time * 0.008);
    const points: { x: number; y: number }[] = [];
    const hand = p.hand.item;
    if (hand && hand !== 'candy' && g.phase === 'deliver') {
      for (const h of g.houses) {
        if (h.status !== 'pending' || h.def.wish !== hand) continue;
        const b = h.street.body;
        d.lineStyle(5, C.warm, pulse);
        d.strokeRoundedRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12, 10);
        d.lineStyle(3, C.warm, pulse);
        d.strokeCircle(h.street.ladder.x, h.street.ladder.y, 20);
        points.push({ x: h.street.ladder.x, y: h.street.top ? h.street.ladder.y - 40 : h.street.ladder.y - 48 });
      }
    } else if (!hand) {
      const sc = g.street.sledCenter;
      const stock = Object.values(g.sledStock).some((n) => n > 0);
      const goHome = g.phase === 'dawn' || g.pendingCount === 0;
      if ((goHome || (stock && g.pendingCount > 0)) && Math.hypot(p.x - sc.x, p.y - sc.y) > g.tuning.sledRadius) {
        d.lineStyle(4, C.warm, pulse);
        d.strokeEllipse(sc.x, sc.y, 170, 80);
        points.push({ x: sc.x, y: sc.y - 52 });
      }
    }
    const cam = this.scene.cameras.main;
    points.forEach((pt, i) => {
      if (i < this.guides.length) this.guides[i].setPosition(pt.x, pt.y - bob).setVisible(true);
      // képernyőn kívül: nyíl a szélen
      const sx = pt.x - cam.scrollX;
      if (sx < 20 || sx > 940) {
        this.edge
          .setText(sx < 20 ? '⬅️' : '➡️')
          .setPosition(sx < 20 ? 34 + bob : 926 - bob, Math.max(110, Math.min(400, pt.y)))
          .setVisible(true);
      }
    });
  }

  private updateHouse(h: HouseState, v: HouseView, time: number): void {
    const d = this.dyn;
    const hs = h.street;
    const b = hs.body;
    const p = this.g.player;
    // státusz a buborékban
    const st = h.status;
    v.wish.setVisible(st === 'pending');
    v.status.setText(st === 'happy' ? '⭐' : st === 'sad' ? '😢' : st === 'lost' ? '❌' : '');
    if (st === 'happy' && !v.lit) this.lightHouse(h.idx);
    if (st === 'happy') v.status.setScale(1 + 0.08 * Math.sin(time * 0.006));
    v.name.setAlpha(st === 'lost' ? 0.5 : 1);

    // ébrenléti mérő a tetőn
    if (st !== 'lost') {
      const m = h.child.meter.ratio;
      const bx = hs.cx - 4;
      const by = b.y + b.h / 2 + 18;
      d.fillStyle(0x06102a, 0.75).fillRoundedRect(bx - 2, by - 2, 74, 12, 5);
      const col = m < 0.5 ? 0x5ad17a : m < 0.7 ? 0xffd36b : C.red;
      d.fillStyle(col, 1).fillRoundedRect(bx, by, Math.max(4, 70 * m), 8, 4);
      const awake = childAwake(h.child);
      v.cloud.setVisible(m >= 0.7 || awake);
      v.cloud.setText(awake ? '‼️' : '💭');
      if (v.cloud.visible) v.cloud.setScale(1 + 0.1 * Math.sin(time * 0.01));
    } else v.cloud.setVisible(false);

    // kutya
    if (h.dog && v.dog && v.dogFx) {
      const dog = h.dog;
      const chewing = dog.mode === 'chewing';
      v.dog.setText(chewing ? '🐕🦴' : '🐕').setDepth(dog.y);
      v.dog.setScale(dog.barkAnim > 0 ? 1.15 : 1);
      v.dogFx.setVisible(dog.barkAnim > 0 && !chewing).setScale(1 + dog.barkAnim);
      // ugatási kör, ha közel jársz
      if (!chewing && p.zone === STREET && Math.hypot(p.x - dog.x, p.y - dog.y) < 220 && h.status !== 'lost') {
        const T = this.g.tuning.dog;
        d.lineStyle(2, C.red, 0.35);
        d.strokeCircle(dog.x, dog.y, p.quiet ? T.radiusQuiet : T.radius);
      }
    }
    // macska
    if (h.cat && v.cat) {
      const m = h.cat.mode;
      v.cat.setVisible(m !== 'fed');
      if (m === 'yard') v.cat.setPosition(hs.catYard.x + Math.sin(time * 0.001 + h.idx) * 8, hs.catYard.y).setDepth(hs.catYard.y);
      else if (m === 'chimney') {
        v.cat.setPosition(hs.chimney.x, hs.chimney.y - 6).setDepth(500);
        d.fillStyle(C.red, 0.5 + 0.3 * Math.sin(time * 0.01)).fillCircle(hs.ladder.x, hs.ladder.y, 6);
      }
    }
  }
}
