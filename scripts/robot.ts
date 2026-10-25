import { Rng } from '../src/core/rng';
import { findPath } from '../src/core/path';
import { emptyInput, type InputFrame } from '../src/core/input';
import type { Vec } from '../src/core/geom';
import { STREET } from '../src/games/mikulas/types';
import type { MikulasGame, HouseState, Target, TargetKind } from '../src/games/mikulas/game';

/**
 * Egyszerű, véletlenszerű "robot-játékos" a fejnélküli szimulációhoz.
 * Nem optimális: néha rosszul pakol, néha nem csendben megy, nem figyeli a nagypapát.
 */
export class Robot {
  private rng: Rng;
  private packed = false;
  /** a pakolás "ideje": a robot programból pakol, de annyi ideig vár, amennyi egy embernek kellene */
  private packWait = 0;
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
      this.doPack(g, dt);
      return f;
    }
    if (g.phase === 'result') return f;
    if (g.phase === 'drive') {
      this.drive(g, f);
      return f;
    }
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

  /** szánvezetés: a legközelebbi szabad sáv felé kormányoz az előttünk lévő akadályok között */
  private drive(g: MikulasGame, f: InputFrame): void {
    const p = g.player;
    const R = g.road;
    const r = g.tuning.drive.radius + 8;
    const ahead = R.solids.filter((s) => s.x + s.w > p.x - r && s.x < p.x + 260);
    let ty = p.y;
    let best = Infinity;
    for (let y = R.band.y + r; y <= R.band.y + R.band.h - r; y += 6) {
      if (ahead.some((s) => y > s.y - r && y < s.y + s.h + r)) continue;
      if (Math.abs(y - p.y) < best) {
        best = Math.abs(y - p.y);
        ty = y;
      }
    }
    f.my = Math.max(-1, Math.min(1, (ty - p.y) / 30));
    f.mx = this.skill > 0.5 ? 0.5 : 0;
  }

  private doPack(g: MikulasGame, dt: number): void {
    if (!this.packed) {
      this.packed = true;
      for (const h of g.level.houses) {
        const wrong = this.rng.chance((1 - this.skill) * 0.2);
        const it = wrong ? g.pack.sack.find((s) => s.gift) : g.pack.sack.find((s) => s.gift === h.wish);
        if (it) g.packAdd(it.id);
      }
      // eszközök: csont a kutyákhoz, hal a macskákhoz, csengő a nagyszülőkhöz, amíg a láda bírja
      const want = [
        ...g.houses.filter((h) => h.dog).map(() => 'bone'),
        ...g.houses.filter((h) => h.cat).map(() => 'fish'),
        ...g.houses.filter((h) => h.grandpa).map(() => 'bell'),
        'candy',
        'flashlight',
      ];
      let n = 0;
      for (const tool of want) {
        const it = g.pack.sack.find((s) => s.tool === tool);
        if (it && (tool === 'flashlight' || g.pack.box.length < g.factory.boxSlots.length)) {
          g.packAdd(it.id);
          n++;
        }
      }
      // ~3 mp darabonként (szalagra várni, odavinni)
      this.packWait = (g.pack.sled.length + n) * 3;
    }
    this.packWait -= dt;
    if (this.packWait <= 0) g.packDone();
  }

  /** eszköz-gomb, ha a kért célpont elérhető; különben odamegy */
  private actTool(g: MikulasGame, f: InputFrame, kind: TargetKind, at: Vec): void {
    const t = g.toolTarget;
    if (t && t.kind === kind) f.tool = true;
    else this.walkStreet(g, f, at);
  }

  private act(g: MikulasGame, f: InputFrame, kind: TargetKind, at: Vec, ok: (t: Target) => boolean = () => true): void {
    const t = g.target;
    if (t && t.kind === kind && ok(t)) f.interact = true;
    else this.walkStreet(g, f, at);
  }

  private street(g: MikulasGame, f: InputFrame): void {
    const p = g.player;
    const home = g.street.homeSpot;
    const avail = (h: HouseState) => g.sledItems.find((it) => !it.taken && !it.gone && it.gift === h.def.wish);
    const deliverable = g.houses.filter((h) => h.status === 'pending' && (avail(h) || p.hand.item === h.def.wish));
    const hand = p.hand.item;
    const handSlot = () => {
      const it = g.sledItems.find((x) => x.id === p.handFrom);
      return it ? { x: it.x, y: it.y } : g.street.toolSlots.candy;
    };

    if (g.phase === 'dawn' || deliverable.length === 0 || g.clock < 25) {
      if (hand) return this.act(g, f, 'putBack', handSlot());
      return this.act(g, f, 'goHome', home);
    }
    if (!hand || hand === 'candy' || !deliverable.some((h) => h.def.wish === hand)) {
      if (hand) return this.act(g, f, 'putBack', handSlot());
      // a már kiválasztott célt tartjuk, különben két egyforma távolságú ház között ingadozna
      const target =
        this.house && deliverable.includes(this.house)
          ? this.house
          : deliverable.reduce((a, b) => (Math.abs(a.street.cx - p.x) <= Math.abs(b.street.cx - p.x) ? a : b));
      this.house = target;
      const ts = g.street.toolSlots;
      if (target.dog?.mode === 'alert' && g.toolStock.bone > 0 && p.pocket.item !== 'bone')
        return this.act(g, f, 'takeTool', ts.bone, (t) => t.tool === 'bone');
      if (target.cat && target.cat.mode !== 'fed' && !target.dog && g.toolStock.fish > 0 && p.pocket.item !== 'fish')
        return this.act(g, f, 'takeTool', ts.fish, (t) => t.tool === 'fish');
      const it = g.sledItems.find((x) => !x.taken && !x.gone && x.tag === target.idx) ?? avail(target)!;
      return this.act(g, f, 'takeGift', it, (t) => t.item === it.id);
    }
    const h =
      this.house && this.house.status === 'pending' && this.house.def.wish === hand
        ? this.house
        : deliverable.find((d) => d.def.wish === hand)!;
    this.house = h;
    const st = h.street;
    if (h.dog?.mode === 'alert' && p.pocket.item === 'bone') return this.actTool(g, f, 'feedDog', h.dog);
    this.via = this.rng.chance(this.skill) ? 'chimney' : 'door';
    this.quiet = this.rng.chance(this.skill);
    const spot = this.via === 'door' ? st.door : st.ladder;
    this.path = [];
    this.act(g, f, this.via, spot, (t) => t.house === h.idx);
  }

  private inside(g: MikulasGame, f: InputFrame): void {
    const p = g.player;
    const h = g.houses[p.zone];
    const it = h.interior;
    const toTree = p.hand.item && p.hand.item !== 'candy' && h.status === 'pending' && !h.gift;
    if (!this.path.length) {
      const goal = toTree ? it.treeSpot : this.via === 'door' ? it.doorSpot : it.fireSpot;
      this.path = findPath(it.bounds, it.solids, 22, p, goal) ?? [goal];
    }
    // a macskát hallal lecsendesíti, ha útba esik
    if (g.toolTarget?.kind === 'feedCat') {
      f.tool = true;
      return;
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

  /** Közlekedés az utcán: a két sávon, és csak az átkelési pontokon át a sávok között. */
  private walkStreet(g: MikulasGame, f: InputFrame, to: Vec): void {
    const p = g.player;
    const st = g.street;
    const mid = 270;
    const top = (y: number) => y < mid;
    const lane = top(to.y) ? st.laneTop : st.laneBottom;
    if (top(p.y) === top(to.y)) {
      if (Math.abs(p.x - to.x) <= 16) this.steer(p, to, f);
      else if (Math.abs(p.y - lane) > 6) this.steer(p, { x: p.x, y: lane }, f);
      else this.steer(p, { x: to.x, y: lane }, f);
      return;
    }
    // át kell kelni: a legközelebbi átkelőhöz a saját sávon, ott át
    const myLane = top(p.y) ? st.laneTop : st.laneBottom;
    const cx = st.crossings.reduce((a, b) => (Math.abs(b - p.x) + Math.abs(b - to.x) < Math.abs(a - p.x) + Math.abs(a - to.x) ? b : a));
    if (Math.abs(p.x - cx) > 8) {
      if (Math.abs(p.y - myLane) > 6) this.steer(p, { x: p.x, y: myLane }, f);
      else this.steer(p, { x: cx, y: myLane }, f);
    } else this.steer(p, { x: cx, y: lane }, f);
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
