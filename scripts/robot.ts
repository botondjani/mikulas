import { Rng } from '../src/core/rng';
import { findPath } from '../src/core/path';
import { emptyInput, type InputFrame } from '../src/core/input';
import type { Vec } from '../src/core/geom';
import { STREET } from '../src/games/mikulas/types';
import type { MikulasGame, HouseState, Target, TargetKind } from '../src/games/mikulas/game';
import { copCone, policeCone } from '../src/games/mikulas/agents/police';
import { inCone } from '../src/core/vision';

/**
 * Egyszerű, véletlenszerű "robot-játékos" a fejnélküli szimulációhoz.
 * Nem optimális: néha rosszul pakol, néha nem csendben megy, nem figyeli a nagypapát.
 */
export class Robot {
  private rng: Rng;
  private packed = false;
  /** a pakolás "ideje": a robot programból pakol, de annyi ideig vár, amennyi egy embernek kellene */
  private packWait = 0;
  /** menekülés után a házban vár (elbújva), amíg elmegy a veszély */
  private hideT = 0;
  /** épp elbújva vár, mert figyelik */
  private lurking = false;
  private house: HouseState | null = null;
  private via: 'door' | 'chimney' = 'chimney';
  private quiet = false;
  private path: Vec[] = [];
  private lastPos = { x: 0, y: 0 };
  private stuck = 0;
  /** menekülési sáv (elakadáskor a másikra vált) */
  private fleeLane: number | null = null;
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
      // a régi útvonal a kitérés után falon át vezethet: újratervezünk
      this.path = [];
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

    if (p.zone === STREET && this.flee(g, f)) return f;
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

  /**
   * Menekülés: ha a Krampusz vagy egy rendőr üldözi, vagy épp a fényszóró / zseblámpa
   * elé lépne, elszalad a sávban (a szaloncukrot ledobja a Krampusznak).
   */
  private flee(g: MikulasGame, f: InputFrame): boolean {
    const p = g.player;
    const threats: Vec[] = [];
    const k = g.krampus;
    if (k.active && (k.mode === 'chase' || (k.mode === 'walk' && Math.hypot(k.x - p.x, k.y - p.y) < 200))) {
      if (k.mode === 'chase' && p.hand.item === 'candy') {
        f.tool = true;
        return true;
      }
      threats.push(k);
    }
    for (const c of g.police) {
      if (c.mode === 'patrol') {
        const cone = policeCone(g, c);
        if (inCone({ ...cone, range: cone.range + 40, halfAngle: cone.halfAngle + 0.1 }, p.x, p.y)) threats.push(c);
      } else
        for (const cop of c.cops) {
          const cone = copCone(g, cop);
          if (cop.mode === 'chase' || cop.sus > 0 || inCone({ ...cone, range: cone.range + 30, halfAngle: cone.halfAngle + 0.1 }, p.x, p.y) || Math.hypot(cop.x - p.x, cop.y - p.y) < 70)
            threats.push(cop);
        }
    }
    if (!threats.length) {
      this.fleeLane = null;
      return false;
    }
    const t = threats.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
    this.quiet = false;
    f.quiet = false;
    const st = g.street;
    // minden veszélytől el (a közelebbiek többet számítanak)
    const dir = Math.sign(threats.reduce((acc, q) => acc + (p.x - q.x) / Math.max(30, Math.hypot(q.x - p.x, q.y - p.y)) ** 2, 0)) || 1;
    // be egy közeli házba (ott nem látják), ha nem a veszély felé kell menni, vagy a pálya szélén nincs hova
    const td = Math.hypot(t.x - p.x, t.y - p.y);
    const cornered = (dir < 0 && p.x < 260) || (dir > 0 && p.x > st.w - 260);
    const doors = g.houses
      .filter((x) => x.status !== 'lost')
      .map((h) => ({ h, d: Math.hypot(h.street.door.x - p.x, h.street.door.y - p.y) }))
      .filter(({ h, d }) => cornered || (d < 240 && (Math.sign(h.street.door.x - p.x) === dir || d < td * 0.6)))
      .sort((a, b) => a.d - b.d);
    if (doors.length) {
      const h = doors[0].h;
      this.house = null;
      // a kéményen jön ki: máshol, mint ahol bement
      this.via = 'chimney';
      this.hideT = 6;
      this.act(g, f, 'door', h.street.door, (tt) => tt.house === h.idx);
      return true;
    }
    // a sávot a veszélytől távolabb választjuk (nem futunk felé)
    if (this.fleeLane === null)
      this.fleeLane =
        td < 160 ? (Math.abs(t.y - st.laneTop) > Math.abs(t.y - st.laneBottom) ? st.laneTop : st.laneBottom)
        : Math.abs(p.y - st.laneTop) < Math.abs(p.y - st.laneBottom) ? st.laneTop : st.laneBottom;
    // menekülés közben hamar észrevesszük az elakadást: sávot váltunk
    if (this.stuck > 0.2) {
      this.stuck = 0;
      this.fleeLane = this.fleeLane === st.laneTop ? st.laneBottom : st.laneTop;
    }
    this.steer(p, { x: p.x + dir * (Math.abs(p.y - this.fleeLane) > 20 ? 40 : 200), y: this.fleeLane }, f);
    return true;
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

    if (g.phase === 'dawn' || deliverable.length === 0 || g.clock < 55) {
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
      if (target.dog?.mode === 'alert' && g.toolStock.bone > 0 && !p.pocket.has('bone'))
        return this.act(g, f, 'takeTool', ts.bone, (t) => t.tool === 'bone');
      if (target.cat && target.cat.mode !== 'fed' && !target.dog && g.toolStock.fish > 0 && !p.pocket.has('fish'))
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
    if (h.dog?.mode === 'alert' && p.pocket.has('bone')) return this.actTool(g, f, 'feedDog', h.dog);
    this.via = this.rng.chance(this.skill) ? 'chimney' : 'door';
    this.quiet = this.rng.chance(this.skill);
    const spot = this.via === 'door' ? st.door : st.ladder;
    this.path = [];
    this.act(g, f, this.via, spot, (t) => t.house === h.idx);
  }

  private inside(g: MikulasGame, f: InputFrame): void {
    const p = g.player;
    if (this.hideT > 0) {
      // menekülés: elbújva vár egy kicsit
      this.hideT -= 1 / 60;
      f.hide = true;
      return;
    }
    const h = g.houses[p.zone];
    const it = h.interior;
    if (p.closet >= 0) {
      if (!this.watched(g, h)) f.interact = true;
      return;
    }
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
    // ha valaki figyel (vagy mindjárt figyelni fog) és a látókörében van: elbújik és vár
    if (g.phase !== 'dawn' && (this.rng.chance(this.skill) || this.lurking)) {
      const watched = this.watched(g, h);
      this.lurking = watched;
      if (watched) {
        // ha már gyanakszik, a bújás nem segít: kihátrál a látóköréből
        const sus = [h.child, ...h.others, ...(h.grandpa ? [h.grandpa] : [])].find((c) => c.suspicion > g.tuning.child.hideMemory * 0.5);
        if (sus) {
          const p = g.player;
          const dx = p.x - sus.x;
          const dy = p.y - sus.y;
          const l = Math.hypot(dx, dy) || 1;
          // oldalra (a nézési irányra merőlegesen) lép ki
          const side = Math.sign(Math.cos(sus.dir) * dy - Math.sin(sus.dir) * dx) || 1;
          f.mx = (dx / l) * 0.3 - Math.sin(sus.dir) * side;
          f.my = (dy / l) * 0.3 + Math.cos(sus.dir) * side;
          this.path = [];
          return;
        }
        // közeli szekrénybe bújik, ha van
        const cl = h.interior.closets.find((c) => Math.hypot(c.front.x - g.player.x, c.front.y - g.player.y) < 90);
        if (cl) {
          if (g.target?.kind === 'closetIn') f.interact = true;
          else this.steer(g.player, cl.front, f);
          this.path = [];
          return;
        }
        f.hide = true;
        return;
      }
    }
    const t = g.target;
    const want: TargetKind = toTree ? 'tree' : this.via === 'door' ? 'exitDoor' : 'exitChimney';
    if (t?.kind === want && this.path.length <= 1) {
      // kint a Krampusz ólálkodik a kijárat közelében: várunk
      const k = g.krampus;
      const out = this.via === 'door' ? h.street.door : h.street.ladder;
      if (!toTree && k.active && k.mode !== 'eat' && k.mode !== 'happy' && Math.hypot(k.x - out.x, k.y - out.y) < 300) {
        f.hide = true;
        return;
      }
      f.interact = true;
      this.path = [];
      return;
    }
    const wp = this.path[0];
    if (Math.hypot(wp.x - p.x, wp.y - p.y) < 12 && this.path.length > 1) this.path.shift();
    this.steer(p, this.path[0], f);
  }

  /** Figyeli-e valaki a házban (vagy mindjárt figyelni fogja), és a látókörében van-e. */
  private watched(g: MikulasGame, h: HouseState): boolean {
    const p = g.player;
    const T = g.tuning;
    for (const c of [h.child, ...h.others])
      if (c.mode !== 'asleep' && (c.suspicion > 0 || inCone({ x: c.x, y: c.y, dir: c.dir, halfAngle: T.child.halfAngle + 0.2, range: T.child.range + 40 }, p.x, p.y)))
        return true;
    const gp = h.grandpa;
    if (gp && gp.mode !== 'dozing' && gp.mode !== 'knit') {
      const K = gp.kind === 'tv' ? T.tv : gp.kind === 'grandma' ? T.grandma : T.grandpa;
      if (gp.suspicion > 0 || inCone({ x: gp.x, y: gp.y, dir: gp.dir, halfAngle: K.halfAngle + 0.15, range: K.range + 30 }, p.x, p.y)) return true;
    }
    return false;
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
