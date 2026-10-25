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
  sack: Vec;
  dog: Vec;
  catYard: Vec;
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
}

export interface StreetLayout {
  w: number;
  h: number;
  bounds: Rect;
  solids: Rect[];
  sled: Rect;
  sledCenter: Vec;
  reindeer: Rect;
  /** a tér közepe (a szán itt áll) */
  plazaX: number;
  plazaTree: Rect;
  /** az ajándékok helye a szán mellett */
  giftSlots: Vec[];
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
const PLAZA = 440;

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
      sack: { x: cx + 38, y: top ? 206 : 334 },
      dog: { x: cx - 78, y: top ? 186 : 354 },
      catYard: { x: cx + 62, y: top ? 196 : 344 },
      chimney: { x: cx + 55, y: top ? 70 : 470 },
    });
  }

  const P = plazaX;
  const sled: Rect = { x: P - 50, y: 248, w: 110, h: 44 };
  const reindeer: Rect = { x: P - 150, y: 252, w: 92, h: 36 };
  const plazaTree: Rect = { x: P - 26, y: 60, w: 52, h: 44 };
  const giftSlots: Vec[] = [];
  for (let i = 0; i < 12; i++) {
    const row = Math.floor(i / 6);
    giftSlots.push({ x: P - 150 + (i % 6) * 60, y: row === 0 ? 192 : 140 });
  }
  const toolSlots = {
    candy: { x: P - 120, y: 356 },
    bone: { x: P - 40, y: 356 },
    fish: { x: P + 40, y: 356 },
    bell: { x: P + 120, y: 356 },
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
    });
  add('bench', P - 175, 452, 64, 22);
  add('bench', P + 175, 452, 64, 22);
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
    reindeer,
    plazaX: P,
    plazaTree,
    giftSlots,
    toolSlots,
    houses,
    obstacles,
    crossings: [...cols, P + 110].sort((a, b) => a - b),
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

  // fotel az idős szereplőnek: a nappali egyik sarkában
  const seats: Rect[] = [
    { x: B.x + 38, y: B.y + B.h - 112, w: 74, h: 66 },
    { x: px - 112, y: B.y + B.h - 112, w: 74, h: 66 },
    { x: B.x + 38, y: B.y + 150, w: 74, h: 66 },
  ];
  const spots = [fireSpot, doorSpot, treeSpot, bootSpot];
  const freeSeats = seats.filter((r) => !spots.some((p) => near(p, r, 70)) && !overlaps(r, tree, 20));
  const armchair = freeSeats.length ? rng.pick(freeSeats) : seats[0];
  const grandpa = { x: armchair.x + armchair.w / 2, y: armchair.y + armchair.h / 2 - 10 };
  const livingCenter = { x: living.x + living.w / 2, y: living.y + living.h / 2 };
  const elderDir = Math.atan2(livingCenter.y - grandpa.y, livingCenter.x - grandpa.x);
  let tv: Rect | null = null;
  if (elder === 'tv') {
    const tx = grandpa.x + Math.cos(elderDir) * 130;
    const ty = grandpa.y + Math.sin(elderDir) * 130;
    tv = { x: tx - 30, y: ty - 12, w: 60, h: 24 };
  }

  // gyerekszoba: ágy és játékláda a sarkokban
  const bedTop = rng.chance(0.5);
  const bed: Rect = { x: kidroom.x + kidroom.w - 138, y: bedTop ? B.y + 30 : B.y + B.h - 160, w: 118, h: 130 };
  const toybox: Rect = { x: kidroom.x + 20, y: bedTop ? B.y + B.h - 70 : B.y + 20, w: 64, h: 50 };
  const childBed = { x: bed.x + 58, y: bed.y + 60 };
  const dream = { x: bed.x - 52, y: bed.y + 30 };
  const kidWindow: Rect = { x: kidroom.x + kidroom.w / 2 - 34, y: B.y - 14, w: 68, h: 12 };

  // bútorok (csak ha nem zárják el az utat)
  const base: Rect[] = [...walls, fireplace, tree, bed, toybox];
  if (elder) base.push(armchair);
  if (tv) base.push(tv);
  const furniture: Furniture[] = [];
  const doorway: Rect = { x: px, y: dy, w: 16, h: 100 };
  const doorwayIn = { x: px - 30, y: dy + 50 };
  const reachable = (solids: Rect[]) =>
    [treeSpot, bootSpot, doorwayIn, fireSpot].every((t) => findPath(ROOM, solids, PLAYER_R, doorSpot, t) !== null);
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
