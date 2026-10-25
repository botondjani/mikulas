import { Rng } from '../../../core/rng';
import type { MikulasGame, HouseState } from '../game';

/**
 * Macska a házban: ha a Mikulás a közelébe megy, nyávogni kezd (elbújva is), és ezzel
 * felébresztheti a háziakat. Hallal lecsendesíthető.
 */
export interface CatState {
  x: number;
  y: number;
  mode: 'idle' | 'fed';
  /** a következő nyávogásig */
  cooldown: number;
  /** nyávogás-animáció hátralévő ideje */
  meowAnim: number;
}

/** A macska helye: a házban egy szabad pont, távol a bejáratoktól. */
export function createCat(h: HouseState, seed: number): CatState {
  const rng = new Rng(seed).fork(40 + h.idx);
  const it = h.interior;
  const B = it.bounds;
  const free = (x: number, y: number) =>
    !it.solids.some((r) => x > r.x - 26 && x < r.x + r.w + 26 && y > r.y - 26 && y < r.y + r.h + 26) &&
    [it.doorSpot, it.fireSpot, it.treeSpot].every((p) => Math.hypot(p.x - x, p.y - y) > 110);
  let x = B.x + B.w / 2;
  let y = B.y + B.h / 2;
  for (let i = 0; i < 60; i++) {
    const cx = rng.range(B.x + 40, B.x + B.w - 40);
    const cy = rng.range(B.y + 40, B.y + B.h - 40);
    if (free(cx, cy)) {
      x = cx;
      y = cy;
      break;
    }
  }
  return { x, y, mode: 'idle', cooldown: 0, meowAnim: 0 };
}

export function updateCat(h: HouseState, dt: number, g: MikulasGame): void {
  const c = h.cat!;
  c.meowAnim = Math.max(0, c.meowAnim - dt);
  c.cooldown -= dt;
  if (c.mode === 'fed' || h.status === 'lost' || c.cooldown > 0) return;
  const p = g.player;
  if (p.zone !== h.idx || p.grace > 0) return;
  const T = g.tuning.cat;
  if (Math.hypot(p.x - c.x, p.y - c.y) > T.radius) return;
  c.cooldown = T.meowEvery;
  c.meowAnim = 0.6;
  g.emitNoise(h.idx, c.x, c.y, g.tuning.noise.meow, 'meow');
}
