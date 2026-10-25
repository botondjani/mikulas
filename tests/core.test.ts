import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Meter } from '../src/core/meter';
import { PhaseMachine } from '../src/core/fsm';
import { Director, planEvents } from '../src/core/director';
import { ScoreBook, starsFor } from '../src/core/scoring';
import { inCone, sees } from '../src/core/vision';
import { moveCircle } from '../src/core/geom';
import { validate } from '../src/core/schema';
import { createStore } from '../src/core/save';

describe('Rng', () => {
  it('ugyanaz a seed ugyanazt a sort adja', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 10 }, () => a.next())).toEqual(Array.from({ length: 10 }, () => b.next()));
  });
  it('a fork független és determinisztikus', () => {
    expect(new Rng(1).fork(3).next()).toBe(new Rng(1).fork(3).next());
    expect(new Rng(1).fork(3).next()).not.toBe(new Rng(1).fork(4).next());
  });
});

describe('Meter', () => {
  const cfg = { max: 100, decayPerSec: 10, decayDelay: 1, thresholds: [70, 100] };
  it('zajra nő, küszöböt jelez, és a maximumnál megáll', () => {
    const m = new Meter(cfg);
    expect(m.add(60)).toEqual([]);
    expect(m.add(15)).toEqual([70]);
    expect(m.add(50)).toEqual([100]);
    expect(m.value).toBe(100);
    expect(m.full).toBe(true);
  });
  it('csak a késleltetés után csökken, a csúcs megmarad', () => {
    const m = new Meter(cfg);
    m.add(50);
    m.update(0.5);
    expect(m.value).toBe(50);
    m.update(1);
    expect(m.value).toBeLessThan(50);
    expect(m.peak).toBe(50);
  });
});

describe('PhaseMachine', () => {
  it('lejáratkor továbblép, és értesít', () => {
    const fsm = new PhaseMachine<'a' | 'b' | 'c'>(
      [
        { id: 'a', duration: 1, next: 'b' },
        { id: 'b', duration: 2, next: 'c' },
        { id: 'c' },
      ],
      'a',
    );
    const seen: string[] = [];
    fsm.onChange((to) => seen.push(to));
    fsm.update(0.5);
    expect(fsm.phase).toBe('a');
    fsm.update(0.6);
    expect(fsm.phase).toBe('b');
    fsm.update(5);
    expect(fsm.phase).toBe('c');
    fsm.update(100);
    expect(seen).toEqual(['b', 'c']);
  });
});

describe('Director', () => {
  const cfg = {
    duration: 150,
    interval: [6, 11] as [number, number],
    grace: 8,
    events: [
      { id: 'x', weight: 2, cooldown: 10 },
      { id: 'y', weight: 1, cooldown: 20, maxCount: 2 },
      { id: 'z', weight: 1, cooldown: 0, minIntensity: 0.9 },
    ],
  };
  it('ugyanarra a seedre ugyanazt az eseménysort adja', () => {
    expect(planEvents(cfg, new Rng(7))).toEqual(planEvents(cfg, new Rng(7)));
    expect(planEvents(cfg, new Rng(7))).not.toEqual(planEvents(cfg, new Rng(8)));
  });
  it('betartja a cooldownt, a maximumot és a nyugalmi időt', () => {
    for (let s = 0; s < 30; s++) {
      const plan = planEvents(cfg, new Rng(s));
      expect(plan.every((e) => e.t > 8 && e.t < 150)).toBe(true);
      expect(plan.filter((e) => e.id === 'y').length).toBeLessThanOrEqual(2);
      const xs = plan.filter((e) => e.id === 'x').map((e) => e.t);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(10);
    }
  });
  it('időrendben adja ki az eseményeket', () => {
    const d = new Director([
      { t: 1, id: 'a', roll: 0 },
      { t: 3, id: 'b', roll: 0 },
    ]);
    expect(d.update(0.5)).toEqual([]);
    expect(d.update(2).map((e) => e.id)).toEqual(['a']);
    expect(d.update(10).map((e) => e.id)).toEqual(['b']);
  });
});

describe('Scoring', () => {
  it('összegez és számol', () => {
    const s = new ScoreBook({ a: 10, b: -3 });
    s.add('a', 0);
    s.add('a', 1);
    s.add('b', 2);
    expect(s.total).toBe(17);
    expect(s.count('a')).toBe(2);
  });
  it('csillagok a küszöbök szerint', () => {
    const t = [0.5, 0.75, 1];
    expect(starsFor(0.25, t)).toBe(0);
    expect(starsFor(0.5, t)).toBe(1);
    expect(starsFor(5 / 6, t)).toBe(2);
    expect(starsFor(1, t)).toBe(3);
  });
});

describe('Látás és ütközés', () => {
  it('látókúp: szög és távolság', () => {
    const c = { x: 0, y: 0, dir: 0, halfAngle: 0.5, range: 100 };
    expect(inCone(c, 50, 10)).toBe(true);
    expect(inCone(c, 50, 60)).toBe(false);
    expect(inCone(c, 150, 0)).toBe(false);
    expect(inCone(c, -50, 0)).toBe(false);
  });
  it('a fal eltakarja a célpontot', () => {
    const c = { x: 0, y: 0, dir: 0, halfAngle: 0.5, range: 200 };
    expect(sees(c, 100, 0, [{ x: 40, y: -20, w: 10, h: 40 }])).toBe(false);
    expect(sees(c, 100, 0, [{ x: 40, y: 30, w: 10, h: 40 }])).toBe(true);
  });
  it('a kör nem megy át a falon', () => {
    const p = { x: 0, y: 50 };
    moveCircle(p, 10, 100, 0, [{ x: 50, y: 0, w: 20, h: 100 }], { x: -100, y: -100, w: 400, h: 400 });
    expect(p.x).toBeLessThanOrEqual(40.0001);
  });
});

describe('Séma és mentés', () => {
  it('validate jelzi a hibákat', () => {
    const s = { type: 'object', fields: { n: { type: 'number', min: 1 }, k: { type: 'string', oneOf: ['a'] } } } as const;
    expect(validate({ n: 2, k: 'a' }, s)).toEqual([]);
    expect(validate({ n: 0, k: 'b' }, s)).toHaveLength(2);
  });
  it('localStorage nélkül is működik', () => {
    const st = createStore('teszt', { a: 1 });
    st.set({ a: 2 });
    expect(st.get().a).toBe(2);
  });
});
