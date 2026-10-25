import { type Schema, validate } from '../../core/schema';
import { GIFTS, type LevelDef } from './types';
import l1 from './data/levels/1.json';
import l2 from './data/levels/2.json';
import l3 from './data/levels/3.json';
import l4 from './data/levels/4.json';
import l5 from './data/levels/5.json';
import l6 from './data/levels/6.json';
import l7 from './data/levels/7.json';
import l8 from './data/levels/8.json';

const num = (min = 0, max?: number): Schema => ({ type: 'number', min, max });
const optBool: Schema = { type: 'boolean', optional: true };

export const levelSchema: Schema = {
  type: 'object',
  fields: {
    id: num(1),
    name: { type: 'string' },
    subtitle: { type: 'string' },
    durations: { type: 'object', fields: { pack: num(5), deliver: num(20), dawn: num(3) } },
    noiseScale: num(0.1, 3),
    houses: {
      type: 'array',
      minLength: 1,
      maxLength: 8,
      items: {
        type: 'object',
        fields: {
          child: { type: 'string' },
          owner: { type: 'string' },
          wish: { type: 'string', oneOf: GIFTS },
          dog: optBool,
          cat: optBool,
          grandpa: optBool,
          elder: { type: 'string', oneOf: ['grandpa', 'tv', 'grandma'], optional: true },
        },
      },
    },
    decoys: num(0, 10),
    tools: { type: 'object', fields: { bone: num(), fish: num(), bell: num() } },
    candy: num(0, 6),
    toolbox: num(0, 6),
    storm: { type: 'boolean' },
    events: {
      type: 'object',
      fields: {
        dogBark: num(),
        childToss: num(),
        grandpaWake: num(),
        blizzard: num(),
        fog: num(),
        krampus: num(),
      },
    },
    stars: { type: 'array', items: num(0, 1), minLength: 3, maxLength: 3 },
    hints: { type: 'boolean' },
    obstacles: num(0, 3),
    strays: num(0, 5),
    police: num(0, 2),
  },
};

export function parseLevel(raw: unknown): LevelDef {
  const errs = validate(raw, levelSchema);
  if (errs.length) throw new Error(`Hibás pálya: ${errs.join('; ')}`);
  return raw as LevelDef;
}

export const LEVELS: LevelDef[] = [l1, l2, l3, l4, l5, l6, l7, l8].map(parseLevel);

export const getLevel = (id: number): LevelDef => LEVELS.find((l) => l.id === id) ?? LEVELS[0];
