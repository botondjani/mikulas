export interface Vec {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(bx - ax, by - ay);

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

export const pointInRect = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** Szög normalizálása (-PI, PI] közé. */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Kör mozgatása téglalap-akadályok között, tengelyenként, csúszással.
 * A pozíciót helyben módosítja.
 */
export function moveCircle(p: Vec, r: number, dx: number, dy: number, solids: readonly Rect[], bounds: Rect): void {
  // nagy lépésnél részlépések, hogy ne ugorja át a vékony falat
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.5)));
  for (let i = 0; i < steps; i++) {
    p.x += dx / steps;
    for (const s of solids) pushOut(p, r, s);
    p.y += dy / steps;
    for (const s of solids) pushOut(p, r, s);
  }
  p.x = clamp(p.x, bounds.x + r, bounds.x + bounds.w - r);
  p.y = clamp(p.y, bounds.y + r, bounds.y + bounds.h - r);
}

function pushOut(p: Vec, r: number, s: Rect): void {
  const cx = clamp(p.x, s.x, s.x + s.w);
  const cy = clamp(p.y, s.y, s.y + s.h);
  const dx = p.x - cx;
  const dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * r;
    p.y = cy + (dy / d) * r;
  } else {
    // a középpont a téglalapon belül: a legközelebbi oldalon toljuk ki
    const left = p.x - s.x;
    const right = s.x + s.w - p.x;
    const top = p.y - s.y;
    const bottom = s.y + s.h - p.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) p.x = s.x - r;
    else if (m === right) p.x = s.x + s.w + r;
    else if (m === top) p.y = s.y - r;
    else p.y = s.y + s.h + r;
  }
}

/** Metszi-e a szakasz a téglalapot (Liang–Barsky). */
export function segmentHitsRect(x1: number, y1: number, x2: number, y2: number, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Sugár és téglalap metszése: a legkisebb t >= 0 (a sugár hosszának aránya), vagy Infinity. */
export function rayRect(ox: number, oy: number, dx: number, dy: number, r: Rect): number {
  let t0 = -Infinity;
  let t1 = Infinity;
  for (const [o, d, lo, hi] of [
    [ox, dx, r.x, r.x + r.w],
    [oy, dy, r.y, r.y + r.h],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      const a = (lo - o) / d;
      const b = (hi - o) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
  }
  if (t1 < t0 || t1 < 0) return Infinity;
  return Math.max(0, t0);
}

/** Pont a sokszögben (páros-páratlan szabály). */
export function pointInPolygon(x: number, y: number, pts: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
