import { sees } from '../../../core/vision';
import { STREET } from '../types';
import type { MikulasGame } from '../game';

/**
 * Járőröző rendőrautó az utcán: az utca egyik felén oda-vissza jár, a fényszórója előtte világít.
 * Ha a Mikulás a fénybe kerül: szirénázik (zaj), megállítja (igazoltatás), és időt veszít.
 */
export interface PoliceState {
  x: number;
  y: number;
  dir: 1 | -1;
  minX: number;
  maxX: number;
  /** igazoltatás: áll, villog */
  stop: number;
  /** ennyi ideig nem állít meg újra */
  cooldown: number;
}

export function createPolice(g: MikulasGame, n: number): PoliceState[] {
  const st = g.street;
  const y = (st.laneTop + st.laneBottom) / 2;
  const sides = [
    { minX: 80, maxX: st.plazaX - 320 },
    { minX: st.plazaX + 320, maxX: st.w - 80 },
  ].filter((s) => s.maxX - s.minX > 260);
  const out: PoliceState[] = [];
  for (let i = 0; i < n && sides.length; i++) {
    const s = sides[i % sides.length];
    out.push({ x: g.rng.range(s.minX, s.maxX), y, dir: g.rng.chance(0.5) ? 1 : -1, minX: s.minX, maxX: s.maxX, stop: 0, cooldown: 0 });
  }
  return out;
}

export function policeCone(g: MikulasGame, c: PoliceState) {
  const T = g.tuning.police;
  return { x: c.x + c.dir * 30, y: c.y, dir: c.dir > 0 ? 0 : Math.PI, halfAngle: T.halfAngle, range: T.range };
}

export function updatePolice(g: MikulasGame, dt: number): void {
  const T = g.tuning.police;
  const p = g.player;
  for (const c of g.police) {
    c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.stop > 0) {
      c.stop -= dt;
      continue;
    }
    c.x += c.dir * T.speed * dt;
    if (c.x > c.maxX) c.dir = -1;
    if (c.x < c.minX) c.dir = 1;
    if (p.zone !== STREET || p.busy > 0 || c.cooldown > 0) continue;
    if (sees(policeCone(g, c), p.x, p.y, g.street.solids)) {
      // igazoltatás
      c.stop = T.stop;
      c.cooldown = T.cooldown;
      g.policeStop(c);
    }
  }
}
