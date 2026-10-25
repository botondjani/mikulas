import type { Rect, Vec } from '../../core/geom';
import type { Rng } from '../../core/rng';
import { findPath } from '../../core/path';

export const VIEW_W = 960;
export const VIEW_H = 540;

export interface StreetHouse {
  idx: number;
  cx: number;
  top: boolean;
  body: Rect;
  door: Vec;
  ladder: Vec;
  dog: Vec;
  chimney: Vec;
}

export type ObstacleKind = 'pine' | 'snowman' | 'snowpile' | 'bin' | 'ice' | 'bench';

export interface Obstacle {
  kind: ObstacleKind;
  rect: Rect;
  /** nem lehet átmenni rajta */
  solid: boolean;
  /** nekiütközve zörög (zaj) */
  noisy: boolean;
  /** csúszós (jég) */
  slippery: boolean;
  /** szabálytalan alak (jégfolt) */
  poly?: Vec[];
}

export interface StreetLayout {
  w: number;
  h: number;
  bounds: Rect;
  solids: Rect[];
  sled: Rect;
  sledCenter: Vec;
  /** innen lehet hazaindulni (felülni a szánra) */
  homeSpot: Vec;
  reindeer: Rect;
  /** a tér közepe (a szán itt áll) */
  plazaX: number;
  plazaTree: Rect;
  /** az ajándékok helye a szánon (két sor) */
  giftSlots: Vec[];
  /** a szán helyeinek sorrendje: középről kifelé (programozott pakoláshoz) */
  slotOrder: number[];
  /** eszközök és szaloncukor a téren */
  toolSlots: { candy: Vec; bone: Vec; fish: Vec; bell: Vec };
  houses: StreetHouse[];
  obstacles: Obstacle[];
  /** ahol biztonságosan át lehet kelni az út két sávja között (robot, Krampusz) */
  crossings: number[];
  laneTop: number;
  laneBottom: number;
}

const SLOT = 300;
const BODY_W = 190;
const MARGIN = 150;
const PLAZA = 560;

/** Szabálytalan, lekerekített folt (jég) a megadott ellipszisen belül. */
function blob(rng: Rng, cx: number, cy: number, rx: number, ry: number): Vec[] {
  const n = 14;
  const phase = rng.range(0, Math.PI * 2);
  const k1 = rng.range(0.1, 0.22);
  const k2 = rng.range(0.05, 0.14);
  const pts: Vec[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 0.78 + k1 * Math.sin(a * 2 + phase) + k2 * Math.sin(a * 3 - phase * 1.7) + rng.range(-0.05, 0.05);
    pts.push({ x: cx + Math.cos(a) * rx * Math.min(1, r), y: cy + Math.sin(a) * ry * Math.min(1, r) });
  }
  return pts;
}

/**
 * Az utca: két házsor, középen tér a szánnal és az ajándékokkal.
 * `density` 0..3: mennyi akadály legyen (hóember, fenyő, hókupac, kuka, jég).
 */
export function buildStreet(houseCount: number, rng?: Rng, density = 0): StreetLayout {
  const perSide = Math.ceil(houseCount / 2);
  const leftCols = Math.ceil(perSide / 2);
  const cols: number[] = [];
  let x = MARGIN;
  let plazaX = 0;
  for (let c = 0; c < perSide; c++) {
    if (c === leftCols) {
      plazaX = x + PLAZA / 2 - (SLOT - BODY_W) / 2;
      x += PLAZA;
    }
    cols.push(x + BODY_W / 2);
    x += SLOT;
  }
  if (!plazaX) {
    plazaX = x + PLAZA / 2 - (SLOT - BODY_W) / 2;
    x += PLAZA;
  }
  const w = Math.max(VIEW_W, x + MARGIN - (SLOT - BODY_W));
  const h = VIEW_H;
  const houses: StreetHouse[] = [];
  for (let i = 0; i < houseCount; i++) {
    const top = i % 2 === 0;
    const cx = cols[Math.floor(i / 2)];
    const body: Rect = top ? { x: cx - BODY_W / 2, y: 44, w: BODY_W, h: 106 } : { x: cx - BODY_W / 2, y: 390, w: BODY_W, h: 106 };
    const front = top ? 172 : 368;
    houses.push({
      idx: i,
      cx,
      top,
      body,
      door: { x: cx, y: front },
      ladder: { x: cx + 78, y: front },
      dog: { x: cx - 78, y: top ? 186 : 354 },
      chimney: { x: cx + 55, y: top ? 70 : 470 },
    });
  }

  const P = plazaX;
  // a szán: pont annyi hely van rajta, ahány ajándék kell, két sorban
  // (a felső sor felülről, az alsó alulról érhető el)
  const { w: sw, slots: giftSlots, order: slotOrder } = sledSlots(houseCount, P, 236);
  const sled: Rect = { x: P - sw / 2, y: 236, w: sw, h: 68 };
  const reindeer: Rect = { x: sled.x - 112, y: 250, w: 100, h: 40 };
  const plazaTree: Rect = { x: P - 26, y: 60, w: 52, h: 44 };

  const toolSlots = {
    candy: { x: P - 150, y: 372 },
    bone: { x: P - 50, y: 372 },
    fish: { x: P + 50, y: 372 },
    bell: { x: P + 150, y: 372 },
  };

  // akadályok: a házak közötti réseken (kert, út közepe), a sávokat szabadon hagyva
  const obstacles: Obstacle[] = [];
  const add = (kind: ObstacleKind, cx: number, cy: number, ow: number, oh: number) =>
    obstacles.push({
      kind,
      rect: { x: cx - ow / 2, y: cy - oh / 2, w: ow, h: oh },
      solid: kind !== 'ice',
      noisy: kind === 'bin',
      slippery: kind === 'ice',
      poly: kind === 'ice' && rng ? blob(rng, cx, cy, ow / 2, oh / 2) : undefined,
    });
  add('bench', P - 235, 456, 64, 22);
  add('bench', P + 235, 456, 64, 22);
  if (rng && density > 0) {
    const gaps: number[] = [];
    for (let c = 0; c < cols.length - 1; c++) {
      const a = cols[c];
      const b = cols[c + 1];
      if (P > a && P < b) continue; // a tér
      gaps.push((a + b) / 2);
    }
    gaps.push(cols[0] - SLOT / 2, cols[cols.length - 1] + SLOT / 2);
    const p = density / 3;
    for (const gx of gaps) {
      if (gx < 40 || gx > w - 40) continue;
      if (rng.chance(p)) rng.chance(0.5) ? add('snowman', gx, 182, 34, 30) : add('pine', gx, 180, 34, 34);
      if (rng.chance(p)) rng.chance(0.5) ? add('snowman', gx, 358, 34, 30) : add('pine', gx, 360, 34, 34);
      if (rng.chance(p)) {
        const r = rng.next();
        if (r < 0.4) add('snowpile', gx, 270, 64, 30);
        else if (r < 0.75) add('bin', gx, 270, 30, 30);
        else add('ice', gx, 270, 110, 40);
      }
    }
    // jégfoltok a sávokon (csak csúszik, nem állja el az utat)
    for (let i = 0; i < density - 1; i++) {
      const gx = rng.pick(gaps);
      if (gx > 60 && gx < w - 60) add('ice', gx + rng.range(-40, 40), rng.chance(0.5) ? 228 : 312, 120, 36);
    }
  }

  return {
    w,
    h,
    bounds: { x: 0, y: 24, w, h: h - 30 },
    solids: [...houses.map((hs) => hs.body), sled, reindeer, plazaTree, ...obstacles.filter((o) => o.solid).map((o) => o.rect)],
    sled,
    sledCenter: { x: sled.x + sled.w / 2, y: sled.y + sled.h / 2 },
    // a bakra a rénszarvasok mellől lehet felülni (távol az ajándékoktól, hogy ne legyen véletlen)
    homeSpot: { x: reindeer.x + reindeer.w / 2, y: reindeer.y - 20 },
    reindeer,
    plazaX: P,
    plazaTree,
    giftSlots,
    slotOrder,
    toolSlots,
    houses,
    obstacles,
    crossings: [...cols, P + 215].sort((a, b) => a - b),
    laneTop: 228,
    laneBottom: 312,
  };
}

export type FurnitureKind = 'sofa' | 'table' | 'shelf' | 'plant';
export type ElderKind = 'grandpa' | 'tv' | 'grandma';

export interface Furniture {
  kind: FurnitureKind;
  rect: Rect;
}

export interface InteriorLayout {
  bounds: Rect;
  solids: Rect[];
  /** látást takaró elemek (falak, fenyő, polc) */
  blockers: Rect[];
  doorSpot: Vec;
  fireSpot: Vec;
  treeSpot: Vec;
  bootSpot: Vec;
  /** a csizma ablaka (rajzoláshoz) és hogy melyik falon van */
  bootWindow: Rect;
  kidWindow: Rect;
  childBed: Vec;
  /** a gyerek álombuborékja */
  dream: Vec;
  grandpa: Vec;
  /** az idős szereplő alapnézési iránya (a szoba felé) */
  elderDir: number;
  armchair: Rect;
  /** tévé (csak tévéző nagypapánál) */
  tv: Rect | null;
  fireplace: Rect;
  tree: Rect;
  bed: Rect;
  toybox: Rect;
  furniture: Furniture[];
  walls: Rect[];
  doorway: Rect;
  living: Rect;
  kidroom: Rect;
  creaks: Rect[];
  /** a felébredt gyerek útvonala az ágytól a nappali közepéig */
  childPath: Vec[];
  /** tükrözött-e (a gyerekszoba balra kerül) */
  mirrored: boolean;
  /** színváltozat */
  palette: number;
}

const ROOM: Rect = { x: 60, y: 70, w: 840, h: 440 };
const PLAYER_R = 22;

const overlaps = (a: Rect, b: Rect, pad = 0): boolean =>
  a.x < b.x + b.w + pad && a.x + a.w + pad > b.x && a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
const near = (p: Vec, r: Rect, d: number): boolean => {
  const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
  return Math.hypot(p.x - cx, p.y - cy) < d;
};

/**
 * Véletlen (seedelt) házbelső: a nappali és a gyerekszoba aránya, a válaszfal ajtaja, a kandalló,
 * a fa, az ajtó, a csizma, a fotel, a bútorok helye házanként más. A bútorok csak akkor maradnak,
 * ha minden fontos pont elérhető marad.
 */
export function buildInterior(rng: Rng, elder: ElderKind | null): InteriorLayout {
  const B = ROOM;
  const px = rng.int(500, 590);
  const dy = rng.int(140, 340);
  const walls: Rect[] = [
    { x: px, y: B.y, w: 16, h: dy - B.y },
    { x: px, y: dy + 100, w: 16, h: B.y + B.h - (dy + 100) },
  ];
  const living: Rect = { x: B.x, y: B.y, w: px - B.x, h: B.h };
  const kidroom: Rect = { x: px + 16, y: B.y, w: B.x + B.w - (px + 16), h: B.h };

  // kandalló a felső falon, ajtó az alsón
  const fx = rng.int(B.x + 30, px - 150);
  const fireplace: Rect = { x: fx, y: B.y, w: 120, h: 42 };
  const fireSpot = { x: fx + 60, y: B.y + 70 };
  const doorSpot = { x: rng.int(B.x + 60, px - 60), y: B.y + B.h - 24 };

  // fenyő: a felső fal mellett, a bal fal mellett vagy lent
  const treeOpts: { tree: Rect; spot: Vec }[] = [];
  for (let i = 0; i < 12; i++) {
    const kind = rng.int(0, 2);
    if (kind === 0) {
      const tx = rng.int(B.x + 50, px - 50);
      treeOpts.push({ tree: { x: tx - 26, y: B.y + 22, w: 52, h: 64 }, spot: { x: tx, y: B.y + 120 } });
    } else if (kind === 1) {
      const ty = rng.int(B.y + 140, B.y + B.h - 110);
      treeOpts.push({ tree: { x: B.x + 4, y: ty - 32, w: 52, h: 64 }, spot: { x: B.x + 100, y: ty } });
    } else {
      const tx = rng.int(B.x + 50, px - 50);
      treeOpts.push({ tree: { x: tx - 26, y: B.y + B.h - 80, w: 52, h: 64 }, spot: { x: tx, y: B.y + B.h - 120 } });
    }
  }
  const okTree = (o: { tree: Rect; spot: Vec }) =>
    !overlaps(o.tree, fireplace, 40) &&
    Math.hypot(o.spot.x - fireSpot.x, o.spot.y - fireSpot.y) > 110 &&
    Math.hypot(o.spot.x - doorSpot.x, o.spot.y - doorSpot.y) > 120 &&
    o.tree.x + o.tree.w < px - 30;
  const treeOpt = treeOpts.find(okTree) ?? { tree: { x: px - 110, y: B.y + 22, w: 52, h: 64 }, spot: { x: px - 84, y: B.y + 120 } };
  const tree = treeOpt.tree;
  const treeSpot = treeOpt.spot;

  // csizma egy ablaknál (bal fal vagy felső fal)
  const spots0 = [fireSpot, doorSpot, treeSpot];
  let bootSpot: Vec = { x: B.x + 36, y: B.y + B.h / 2 };
  let bootWindow: Rect = { x: B.x - 14, y: bootSpot.y - 34, w: 12, h: 68 };
  for (let i = 0; i < 20; i++) {
    const left = rng.chance(0.5);
    const cand = left ? { x: B.x + 36, y: rng.int(B.y + 80, B.y + B.h - 80) } : { x: rng.int(B.x + 60, px - 60), y: B.y + 28 };
    if (spots0.some((p) => Math.hypot(p.x - cand.x, p.y - cand.y) < 110)) continue;
    if (near(cand, tree, 50) || near(cand, fireplace, 40)) continue;
    bootSpot = cand;
    bootWindow = left ? { x: B.x - 14, y: cand.y - 34, w: 12, h: 68 } : { x: cand.x - 34, y: B.y - 14, w: 68, h: 12 };
    break;
  }

  // gyerekszoba: ágy és játékláda a sarkokban
  const bedTop = rng.chance(0.5);
  const bed: Rect = { x: kidroom.x + kidroom.w - 138, y: bedTop ? B.y + 30 : B.y + B.h - 160, w: 118, h: 130 };
  const toybox: Rect = { x: kidroom.x + 20, y: bedTop ? B.y + B.h - 70 : B.y + 20, w: 64, h: 50 };
  const childBed = { x: bed.x + 58, y: bed.y + 60 };
  const dream = { x: bed.x - 52, y: bed.y + 30 };
  const kidWindow: Rect = { x: kidroom.x + kidroom.w / 2 - 34, y: B.y - 14, w: 68, h: 12 };

  const doorway: Rect = { x: px, y: dy, w: 16, h: 100 };
  const doorwayIn = { x: px - 30, y: dy + 50 };
  // a rácsos útkeresés nem tükörszimmetrikus: a tükrözött változatnak is járhatónak kell lennie
  const C2 = ROOM.x * 2 + ROOM.w;
  const mv = (p: Vec): Vec => ({ x: C2 - p.x, y: p.y });
  const reachable = (solids: Rect[]) =>
    [treeSpot, bootSpot, doorwayIn, fireSpot].every(
      (t) =>
        findPath(ROOM, solids, PLAYER_R, doorSpot, t) !== null &&
        findPath(ROOM, solids.map((r) => ({ x: C2 - r.x - r.w, y: r.y, w: r.w, h: r.h })), PLAYER_R, mv(doorSpot), mv(t)) !== null,
    );

  // fotel az idős szereplőnek: a nappali egyik sarkában (és a tévé vele szemben), de úgy, hogy ne zárja el az utat
  const seats: Rect[] = [
    { x: B.x + 38, y: B.y + B.h - 112, w: 74, h: 66 },
    { x: px - 112, y: B.y + B.h - 112, w: 74, h: 66 },
    { x: B.x + 38, y: B.y + 150, w: 74, h: 66 },
    { x: px - 112, y: B.y + 150, w: 74, h: 66 },
    { x: Math.round((B.x + px) / 2) - 37, y: B.y + B.h - 112, w: 74, h: 66 },
  ];
  const spots = [fireSpot, doorSpot, treeSpot, bootSpot];
  // ha egyik sarok sem jó, véletlen helyek a nappaliban
  for (let i = 0; i < 20; i++) seats.push({ x: rng.int(B.x + 40, px - 120), y: rng.int(B.y + 110, B.y + B.h - 100), w: 74, h: 66 });
  const freeSeats = seats.filter((r) => !spots.some((p) => near(p, r, 70)) && !overlaps(r, tree, 20) && !overlaps(r, fireplace, 20));
  const livingCenter = { x: living.x + living.w / 2, y: living.y + living.h / 2 };
  const fixed: Rect[] = [...walls, fireplace, tree, bed, toybox];
  const seatAt = (armchair: Rect) => {
    const grandpa = { x: armchair.x + armchair.w / 2, y: armchair.y + armchair.h / 2 - 10 };
    const elderDir = Math.atan2(livingCenter.y - grandpa.y, livingCenter.x - grandpa.x);
    let tv: Rect | null = null;
    if (elder === 'tv') {
      const tx = grandpa.x + Math.cos(elderDir) * 130;
      const ty = grandpa.y + Math.sin(elderDir) * 130;
      tv = { x: tx - 30, y: ty - 12, w: 60, h: 24 };
    }
    return { armchair, grandpa, elderDir, tv };
  };
  const corners = freeSeats.filter((r) => seats.indexOf(r) < 5);
  const candidates = [...(corners.length ? [rng.pick(corners)] : []), ...freeSeats, ...seats.slice(0, 5)].map(seatAt);
  const seat = (elder && candidates.find((c) => reachable([...fixed, c.armchair, ...(c.tv ? [c.tv] : [])]))) || candidates[0];
  const { armchair, grandpa, elderDir, tv } = seat;

  // bútorok (csak ha nem zárják el az utat)
  const base: Rect[] = [...fixed];
  if (elder) base.push(armchair);
  if (tv) base.push(tv);
  const furniture: Furniture[] = [];
  const kinds: FurnitureKind[] = ['sofa', 'table', 'shelf', 'plant'];
  const count = rng.int(1, 3);
  for (let i = 0, tries = 0; i < count && tries < 30; tries++) {
    const kind = rng.pick(kinds);
    const size = { sofa: [110, 42], table: [56, 56], shelf: [90, 22], plant: [30, 30] }[kind];
    const r: Rect =
      kind === 'shelf'
        ? { x: rng.int(B.x + 20, px - 110), y: B.y + B.h - 26, w: size[0], h: size[1] }
        : { x: rng.int(B.x + 70, px - size[0] - 40), y: rng.int(B.y + 120, B.y + B.h - size[1] - 70), w: size[0], h: size[1] };
    if ([...base, ...furniture.map((f) => f.rect)].some((o) => overlaps(r, o, 30))) continue;
    if ([...spots, doorwayIn].some((p) => near(p, r, 70))) continue;
    if (!reachable([...base, ...furniture.map((f) => f.rect), r])) continue;
    furniture.push({ kind, rect: r });
    i++;
  }
  const solids = [...base, ...furniture.map((f) => f.rect)];

  // nyikorgó padlólapok a nappaliban, a fontos pontoktól távol
  const creaks: Rect[] = [];
  let guard = 0;
  while (creaks.length < 3 && guard++ < 300) {
    const c: Rect = { x: rng.int(B.x + 30, px - 90), y: rng.int(B.y + 120, B.y + B.h - 60), w: 56, h: 26 };
    const cc = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    if ([...spots, grandpa].some((p) => Math.hypot(p.x - cc.x, p.y - cc.y) < 80)) continue;
    if (solids.some((o) => overlaps(c, o, 4))) continue;
    if (creaks.some((o) => overlaps(c, o, 30))) continue;
    creaks.push(c);
  }

  // a gyerek útja: az ágy mellől a válaszfal ajtaján át a nappali közepére
  const lookAt = findPath(ROOM, solids, 18, livingCenter, livingCenter) ? livingCenter : treeSpot;
  const fromBed = { x: bed.x - 26, y: bed.y + bed.h / 2 };
  const childPath = findPath(ROOM, solids.filter((r) => r !== bed), 16, fromBed, lookAt) ?? [doorwayIn, lookAt];

  const L: InteriorLayout = {
    bounds: { ...B },
    solids,
    blockers: [...walls, tree, ...furniture.filter((f) => f.kind === 'shelf').map((f) => f.rect)],
    doorSpot,
    fireSpot,
    treeSpot,
    bootSpot,
    bootWindow,
    kidWindow,
    childBed,
    dream,
    grandpa,
    elderDir,
    armchair,
    tv,
    fireplace,
    tree,
    bed,
    toybox,
    furniture,
    walls,
    doorway,
    living,
    kidroom,
    creaks,
    childPath: [fromBed, ...childPath],
    mirrored: false,
    palette: rng.int(0, 3),
  };
  return rng.chance(0.5) ? mirrorInterior(L) : L;
}

/** Vízszintes tükrözés a szoba közepére (a gyerekszoba balra kerül). */
function mirrorInterior(L: InteriorLayout): InteriorLayout {
  const C2 = ROOM.x * 2 + ROOM.w;
  const mv = (p: Vec): Vec => ({ x: C2 - p.x, y: p.y });
  const mr = (r: Rect): Rect => ({ x: C2 - r.x - r.w, y: r.y, w: r.w, h: r.h });
  const map = new Map<Rect, Rect>();
  const R = (r: Rect): Rect => {
    if (!map.has(r)) map.set(r, mr(r));
    return map.get(r)!;
  };
  let dir = Math.PI - L.elderDir;
  if (dir > Math.PI) dir -= Math.PI * 2;
  return {
    ...L,
    bounds: { ...L.bounds },
    solids: L.solids.map(R),
    blockers: L.blockers.map(R),
    doorSpot: mv(L.doorSpot),
    fireSpot: mv(L.fireSpot),
    treeSpot: mv(L.treeSpot),
    bootSpot: mv(L.bootSpot),
    bootWindow: mr(L.bootWindow),
    kidWindow: mr(L.kidWindow),
    childBed: mv(L.childBed),
    dream: mv(L.dream),
    grandpa: mv(L.grandpa),
    elderDir: dir,
    armchair: R(L.armchair),
    tv: L.tv ? R(L.tv) : null,
    fireplace: R(L.fireplace),
    tree: R(L.tree),
    bed: R(L.bed),
    toybox: R(L.toybox),
    furniture: L.furniture.map((f) => ({ kind: f.kind, rect: R(f.rect) })),
    walls: L.walls.map(R),
    doorway: mr(L.doorway),
    living: mr(L.living),
    kidroom: mr(L.kidroom),
    creaks: L.creaks.map(mr),
    childPath: L.childPath.map(mv),
    mirrored: true,
  };
}

/** A Mikulás-gyár: futószalag felül, középen lent a szán, amire pakolni kell. */
export interface FactoryLayout {
  bounds: Rect;
  solids: Rect[];
  belt: Rect;
  beltY: number;
  beltStart: number;
  beltEnd: number;
  machine: Rect;
  chute: Rect;
  sled: Rect;
  /** a szán helyei (ugyanazok, mint az utcán) */
  slots: Vec[];
  /** eszközláda és a helyei */
  toolbox: Rect;
  boxSlots: Vec[];
  benches: Rect[];
  spawn: Vec;
}

/**
 * A szán helyei: n hely két sorban, középre igazítva; a sorrend középről kifelé
 * (a programozott pakolás így tölti fel).
 */
export function sledSlots(n: number, cx: number, y: number): { w: number; slots: Vec[]; order: number[] } {
  const cols = Math.max(3, Math.ceil(n / 2));
  const w = cols * 50;
  const slots: Vec[] = [];
  for (let i = 0; i < n; i++) slots.push({ x: cx - w / 2 + 25 + Math.floor(i / 2) * 50, y: i % 2 ? y + 52 : y + 16 });
  const mid = (Math.ceil(n / 2) - 1) / 2;
  const order = slots.map((_, i) => i).sort((a, b) => Math.abs(Math.floor(a / 2) - mid) - Math.abs(Math.floor(b / 2) - mid) || a - b);
  return { w, slots, order };
}

export function buildFactory(houseCount = 12, toolboxSize = 0): FactoryLayout {
  const belt: Rect = { x: 120, y: 118, w: 720, h: 56 };
  const machine: Rect = { x: 60, y: 86, w: 80, h: 120 };
  const chute: Rect = { x: 820, y: 96, w: 80, h: 100 };
  const { w: sw, slots } = sledSlots(houseCount, 480, 364);
  const sled: Rect = { x: 480 - sw / 2, y: 364, w: sw, h: 68 };
  // eszközláda a szántól jobbra, egy sorban
  const toolbox: Rect = { x: sled.x + sled.w + 40, y: 330, w: Math.max(1, toolboxSize) * 44 + 12, h: 44 };
  const boxSlots: Vec[] = [];
  for (let i = 0; i < toolboxSize; i++) boxSlots.push({ x: toolbox.x + 28 + i * 44, y: toolbox.y + 22 });
  const benches: Rect[] = [
    { x: 80, y: 420, w: 120, h: 50 },
    { x: 760, y: 420, w: 120, h: 50 },
  ];
  return {
    bounds: { x: 60, y: 70, w: 840, h: 440 },
    solids: [belt, machine, chute, sled, ...(toolboxSize ? [toolbox] : []), ...benches],
    belt,
    beltY: belt.y + belt.h / 2,
    beltStart: belt.x + 20,
    beltEnd: belt.x + belt.w - 20,
    machine,
    chute,
    sled,
    slots,
    toolbox,
    boxSlots,
    benches,
    spawn: { x: 480, y: 270 },
  };
}

/** Az út a gyártól a faluig: a szánt kell elvezetni, akadályokat kerülgetve. */
export interface RoadLayout {
  w: number;
  h: number;
  /** a járható sáv (az út) */
  band: Rect;
  start: Vec;
  finishX: number;
  obstacles: Obstacle[];
  solids: Rect[];
  stars: Vec[];
}

export function buildRoad(rng: Rng, density: number): RoadLayout {
  const w = 3900;
  const band: Rect = { x: 0, y: 130, w, h: 300 };
  const obstacles: Obstacle[] = [];
  const stars: Vec[] = [];
  const add = (kind: ObstacleKind, cx: number, cy: number, ow: number, oh: number) =>
    obstacles.push({
      kind,
      rect: { x: cx - ow / 2, y: cy - oh / 2, w: ow, h: oh },
      solid: kind !== 'ice',
      noisy: false,
      slippery: kind === 'ice',
      poly: kind === 'ice' ? blob(rng, cx, cy, ow / 2, oh / 2) : undefined,
    });
  // oszloponként 1–2 akadály, de mindig marad legalább 120 px széles szabad rés
  const step = 290 - density * 25;
  for (let x = 520; x < w - 360; x += step + rng.int(-30, 40)) {
    const n = rng.chance(0.25 + density * 0.15) ? 2 : 1;
    const gapCenter = rng.int(band.y + 70, band.y + band.h - 70);
    const kinds: ObstacleKind[] = ['pine', 'snowman', 'snowpile'];
    for (let i = 0; i < n; i++) {
      const kind = rng.pick(kinds);
      const size = kind === 'snowpile' ? [76, 40] : [44, 44];
      // a réstől felfelé vagy lefelé, a sávon belül
      const up = i === 0 ? rng.chance(0.5) : !(obstacles[obstacles.length - 1].rect.y < gapCenter);
      const cy = up ? rng.int(band.y + 25, Math.max(band.y + 26, gapCenter - 85)) : rng.int(Math.min(band.y + band.h - 26, gapCenter + 85), band.y + band.h - 25);
      add(kind, x + rng.int(-20, 20), cy, size[0], size[1]);
    }
    // a résben gyakran csillag
    if (rng.chance(0.7)) stars.push({ x: x + rng.int(-10, 10), y: gapCenter });
    if (rng.chance(0.35 + density * 0.1)) add('ice', x + step / 2, rng.int(band.y + 50, band.y + band.h - 50), 130, 70);
  }
  return {
    w,
    h: VIEW_H,
    band,
    start: { x: 260, y: band.y + band.h / 2 },
    finishX: w - 220,
    obstacles,
    solids: obstacles.filter((o) => o.solid).map((o) => o.rect),
    stars,
  };
}
