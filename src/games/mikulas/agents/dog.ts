import { STREET } from '../types';
import { wakeGrandpa } from './grandpa';
import type { MikulasGame, HouseState } from '../game';

export interface DogState {
  x: number;
  y: number;
  mode: 'alert' | 'chewing';
  cooldown: number;
  queue: number;
  /** ugatás-animáció hátralévő ideje */
  barkAnim: number;
}

export function createDog(h: HouseState): DogState {
  return { x: h.street.dog.x, y: h.street.dog.y, mode: 'alert', cooldown: 0, queue: 0, barkAnim: 0 };
}

/**
 * Ugatás: zaj az utcán, felriasztja a ház nagyszülőjét, és (ha `spread`) a közeli
 * kutyák is rázendítenek.
 */
export function bark(h: HouseState, g: MikulasGame, spread = true): void {
  const d = h.dog!;
  if (d.mode === 'chewing') return;
  d.barkAnim = 0.5;
  g.emitNoise(STREET, d.x, d.y, g.tuning.noise.bark, 'bark');
  const gp = h.grandpa;
  if (gp && h.status !== 'lost' && (gp.mode === 'dozing' || gp.mode === 'knit')) {
    wakeGrandpa(gp, g);
    g.sayOnce(`barkWoke${h.idx}`, 'barkWoke', { n: h.idx + 1 }, 'warn');
  }
  if (!spread) return;
  for (const o of g.houses) {
    const od = o.dog;
    if (!od || o === h || od.mode !== 'alert' || o.status === 'lost' || od.queue > 0) continue;
    if (Math.hypot(od.x - d.x, od.y - d.y) < g.tuning.dog.spread) {
      od.queue = 1;
      od.cooldown = Math.max(od.cooldown, 0.6);
    }
  }
}

export function updateDog(h: HouseState, dt: number, g: MikulasGame): void {
  const d = h.dog!;
  d.barkAnim = Math.max(0, d.barkAnim - dt);
  if (d.mode === 'chewing' || h.status === 'lost') return;
  d.cooldown -= dt;
  if (d.cooldown > 0) return;
  if (d.queue > 0) {
    d.queue--;
    d.cooldown = 0.7;
    bark(h, g, false);
    return;
  }
  const p = g.player;
  if (p.zone !== STREET || p.busy > 0) return;
  const T = g.tuning.dog;
  const r = p.speed01 < 0.08 ? T.radiusStill : p.quiet ? T.radiusQuiet : T.radius;
  if (Math.hypot(p.x - d.x, p.y - d.y) < r) {
    d.cooldown = T.cooldown;
    bark(h, g);
  }
}
