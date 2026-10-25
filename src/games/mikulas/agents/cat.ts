import type { HouseState } from '../game';

export interface CatState {
  mode: 'yard' | 'chimney' | 'fed';
}

export const createCat = (): CatState => ({ mode: 'yard' });

export const chimneyBlocked = (h: HouseState): boolean => h.cat?.mode === 'chimney';
