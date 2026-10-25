import { moveCircle } from '../../../core/geom';
import { STREET } from '../types';
import type { MikulasGame } from '../game';

export interface KrampusState {
  active: boolean;
  x: number;
  y: number;
  mode: 'walk' | 'chase' | 'toCandy' | 'eat' | 'happy' | 'leave';
  timer: number;
  eatT: number;
  targetHouse: number;
  /** az ellopott ajándék szán-azonosítója */
  stolen: number | null;
  /** visszaadás visszaszámlálója (ellopott ajándék a szánra) */
  returnT: number;
  returnItem: number | null;
}

export const createKrampus = (): KrampusState => ({
  active: false,
  x: 0,
  y: 0,
  mode: 'walk',
  timer: 0,
  eatT: 0,
  targetHouse: 0,
  stolen: null,
  returnT: 0,
  returnItem: null,
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
  k.stolen = null;
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
  g.say('krampusEat', {}, 'info');
  g.events.emit('sfx', { id: 'munch' });
}

export function updateKrampus(g: MikulasGame, dt: number): void {
  const k = g.krampus;
  const T = g.tuning.krampus;
  if (k.returnItem !== null) {
    k.returnT -= dt;
    if (k.returnT <= 0) {
      const it = g.sledItems.find((s) => s.id === k.returnItem);
      if (it) {
        g.placeOnSled(it);
        g.say('krampusReturn', { gift: it.gift }, 'info');
      }
      k.returnItem = null;
    }
  }
  if (!k.active) return;
  const p = g.player;
  k.timer -= dt;
  if (k.timer <= 0 && (k.mode === 'walk' || k.mode === 'chase')) {
    k.mode = 'leave';
    g.say('krampusLeave', {}, 'info');
  }
  const candy = g.ground.find((i) => i.kind === 'candy' && i.zone === STREET);
  // a szaloncukorért még az ellopott ajándékkal is visszajön
  const lured = k.mode === 'walk' || k.mode === 'chase' || (k.mode === 'leave' && k.stolen !== null);
  if (candy && lured && Math.hypot(candy.x - k.x, candy.y - k.y) < T.candyRadius) k.mode = 'toCandy';

  switch (k.mode) {
    case 'walk': {
      const h = g.houses[k.targetHouse].street;
      if (moveTo(g, h.cx, h.top ? g.street.laneTop : g.street.laneBottom, T.walk, dt))
        k.targetHouse = g.rng.int(0, g.houses.length - 1);
      if (p.zone === STREET && p.busy <= 0 && !p.hand.empty && Math.hypot(p.x - k.x, p.y - k.y) < T.chaseRadius)
        k.mode = 'chase';
      break;
    }
    case 'chase': {
      moveTo(g, p.x, p.y, T.chase, dt);
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (p.zone !== STREET || p.hand.empty || d > T.chaseRadius * 1.6) k.mode = 'walk';
      else if (d < T.catch) {
        const item = p.hand.take()!;
        const from = p.handFrom;
        p.handFrom = -1;
        g.events.emit('sfx', { id: 'steal' });
        if (item === 'candy') {
          startEating(g);
        } else {
          k.stolen = from;
          k.mode = 'leave';
          g.say('krampusSteal', { gift: item }, 'bad');
        }
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
        // jóllakott: ha nála van az ellopott ajándék, elejti
        if (k.stolen !== null) {
          g.ground.push({ kind: 'gift', zone: STREET, x: k.x + 24, y: k.y + 10, ttl: Infinity, item: k.stolen });
          k.stolen = null;
          g.say('krampusDrop', {}, 'good');
        } else g.say('krampusCandy', {}, 'good');
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
      if (moveTo(g, ex, k.y, T.chase, dt) || k.x < -50 || k.x > g.street.w + 50) {
        k.active = false;
        if (k.stolen !== null) {
          k.returnItem = k.stolen;
          k.returnT = T.returnGift;
          k.stolen = null;
        }
      }
      break;
    }
  }
}
