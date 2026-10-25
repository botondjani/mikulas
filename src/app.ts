import { createStore } from './core/save';
import { Sfx } from './render/audio/synth';

/** URL-paraméterek: ?debug ?fast ?seed=N ?level=N */
const q = new URLSearchParams(globalThis.location?.search ?? '');
export const params = {
  debug: q.has('debug'),
  fast: q.has('fast') ? 3 : 1,
  seed: q.has('seed') ? Number(q.get('seed')) || 1 : null,
  level: q.has('level') ? Number(q.get('level')) || 1 : null,
  /** fejlesztéshez: ?horror ?hard */
  horror: q.has('horror'),
  hard: q.has('hard'),
};

export interface SaveData {
  stars: Record<string, number>;
  best: Record<string, number>;
  muted: boolean;
  tutorialSeen: boolean;
  /** utoljára választott mód */
  horror: boolean;
  hard: boolean;
  /** pályánként a teljesített módok (n, h, x, hx) */
  modes: Record<string, string[]>;
  /** régi mentés: horrorban teljesített pályák */
  skulls?: Record<string, boolean>;
  /** telefonrezgés (horror módban) */
  vibrate: boolean;
  /** hangerő, 0..1 */
  volume: number;
}

export const save = createStore<SaveData>('mikulas-ejszaka.v1', {
  stars: {},
  best: {},
  muted: false,
  tutorialSeen: false,
  horror: false,
  hard: false,
  modes: {},
  vibrate: true,
  volume: 1,
});

export const sfx = new Sfx(save.get().muted, save.get().volume);

/** Telefonrezgés (ha a böngésző tudja és be van kapcsolva). */
export function vibrate(pattern: number | number[]): void {
  if (!save.get().vibrate) return;
  try {
    globalThis.navigator?.vibrate?.(pattern);
  } catch {
    /* nem támogatott */
  }
}

export function setVolume(v: number): void {
  sfx.setVolume(v);
  save.update((s) => ({ ...s, volume: v }));
}

/** átmenetileg (tesztelés alatt) minden pálya nyitva; false-ra állítva újra sorban kell haladni */
const ALL_OPEN = true;
export const isUnlocked = (levelId: number): boolean => ALL_OPEN || levelId === 1 || (save.get().stars[levelId - 1] ?? 0) >= 1;
/** az „Indítás” ezt a pályát indítja: az első még nem teljesítettet (vagy az utolsót) */
export const nextLevelId = (ids: number[]): number => ids.find((id) => !(save.get().stars[id] >= 1)) ?? ids[ids.length - 1];

/** pályánként a teljesített módok (a régi 💀 mentést is figyelembe véve) */
export function doneModes(levelId: number): string[] {
  const s = save.get();
  const m = s.modes?.[levelId] ?? [];
  return s.skulls?.[levelId] && !m.includes('x') ? [...m, 'x'] : m;
}

export function recordResult(levelId: number, stars: number, score: number, mode = 'n'): void {
  save.update((s) => ({
    ...s,
    modes: stars > 0 && !doneModes(levelId).includes(mode) ? { ...s.modes, [levelId]: [...doneModes(levelId), mode] } : s.modes,
    stars: { ...s.stars, [levelId]: Math.max(s.stars[levelId] ?? 0, stars) },
    best: { ...s.best, [levelId]: Math.max(s.best[levelId] ?? -Infinity, score) },
  }));
}

export function setMuted(m: boolean): void {
  sfx.setMuted(m);
  save.update((s) => ({ ...s, muted: m }));
}

export const newSeed = (): number => params.seed ?? (Math.floor(Math.random() * 1e9) >>> 0);

/** A nyitóoldal töltőképernyője eltűnhet: az első jelenet kirajzolódott. */
export function signalReady(scene: { game: { events: { once(ev: string, fn: () => void): void } } }): void {
  scene.game.events.once('postrender', () => window.dispatchEvent(new Event('mikulas-ready')));
}
