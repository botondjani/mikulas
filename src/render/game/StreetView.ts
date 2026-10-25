import Phaser from 'phaser';
import { C, VW, Z, bake, emo, img, txt } from '../view';
import { PopupPool, RipplePool } from '../fx/pools';
import { STREET, icon, type StockTool } from '../../games/mikulas/types';
import type { MikulasGame, HouseState } from '../../games/mikulas/game';
import { childAwake, mostAwake } from '../../games/mikulas/agents/child';
import { copCone, policeCone } from '../../games/mikulas/agents/police';
import type { Obstacle } from '../../games/mikulas/layout';

const ROOFS = [0x9c3b3b, 0x3b6e8f, 0x6b4a8a, 0x3f7a55, 0x9a6a2e, 0x7a3b5e, 0x2f6f6a, 0x8a4a3a];

interface HouseView {
  wish: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  glow: Phaser.GameObjects.Image;
  windows: Phaser.GameObjects.Graphics;
  dog?: Phaser.GameObjects.Text;
  dogFx?: Phaser.GameObjects.Text;
  cloud: Phaser.GameObjects.Text;
  /** lejárt az idő: a háziak kiszaladnak és sikítanak */
  scream: Phaser.GameObjects.Text;
  lit: boolean;
}

/** Az utca megjelenítése (felülnézet). */
/** a beérkezés hossza (mp) */
const INTRO = 2.2;

export class StreetView {
  readonly layer: Phaser.GameObjects.Layer;
  readonly ripples: RipplePool;
  readonly popups: PopupPool;
  private dyn: Phaser.GameObjects.Graphics;
  private over: Phaser.GameObjects.Graphics;
  private views: HouseView[] = [];
  private strays: { dog: Phaser.GameObjects.Text; fx: Phaser.GameObjects.Text }[] = [];
  private player: Phaser.GameObjects.Text;
  private krampus: Phaser.GameObjects.Text;
  private kBubble: Phaser.GameObjects.Text;
  private droppedGifts: Phaser.GameObjects.Text[] = [];
  private candies: Phaser.GameObjects.Text[] = [];
  private giftViews: { icon: Phaser.GameObjects.Text; tag: Phaser.GameObjects.Text }[] = [];
  private toolViews = new Map<string, Phaser.GameObjects.Text>();
  private blizzard: Phaser.GameObjects.Image;
  private fog: Phaser.GameObjects.Image;
  private cars: Phaser.GameObjects.Text[] = [];
  private cops: Phaser.GameObjects.Text[] = [];
  private copAlerts: Phaser.GameObjects.Text[] = [];
  private cuffs: Phaser.GameObjects.Text;
  private carFx: Phaser.GameObjects.Graphics;
  /** a villogó a köd fölött is látszik */
  private carLights: Phaser.GameObjects.Graphics;
  private guides: Phaser.GameObjects.Text[] = [];
  private edge: Phaser.GameObjects.Text;
  private snowGfx: Phaser.GameObjects.Graphics;
  private sledG: Phaser.GameObjects.Graphics;
  private toolTable: Phaser.GameObjects.Graphics;
  private deer: Phaser.GameObjects.Text[];
  private sledOx = 0;
  /** beérkezés animáció hátralévő ideje (közben a vezérlés áll) */
  introT = 0;
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
    this.sledG = scene.add.graphics().setDepth(st.sled.y + 2);
    this.drawSled(this.sledG);
    this.deer = [
      emo(scene, st.reindeer.x + 22, st.reindeer.y + 16, '🦌', 34).setFlipX(true).setDepth(st.reindeer.y + 30),
      emo(scene, st.reindeer.x + 66, st.reindeer.y + 20, '🦌', 34).setFlipX(true).setDepth(st.reindeer.y + 32),
    ];
    this.layer.add([this.sledG, ...this.deer]);
    // beérkezés a faluba: a szán becsúszik a főtérre, a Mikulás leugrik
    this.toolTable = scene.add.graphics().setDepth(st.toolSlots.candy.y - 20);
    this.layer.add(this.toolTable);
    g.events.on('phase', (e) => {
      if (e.phase === 'deliver') {
        this.introT = INTRO;
        this.drawToolTable();
      }
    });
    // a bak: innen lehet hazaindulni
    const hs = st.homeSpot;
    this.layer.add(emo(scene, hs.x, hs.y - 2, '🏠', 22).setDepth(hs.y).setAlpha(0.85));
    // tér: nagy karácsonyfa, ajándékok a helyükön, eszközök
    this.layer.add(emo(scene, st.plazaX, st.plazaTree.y + 14, '🎄', 74).setDepth(st.plazaTree.y + st.plazaTree.h));
    for (const slot of st.giftSlots) {
      const ic = emo(scene, slot.x, slot.y, '', 28).setDepth(slot.y + 5).setVisible(false);
      const tag = txt(scene, slot.x + 15, slot.y - 11, '', 11, '#ffffff', {
        fontStyle: 'bold',
        backgroundColor: '#5a3c9a',
        padding: { x: 3, y: 0 },
      })
        .setDepth(slot.y + 6)
        .setVisible(false);
      this.giftViews.push({ icon: ic, tag });
      this.layer.add([ic, tag]);
    }
    const ts = st.toolSlots;
    for (const k of ['candy', 'bone', 'fish', 'bell'] as const) {
      const t = emo(scene, ts[k].x, ts[k].y - 2, '', 26).setDepth(ts[k].y + 5);
      this.toolViews.set(k, t);
      this.layer.add(t);
    }
    for (const o of st.obstacles) {
      const e = { pine: '🌲', snowman: '⛄', bin: '🗑️' }[o.kind as string];
      if (e)
        this.layer.add(
          emo(scene, o.rect.x + o.rect.w / 2, o.rect.y + o.rect.h / 2 - 6, e, o.kind === 'bin' ? 30 : 40).setDepth(o.rect.y + o.rect.h),
        );
    }

    this.dyn = scene.add.graphics().setDepth(2);
    // jelölő karikák a szán, az eszközasztal és a tárgyak fölött
    this.over = scene.add.graphics().setDepth(4300);
    this.layer.add([this.dyn, this.over]);

    // kóbor kutyák: barnásra színezve, hogy ne tévesszük össze az udvari kutyákkal
    for (let i = 0; i < g.strays.length; i++) {
      const dog = emo(scene, 0, 0, '🐕', 30).setOrigin(0.5, 0.8).setTint(0xd8a070);
      const fx = txt(scene, 0, 0, '!', 18, '#ffffff', { fontStyle: 'bold', stroke: '#b8322d', strokeThickness: 4 }).setVisible(false);
      this.strays.push({ dog, fx });
      this.layer.add([dog, fx]);
    }

    for (let i = 0; i < 4; i++) {
      const c = emo(scene, 0, 0, '🍬', 24).setVisible(false);
      this.candies.push(c);
      this.layer.add(c);
    }
    this.krampus = emo(scene, 0, 0, '👹', 46).setOrigin(0.5, 0.85).setVisible(false);
    this.kBubble = txt(scene, 0, 0, '', 15, '#3a2200', { backgroundColor: '#ffffff', padding: { x: 6, y: 3 }, fontStyle: 'bold' })
      .setDepth(4100)
      .setVisible(false);
    for (let i = 0; i < 2; i++) {
      const t = emo(scene, 0, 0, '', 30).setVisible(false);
      this.droppedGifts.push(t);
      this.layer.add(t);
    }
    this.layer.add(this.kBubble);
    this.player = emo(scene, 0, 0, '🎅', 38).setOrigin(0.5, 0.85);
    this.layer.add([this.krampus, this.player]);

    this.burst = scene.add.particles(0, 0, 'spark', {
      speed: { min: 50, max: 140 },
      lifespan: 900,
      scale: { start: 2.4 / Z, end: 0 },
      gravityY: 120,
      emitting: false,
    });
    this.burst.setDepth(4500);
    this.layer.add(this.burst);
    this.snowGfx = scene.add.graphics().setDepth(4400);
    this.layer.add(this.snowGfx);
    g.events.on('snowHit', (e) => this.burst.explode(16, e.x, e.y));

    for (let i = 0; i < 4; i++) {
      const a = emo(scene, 0, 0, '⬇️', 34).setDepth(4600).setVisible(false);
      this.guides.push(a);
      this.layer.add(a);
    }
    // a képernyőn kívüli célház felé mutató nyíl (képernyő-térben)
    this.edge = emo(scene, 0, 0, '', 40).setScrollFactor(0).setDepth(1250).setVisible(false);

    // az időjárás képe jóval nagyobb a pályánál, hogy a széle soha ne látsszon
    this.blizzard = scene.add.image(0, 0, 'blizzard').setDisplaySize(3000, 3000).setDepth(4800).setAlpha(0);
    this.layer.add(this.blizzard);
    this.fog = scene.add.image(0, 0, 'fog').setDisplaySize(3000, 3000).setDepth(4790).setAlpha(0);
    this.layer.add(this.fog);
    // rendőrautók: a fényszóró a talajon, alattuk
    this.carFx = scene.add.graphics().setDepth(3);
    this.carLights = scene.add.graphics().setDepth(4795);
    this.layer.add([this.carFx, this.carLights]);
    for (let i = 0; i < g.police.length; i++) {
      const t = emo(scene, 0, 0, '🚓', 46);
      this.cars.push(t);
      this.layer.add(t);
      for (let j = 0; j < 2; j++) {
        const c = emo(scene, 0, 0, '👮', 38).setOrigin(0.5, 0.85).setVisible(false);
        const a = emo(scene, 0, 0, '❗', 24).setDepth(4600).setVisible(false);
        this.cops.push(c);
        this.copAlerts.push(a);
        this.layer.add([c, a]);
      }
    }
    this.cuffs = emo(scene, 0, 0, '⛓️', 28).setDepth(4700).setVisible(false);
    this.layer.add(this.cuffs);

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
      if (hs.top) gr.fillRect(hs.door.x - 16, front, 32, 215 - front);
      else gr.fillRect(hs.door.x - 16, 325, 32, front - 325);
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
      gr.fillRect(hs.door.x - 13, hs.top ? front - 6 : front, 26, 6);
      // létra a kéményhez
      gr.lineStyle(3, 0xc89a60, 1);
      const lx = hs.ladder.x;
      const ly1 = hs.top ? front + 12 : front - 12;
      const ly2 = hs.chimney.y + (hs.top ? 16 : -16);
      gr.lineBetween(lx - 7, ly1, lx - 7, ly2);
      gr.lineBetween(lx + 7, ly1, lx + 7, ly2);
      for (let y = Math.min(ly1, ly2) + 6; y < Math.max(ly1, ly2); y += 10) gr.lineBetween(lx - 7, y, lx + 7, y);
      // kívánság-buborék a tetőn
      const cy = b.y + b.h / 2;
      gr.fillStyle(0xffffff, 0.95);
      gr.fillCircle(hs.cx - 30, cy - 4, 25);
      gr.fillTriangle(hs.cx - 14, cy + 14, hs.cx - 4, cy + 24, hs.cx - 6, cy + 8);
    }

    // a tér: kikövezett, letaposott hó
    const P = st.plazaX;
    gr.fillStyle(0x7d91c4, 1);
    gr.fillRoundedRect(P - 275, 118, 550, 306, 40);
    gr.lineStyle(3, 0x95a8d6, 0.8);
    gr.strokeRoundedRect(P - 275, 118, 550, 306, 40);
    for (const o of st.obstacles) drawGroundObstacle(gr, o);

  }

  /** a szán (külön objektum: beérkezéskor becsúszik a főtérre) */
  private drawSled(gr: Phaser.GameObjects.Graphics): void {
    // szán
    const sl = this.g.street.sled;
    gr.fillStyle(0x000000, 0.2);
    gr.fillRoundedRect(sl.x + 4, sl.y + 8, sl.w, sl.h, 14);
    gr.fillStyle(0xe0b040, 1);
    gr.fillRect(sl.x - 4, sl.y + sl.h - 6, sl.w + 8, 5);
    gr.fillRect(sl.x - 4, sl.y + 1, sl.w + 8, 5);
    gr.fillStyle(C.red, 1);
    gr.fillRoundedRect(sl.x, sl.y + 4, sl.w, sl.h - 8, 14);
    // a szán platója: itt állnak az ajándékok
    gr.fillStyle(0x8a2420, 1);
    gr.fillRoundedRect(sl.x + 10, sl.y + 10, sl.w - 20, sl.h - 20, 10);
    gr.lineStyle(3, 0xe0b040, 1);
    gr.strokeRoundedRect(sl.x + 4, sl.y + 6, sl.w - 8, sl.h - 12, 12);
    // felkunkorodó orr a rénszarvasok felé
    gr.lineStyle(6, 0xe0b040, 1);
    gr.beginPath();
    gr.arc(sl.x + sl.w + 6, sl.y + sl.h / 2, sl.h / 2 - 4, -Math.PI * 0.5, Math.PI * 0.5, false);
    gr.strokePath();
    // gyeplő a rénszarvasokig
    gr.lineStyle(2, 0x6a3f28, 1);
    const rd = this.g.street.reindeer;
    gr.lineBetween(sl.x + sl.w, sl.y + 14, rd.x + 10, rd.y + 14);
    gr.lineBetween(sl.x + sl.w, sl.y + sl.h - 14, rd.x + 10, rd.y + rd.h - 10);
  }

  /** Az eszközasztal: csak annyi hely, ahány féle eszközt hoztunk (a játék már elrendezte őket). */
  private drawToolTable(): void {
    const g = this.g;
    const ts = g.street.toolSlots;
    const kinds = (['candy', 'bone', 'fish', 'bell'] as const).filter((k) => g.toolStock[k] > 0);
    const gr = this.toolTable;
    gr.clear();
    for (const k of ['candy', 'bone', 'fish', 'bell'] as const) this.toolViews.get(k)?.setPosition(ts[k].x, ts[k].y - 2);
    if (!kinds.length) return;
    const x0 = Math.min(...kinds.map((k) => ts[k].x));
    const x1 = Math.max(...kinds.map((k) => ts[k].x));
    gr.fillStyle(0x4a3020, 1).fillRoundedRect(x0 - 40, ts[kinds[0]].y - 18, x1 - x0 + 80, 44, 10);
    gr.fillStyle(0x6a4a30, 1);
    for (const k of kinds) gr.fillRoundedRect(ts[k].x - 30, ts[k].y - 10, 60, 30, 8);
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
    // név és sorszám nincs: a nyíl mutatja, hová kell vinni
    const name = txt(s, hs.cx + 30, cy - 6, '', 17, '#ffffff', {
      fontStyle: 'bold',
      stroke: '#06102a',
      strokeThickness: 4,
    }).setDepth(4);
    const status = emo(s, hs.cx - 30, cy - 4, '', 30).setDepth(5);
    const cloud = emo(s, hs.cx + 64, cy + 14, '💭', 22).setDepth(5).setVisible(false);
    this.layer.add([wish, name, status, cloud]);
    if (h.grandpa) {
      const e = { grandpa: '👴', tv: '📺', grandma: '👵' }[h.grandpa.kind];
      this.layer.add(emo(s, hs.cx - 76, cy + 26, e, 20).setDepth(5));
    }
    // ki alszik még bent, és sötét-e a ház
    const extra = (h.others.some((o) => o.kind === 'parents') ? '👫' : '') + (h.others.some((o) => o.kind === 'sibling') ? '🧒' : '') + ({ on: '', partial: '🌗', off: '🌑' }[h.def.light ?? 'on']);
    if (extra) this.layer.add(emo(s, hs.cx + 64, cy + 30, extra, 18).setDepth(5));
    const scream = emo(s, hs.door.x, hs.door.y, '😱', 34).setDepth(4700).setVisible(false);
    this.layer.add(scream);
    const v: HouseView = { wish, name, status, glow, windows, cloud, scream, lit: false };
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
    this.drawWindows(h, v, false);
    return v;
  }

  private drawWindows(h: HouseState, v: HouseView, lit: boolean): void {
    const hs = h.street;
    const front = hs.top ? hs.body.y + hs.body.h : hs.body.y;
    const y = hs.top ? front - 5 : front;
    v.windows.clear();
    // ablakok a homlokzaton (ahol nem az ajtó van); ahol ég a lámpa, sárgán világítanak
    const light = h.def.light ?? 'on';
    [-62, -36, 36, 62].forEach((dx, i) => {
      if (Math.abs(hs.cx + dx - hs.door.x) <= 24) return;
      const on = lit || light === 'on' || (light === 'partial' && i % 2 === 0);
      v.windows.fillStyle(lit ? 0xffd36b : on ? 0xd9a441 : 0x24345e, 1).fillRect(hs.cx + dx - 9, y, 18, 5);
    });
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
    // beérkezés: a szán jobbról becsúszik a helyére (lassulva), a rénszarvasok vágtatnak
    const st0 = this.g.street;
    this.introT = Math.max(0, this.introT - dt);
    // érkezés közben nincsenek jelölő körök a téren
    this.dyn.setVisible(this.introT <= 0);
    this.over.setVisible(this.introT <= 0);
    const ik = this.introT > 0 ? 1 - this.introT / INTRO : 1;
    // balról érkezik
    this.sledOx = ik < 0.75 ? -900 * (1 - Math.sin(((ik / 0.75) * Math.PI) / 2)) : 0;
    this.sledG.x = this.sledOx;
    this.deer.forEach((t, i) =>
      t.setX(st0.reindeer.x + 22 + i * 44 + this.sledOx).setY(st0.reindeer.y + 16 + i * 4 - (ik < 0.75 ? Math.abs(Math.sin(time * 0.03 + i)) * 5 : 0)),
    );
    // repülő hógolyók (ívben)
    this.snowGfx.clear();
    for (const s of this.g.snowFlights) {
      const k = Math.min(1, s.t / s.T);
      const x = s.x0 + (s.x1 - s.x0) * k;
      const y = s.y0 + (s.y1 - s.y0) * k - Math.sin(Math.PI * k) * 60;
      this.snowGfx.fillStyle(0x000000, 0.2).fillEllipse(s.x0 + (s.x1 - s.x0) * k, s.y0 + 20 + (s.y1 - s.y0 - 20) * k, 14, 6);
      this.snowGfx.fillStyle(0xffffff, 1).fillCircle(x, y, 7);
      this.snowGfx.lineStyle(1.5, 0xb8c8e8, 1).strokeCircle(x, y, 7);
    }
    const g = this.g;
    const p = g.player;
    const d = this.dyn;
    d.clear();
    this.over.clear();

    for (const h of g.houses) this.updateHouse(h, this.views[h.idx], time);

    // ha eszköz van a zsebben: hol lehet használni
    if (p.zone === STREET && (g.phase === 'deliver' || g.phase === 'dawn')) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 0.009);
      // az eszközládában lévő, most hasznos eszközök sárgán villognak (ott a sárga gombbal vehetők fel)
      const pending = g.houses.filter((h) => h.status === 'pending');
      const need = {
        bone: g.houses.some((h) => h.dog?.mode === 'alert') || g.strays.some((s) => s.mode !== 'calm'),
        fish: pending.some((h) => h.cat && h.cat.mode !== 'fed'),
        bell: pending.some((h) => h.grandpa),
        candy: g.krampus.active,
      };
      if (!p.pocket.full)
        for (const k of ['bone', 'fish', 'bell', 'candy'] as const) {
          const ts = g.street.toolSlots[k];
          if (need[k] && g.toolStock[k] > 0 && (k === 'candy' ? p.hand.item !== 'candy' : !p.pocket.has(k))) this.over.lineStyle(3, 0xffd36b, 0.4 + 0.6 * pulse).strokeCircle(ts.x, ts.y, 22 + 4 * pulse);
        }
      for (const h of g.houses) {
        if (h.status === 'lost') continue;
        if (p.pocket.has('bone') && h.dog?.mode === 'alert') {
          d.lineStyle(3, 0x7ad1ff, 0.5 + 0.5 * pulse).strokeCircle(h.dog.x, h.dog.y - 8, 28);
        }
      }
    }

    // kóbor kutyák
    g.strays.forEach((s, i) => {
      const v = this.strays[i];
      const calm = s.mode === 'calm';
      // az emoji balra néz: jobbra menet tükrözzük
      if (Math.abs(s.x - v.dog.x) > 0.3) v.dog.setFlipX(s.x > v.dog.x);
      v.dog.setText(calm ? '🐕💤' : '🐕').setPosition(s.x, s.y).setDepth(s.y).setScale(s.barkAnim > 0 ? 1.15 : 1);
      v.fx.setVisible(s.barkAnim > 0).setPosition(s.x, s.y - 34).setScale(1 + s.barkAnim).setDepth(s.y + 1);
      if (!calm && p.pocket.has('bone') && p.zone === STREET) {
        d.lineStyle(3, 0x7ad1ff, 0.5 + 0.5 * Math.sin(time * 0.009)).strokeCircle(s.x, s.y - 8, 26);
      }
    });

    // ajándékok a helyükön
    g.sledItems.forEach((it, i) => {
      const v = this.giftViews[i];
      if (!v) return;
      const show = !it.taken && !it.gone;
      v.icon.setText(icon(it.gift)).setPosition(it.x + this.sledOx, it.y).setDepth(it.y + 5).setVisible(show);
      v.tag.setPosition(it.x + 15 + this.sledOx, it.y - 11).setDepth(it.y + 6);
      const pending = it.tag >= 0 && g.houses[it.tag].status === 'pending';
      v.tag.setVisible(false);
      v.tag.setBackgroundColor(pending ? '#5a3c9a' : '#55607a');
      // a felvett ajándék üres helye: ide teheted vissza
      if (it.taken && it.id === p.handFrom) {
        this.over.lineStyle(2, 0xffffff, 0.6);
        this.over.strokeCircle(it.x, it.y + 2, 18);
      }
    });
    for (let i = g.sledItems.length; i < this.giftViews.length; i++) {
      this.giftViews[i].icon.setVisible(false);
      this.giftViews[i].tag.setVisible(false);
    }
    for (const [k, t] of this.toolViews) {
      const n = g.toolStock[k as StockTool];
      t.setText(n > 0 ? `${icon(k as StockTool)}${n > 1 ? '×' + n : ''}` : '');
    }

    // szaloncukrok a földön
    let ci = 0;
    for (const it of g.ground) {
      if (it.zone !== STREET || it.kind !== 'candy' || ci >= this.candies.length) continue;
      this.candies[ci++].setPosition(it.x, it.y).setVisible(true).setDepth(it.y);
    }
    for (; ci < this.candies.length; ci++) this.candies[ci].setVisible(false);
    let gi = 0;
    for (const it of g.ground) {
      if (it.zone !== STREET || it.kind !== 'gift' || gi >= this.droppedGifts.length) continue;
      const si = g.sledItems.find((x) => x.id === it.item);
      if (!si) continue;
      this.droppedGifts[gi++].setText(icon(si.gift)).setPosition(it.x, it.y + Math.sin(time * 0.008) * 3).setDepth(it.y).setVisible(true);
      d.lineStyle(3, C.warm, 0.6 + 0.4 * Math.sin(time * 0.01)).strokeCircle(it.x, it.y, 22);
    }
    for (; gi < this.droppedGifts.length; gi++) this.droppedGifts[gi].setVisible(false);

    // Krampusz
    const k = g.krampus;
    this.krampus.setVisible(k.active);
    this.kBubble.setVisible(false);
    if (k.active) {
      const bob = Math.sin(time * 0.012) * 3;
      this.krampus.setPosition(k.x, k.y + bob).setDepth(k.y).setRotation(0).setScale(1);
      this.krampus.setFlipX(k.x > p.x);
      if (k.mode === 'eat') {
        // majszol: rágó mozdulat, a cukor a szájánál
        this.krampus.setScale(1 + 0.08 * Math.abs(Math.sin(time * 0.025)), 1 - 0.06 * Math.abs(Math.sin(time * 0.025)));
        this.kBubble.setText('🍬').setPosition(k.x, k.y - 62).setVisible(true);
      } else if (k.mode === 'happy') {
        // jókedvű tánc
        this.krampus.setRotation(Math.sin(time * 0.015) * 0.35).setY(k.y - Math.abs(Math.sin(time * 0.015)) * 12);
        this.kBubble.setText('😋').setPosition(k.x, k.y - 66).setVisible(true);
      } else if (k.mode === 'lurk') this.kBubble.setText('👀').setPosition(k.x, k.y - 62).setVisible(true);
      // elkapta: ráveti magát a Mikulásra
      if (g.over?.reason === 'krampus') {
        const t = g.over.t;
        this.krampus.setPosition(p.x + Math.sin(time * 0.05) * 4, p.y - 8).setScale(1.3 + Math.min(0.4, t * 0.3)).setDepth(p.y + 10);
      }
      d.fillStyle(0x000000, 0.25).fillEllipse(k.x, k.y + 2, 36, 12);
      if (k.mode === 'chase') {
        d.lineStyle(2, C.red, 0.5 + 0.3 * Math.sin(time * 0.02));
        d.strokeCircle(k.x, k.y - 14, 34);
      }
    }

    this.drawGuides(time);

    // célpont kiemelése (felirat nélkül): sárga a művelet-gomb, kék az eszköz-gomb célja
    const pulse = 1 + 0.12 * Math.sin(time * 0.008);
    const t = g.target;
    if (t && this.introT <= 0 && p.zone === STREET && t.kind !== 'dropGift') this.over.lineStyle(3, C.warm, 0.9).strokeCircle(t.x, t.y, 22 * pulse);
    const tt = g.toolTarget;
    if (tt && this.introT <= 0 && p.zone === STREET && tt.kind !== 'dropCandy' && tt.kind !== 'snowball') this.over.lineStyle(3, 0x7ad1ff, 0.95).strokeCircle(tt.x, tt.y - 8, 30 * pulse);

    // Mikulás
    const vis = p.zone === STREET;
    this.player.setVisible(vis);
    if (vis) {
      this.walkT += dt * (6 + 10 * p.speed01) * (p.speed01 > 0.05 ? 1 : 0);
      const sq = p.speed01 > 0.05 ? Math.sin(this.walkT) * (p.quiet ? 0.04 : 0.08) : Math.sin(time * 0.004) * 0.02;
      this.player.setPosition(p.x, p.y).setScale(1 - sq * 0.6, 1 + sq).setDepth(p.y);
      if (Math.abs(p.vx) > 5) this.player.setFlipX(p.vx > 0);
      if (this.introT > 0) {
        // a szánon ül, a végén leugrik a helyére
        const sl = this.g.street.sled;
        const seatX = sl.x + sl.w * 0.25 + this.sledOx;
        const seatY = sl.y + sl.h / 2 + 4;
        const h = ik < 0.8 ? 0 : (ik - 0.8) / 0.2;
        this.player.setPosition(seatX + (p.x - seatX) * h, seatY + (p.y - seatY) * h - Math.sin(h * Math.PI) * 40).setDepth(sl.y + 80);
      }
      this.player.setAlpha(p.busyKind === 'caught' && p.busy > 0 ? (Math.floor(time / 100) % 2 ? 0.3 : 1) : 1);
      // elcsúszott: hanyatt fekszik, csillagok pörögnek a feje körül
      this.player.setRotation(p.slipT > 0 ? (this.player.flipX ? -1 : 1) * Math.PI * 0.45 : 0);
      if (p.slipT > 0) {
        for (let i = 0; i < 3; i++) {
          const a = time * 0.008 + (i * Math.PI * 2) / 3;
          d.fillStyle(0xffd36b, 1).fillCircle(p.x + Math.cos(a) * 22, p.y - 26 + Math.sin(a) * 7, 4);
        }
      }
      if (this.introT <= 0) d.fillStyle(0x000000, 0.25).fillEllipse(p.x, p.y + 2, 34, 12);
      if (p.quiet) {
        d.lineStyle(2, 0xffffff, 0.35);
        d.strokeEllipse(p.x, p.y + 2, 44, 16);
      }
    }

    // hóvihar
    const bz = g.blizzard > 0 ? Math.min(1, g.blizzard, (g.tuning.blizzard.duration - g.blizzard) * 0.8) : 0;
    this.blizzard.setAlpha(this.blizzard.alpha + (bz - this.blizzard.alpha) * Math.min(1, dt * 3));
    this.blizzard.setPosition(p.x, p.y - 20);
    const fg = g.fog > 0 ? Math.min(1, g.fog, (g.tuning.fog.duration - g.fog) * 0.5) : 0;
    this.fog.setAlpha(this.fog.alpha + (fg - this.fog.alpha) * Math.min(1, dt * 2)).setPosition(p.x, p.y - 20);

    // rendőrök: az autó fényszórója, a gyalogos rendőrök zseblámpája; üldözéskor villog
    const fx = this.carFx;
    fx.clear();
    this.carLights.clear();
    this.cuffs.setVisible(false);
    const blink = Math.floor(time / 180) % 2 === 0;
    const coneAt = (c: { x: number; y: number; dir: number; halfAngle: number; range: number }, col: number, a: number) => {
      const pts = [{ x: c.x, y: c.y }];
      for (let k = 0; k <= 8; k++) {
        const an = c.dir - c.halfAngle + (k / 8) * c.halfAngle * 2;
        pts.push({ x: c.x + Math.cos(an) * c.range, y: c.y + Math.sin(an) * c.range });
      }
      fx.fillStyle(col, a).fillPoints(pts, true);
    };
    g.police.forEach((c, i) => {
      const chasing = c.cops.some((k) => k.mode === 'chase');
      let cx = c.x;
      // letartóztatás: a Mikulást a rendőrök az autóhoz viszik, beültetik, és az autó elhajt
      const arrest = g.over?.reason === 'police' && g.over.car === i ? g.over.t : -1;
      if (arrest > 2.4) cx += (arrest - 2.4) * 420 * c.dir;
      if (c.mode === 'patrol') coneAt(policeCone(g, c), 0xfff3b0, 0.22);
      this.cars[i].setPosition(cx, c.y).setFlipX(c.dir > 0).setDepth(c.y + 20);
      this.carLights.fillStyle(blink ? 0x3a7aff : 0xff3a3a, chasing || arrest >= 0 ? 0.95 : 0.6).fillCircle(cx, c.y - 22, chasing || arrest >= 0 ? 14 : 6);
      for (let j = 0; j < 2; j++) {
        const v = this.cops[i * 2 + j];
        const al = this.copAlerts[i * 2 + j];
        const cop = c.cops[j];
        v.setVisible(!!cop && arrest < 2.4);
        al.setVisible(false);
        if (!cop) continue;
        coneAt(copCone(g, cop), cop.mode === 'chase' ? 0xff8a7a : 0xfff3b0, cop.mode === 'chase' ? 0.3 : 0.2);
        // az emoji balra néz: jobbra menet tükrözzük
        v.setPosition(cop.x, cop.y + (cop.mode === 'chase' ? Math.sin(time * 0.03 + j) * 2 : 0)).setDepth(cop.y).setFlipX(Math.cos(cop.dir) > 0);
        if (cop.mode === 'chase') al.setText('❗').setPosition(cop.x, cop.y - 52).setVisible(true);
        else if (cop.sus > 0) al.setText('❓').setPosition(cop.x, cop.y - 52).setVisible(true);
      }
      if (arrest >= 0) {
        // megbilincselve, majd az autóhoz kísérve
        const k = Math.min(1, Math.max(0, (arrest - 1) / 1.2));
        const sx = p.x + (c.x - p.x) * k;
        const sy = p.y + (c.y - p.y) * k;
        this.player.setPosition(sx, sy).setVisible(arrest < 2.4);
        this.cuffs.setPosition(sx, sy - 52).setVisible(arrest < 2.4);
        if (c.cops[0]) this.cops[i * 2].setPosition(sx - 26, sy);
      }
    });

    this.ripples.update(dt);
    this.popups.update(dt);
  }

  /** Merre menjen: a kézben lévő ajándék házához, üres kézzel a szánon lévő ajándékokhoz. */
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
    let itemPoint: { x: number; y: number } | null = null;
    const hand = p.hand.item;
    if (hand && hand !== 'candy' && g.phase === 'deliver') {
      // a címkézett ház; ha az már nem vár, bármelyik, amelyik ezt kérte
      const tagged = g.handTag >= 0 && g.houses[g.handTag].status === 'pending' ? [g.houses[g.handTag]] : [];
      const targets = tagged.length ? tagged : g.houses.filter((h) => h.status === 'pending' && h.def.wish === hand);
      for (const h of targets) {
        const b = h.street.body;
        d.lineStyle(5, C.warm, pulse);
        d.strokeRoundedRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12, 10);
        d.lineStyle(3, C.warm, pulse);
        d.strokeCircle(h.street.ladder.x, h.street.ladder.y, 20);
        points.push({ x: h.street.ladder.x, y: h.street.top ? h.street.ladder.y - 40 : h.street.ladder.y - 48 });
      }
    } else if (!hand || g.phase === 'dawn' || g.pendingCount === 0) {
      const goHome = g.phase === 'dawn' || g.pendingCount === 0;
      if (goHome) {
        const hs = g.street.homeSpot;
        this.over.lineStyle(4, C.warm, pulse);
        this.over.strokeCircle(hs.x, hs.y, 30);
        points.push({ x: hs.x, y: hs.y - 44 });
      } else {
        // a még kivihető, címkézett ajándékok; nyíl a legközelebbire
        let best: { x: number; y: number } | null = null;
        let bestD = Infinity;
        for (const it of g.sledItems) {
          if (it.taken || it.gone || it.tag < 0 || g.houses[it.tag].status !== 'pending') continue;
          if (this.introT > 0) break;
          this.over.lineStyle(3, C.warm, pulse);
          this.over.strokeCircle(it.x, it.y + 2, 22);
          const dd = Math.hypot(p.x - it.x, p.y - it.y);
          if (dd < bestD) {
            bestD = dd;
            best = { x: it.x, y: it.y - 40 };
          }
        }
        if (best && bestD > 60) itemPoint = best;
      }
    }
    const cam = this.scene.cameras.main;
    if (itemPoint) points.push(itemPoint);
    points.forEach((pt, i) => {
      if (i < this.guides.length && pt !== itemPoint) this.guides[i].setPosition(pt.x, pt.y - bob).setVisible(true);
      // képernyőn kívül: nyíl a szélen
      const sx = pt.x - cam.scrollX;
      if (sx < 20 || sx > VW - 20) {
        this.edge
          .setText(sx < 20 ? '⬅️' : '➡️')
          .setPosition(sx < 20 ? 34 + bob : VW - 34 - bob, Math.max(110, Math.min(400, pt.y)))
          .setVisible(true);
      }
    });
  }

  private updateHouse(h: HouseState, v: HouseView, time: number): void {
    const d = this.dyn;
    const hs = h.street;
    const b = hs.body;
    const p = this.g.player;
    // lejárt az idő: a háziak az ajtóban sikítoznak
    const over = this.g.over?.reason === 'time';
    v.scream.setVisible(over);
    if (over) {
      const t = this.g.over!.t;
      const out = Math.min(1, t * 2) * 30;
      v.scream
        .setPosition(hs.door.x + Math.sin(time * 0.03 + h.idx) * 6, hs.door.y + (hs.top ? out : -out))
        .setScale(1 + 0.15 * Math.abs(Math.sin(time * 0.02 + h.idx)));
    }
    // státusz a buborékban
    const st = h.status;
    v.wish.setVisible(st === 'pending');
    v.status.setText(st === 'happy' ? '⭐' : st === 'sad' ? '😢' : st === 'lost' ? '❌' : '');
    if (st === 'happy' && !v.lit) this.lightHouse(h.idx);
    if (st === 'happy') v.status.setScale(1 + 0.08 * Math.sin(time * 0.006));
    v.name.setAlpha(st === 'lost' ? 0.5 : 1);

    // ébrenléti mérő a tetőn
    if (st !== 'lost') {
      const sl = mostAwake(h);
      const m = sl.meter.ratio;
      const bx = hs.cx - 4;
      const by = b.y + b.h / 2 + 18;
      d.fillStyle(0x06102a, 0.75).fillRoundedRect(bx - 2, by - 2, 74, 12, 5);
      const col = m < 0.5 ? 0x5ad17a : m < 0.7 ? 0xffd36b : C.red;
      d.fillStyle(col, 1).fillRoundedRect(bx, by, Math.max(4, 70 * m), 8, 4);
      const awake = childAwake(sl);
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
  }
}

/** Talajon lévő akadály (jég, hókupac, pad, árnyék) statikus rajza. */
export function drawGroundObstacle(gr: Phaser.GameObjects.Graphics, o: Obstacle): void {
  const r = o.rect;
  if (o.kind === 'ice' && o.poly) {
    // szabálytalan jégfolt: sötétebb perem, világos belső, csillanás és repedések
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    gr.fillStyle(0x9ccbe8, 0.85);
    gr.fillPoints(o.poly, true);
    gr.fillStyle(0xcdeeff, 0.9);
    gr.fillPoints(
      o.poly.map((q) => ({ x: cx + (q.x - cx) * 0.8, y: cy + (q.y - cy) * 0.75 })),
      true,
    );
    gr.lineStyle(2, 0xffffff, 0.9);
    gr.lineBetween(cx - r.w * 0.25, cy - r.h * 0.15, cx - r.w * 0.05, cy - r.h * 0.25);
    gr.lineStyle(1, 0x7aa8c8, 0.8);
    gr.lineBetween(cx, cy, cx + r.w * 0.2, cy + r.h * 0.2);
    gr.lineBetween(cx + r.w * 0.2, cy + r.h * 0.2, cx + r.w * 0.3, cy + r.h * 0.1);
    gr.lineBetween(cx, cy, cx - r.w * 0.12, cy + r.h * 0.22);
  } else if (o.kind === 'snowpile') {
    gr.fillStyle(0xdfe8fb, 1);
    gr.fillEllipse(r.x + r.w / 2, r.y + r.h / 2 + 4, r.w + 8, r.h + 6);
    gr.fillStyle(0xf4f8ff, 1);
    gr.fillEllipse(r.x + r.w / 2 - 6, r.y + r.h / 2, r.w - 10, r.h - 6);
  } else if (o.kind === 'bench') {
    gr.fillStyle(0x6a4a30, 1);
    gr.fillRoundedRect(r.x, r.y, r.w, r.h, 4);
    gr.fillStyle(0xdfe8fb, 0.9);
    gr.fillRoundedRect(r.x + 4, r.y + 2, r.w - 8, 6, 3);
  } else {
    gr.fillStyle(0x000000, 0.2);
    gr.fillEllipse(r.x + r.w / 2, r.y + r.h, r.w + 6, 12);
  }
}
