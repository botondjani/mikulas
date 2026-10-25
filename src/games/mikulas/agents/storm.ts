import { Rng } from '../../../core/rng';
import type { MikulasGame } from '../game';

/**
 * Vihar a Mikulás-gyárban: a tetőn becsöpög a víz (csúszós tócsák), villámlik,
 * és időnként elmegy az áram (sötét, a futószalag megáll).
 */
export interface Puddle {
  x: number;
  y: number;
  r: number;
  max: number;
}

export interface StormState {
  active: boolean;
  /** van-e áram */
  power: boolean;
  /** a következő áramszünetig / az áram visszajöttéig */
  powerT: number;
  /** villám-fény hátralévő ideje */
  flash: number;
  nextFlash: number;
  puddles: Puddle[];
  nextPuddle: number;
  rng: Rng;
}

export function createStorm(seed: number, active: boolean, T: MikulasGame['tuning']['storm']): StormState {
  const rng = new Rng(seed).fork(9);
  return {
    active,
    power: true,
    powerT: rng.range(T.firstOutage[0], T.firstOutage[1]),
    flash: 0,
    nextFlash: rng.range(T.flash[0], T.flash[1]),
    puddles: [],
    nextPuddle: 2,
    rng,
  };
}

export function updateStorm(g: MikulasGame, dt: number): void {
  const s = g.storm;
  if (!s.active) return;
  const T = g.tuning.storm;
  const rng = s.rng;
  s.flash = Math.max(0, s.flash - dt);
  s.nextFlash -= dt;
  if (s.nextFlash <= 0) {
    s.nextFlash = rng.range(T.flash[0], T.flash[1]);
    s.flash = 0.35;
    g.events.emit('sfx', { id: 'thunder' });
  }
  s.powerT -= dt;
  if (s.powerT <= 0) {
    s.power = !s.power;
    s.powerT = s.power ? rng.range(T.between[0], T.between[1]) : rng.range(T.outage[0], T.outage[1]);
    g.events.emit('sfx', { id: s.power ? 'powerUp' : 'powerDown' });
  }
  // becsöpögő víz: új tócsa a padlón, a meglévők nőnek
  for (const p of s.puddles) p.r = Math.min(p.max, p.r + T.puddleGrow * dt);
  s.nextPuddle -= dt;
  if (s.nextPuddle <= 0 && s.puddles.length < T.puddleMax) {
    s.nextPuddle = T.puddleEvery;
    const F = g.factory;
    const B = F.bounds;
    for (let i = 0; i < 20; i++) {
      const x = rng.range(B.x + 60, B.x + B.w - 60);
      const y = rng.range(F.belt.y + F.belt.h + 40, B.y + B.h - 40);
      const max = rng.range(T.puddleR[0], T.puddleR[1]);
      const hit = F.solids.some((r) => x > r.x - max && x < r.x + r.w + max && y > r.y - max && y < r.y + r.h + max);
      if (hit || s.puddles.some((p) => Math.hypot(p.x - x, p.y - y) < p.max + max)) continue;
      s.puddles.push({ x, y, r: 6, max });
      break;
    }
  }
}

export const inPuddle = (s: StormState, x: number, y: number): boolean => s.puddles.some((p) => Math.hypot(p.x - x, p.y - y) < p.r);
