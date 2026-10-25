import type { Rect, Vec } from '../../core/geom';
import type { Rng } from '../../core/rng';

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

export interface InteriorLayout {
  bounds: Rect;
  solids: Rect[];
  /** látást takaró elemek (falak, fenyő) */
  blockers: Rect[];
  doorSpot: Vec;
  fireSpot: Vec;
  treeSpot: Vec;
  bootSpot: Vec;
  childBed: Vec;
  grandpa: Vec;
  armchair: Rect;
  fireplace: Rect;
  tree: Rect;
  bed: Rect;
  toybox: Rect;
  walls: Rect[];
  doorway: Rect;
  living: Rect;
  kidroom: Rect;
  creaks: Rect[];
  /** a felébredt gyerek útvonala az ágytól a nappali közepéig */
  childPath: Vec[];
}

export function buildInterior(rng: Rng, hasGrandpa: boolean): InteriorLayout {
  const walls: Rect[] = [
    { x: 552, y: 70, w: 16, h: 160 },
    { x: 552, y: 330, w: 16, h: 180 },
  ];
  const fireplace: Rect = { x: 240, y: 70, w: 120, h: 42 };
  const tree: Rect = { x: 432, y: 92, w: 52, h: 64 };
  const armchair: Rect = { x: 98, y: 398, w: 74, h: 66 };
  const bed: Rect = { x: 762, y: 100, w: 118, h: 130 };
  const toybox: Rect = { x: 600, y: 444, w: 64, h: 50 };
  const spots = {
    doorSpot: { x: 330, y: 486 },
    fireSpot: { x: 300, y: 140 },
    treeSpot: { x: 458, y: 190 },
    bootSpot: { x: 96, y: 262 },
  };
  const solids = [...walls, fireplace, tree, bed, toybox];
  if (hasGrandpa) solids.push(armchair);

  // nyikorgó padlólapok a nappaliban, a fontos pontoktól távol
  const creaks: Rect[] = [];
  const avoid = [...Object.values(spots), { x: 135, y: 430 }];
  let guard = 0;
  while (creaks.length < 3 && guard++ < 200) {
    const c: Rect = { x: rng.int(90, 470), y: rng.int(200, 450), w: 56, h: 26 };
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    if (avoid.some((p) => Math.hypot(p.x - cx, p.y - cy) < 80)) continue;
    if (creaks.some((o) => Math.abs(o.x - c.x) < 90 && Math.abs(o.y - c.y) < 60)) continue;
    creaks.push(c);
  }

  return {
    bounds: { x: 60, y: 70, w: 840, h: 440 },
    solids,
    blockers: [...walls, tree],
    ...spots,
    childBed: { x: 820, y: 160 },
    grandpa: { x: 135, y: 422 },
    armchair,
    fireplace,
    tree,
    bed,
    toybox,
    walls,
    doorway: { x: 552, y: 230, w: 16, h: 100 },
    living: { x: 60, y: 70, w: 492, h: 440 },
    kidroom: { x: 568, y: 70, w: 332, h: 440 },
    creaks,
    childPath: [
      { x: 820, y: 262 },
      { x: 640, y: 280 },
      { x: 480, y: 300 },
      { x: 380, y: 318 },
    ],
  };
}
