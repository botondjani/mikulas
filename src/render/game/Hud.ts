import Phaser from 'phaser';
import { C, emo, txt } from '../view';
import { STREET, icon } from '../../games/mikulas/types';
import type { CaptionKind, MikulasGame } from '../../games/mikulas/game';

const KIND_COLORS: Record<CaptionKind, [string, number]> = {
  info: ['#eef4ff', 0x132650],
  warn: ['#3a2200', 0xffd36b],
  bad: ['#ffffff', 0xb8322d],
  good: ['#ffffff', 0x2f8a52],
  hint: ['#ffffff', 0x5a3c9a],
};

/** Képernyő-térbeli kijelzők: idő, pont, kéz/zseb, boldog házak, feliratok, mérő. */
export class Hud {
  private D = 1200;
  private timeT: Phaser.GameObjects.Text;
  private scoreT: Phaser.GameObjects.Text;
  private happyT: Phaser.GameObjects.Text;
  private hand: Phaser.GameObjects.Text;
  private pocket: Phaser.GameObjects.Text;
  private capBg: Phaser.GameObjects.Graphics;
  private capT: Phaser.GameObjects.Text;
  private meterBg: Phaser.GameObjects.Graphics;
  private meterT: Phaser.GameObjects.Text;
  private dawn: Phaser.GameObjects.Rectangle;
  private danger: Phaser.GameObjects.Graphics;
  private queue: { text: string; kind: CaptionKind }[] = [];
  private capLeft = 0;
  private lastSec = -1;
  readonly muteBtn: Phaser.GameObjects.Text;
  readonly pauseBtn: Phaser.GameObjects.Text;

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
  ) {
    const s = scene;
    const fix = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T, d = 0): T => {
      o.setScrollFactor(0);
      o.setDepth(this.D + d);
      return o;
    };
    this.dawn = fix(s.add.rectangle(480, 270, 960, 540, 0xff9a6a, 0).setDepth(950), -260);
    this.danger = fix(s.add.graphics(), -250);

    const panel = fix(s.add.graphics());
    panel.fillStyle(0x06102a, 0.6).fillRoundedRect(8, 8, 268, 42, 14);
    panel.fillStyle(0x06102a, 0.6).fillRoundedRect(756, 8, 196, 42, 14);
    panel.fillStyle(0xffffff, 0.15).fillRoundedRect(204, 13, 32, 32, 8).fillRoundedRect(240, 13, 30, 32, 8);
    this.timeT = fix(txt(s, 18, 29, '', 24, '#ffffff', { fontStyle: 'bold' }).setOrigin(0, 0.5), 1);
    this.scoreT = fix(txt(s, 124, 29, '', 19, '#ffd36b', { fontStyle: 'bold' }).setOrigin(0, 0.5), 1);
    this.hand = fix(emo(s, 220, 30, '', 22), 2);
    this.pocket = fix(emo(s, 255, 30, '', 18), 2);
    this.happyT = fix(txt(s, 770, 29, '', 22, '#ffffff', { fontStyle: 'bold' }).setOrigin(0, 0.5), 1);
    this.muteBtn = fix(emo(s, 880, 29, '🔊', 26), 1).setInteractive({ useHandCursor: true });
    this.pauseBtn = fix(emo(s, 926, 29, '⏸️', 26), 1).setInteractive({ useHandCursor: true });

    this.capBg = fix(s.add.graphics(), 2);
    this.capT = fix(txt(s, 480, 29, '', 17, '#ffffff', { fontStyle: 'bold', align: 'center', wordWrap: { width: 390 } }), 3);
    this.meterBg = fix(s.add.graphics(), 1);
    this.meterT = fix(txt(s, 480, 84, '', 16, '#ffffff', { fontStyle: 'bold' }), 2);

    g.events.on('caption', (c) => {
      // azonos felirat ne torlódjon
      if (this.queue.some((q) => q.text === c.text) || this.capT.text === c.text) return;
      if (c.kind === 'bad') this.queue.unshift(c);
      else this.queue.push(c);
      if (this.queue.length > 3) this.queue.length = 3;
    });
  }

  setMuted(m: boolean): void {
    this.muteBtn.setText(m ? '🔇' : '🔊');
  }

  update(dt: number, time: number): void {
    const g = this.g;
    const ph = g.phase;
    const left = ph === 'pack' ? 0 : g.phases.remaining;
    const sec = Math.ceil(left);
    const mm = Math.floor(sec / 60);
    const ss = String(sec % 60).padStart(2, '0');
    const label = ph === 'dawn' ? '🌅' : '⏱';
    this.timeT.setText(`${label} ${mm}:${ss}`);
    const urgent = ph === 'dawn' || (ph === 'deliver' && left < 15);
    const tc = urgent ? '#ff8a7a' : '#ffffff';
    if (this.timeT.style.color !== tc) this.timeT.setColor(tc);
    if (urgent && sec !== this.lastSec && sec <= 10) this.scene.events.emit('tick');
    this.lastSec = sec;
    this.scoreT.setText(`⭐ ${g.score.total}`);
    this.happyT.setText(`🏠 ${g.happyCount}/${g.houses.length}`);
    const p = g.player;
    this.hand.setText(p.hand.item ? icon(p.hand.item) : '');
    this.pocket.setText(p.pocket.item ? icon(p.pocket.item) : '');

    // hajnal: rózsaszínes derengés
    const dawnA = ph === 'dawn' ? 0.06 + 0.22 * g.phases.progress : ph === 'result' ? 0.28 : 0;
    this.dawn.setVisible(dawnA > 0);
    if (dawnA > 0) this.dawn.setFillStyle(0xff9a6a, dawnA);

    // feliratok
    this.capLeft -= dt;
    if (this.capLeft <= 0) {
      const next = this.queue.shift();
      if (next) {
        this.capLeft = Math.min(4.5, 2 + next.text.length * 0.03);
        const [col, bg] = KIND_COLORS[next.kind];
        this.capT.setText(next.text).setColor(col).setAlpha(1);
        this.capBg.clear().fillStyle(bg, 0.92);
        const w = Math.min(420, this.capT.width + 30);
        const h = Math.max(42, this.capT.height + 12);
        this.capT.setY(8 + h / 2);
        this.capBg.fillRoundedRect(480 - w / 2, 8, w, h, 14).setAlpha(1);
        this.capT.setScale(0.8);
        this.scene.tweens.add({ targets: this.capT, scale: 1, duration: 160, ease: 'Back.out' });
      } else if (this.capT.text) {
        this.capT.setAlpha(Math.max(0, this.capT.alpha - dt * 3));
        this.capBg.setAlpha(this.capT.alpha);
        if (this.capT.alpha <= 0) this.capT.setText('');
      }
    }

    // házon belül: nagy ébrenléti mérő
    this.meterBg.clear();
    if (p.zone !== STREET) {
      const h = g.houses[p.zone];
      const m = h.child.meter.ratio;
      const y = this.capT.text ? 76 : 29;
      this.meterBg.fillStyle(0x06102a, 0.7).fillRoundedRect(340, y - 14, 280, 28, 14);
      const col = m < 0.5 ? 0x5ad17a : m < 0.7 ? 0xffd36b : C.red;
      this.meterBg.fillStyle(col, 1).fillRoundedRect(344, y - 10, Math.max(10, 272 * m), 20, 10);
      this.meterBg.lineStyle(2, 0xffffff, 0.6).lineBetween(344 + 272 * 0.7, y - 12, 344 + 272 * 0.7, y + 12);
      const face = h.child.mode !== 'asleep' ? '😳' : m >= 0.7 ? '😣' : '😴';
      this.meterT.setText(`${face} ${h.def.child}`).setPosition(480, y).setVisible(true);
    } else this.meterT.setVisible(false);

    // veszély: piros szél, ha valaki gyanakszik
    let susp = 0;
    if (p.zone !== STREET) {
      const h = g.houses[p.zone];
      susp = Math.max(h.child.suspicion, h.grandpa?.suspicion ?? 0, h.child.meter.ratio >= 0.85 ? 0.3 : 0);
    }
    if (g.krampus.active && g.krampus.mode === 'chase') susp = Math.max(susp, 0.4);
    this.danger.clear();
    if (susp > 0.02) {
      const a = susp * (0.5 + 0.2 * Math.sin(time * 0.015));
      this.danger.lineStyle(26, 0xff2a2a, a).strokeRect(0, 0, 960, 540);
    }
  }
}
