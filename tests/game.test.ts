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
  it('az ajándékok címkével a szán mellett vannak; felvehető, visszatehető, cserélhető', () => {
    const g = startDeliver(getLevel(1));
    // minden ház kapott egy címkézett ajándékot
    expect(g.houses.every((h) => g.sledItems.some((it) => it.tag === h.idx && it.gift === h.def.wish))).toBe(true);
    const a = g.sledItems.find((it) => it.tag === 0)!;
    const b = g.sledItems.find((it) => it.tag === 1)!;
    goTo(g, a.x, a.y + (a.y < 270 ? -30 : 30));
    g.update(DT, { ...idle, interact: true });
    expect(g.player.hand.item).toBe(a.gift);
    expect(g.handTag).toBe(0);
    expect(g.sledCount(a.gift)).toBe(g.sledItems.filter((x) => x.gift === a.gift).length - 1);
    // azonnal ugyanott nem tehető vissza (véletlen dupla nyomás), csak ha elment és visszajött
    g.player.busy = 0;
    expect(g.target?.kind).not.toBe('putBack');
    goTo(g, a.x + 400, a.y + (a.y < 270 ? -30 : 30));
    goTo(g, a.x, a.y + (a.y < 270 ? -30 : 30));
    g.update(DT, { ...idle, interact: true });
    expect(g.player.hand.empty).toBe(true);
    expect(a.taken).toBe(false);
    // csere: a-t felveszi, majd b-nél cserél
    g.player.busy = 0;
    g.update(DT, { ...idle, interact: true });
    goTo(g, b.x, b.y + (b.y < 270 ? -30 : 30));
    g.player.busy = 0;
    g.update(DT, { ...idle, interact: true });
    expect(g.player.hand.item).toBe(b.gift);
    expect(a.taken).toBe(false);
    expect(b.taken).toBe(true);
  });
  it('a fa alá tett ajándék eltűnik a szán mellől', () => {
    const g = startDeliver(getLevel(1));
    const a = g.sledItems.find((it) => it.tag === 0)!;
    goTo(g, a.x, a.y + (a.y < 270 ? -30 : 30));
    g.update(DT, { ...idle, interact: true });
    g.player.busy = 0;
    enter(g, 0);
    const h = g.houses[0];
    goTo(g, h.interior.treeSpot.x, h.interior.treeSpot.y);
    g.update(DT, { ...idle, interact: true });
    expect(h.status).toBe('happy');
    expect(a.gone).toBe(true);
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
    // a gyerek útjába állunk (az útja végére, a nappali közepére)
    const end = h.child && h.interior.childPath[h.interior.childPath.length - 1];
    goTo(g, end.x, end.y);
    for (let i = 0; i < 300 && h.status !== 'lost'; i++) g.update(DT, idle);
    expect(h.status).toBe('lost');
    expect(g.player.zone).toBe(STREET);
    expect(g.score.sum('caught')).toBe(-50);
  });
  it('a gyerekszobában rohangálás néhány másodperc alatt felébreszti; csendben nem', () => {
    for (const quiet of [false, true]) {
      const g = startDeliver(getLevel(1));
      const h = g.houses[0];
      enter(g, 0);
      const K = h.interior.kidroom;
      goTo(g, K.x + K.w / 2, K.y + K.h / 2);
      let t = 0;
      for (; t < 12 && h.child.mode === 'asleep'; t += DT) g.update(DT, { ...idle, mx: Math.sin(t * 3), my: Math.cos(t * 3), quiet });
      if (quiet) expect(h.child.mode).toBe('asleep');
      else expect(t).toBeLessThan(10);
    }
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
    gp.distractDir = h.interior.elderDir; // a szoba felé néz
    goTo(g, gp.x + Math.cos(gp.distractDir) * 120, gp.y + Math.sin(gp.distractDir) * 120);
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
    gp.distractDir = h.interior.elderDir + Math.PI; // a fal felé néz, mi a szoba felől jövünk
    goTo(g, gp.x + Math.cos(h.interior.elderDir) * 120, gp.y + Math.sin(h.interior.elderDir) * 120);
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
    goTo(g, h.interior.treeSpot.x, h.interior.treeSpot.y);
    g.player.dir = h.interior.elderDir + Math.PI; // a nagypapa felé dob
    g.update(DT, { ...idle, interact: true });
    expect(gp.distract).toBeGreaterThan(0);
    expect(g.ground.some((i) => i.kind === 'bell')).toBe(true);
  });
});

describe('Változatos házak', () => {
  it('a házak belseje különbözik, és minden fontos pont elérhető', async () => {
    const { findPath } = await import('../src/core/path');
    const g = new MikulasGame(getLevel(3), 11);
    const sig = new Set(g.houses.map((h) => `${h.interior.tree.x},${h.interior.fireplace.x},${h.interior.mirrored}`));
    expect(sig.size).toBeGreaterThan(4);
    for (let seed = 1; seed < 25; seed++)
      for (const h of new MikulasGame(getLevel(3), seed).houses) {
        const it = h.interior;
        for (const goal of [it.treeSpot, it.bootSpot, it.fireSpot])
          expect(findPath(it.bounds, it.solids, 22, it.doorSpot, goal)).not.toBeNull();
      }
  });
  it('a nagymama kötés közben nem figyel, utána körülnéz; a tévé elnyomja a zajt', () => {
    const lvl = custom({
      houses: [
        { child: 'A', owner: 'B', wish: 'ball', grandpa: true, elder: 'grandma' },
        { child: 'C', owner: 'D', wish: 'ball', grandpa: true, elder: 'tv' },
        { child: 'E', owner: 'F', wish: 'ball' },
      ],
    });
    const g = startDeliver(lvl);
    const gm = g.houses[0].grandpa!;
    expect(gm.mode).toBe('knit');
    const modes = new Set<string>();
    for (let i = 0; i < 60 * 15; i++) {
      g.update(DT, idle);
      modes.add(gm.mode);
    }
    expect([...modes]).toEqual(expect.arrayContaining(['knit', 'pause', 'look']));
    // ugyanaz a zaj ugyanabban a házban: szóló tévé mellett kevésbé ébreszt
    const tvH = g.houses[1];
    const gp = tvH.grandpa!;
    const door = tvH.interior.doorSpot;
    gp.mode = 'awake';
    gp.timer = 100;
    tvH.child.meter.set(0);
    g.emitNoise(1, door.x, door.y, 20, 'test');
    const withTv = tvH.child.meter.value;
    gp.mode = 'dozing';
    tvH.child.meter.set(0);
    g.emitNoise(1, door.x, door.y, 20, 'test');
    const ratio = withTv / tvH.child.meter.value;
    expect(ratio).toBeCloseTo(g.tuning.tv.mask, 5);
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

describe('Utca akadályai', () => {
  it('a zörgő kukának nekimenve zaj lesz, csendben nem', () => {
    for (const quiet of [false, true]) {
      const g = startDeliver(custom({ obstacles: 0 }));
      g.street.obstacles.push({ kind: 'bin', rect: { x: 600, y: 300, w: 30, h: 30 }, solid: true, noisy: true, slippery: false });
      g.street.solids.push(g.street.obstacles[g.street.obstacles.length - 1].rect);
      const noises: string[] = [];
      g.events.on('noise', (n) => noises.push(n.kind));
      goTo(g, 560, 315);
      for (let i = 0; i < 60; i++) g.update(DT, { ...idle, mx: 1, quiet });
      expect(noises.includes('bin')).toBe(!quiet);
    }
  });
  it('a pályákon vannak akadályok, és nem zárják el a sávokat', () => {
    for (const l of LEVELS) {
      const g = new MikulasGame(l, 3);
      expect(g.street.obstacles.length).toBeGreaterThan(2);
      for (const o of g.street.obstacles.filter((o) => o.solid && o.kind !== 'bench')) {
        const r = o.rect;
        for (const lane of [g.street.laneTop, g.street.laneBottom]) expect(lane + 14 <= r.y || lane - 14 >= r.y + r.h).toBe(true);
      }
    }
  });
});

describe('Krampusz', () => {
  const lvl = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball' }], events: { ...getLevel(2).events, krampus: 0 } });
  it('üldöz és ellopja az ajándékot, ami később visszakerül a szánra', async () => {
    const { spawnKrampus } = await import('../src/games/mikulas/agents/krampus');
    const g = startDeliver(lvl);
    spawnKrampus(g, 0);
    const it = g.sledItems.find((x) => x.gift === 'ball')!;
    it.taken = true;
    g.player.hand.put('ball');
    g.player.handFrom = it.id;
    g.krampus.x = g.player.x - 60;
    g.krampus.y = g.player.y;
    for (let i = 0; i < 120 && g.player.hand.item; i++) g.update(DT, idle);
    expect(g.player.hand.empty).toBe(true);
    for (let i = 0; i < 60 * 30; i++) g.update(DT, idle);
    expect(g.krampus.active).toBe(false);
    expect(it.taken).toBe(false);
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
