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

export interface StreetLayout {
  w: number;
  h: number;
  bounds: Rect;
  solids: Rect[];
  sled: Rect;
  sledCenter: Vec;
  reindeer: Rect;
  houses: StreetHouse[];
  /** a robot és a Krampusz számára: sávok y-koordinátái a szán fölött/alatt */
  laneTop: number;
  laneBottom: number;
}

const SLOT = 250;
const BODY_W = 190;

export function buildStreet(houseCount: number): StreetLayout {
  const perSide = Math.ceil(houseCount / 2);
  const span = perSide * SLOT - (SLOT - BODY_W);
  const w = Math.max(VIEW_W, span + 240);
  const h = VIEW_H;
  const x0 = (w - span) / 2 + BODY_W / 2;
  const houses: StreetHouse[] = [];
  for (let i = 0; i < houseCount; i++) {
    const top = i % 2 === 0;
    const cx = x0 + Math.floor(i / 2) * SLOT;
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
  const sled: Rect = { x: w / 2 - 50, y: 248, w: 110, h: 44 };
  const reindeer: Rect = { x: w / 2 - 150, y: 252, w: 92, h: 36 };
  return {
    w,
    h,
    bounds: { x: 0, y: 24, w, h: h - 30 },
    solids: [...houses.map((hs) => hs.body), sled, reindeer],
    sled,
    sledCenter: { x: sled.x + sled.w / 2, y: sled.y + sled.h / 2 },
    reindeer,
    houses,
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
