import { simulate } from './simulate';

const args = process.argv.slice(2);
const arg = (name: string, def: number): number => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};
const level = arg('level', 1);
const seed = arg('seed', 1);
const runs = arg('runs', 1);
const skill = arg('skill', 0.7);

let sumRatio = 0;
let sumScore = 0;
for (let i = 0; i < runs; i++) {
  const r = simulate(level, seed + i, skill);
  sumRatio += r.ratio;
  sumScore += r.score;
  if (runs === 1 || i < 10)
    console.log(
      `pálya ${level} seed ${seed + i}: ${r.score} pont, boldog ${r.happy}/${r.total} (${Math.round(r.ratio * 100)}%), ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}  [${r.statuses.join(' ')}]`,
    );
}
if (runs > 1) console.log(`átlag (${runs} kör): ${Math.round(sumScore / runs)} pont, boldog arány ${Math.round((sumRatio / runs) * 100)}%`);
