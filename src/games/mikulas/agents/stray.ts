import { moveCircle } from '../../../core/geom';
import { STREET } from '../types';
import type { MikulasGame } from '../game';

/**
 * Kóbor kutya az utcán: kóborol; ha kiszúrja a Mikulást, ugatva követi (a zaj felébreszti
 * a közeli házakat). Csonttal lecsillapítható: leül, és nem ugat többé.
 */
export interface StrayState {
  x: number;
  y: number;
  mode: 'roam' | 'follow' | 'calm';
  tx: number;
  ty: number;
  barkT: number;
  /** ennyi ideig nem szúrja ki újra a Mikulást (elvesztette a nyomát) */
  calm: number;
  /** ugatás-animáció */
  barkAnim: number;
}

export function createStrays(g: MikulasGame, n: number): StrayState[] {
  const st = g.street;
  const out: StrayState[] = [];
  for (let i = 0; i < n; i++) {
    // a tér két oldalán, az utcán
    const left = i % 2 === 0;
    const x = left ? g.rng.range(80, st.plazaX - 320) : g.rng.range(st.plazaX + 320, st.w - 80);
    const y = g.rng.chance(0.5) ? st.laneTop : st.laneBottom;
    out.push({ x, y, mode: 'roam', tx: x, ty: y, barkT: 0, calm: 0, barkAnim: 0 });
  }
  return out;
}

function step(g: MikulasGame, d: StrayState, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - d.x;
  const dy = ty - d.y;
  const l = Math.hypot(dx, dy);
  if (l < 8) return true;
  const s = Math.min(l, speed * dt);
  const p = { x: d.x, y: d.y };
  moveCircle(p, 12, (dx / l) * s, (dy / l) * s, g.street.solids, g.street.bounds);
  d.x = p.x;
  d.y = p.y;
  return false;
}

export function updateStrays(g: MikulasGame, dt: number): void {
  const T = g.tuning.stray;
  const p = g.player;
  const onStreet = p.zone === STREET && p.busy <= 0;
  for (const d of g.strays) {
    d.barkAnim = Math.max(0, d.barkAnim - dt);
    d.calm = Math.max(0, d.calm - dt);
    const dist = Math.hypot(p.x - d.x, p.y - d.y);
    if (d.mode === 'calm') continue;
    if (d.mode === 'roam') {
      if (step(g, d, d.tx, d.ty, T.roam, dt)) {
        // új kóborlási cél az utcán
        d.tx = Math.max(60, Math.min(g.street.w - 60, d.x + g.rng.range(-260, 260)));
        d.ty = g.rng.chance(0.5) ? g.street.laneTop : g.street.laneBottom;
      }
      if (onStreet && d.calm <= 0 && dist < (p.quiet ? T.noticeQuiet : T.notice)) {
        d.mode = 'follow';
        d.barkT = 0;
        g.sayOnce('strayNotice', 'strayNotice', {}, 'warn');
      }
      continue;
    }
    // követ és ugat
    if (!onStreet && p.zone !== STREET) {
      d.mode = 'roam';
      d.calm = T.calm;
      continue;
    }
    if (dist > T.lose) {
      d.mode = 'roam';
      d.calm = T.calm;
      continue;
    }
    if (dist > 50) step(g, d, p.x, p.y, T.follow, dt);
    d.barkT -= dt;
    if (d.barkT <= 0) {
      d.barkT = T.barkEvery;
      d.barkAnim = 0.5;
      g.emitNoise(STREET, d.x, d.y, g.tuning.noise.bark, 'bark');
    }
  }
}

/** Csonttal lecsillapodik: leül, és nem ugat többé. */
export function calmStray(g: MikulasGame, d: StrayState): void {
  d.mode = 'calm';
  g.say('strayFriend', {}, 'good');
}
