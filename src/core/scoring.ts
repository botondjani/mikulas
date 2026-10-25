/** Szabálytábla alapú pontozás: minden kulcshoz egy pontérték. */
export interface ScoreEntry<K extends string> {
  key: K;
  points: number;
  t: number;
  label?: string;
}

export class ScoreBook<K extends string> {
  log: ScoreEntry<K>[] = [];

  constructor(readonly table: Readonly<Record<K, number>>) {}

  add(key: K, t: number, label?: string): number {
    const points = this.table[key];
    this.log.push({ key, points, t, label });
    return points;
  }

  get total(): number {
    return this.log.reduce((s, e) => s + e.points, 0);
  }

  count(key: K): number {
    return this.log.filter((e) => e.key === key).length;
  }

  sum(key: K): number {
    return this.log.filter((e) => e.key === key).reduce((s, e) => s + e.points, 0);
  }
}

/** Csillagok (0..n) az arány és a növekvő küszöbök alapján. */
export function starsFor(ratio: number, thresholds: readonly number[]): number {
  let s = 0;
  for (const t of thresholds) if (ratio >= t - 1e-9) s++;
  return s;
}
