import { MikulasGame, type GameResult } from '../src/games/mikulas/game';
import { getLevel } from '../src/games/mikulas/levels';
import { Robot } from './robot';

/** Egy teljes kör fejnélkül, robot-játékossal. */
export function simulate(levelId: number, seed: number, skill = 0.7): GameResult {
  const g = new MikulasGame(getLevel(levelId), seed);
  const robot = new Robot(seed, skill);
  const dt = 1 / 60;
  for (let i = 0; i < 60 * 60 * 10 && g.phase !== 'result'; i++) g.update(dt, robot.update(g, dt));
  return g.result!;
}
