import type { Rng } from './rng';

/** Egy esemény-típus a director számára. */
export interface DirectorEventDef {
  id: string;
  weight: number;
  /** ennyi mp-ig nem jöhet újra ugyanez */
  cooldown: number;
  /** csak ennél nagyobb intenzitásnál */
  minIntensity?: number;
  /** legfeljebb ennyiszer egy körben */
  maxCount?: number;
}

export interface DirectorConfig {
  duration: number;
  /** ennyi mp-enként dönt (min, max) */
  interval: [number, number];
  /** nyugalmi idő a kör elején */
  grace: number;
  events: DirectorEventDef[];
}

export interface PlannedEvent {
  t: number;
  id: string;
  /** 0..1, a célpont kiválasztásához (pl. melyik ház) */
  roll: number;
}

/** Intenzitás-görbe: lassú felfutás, hullámok, a végén csúcs. 0..1 */
export function intensityAt(t01: number): number {
  const ramp = 0.25 + 0.75 * Math.min(1, t01 * 1.3);
  const wave = 0.85 + 0.15 * Math.sin(t01 * Math.PI * 6);
  return Math.max(0, Math.min(1, ramp * wave));
}

/**
 * A teljes kör eseménysorát előre kiszámolja a seedből, így ugyanaz a seed
 * a játékos viselkedésétől függetlenül ugyanazt az eseménysort adja.
 */
export function planEvents(cfg: DirectorConfig, rng: Rng): PlannedEvent[] {
  const out: PlannedEvent[] = [];
  const lastAt = new Map<string, number>();
  const counts = new Map<string, number>();
  let t = cfg.grace;
  while (true) {
    t += rng.range(cfg.interval[0], cfg.interval[1]);
    if (t >= cfg.duration) break;
    const inten = intensityAt(t / cfg.duration);
    // magasabb intenzitásnál nagyobb eséllyel történik valami
    if (!rng.chance(0.35 + 0.65 * inten)) continue;
    const candidates = cfg.events
      .filter((e) => e.weight > 0)
      .filter((e) => (e.minIntensity ?? 0) <= inten)
      .filter((e) => t - (lastAt.get(e.id) ?? -Infinity) >= e.cooldown)
      .filter((e) => e.maxCount === undefined || (counts.get(e.id) ?? 0) < e.maxCount)
      .map((e) => ({ item: e, weight: e.weight }));
    const pick = rng.weighted(candidates);
    const roll = rng.next();
    if (!pick) continue;
    out.push({ t, id: pick.id, roll });
    lastAt.set(pick.id, t);
    counts.set(pick.id, (counts.get(pick.id) ?? 0) + 1);
  }
  return out;
}

/** Lejátssza a tervet: update() visszaadja az esedékes eseményeket. */
export class Director {
  private i = 0;

  constructor(readonly plan: PlannedEvent[]) {}

  update(t: number): PlannedEvent[] {
    const fired: PlannedEvent[] = [];
    while (this.i < this.plan.length && this.plan[this.i].t <= t) fired.push(this.plan[this.i++]);
    return fired;
  }
}
