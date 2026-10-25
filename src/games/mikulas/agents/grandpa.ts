import { sees } from '../../../core/vision';
import type { MikulasGame, HouseState } from '../game';

export interface GrandpaState {
  x: number;
  y: number;
  dir: number;
  mode: 'awake' | 'dozing';
  timer: number;
  sweepT: number;
  suspicion: number;
  distract: number;
  distractDir: number;
}

export function createGrandpa(h: HouseState, g: MikulasGame): GrandpaState {
  const T = g.tuning.grandpa;
  return {
    x: h.interior.grandpa.x,
    y: h.interior.grandpa.y,
    dir: T.sweepCenter,
    mode: 'awake',
    timer: g.rng.range(T.awake[0], T.awake[1]),
    sweepT: g.rng.range(0, T.sweepPeriod),
    suspicion: 0,
    distract: 0,
    distractDir: 0,
  };
}

export function wakeGrandpa(gp: GrandpaState, g: MikulasGame, minTime = 0): void {
  const T = g.tuning.grandpa;
  if (gp.mode === 'dozing') gp.timer = g.rng.range(T.awake[0], T.awake[1]);
  gp.mode = 'awake';
  gp.timer = Math.max(gp.timer, minTime);
}

export function updateGrandpa(h: HouseState, dt: number, g: MikulasGame): void {
  const gp = h.grandpa!;
  const T = g.tuning.grandpa;
  gp.timer -= dt;
  if (gp.timer <= 0) {
    gp.mode = gp.mode === 'awake' ? 'dozing' : 'awake';
    const r = gp.mode === 'awake' ? T.awake : T.dozing;
    gp.timer = g.rng.range(r[0], r[1]);
    gp.suspicion = 0;
  }
  if (gp.distract > 0) {
    gp.distract -= dt;
    gp.dir = gp.distractDir;
  } else if (gp.mode === 'awake') {
    gp.sweepT += dt;
    gp.dir = T.sweepCenter + T.sweepAmp * Math.sin((gp.sweepT / T.sweepPeriod) * Math.PI * 2);
  }
  const p = g.player;
  let seen = false;
  if (gp.mode === 'awake' && p.zone === h.idx && h.status !== 'lost') {
    seen =
      Math.hypot(p.x - gp.x, p.y - gp.y) < T.near ||
      sees({ x: gp.x, y: gp.y, dir: gp.dir, halfAngle: T.halfAngle, range: T.range }, p.x, p.y, h.interior.blockers);
  }
  gp.suspicion = Math.max(0, Math.min(1, gp.suspicion + (seen ? T.detectRate : -1.5) * dt));
  if (gp.suspicion >= 1) g.caught(h, 'grandpa');
}
