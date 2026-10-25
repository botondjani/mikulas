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

/** Közel erős, távolodva gyorsan halkul, de a minimum a falon is áthallatszik. */
export function falloff(d: number, radius: number, minFactor: number): number {
  const k = Math.max(0, 1 - d / radius);
  return minFactor + (1 - minFactor) * k * k;
}

/** A zaj hatása egy adott pontban, ugyanabban a zónában. */
export function noiseEffect(n: Noise, x: number, y: number): number {
  return n.amount * falloff(Math.hypot(x - n.x, y - n.y), n.radius, n.minFactor);
}
