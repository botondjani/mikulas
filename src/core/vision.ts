import { type Rect, segmentHitsRect, wrapAngle } from './geom';

export interface Cone {
  x: number;
  y: number;
  /** nézési irány radiánban (0 = jobbra, y lefelé nő) */
  dir: number;
  halfAngle: number;
  range: number;
}

export function inCone(c: Cone, tx: number, ty: number): boolean {
  const dx = tx - c.x;
  const dy = ty - c.y;
  if (dx * dx + dy * dy > c.range * c.range) return false;
  return Math.abs(wrapAngle(Math.atan2(dy, dx) - c.dir)) <= c.halfAngle;
}

export function hasLineOfSight(ax: number, ay: number, bx: number, by: number, blockers: readonly Rect[]): boolean {
  for (const r of blockers) if (segmentHitsRect(ax, ay, bx, by, r)) return false;
  return true;
}

/** Látja-e a kúp a célpontot (kúpon belül és nincs takarás). */
export function sees(c: Cone, tx: number, ty: number, blockers: readonly Rect[]): boolean {
  return inCone(c, tx, ty) && hasLineOfSight(c.x, c.y, tx, ty, blockers);
}
