import { clamp, type Rect, type Vec } from './geom';

/**
 * Rácsos útkeresés (szélességi keresés, 8 irány, sarkot nem vág) egy kör alakú
 * szereplőnek téglalap-akadályok között. Pályaellenőrzéshez és mesterséges mozgáshoz.
 */
export function findPath(bounds: Rect, solids: readonly Rect[], r: number, from: Vec, to: Vec, cell = 16): Vec[] | null {
  const cols = Math.floor(bounds.w / cell);
  const rows = Math.floor(bounds.h / cell);
  const free = new Uint8Array(cols * rows);
  const center = (c: number, rr: number): Vec => ({ x: bounds.x + (c + 0.5) * cell, y: bounds.y + (rr + 0.5) * cell });
  for (let rr = 0; rr < rows; rr++)
    for (let c = 0; c < cols; c++) {
      const p = center(c, rr);
      let ok = p.x >= bounds.x + r && p.x <= bounds.x + bounds.w - r && p.y >= bounds.y + r && p.y <= bounds.y + bounds.h - r;
      for (let i = 0; ok && i < solids.length; i++) {
        const s = solids[i];
        const dx = p.x - clamp(p.x, s.x, s.x + s.w);
        const dy = p.y - clamp(p.y, s.y, s.y + s.h);
        if (dx * dx + dy * dy < r * r) ok = false;
      }
      free[rr * cols + c] = ok ? 1 : 0;
    }
  const cellOf = (v: Vec): number => {
    const c = clamp(Math.floor((v.x - bounds.x) / cell), 0, cols - 1);
    const rr = clamp(Math.floor((v.y - bounds.y) / cell), 0, rows - 1);
    if (free[rr * cols + c]) return rr * cols + c;
    // a legközelebbi szabad cella
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < free.length; i++) {
      if (!free[i]) continue;
      const p = center(i % cols, Math.floor(i / cols));
      const d = (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD <= (cell * 2.5) ** 2 ? best : -1;
  };
  const start = cellOf(from);
  const goal = cellOf(to);
  if (start < 0 || goal < 0) return null;
  const prev = new Int32Array(cols * rows).fill(-1);
  prev[start] = start;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    if (cur === goal) break;
    const cx = cur % cols;
    const cy = Math.floor(cur / cols);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (!free[n] || prev[n] >= 0) continue;
        if (dx && dy && (!free[cy * cols + nx] || !free[ny * cols + cx])) continue;
        prev[n] = cur;
        queue.push(n);
      }
  }
  if (prev[goal] < 0) return null;
  const cells: number[] = [];
  for (let c = goal; c !== start; c = prev[c]) cells.push(c);
  cells.reverse();
  // egyenes szakaszok összevonása
  const pts: Vec[] = [];
  let lastDir = '';
  let prevCell = start;
  for (const c of cells) {
    const dir = `${(c % cols) - (prevCell % cols)},${Math.floor(c / cols) - Math.floor(prevCell / cols)}`;
    if (dir !== lastDir && pts.length) pts.push(center(prevCell % cols, Math.floor(prevCell / cols)));
    if (!pts.length) pts.push(center(prevCell % cols, Math.floor(prevCell / cols)));
    lastDir = dir;
    prevCell = c;
  }
  pts.push({ x: to.x, y: to.y });
  return pts;
}
