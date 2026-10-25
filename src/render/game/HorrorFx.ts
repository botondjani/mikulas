import Phaser from 'phaser';
import { CX, VW, emo } from '../view';
import { sfx, vibrate } from '../../app';
import { Rng } from '../../core/rng';
import { STREET, isHouse } from '../../games/mikulas/types';
import type { MikulasGame } from '../../games/mikulas/game';
import { policeChasing } from '../../games/mikulas/agents/police';
import { mostAwake } from '../../games/mikulas/agents/child';

type Scare = 'face' | 'blackout' | 'bang' | 'shadow' | 'glitch' | 'whisper' | 'shriek' | 'window' | 'lampOut' | 'slam' | 'closet';

/**
 * Horror mód megjelenítése és hangja: sötét kép, gyakori véletlen ijesztések (arc, áramszünet,
 * dörömbölés, átsuhanó árny, képhiba, suttogás), ijesztés házba lépéskor, távoli sikolyok,
 * veszélynél lüktető piros szél és szívdobogás, üldözéskor kék-piros villogás, a Krampusz
 * gyilkos jelenete. Rezgéssel.
 */
export class HorrorFx {
  private D = 1180;
  private tint: Phaser.GameObjects.Rectangle;
  private vignette: Phaser.GameObjects.Image;
  private pulse: Phaser.GameObjects.Graphics;
  private flash: Phaser.GameObjects.Rectangle;
  private black: Phaser.GameObjects.Rectangle;
  private face: Phaser.GameObjects.Text;
  private shadow: Phaser.GameObjects.Text;
  private glitch: Phaser.GameObjects.Graphics;
  private rng: Rng;
  private next: number;
  private distantT: number;
  private scare = 0;
  private scareLen = 1;
  private kind: Scare = 'face';
  private beatT = 0;
  private murder = false;
  private lastZone: number;
  /** ijesztés előtti csend hátralévő ideje */
  private preT = 0;
  /** mióta bújik a szekrényben */
  private closetT = 0;
  /** Krampusz-szemszög: hátralévő idő és a következőig */
  private povT = 0;
  private povNext: number;
  /** a kamera ide néz (a Krampusz helye), vagy null */
  povX: number | null = null;

  constructor(
    private scene: Phaser.Scene,
    private g: MikulasGame,
  ) {
    const fix = <T extends Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth>(o: T, d: number): T => {
      o.setScrollFactor(0);
      o.setDepth(this.D + d);
      return o;
    };
    this.tint = fix(scene.add.rectangle(CX, 270, VW, 540, 0x1a0000, 0.26), 0);
    this.vignette = fix(scene.add.image(CX, 270, 'vignette').setDisplaySize(VW * 1.15, VW * 1.15), 1);
    this.pulse = fix(scene.add.graphics(), 1);
    this.shadow = fix(emo(scene, -200, 300, '👤', 300).setTint(0x000000).setAlpha(0).setVisible(false), 2);
    this.glitch = fix(scene.add.graphics(), 3);
    this.black = fix(scene.add.rectangle(CX, 270, VW, 540, 0x000000, 0), 4);
    this.flash = fix(scene.add.rectangle(CX, 270, VW, 540, 0xff0000, 0), 5);
    this.face = fix(emo(scene, CX, 270, '👹', 260).setVisible(false), 6);
    this.rng = new Rng(g.seed).fork(77);
    this.next = this.rng.range(6, 12);
    this.distantT = this.rng.range(15, 30);
    this.povNext = this.rng.range(20, 35);
    this.lastZone = g.player.zone;
    g.events.on('gameOver', (e) => {
      if (e.reason === 'krampus') this.startMurder();
      else if (e.reason === 'time') vibrate([300, 100, 300, 100, 600]);
      else vibrate([120, 80, 120]);
    });
  }

  /** Ijesztés indítása (adott fajta, vagy véletlen a helyhez illően). */
  private startScare(kind?: Scare): void {
    const p = this.g.player;
    const inside = isHouse(p.zone);
    this.kind =
      kind ??
      this.rng.pick<Scare>(
        inside
          ? ['face', 'blackout', 'bang', 'shadow', 'glitch', 'whisper', 'shriek', 'window', 'lampOut', 'slam']
          : ['face', 'bang', 'shadow', 'glitch', 'whisper', 'shriek', 'window', 'slam'],
      );
    this.scareLen = { face: 1, blackout: 1.8, bang: 1.3, shadow: 1, glitch: 0.6, whisper: 1.6, shriek: 0.9, window: 1.1, lampOut: 1.6, slam: 0.7, closet: 2.6 }[this.kind];
    this.scare = this.scareLen;
    const cam = this.scene.cameras.main;
    switch (this.kind) {
      case 'face':
        this.face.setText(this.rng.pick(['👹', '💀', '👁️', '🤡', '👻', '🧟'])).setVisible(true).setScale(0.1).setAlpha(1);
        this.face.setPosition(CX + this.rng.range(-220, 220), 270 + this.rng.range(-60, 60));
        sfx.play('jumpscare');
        cam.shake(500, 0.022);
        vibrate([250, 60, 400]);
        break;
      case 'blackout':
        sfx.play('powerDown');
        sfx.play('bang');
        vibrate([80, 120, 80, 120, 80]);
        break;
      case 'bang':
        sfx.play('bang');
        cam.shake(300, 0.014);
        vibrate([90, 140, 90, 140, 90]);
        break;
      case 'shadow': {
        const fromLeft = this.rng.chance(0.5);
        this.shadow.setVisible(true).setScale(1).setAlpha(0.85).setFlipX(!fromLeft).setPosition(fromLeft ? -200 : VW + 200, 300);
        this.scene.tweens.add({ targets: this.shadow, x: fromLeft ? VW + 200 : -200, duration: 900, ease: 'Sine.inOut' });
        sfx.play('whoosh');
        vibrate(200);
        break;
      }
      case 'glitch':
        sfx.play('static');
        vibrate([40, 30, 40, 30, 40]);
        break;
      case 'whisper':
        sfx.play('whisper');
        vibrate([30, 60, 30, 60, 30]);
        break;
      case 'shriek':
        sfx.play('shriek');
        cam.shake(400, 0.02);
        vibrate([300, 50, 300]);
        break;
      case 'window': {
        // arc csapódik az „ablakra" a kép szélén
        const left = this.rng.chance(0.5);
        this.face
          .setText(this.rng.pick(['🧟', '👹', '😱', '👁️']))
          .setVisible(true)
          .setAlpha(1)
          .setScale(1.4)
          .setPosition(left ? 120 : VW - 120, 270 + this.rng.range(-80, 80));
        sfx.play('bang');
        sfx.play('jumpscare');
        cam.shake(350, 0.018);
        vibrate([200, 40, 350]);
        break;
      }
      case 'lampOut':
        // a fény pislákol, majd kialszik
        sfx.play('static');
        sfx.play('whisper');
        vibrate([40, 80, 40, 80, 200]);
        break;
      case 'closet':
        // valaki megáll a szekrény előtt: árny a résben, szívdobogás
        this.shadow.setVisible(true).setAlpha(0).setFlipX(false).setPosition(CX, 300).setScale(1.3);
        sfx.play('heartbeat', 1);
        sfx.play('whisper');
        vibrate([60, 140, 60, 140, 60, 140, 300]);
        break;
      case 'slam':
        sfx.play('slam');
        cam.shake(300, 0.02);
        vibrate([250, 60, 120]);
        break;
    }
  }

  private startMurder(): void {
    this.murder = true;
    this.povT = 0;
    this.povX = null;
    this.scene.cameras.main.setRotation(0);
    this.face.setText('👹').setVisible(true).setScale(0.15).setAlpha(1).setPosition(CX, 280);
    sfx.play('murder');
    this.scene.cameras.main.shake(900, 0.03);
    vibrate([700, 100, 400]);
  }

  /** veszély 0..1: üldöző Krampusz, ébredező háziak, rendőrök */
  private danger(): number {
    const g = this.g;
    const p = g.player;
    let d = 0;
    const k = g.krampus;
    if (k.active && p.zone === STREET) d = Math.max(d, k.mode === 'chase' ? 1 : Math.max(0, 1 - Math.hypot(k.x - p.x, k.y - p.y) / 400));
    if (policeChasing(g)) d = Math.max(d, 0.9);
    if (isHouse(p.zone)) {
      const h = g.houses[p.zone];
      const sl = mostAwake(h);
      d = Math.max(d, sl.meter.ratio > 0.6 ? (sl.meter.ratio - 0.6) * 2.5 : 0, sl.suspicion, h.grandpa?.suspicion ?? 0);
    }
    if (g.phase === 'dawn') d = Math.max(d, 0.5);
    return Math.min(1, d);
  }

  update(dt: number, time: number): void {
    const g = this.g;
    const p = g.player;

    if (this.murder) {
      // a Krampusz arca betölti a képet, piros villanások, majd sötét
      const t = g.over?.t ?? 3;
      this.black.setAlpha(Math.min(1, t * 2));
      this.face.setScale(0.15 + Math.min(1, t * 1.5) * 2).setAngle(Math.sin(time * 0.05) * 6);
      this.flash.setFillStyle(0xff0000, t < 1.4 && Math.floor(t * 5) % 2 === 0 ? 0.55 : 0);
      if (t > 2) this.face.setAlpha(Math.max(0, 1 - (t - 2) * 2));
      return;
    }

    const playing = !g.over && !g.clockFrozen && g.phase !== 'drive' && g.phase !== 'result';
    // belépés egy házba: néha rögtön ijesztés
    if (p.zone !== this.lastZone) {
      if (isHouse(p.zone) && playing && this.scare <= 0 && this.rng.chance(0.45)) this.startScare(this.rng.pick<Scare>(['face', 'blackout', 'whisper', 'slam', 'window']));
      this.lastZone = p.zone;
    }
    // Krampusz-szemszög: ritkán a kép a Krampusz felől mutatja a Mikulást (piros, torz, lihegés)
    const k = g.krampus;
    const kNear = k.active && p.zone === STREET && k.mode !== 'eat' && k.mode !== 'happy' && Math.abs(k.x - p.x) < 900;
    if (this.povT > 0) {
      this.povT -= dt;
      this.povX = kNear ? k.x : null;
      const w = Math.sin(time * 0.012);
      this.tint.setFillStyle(0x5a0000, 0.45 + 0.1 * w);
      this.vignette.setDisplaySize(VW * 0.95, VW * 0.95);
      this.scene.cameras.main.setRotation(0.03 * w);
      if (this.povT <= 0 || !kNear) {
        this.povT = 0;
        this.povX = null;
        this.tint.setFillStyle(0x1a0000, 0.26);
        this.vignette.setDisplaySize(VW * 1.15, VW * 1.15);
        this.scene.cameras.main.setRotation(0);
      }
    } else if (playing && kNear && this.scare <= 0) {
      this.povNext -= dt;
      if (this.povNext <= 0) {
        this.povNext = this.rng.range(25, 45);
        this.povT = 1.8;
        sfx.play('growl');
        sfx.play('whisper');
        vibrate([80, 60, 80, 60, 300]);
      }
    }
    // szekrényben bújva: néha valaki megáll előtte
    this.closetT = p.closet >= 0 ? this.closetT + dt : 0;
    if (playing && this.scare <= 0 && this.closetT > 3 && this.rng.chance(0.25 * dt)) this.startScare('closet');
    // véletlen ijesztések és távoli hangok
    if (playing && this.scare <= 0) {
      if (this.preT > 0) {
        this.preT -= dt;
        if (this.preT <= 0) this.startScare();
      } else {
        this.next -= dt;
        // veszélyben gyorsabban jön a következő
        if (this.danger() > 0.6) this.next -= dt;
        if (this.next <= 0) {
          this.next = this.rng.range(8, 18);
          // előtte egy pillanatra elhallgat a zene
          this.preT = 1.1;
          sfx.hush(1.4);
        }
      }
      this.distantT -= dt;
      if (this.distantT <= 0) {
        this.distantT = this.rng.range(20, 40);
        sfx.play('distant');
      }
    }

    this.glitch.clear();
    if (this.scare > 0) {
      this.scare -= dt;
      const k = 1 - this.scare / this.scareLen;
      if (this.kind === 'face') {
        this.face.setScale(0.1 + Math.min(1, k * 5) * 1.6).setAlpha(this.scare < 0.5 ? this.scare * 2 : 1);
        this.flash.setFillStyle(0xff0000, k < 0.25 ? 0.5 : 0);
      } else if (this.kind === 'blackout') {
        this.black.setAlpha(this.scare > 0.4 ? 1 : this.scare / 0.4);
        if (Math.abs(this.scare - 1.1) < dt || Math.abs(this.scare - 0.7) < dt) sfx.play('bang');
      } else if (this.kind === 'bang') {
        if (Math.abs(this.scare - 0.8) < dt || Math.abs(this.scare - 0.4) < dt) sfx.play('bang');
      } else if (this.kind === 'closet') {
        this.shadow.setAlpha(Math.min(0.95, k * 3, (1 - k) * 3));
        if (Math.abs(this.scare - 1.3) < dt) sfx.play('heartbeat', 1);
      } else if (this.kind === 'window') {
        this.face.setAlpha(this.scare < 0.4 ? this.scare / 0.4 : 1);
        this.flash.setFillStyle(0xff0000, k < 0.15 ? 0.45 : 0);
      } else if (this.kind === 'shriek') {
        this.flash.setFillStyle(0xffffff, k < 0.12 ? 0.5 : 0);
      } else if (this.kind === 'lampOut') {
        // pislákolás, a végén teljes sötét
        this.black.setAlpha(k > 0.55 ? 1 : Math.floor(k * 22) % 2 === 0 ? 0.85 : 0);
      } else if (this.kind === 'glitch') {
        for (let i = 0; i < 9; i++) {
          const y = this.rng.range(0, 540);
          this.glitch.fillStyle(this.rng.chance(0.5) ? 0xffffff : 0x000000, this.rng.range(0.2, 0.7)).fillRect(0, y, VW, this.rng.range(3, 26));
        }
      }
      if (this.scare <= 0) {
        this.face.setVisible(false);
        this.shadow.setVisible(false);
        this.black.setAlpha(0);
        this.flash.setFillStyle(0xff0000, 0);
      }
    }

    // rendőrök üldöznek: kék-piros villogás (lassú, legfeljebb ~2,5 váltás/mp)
    if (this.scare <= 0) {
      if (policeChasing(g)) this.flash.setFillStyle(Math.floor(time / 400) % 2 === 0 ? 0x2a5aff : 0xff2a2a, 0.22);
      else this.flash.setFillStyle(0xff0000, 0);
    }

    // veszélynél lüktető piros szél és szívdobogás
    const d = this.danger();
    this.pulse.clear();
    if (d > 0.15 && !g.over) {
      const a = d * (0.35 + 0.25 * Math.sin(time * (0.006 + d * 0.01)));
      this.pulse.lineStyle(70, 0x8a0000, a).strokeRect(0, 0, VW, 540);
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 1.1 - d * 0.65;
        sfx.play('heartbeat', 0.5 + d * 0.5);
        if (d > 0.5) vibrate([40, 90, 40]);
      }
    }
    sfx.danger = Math.max(sfx.danger, d);
    this.tint.setAlpha(this.povT > 0 ? 0.5 : 0.26 + d * 0.12);
    void p;
    void this.vignette;
  }
}
