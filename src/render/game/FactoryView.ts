import Phaser from 'phaser';
import { C, bake, emo, img, txt } from '../view';
import { PopupPool, RipplePool } from '../fx/pools';
import { Darkness } from '../fx/darkness';
import { FACTORY, icon } from '../../games/mikulas/types';
import type { MikulasGame } from '../../games/mikulas/game';

/** A Mikulás-gyár: futószalag, manók, a szán, amire pakolni kell. */
export class FactoryView {
  readonly layer: Phaser.GameObjects.Layer;
  readonly ripples: RipplePool;
  readonly popups: PopupPool;
  private dyn: Phaser.GameObjects.Graphics;
  private beltItems: Phaser.GameObjects.Text[] = [];
  private sledG: Phaser.GameObjects.Graphics;
  private deer: Phaser.GameObjects.Text[];
  private garage: Phaser.GameObjects.Graphics;
  private sack: Phaser.GameObjects.Graphics;
  /** a szán tolásának látszó hossza (simítva) */
  private pushX = 0;
  private over: Phaser.GameObjects.Graphics;
  private beltElves: { t: Phaser.GameObjects.Image; c: Phaser.GameObjects.Text }[] = [];
  private sledItems: Phaser.GameObjects.Text[] = [];
  private boxItems: Phaser.GameObjects.Text[] = [];
  private player: Phaser.GameObjects.Text;
  private elves: Phaser.GameObjects.Image[] = [];
  /** vihar: becsöpögő víz, villám, áramszünet */
  private wet: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Rectangle;
  private dark: Darkness;
  private beltOff = 0;
  private walkT = 0;

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
  ) {
    const F = g.factory;
    this.layer = scene.add.layer();
    const bg = scene.add.graphics();
    this.drawStatic(bg);
    this.layer.add(bake(scene, bg, 960, 540).setDepth(0));

    this.dyn = scene.add.graphics().setDepth(5);
    this.layer.add(this.dyn);
    // manók: a gépnél és a munkapadoknál
    const elfAt = [
      { x: F.machine.x + 40, y: F.machine.y + F.machine.h + 26, e: 'elf' },
      { x: F.benches[0].x + 60, y: F.benches[0].y - 14, e: 'elf2' },
      { x: F.benches[1].x + 60, y: F.benches[1].y - 14, e: 'elf' },
    ];
    for (const a of elfAt) {
      const t = img(scene, a.x, a.y + 20, a.e, 1).setOrigin(0.5, 1).setDepth(a.y + 10);
      this.elves.push(t);
      this.layer.add(t);
    }
    // a szalag túloldalán dolgozó manók, és ami a kezükben van
    for (let i = 0; i < g.elves.length; i++) {
      const t = img(scene, 0, 0, i % 2 ? 'elf2' : 'elf', 0.9).setOrigin(0.5, 1).setDepth(F.belt.y - 1);
      const c = emo(scene, 0, 0, '', 20).setDepth(F.belt.y);
      this.beltElves.push({ t, c });
      this.layer.add([t, c]);
    }
    this.layer.add(emo(scene, F.benches[0].x + 25, F.benches[0].y + 22, '🔨', 22).setDepth(F.benches[0].y + 30));
    this.layer.add(emo(scene, F.benches[1].x + 95, F.benches[1].y + 22, '🎀', 22).setDepth(F.benches[1].y + 30));
    // a szán és a rénszarvasok külön rajzolva: indulásnál elgördülnek
    this.sledG = scene.add.graphics().setDepth(F.sled.y + 5);
    this.drawSled(this.sledG);
    this.deer = [0, 1].map((i) => emo(scene, 0, 0, '🦌', 40).setFlipX(true).setDepth(F.sled.y + 60 + i * 6));
    // garázsajtó a jobb falon: indulásnál felhúzódik
    this.garage = scene.add.graphics().setDepth(F.sled.y + 90);
    // a manók nagy ajándékkupaca a bal szélen
    {
      const P = F.pile;
      const cols = [0xd9413b, 0x3b6e8f, 0xffd36b, 0x3f7a55, 0x9a4ad1, 0xe07a2a];
      const boxes = [
        [-30, 16, 26], [-4, 18, 28], [22, 16, 24], [-18, -4, 24], [8, -2, 26], [-6, -22, 22], [32, -6, 18], [-38, -6, 18],
      ];
      const pg = scene.add.graphics().setDepth(F.belt.y - 2);
      pg.fillStyle(0x000000, 0.2).fillEllipse(P.x, P.y + 30, 96, 18);
      boxes.forEach(([dx, dy, s], i) => {
        pg.fillStyle(cols[i % cols.length], 1).fillRect(P.x + dx - s / 2, P.y + dy - s / 2, s, s);
        pg.fillStyle(0xffffff, 0.85).fillRect(P.x + dx - 2, P.y + dy - s / 2, 4, s).fillRect(P.x + dx - s / 2, P.y + dy - 2, s, 4);
      });
      this.layer.add(pg);
    }
    // eszközös zsák (1×1 kocka): indulásnál a Mikulás a hátára veszi
    this.sack = scene.add.graphics().setVisible(F.boxSlots.length > 0);
    {
      const T = F.toolbox;
      const s = this.sack;
      s.fillStyle(0x9a7a4a, 1).fillRoundedRect(-T.w / 2, -T.h / 2 + 8, T.w, T.h - 8, 18);
      s.fillStyle(0xb8955e, 1).fillRoundedRect(-T.w / 2 + 6, -T.h / 2 + 12, T.w - 12, T.h - 20, 14);
      s.fillStyle(0x9a7a4a, 1).fillTriangle(-12, -T.h / 2 + 10, 12, -T.h / 2 + 10, 0, -T.h / 2 - 2);
      s.lineStyle(3, 0xc8323c, 1).lineBetween(-12, -T.h / 2 + 8, 12, -T.h / 2 + 8);
    }
    // jelölő karikák a szán és a zsák fölött (különben a szán alá kerülnének)
    this.over = scene.add.graphics().setDepth(F.sled.y + 85);
    this.layer.add(this.over);
    this.sack.setPosition(F.toolbox.x + F.toolbox.w / 2, F.toolbox.y + F.toolbox.h / 2).setDepth(F.toolbox.y + F.toolbox.h);
    this.layer.add([this.sledG, ...this.deer, this.garage, this.sack]);
    this.layer.add(emo(scene, F.machine.x + 40, F.machine.y + 52, '🎁', 34).setDepth(F.machine.y + 130));

    for (let i = 0; i < 16; i++) {
      const t = emo(scene, 0, 0, '', 30).setVisible(false).setDepth(F.belt.y + F.belt.h);
      this.beltItems.push(t);
      this.layer.add(t);
    }
    for (let i = 0; i < F.slots.length; i++) {
      const t = emo(scene, 0, 0, '', 28).setVisible(false).setDepth(F.sled.y + 70);
      this.sledItems.push(t);
      this.layer.add(t);
    }
    for (let i = 0; i < F.boxSlots.length; i++) {
      const t = emo(scene, F.boxSlots[i].x, F.boxSlots[i].y, '', 18).setVisible(false).setDepth(F.toolbox.y + 60);
      this.boxItems.push(t);
      this.layer.add(t);
    }
    this.player = emo(scene, 0, 0, '🎅', 50).setOrigin(0.5, 0.85);
    this.layer.add(this.player);
    this.wet = scene.add.graphics().setDepth(3);
    this.layer.add(this.wet);
    this.dark = new Darkness(scene, -300, 0, 1560, 540, 4800);
    this.flash = scene.add.rectangle(480, 270, 4000, 2000, 0xeef4ff, 0).setDepth(4900);
    this.layer.add([this.dark.rt, this.flash]);
    this.ripples = new RipplePool(scene, this.layer);
    this.popups = new PopupPool(scene, this.layer);
  }

  destroy(): void {
    this.dark.destroy();
    this.layer.destroy(true);
  }

  private drawSled(gr: Phaser.GameObjects.Graphics): void {
    const S = this.g.factory.sled;
    gr.fillStyle(0x000000, 0.2).fillRoundedRect(S.x + 4, S.y + 8, S.w, S.h, 14);
    gr.fillStyle(0xe0b040, 1).fillRect(S.x - 4, S.y + S.h - 6, S.w + 8, 5).fillRect(S.x - 4, S.y + 1, S.w + 8, 5);
    gr.fillStyle(C.red, 1).fillRoundedRect(S.x, S.y + 4, S.w, S.h - 8, 14);
    gr.fillStyle(0x8a2420, 1).fillRoundedRect(S.x + 10, S.y + 10, S.w - 20, S.h - 20, 10);
    gr.lineStyle(3, 0xe0b040, 1).strokeRoundedRect(S.x + 4, S.y + 6, S.w - 8, S.h - 12, 12);
    gr.lineStyle(6, 0xe0b040, 1);
    gr.beginPath();
    // felkunkorodó orr jobbra (a garázsajtó felé), gyeplő a rénszarvasokig
    gr.arc(S.x + S.w + 6, S.y + S.h / 2, S.h / 2 - 4, -Math.PI * 0.5, Math.PI * 0.5, false);
    gr.strokePath();
    gr.lineStyle(2, 0x6a3f28, 1).lineBetween(S.x + S.w, S.y + 16, S.x + S.w + 92, S.y + 30).lineBetween(S.x + S.w, S.y + S.h - 16, S.x + S.w + 92, S.y + 40);
  }

  private drawStatic(gr: Phaser.GameObjects.Graphics): void {
    const F = this.g.factory;
    const B = F.bounds;
    gr.fillStyle(0x06102a, 1).fillRect(0, 0, 960, 540);
    // padló: meleg, kockás fa
    gr.fillStyle(0xa8754f, 1).fillRect(B.x, B.y, B.w, B.h);
    for (let x = B.x; x < B.x + B.w; x += 60)
      for (let y = B.y; y < B.y + B.h; y += 60) if (((x - B.x) / 60 + (y - B.y) / 60) % 2 === 0) gr.fillStyle(0x9a6a46, 1).fillRect(x, y, 60, 60);
    // falak, ablakok, füzér
    gr.fillStyle(0x7a2a2a, 1);
    gr.fillRect(B.x - 16, B.y - 16, B.w + 32, 16);
    gr.fillRect(B.x - 16, B.y + B.h, B.w + 32, 16);
    gr.fillRect(B.x - 16, B.y - 16, 16, B.h + 32);
    gr.fillRect(B.x + B.w, B.y - 16, 16, B.h + 32);
    for (const wx of [250, 480, 710]) {
      gr.fillStyle(0x9ec4ff, 1).fillRect(wx - 40, B.y - 14, 80, 12);
      gr.fillStyle(0xffffff, 0.9).fillRect(wx - 36, B.y - 6, 72, 3);
    }
    const cols = [0xff5a5a, 0xffd36b, 0x6ad1ff, 0x7aff8a];
    for (let x = B.x + 20, k = 0; x < B.x + B.w; x += 34, k++) gr.fillStyle(cols[k % 4], 1).fillCircle(x, B.y + 6 + Math.sin(k) * 3, 4);
    // a gép (bal) és a visszaforduló csúszda (jobb)
    const M = F.machine;
    gr.fillStyle(0xc0392b, 1).fillRoundedRect(M.x, M.y, M.w, M.h, 10);
    gr.fillStyle(0xffd36b, 1).fillRect(M.x + 8, M.y + 10, M.w - 16, 8);
    gr.fillStyle(0x222222, 1).fillRect(M.x + M.w - 10, F.belt.y + 8, 10, F.belt.h - 16);
    const Ch = F.chute;
    gr.fillStyle(0x7d7d88, 1).fillRoundedRect(Ch.x, Ch.y, Ch.w, Ch.h, 10);
    gr.fillStyle(0x5f5f6a, 1).fillRoundedRect(Ch.x + 10, Ch.y + 20, Ch.w - 20, Ch.h - 40, 8);
    // futószalag teste
    const Bt = F.belt;
    gr.fillStyle(0x3a3f4a, 1).fillRect(Bt.x, Bt.y, Bt.w, Bt.h);
    gr.fillStyle(0x8a8f9a, 1).fillRect(Bt.x, Bt.y - 4, Bt.w, 5).fillRect(Bt.x, Bt.y + Bt.h - 1, Bt.w, 5);
    // munkapadok
    for (const b of F.benches) {
      gr.fillStyle(0x6b4024, 1).fillRoundedRect(b.x, b.y, b.w, b.h, 6);
      gr.fillStyle(0x8a5a3c, 1).fillRoundedRect(b.x + 4, b.y + 4, b.w - 8, b.h - 14, 4);
    }
    this.layer.add(txt(this.scene, 480, 494, '🏭 Mikulás-gyár', 18, '#ffe7a8', { fontStyle: 'bold', stroke: '#3a1a0a', strokeThickness: 4 }).setDepth(1));
  }

  update(dt: number, time: number): void {
    const g = this.g;
    const F = g.factory;
    const p = g.player;
    const d = this.dyn;
    d.clear();
    this.over.clear();
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.009);

    // mozgó szalag-csíkok és görgők (áramszünetben állnak)
    this.beltOff = (this.beltOff + dt * g.tuning.belt.speed) % 24;
    const off = this.beltOff;
    d.lineStyle(2, 0x2a2e36, 1);
    for (let x = F.belt.x + off; x < F.belt.x + F.belt.w; x += 24) d.lineBetween(x, F.belt.y + 4, x, F.belt.y + F.belt.h - 4);
    d.fillStyle(0x8a8f9a, 1);
    for (let x = F.belt.x + 12; x < F.belt.x + F.belt.w; x += 60) d.fillCircle(x, F.belt.y + F.belt.h + 4, 4);

    // ajándékok a szalagon
    let k = 0;
    const held = g.pack.held;
    for (const it of g.pack.sack) {
      if (it.beltX < F.beltStart - 20 || it.beltX > F.beltEnd + 10 || k >= this.beltItems.length) continue;
      this.beltItems[k++].setText(icon((it.gift ?? it.tool)!)).setPosition(it.beltX, F.beltY - 2 + Math.sin(time * 0.02 + it.id) * 1.5).setVisible(true);
      if (!held && it.gift && g.packNeed(it.gift) > 0) d.lineStyle(3, C.warm, pulse).strokeCircle(it.beltX, F.beltY, 22);
    }
    for (; k < this.beltItems.length; k++) this.beltItems[k].setVisible(false);

    // manók: a szalag mögött jönnek-mennek, és leteszik a szalagra, ami a kezükben van
    g.elves.forEach((e, i) => {
      const v = this.beltElves[i];
      const walking = Math.abs(e.tx - e.x) > 3 && e.dropT <= 0 && e.wait <= 0 && e.item >= 0;
      const face = e.tx > e.x ? 1 : -1;
      const bob = walking ? Math.abs(Math.sin(time * (g.mode.hard ? 0.03 : 0.018) + i)) * 4 : 0;
      v.t.setPosition(e.x, F.belt.y + 6 - bob);
      if (walking) v.t.setFlipX(e.tx > e.x);
      const it = e.item >= 0 ? g.pack.sack.find((x) => x.id === e.item) : undefined;
      // a kezükben viszik (felvétel után); letételkor a szalagra ereszkedik
      v.c.setVisible(!!it && e.carry);
      if (it && e.carry) {
        const k2 = e.dropT > 0 ? 1 - e.dropT / 0.3 : 0;
        v.c.setText(icon((it.gift ?? it.tool)!)).setPosition(e.x + face * 12, F.belt.y - 12 - bob + k2 * (F.beltY - F.belt.y + 12));
      }
    });

    // indulás: a Mikulás megtolja a szánt, felugrik rá, és kigördülnek a gyárból
    // (tolás: a gombnyomásokkal araszol; kigördülés: gyorsulva ki a garázsból)
    this.pushX += (g.launchP * g.tuning.pushDist - this.pushX) * Math.min(1, dt * 8);
    const roll = g.launchT > 0 ? 1 - g.launchT / g.tuning.launch : 0;
    const lk = g.launchP > 0 ? 1 : 0;
    const ox = lk > 0 ? this.pushX + 1000 * roll ** 2 : 0;
    this.sledG.x = ox;
    this.deer.forEach((t, i) => t.setX(F.sled.x + F.sled.w + 60 + i * 50 + ox).setY(F.sled.y + 30 + i * 6 + (roll > 0 ? Math.sin(time * 0.04 + i) * 3 : 0)));
    // garázsajtó: indulás elején felhúzódik
    const B0 = F.bounds;
    const open = lk <= 0 ? 0 : Math.min(1, g.launchP * 1.6 + roll);
    const gy = F.sled.y - 24;
    const gh = F.sled.h + 48;
    this.garage.clear();
    this.garage.fillStyle(0x0a1530, 1).fillRect(B0.x + B0.w - 2, gy, 20, gh);
    this.garage.fillStyle(0x8a919c, 1).fillRect(B0.x + B0.w - 2, gy, 20, gh * (1 - open));
    this.garage.lineStyle(1.5, 0x5a606a, 1);
    for (let y = gy + 8; y < gy + gh * (1 - open); y += 9) this.garage.lineBetween(B0.x + B0.w - 2, y, B0.x + B0.w + 18, y);
    // a szánon
    k = 0;
    for (const it of g.pack.sled) {
      const sp = F.slots[it.slot];
      this.sledItems[k++].setText(icon(it.gift!)).setPosition(sp.x + ox, sp.y).setVisible(true);
    }
    for (; k < this.sledItems.length; k++) this.sledItems[k].setVisible(false);
    this.boxItems.forEach((t, i) => {
      const it = g.pack.box.find((x) => x.slot === i);
      t.setText(it ? icon(it.tool!) : '').setVisible(!!it && lk <= 0);
    });
    // hová teheted: ajándékot a szánra, eszközt a ládába
    if (held) {
      if (held.gift)
        F.slots.forEach((sp, i) => {
          if (!g.pack.sled.some((x) => x.slot === i)) this.over.lineStyle(2, C.warm, 0.35 + 0.45 * pulse).strokeCircle(sp.x, sp.y, 17);
        });
      // eszköz: maga a zsák a lerakóhely
      else if (g.pack.box.length < F.boxSlots.length)
        this.over.lineStyle(3, C.warm, 0.35 + 0.45 * pulse).strokeCircle(F.toolbox.x + F.toolbox.w / 2, F.toolbox.y + F.toolbox.h / 2, 40);
    }

    // manók dolgoznak
    this.elves.forEach((e, i) => e.setY(e.y + Math.sin(time * 0.012 + i * 2) * 0.4).setRotation(Math.sin(time * 0.008 + i) * 0.08));

    // célpont (felirat nélkül)
    const t = g.target;
    if (t && p.zone === FACTORY) this.over.lineStyle(3, C.warm, 0.9).strokeCircle(t.x, t.y, 26 * (1 + 0.12 * Math.sin(time * 0.008)));

    // vihar: tócsák, csöpögés, villám, áramszünet
    const S = g.storm;
    const w = this.wet;
    w.clear();
    for (const pd of S.puddles) {
      w.fillStyle(0x6a9ccc, 0.55).fillEllipse(pd.x, pd.y, pd.r * 2.2, pd.r * 1.4);
      w.fillStyle(0xbfe0ff, 0.5).fillEllipse(pd.x - pd.r * 0.3, pd.y - pd.r * 0.2, pd.r * 0.8, pd.r * 0.3);
      // csöpögés a tócsába
      const ph = ((time / 700 + pd.x) % 1 + 1) % 1;
      w.fillStyle(0xbfe0ff, 0.9).fillEllipse(pd.x, pd.y - 60 + ph * 60, 4, 8);
      if (ph > 0.9) w.lineStyle(1, 0xffffff, 0.8).strokeEllipse(pd.x, pd.y, 14 + (ph - 0.9) * 200, 6 + (ph - 0.9) * 80);
    }
    this.flash.setFillStyle(0xeef4ff, S.flash > 0 ? Math.min(0.75, S.flash * 3) : 0);
    if (!S.power && p.zone === FACTORY) this.dark.draw(p.x, p.y, p.dir, p.flashlight, g.tuning.light);
    else this.dark.hide();

    // Mikulás
    const vis = p.zone === FACTORY;
    this.player.setVisible(vis);
    if (vis) {
      this.walkT += dt * (6 + 9 * p.speed01) * (p.speed01 > 0.05 ? 1 : 0);
      const sq = p.speed01 > 0.05 ? Math.sin(this.walkT) * 0.08 : Math.sin(time * 0.004) * 0.02;
      this.player.setPosition(p.x, p.y).setScale(1 - sq * 0.6, 1 + sq).setDepth(p.y).setRotation(0);
      if (Math.abs(p.vx) > 5) this.player.setFlipX(p.vx > 0);
      // a zsák a helyén; indulásnál a Mikulás hátára kerül, és vele utazik
      const T = F.toolbox;
      this.sack.setPosition(T.x + T.w / 2, T.y + T.h / 2).setScale(1).setDepth(T.y + T.h).setRotation(0);
      if (lk > 0) {
        const S = F.sled;
        const rearX = S.x - 26 + ox;
        const seatX = S.x + S.w * 0.3 + ox;
        const seatY = S.y + S.h / 2 + 4;
        if (roll <= 0) this.player.setPosition(rearX, S.y + S.h / 2 + 22).setRotation(0.25 + Math.min(0.15, Math.abs(g.launchP * g.tuning.pushDist - this.pushX) * 0.02)).setFlipX(true);
        else {
          // felugrik a szán végére, és rajta marad
          const h = Math.min(1, roll / 0.25);
          this.player.setPosition(rearX + (seatX - rearX) * h, seatY + 18 * (1 - h) - Math.sin(h * Math.PI) * 40).setRotation(0).setDepth(S.y + 80);
        }
        // zsák a hátán: az elején a helyéről a vállára lendül
        const back = { x: this.player.x - 18, y: this.player.y - 30 };
        const sk = Math.min(1, this.pushX / 30);
        const sx = T.x + T.w / 2 + (back.x - T.x - T.w / 2) * sk;
        const sy = T.y + T.h / 2 + (back.y - T.y - T.h / 2) * sk - Math.sin(sk * Math.PI) * 30;
        this.sack.setPosition(sx, sy).setScale(1 - 0.35 * sk).setRotation(-0.3 * sk).setDepth(this.player.depth - 1);
      }
      if (lk <= 0) d.fillStyle(0x000000, 0.25).fillEllipse(p.x, p.y + 2, 46, 16);
      // ami nem kell: piros kör a Mikulás körül (dobd vissza a szalagra)
      if (held?.gift && g.packNeed(held.gift) <= 0) d.lineStyle(3, C.red, 0.5 + 0.4 * pulse).strokeCircle(p.x, p.y - 26, 40);
    }

    this.ripples.update(dt);
    this.popups.update(dt);
  }
}
