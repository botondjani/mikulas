import { moveCircle } from '../../../core/geom';
import { hasLineOfSight } from '../../../core/vision';
import { STREET } from '../types';
import type { MikulasGame } from '../game';

/**
 * A Krampusz az utcán kóborol; ha meglátja a Mikulást, utána fut, és ha elkapja: vége.
 * Ledobott szaloncukorral elcsalható (megeszi, jóllakik, elmegy); a házba menekülve
 * egy ideig az ajtó előtt ólálkodik.
 */
export interface KrampusState {
  active: boolean;
  x: number;
  y: number;
  mode: 'walk' | 'chase' | 'lurk' | 'toCandy' | 'eat' | 'happy' | 'leave';
  timer: number;
  eatT: number;
  targetHouse: number;
  /** ólálkodás után egy ideig nem üldöz (nem lehet a végtelenségig az ajtó előtt) */
  calm: number;
  /** hógolyó csalta el: ide megy (hátralévő idő) */
  lureT: number;
  lureX: number;
  lureY: number;
}

export const createKrampus = (): KrampusState => ({
  active: false,
  x: 0,
  y: 0,
  mode: 'walk',
  timer: 0,
  eatT: 0,
  targetHouse: 0,
  calm: 0,
  lureT: 0,
  lureX: 0,
  lureY: 0,
});

export function spawnKrampus(g: MikulasGame, roll: number): void {
  const k = g.krampus;
  if (k.active) return;
  const left = roll < 0.5;
  k.active = true;
  k.x = left ? -30 : g.street.w + 30;
  k.y = 270;
  k.mode = 'walk';
  k.timer = g.tuning.krampus.duration;
  k.targetHouse = nearestHouse(g, k.x);
  g.say('krampus', {}, 'bad');
  g.events.emit('sfx', { id: 'krampus' });
}

function nearestHouse(g: MikulasGame, x: number): number {
  let best = 0;
  for (const h of g.houses) if (Math.abs(h.street.cx - x) < Math.abs(g.houses[best].street.cx - x)) best = h.idx;
  return best;
}

function moveTo(g: MikulasGame, tx: number, ty: number, speed: number, dt: number): boolean {
  const k = g.krampus;
  const dx = tx - k.x;
  const dy = ty - k.y;
  const l = Math.hypot(dx, dy);
  if (l < 6) return true;
  const s = Math.min(l, speed * dt);
  const p = { x: k.x, y: k.y };
  moveCircle(p, 16, (dx / l) * s, (dy / l) * s, g.street.solids, { x: -80, y: 24, w: g.street.w + 160, h: 500 });
  k.x = p.x;
  k.y = p.y;
  return false;
}

function startEating(g: MikulasGame): void {
  const k = g.krampus;
  k.mode = 'eat';
  k.eatT = g.tuning.krampus.eat;
  g.events.emit('sfx', { id: 'munch' });
}

/** Látja-e a Mikulást (az utcán, közel, és nincs takarásban). */
function seesPlayer(g: MikulasGame): boolean {
  const p = g.player;
  const k = g.krampus;
  if (p.zone !== STREET || (p.busy > 0 && p.busyKind !== 'slip')) return false;
  return Math.hypot(p.x - k.x, p.y - k.y) < g.tuning.krampus.chaseRadius && hasLineOfSight(k.x, k.y, p.x, p.y, g.street.solids);
}

export function updateKrampus(g: MikulasGame, dt: number): void {
  const k = g.krampus;
  const T = g.tuning.krampus;
  if (!k.active) return;
  const p = g.player;
  k.timer -= dt;
  k.calm = Math.max(0, k.calm - dt);
  if (k.timer <= 0 && (k.mode === 'walk' || k.mode === 'lurk')) k.mode = 'leave';
  const candy = g.ground.find((i) => i.kind === 'candy' && i.zone === STREET);
  // a ledobott szaloncukorért még üldözés közben is otthagyja a Mikulást
  const lured = k.mode === 'walk' || k.mode === 'chase' || k.mode === 'lurk';
  if (candy && lured && Math.hypot(candy.x - k.x, candy.y - k.y) < T.candyRadius) k.mode = 'toCandy';

  switch (k.mode) {
    case 'walk': {
      const h = g.houses[k.targetHouse].street;
      if (k.lureT > 0) {
        // a hógolyó zajára odamegy
        k.lureT -= dt;
        moveTo(g, k.lureX, k.lureY, T.walk * 1.3, dt);
      } else if (moveTo(g, h.cx, h.top ? g.street.laneTop : g.street.laneBottom, T.walk, dt))
        k.targetHouse = g.rng.int(0, g.houses.length - 1);
      if (k.calm <= 0 && seesPlayer(g)) {
        k.mode = 'chase';
        g.events.emit('sfx', { id: 'growl' });
      }
      break;
    }
    case 'chase': {
      if (p.zone !== STREET) {
        // a házba menekült: az ajtó előtt ólálkodik egy darabig
        if (p.zone >= 0) {
          k.mode = 'lurk';
          k.targetHouse = p.zone;
          k.eatT = T.lurk;
        } else k.mode = 'walk';
        break;
      }
      moveTo(g, p.x, p.y, T.chase, dt);
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (d > T.lose) k.mode = 'walk';
      else if (d < T.catch) g.gameOver('krampus');
      break;
    }
    case 'lurk': {
      const h = g.houses[k.targetHouse].street;
      moveTo(g, h.door.x + 30, h.top ? g.street.laneTop : g.street.laneBottom, T.walk, dt);
      k.eatT -= dt;
      if (seesPlayer(g)) k.mode = 'chase';
      else if (k.eatT <= 0) {
        // megunta: messzebbre megy, és egy darabig nem üldöz
        k.mode = 'walk';
        k.calm = T.calm;
        k.targetHouse = g.houses.reduce((a, b) => (Math.abs(b.street.cx - k.x) > Math.abs(a.street.cx - k.x) ? b : a)).idx;
      }
      break;
    }
    case 'toCandy':
      if (!candy) k.mode = 'walk';
      else if (moveTo(g, candy.x, candy.y, T.chase, dt)) {
        g.ground.splice(g.ground.indexOf(candy), 1);
        startEating(g);
      }
      break;
    case 'eat':
      k.eatT -= dt;
      if (k.eatT <= 0) {
        k.mode = 'happy';
        k.eatT = T.happy;
        g.events.emit('sfx', { id: 'yum' });
      }
      break;
    case 'happy':
      k.eatT -= dt;
      if (k.eatT <= 0) k.mode = 'leave';
      break;
    case 'leave': {
      const ex = k.x < g.street.w / 2 ? -60 : g.street.w + 60;
      if (moveTo(g, ex, k.y, T.chase, dt) || k.x < -50 || k.x > g.street.w + 50) k.active = false;
      break;
    }
  }
}

/** üldözi-e éppen a Mikulást */
export const krampusChasing = (g: MikulasGame): boolean => g.krampus.active && g.krampus.mode === 'chase';
