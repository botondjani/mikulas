/** Zajforrás egy zónában (pl. utca vagy egy ház belseje). */
export interface Noise {
  zone: number;
  x: number;
  y: number;
  amount: number;
  /** ezen a távolságon túl csak a minimum-szorzó érvényes */
  radius: number;
  /** 0..1, a legkisebb hatás aránya (a falon is áthallatszik) */
  minFactor: number;
}

export function falloff(d: number, radius: number, minFactor: number): number {
  return Math.max(minFactor, 1 - d / radius);
}

/** A zaj hatása egy adott pontban, ugyanabban a zónában. */
export function noiseEffect(n: Noise, x: number, y: number): number {
  return n.amount * falloff(Math.hypot(x - n.x, y - n.y), n.radius, n.minFactor);
}
