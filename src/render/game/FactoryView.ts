import Phaser from 'phaser';
import { C, bake, emo, txt } from '../view';
import { PopupPool, RipplePool } from '../fx/pools';
import { FACTORY, icon } from '../../games/mikulas/types';
import type { MikulasGame } from '../../games/mikulas/game';

/** A Mikulás-gyár: futószalag, manók, a szán, amire pakolni kell. */
export class FactoryView {
  readonly layer: Phaser.GameObjects.Layer;
  readonly ripples: RipplePool;
  readonly popups: PopupPool;
  private dyn: Phaser.GameObjects.Graphics;
  private beltItems: Phaser.GameObjects.Text[] = [];
  private sledItems: Phaser.GameObjects.Text[] = [];
  private player: Phaser.GameObjects.Text;
  private carry: Phaser.GameObjects.Text;
  private targetLabel: Phaser.GameObjects.Text;
  private warn: Phaser.GameObjects.Text;
  private elves: Phaser.GameObjects.Text[] = [];
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
      { x: F.machine.x + 40, y: F.machine.y + F.machine.h + 26, e: '🧝' },
      { x: F.benches[0].x + 60, y: F.benches[0].y - 14, e: '🧝‍♀️' },
      { x: F.benches[1].x + 60, y: F.benches[1].y - 14, e: '🧝' },
    ];
    for (const a of elfAt) {
      const t = emo(scene, a.x, a.y, a.e, 40).setDepth(a.y + 10);
      this.elves.push(t);
      this.layer.add(t);
    }
    this.layer.add(emo(scene, F.benches[0].x + 25, F.benches[0].y + 22, '🔨', 22).setDepth(F.benches[0].y + 30));
    this.layer.add(emo(scene, F.benches[1].x + 95, F.benches[1].y + 22, '🎀', 22).setDepth(F.benches[1].y + 30));
    this.layer.add(emo(scene, F.sled.x - 50, F.sled.y + 30, '🦌', 40).setDepth(F.sled.y + 60));
    this.layer.add(emo(scene, F.sled.x - 100, F.sled.y + 36, '🦌', 40).setDepth(F.sled.y + 66));
    this.layer.add(emo(scene, F.machine.x + 40, F.machine.y + 52, '🎁', 34).setDepth(F.machine.y + 130));

    for (let i = 0; i < 16; i++) {
      const t = emo(scene, 0, 0, '', 30).setVisible(false).setDepth(F.belt.y + F.belt.h);
      this.beltItems.push(t);
      this.layer.add(t);
    }
    for (let i = 0; i < 12; i++) {
      const t = emo(scene, 0, 0, '', 28).setVisible(false).setDepth(F.sled.y + 70);
      this.sledItems.push(t);
      this.layer.add(t);
    }
    this.player = emo(scene, 0, 0, '🎅', 60).setOrigin(0.5, 0.85);
    this.carry = emo(scene, 0, 0, '', 32);
    this.targetLabel = txt(scene, 0, 0, '', 20, '#3a2200', {
      backgroundColor: '#ffd36b',
      padding: { x: 8, y: 4 },
      fontStyle: 'bold',
    }).setDepth(4000);
    this.warn = txt(scene, 0, 0, 'Ez nem kell! Dobd vissza a szalagra', 16, '#ffffff', {
      backgroundColor: '#b8322d',
      padding: { x: 6, y: 3 },
      fontStyle: 'bold',
    })
      .setDepth(4001)
      .setVisible(false);
    this.layer.add([this.player, this.carry, this.targetLabel, this.warn]);
    this.ripples = new RipplePool(scene, this.layer);
    this.popups = new PopupPool(scene, this.layer);
  }

  destroy(): void {
    this.layer.destroy(true);
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
    // a szán
    const S = F.sled;
    gr.fillStyle(0x000000, 0.2).fillRoundedRect(S.x + 4, S.y + 8, S.w, S.h, 14);
    gr.fillStyle(0xe0b040, 1).fillRect(S.x - 4, S.y + S.h - 6, S.w + 8, 5).fillRect(S.x - 4, S.y + 1, S.w + 8, 5);
    gr.fillStyle(C.red, 1).fillRoundedRect(S.x, S.y + 4, S.w, S.h - 8, 14);
    gr.fillStyle(0x8a2420, 1).fillRoundedRect(S.x + 10, S.y + 10, S.w - 20, S.h - 20, 10);
    gr.lineStyle(3, 0xe0b040, 1).strokeRoundedRect(S.x + 4, S.y + 6, S.w - 8, S.h - 12, 12);
    gr.lineStyle(6, 0xe0b040, 1);
    gr.beginPath();
    gr.arc(S.x - 6, S.y + S.h / 2, S.h / 2 - 4, Math.PI * 0.5, Math.PI * 1.5, false);
    gr.strokePath();
    this.layer.add(txt(this.scene, 480, 494, '🏭 Mikulás-gyár', 18, '#ffe7a8', { fontStyle: 'bold', stroke: '#3a1a0a', strokeThickness: 4 }).setDepth(1));
  }

  update(dt: number, time: number): void {
    const g = this.g;
    const F = g.factory;
    const p = g.player;
    const d = this.dyn;
    d.clear();
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.009);

    // mozgó szalag-csíkok és görgők
    const off = ((time / 1000) * g.tuning.belt.speed) % 24;
    d.lineStyle(2, 0x2a2e36, 1);
    for (let x = F.belt.x + off; x < F.belt.x + F.belt.w; x += 24) d.lineBetween(x, F.belt.y + 4, x, F.belt.y + F.belt.h - 4);
    d.fillStyle(0x8a8f9a, 1);
    for (let x = F.belt.x + 12; x < F.belt.x + F.belt.w; x += 60) d.fillCircle(x, F.belt.y + F.belt.h + 4, 4);

    // ajándékok a szalagon
    let k = 0;
    const held = g.pack.held;
    for (const it of g.pack.sack) {
      if (it.beltX < F.beltStart - 20 || it.beltX > F.beltEnd + 10 || k >= this.beltItems.length) continue;
      this.beltItems[k++].setText(icon(it.gift)).setPosition(it.beltX, F.beltY - 2 + Math.sin(time * 0.02 + it.id) * 1.5).setVisible(true);
      if (!held && g.packNeed(it.gift) > 0) d.lineStyle(3, C.warm, pulse).strokeCircle(it.beltX, F.beltY, 22);
    }
    for (; k < this.beltItems.length; k++) this.beltItems[k].setVisible(false);

    // a szánon
    k = 0;
    for (const it of g.pack.sled) {
      const sp = F.slots[it.slot];
      this.sledItems[k++].setText(icon(it.gift)).setPosition(sp.x, sp.y).setVisible(true);
    }
    for (; k < this.sledItems.length; k++) this.sledItems[k].setVisible(false);
    if (held)
      F.slots.forEach((sp, i) => {
        if (!g.pack.sled.some((x) => x.slot === i)) d.lineStyle(2, C.warm, 0.35 + 0.45 * pulse).strokeCircle(sp.x, sp.y, 17);
      });

    // manók dolgoznak
    this.elves.forEach((e, i) => e.setY(e.y + Math.sin(time * 0.012 + i * 2) * 0.4).setRotation(Math.sin(time * 0.008 + i) * 0.08));

    // célpont
    const t = g.target;
    if (t && p.zone === FACTORY) {
      d.lineStyle(3, C.warm, 0.9).strokeCircle(t.x, t.y, 26 * (1 + 0.12 * Math.sin(time * 0.008)));
      this.targetLabel.setText(`${t.icon} ${t.label}`).setPosition(t.x, t.y + (t.y < 270 ? 48 : -50)).setVisible(true);
    } else this.targetLabel.setVisible(false);

    // Mikulás
    const vis = p.zone === FACTORY;
    this.player.setVisible(vis);
    this.carry.setVisible(vis);
    if (vis) {
      this.walkT += dt * (6 + 9 * p.speed01) * (p.speed01 > 0.05 ? 1 : 0);
      const sq = p.speed01 > 0.05 ? Math.sin(this.walkT) * 0.08 : Math.sin(time * 0.004) * 0.02;
      this.player.setPosition(p.x, p.y).setScale(1 - sq * 0.6, 1 + sq).setDepth(p.y);
      if (Math.abs(p.vx) > 5) this.player.setFlipX(p.vx > 0);
      d.fillStyle(0x000000, 0.25).fillEllipse(p.x, p.y + 2, 46, 16);
      this.carry.setText(p.hand.item ? icon(p.hand.item) : '').setPosition(p.x, p.y - 80).setDepth(p.y + 1);
      const wrong = !!held && g.packNeed(held.gift) <= 0;
      this.warn.setVisible(wrong).setPosition(p.x, p.y - 112);
    } else this.warn.setVisible(false);

    this.ripples.update(dt);
    this.popups.update(dt);
  }
}
