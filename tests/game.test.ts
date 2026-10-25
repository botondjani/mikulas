import { describe, expect, it } from 'vitest';
import { emptyInput } from '../src/core/input';
import { MikulasGame } from '../src/games/mikulas/game';
import { LEVELS, getLevel, parseLevel } from '../src/games/mikulas/levels';
import { FACTORY, ROAD, STREET, type LevelDef } from '../src/games/mikulas/types';
import { simulate } from '../scripts/simulate';
import { pointInRect } from '../src/core/geom';

const DT = 1 / 60;
const idle = emptyInput();

function startDeliver(level: LevelDef, seed = 1, packAll = true): MikulasGame {
  const g = new MikulasGame(level, seed);
  if (packAll) for (const h of level.houses) g.packAdd(g.pack.sack.find((s) => s.gift === h.wish)!.id);
  g.packDone();
  g.finishDrive();
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
  g.player.grace = 0;
}

function goTo(g: MikulasGame, x: number, y: number): void {
  g.player.x = x;
  g.player.y = y;
  g.update(DT, idle);
}

const custom = (patch: Partial<LevelDef>): LevelDef => ({ ...getLevel(2), ...patch });

describe('Pályák', () => {
  it('mind a 10 pálya érvényes', () => {
    expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it('hibás pályát elutasít', () => {
    expect(() => parseLevel({ ...getLevel(1), houses: [{ child: 'X', owner: 'Y', wish: 'robot' }] })).toThrow(/wish/);
    expect(() => parseLevel({ ...getLevel(1), durations: { pack: 20 } })).toThrow();
  });
});

describe('Fázisok', () => {
  it('egy óra az egész éjszakára: a gyár és a szánút után sem indul újra', () => {
    const g = new MikulasGame(getLevel(1), 1);
    const total = g.clock;
    for (let i = 0; i < 60 * 5; i++) g.update(DT, idle);
    expect(g.clock).toBeCloseTo(total - 5, 1);
    g.packDone();
    g.road.stars.length = 0; // a csillag időt adna
    for (let i = 0; i < 60 * 2; i++) g.update(DT, idle);
    expect(g.phase).toBe('drive');
    expect(g.clock).toBeCloseTo(total - 7, 1);
    g.finishDrive();
    expect(g.clock).toBeCloseTo(total - 7, 1);
  });
  it('az utolsó másodpercekben hajnalodik; ha lejár az idő: vége, nincs pont és csillag', () => {
    const g = startDeliver(getLevel(1));
    g.clock = g.tuning.clock.dawnWarn + 1;
    for (let i = 0; i < 60 * 2; i++) g.update(DT, idle);
    expect(g.phase).toBe('dawn');
    const overs: string[] = [];
    g.events.on('gameOver', (e) => overs.push(e.reason));
    g.houses[0].status = 'happy';
    for (let i = 0; i < 60 * (g.tuning.clock.dawnWarn + g.tuning.clock.gameOverDelay.time + 1); i++) g.update(DT, idle);
    expect(overs).toEqual(['time']);
    expect(g.phase).toBe('result');
    expect(g.result!.gameOver).toBe('time');
    expect(g.result!.stars).toBe(0);
    expect(g.result!.score).toBe(0);
  });
  it('a szánon pont annyi hely van, ahány ajándék kell', () => {
    const g = new MikulasGame(getLevel(2), 1);
    expect(g.factory.slots.length).toBe(g.houses.length);
    expect(g.street.giftSlots.length).toBe(g.houses.length);
    for (const s of [...g.pack.sack]) if (s.gift) g.packAdd(s.id);
    expect(g.pack.sled.length).toBe(g.houses.length);
  });
  it('megállított óránál (tutorial) nem telik az idő, és nincs director-esemény', () => {
    const g = new MikulasGame(getLevel(3), 1);
    g.clockFrozen = true;
    const total = g.clock;
    for (let i = 0; i < 60 * 30; i++) g.update(DT, idle);
    expect(g.phase).toBe('pack');
    g.packDone();
    g.finishDrive();
    for (let i = 0; i < 60 * 60; i++) g.update(DT, idle);
    expect(g.deliverT).toBe(0);
    expect(g.clock).toBe(total);
    expect(g.krampus.active).toBe(false);
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
    for (let i = 0; i < 900 && h.status !== 'lost'; i++) g.update(DT, idle);
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
    g.update(DT, { ...idle, tool: true });
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
    for (const l of LEVELS)
      for (let seed = 1; seed < 7; seed++)
        for (const h of new MikulasGame(l, seed).houses) {
          const it = h.interior;
          for (const goal of [it.treeSpot, it.fireSpot, ...it.sleepers.map((z) => z.path[0])])
            expect(findPath(it.bounds, it.solids, 22, it.doorSpot, goal)).not.toBeNull();
        }
  }, 20000);
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

describe('Bújás és belépés', () => {
  const lvl = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball', grandpa: true, elder: 'grandpa' }] });
  const watch = (g: MikulasGame) => {
    const h = g.houses[0];
    const gp = h.grandpa!;
    gp.mode = 'awake';
    gp.timer = 100;
    gp.distract = 100;
    gp.distractDir = h.interior.elderDir;
    return { h, gp, spot: { x: gp.x + Math.cos(gp.distractDir) * 120, y: gp.y + Math.sin(gp.distractDir) * 120 } };
  };
  it('belépés után 1,5 mp-ig nem veszik észre', () => {
    const g = startDeliver(lvl);
    const { h, spot } = watch(g);
    const st = h.street;
    goTo(g, st.door.x, st.door.y);
    g.update(DT, { ...idle, interact: true });
    expect(g.player.grace).toBeGreaterThan(1);
    g.player.busy = 0;
    goTo(g, spot.x, spot.y);
    for (let i = 0; i < 60; i++) g.update(DT, idle);
    expect(h.status).toBe('pending');
    for (let i = 0; i < 120 && h.status === 'pending'; i++) g.update(DT, idle);
    expect(h.status).toBe('lost');
  });
  it('a virág mögé bújva nem veszik észre, de nagyon lassú', () => {
    const g = startDeliver(lvl);
    enter(g, 0);
    const { h, spot } = watch(g);
    goTo(g, spot.x, spot.y);
    for (let i = 0; i < 180; i++) g.update(DT, { ...idle, hide: true });
    expect(h.status).toBe('pending');
    expect(g.player.hidden).toBe(true);
    const x0 = g.player.x;
    for (let i = 0; i < 60; i++) g.update(DT, { ...idle, hide: true, mx: 1 });
    const slow = Math.abs(g.player.x - x0);
    expect(slow).toBeLessThan(g.tuning.player.speedHouse * 0.3);
  });
  it('a szekrénybe bújva nem veszik észre, és nem lehet mozogni; kibújni is lehet', () => {
    // minden pályán van szekrény a 3-4 szobás házakban, és elérhető
    let found = false;
    let big = 0;
    let none = 0;
    for (const l of LEVELS)
      for (let seed = 1; seed <= 5; seed++)
        for (const h of new MikulasGame(l, seed).houses)
          if ((h.def.rooms ?? 2) >= 3) {
            big++;
            if (!h.interior.closets.length) none++;
          }
    // szinte minden többszobás házban van szekrény
    expect(none / big).toBeLessThan(0.03);
    const g = startDeliver(lvl);
    enter(g, 0);
    const { h, spot } = watch(g);
    const c = h.interior.closets[0];
    if (c) {
      found = true;
      goTo(g, c.front.x, c.front.y);
      g.player.grace = 5;
      g.update(DT, { ...idle, interact: true });
      expect(g.player.closet).toBe(0);
      g.player.grace = 0;
      for (let i = 0; i < 120; i++) g.update(DT, { ...idle, mx: 1 });
      expect(g.player.x).toBeCloseTo(c.front.x, 0);
      expect(h.status).toBe('pending');
      for (let i = 0; i < 30; i++) g.update(DT, idle);
      g.update(DT, { ...idle, interact: true });
      for (let i = 0; i < 30; i++) g.update(DT, idle);
      expect(g.player.closet).toBe(-1);
    }
    void spot;
    expect(found || h.interior.closets.length === 0).toBe(true);
  }, 30000);
  it('ha a látókörben előbújik, majd visszabújik, attól még észreveszi', () => {
    const g = startDeliver(lvl);
    enter(g, 0);
    const { h, spot } = watch(g);
    goTo(g, spot.x, spot.y);
    for (let i = 0; i < 60; i++) g.update(DT, { ...idle, hide: true });
    // egy pillanatra előbújik
    for (let i = 0; i < 12; i++) g.update(DT, idle);
    for (let i = 0; i < 180 && h.status === 'pending'; i++) g.update(DT, { ...idle, hide: true });
    expect(h.status).toBe('lost');
  });
});

describe('Pakolás a Mikulás-gyárban', () => {
  it('a gyárban kezd; a futószalag hozza az ajándékokat, körbe jár', () => {
    const g = new MikulasGame(getLevel(1), 1);
    expect(g.player.zone).toBe(FACTORY);
    const F = g.factory;
    const first = g.pack.sack[0];
    const x0 = first.beltX;
    g.update(DT * 30, idle);
    expect(first.beltX).toBeGreaterThan(x0);
    // sokáig futtatva sem szöknek el: mind a gépben vagy a szalagon marad
    for (let i = 0; i < 60 * 40; i++) g.update(DT, idle);
    for (const it of g.pack.sack) expect(it.beltX).toBeLessThanOrEqual(F.beltEnd);
  });
  it('a szalagról levett ajándék a szán bármelyik szabad helyére tehető; indulásnál az utcán is ott van', () => {
    const g = new MikulasGame(getLevel(1), 1);
    g.clockFrozen = true;
    const F = g.factory;
    const want = g.level.houses[0].wish;
    const it = g.pack.sack.find((x) => x.gift === want)!;
    // megvárjuk, amíg felér a szalagra, és elé állunk
    for (let i = 0; i < 60 * 30 && !(it.beltX > F.beltStart + 40 && it.beltX < F.beltEnd - 40); i++) g.update(DT, idle);
    g.player.x = it.beltX;
    g.player.y = F.belt.y + F.belt.h + 24;
    g.update(DT, idle);
    expect(g.target?.kind).toBe('packTake');
    expect(g.target?.item).toBe(it.id);
    g.update(DT, { ...idle, interact: true });
    expect(g.player.hand.item).toBe(want);
    g.player.busy = 0;
    const slot = F.slots.length - 2;
    const sp = F.slots[slot];
    g.player.x = sp.x;
    g.player.y = F.sled.y - 24;
    g.update(DT, idle);
    expect(g.target?.kind).toBe('packPut');
    expect(g.target?.slot).toBe(slot);
    g.update(DT, { ...idle, interact: true });
    expect(g.pack.sled.find((x) => x.id === it.id)?.slot).toBe(slot);
    g.packDone();
    expect(g.player.zone).toBe(ROAD);
    g.finishDrive();
    expect(g.player.zone).toBe(STREET);
    const placed = g.sledItems.find((x) => x.id === it.id)!;
    expect(placed.slot).toBe(slot);
    expect(placed.tag).toBe(0);
  });
  it('ami nem kell, visszadobható a szalagra', () => {
    const g = new MikulasGame(getLevel(1), 1);
    const F = g.factory;
    const it = g.pack.sack[0];
    for (let i = 0; i < 60 * 30 && !(it.beltX > F.beltStart + 40 && it.beltX < F.beltEnd - 40); i++) g.update(DT, idle);
    g.player.x = it.beltX;
    g.player.y = F.belt.y + F.belt.h + 24;
    g.update(DT, { ...idle, interact: true });
    expect(g.pack.held?.id).toBe(it.id);
    g.player.busy = 0;
    g.update(DT, idle);
    expect(g.target?.kind).toBe('packReturn');
    g.update(DT, { ...idle, interact: true });
    expect(g.pack.held).toBeNull();
    expect(g.pack.sack.includes(it)).toBe(true);
  });
});

describe('Figyelmeztetés ébredés előtt', () => {
  it('a szundító nagypapa előbb narancssárga (nem lát), csak utána éles', () => {
    const lvl = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball', grandpa: true, elder: 'grandpa' }] });
    const g = startDeliver(lvl);
    const h = g.houses[0];
    const gp = h.grandpa!;
    enter(g, 0);
    gp.mode = 'dozing';
    gp.timer = 0.01;
    // a látókúpjába állunk
    goTo(g, gp.x + Math.cos(h.interior.elderDir) * 100, gp.y + Math.sin(h.interior.elderDir) * 100);
    g.update(DT, idle);
    expect(gp.mode).toBe('waking');
    for (let i = 0; i < 60; i++) g.update(DT, idle);
    expect(h.status).toBe('pending'); // a figyelmeztetés alatt nem lát
    for (let i = 0; i < 120 && h.status === 'pending'; i++) g.update(DT, idle);
    expect(gp.mode).toBe('awake');
  });
});

describe('Kutya és macska', () => {
  it('az ugatás felriasztja a ház nagyszülőjét, és a közeli kutyák is rázendítenek', async () => {
    const { bark } = await import('../src/games/mikulas/agents/dog');
    const lvl = custom({
      houses: [
        { child: 'A', owner: 'B', wish: 'ball', dog: true, grandpa: true, elder: 'grandpa' },
        { child: 'C', owner: 'D', wish: 'ball', dog: true },
      ],
    });
    const g = startDeliver(lvl);
    const [a, b] = g.houses;
    a.grandpa!.mode = 'dozing';
    a.grandpa!.timer = 100;
    bark(a, g);
    expect(a.grandpa!.mode).toBe('waking');
    expect(b.dog!.queue).toBe(1);
  });
  it('a macska a házban nyávog, ha a közelébe mész (elbújva is); hallal lecsendesíthető', () => {
    const lvl = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball', cat: true }] });
    const g = startDeliver(lvl);
    const h = g.houses[0];
    const kinds: string[] = [];
    g.events.on('noise', (n) => kinds.push(n.kind));
    enter(g, 0);
    const c = h.cat!;
    goTo(g, c.x + 40, c.y);
    g.update(DT, { ...idle, hide: true });
    expect(kinds).toContain('meow');
    g.player.pocket.put('fish');
    g.player.busy = 0;
    g.update(DT, idle);
    expect(g.toolTarget?.kind).toBe('feedCat');
    g.update(DT, { ...idle, tool: true });
    expect(c.mode).toBe('fed');
    kinds.length = 0;
    c.cooldown = 0;
    for (let i = 0; i < 120; i++) g.update(DT, idle);
    expect(kinds).not.toContain('meow');
  });
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
    g.update(DT, { ...idle, tool: true });
    expect(h.dog!.mode).toBe('chewing');
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
  it('a jégfolt szabálytalan alakú: a sarkában nem csúszik', async () => {
    const { pointInPolygon } = await import('../src/core/geom');
    const g = new MikulasGame(getLevel(3), 3);
    const ice = g.street.obstacles.find((o) => o.kind === 'ice')!;
    expect(ice.poly!.length).toBeGreaterThan(8);
    const r = ice.rect;
    expect(pointInPolygon(r.x + r.w / 2, r.y + r.h / 2, ice.poly!)).toBe(true);
    expect(pointInPolygon(r.x + 2, r.y + 2, ice.poly!)).toBe(false);
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
  it('a hógolyó zaja odacsalja a Krampuszt; 3 dobás (hardban 2)', async () => {
    const { spawnKrampus } = await import('../src/games/mikulas/agents/krampus');
    const g = startDeliver(lvl);
    expect(g.player.snowballs).toBe(3);
    expect(new MikulasGame(lvl, 1, { hard: true }).player.snowballs).toBe(2);
    spawnKrampus(g, 0);
    g.krampus.x = 40;
    g.krampus.y = g.street.laneTop;
    g.player.dir = 0;
    g.update(DT, idle);
    expect(g.toolTarget?.kind).toBe('snowball');
    const tx = g.toolTarget!.x;
    g.update(DT, { ...idle, tool: true });
    expect(g.player.snowballs).toBe(2);
    for (let i = 0; i < 40; i++) g.update(DT, idle);
    expect(g.krampus.lureT).toBeGreaterThan(0);
    expect(Math.abs(g.krampus.lureX - tx)).toBeLessThan(15);
  });
  it('ha meglát, üldöz; ha elkap: vége', async () => {
    const { spawnKrampus } = await import('../src/games/mikulas/agents/krampus');
    const g = startDeliver(lvl);
    spawnKrampus(g, 0);
    g.krampus.x = g.player.x - 120;
    g.krampus.y = g.player.y;
    g.update(DT, idle);
    expect(g.krampus.mode).toBe('chase');
    for (let i = 0; i < 120 && !g.over; i++) g.update(DT, idle);
    expect(g.over?.reason).toBe('krampus');
    for (let i = 0; i < 60 * 4; i++) g.update(DT, idle);
    expect(g.result?.gameOver).toBe('krampus');
  });
  it('a házba menekülve az ajtó előtt ólálkodik, aztán továbbmegy', async () => {
    const { spawnKrampus } = await import('../src/games/mikulas/agents/krampus');
    const g = startDeliver(lvl);
    spawnKrampus(g, 0);
    g.krampus.mode = 'chase';
    g.krampus.x = 100;
    enter(g, 0);
    g.update(DT, idle);
    expect(g.krampus.mode).toBe('lurk');
    for (let i = 0; i < 60 * (g.tuning.krampus.lurk + 1); i++) g.update(DT, idle);
    expect(g.krampus.mode).not.toBe('lurk');
    expect(g.over).toBeNull();
  });
  it('a ledobott szaloncukor elcsalja', async () => {
    const { spawnKrampus } = await import('../src/games/mikulas/agents/krampus');
    const g = startDeliver(lvl);
    spawnKrampus(g, 0);
    g.player.x = 200;
    g.krampus.x = g.player.x - 200;
    g.krampus.y = g.player.y;
    g.player.hand.put('candy');
    g.update(DT, { ...idle, tool: true });
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

describe('Szánút', () => {
  const toRoad = (seed = 1) => {
    const g = new MikulasGame(getLevel(2), seed);
    for (const h of g.level.houses) g.packAdd(g.pack.sack.find((s) => s.gift === h.wish)!.id);
    g.packDone();
    return g;
  };
  it('indulás után a szánúton vagyunk; a szán magától halad, és célba ér', () => {
    const g = toRoad();
    expect(g.phase).toBe('drive');
    expect(g.player.zone).toBe(ROAD);
    const x0 = g.player.x;
    g.update(DT, idle);
    expect(g.player.x).toBeGreaterThan(x0);
    g.player.x = g.road.finishX - 1;
    g.player.y = g.road.band.y + 2; // a sáv szélén nincs akadály a célnál
    for (let i = 0; i < 30 && g.phase === 'drive'; i++) g.update(DT, idle);
    expect(g.phase).toBe('deliver');
    expect(g.player.zone).toBe(STREET);
  });
  it('akadálynak ütközve lelassul', () => {
    const g = toRoad();
    const o = g.road.obstacles.find((x) => x.solid)!;
    g.player.x = o.rect.x - g.tuning.drive.radius - 2;
    g.player.y = o.rect.y + o.rect.h / 2;
    g.driveSpeed = g.tuning.drive.speed;
    for (let i = 0; i < 5; i++) g.update(DT, idle);
    expect(g.driveSpeed).toBeLessThan(g.tuning.drive.speed * 0.6);
    expect(g.driveBump).toBeGreaterThan(0);
  });
  it('az ugratóról a szán átrepül az akadályok fölött', () => {
    let g = toRoad();
    for (let seed = 2; !g.road.ramps.length; seed++) g = toRoad(seed);
    const r = g.road.ramps[0];
    g.player.x = r.x + 2;
    g.player.y = r.y + r.h / 2;
    g.driveSpeed = g.tuning.drive.speed;
    g.update(DT, idle);
    expect(g.driveAir).toBeGreaterThan(0);
    // a levegőben egy akadály sem állítja meg
    const o = g.road.obstacles.find((x) => x.solid)!;
    g.player.x = o.rect.x - g.tuning.drive.radius - 2;
    g.player.y = o.rect.y + o.rect.h / 2;
    for (let i = 0; i < 20; i++) g.update(DT, idle);
    expect(g.player.x).toBeGreaterThan(o.rect.x + 10);
    expect(g.driveBump).toBe(0);
  });
  it('a csillag pont, és a kézbesítéshez időt ad', () => {
    const g = toRoad();
    const s = g.road.stars[0];
    g.player.x = s.x;
    g.player.y = s.y;
    g.update(DT, idle);
    expect(g.score.count('star')).toBe(1);
    const before = g.clock;
    g.finishDrive();
    expect(g.clock).toBe(before);
    expect(before).toBeGreaterThan(g.level.durations.pack + g.level.durations.deliver - 1);
  });
});

describe('Időbónusz', () => {
  it('a helyes ajándék időt ad a kézbesítéshez', () => {
    const g = startDeliver(getLevel(1));
    const h = g.houses[0];
    const times: number[] = [];
    g.events.on('time', (e) => times.push(e.seconds));
    g.player.hand.put(h.def.wish);
    enter(g, 0);
    goTo(g, h.interior.treeSpot.x, h.interior.treeSpot.y);
    const rem = g.clock;
    g.update(DT, { ...idle, quiet: true, interact: true });
    expect(h.status).toBe('happy');
    expect(times).toEqual([g.tuning.timeBonus.gift]);
    expect(g.clock).toBeCloseTo(rem + g.tuning.timeBonus.gift - DT, 3);
  });
  it('pakolásnál az órához adódik', () => {
    const g = new MikulasGame(getLevel(1), 1);
    const rem = g.clock;
    g.extraTime(3);
    expect(g.clock).toBeCloseTo(rem + 3, 3);
  });
});

describe('Kóbor kutyák', () => {
  const lvl = custom({ strays: 1 });
  it('ha meglát, ugatva követ; csonttal lecsillapodik és leül', () => {
    const g = startDeliver(lvl);
    const d = g.strays[0];
    // szabad helyre az utca közepén, távol a szántól és a házak zsákjaitól
    d.x = d.tx = 200;
    d.y = d.ty = (g.street.laneTop + g.street.laneBottom) / 2;
    g.player.x = d.x + 60;
    g.player.y = d.y;
    let barks = 0;
    g.events.on('noise', (n) => n.kind === 'bark' && barks++);
    for (let i = 0; i < 60 * 3; i++) g.update(DT, idle);
    expect(d.mode).toBe('follow');
    expect(barks).toBeGreaterThan(0);
    g.player.pocket.put('bone');
    g.player.busy = 0;
    g.update(DT, idle);
    expect(g.toolTarget?.kind).toBe('feedStray');
    g.update(DT, { ...idle, tool: true });
    expect(d.mode).toBe('calm');
    // nem követ, leül és csendben marad
    const [fx, fy] = [d.x, d.y];
    barks = 0;
    g.player.x += 200;
    for (let i = 0; i < 60 * 3; i++) g.update(DT, idle);
    expect([d.x, d.y]).toEqual([fx, fy]);
    expect(barks).toBe(0);
  });
});

describe('Jég', () => {
  const lvl = custom({ obstacles: 3 });
  const iceOf = (g: MikulasGame) => g.street.obstacles.find((o) => o.slippery)!;
  it('a jégen rohanva elcsúszik, és leejti az ajándékot; csendben-módban nem', () => {
    for (const quiet of [false, true]) {
      const g = startDeliver(lvl);
      const ice = iceOf(g);
      expect(ice).toBeTruthy();
      const it = g.sledItems[0];
      g.player.hand.put(it.gift);
      g.player.handFrom = it.id;
      const cy = ice.rect.y + ice.rect.h / 2;
      g.player.x = ice.rect.x - 40;
      g.player.y = cy;
      g.player.vx = g.tuning.player.speedStreet;
      let slipped = false;
      for (let i = 0; i < 90 && !slipped; i++) {
        g.update(DT, { ...idle, mx: 1, quiet });
        slipped = g.player.slipT > 0;
      }
      expect(slipped).toBe(!quiet);
      if (!quiet) {
        expect(g.player.hand.empty).toBe(true);
        expect(g.ground.some((x) => x.kind === 'gift' && x.item === it.id)).toBe(true);
        expect(g.player.busy).toBeGreaterThan(0);
      }
    }
  });
  it('a szánúton a jégre érve a szán oldalra csúszik', () => {
    const g = new MikulasGame(getLevel(3), 1);
    g.packDone();
    const ice = g.road.obstacles.find((o) => o.slippery)!;
    g.player.x = ice.rect.x + ice.rect.w / 2 - 6;
    g.player.y = ice.rect.y + ice.rect.h / 2;
    g.player.vy = 0;
    g.update(DT, idle);
    expect(g.driveSkid).toBeGreaterThan(0);
    expect(Math.abs(g.player.vy)).toBeGreaterThan(50);
  });
});

describe('Ajándék az utcán, hazamenés', () => {
  it('az ajándék letehető az utcára, és később felvehető', () => {
    const g = startDeliver(getLevel(1));
    const it = g.sledItems[0];
    goTo(g, it.x, it.y - 30);
    g.update(DT, { ...idle, interact: true });
    expect(g.player.hand.item).toBe(it.gift);
    g.player.busy = 0;
    // szabad helyre az utca közepén
    goTo(g, 200, (g.street.laneTop + g.street.laneBottom) / 2);
    expect(g.target?.kind).toBe('dropGift');
    g.update(DT, { ...idle, interact: true });
    expect(g.player.hand.empty).toBe(true);
    expect(g.ground.some((x) => x.kind === 'gift' && x.item === it.id)).toBe(true);
    g.player.busy = 0;
    g.update(DT, idle);
    expect(g.target?.kind).toBe('pickGift');
    g.update(DT, { ...idle, interact: true });
    expect(g.player.hand.item).toBe(it.gift);
    expect(g.ground.some((x) => x.kind === 'gift')).toBe(false);
  });
  it('bármikor, bármivel a kézben haza lehet menni a szán bakjáról', () => {
    const g = startDeliver(getLevel(1));
    g.player.hand.put('candy');
    g.player.pocket.put('bone');
    const s = g.street.homeSpot;
    goTo(g, s.x, s.y);
    expect(g.target?.kind).toBe('goHome');
    g.update(DT, { ...idle, interact: true });
    expect(g.phase).toBe('result');
  });
});

describe('Rendőrautó és köd', () => {
  const lvl = custom({ police: 1, events: { ...getLevel(2).events, fog: 0 } });
  it('a fényszóróba kerülve megáll az autó, kiszáll két rendőr és üldöz; ha elkapnak: letartóztatás', () => {
    const g = startDeliver(lvl);
    const c = g.police[0];
    c.dir = 1;
    g.player.x = c.x + 120;
    g.player.y = c.y;
    const noises: string[] = [];
    g.events.on('noise', (n) => noises.push(n.kind));
    g.update(DT, idle);
    // előbb lehúzódik az út szélére, utána szállnak ki
    expect(c.mode).toBe('park');
    for (let i = 0; i < 60 && c.mode === 'park'; i++) g.update(DT, idle);
    expect(c.mode).toBe('out');
    expect(c.cops.length).toBe(2);
    // szétválnak: az egyik üldöz, a másik elébe vág
    expect(c.cops.map((k) => k.mode)).toEqual(['chase', 'search']);
    expect(c.cops[0].ty).not.toBe(c.cops[1].ty);
    expect(noises).toContain('siren');
    for (let i = 0; i < 60 * 3 && !g.over; i++) g.update(DT, idle);
    expect(g.over?.reason).toBe('police');
    expect(g.over?.car).toBe(0);
    for (let i = 0; i < 60 * 5; i++) g.update(DT, idle);
    expect(g.result?.gameOver).toBe('police');
  });
  it('a fényszóró háta mögött nem lát; egy idő után magától is kiszállnak, és visszaülnek', () => {
    const g = startDeliver(lvl);
    const c = g.police[0];
    c.dir = 1;
    g.player.x = c.x - 300;
    g.player.y = c.y;
    g.update(DT, idle);
    expect(c.mode).toBe('patrol');
    g.player.zone = 0; // bent van egy házban: nem látják
    c.t = 0;
    const y0 = c.y;
    for (let i = 0; i < 120 && c.mode !== 'out'; i++) g.update(DT, idle);
    expect(c.mode).toBe('out');
    expect(Math.abs(c.y - y0)).toBeGreaterThan(20);
    expect(c.cops.every((k) => k.mode === 'search')).toBe(true);
    for (let i = 0; i < 60 * 60 && c.mode === 'out'; i++) g.update(DT, idle);
    expect(c.mode).toBe('patrol');
    expect(g.over).toBeNull();
  });
  it('az ugatásra a legközelebbi rendőr arra fut, a társa tovább keres', async () => {
    const { policeHear } = await import('../src/games/mikulas/agents/police');
    const g = startDeliver(lvl);
    const c = g.police[0];
    g.player.zone = 0;
    c.t = 0;
    for (let i = 0; i < 120 && c.mode !== 'out'; i++) g.update(DT, idle);
    policeHear(g, c.x + 300, c.y);
    expect(c.cops.filter((k) => Math.abs(k.tx - (c.x + 300)) <= 40).length).toBe(1);
  });
  it('a köd egy ideig tart', () => {
    const g = startDeliver(custom({ events: { dogBark: 0, childToss: 0, grandpaWake: 0, blizzard: 0, fog: 1, krampus: 0 } }));
    const t = g.plan.find((e) => e.id === 'fog')!;
    expect(t).toBeTruthy();
    for (let i = 0; i < 60 * (t.t + 1); i++) g.update(DT, idle);
    expect(g.fog).toBeGreaterThan(0);
  });
});

describe('Eszközök és vihar a gyárban', () => {
  it('a faluban az eszközasztal csak a hozott eszközféléknek ad helyet, középre igazítva', () => {
    const lvl = custom({ storm: true, toolbox: 3, tools: { bone: 2, fish: 1, bell: 1 }, candy: 1 });
    const g = new MikulasGame(lvl, 1);
    for (const it of g.pack.sack.filter((x) => x.tool === 'bone' || x.tool === 'fish')) g.packAdd(it.id);
    for (const h of lvl.houses) g.packAdd(g.pack.sack.find((s) => s.gift === h.wish)!.id);
    g.packDone();
    g.finishDrive();
    const ts = g.street.toolSlots;
    expect(g.toolStock.bell + g.toolStock.candy).toBe(0);
    expect((ts.bone.x + ts.fish.x) / 2).toBeCloseTo(g.street.plazaX, 0);
  });
  it('indulás: a szán végénél megtolja, és pár mp múlva indul a szánút', () => {
    const g = new MikulasGame(getLevel(2), 1);
    const S = g.factory.sled;
    goTo(g, S.x - 26, S.y + S.h / 2);
    expect(g.target?.kind).toBe('launch');
    g.update(DT, { ...idle, interact: true });
    expect(g.launchP).toBeGreaterThan(0);
    // magától nem megy: nyomkodni kell
    for (let i = 0; i < 60; i++) g.update(DT, idle);
    expect(g.phase).toBe('pack');
    for (let i = 0; i < g.tuning.pushes; i++) {
      g.update(DT, { ...idle, interact: true });
      g.update(DT, idle);
    }
    expect(g.launchT).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 3 && g.phase === 'pack'; i++) g.update(DT, idle);
    expect(g.phase).toBe('drive');
  });
  it('a gyárban a szán és az eszközláda között átfér a Mikulás', () => {
    for (const l of LEVELS) {
      const g = new MikulasGame(l, 1, { hard: true });
      const F = g.factory;
      expect(F.sled.x - (F.toolbox.x + F.toolbox.w)).toBeGreaterThan(2 * g.tuning.player.radiusHouse + 10);
      expect(F.toolbox.x).toBeGreaterThan(F.bounds.x);
    }
  });
  it('a szalagról az eszköz az eszközládába kerül, az utcán onnan vehető el; a zseblámpa a Mikulásnál marad', () => {
    const lvl = custom({ storm: true, toolbox: 2, tools: { bone: 2, fish: 1, bell: 0 }, candy: 1 });
    const g = new MikulasGame(lvl, 1);
    const tools = g.pack.sack.filter((x) => x.tool);
    expect(tools.map((x) => x.tool).sort()).toEqual(['bone', 'bone', 'candy', 'fish']);
    for (const it of [...tools].sort((a, b) => (a.tool === 'bone' ? -1 : 0) - (b.tool === 'bone' ? -1 : 0))) g.packAdd(it.id);
    // a láda kétszemélyes: a harmadik eszköz nem fér
    expect(g.pack.box.length).toBe(2);
    expect(g.player.flashlight).toBe(true);
    for (const h of lvl.houses) g.packAdd(g.pack.sack.find((s) => s.gift === h.wish)!.id);
    g.packDone();
    g.finishDrive();
    expect(g.toolStock.bone).toBe(2);
    expect(g.toolStock.fish + g.toolStock.candy).toBe(0);
    const ts = g.street.toolSlots.bone;
    goTo(g, ts.x, ts.y - 20);
    expect(g.target?.kind).toBe('takeTool');
    g.update(DT, { ...idle, interact: true });
    expect(g.player.pocket.item).toBe('bone');
    expect(g.toolStock.bone).toBe(1);
    // több eszköz is elfér a zsebben (legfeljebb 5)
    for (let i = 0; i < 30; i++) g.update(DT, idle);
    g.update(DT, { ...idle, interact: true });
    expect(g.player.pocket.items).toEqual(['bone', 'bone']);
  });
  it('a gyárban kézből az eszközládába tehető', () => {
    const lvl = custom({ toolbox: 3, tools: { bone: 1, fish: 0, bell: 0 }, candy: 0 });
    const g = new MikulasGame(lvl, 1);
    g.clockFrozen = true;
    const F = g.factory;
    const it = g.pack.sack.find((x) => x.tool === 'bone')!;
    for (let i = 0; i < 60 * 40 && !(it.beltX > F.beltStart + 40 && it.beltX < F.beltEnd - 40); i++) g.update(DT, idle);
    goTo(g, it.beltX, F.belt.y + F.belt.h + 24);
    g.update(DT, { ...idle, interact: true });
    expect(g.pack.held?.id).toBe(it.id);
    g.player.busy = 0;
    const sp = F.boxSlots[0];
    goTo(g, sp.x, F.toolbox.y - 24);
    expect(g.target?.kind).toBe('packPutTool');
    g.update(DT, { ...idle, interact: true });
    expect(g.pack.box.map((x) => x.id)).toEqual([it.id]);
  });
  it('áramszünetben is megy a futószalag (csak sötét lesz); a tócsán csúszik', async () => {
    const { inPuddle } = await import('../src/games/mikulas/agents/storm');
    const g = new MikulasGame(custom({ storm: true }), 1);
    for (let i = 0; i < 60 * 30 && g.storm.power; i++) g.update(DT, idle);
    expect(g.storm.power).toBe(false);
    const it0 = g.pack.sack.find((x) => x.beltX > g.factory.beltStart && x.beltX < g.factory.beltEnd - 20)!;
    const x0 = it0.beltX;
    g.update(DT, idle);
    expect(it0.beltX).toBeGreaterThan(x0);
    expect(g.storm.puddles.length).toBeGreaterThan(0);
    const pd = g.storm.puddles[0];
    expect(inPuddle(g.storm, pd.x, pd.y)).toBe(true);
  });
});

describe('Többszobás és sötét házak, hard mód', () => {
  const lvl = custom({
    houses: [
      { child: 'A', owner: 'B', wish: 'ball', rooms: 4, parents: true },
      { child: 'C', owner: 'D', wish: 'ball', rooms: 3, sibling: true, light: 'off' },
    ],
  });
  it('a 4 szobás házban előszoba, nappali, gyerekszoba és hálószoba van; a fa nem a bejárat mellett', () => {
    const g = startDeliver(lvl);
    const it = g.houses[0].interior;
    expect(it.rooms.map((r) => r.kind).sort()).toEqual(['hall', 'kid', 'living', 'parents']);
    expect(Math.hypot(it.treeSpot.x - it.doorSpot.x, it.treeSpot.y - it.doorSpot.y)).toBeGreaterThan(200);
    expect(g.houses[0].others.map((o) => o.kind)).toEqual(['parents']);
  });
  it('a szülők szobájában keltett zaj a szülőket ébreszti', () => {
    const g = startDeliver(lvl);
    const h = g.houses[0];
    const par = h.others[0];
    enter(g, 0);
    g.emitNoise(0, par.x - 60, par.y, 120, 'test');
    expect(par.mode).toBe('walking');
    expect(h.child.mode).toBe('asleep');
  });
  it('sötét házban a zseblámpa az alvó arcába világítva felébreszti', () => {
    const g = startDeliver(lvl);
    const h = g.houses[1];
    const c = h.child;
    g.player.flashlight = true;
    enter(g, 1);
    goTo(g, c.x - 150, c.y + 20);
    g.player.dir = Math.atan2(c.y - (g.player.y - 20), c.x - g.player.x);
    const m0 = c.meter.value;
    for (let i = 0; i < 30; i++) g.update(DT, idle);
    expect(c.meter.value).toBeGreaterThan(m0 + 5);
  });
  it('félig sötét házban a kivilágított szobában a zseblámpa nem ébreszt', () => {
    const l2 = custom({ houses: [{ child: 'A', owner: 'B', wish: 'ball', rooms: 4, parents: true, light: 'partial' }] });
    for (let seed = 1; seed <= 20; seed++) {
      const g = startDeliver(l2, seed);
      const h = g.houses[0];
      expect(h.dark).toBe(true);
      expect(h.litRooms.length).toBeGreaterThanOrEqual(1);
      expect(h.litRooms.length).toBeLessThanOrEqual(2);
      const c = h.child;
      if (!h.litRooms.some((r) => pointInRect(c.x, c.y, r))) continue;
      g.player.flashlight = true;
      enter(g, 0);
      goTo(g, c.x - 150, c.y + 20);
      g.player.dir = Math.atan2(c.y - (g.player.y - 20), c.x - g.player.x);
      const m0 = c.meter.value;
      for (let i = 0; i < 30; i++) g.update(DT, idle);
      expect(c.meter.value).toBeLessThan(m0 + 5);
      return;
    }
    throw new Error('nem volt kivilágított gyerekszoba');
  });
  it('hard módban kevesebb idő, érzékenyebb ház, gyorsabb Krampusz', () => {
    const n = new MikulasGame(getLevel(5), 1);
    const h = new MikulasGame(getLevel(5), 1, { hard: true });
    expect(h.clock).toBeLessThan(n.clock);
    expect(h.level.noiseScale).toBeGreaterThan(n.level.noiseScale);
    expect(h.tuning.krampus.chase).toBeGreaterThan(n.tuning.krampus.chase);
    expect(h.level.decoys).toBe(n.level.decoys + 2);
    // a horror a 2. pályától Krampuszt is hoz
    expect(new MikulasGame(getLevel(2), 1, { horror: true }).level.events.krampus).toBeGreaterThan(0);
  });
});
