import tuningData from './data/tuning.json';
import type { LevelDef } from './types';

export type Tuning = typeof tuningData;

/** Játékmód: hard (nehezebb) és/vagy horror. Minden pálya mind a négy kombinációban játszható. */
export interface GameMode {
  hard?: boolean;
  horror?: boolean;
}

/** a mód rövid kulcsa a mentéshez: n, h (hard), x (horror), hx (hard + horror) */
export const modeKey = (m: GameMode): string => (m.hard ? 'h' : '') + (m.horror ? 'x' : '') || 'n';

/** a módok jelvénye */
export const MODE_BADGE: Record<string, string> = { n: '🎄', h: '🔥', x: '💀', hx: '☠️' };

/** A pálya a módhoz igazítva (a nehézség és a horror a szabályokat is érinti). */
export function modeLevel(l: LevelDef, m: GameMode): LevelDef {
  const out: LevelDef = structuredClone(l);
  const ev = out.events;
  if (m.hard) {
    out.durations = { ...out.durations, pack: Math.round(l.durations.pack * 0.8), deliver: Math.round(l.durations.deliver * 0.78) };
    out.noiseScale = l.noiseScale * 1.2;
    out.decoys = l.decoys + 2;
    if (l.toolbox > 1) out.toolbox = l.toolbox - 1;
    out.strays = Math.min(5, l.strays + 1);
    ev.krampus = Math.max(ev.krampus, 1);
    if (l.police > 0) out.police = Math.min(2, l.police + 1);
    ev.dogBark += 0.5;
    ev.grandpaWake += 0.5;
  }
  if (m.horror) {
    // horrorban a Krampusz már a 2. éjszakától jár, és gyakoribb a köd
    ev.krampus = Math.max(ev.krampus, 1);
    ev.fog += 0.5;
  }
  return out;
}

/** A hangolás a módhoz igazítva: hardban gyorsabb üldözők, érzékenyebb háziak. */
export function modeTuning(t: Tuning, m: GameMode): Tuning {
  const out: Tuning = structuredClone(t);
  if (m.hard) {
    out.krampus.chase += 12;
    out.krampus.chaseRadius += 40;
    out.police.copRun += 20;
    out.police.copRange += 30;
    out.police.notice *= 0.6;
    out.cat.radius += 25;
    out.dog.radius += 20;
    out.child.detectRate *= 1.25;
    out.player.slipAfter *= 0.75;
  }
  return out;
}
