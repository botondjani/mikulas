import { STREET } from '../types';
import type { MikulasGame, HouseState } from '../game';

export interface CatState {
  mode: 'yard' | 'chimney' | 'fed';
  cooldown: number;
  /** nyávogás-animáció hátralévő ideje */
  meowAnim: number;
}

export const createCat = (): CatState => ({ mode: 'yard', cooldown: 0, meowAnim: 0 });

export const chimneyBlocked = (h: HouseState): boolean => h.cat?.mode === 'chimney';

/** Az udvaron ülő macska nyávog, ha elmész mellette, és gyakran felugrik a kéményre. */
export function updateCat(h: HouseState, dt: number, g: MikulasGame): void {
  const c = h.cat!;
  c.meowAnim = Math.max(0, c.meowAnim - dt);
  c.cooldown -= dt;
  if (c.mode !== 'yard' || h.status === 'lost' || c.cooldown > 0) return;
  const p = g.player;
  if (p.zone !== STREET || p.busy > 0) return;
  const T = g.tuning.cat;
  const pos = h.street.catYard;
  if (Math.hypot(p.x - pos.x, p.y - pos.y) > (p.quiet ? T.radiusQuiet : T.radius)) return;
  c.cooldown = T.cooldown;
  c.meowAnim = 0.6;
  g.emitNoise(STREET, pos.x, pos.y, g.tuning.noise.meow, 'meow');
  if (g.rng.chance(T.jumpChance)) {
    c.mode = 'chimney';
    g.say('catJump', { n: h.idx + 1 }, 'warn');
  }
}
