import { Rng } from '../src/core/rng';
import { emptyInput, type InputFrame } from '../src/core/input';
import type { Vec } from '../src/core/geom';
import { STREET, type GiftId } from '../src/games/mikulas/types';
import type { MikulasGame, HouseState, TargetKind } from '../src/games/mikulas/game';

/**
 * Egyszerű, véletlenszerű "robot-játékos" a fejnélküli szimulációhoz.
 * Nem optimális: néha rosszul pakol, néha nem csendben megy, nem figyeli a nagypapát.
 */
export class Robot {
  private rng: Rng;
  private packed = false;
  private house: HouseState | null = null;
  private via: 'door' | 'chimney' = 'chimney';
  private quiet = false;
  private path: Vec[] = [];
  private lastPos = { x: 0, y: 0 };
  private stuck = 0;
  private jitter = 0;
  private jx = 0;
  private jy = 0;

  constructor(seed: number, private readonly skill = 0.7) {
    this.rng = new Rng(seed).fork(99);
  }

  update(g: MikulasGame, dt: number): InputFrame {
    const f = emptyInput();
    if (g.phase === 'pack') {
      this.doPack(g);
      return f;
    }
    if (g.phase === 'result') return f;
    const p = g.player;
    f.quiet = this.quiet;
    if (p.busy > 0) return f;

    // elakadás esetén véletlen irányba lépünk egy kicsit
    if (Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y) < 0.5 * dt * 60) this.stuck += dt;
    else this.stuck = 0;
    this.lastPos = { x: p.x, y: p.y };
    if (this.stuck > 1) {
      this.stuck = 0;
      this.jitter = 0.4;
      const a = this.rng.range(0, Math.PI * 2);
      this.jx = Math.cos(a);
      this.jy = Math.sin(a);
    }
    if (this.jitter > 0) {
      this.jitter -= dt;
      f.mx = this.jx;
      f.my = this.jy;
      return f;
    }

    if (p.zone === STREET) this.street(g, f);
    else this.inside(g, f);
    return f;
  }

  private doPack(g: MikulasGame): void {
    if (this.packed) return;
    this.packed = true;
    for (const h of g.level.houses) {
      const wrong = this.rng.chance((1 - this.skill) * 0.2);
      const it = wrong ? g.pack.sack[0] : g.pack.sack.find((s) => s.gift === h.wish);
      if (it) g.packAdd(it.id);
    }
    g.packDone();
  }

  private act(g: MikulasGame, f: InputFrame, kind: TargetKind, at: Vec, house?: HouseState): void {
    const t = g.target;
    if (t && t.kind === kind && (house === undefined || t.house === house.idx)) f.interact = true;
    else this.walkStreet(g, f, at);
  }

  private street(g: MikulasGame, f: InputFrame): void {
    const p = g.player;
    const sled = g.street.sledCenter;
    const sledSpot = { x: sled.x, y: g.street.laneBottom };
    const deliverable = g.houses.filter((h) => h.status === 'pending' && (g.sledStock[h.def.wish] > 0 || p.hand.item === h.def.wish));

    if (g.phase === 'dawn' || deliverable.length === 0) {
      if (p.hand.item) return this.act(g, f, 'sledReturn', sledSpot);
      return this.act(g, f, 'goHome', sledSpot);
    }
    const hand = p.hand.item;
    if (!hand || hand === 'candy' || !deliverable.some((h) => h.def.wish === hand)) {
      // a szánhoz: ajándék (és ha kell, eszköz) felvétele
      const nearSled = Math.hypot(p.x - sled.x, p.y - sled.y) < g.tuning.sledRadius - 5;
      if (!nearSled) return this.walkStreet(g, f, sledSpot);
      const target = deliverable.reduce((a, b) =>
        Math.abs(a.street.cx - p.x) <= Math.abs(b.street.cx - p.x) ? a : b,
      );
      this.house = target;
      if (target.dog?.mode === 'alert' && g.toolStock.bone > 0 && p.pocket.item !== 'bone') f.pick = 'bone';
      else if (target.cat?.mode === 'chimney' && g.toolStock.fish > 0 && p.pocket.item !== 'fish' && p.pocket.item !== 'bone')
        f.pick = 'fish';
      else f.pick = target.def.wish as GiftId;
      return;
    }
    const h = this.house && this.house.status === 'pending' && this.house.def.wish === hand ? this.house : deliverable.find((d) => d.def.wish === hand)!;
    this.house = h;
    const st = h.street;
    if (h.dog?.mode === 'alert' && p.pocket.item === 'bone') return this.act(g, f, 'feedDog', h.dog, h);
    if (h.cat?.mode === 'chimney') {
      if (p.pocket.item === 'fish') return this.act(g, f, 'feedCat', st.ladder, h);
      this.via = 'door';
    } else this.via = this.rng.chance(this.skill) ? 'chimney' : 'door';
    this.quiet = this.rng.chance(this.skill);
    const spot = this.via === 'door' ? st.door : st.ladder;
    this.path = [];
    this.act(g, f, this.via, spot, h);
  }

  private inside(g: MikulasGame, f: InputFrame): void {
    const p = g.player;
    const h = g.houses[p.zone];
    const it = h.interior;
    const toTree = p.hand.item && p.hand.item !== 'candy' && h.status === 'pending' && !h.gift;
    if (!this.path.length) {
      const entry = this.via === 'door' ? [{ x: 330, y: 330 }] : [{ x: 300, y: 200 }];
      this.path = toTree
        ? [...entry, it.treeSpot]
        : this.via === 'door'
          ? [{ x: 330, y: 330 }, it.doorSpot]
          : [{ x: 300, y: 200 }, it.fireSpot];
    }
    const t = g.target;
    const want: TargetKind = toTree ? 'tree' : this.via === 'door' ? 'exitDoor' : 'exitChimney';
    if (t?.kind === want && this.path.length <= 1) {
      f.interact = true;
      this.path = [];
      return;
    }
    const wp = this.path[0];
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < 12 && this.path.length > 1) this.path.shift();
    this.steer(p, this.path[0], f);
  }

  private walkStreet(g: MikulasGame, f: InputFrame, to: Vec): void {
    const p = g.player;
    const lane = to.y < 270 ? g.street.laneTop : g.street.laneBottom;
    if (Math.abs(p.x - to.x) > 16) {
      if (Math.abs(p.y - lane) > 6) this.steer(p, { x: p.x, y: lane }, f);
      else this.steer(p, { x: to.x, y: lane }, f);
    } else this.steer(p, to, f);
  }

  private steer(p: Vec, to: Vec, f: InputFrame): void {
    const dx = to.x - p.x;
    const dy = to.y - p.y;
    const l = Math.hypot(dx, dy);
    if (l < 2) return;
    const s = Math.min(1, l / 20);
    f.mx = (dx / l) * s;
    f.my = (dy / l) * s;
  }
}
