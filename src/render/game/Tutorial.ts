import Phaser from 'phaser';
import { CX, emo, txt } from '../view';
import { STREET, icon, isHouse } from '../../games/mikulas/types';
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
  /** ha kész, melyik lépés jön (alapból a következő) */
  next?: () => number;
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
    const allPacked = () => g.level.houses.every((h) => g.packNeed(h.wish) <= 0);
    const F = g.factory;
    // a szalagon látható, még szükséges ajándék, ami a legközelebb van
    const neededPile = () => {
      let best = null as (typeof g.pack.sack)[number] | null;
      for (const it of g.pack.sack)
        if (g.packNeed(it.gift) > 0 && it.beltX >= F.beltStart && it.beltX <= F.beltEnd)
          if (!best || Math.abs(p.x - it.beltX) < Math.abs(p.x - best.beltX)) best = it;
      return best;
    };
    // a legközelebbi még kivihető, címkézett ajándék a szánon
    const nextItem = () => {
      let best = null as (typeof g.sledItems)[number] | null;
      for (const it of g.sledItems)
        if (!it.taken && !it.gone && it.tag >= 0 && g.houses[it.tag].status === 'pending')
          if (!best || Math.hypot(p.x - it.x, p.y - it.y) < Math.hypot(p.x - best.x, p.y - best.y)) best = it;
      return best;
    };

    this.steps = [
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
          const need = neededPile();
          const ex = need ? ` (pl. ${icon(need.gift)})` : '';
          return `Mikulás-gyár! 🏭 Jobb oldalt látod, ki mit kért. Állj a futószalag elé, és amikor odaér egy kért ajándék${ex}, nyomd meg a sárga gombot!`;
        },
        done: () => !!g.pack.held || allPacked(),
        next: () => (allPacked() ? 3 : 2),
        point: () => {
          const need = neededPile();
          return need ? { x: need.beltX, y: F.beltY, screen: false } : null;
        },
      },
      {
        text: () => 'Most vidd a szánhoz, állj egy üres hely elé, és nyomd meg a sárga gombot! (Ami nem kell, visszadobhatod a szalagra.)',
        done: () => !g.pack.held,
        next: () => (allPacked() ? 3 : 1),
        point: () => {
          const free = g.street.slotOrder.find((i) => !g.pack.sled.some((x) => x.slot === i));
          return free === undefined ? null : { ...F.slots[free], screen: false };
        },
      },
      {
        text: () => 'Minden kért ajándék a szánon! Nyomd meg: Kész, indulás ▶',
        done: () => g.phase !== 'pack',
        point: () => ({ x: pack.btn.x, y: pack.btn.y, screen: true }),
      },
      {
        text: () =>
          touchDev
            ? 'Irány a falu! 🛷 A szán magától megy: húzd az ujjad fel-le a kormányzáshoz, előre a gyorsításhoz. Kerüld ki az akadályokat, szedd fel a ⭐-ot (+idő)!'
            : 'Irány a falu! 🛷 A szán magától megy: W/S (fel/le) kormányoz, D gyorsít, A fékez. Kerüld ki az akadályokat, szedd fel a ⭐-ot (+idő)!',
        done: () => g.phase !== 'drive',
      },
      {
        text: () => {
          const it = nextItem();
          const who = it ? `${g.houses[it.tag].def.child} ${icon(it.gift)}` : '';
          return `A szánon vannak az ajándékok, rajtuk a ház száma. Állj a szán mellé, ${who} ajándéka elé (a felső sort felülről, az alsót alulról éred el), és nyomd meg a sárga gombot!`;
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
          return isHouse(p.zone) || (!!h && Math.hypot(p.x - h.street.ladder.x, p.y - h.street.ladder.y) < 46);
        },

      },
      {
        text: () =>
          touchDev
            ? 'Nyomd meg a sárga gombot: felmászol, és lecsúszol a kéményen. (Az ajtó 🚪 zajosabb!)'
            : 'Nyomd meg az E-t vagy a szóközt: felmászol, és lecsúszol a kéményen. (Az ajtó 🚪 zajosabb!)',
        done: () => isHouse(p.zone),
        point: () => (touchDev ? { x: touch.act.x, y: touch.act.y, screen: true } : null),
      },
      {
        text: () =>
          touchDev
            ? 'Bent vagy! Kapcsold be a 🤫 csendben-módot: lassabb, de halkabb. (Ha valaki figyel, a 🪴 Bújás gombbal elbújhatsz: nem látnak, de nagyon lassú leszel.)'
            : 'Bent vagy! Shift/Q: csendben-mód, halkabb. (Ha valaki figyel, a C-vel elbújhatsz egy virág mögé: nem látnak, de nagyon lassú leszel.)',
        done: (t) => p.quiet || t > 10,
        point: () => (touchDev ? { x: touch.qb.x, y: touch.qb.y, screen: true } : null),
      },
      {
        text: () => 'Vidd az ajándékot a fa alá, a csillogó körbe, és nyomd meg a sárga gombot!',
        done: () => !isHouse(p.zone) || g.houses[p.zone].status !== 'pending',

      },
      {
        text: () => 'Szuper! 🌟 Fent a csík mutatja, mennyire ébredezik a gyerek. Ha megtelik, felébred! Most menj ki a kandallón át.',
        done: (t) => (p.zone === STREET && t > 2) || t > 14,
        point: () => {
          if (!isHouse(p.zone)) return null;
          return this.t < 4 ? { x: CX, y: 29, screen: true } : { ...g.houses[p.zone].interior.fireSpot, screen: false };
        },
      },
      {
        text: () => 'A többi ajándékkal is ugyanígy! Most indul az óra ⏱. Minden jó ajándék és bónusz plusz időt ad. Hajnalig vissza kell érned a szánhoz. Jó munkát!',
        enter: () => (this.g.clockFrozen = false),
        done: (t) => t > 5,
      },
    ];

    const D = 2500;
    this.bg = scene.add.graphics();
    this.text = txt(scene, 0, 0, '', 17, '#ffffff', { fontStyle: 'bold', align: 'center', wordWrap: { width: 540 } });
    const skip = txt(scene, 0, 0, 'Kihagyom ✕', 13, '#c9d7f2').setInteractive({ useHandCursor: true });
    skip.on('pointerdown', () => this.finish());
    this.panel = scene.add.container(CX, 0, [this.bg, this.text, skip]).setScrollFactor(0, 0, true).setDepth(D);
    (this.panel as unknown as { skip: Phaser.GameObjects.Text }).skip = skip;
    this.finger = emo(scene, 0, 0, '👇', 40).setOrigin(0.5, 0.95).setDepth(D + 1).setVisible(false);
    this.ring = scene.add.graphics().setDepth(D + 1);

    g.clockFrozen = true;
    g.hintsEnabled = false;
    // ha már a kézbesítésnél tartunk (pl. újraindítás), átugorjuk a pakolást
    if (g.phase !== 'pack') this.i = g.phase === 'drive' ? 4 : 5;
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
    const pt = this.steps[this.i]?.point?.() ?? null;
    if (!pt) return isHouse(this.g.player.zone) ? 404 : 56;
    return pt.y < 270 ? 404 : 56;
  }

  update(dt: number, time: number): void {
    if (!this.active) return;
    this.t += dt;
    const y = this.panelY();
    if (y !== this.panel.y) this.panel.setY(y);
    const s = this.steps[this.i];
    // ha visszatette az ajándékot, vissza a felvételhez
    if (this.i >= 6 && this.i <= 7 && this.g.player.zone === STREET && !this.g.player.hand.item) {
      this.i = 5;
      this.show();
      return;
    }
    const txtNow = s.text();
    if (txtNow !== this.text.text) this.layout(txtNow);
    if (s.done(this.t)) {
      this.scene.events.emit('tutorial-step');
      this.i = s.next ? s.next() : this.i + 1;
      if (this.i >= this.steps.length) return this.finish();
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
