import { STREET } from '../types';
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

export function bark(h: HouseState, g: MikulasGame): void {
  const d = h.dog!;
  if (d.mode === 'chewing') return;
  d.barkAnim = 0.5;
  g.emitNoise(STREET, d.x, d.y, g.tuning.noise.bark, 'bark');
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
    bark(h, g);
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
