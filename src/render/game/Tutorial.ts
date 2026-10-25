import Phaser from 'phaser';
import { emo, txt } from '../view';
import { STREET, icon } from '../../games/mikulas/types';
import type { MikulasGame, HouseState } from '../../games/mikulas/game';
import type { PackOverlay } from './PackOverlay';
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
  private ring: Phaser.GameObjects.Graphics;
  private startPos = { x: 0, y: 0 };
  active = true;

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
    pack: PackOverlay,
    touch: TouchControls,
    private onFinish: () => void,
  ) {
    const touchDev = isTouch();
    const p = g.player;
    const handGift = () => (p.hand.item && p.hand.item !== 'candy' ? p.hand.item : null);
    const target = (): HouseState | undefined => {
      const t = g.handTag;
      if (t >= 0 && g.houses[t].status === 'pending') return g.houses[t];
      return g.houses.find((h) => h.status === 'pending' && h.def.wish === handGift());
    };
    // a legközelebbi még kivihető, címkézett ajándék a szán mellett
    const nextItem = () => {
      let best = null as (typeof g.sledItems)[number] | null;
      for (const it of g.sledItems)
        if (!it.taken && !it.gone && it.tag >= 0 && g.houses[it.tag].status === 'pending')
          if (!best || Math.hypot(p.x - it.x, p.y - it.y) < Math.hypot(p.x - best.x, p.y - best.y)) best = it;
      return best;
    };

    this.steps = [
      {
        text: () => 'Pakolás! 🎒 Fent látod, ki mit kért. Koppints a zsákban a megfelelő ajándékokra!',
        done: () => g.level.houses.every((h) => g.packNeed(h.wish) <= 0),
        point: () => {
          const need = g.pack.sack.find((s) => g.packNeed(s.gift) > 0);
          const pos = need && pack.sackPos.get(need.id);
          return pos ? { x: pos.x, y: pos.y, screen: true } : null;
        },
      },
      {
        text: () => 'Minden a szánon! Nyomd meg: Indulás ▶',
        done: () => g.phase !== 'pack',
        point: () => ({ x: 850, y: 476, screen: true }),
      },
      {
        text: () =>
          touchDev
            ? 'Ez vagy te! 🎅 Húzd az ujjad a képernyő bal oldalán: arra megy a Mikulás.'
            : 'Ez vagy te! 🎅 Mozogj a WASD vagy a nyíl billentyűkkel.',
        enter: () => (this.startPos = { x: p.x, y: p.y }),
        done: () => Math.hypot(p.x - this.startPos.x, p.y - this.startPos.y) > 50,
        point: () => ({ x: p.x, y: p.y - 22, screen: false }),
      },
      {
        text: () => {
          const it = nextItem();
          const who = it ? `${g.houses[it.tag].def.child} ${icon(it.gift)}` : '';
          return `A szán mellett sorakoznak az ajándékok, rajtuk a ház száma és a gyerek neve. Állj ${who} ajándéka mellé, és nyomd meg a sárga gombot!`;
        },
        done: () => handGift() !== null,
        point: () => {
          const it = nextItem();
          return it ? { x: it.x, y: it.y, screen: false } : null;
        },
      },
      {
        text: () => {
          const h = target();
          return h
            ? `${h.def.child} a(z) ${h.idx + 1}. házban lakik. Kövesd a nyilat a háza létrájához 🪜!`
            : 'Kövesd a nyilat a ház létrájához 🪜!';
        },
        done: () => {
          const h = target();
          return p.zone !== STREET || (!!h && Math.hypot(p.x - h.street.ladder.x, p.y - h.street.ladder.y) < 46);
        },

      },
      {
        text: () =>
          touchDev
            ? 'Nyomd meg a sárga gombot: felmászol, és lecsúszol a kéményen. (Az ajtó 🚪 zajosabb!)'
            : 'Nyomd meg az E-t vagy a szóközt: felmászol, és lecsúszol a kéményen. (Az ajtó 🚪 zajosabb!)',
        done: () => p.zone !== STREET,
        point: () => (touchDev ? { x: touch.act.x, y: touch.act.y, screen: true } : null),
      },
      {
        text: () =>
          touchDev
            ? 'Bent vagy! Kapcsold be a 🤫 csendben-módot: lassabb, de sokkal halkabb.'
            : 'Bent vagy! Tartsd nyomva a Shiftet (vagy nyomd meg a Q-t): csendben-mód, sokkal halkabb.',
        done: (t) => p.quiet || t > 10,
        point: () => (touchDev ? { x: touch.qb.x, y: touch.qb.y, screen: true } : null),
      },
      {
        text: () => 'Vidd az ajándékot a fa alá, a csillogó körbe, és nyomd meg a sárga gombot!',
        done: () => p.zone === STREET || g.houses[p.zone].status !== 'pending',

      },
      {
        text: () => 'Szuper! 🌟 Fent a csík mutatja, mennyire ébredezik a gyerek. Ha megtelik, felébred! Most menj ki a kandallón át.',
        done: (t) => (p.zone === STREET && t > 2) || t > 14,
        point: () => {
          if (p.zone === STREET) return null;
          return this.t < 4 ? { x: 480, y: 29, screen: true } : { ...g.houses[p.zone].interior.fireSpot, screen: false };
        },
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
    this.finger = emo(scene, 0, 0, '👇', 40).setOrigin(0.5, 0.95).setDepth(D + 1).setVisible(false);
    this.ring = scene.add.graphics().setDepth(D + 1);

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

  /** a panel ne takarja azt, amire figyelni kell: a mutatóval ellentétes oldalra kerül */
  private panelY(): number {
    if (this.g.phase === 'pack') return 4;
    const pt = this.steps[this.i]?.point?.() ?? null;
    if (!pt) return this.g.player.zone !== STREET ? 404 : 56;
    return pt.y < 270 ? 404 : 56;
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
    this.ring.clear();
    if (pt) {
      const bob = Math.abs(Math.sin(time * 0.007)) * 10;
      const r = 26 + 4 * Math.sin(time * 0.01);
      this.ring.setScrollFactor(pt.screen ? 0 : 1);
      this.ring.lineStyle(4, 0xffd36b, 0.95).strokeCircle(pt.x, pt.y, r);
      this.ring.lineStyle(2, 0xffffff, 0.8).strokeCircle(pt.x, pt.y, r + 6);
      this.finger.setScrollFactor(pt.screen ? 0 : 1).setPosition(pt.x, pt.y - r - 2 - bob).setVisible(true);
    } else this.finger.setVisible(false);
  }

  finish(): void {
    if (!this.active) return;
    this.active = false;
    this.g.clockFrozen = false;
    this.g.hintsEnabled = true;
    this.panel.destroy();
    this.finger.destroy();
    this.ring.destroy();
    this.onFinish();
  }
}
