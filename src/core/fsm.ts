/** Időzített fázisok állapotgépe. A fázis lejártakor a `next` fázisba lép. */
export interface PhaseDef<S extends string> {
  id: S;
  /** másodperc; ha nincs megadva, csak goto()-val lehet továbblépni */
  duration?: number;
  next?: S;
}

export class PhaseMachine<S extends string> {
  phase: S;
  /** a jelenlegi fázisban eltelt idő */
  time = 0;
  private defs: Map<S, PhaseDef<S>>;
  private listeners: ((to: S, from: S) => void)[] = [];

  constructor(defs: PhaseDef<S>[], initial: S) {
    this.defs = new Map(defs.map((d) => [d.id, d]));
    if (!this.defs.has(initial)) throw new Error(`Ismeretlen fázis: ${initial}`);
    this.phase = initial;
  }

  get def(): PhaseDef<S> {
    return this.defs.get(this.phase)!;
  }

  get remaining(): number {
    const d = this.def.duration;
    return d === undefined ? Infinity : Math.max(0, d - this.time);
  }

  /** 0..1, mennyi telt el a fázisból */
  get progress(): number {
    const d = this.def.duration;
    return d ? Math.max(0, Math.min(1, this.time / d)) : 0;
  }

  /** Idő hozzáadása a jelenlegi fázishoz (bónusz): ennyivel később jár le. */
  extend(seconds: number): void {
    this.time -= seconds;
  }

  onChange(fn: (to: S, from: S) => void): void {
    this.listeners.push(fn);
  }

  goto(to: S): void {
    if (!this.defs.has(to)) throw new Error(`Ismeretlen fázis: ${to}`);
    const from = this.phase;
    this.phase = to;
    this.time = 0;
    for (const l of this.listeners) l(to, from);
  }

  /** Visszaadja az új fázist, ha váltás történt. */
  update(dt: number): S | null {
    this.time += dt;
    const d = this.def;
    if (d.duration !== undefined && d.next && this.time >= d.duration) {
      this.goto(d.next);
      return d.next;
    }
    return null;
  }
}
