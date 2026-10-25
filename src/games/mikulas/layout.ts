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
    // az ajtó és a létra (kémény) a ház két különböző végén, házanként más oldalon
    const side = rng ? (rng.chance(0.5) ? 1 : -1) : i % 4 < 2 ? 1 : -1;
    const doorX = cx - side * (rng ? rng.int(8, 46) : 20);
    houses.push({
      idx: i,
      cx,
      top,
      body,
      door: { x: doorX, y: front },
      ladder: { x: cx + side * 78, y: front },
      dog: { x: cx - side * 78, y: top ? 186 : 354 },
      chimney: { x: cx + side * 55, y: top ? 70 : 470 },
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

export type FurnitureKind = 'sofa' | 'table' | 'shelf' | 'plant' | 'closet';
export type ElderKind = 'grandpa' | 'tv' | 'grandma';

export interface Furniture {
  kind: FurnitureKind;
  rect: Rect;
}

export type SleeperKind = 'child' | 'parents' | 'sibling';
export type RoomKind = 'living' | 'hall' | 'kid' | 'parents' | 'sibling' | 'storage';

export interface Room {
  rect: Rect;
  kind: RoomKind;
}

/** Egy alvó a házban (a gyerek mindig az első): az ágya, a helye, a szobája, és az útja a nappaliba. */
export interface SleeperSpot {
  kind: SleeperKind;
  bed: Rect;
  spot: Vec;
  room: Rect;
  /** felébredve: az ágy mellől a nappaliba */
  path: Vec[];
}

/** Mekkora a ház, és ki alszik még benne. */
export interface InteriorOpts {
  /** szobák száma: 2 (nappali + gyerekszoba), 3 (+ hálószoba), 4 (+ előszoba) */
  rooms?: 2 | 3 | 4;
  /** a gyereken kívül: szülők, testvér (a 3–4 szobás házakban külön szobában) */
  extra?: ('parents' | 'sibling')[];
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
  /** egy ablak (rajzoláshoz) és hogy melyik falon van */
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
  /** minden szoba (rajzoláshoz, zajhoz) */
  rooms: Room[];
  /** az alvók; az első a gyerek */
  sleepers: SleeperSpot[];
  creaks: Rect[];
  /** szekrények, ahová be lehet bújni (a `front` előtt állva) */
  closets: { rect: Rect; front: Vec }[];
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
 * Véletlen (seedelt) házbelső. Bal oldalon a nappali (4 szobánál alatta az előszoba a bejárattal),
 * jobb oldalon a gyerekszoba (3–4 szobánál mellette a szülők vagy a testvér szobája). A kandalló,
 * a fa, az ajtó, a fotel és a bútorok helye házanként más; a fa sosem a bejárat mellett áll. Minden
 * fontos pont elérhető marad (a tükrözött változatban is).
 */
export function buildInterior(rng: Rng, elder: ElderKind | null, opts: InteriorOpts = {}): InteriorLayout {
  const B = ROOM;
  const nRooms = opts.rooms ?? 2;
  const extra = opts.extra ?? [];
  const px = rng.int(nRooms >= 3 ? 470 : 500, nRooms >= 3 ? 540 : 590);
  const right: Rect = { x: px + 16, y: B.y, w: B.x + B.w - (px + 16), h: B.h };
  const walls: Rect[] = [];
  const doorways: Rect[] = [];
  /** függőleges fal x-en, a megadott (y, magasság) nyílásokkal */
  const vWall = (x: number, y0: number, y1: number, gaps: [number, number][]) => {
    let y = y0;
    for (const [gy, gh] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (gy > y) walls.push({ x, y, w: 16, h: gy - y });
      doorways.push({ x, y: gy, w: 16, h: gh });
      y = gy + gh;
    }
    if (y1 > y) walls.push({ x, y, w: 16, h: y1 - y });
  };
  const hWall = (y: number, x0: number, x1: number, gap: [number, number] | null) => {
    if (!gap) {
      walls.push({ x: x0, y, w: x1 - x0, h: 16 });
      return;
    }
    if (gap[0] > x0) walls.push({ x: x0, y, w: gap[0] - x0, h: 16 });
    doorways.push({ x: gap[0], y, w: gap[1], h: 16 });
    if (x0 + (x1 - x0) > gap[0] + gap[1]) walls.push({ x: gap[0] + gap[1], y, w: x1 - gap[0] - gap[1], h: 16 });
  };

  // jobb oldal: gyerekszoba (+ második hálószoba)
  const rooms: Room[] = [];
  let kidroom: Rect;
  let other: Rect | null = null;
  if (nRooms >= 3) {
    const hy = rng.int(B.y + 200, B.y + 240);
    const top: Rect = { x: right.x, y: B.y, w: right.w, h: hy - B.y };
    const bot: Rect = { x: right.x, y: hy + 16, w: right.w, h: B.y + B.h - hy - 16 };
    hWall(hy, right.x, B.x + B.w, null);
    const kidTop = rng.chance(0.5);
    kidroom = kidTop ? top : bot;
    other = kidTop ? bot : top;
    vWall(px, B.y, B.y + B.h, [
      [rng.int(top.y + 20, top.y + top.h - 120), 100],
      [rng.int(bot.y + 20, bot.y + bot.h - 120), 100],
    ]);
  } else {
    kidroom = right;
    vWall(px, B.y, B.y + B.h, [[rng.int(140, 340), 100]]);
  }
  rooms.push({ rect: kidroom, kind: 'kid' });
  const otherKind: RoomKind = extra.includes('parents') ? 'parents' : extra.includes('sibling') ? 'sibling' : 'storage';
  if (other) rooms.push({ rect: other, kind: otherKind });

  // bal oldal: nappali (+ előszoba alul a bejárattal)
  let living: Rect = { x: B.x, y: B.y, w: px - B.x, h: B.h };
  let hall: Rect | null = null;
  if (nRooms >= 4) {
    const ly = rng.int(B.y + 240, B.y + 270);
    living = { x: B.x, y: B.y, w: px - B.x, h: ly - B.y };
    hall = { x: B.x, y: ly + 16, w: px - B.x, h: B.y + B.h - ly - 16 };
    hWall(ly, B.x, px, [rng.int(B.x + 60, px - 170), 110]);
    rooms.push({ rect: hall, kind: 'hall' });
  }
  rooms.unshift({ rect: living, kind: 'living' });
  const doorway = doorways[0];

  // kandalló a nappali felső falán, a bejárat a ház alsó falán (4 szobánál az előszobában)
  const fx = rng.int(B.x + 30, px - 150);
  const fireplace: Rect = { x: fx, y: B.y, w: 120, h: 42 };
  const fireSpot = { x: fx + 60, y: B.y + 70 };
  const doorSpot = { x: rng.int(B.x + 60, px - 60), y: B.y + B.h - 24 };

  // fenyő a nappaliban: a felső fal mellett, a bal fal mellett vagy lent – távol a bejárattól
  const L = living;
  const treeOpts: { tree: Rect; spot: Vec }[] = [];
  for (let i = 0; i < 16; i++) {
    const kind = rng.int(0, 2);
    if (kind === 0) {
      const tx = rng.int(L.x + 50, px - 50);
      treeOpts.push({ tree: { x: tx - 26, y: L.y + 22, w: 52, h: 64 }, spot: { x: tx, y: L.y + 120 } });
    } else if (kind === 1 && L.h > 220) {
      const ty = rng.int(L.y + 140, L.y + L.h - 100);
      treeOpts.push({ tree: { x: L.x + 4, y: ty - 32, w: 52, h: 64 }, spot: { x: L.x + 100, y: ty } });
    } else if (!hall) {
      const tx = rng.int(L.x + 50, px - 50);
      treeOpts.push({ tree: { x: tx - 26, y: L.y + L.h - 80, w: 52, h: 64 }, spot: { x: tx, y: L.y + L.h - 120 } });
    }
  }
  const okTree = (o: { tree: Rect; spot: Vec }) =>
    !overlaps(o.tree, fireplace, 40) &&
    Math.hypot(o.spot.x - fireSpot.x, o.spot.y - fireSpot.y) > 110 &&
    Math.hypot(o.spot.x - doorSpot.x, o.spot.y - doorSpot.y) > 220 &&
    !doorways.some((d) => overlaps(o.tree, d, 70)) &&
    o.tree.x + o.tree.w < px - 30;
  const treeOpt = treeOpts.find(okTree) ?? { tree: { x: px - 110, y: L.y + 22, w: 52, h: 64 }, spot: { x: px - 84, y: L.y + 120 } };
  const tree = treeOpt.tree;
  const treeSpot = treeOpt.spot;

  // egy ablak a nappaliban (bal fal vagy felső fal)
  const spots0 = [fireSpot, doorSpot, treeSpot];
  let bootSpot: Vec = { x: L.x + 36, y: L.y + L.h / 2 };
  let bootWindow: Rect = { x: B.x - 14, y: bootSpot.y - 34, w: 12, h: 68 };
  for (let i = 0; i < 20; i++) {
    const left = rng.chance(0.5);
    const cand = left ? { x: L.x + 36, y: rng.int(L.y + 80, L.y + L.h - 80) } : { x: rng.int(L.x + 60, px - 60), y: L.y + 28 };
    if (spots0.some((p) => Math.hypot(p.x - cand.x, p.y - cand.y) < 110)) continue;
    if (near(cand, tree, 50) || near(cand, fireplace, 40)) continue;
    bootSpot = cand;
    bootWindow = left ? { x: B.x - 14, y: cand.y - 34, w: 12, h: 68 } : { x: cand.x - 34, y: B.y - 14, w: 68, h: 12 };
    break;
  }

  // hálószobák: ágy és (a gyereknél) játékláda a sarkokban
  const bedIn = (R: Rect, w: number, h: number): { bed: Rect; top: boolean } => {
    const top = R.h < 300 ? R.y === B.y : rng.chance(0.5);
    const y = top ? R.y + 24 : R.y + R.h - h - 24;
    return { bed: { x: R.x + R.w - w - 20, y, w, h }, top };
  };
  const kb = bedIn(kidroom, 118, Math.min(130, kidroom.h - 60));
  const bed = kb.bed;
  // játékláda: a nagy gyerekszobában a túlsó sarokban, a kicsiben az ágy mellett, a fal felé (ne zárja el az ajtót)
  const toybox: Rect =
    kidroom.h >= 300
      ? { x: kidroom.x + 20, y: kb.top ? kidroom.y + kidroom.h - 70 : kidroom.y + 20, w: 64, h: 50 }
      : { x: bed.x - 84, y: kb.top ? kidroom.y + 14 : kidroom.y + kidroom.h - 64, w: 64, h: 50 };
  const childBed = { x: bed.x + 58, y: bed.y + bed.h / 2 - 5 };
  const dream = { x: bed.x - 52, y: bed.y + 30 };
  const kidWindow: Rect =
    kidroom.y === B.y ? { x: kidroom.x + kidroom.w / 2 - 34, y: B.y - 14, w: 68, h: 12 } : { x: B.x + B.w + 2, y: kidroom.y + kidroom.h / 2 - 34, w: 12, h: 68 };
  const beds: { kind: SleeperKind; bed: Rect; room: Rect }[] = [{ kind: 'child', bed, room: kidroom }];
  if (other && otherKind !== 'storage') {
    const w = otherKind === 'parents' ? 150 : 118;
    beds.push({ kind: otherKind, bed: bedIn(other, w, Math.min(120, other.h - 60)).bed, room: other });
  } else if (extra.includes('sibling')) {
    // 2 szobánál a testvér is a gyerekszobában alszik: a másik ágy ugyanannál a falnál, a szoba másik végén
    const sh = Math.min(130, kidroom.h / 2 - 50);
    const sb: Rect = { x: bed.x + bed.w - 110, y: kb.top ? kidroom.y + kidroom.h - sh - 24 : kidroom.y + 24, w: 110, h: sh };
    beds.push({ kind: 'sibling', bed: sb, room: kidroom });
  }
  const storage: Rect[] = [];
  if (other && otherKind === 'storage') storage.push({ x: other.x + other.w - 120, y: other.y + 30, w: 90, h: 50 });

  const doorwayIn = { x: px - 30, y: doorway.y + 50 };
  /** az ágy melletti hely (a szoba közepe felőli oldalon) */
  const bedSide = (b: Rect, R: Rect): Vec => ({ x: b.x + b.w / 2 < R.x + R.w / 2 ? b.x + b.w + 26 : b.x - 26, y: b.y + b.h / 2 });
  // a rácsos útkeresés nem tükörszimmetrikus: a tükrözött változatnak is járhatónak kell lennie
  const C2 = ROOM.x * 2 + ROOM.w;
  const mv = (p: Vec): Vec => ({ x: C2 - p.x, y: p.y });
  const goals = [treeSpot, doorwayIn, fireSpot, ...beds.map((b) => bedSide(b.bed, b.room))];
  const reachable = (solids: Rect[]) =>
    goals.every(
      (t) =>
        findPath(ROOM, solids, PLAYER_R, doorSpot, t) !== null &&
        findPath(ROOM, solids.map((r) => ({ x: C2 - r.x - r.w, y: r.y, w: r.w, h: r.h })), PLAYER_R, mv(doorSpot), mv(t)) !== null,
    );

  // fotel az idős szereplőnek: a nappali egyik sarkában (és a tévé vele szemben), de úgy, hogy ne zárja el az utat
  const seats: Rect[] = [
    { x: L.x + 38, y: L.y + L.h - 112, w: 74, h: 66 },
    { x: px - 112, y: L.y + L.h - 112, w: 74, h: 66 },
    { x: L.x + 38, y: L.y + 120, w: 74, h: 66 },
    { x: px - 112, y: L.y + 120, w: 74, h: 66 },
    { x: Math.round((L.x + px) / 2) - 37, y: L.y + L.h - 112, w: 74, h: 66 },
  ];
  const spots = [fireSpot, doorSpot, treeSpot, bootSpot];
  // ha egyik sarok sem jó, véletlen helyek a nappaliban
  for (let i = 0; i < 20; i++) seats.push({ x: rng.int(L.x + 40, px - 120), y: rng.int(L.y + 100, Math.max(L.y + 101, L.y + L.h - 90)), w: 74, h: 66 });
  const freeSeats = seats.filter((r) => !spots.some((p) => near(p, r, 70)) && !overlaps(r, tree, 20) && !overlaps(r, fireplace, 20));
  const livingCenter = { x: L.x + L.w / 2, y: L.y + L.h / 2 };
  const fixed: Rect[] = [...walls, fireplace, tree, toybox, ...beds.map((b) => b.bed), ...storage];
  const seatAt = (armchair: Rect, dist = 120) => {
    const grandpa = { x: armchair.x + armchair.w / 2, y: armchair.y + armchair.h / 2 - 10 };
    const elderDir = Math.atan2(livingCenter.y - grandpa.y, livingCenter.x - grandpa.x);
    let tv: Rect | null = null;
    if (elder === 'tv') {
      const tx = grandpa.x + Math.cos(elderDir) * dist;
      const ty = grandpa.y + Math.sin(elderDir) * dist;
      tv = { x: tx - 30, y: ty - 12, w: 60, h: 24 };
    }
    return { armchair, grandpa, elderDir, tv };
  };
  const corners = freeSeats.filter((r) => seats.indexOf(r) < 5);
  const chairs = [...(corners.length ? [rng.pick(corners)] : []), ...freeSeats, ...seats.slice(0, 5)];
  // a tévé közelebb vagy messzebb is állhat, ha különben útban lenne
  const candidates = [...chairs.map((r) => seatAt(r)), ...(elder === 'tv' ? [90, 150].flatMap((dd) => chairs.map((r) => seatAt(r, dd))) : [])];
  const seat = (elder && candidates.find((c) => reachable([...fixed, c.armchair, ...(c.tv ? [c.tv] : [])]))) || candidates[0];
  const { armchair, grandpa, elderDir, tv } = seat;

  // bútorok a nappaliban és az előszobában (csak ha nem zárják el az utat)
  const base: Rect[] = [...fixed];
  if (elder) base.push(armchair);
  if (tv) base.push(tv);
  const furniture: Furniture[] = [];
  const kinds = ['sofa', 'table', 'shelf', 'plant'] as const;
  const count = rng.int(1, 3) + (hall ? 1 : 0);
  const areas = hall ? [L, L, hall] : [L];
  for (let i = 0, tries = 0; i < count && tries < 40; tries++) {
    const A = rng.pick(areas);
    const kind = rng.pick(kinds);
    const size = { sofa: [110, 42], table: [56, 56], shelf: [90, 22], plant: [30, 30] }[kind];
    if (A.h < size[1] + 100) continue;
    const r: Rect =
      kind === 'shelf'
        ? { x: rng.int(A.x + 20, px - 110), y: A.y + A.h - 26, w: size[0], h: size[1] }
        : { x: rng.int(A.x + 70, px - size[0] - 40), y: rng.int(A.y + 60, A.y + A.h - size[1] - 50), w: size[0], h: size[1] };
    if ([...base, ...furniture.map((f) => f.rect)].some((o) => overlaps(r, o, 30))) continue;
    if ([...spots, doorwayIn].some((p) => near(p, r, 70))) continue;
    if (doorways.some((d) => overlaps(r, d, 50))) continue;
    if (!reachable([...base, ...furniture.map((f) => f.rect), r])) continue;
    furniture.push({ kind, rect: r });
    i++;
  }
  // szekrény(ek), ahová be lehet bújni: egy szoba felső vagy alsó falánál, a bejárattól és a fontos pontoktól távol
  const closets: { rect: Rect; front: Vec }[] = [];
  const closetRooms = rooms.filter((r) => r.kind !== 'kid').map((r) => r.rect);
  for (let tries = 0; closets.length < (rooms.length >= 4 ? 2 : 1) && tries < 250; tries++) {
    // ha a többi szobában nem fér el, a gyerekszobába is kerülhet
    const A = rng.pick(tries < 100 ? closetRooms : rooms.map((r) => r.rect));
    if (A.w < 200) continue;
    const top = rng.chance(0.5);
    const r: Rect = { x: rng.int(A.x + 24, A.x + A.w - 94), y: top ? A.y + 6 : A.y + A.h - 40, w: 70, h: 34 };
    const front = { x: r.x + r.w / 2, y: top ? r.y + r.h + 26 : r.y - 26 };
    const all = [...base, ...furniture.map((f) => f.rect), ...closets.map((c) => c.rect)];
    if (all.some((o) => overlaps(r, o, 24))) continue;
    if ([...spots, doorwayIn].some((p) => near(p, r, 70)) || beds.some((b) => near(bedSide(b.bed, b.room), r, 46))) continue;
    if (doorways.some((d) => overlaps(r, d, 50))) continue;
    if (findPath(ROOM, [...all, r], PLAYER_R, doorSpot, front) === null) continue;
    if (!reachable([...all, r])) continue;
    closets.push({ rect: r, front });
    furniture.push({ kind: 'closet', rect: r });
  }
  const solids = [...base, ...furniture.map((f) => f.rect)];

  // nyikorgó padlólapok a nappaliban (és az előszobában), a fontos pontoktól távol
  const creaks: Rect[] = [];
  let guard = 0;
  while (creaks.length < (hall ? 4 : 3) && guard++ < 300) {
    const A = rng.pick(areas);
    const c: Rect = { x: rng.int(A.x + 30, px - 90), y: rng.int(A.y + 40, Math.max(A.y + 41, A.y + A.h - 60)), w: 56, h: 26 };
    const cc = { x: c.x + c.w / 2, y: c.y + c.h / 2 };
    if ([...spots, grandpa].some((p) => Math.hypot(p.x - cc.x, p.y - cc.y) < 80)) continue;
    if (solids.some((o) => overlaps(c, o, 4))) continue;
    if (creaks.some((o) => overlaps(c, o, 30))) continue;
    creaks.push(c);
  }

  // az alvók útja felébredve: az ágy mellől a nappali közepére
  const lookAt = findPath(ROOM, solids, 18, livingCenter, livingCenter) ? livingCenter : treeSpot;
  const sleepers: SleeperSpot[] = beds.map((b) => {
    const from = bedSide(b.bed, b.room);
    const path = findPath(ROOM, solids.filter((r) => r !== b.bed), 16, from, lookAt) ?? [doorwayIn, lookAt];
    return { kind: b.kind, bed: b.bed, room: b.room, spot: { x: b.bed.x + b.bed.w / 2, y: b.bed.y + b.bed.h / 2 - 5 }, path: [from, ...path] };
  });
  sleepers[0].spot = childBed;

  const out: InteriorLayout = {
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
    furniture: [...furniture, ...storage.map((r) => ({ kind: 'shelf' as const, rect: r }))],
    walls,
    doorway,
    living,
    kidroom,
    rooms,
    sleepers,
    creaks,
    closets,
    childPath: sleepers[0].path,
    mirrored: false,
    palette: rng.int(0, 3),
  };
  return rng.chance(0.5) ? mirrorInterior(out) : out;
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
    rooms: L.rooms.map((r) => ({ kind: r.kind, rect: mr(r.rect) })),
    sleepers: L.sleepers.map((z) => ({ kind: z.kind, bed: R(z.bed), room: mr(z.room), spot: mv(z.spot), path: z.path.map(mv) })),
    creaks: L.creaks.map(mr),
    closets: L.closets.map((c) => ({ rect: R(c.rect), front: mv(c.front) })),
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
  const toolbox: Rect = { x: sled.x + sled.w + 80, y: 330, w: Math.max(1, toolboxSize) * 44 + 12, h: 44 };
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
  /** ugratók: a szán átrepül rajtuk az akadályok fölött */
  ramps: Rect[];
}

export function buildRoad(rng: Rng, density: number): RoadLayout {
  const w = 3900;
  const band: Rect = { x: 0, y: 130, w, h: 300 };
  const obstacles: Obstacle[] = [];
  const stars: Vec[] = [];
  const ramps: Rect[] = [];
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
    // néha ugrató a két oszlop között: átrepít a következő akadálysor fölött, ott a levegőben csillag
    if (x + step < w - 420 && rng.chance(0.3)) {
      const ry = rng.int(band.y + 50, band.y + band.h - 50);
      ramps.push({ x: x + step * 0.5 - 30, y: ry - 34, w: 60, h: 68 });
      stars.push({ x: x + step + 20, y: ry });
    } else if (rng.chance(0.35 + density * 0.1)) add('ice', x + step / 2, rng.int(band.y + 50, band.y + band.h - 50), 130, 70);
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
    ramps,
  };
}
