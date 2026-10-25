import Phaser from 'phaser';
import { emo, txt } from '../view';
import { STREET, icon } from '../../games/mikulas/types';
import type { MikulasGame, HouseState } from '../../games/mikulas/game';
import type { PackOverlay } from './PackOverlay';
import type { Chooser } from './Chooser';
import type { TouchControls } from './TouchControls';
import { isTouch } from '../../fullscreen';

interface Pt {
  x: number;
  y: number;
  /** képernyő-koordináta (különben világ) */
  screen: boolean;
}

interface Step {
  text: () => string;
  done: (t: number) => boolean;
  point?: () => Pt | null;
  /** a lépés elején */
  enter?: () => void;
}

/**
 * Lépésről lépésre vezető tanuló kör az 1. pályán. Amíg tart, áll az óra
 * (a szereplők és a zajok működnek), a végén indul a valódi visszaszámlálás.
 */
export class Tutorial {
  private steps: Step[];
  private i = 0;
  private t = 0;
  private panel: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private finger: Phaser.GameObjects.Text;
  private startPos = { x: 0, y: 0 };
  active = true;

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
    pack: PackOverlay,
    chooser: Chooser,
    touch: TouchControls,
    private onFinish: () => void,
  ) {
    const touchDev = isTouch();
    const p = g.player;
    const handGift = () => (p.hand.item && p.hand.item !== 'candy' ? p.hand.item : null);
    const target = (): HouseState | undefined =>
      g.houses.find((h) => h.status === 'pending' && h.def.wish === handGift());
    const firstNeeded = () => g.houses.find((h) => h.status === 'pending' && g.sledStock[h.def.wish] > 0);

    this.steps = [
      {
        text: () => 'Pakolás! 🎒 Fent látod, ki mit kért. Koppints a zsákban a megfelelő ajándékokra!',
        done: () => g.level.houses.every((h) => g.packNeed(h.wish) <= 0),
        point: () => {
          const need = g.pack.sack.find((s) => g.packNeed(s.gift) > 0);
          const pos = need && pack.sackPos.get(need.id);
          return pos ? { x: pos.x, y: pos.y - 46, screen: true } : null;
        },
      },
      {
        text: () => 'Minden a szánon! Nyomd meg: Indulás ▶',
        done: () => g.phase !== 'pack',
        point: () => ({ x: 850, y: 420, screen: true }),
      },
      {
        text: () =>
          touchDev
            ? 'Ez vagy te! 🎅 Húzd az ujjad a képernyő bal oldalán, így mozogsz.'
            : 'Ez vagy te! 🎅 Mozogj a WASD vagy a nyíl billentyűkkel.',
        enter: () => (this.startPos = { x: p.x, y: p.y }),
        done: () => Math.hypot(p.x - this.startPos.x, p.y - this.startPos.y) > 50,
        point: () => (touchDev ? { x: 130, y: 360, screen: true } : { x: p.x, y: p.y - 70, screen: false }),
      },
      {
        text: () => {
          const h = firstNeeded();
          const ex = h ? ` (pl. ${icon(h.def.wish)})` : '';
          return `Állj a szán mellé, és koppints egy ajándékra${ex}, hogy a kezedbe vedd.${touchDev ? '' : ' Billentyű: 1–9.'}`;
        },
        done: () => handGift() !== null,
        point: () => {
          if (chooser.visible) {
            const h = firstNeeded();
            const idx = h ? chooser.slots.findIndex((s) => s.id === h.def.wish) : 0;
            const r = chooser.rects[Math.max(0, idx)];
            if (r) return { x: r.x, y: r.y - 52, screen: true };
          }
          const s = g.street.sledCenter;
          return { x: s.x, y: s.y - 60, screen: false };
        },
      },
      {
        text: () => `Ezt ${target()?.def.child ?? 'egy gyerek'} kérte! Kövesd a villogó nyilat a háza létrájához 🪜.`,
        done: () => {
          const h = target();
          return p.zone !== STREET || (!!h && Math.hypot(p.x - h.street.ladder.x, p.y - h.street.ladder.y) < 50);
        },
      },
      {
        text: () =>
          touchDev
            ? 'Nyomd meg a sárga gombot: felmászol, és lecsúszol a kéményen. (Az ajtó 🚪 zajosabb!)'
            : 'Nyomd meg az E-t vagy a szóközt: felmászol, és lecsúszol a kéményen. (Az ajtó 🚪 zajosabb!)',
        done: () => p.zone !== STREET,
        point: () => (touchDev ? { x: touch.act.x, y: touch.act.y - 88, screen: true } : null),
      },
      {
        text: () =>
          touchDev
            ? 'Bent vagy! Kapcsold be a 🤫 csendben-módot: lassabb, de sokkal halkabb.'
            : 'Bent vagy! Tartsd nyomva a Shiftet (vagy nyomd meg a Q-t): csendben-mód, sokkal halkabb.',
        done: (t) => p.quiet || t > 10,
        point: () => (touchDev ? { x: touch.qb.x, y: touch.qb.y - 74, screen: true } : null),
      },
      {
        text: () => 'Vidd az ajándékot a fa alá, a csillogó körbe, és nyomd meg a sárga gombot!',
        done: () => p.zone === STREET || g.houses[p.zone].status !== 'pending',
      },
      {
        text: () => 'Szuper! 🌟 Fent a csík mutatja, mennyire ébredezik a gyerek. Ha megtelik, felébred! Most menj ki a kandallón át.',
        done: (t) => (p.zone === STREET && t > 2) || t > 12,
        point: () => (p.zone !== STREET ? { x: 480, y: 70, screen: true } : null),
      },
      {
        text: () => 'A többi ajándékkal is ugyanígy! Most indul az óra ⏱. Hajnalig vissza kell érned a szánhoz. Jó munkát!',
        enter: () => (this.g.clockFrozen = false),
        done: (t) => t > 5,
      },
    ];

    const D = 2500;
    this.bg = scene.add.graphics();
    this.text = txt(scene, 0, 0, '', 17, '#ffffff', { fontStyle: 'bold', align: 'center', wordWrap: { width: 540 } });
    const skip = txt(scene, 0, 0, 'Kihagyom ✕', 13, '#c9d7f2').setInteractive({ useHandCursor: true });
    skip.on('pointerdown', () => this.finish());
    this.panel = scene.add.container(480, 0, [this.bg, this.text, skip]).setScrollFactor(0, 0, true).setDepth(D);
    (this.panel as unknown as { skip: Phaser.GameObjects.Text }).skip = skip;
    this.finger = emo(scene, 0, 0, '👇', 40).setDepth(D + 1).setVisible(false);

    g.clockFrozen = true;
    g.hintsEnabled = false;
    // ha már a kézbesítésnél tartunk (pl. újraindítás), átugorjuk a pakolást
    if (g.phase !== 'pack') this.i = 2;
    this.show();
  }

  private show(): void {
    const s = this.steps[this.i];
    this.t = 0;
    s.enter?.();
    this.layout(s.text());
  }

  private layout(text: string): void {
    this.text.setText(text);
    const w = Math.min(600, this.text.width + 40);
    const h = this.text.height + 34;
    this.panel.setY(this.panelY());
    this.text.setPosition(0, h / 2 - 6);
    this.bg.clear();
    this.bg.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, 4, w, h, 16);
    this.bg.fillStyle(0x5a3c9a, 0.96).fillRoundedRect(-w / 2, 0, w, h, 16);
    this.bg.lineStyle(2, 0xffd36b, 0.9).strokeRoundedRect(-w / 2, 0, w, h, 16);
    const skip = (this.panel as unknown as { skip: Phaser.GameObjects.Text }).skip;
    skip.setPosition(w / 2 - 44, h - 9);
  }

  /** a panel ne takarja azt, amire figyelni kell */
  private panelY(): number {
    const g = this.g;
    const p = g.player;
    if (g.phase === 'pack') return 4;
    if (p.zone !== STREET) return 404;
    const hand = p.hand.item;
    const topTarget = g.houses.some((h) => h.status === 'pending' && h.def.wish === hand && h.street.top);
    return topTarget ? 300 : 56;
  }

  update(dt: number, time: number): void {
    if (!this.active) return;
    this.t += dt;
    const y = this.panelY();
    if (y !== this.panel.y) this.panel.setY(y);
    const s = this.steps[this.i];
    // ha visszatette az ajándékot, vissza a felvételhez
    if (this.i >= 4 && this.i <= 5 && this.g.player.zone === STREET && !this.g.player.hand.item) {
      this.i = 3;
      this.show();
      return;
    }
    const txtNow = s.text();
    if (txtNow !== this.text.text) this.layout(txtNow);
    if (s.done(this.t)) {
      this.scene.events.emit('tutorial-step');
      if (++this.i >= this.steps.length) return this.finish();
      this.show();
      return;
    }
    const pt = s.point?.() ?? null;
    if (pt) {
      const bob = Math.abs(Math.sin(time * 0.007)) * 12;
      this.finger.setScrollFactor(pt.screen ? 0 : 1).setPosition(pt.x, pt.y - bob).setVisible(true);
    } else this.finger.setVisible(false);
  }

  finish(): void {
    if (!this.active) return;
    this.active = false;
    this.g.clockFrozen = false;
    this.g.hintsEnabled = true;
    this.panel.destroy();
    this.finger.destroy();
    this.onFinish();
  }
}
