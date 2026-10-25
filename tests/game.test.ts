import { describe, expect, it } from 'vitest';
import { emptyInput } from '../src/core/input';
import { MikulasGame } from '../src/games/mikulas/game';
import { LEVELS, getLevel, parseLevel } from '../src/games/mikulas/levels';
import { STREET, type LevelDef } from '../src/games/mikulas/types';
import { simulate } from '../scripts/simulate';

const DT = 1 / 60;
const idle = emptyInput();

function startDeliver(level: LevelDef, seed = 1, packAll = true): MikulasGame {
  const g = new MikulasGame(level, seed);
  if (packAll) for (const h of level.houses) g.packAdd(g.pack.sack.find((s) => s.gift === h.wish)!.id);
  g.packDone();
  return g;
}

/** a játékost a ház belsejébe teszi (ajtón vagy kéményen) */
function enter(g: MikulasGame, idx: number, via: 'door' | 'chimney' = 'chimney'): void {
  const st = g.houses[idx].street;
  const spot = via === 'door' ? st.door : st.ladder;
  g.player.x = spot.x;
  g.player.y = spot.y;
  g.update(DT, { ...idle, interact: true });
  expect(g.player.zone).toBe(idx);
  g.player.busy = 0;
}

function goTo(g: MikulasGame, x: number, y: number): void {
  g.player.x = x;
  g.player.y = y;
  g.update(DT, idle);
}

const custom = (patch: Partial<LevelDef>): LevelDef => ({ ...getLevel(2), ...patch });

describe('Pályák', () => {
  it('mind a 3 pálya érvényes', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3]);
  });
  it('hibás pályát elutasít', () => {
    expect(() => parseLevel({ ...getLevel(1), houses: [{ child: 'X', owner: 'Y', wish: 'robot' }] })).toThrow(/wish/);
    expect(() => parseLevel({ ...getLevel(1), durations: { pack: 20 } })).toThrow();
  });
});

describe('Fázisok', () => {
  it('pakolás → kézbesítés → hajnal → eredmény', () => {
    const g = new MikulasGame(getLevel(1), 1);
    const seen: string[] = [];
    g.events.on('phase', (e) => seen.push(e.phase));
    const d = getLevel(1).durations;
    for (let t = 0; t < d.pack + d.deliver + d.dawn + 1; t += DT) g.update(DT, idle);
    expect(seen).toEqual(['deliver', 'dawn', 'result']);
    expect(g.result).not.toBeNull();
  });
  it('a felesleges ajándék pontlevonás', () => {
    const g = new MikulasGame(getLevel(1), 1);
    for (const s of [...g.pack.sack]) g.packAdd(s.id);
    g.packDone();
    expect(g.score.count('packWrong')).toBe(getLevel(1).decoys);
    expect(g.score.total).toBe(-10 * getLevel(1).decoys);
  });
  it('megállított óránál (tutorial) nem telik az idő, és nincs director-esemény', () => {
    const g = new MikulasGame(getLevel(3), 1);
    g.clockFrozen = true;
    for (let i = 0; i < 60 * 30; i++) g.update(DT, idle);
    expect(g.phase).toBe('pack');
    g.packDone();
    for (let i = 0; i < 60 * 60; i++) g.update(DT, idle);
    expect(g.deliverT).toBe(0);
    expect(g.phases.time).toBe(0);
    expect(g.krampus.active).toBe(false);
  });
  it('hajnalban nem lehet bemenni', () => {
    const g = startDeliver(getLevel(1));
    g.phases.goto('dawn');
    const st = g.houses[0].street;
    goTo(g, st.door.x, st.door.y);
    g.update(DT, { ...idle, interact: true });
    expect(g.player.zone).toBe(STREET);
  });
});

describe('Ajándék és pontozás', () => {
  it('helyes ajándék: +100, gyors bónusz, boldog ház', () => {
    const g = startDeliver(getLevel(1));
    const h = g.houses[0];
    g.player.hand.put(h.def.wish);
    enter(g, 0);
    goTo(g, h.interior.treeSpot.x, h.interior.treeSpot.y);
    g.update(DT, { ...idle, quiet: true, interact: true });
    expect(h.status).toBe('happy');
    expect(g.score.sum('gift')).toBe(100);
    expect(g.score.sum('fast')).toBe(20);
  });
  it('rossz ajándék: -30, szomorú, nem bukás', () => {
    const g = startDeliver(getLevel(1));
    const h = g.houses[0];
    g.player.hand.put(h.def.wish === 'ball' ? 'book' : 'ball');
    enter(g, 0);
    goTo(g, h.interior.treeSpot.x, h.interior.treeSpot.y);
    g.update(DT, { ...idle, interact: true });
    expect(h.status).toBe('sad');
    expect(g.score.total).toBe(-30);
  });
  it('csizma szaloncukorral: +30', () => {
    const g = startDeliver(getLevel(1));
    const h = g.houses[0];
    g.player.hand.put('candy');
    enter(g, 0);
    goTo(g, h.interior.bootSpot.x, h.interior.bootSpot.y);
    g.update(DT, { ...idle, interact: true });
    expect(h.bootFilled).toBe(true);
    expect(g.score.sum('boot')).toBe(30);
  });
  it('csendes bónusz a kör végén, ha a mérő 50 alatt maradt', () => {
    const g = startDeliver(getLevel(1));
    const h = g.houses[0];
    h.status = 'happy';
    g.phases.goto('result');
    expect(g.score.sum('quiet')).toBe(50);
    expect(g.result!.happy).toBe(1);
  });
  it('a szánról felvett ajándék fogy, a visszatett visszakerül', () => {
    const g = startDeliver(getLevel(1));
    const s = g.street.sledCenter;
    goTo(g, s.x, g.street.laneBottom);
    const gift = g.level.houses[0].wish;
    const before = g.sledStock[gift];
    g.update(DT, { ...idle, pick: gift });
    expect(g.player.hand.item).toBe(gift);
    expect(g.sledStock[gift]).toBe(before - 1);
    g.player.busy = 0;
    g.update(DT, { ...idle, interact: true });
    expect(g.player.hand.empty).toBe(true);
    expect(g.sledStock[gift]).toBe(before);
  });
});

describe('Ébrenléti mérő', () => {
  it('az ajtó zajosabb, mint a kémény; a csendben-mód halkabb', () => {
    const a = startDeliver(getLevel(1));
    enter(a, 0, 'door');
    const b = startDeliver(getLevel(1));
    enter(b, 0, 'chimney');
    expect(a.houses[0].child.meter.value).toBeGreaterThan(b.houses[0].child.meter.value * 3);

    const loud = startDeliver(getLevel(1));
    const quiet = startDeliver(getLevel(1));
    for (const [g, q] of [
      [loud, false],
      [quiet, true],
    ] as const) {
      enter(g, 0);
      for (let i = 0; i < 120; i++) g.update(DT, { ...idle, mx: i % 60 < 30 ? 1 : -1, quiet: q });
    }
    expect(loud.houses[0].child.meter.value).toBeGreaterThan(quiet.houses[0].child.meter.value * 3);
  });
  it('70-nél figyelmeztet, 100-nál felébred, és ha meglát: lebukás', () => {
    const g = startDeliver(getLevel(1));
    const h = g.houses[0];
    const captions: string[] = [];
    g.events.on('caption', (c) => captions.push(c.kind));
    enter(g, 0);
    g.emitNoise(0, h.child.x, h.child.y, 75 / g.level.noiseScale, 'test');
    expect(captions).toContain('warn');
    g.emitNoise(0, h.child.x, h.child.y, 40 / g.level.noiseScale, 'test');
    expect(h.child.mode).toBe('walking');
    // a gyerek útjába állunk
    goTo(g, 480, 300);
    for (let i = 0; i < 300 && h.status !== 'lost'; i++) g.update(DT, idle);
    expect(h.status).toBe('lost');
    expect(g.player.zone).toBe(STREET);
    expect(g.score.sum('caught')).toBe(-50);
  });
  it('idővel csökken', () => {
    const g = startDeliver(getLevel(1));
    const h = g.houses[0];
    g.emitNoise(0, h.child.x, h.child.y, 40, 'test');
    const v = h.child.meter.value;
    for (let i = 0; i < 60 * 6; i++) g.update(DT, idle);
    expect(h.child.meter.value).toBeLessThan(v);
  });
});

describe('Nagypapa', () => {
  const lvl = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball', grandpa: true }] });
  it('ébren a látókúpjában észrevesz', () => {
    const g = startDeliver(lvl);
    const h = g.houses[0];
    const gp = h.grandpa!;
    enter(g, 0);
    gp.mode = 'awake';
    gp.timer = 100;
    gp.distract = 100;
    gp.distractDir = 0; // jobbra néz
    goTo(g, gp.x + 200, gp.y);
    for (let i = 0; i < 60 && h.status !== 'lost'; i++) g.update(DT, idle);
    expect(h.status).toBe('lost');
  });
  it('háta mögött vagy szundítás közben nem lát', () => {
    const g = startDeliver(lvl);
    const h = g.houses[0];
    const gp = h.grandpa!;
    enter(g, 0);
    gp.mode = 'awake';
    gp.timer = 100;
    gp.distract = 100;
    gp.distractDir = Math.PI; // balra néz, mi jobbra vagyunk
    goTo(g, gp.x + 200, gp.y - 100);
    for (let i = 0; i < 120; i++) g.update(DT, idle);
    expect(h.status).toBe('pending');
    gp.distract = 0;
    gp.mode = 'dozing';
    gp.timer = 100;
    for (let i = 0; i < 120; i++) g.update(DT, idle);
    expect(h.status).toBe('pending');
  });
  it('a csengő elfordítja a tekintetét', () => {
    const g = startDeliver(lvl);
    const h = g.houses[0];
    const gp = h.grandpa!;
    g.player.pocket.put('bell');
    enter(g, 0);
    goTo(g, 300, 300);
    g.player.dir = -Math.PI / 2; // felfelé dob
    g.update(DT, { ...idle, interact: true });
    expect(gp.distract).toBeGreaterThan(0);
    expect(g.ground.some((i) => i.kind === 'bell')).toBe(true);
  });
});

describe('Kutya és macska', () => {
  it('a kutya ugat, ha elmész mellette, csonttal elhallgat', () => {
    const lvl = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball', dog: true }] });
    const g = startDeliver(lvl);
    const h = g.houses[0];
    const barks: string[] = [];
    g.events.on('noise', (n) => barks.push(n.kind));
    g.player.x = h.dog!.x - 40;
    g.player.y = h.dog!.y;
    g.update(DT, { ...idle, mx: -0.5 });
    expect(barks).toContain('bark');
    g.player.pocket.put('bone');
    g.update(DT, { ...idle, interact: true });
    expect(h.dog!.mode).toBe('chewing');
  });
  it('a kéményen ülő macska miatt nem lehet mászni, hallal igen', () => {
    const lvl = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball', cat: true }] });
    const g = startDeliver(lvl);
    const h = g.houses[0];
    h.cat!.mode = 'chimney';
    goTo(g, h.street.ladder.x, h.street.ladder.y);
    g.update(DT, { ...idle, interact: true });
    expect(g.player.zone).toBe(STREET);
    g.player.pocket.put('fish');
    g.update(DT, { ...idle, interact: true });
    expect(h.cat!.mode).toBe('fed');
  });
});

describe('Krampusz', () => {
  const lvl = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball' }], events: { ...getLevel(2).events, krampus: 0 } });
  it('üldöz és ellopja az ajándékot, ami később visszakerül a szánra', async () => {
    const { spawnKrampus } = await import('../src/games/mikulas/agents/krampus');
    const g = startDeliver(lvl);
    spawnKrampus(g, 0);
    g.player.hand.put('ball');
    g.sledStock.ball = 0;
    g.krampus.x = g.player.x - 60;
    g.krampus.y = g.player.y;
    for (let i = 0; i < 120 && g.player.hand.item; i++) g.update(DT, idle);
    expect(g.player.hand.empty).toBe(true);
    for (let i = 0; i < 60 * 30; i++) g.update(DT, idle);
    expect(g.krampus.active).toBe(false);
    expect(g.sledStock.ball).toBe(1);
  });
  it('a ledobott szaloncukor elcsalja', async () => {
    const { spawnKrampus } = await import('../src/games/mikulas/agents/krampus');
    const g = startDeliver(lvl);
    spawnKrampus(g, 0);
    g.player.x = 200;
    g.krampus.x = g.player.x - 200;
    g.krampus.y = g.player.y;
    g.player.hand.put('candy');
    g.update(DT, { ...idle, interact: true });
    expect(g.ground.some((i) => i.kind === 'candy')).toBe(true);
    for (let i = 0; i < 60 * 8 && g.krampus.mode !== 'eat'; i++) g.update(DT, idle);
    expect(g.krampus.mode).toBe('eat');
  });
});

describe('Determinizmus és szimuláció', () => {
  it('ugyanaz a seed ugyanazt az eseménysort adja', () => {
    expect(new MikulasGame(getLevel(3), 7).plan).toEqual(new MikulasGame(getLevel(3), 7).plan);
    expect(new MikulasGame(getLevel(3), 7).plan).not.toEqual(new MikulasGame(getLevel(3), 8).plan);
  });
  it('a robot-kör reprodukálható, és az 1. pálya teljesíthető', () => {
    expect(simulate(2, 5)).toEqual(simulate(2, 5));
    expect(simulate(1, 3).stars).toBeGreaterThanOrEqual(1);
  });
});
