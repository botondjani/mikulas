import Phaser from 'phaser';
import { CX, VW, setupCamera, txt } from '../view';
import { addSnow } from '../fx/pools';
import { StreetView } from '../game/StreetView';
import { InteriorView } from '../game/InteriorView';
import { FactoryView } from '../game/FactoryView';
import { DriveView } from '../game/DriveView';
import { Hud } from '../game/Hud';
import { TouchControls } from '../game/TouchControls';
import { PackOverlay } from '../game/PackOverlay';
import { PauseOverlay } from '../game/PauseOverlay';
import { Tutorial } from '../game/Tutorial';
import { ModePicker } from '../game/ModePicker';
import { HorrorFx } from '../game/HorrorFx';
import type { GameMode } from '../../games/mikulas/modes';
import { Ambient } from '../audio/ambient';
import { MikulasGame } from '../../games/mikulas/game';
import { mostAwake } from '../../games/mikulas/agents/child';
import { getLevel } from '../../games/mikulas/levels';
import { FACTORY, ROAD, STREET, icon, isHouse } from '../../games/mikulas/types';
import { emptyInput, clampMove } from '../../core/input';
import { params, save, setMuted, setVolume, sfx, signalReady } from '../../app';
import { toggleFullscreen } from '../../fullscreen';

const STEP = 1 / 60;
const NOISE_SFX: Record<string, string> = { door: 'door', bark: 'bark', creak: 'creak', gift: 'gift', chimney: 'chimney', bin: 'clang', meow: 'meow' };

type Keys = Record<string, Phaser.Input.Keyboard.Key>;

export class GameScene extends Phaser.Scene {
  private g!: MikulasGame;
  private levelId = 1;
  private seed = 1;
  private street!: StreetView;
  private interior: InteriorView | null = null;
  private factory: FactoryView | null = null;
  private drive: DriveView | null = null;
  private hud!: Hud;
  private touch!: TouchControls;
  private pack?: PackOverlay;
  private pause!: PauseOverlay;
  private snow!: Phaser.GameObjects.Particles.ParticleEmitter;
  private keys!: Keys;
  private acc = 0;
  private paused = false;
  private keyInteract = false;
  private keyTool = false;
  private stepTimer = 0;
  private jingleT = 0;
  private ending = false;
  private tutorialWanted = false;
  private tutorial: Tutorial | null = null;
  /** játékmód: hard és/vagy horror (a pálya indításakor választható) */
  private mode: GameMode = {};
  private horrorFx: HorrorFx | null = null;
  /** még a mód választása zajlik: a játék áll */
  private choosing = false;
  /** kérdezzük-e a módot (újrakezdésnél nem) */
  private askMode = true;
  private ambient!: Ambient;
  private debugT?: Phaser.GameObjects.Text;
  private debugG?: Phaser.GameObjects.Graphics;

  constructor() {
    super('Game');
  }

  init(data: { level: number; seed: number; tutorial?: boolean; mode?: GameMode }): void {
    this.mode = data.mode ?? (params.level ? { hard: params.hard, horror: params.horror } : {});
    this.askMode = data.mode === undefined;
    this.horrorFx = null;
    this.levelId = data.level ?? 1;
    this.tutorialWanted = this.levelId === 1 && (data.tutorial === true || !save.get().tutorialSeen);
    this.tutorial = null;
    this.seed = data.seed ?? 1;
    this.acc = 0;
    this.paused = false;
    this.choosing = false;
    this.ending = false;
    this.interior = null;
    this.factory = null;
    this.drive = null;
  }

  create(): void {
    const cam = setupCamera(this);
    cam.setBackgroundColor(0x06102a);
    this.g = new MikulasGame(getLevel(this.levelId), this.seed, this.mode);
    const g = this.g;
    this.street = new StreetView(this, g);
    this.snow = addSnow(this, 900);
    this.hud = new Hud(this, g);
    this.hud.setMuted(sfx.isMuted);
    this.touch = new TouchControls(this, (x, y) => this.uiHit(x, y) || !!this.pack?.hit(x, y));
    this.pack = new PackOverlay(this, g);
    this.pause = new PauseOverlay(
      this,
      {
        resume: () => this.setPaused(false),
        restart: () => this.scene.restart({ level: this.levelId, seed: params.seed ?? this.seed + 1, tutorial: false, mode: this.mode }),
        toggleMute: () => {
          setMuted(!sfx.isMuted);
          this.hud.setMuted(sfx.isMuted);
          return sfx.isMuted ? '🔇 Hang: ki' : '🔊 Hang: be';
        },
        cycleVolume: () => {
          const steps = [1, 0.6, 0.3];
          const v = steps[(steps.indexOf(sfx.vol) + 1) % steps.length] ?? 1;
          setVolume(v);
          sfx.play('click');
          return `🔉 Hangerő: ${Math.round(v * 100)}%`;
        },
        toggleVibrate: () => {
          const on = !save.get().vibrate;
          save.update((d) => ({ ...d, vibrate: on }));
          if (on) globalThis.navigator?.vibrate?.(120);
          return on ? '📳 Rezgés: be' : '📴 Rezgés: ki';
        },
        menu: () => this.scene.start('Menu'),
      },
      {
        mute: sfx.isMuted ? '🔇 Hang: ki' : '🔊 Hang: be',
        volume: `🔉 Hangerő: ${Math.round(sfx.vol * 100)}%`,
        vibrate: save.get().vibrate ? '📳 Rezgés: be' : '📴 Rezgés: ki',
      },
    );
    this.hud.pauseBtn.on('pointerdown', () => this.setPaused(true));
    this.hud.fsBtn.on('pointerdown', () => void toggleFullscreen());
    this.hud.muteBtn.on('pointerdown', () => {
      setMuted(!sfx.isMuted);
      this.hud.setMuted(sfx.isMuted);
    });
    if (this.tutorialWanted)
      this.tutorial = new Tutorial(this, g, this.pack!, this.touch, () =>
        save.update((d) => ({ ...d, tutorialSeen: true })),
      );
    this.events.on('tutorial-step', () => sfx.play('pick'));
    this.ambient = new Ambient(g, sfx);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,SPACE,SHIFT,Q,P,ESC,M,ENTER') as Keys;
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));

    // eseményekre reagáló megjelenítés és hang
    g.events.on('sfx', (e) => sfx.play(e.id));
    g.events.on('noise', (n) => {
      const here = n.zone === g.player.zone;
      if (NOISE_SFX[n.kind] && (here || n.kind === 'bark')) sfx.play(NOISE_SFX[n.kind]);
      if (!here) return;
      const view = this.view();
      view.ripples.spawn(n.x, n.y, 20 + n.amount * 4, n.amount >= 15 ? 0xff9a8a : 0xffffff);
      if (n.amount >= 15) cam.shake(120, 0.0035);
    });
    g.events.on('score', (e) => {
      if (e.zone !== g.player.zone || (e.x === 0 && e.y === 0)) return;
      this.view().popups.spawn(e.x, e.y - 20, `${e.points > 0 ? '+' : ''}${e.points}`, e.points > 0 ? '#ffd36b' : '#ff8a7a');
    });
    g.events.on('zone', (e) => this.showZone(e.zone));
    g.events.on('happy', (e) => {
      this.interior?.burstAt(g.houses[e.house].interior.treeSpot.x, g.houses[e.house].interior.treeSpot.y - 10);
      this.street.lightHouse(e.house);
    });
    g.events.on('caught', () => cam.shake(350, 0.012));
    g.events.on('gameOver', () => {
      cam.shake(600, 0.01);
      this.touch.setEnabled(false);
    });
    g.events.on('phase', (e) => {
      if (e.phase === 'drive') this.pack?.setVisible(false);
      if (e.phase === 'result') this.endRound();
    });
    this.events.on('tick', () => sfx.play('tick'));

    const onHidden = () => {
      if (!this.ending) this.setPaused(true);
    };
    this.game.events.on('app-hidden', onHidden);
    this.events.once('shutdown', () => {
      this.game.events.off('app-hidden', onHidden);
      this.touch.destroy();
      this.g.events.clear();
      this.interior?.destroy();
      sfx.stopMusic();
      sfx.ambient('rain', 0);
      kb.removeAllListeners('keydown');
    });

    if (params.debug) {
      this.debugT = txt(this, 10, 120, '', 13, '#9fffb0', { backgroundColor: '#000000aa', padding: { x: 6, y: 4 } })
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(5000);
      this.debugG = this.add.graphics().setDepth(4900);
    }
    // pályaindításkor: nehézség és hangulat (a tanuló kör és a fejlesztői ?level indítás kivétel);
    // a választás a szabályokat is érinti, ezért utána újraindul a jelenet a kiválasztott móddal
    if (!this.tutorialWanted && !params.level && this.askMode) {
      this.choosing = true;
      this.touch.setEnabled(false);
      const s0 = save.get();
      new ModePicker(this, `${this.levelId}. ${getLevel(this.levelId).name}`, { hard: s0.hard, horror: s0.horror }, (m) => {
        save.update((d) => ({ ...d, hard: m.hard, horror: m.horror }));
        this.scene.restart({ level: this.levelId, seed: this.seed, mode: m });
      });
    } else {
      if (this.mode.horror) this.horrorFx = new HorrorFx(this, g);
      sfx.startMusic(!!this.mode.horror);
    }
    if (g.player.zone === FACTORY) this.showZone(FACTORY);
    else cam.scrollX = this.streetScroll();
    cam.fadeIn(300);
    signalReady(this);
  }

  private uiHit(x: number, y: number): boolean {
    // jobb felső sarok gombjai
    return y < 70 && x > VW - 270;
  }

  /** az utcán a kamera a Mikulást követi; ha az utca keskenyebb a képernyőnél, középre kerül */
  private streetScroll(): number {
    const w = this.g.street.w;
    if (w <= VW) return -(VW - w) / 2;
    return Math.max(0, Math.min(w - VW, this.g.player.x - CX));
  }

  /** a szánúton a kamera előre néz: a szán a képernyő bal harmadában */
  private driveScroll(): number {
    const R = this.g.road;
    return Math.max(0, Math.min(R.w - VW, this.g.player.x - VW * 0.3));
  }

  private view(): StreetView | InteriorView | FactoryView | DriveView {
    const z = this.g.player.zone;
    if (z === FACTORY && this.factory) return this.factory;
    if (z === ROAD && this.drive) return this.drive;
    return z === STREET || !this.interior ? this.street : this.interior;
  }

  private showZone(zone: number): void {
    const cam = this.cameras.main;
    this.interior?.destroy();
    this.interior = null;
    if (zone !== FACTORY) {
      this.factory?.destroy();
      this.factory = null;
    }
    if (zone !== ROAD) {
      this.drive?.destroy();
      this.drive = null;
    }
    if (zone === ROAD) {
      this.drive = new DriveView(this, this.g);
      this.street.layer.setVisible(false);
      this.snow.setVisible(true);
      cam.scrollX = this.driveScroll();
    } else if (zone === FACTORY) {
      this.factory ??= new FactoryView(this, this.g);
      this.street.layer.setVisible(false);
      this.snow.setVisible(false);
      cam.scrollX = -(VW - 960) / 2;
    } else if (zone === STREET) {
      this.street.layer.setVisible(true);
      this.snow.setVisible(true);
      cam.scrollX = this.streetScroll();
    } else {
      this.interior = new InteriorView(this, this.g, this.g.houses[zone]);
      this.street.layer.setVisible(false);
      this.snow.setVisible(false);
      // a 960 széles szoba a képernyő közepén
      cam.scrollX = -(VW - 960) / 2;
    }
    cam.fadeIn(220, 6, 16, 42);
  }

  private onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (k === 'p' || k === 'escape') this.setPaused(!this.paused);
    if (this.paused) return;
    if (k === 'm') {
      setMuted(!sfx.isMuted);
      this.hud.setMuted(sfx.isMuted);
    }
    if (k === 'q') this.touch.toggleQuiet();
    if (k === 'c' || k === 'h') this.touch.toggleHide();
    if (k === 'e' || k === ' ') this.keyInteract = true;
    if (k === 'f' || k === 'r') this.keyTool = true;
    if (k === 'enter' && this.g.phase === 'pack') this.g.packDone();
  }

  private setPaused(p: boolean): void {
    if (this.ending || this.g.phase === 'result') return;
    this.paused = p;
    this.pause.setVisible(p);
    this.touch.setEnabled(!p);
    if (p) {
      sfx.stopMusic();
      sfx.ambient('rain', 0);
    } else sfx.startMusic();
  }

  private endRound(): void {
    if (this.ending) return;
    this.ending = true;
    this.touch.setEnabled(false);
    sfx.stopMusic();
    this.time.delayedCall(700, () => {
      this.cameras.main.fadeOut(400, 6, 16, 42);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('Result', { result: this.g.result, level: this.levelId, seed: this.seed, log: this.g.score.log, mode: this.mode }),
      );
    });
  }

  update(time: number, delta: number): void {
    if (this.paused || this.choosing) return;
    const g = this.g;
    const dt = Math.min(delta / 1000, 0.1) * params.fast;
    this.acc += dt;
    let first = true;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      const f = emptyInput();
      const k = this.keys;
      const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      if (kx || ky) {
        f.mx = kx;
        f.my = ky;
      } else {
        f.mx = this.touch.mx;
        f.my = this.touch.my;
      }
      clampMove(f);
      f.quiet = this.touch.quiet || k.SHIFT.isDown;
      f.hide = this.touch.hide;
      if (first) {
        f.interact = this.touch.consumeInteract() || this.keyInteract;
        f.tool = this.touch.consumeTool() || this.keyTool;
        this.keyInteract = false;
        this.keyTool = false;
        first = false;
      }
      g.update(STEP, f);
      if (g.phase === 'result') break;
    }

    const realDt = Math.min(delta / 1000, 0.1);
    this.street.update(realDt, time);
    this.interior?.update(realDt, time);
    this.factory?.update(realDt, time);
    this.drive?.update(realDt, time);
    this.hud.update(realDt, time);
    this.touch.setTarget(g.target);
    // eszköz-gomb: a zsebben lévő eszköz (vagy a kézben lévő szaloncukor) a faluban
    const p0 = g.player;
    const toolIcon = p0.zone === FACTORY || p0.zone === ROAD ? null : p0.pocket.item ? icon(p0.pocket.item) : p0.hand.item === 'candy' ? icon('candy') : null;
    this.touch.setTool(toolIcon, !!g.toolTarget);
    this.touch.setInHouse(isHouse(g.player.zone));
    this.tutorial?.update(realDt, time);
    this.horrorFx?.update(realDt, time);
    this.ambient.update(realDt);

    // kamera követi a Mikulást az utcán
    const cam = this.cameras.main;
    if (g.player.zone === STREET) {
      const target = this.streetScroll();
      cam.scrollX += (target - cam.scrollX) * Math.min(1, realDt * 6);
    } else if (g.player.zone === ROAD) cam.scrollX = this.driveScroll();

    // léptek
    const p = g.player;
    if (p.speed01 > 0.1 && p.zone !== ROAD) {
      this.stepTimer -= realDt * (0.6 + p.speed01);
      if (this.stepTimer <= 0) {
        this.stepTimer = 0.36;
        const soft = p.quiet || p.hidden;
        sfx.play(p.zone === STREET ? (soft ? 'stepQuiet' : 'step') : soft ? 'stepQuietWood' : 'stepWood');
        // a házban a lépés zaja is látszik
        if (isHouse(p.zone) && !p.quiet && !p.hidden && p.speed01 > 0.5) this.view().ripples.spawn(p.x, p.y, 22, 0xffffff);
      }
    }

    // eső a viharos gyárban; szánkócsengő a szánúton (a rénszarvasok ütemére)
    sfx.ambient('rain', g.level.storm && p.zone === FACTORY && !g.over ? 0.3 : 0);
    if (p.zone === ROAD && g.phase === 'drive') {
      this.jingleT -= realDt;
      if (this.jingleT <= 0) {
        this.jingleT = 0.42 - 0.18 * p.speed01;
        sfx.play('jingle', 0.5 + 0.5 * p.speed01);
      }
    }

    // a zene veszélynél gyorsul
    let danger = 0;
    if (isHouse(p.zone)) {
      const h = g.houses[p.zone];
      const sl = mostAwake(h);
      danger = Math.max(sl.meter.ratio > 0.6 ? (sl.meter.ratio - 0.6) * 2.5 : 0, sl.suspicion, h.grandpa?.suspicion ?? 0);
      if (sl.mode !== 'asleep') danger = 1;
    }
    if (g.krampus.active && g.krampus.mode === 'chase') danger = Math.max(danger, 0.8);
    if (g.phase === 'dawn') danger = Math.max(danger, 0.6);
    sfx.danger += (Math.min(1, danger) - sfx.danger) * Math.min(1, realDt * 2);

    if (this.debugT) this.drawDebug();
  }

  private drawDebug(): void {
    const g = this.g;
    const next = g.plan.find((e) => e.t > g.deliverT);
    this.debugT!.setText(
      [
        `fázis: ${g.phase}  t=${g.deliverT.toFixed(1)}  intenzitás=${g.intensity.toFixed(2)}  fps=${this.game.loop.actualFps.toFixed(0)}`,
        `seed=${g.seed}  következő esemény: ${next ? `${next.id} @${next.t.toFixed(1)}` : '-'}`,
        ...g.houses.map(
          (h) =>
            `${h.idx + 1}. ${h.def.child.padEnd(7)} ${h.status.padEnd(7)} mérő=${h.child.meter.value.toFixed(0).padStart(3)} csúcs=${h.child.meter.peak.toFixed(0).padStart(3)} ${h.child.mode}${h.grandpa ? ` nagypapa=${h.grandpa.mode}` : ''}`,
        ),
      ].join('\n'),
    );
    const d = this.debugG!;
    d.clear().lineStyle(1, 0x00ff00, 0.8);
    const p = g.player;
    const solids = p.zone === STREET ? g.street.solids : p.zone === FACTORY ? g.factory.solids : p.zone === ROAD ? g.road.solids : g.houses[p.zone].interior.solids;
    for (const r of solids) d.strokeRect(r.x, r.y, r.w, r.h);
    if (isHouse(p.zone)) {
      d.lineStyle(1, 0xff00ff, 0.8);
      for (const r of g.houses[p.zone].interior.creaks) d.strokeRect(r.x, r.y, r.w, r.h);
    }
  }
}
