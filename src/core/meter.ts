/** Általános mérő (pl. ébrenlét, türelem): nő, késleltetve csökken, küszöböket jelez. */
export interface MeterConfig {
  max: number;
  /** csökkenés / mp */
  decayPerSec: number;
  /** ennyi mp csend után kezd csökkenni */
  decayDelay: number;
  /** növekvő sorrendben */
  thresholds: number[];
}

export class Meter {
  value = 0;
  /** a valaha elért legnagyobb érték */
  peak = 0;
  private sinceAdd = Infinity;

  constructor(readonly cfg: MeterConfig) {}

  /** Hozzáad, és visszaadja az átlépett küszöböket (felfelé). */
  add(amount: number): number[] {
    if (amount <= 0) return [];
    const before = this.value;
    this.value = Math.min(this.cfg.max, this.value + amount);
    this.peak = Math.max(this.peak, this.value);
    this.sinceAdd = 0;
    return this.cfg.thresholds.filter((t) => before < t && this.value >= t);
  }

  update(dt: number): void {
    this.sinceAdd += dt;
    if (this.sinceAdd >= this.cfg.decayDelay) {
      this.value = Math.max(0, this.value - this.cfg.decayPerSec * dt);
    }
  }

  set(v: number): void {
    this.value = Math.max(0, Math.min(this.cfg.max, v));
  }

  get ratio(): number {
    return this.value / this.cfg.max;
  }

  get full(): boolean {
    return this.value >= this.cfg.max;
  }
}
