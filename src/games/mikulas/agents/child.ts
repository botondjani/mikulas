import { Meter } from '../../../core/meter';
import { sees } from '../../../core/vision';
import type { Rect, Vec } from '../../../core/geom';
import type { SleeperKind } from '../layout';
import type { MikulasGame, HouseState } from '../game';

/** Alvó a házban: a gyerek, a szülők vagy a testvér (ugyanúgy ébrednek és figyelnek). */
export interface ChildState {
  name: string;
  kind: SleeperKind;
  /** az ágyban a helye */
  home: Vec;
  /** felébredve: az ágy mellől a nappaliba */
  path: Vec[];
  /** a szobája (a benne keltett zaj jobban hallatszik) */
  room: Rect;
  meter: Meter;
  mode: 'asleep' | 'walking' | 'looking' | 'returning';
  x: number;
  y: number;
  dir: number;
  pathIdx: number;
  lookT: number;
  suspicion: number;
  sad: boolean;
}

export function createChild(name: string, bed: Vec, g: MikulasGame, kind: SleeperKind, path: Vec[], room: Rect): ChildState {
  const c = g.tuning.child;
  return {
    name,
    kind,
    home: bed,
    path,
    room,
    meter: new Meter({ max: 100, decayPerSec: c.decay, decayDelay: c.decayDelay, thresholds: [c.warn, 100] }),
    mode: 'asleep',
    x: bed.x,
    y: bed.y,
    dir: Math.PI / 2,
    pathIdx: 0,
    lookT: 0,
    suspicion: 0,
    sad: false,
  };
}

export const childAwake = (c: ChildState): boolean => c.mode !== 'asleep';

/** a ház összes alvója (az első a gyerek) */
export const sleepersOf = (h: HouseState): ChildState[] => [h.child, ...h.others];

/** a ház legébrebb alvója (a mérőhöz) */
export const mostAwake = (h: HouseState): ChildState =>
  sleepersOf(h).reduce((a, b) => (childAwake(b) && !childAwake(a) ? b : childAwake(a) && !childAwake(b) ? a : b.meter.ratio > a.meter.ratio ? b : a));

/** Utcai zaj: a ház minden alvója hallja. */
export function hearChild(h: HouseState, amount: number, g: MikulasGame): void {
  for (const c of sleepersOf(h)) hearSleeper(h, c, amount, g);
}

/** Zaj hatására nő a mérő; küszöbnél figyelmeztet, 100-nál felébred. */
export function hearSleeper(h: HouseState, c: ChildState, amount: number, g: MikulasGame): void {
  if (childAwake(c) || h.status === 'lost') return;
  const crossed = c.meter.add(amount);
  if (crossed.includes(g.tuning.child.warn)) {
    g.say('warn', { child: c.name }, 'warn');
    g.events.emit('sfx', { id: 'stir' });
    g.hint('warn');
  }
  if (c.meter.full) wakeChild(c, g);
}

function wakeChild(c: ChildState, g: MikulasGame): void {
  c.mode = 'walking';
  c.pathIdx = 0;
  c.suspicion = 0;
  g.say('wake', { child: c.name }, 'bad');
  g.events.emit('sfx', { id: 'wake' });
}

function step(c: ChildState, to: Vec, d: number): boolean {
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  const l = Math.hypot(dx, dy);
  if (l <= d) {
    c.x = to.x;
    c.y = to.y;
    return true;
  }
  c.dir = Math.atan2(dy, dx);
  c.x += (dx / l) * d;
  c.y += (dy / l) * d;
  return false;
}

export function updateChild(h: HouseState, dt: number, g: MikulasGame): void {
  for (const c of sleepersOf(h)) updateSleeper(h, c, dt, g);
}

function updateSleeper(h: HouseState, c: ChildState, dt: number, g: MikulasGame): void {
  const T = g.tuning.child;
  const path = c.path;
  switch (c.mode) {
    case 'asleep':
      c.meter.update(dt);
      return;
    case 'walking':
      if (step(c, path[c.pathIdx], T.speed * dt)) {
        if (++c.pathIdx >= path.length) {
          c.mode = 'looking';
          c.lookT = T.look;
        }
      }
      break;
    case 'looking':
      c.lookT -= dt;
      c.dir = Math.PI + Math.sin((T.look - c.lookT) * 1.8) * 1.4;
      if (c.lookT <= 0) {
        c.mode = 'returning';
        c.pathIdx = path.length - 2;
      }
      break;
    case 'returning': {
      const to = c.pathIdx >= 0 ? path[c.pathIdx] : c.home;
      if (step(c, to, T.speed * dt)) {
        if (c.pathIdx < 0) {
          c.mode = 'asleep';
          c.dir = Math.PI / 2;
          c.meter.set(T.afterReturn);
        }
        c.pathIdx--;
      }
      break;
    }
  }
  // ébren keresi a Mikulást
  const p = g.player;
  if (p.zone !== h.idx || h.status === 'lost') return;
  // elbújva vagy közvetlenül belépés után nem veszi észre
  const d = Math.hypot(p.x - c.x, p.y - c.y);
  const seen =
    !p.hidden &&
    p.grace <= 0 &&
    (d < T.near || sees({ x: c.x, y: c.y, dir: c.dir, halfAngle: T.halfAngle, range: T.range }, p.x, p.y, h.interior.blockers));
  // közelről gyorsan, messziről lassabban gyanakszik
  const rate = T.detectRate * Math.max(0.5, Math.min(1.5, 1.5 - d / T.range));
  c.suspicion = Math.max(0, Math.min(1, c.suspicion + (seen ? rate : -1.5) * dt));
  if (c.suspicion >= 1) g.caught(h, 'child');
}
