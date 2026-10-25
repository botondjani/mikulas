import { createStore } from './core/save';
import { Sfx } from './render/audio/synth';

/** URL-paraméterek: ?debug ?fast ?seed=N ?level=N */
const q = new URLSearchParams(globalThis.location?.search ?? '');
export const params = {
  debug: q.has('debug'),
  fast: q.has('fast') ? 3 : 1,
  seed: q.has('seed') ? Number(q.get('seed')) || 1 : null,
  level: q.has('level') ? Number(q.get('level')) || 1 : null,
};

export interface SaveData {
  stars: Record<string, number>;
  best: Record<string, number>;
  muted: boolean;
  tutorialSeen: boolean;
}

export const save = createStore<SaveData>('mikulas-ejszaka.v1', { stars: {}, best: {}, muted: false, tutorialSeen: false });

export const sfx = new Sfx(save.get().muted);

export const isUnlocked = (levelId: number): boolean => levelId === 1 || (save.get().stars[levelId - 1] ?? 0) >= 1;

export function recordResult(levelId: number, stars: number, score: number): void {
  save.update((s) => ({
    ...s,
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
