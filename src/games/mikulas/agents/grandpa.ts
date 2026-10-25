import { sees } from '../../../core/vision';
import type { MikulasGame, HouseState } from '../game';
import type { ElderKind } from '../layout';

/**
 * Az idős szereplő a nappaliban, háromféle:
 * - nagypapa: ébren pásztáz, közben elszundít (horkol);
 * - tévéző nagypapa: a tévét nézi, zajra hátrafordul; a tévé hangja elnyomja a zajok egy részét;
 * - nagymama: köt (nem figyel), időnként abbahagyja (a kötőtűk elhallgatnak), és körülnéz.
 * Ébredés vagy felnézés előtt figyelmeztető fázis jön ('waking' / 'pause'): a látókúp már
 * látszik (narancssárga), de még nem lát.
 */
export interface GrandpaState {
  kind: ElderKind;
  x: number;
  y: number;
  dir: number;
  mode: 'awake' | 'dozing' | 'waking' | 'knit' | 'pause' | 'look';
  timer: number;
  /** ébredés után legalább ennyi ideig ébren marad */
  minAwake: number;
  sweepT: number;
  suspicion: number;
  distract: number;
  distractDir: number;
}

export function createGrandpa(h: HouseState, g: MikulasGame, kind: ElderKind): GrandpaState {
  const T = g.tuning;
  const it = h.interior;
  const range = kind === 'grandma' ? T.grandma.knit : kind === 'tv' ? T.tv.awake : T.grandpa.awake;
  return {
    kind,
    x: it.grandpa.x,
    y: it.grandpa.y,
    dir: it.elderDir,
    mode: kind === 'grandma' ? 'knit' : 'awake',
    timer: g.rng.range(range[0], range[1]),
    minAwake: 0,
    sweepT: g.rng.range(0, T.grandpa.sweepPeriod),
    suspicion: 0,
    distract: 0,
    distractDir: 0,
  };
}

/** Figyel-e most (látókúp aktív). */
export const elderWatching = (gp: GrandpaState): boolean => gp.mode === 'awake' || gp.mode === 'look';

/** Mindjárt figyelni fog (figyelmeztető fázis). */
export const elderWarning = (gp: GrandpaState): boolean => gp.mode === 'waking' || gp.mode === 'pause';

export function wakeGrandpa(gp: GrandpaState, g: MikulasGame, minTime = 0): void {
  if (gp.kind === 'grandma') {
    if (gp.mode === 'knit') {
      gp.mode = 'pause';
      gp.timer = g.tuning.grandma.pause;
    } else if (gp.mode === 'look') gp.timer = Math.max(gp.timer, minTime);
    return;
  }
  gp.minAwake = Math.max(gp.minAwake, minTime);
  if (gp.mode === 'dozing') {
    // nem azonnal: előbb figyelmeztet (narancssárga látókúp)
    gp.mode = 'waking';
    gp.timer = g.tuning.grandpa.warnNoise;
  } else if (gp.mode === 'awake') gp.timer = Math.max(gp.timer, minTime);
}

/** Zajra reagál: a nagypapa felriad, a tévéző hátrafordul, a nagymama felnéz. */
export function hearElder(gp: GrandpaState, g: MikulasGame, effect: number, fromX: number, fromY: number): void {
  if (gp.kind === 'grandpa') {
    if (gp.mode === 'dozing' && effect >= g.tuning.grandpa.wakeNoise) wakeGrandpa(gp, g);
  } else if (gp.kind === 'tv') {
    if (gp.mode === 'awake' && effect >= g.tuning.tv.noiseTurn && gp.distract <= 0) {
      gp.distract = g.tuning.tv.turn;
      gp.distractDir = Math.atan2(fromY - gp.y, fromX - gp.x);
    } else if (gp.mode === 'dozing' && effect >= g.tuning.grandpa.wakeNoise) wakeGrandpa(gp, g);
  } else if (gp.mode === 'knit' && effect >= g.tuning.grandma.noiseLook) wakeGrandpa(gp, g);
}

export function updateGrandpa(h: HouseState, dt: number, g: MikulasGame): void {
  const gp = h.grandpa!;
  const T = g.tuning.grandpa;
  const base = h.interior.elderDir;
  gp.timer -= dt;
  if (gp.timer <= 0) {
    if (gp.kind === 'grandma') {
      const G = g.tuning.grandma;
      if (gp.mode === 'knit') {
        gp.mode = 'pause';
        gp.timer = G.pause;
      } else if (gp.mode === 'pause') {
        gp.mode = 'look';
        gp.timer = G.look;
      } else {
        gp.mode = 'knit';
        gp.timer = g.rng.range(G.knit[0], G.knit[1]);
      }
    } else {
      const K = gp.kind === 'tv' ? g.tuning.tv : T;
      if (gp.mode === 'awake') {
        gp.mode = 'dozing';
        gp.timer = g.rng.range(K.dozing[0], K.dozing[1]);
      } else if (gp.mode === 'dozing') {
        gp.mode = 'waking';
        gp.timer = T.warn;
      } else {
        gp.mode = 'awake';
        gp.timer = Math.max(g.rng.range(K.awake[0], K.awake[1]), gp.minAwake);
        gp.minAwake = 0;
      }
    }
    gp.suspicion = 0;
  }
  gp.sweepT += dt;
  if (gp.distract > 0) {
    gp.distract -= dt;
    gp.dir = gp.distractDir;
  } else if (gp.kind === 'grandpa' && (gp.mode === 'awake' || gp.mode === 'waking')) {
    gp.dir = base + T.sweepAmp * Math.sin((gp.sweepT / T.sweepPeriod) * Math.PI * 2);
  } else if (gp.kind === 'tv') {
    gp.dir = base + 0.08 * Math.sin(gp.sweepT * 0.7);
  } else if (gp.kind === 'grandma') {
    gp.dir = gp.mode === 'look' ? base + g.tuning.grandma.sweepAmp * Math.sin(gp.sweepT * 1.6) : base;
  }

  const p = g.player;
  let seen = false;
  if (elderWatching(gp) && p.zone === h.idx && h.status !== 'lost') {
    const K = gp.kind === 'tv' ? g.tuning.tv : gp.kind === 'grandma' ? g.tuning.grandma : T;
    seen =
      Math.hypot(p.x - gp.x, p.y - gp.y) < T.near ||
      sees({ x: gp.x, y: gp.y, dir: gp.dir, halfAngle: K.halfAngle, range: K.range }, p.x, p.y, h.interior.blockers);
  }
  gp.suspicion = Math.max(0, Math.min(1, gp.suspicion + (seen ? T.detectRate : -1.5) * dt));
  if (gp.suspicion >= 1) g.caught(h, 'grandpa');
}
