/** Seedelt, determinisztikus véletlen (mulberry32). */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Egész [min, max] között, mindkét végpontot beleértve. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  weighted<T>(items: readonly { item: T; weight: number }[]): T | null {
    const total = items.reduce((s, i) => s + Math.max(0, i.weight), 0);
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const i of items) {
      r -= Math.max(0, i.weight);
      if (r < 0) return i.item;
    }
    return items[items.length - 1].item;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Független alfolyam: ugyanabból a seedből és sóból mindig ugyanaz. */
  fork(salt: number): Rng {
    return new Rng(Math.imul(this.s ^ 0x85ebca6b, 0xc2b2ae35) ^ Math.imul(salt + 1, 0x27d4eb2f));
  }
}
