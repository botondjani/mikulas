import { moveCircle } from '../../../core/geom';
import { sees } from '../../../core/vision';
import { STREET } from '../types';
import type { MikulasGame } from '../game';

/**
 * Rendőrök: az autó az utca egyik felén járőrözik, egy idő után megáll, és kiszáll két
 * gyalogos rendőr zseblámpával. Gyalog körülnéznek, az ugatásra arra futnak; ha meglátják
 * a Mikulást, üldözik, és ha elkapják: letartóztatás (vége). Ha az autó fényszórója kapja
 * el a Mikulást, az autó azonnal megáll, és a rendőrök utána erednek.
 */
export interface CopState {
  x: number;
  y: number;
  dir: number;
  mode: 'search' | 'chase' | 'return';
  tx: number;
  ty: number;
  /** gyanú 0..1: ha a zseblámpa fényében marad, 1-nél üldözni kezd (addig ❓) */
  sus: number;
}

export interface PoliceState {
  x: number;
  y: number;
  dir: 1 | -1;
  minX: number;
  maxX: number;
  mode: 'patrol' | 'out';
  /** a járőrözésből / a gyalogos körből hátralévő idő */
  t: number;
  cops: CopState[];
  /** ennyi ideig nem állít meg újra a fényszóró */
  cooldown: number;
  /** a visszaszállás ideje (ha valami útban van, akkor is beszállnak) */
  boardT: number;
}

export function createPolice(g: MikulasGame, n: number): PoliceState[] {
  const st = g.street;
  const y = (st.laneTop + st.laneBottom) / 2;
  const sides = [
    { minX: 80, maxX: st.plazaX - 320 },
    { minX: st.plazaX + 320, maxX: st.w - 80 },
  ].filter((s) => s.maxX - s.minX > 260);
  const T = g.tuning.police;
  const out: PoliceState[] = [];
  for (let i = 0; i < n && sides.length; i++) {
    const s = sides[i % sides.length];
    out.push({
      x: g.rng.range(s.minX, s.maxX),
      y,
      dir: g.rng.chance(0.5) ? 1 : -1,
      minX: s.minX,
      maxX: s.maxX,
      mode: 'patrol',
      t: g.rng.range(T.drive[0], T.drive[1]),
      cops: [],
      cooldown: 0,
      boardT: 0,
    });
  }
  return out;
}

export function policeCone(g: MikulasGame, c: PoliceState) {
  const T = g.tuning.police;
  return { x: c.x + c.dir * 30, y: c.y, dir: c.dir > 0 ? 0 : Math.PI, halfAngle: T.halfAngle, range: T.range };
}

export function copCone(g: MikulasGame, cop: CopState) {
  const T = g.tuning.police;
  return { x: cop.x, y: cop.y, dir: cop.dir, halfAngle: T.copHalf, range: T.copRange };
}

/** Kiszállnak a rendőrök; ha `chase`, rögtön a Mikulás után erednek. */
function getOut(g: MikulasGame, c: PoliceState, chase: boolean): void {
  const T = g.tuning.police;
  c.mode = 'out';
  c.t = chase ? T.search : g.rng.range(T.foot[0], T.foot[1]);
  const p = g.player;
  c.cops = [-1, 1].map((s) => ({
    x: c.x,
    y: c.y + s * 26,
    dir: s > 0 ? Math.PI / 2 : -Math.PI / 2,
    mode: chase ? 'chase' : 'search',
    tx: chase ? p.x : c.x + s * g.rng.range(80, T.searchRadius),
    ty: chase ? p.y : c.y + s * 70,
    sus: chase ? 1 : 0,
  }));
  if (chase) {
    g.emitNoise(STREET, c.x, c.y, g.tuning.noise.siren, 'siren');
    g.events.emit('sfx', { id: 'siren' });
  } else g.events.emit('sfx', { id: 'carDoor' });
}

function step(g: MikulasGame, o: { x: number; y: number; dir: number }, tx: number, ty: number, speed: number, dt: number): boolean {
  const dx = tx - o.x;
  const dy = ty - o.y;
  const l = Math.hypot(dx, dy);
  if (l < 8) return true;
  const s = Math.min(l, speed * dt);
  const pos = { x: o.x, y: o.y };
  moveCircle(pos, 12, (dx / l) * s, (dy / l) * s, g.street.solids, g.street.bounds);
  o.x = pos.x;
  o.y = pos.y;
  o.dir = Math.atan2(dy, dx);
  return false;
}

/** Ugatás: a kint lévő rendőrök arra futnak, ha elég közel van. */
export function policeHear(g: MikulasGame, x: number, y: number): void {
  const T = g.tuning.police;
  for (const c of g.police) {
    if (c.mode !== 'out') continue;
    for (const cop of c.cops)
      if (cop.mode !== 'chase' && Math.hypot(cop.x - x, cop.y - y) < T.barkHear) {
        cop.mode = 'search';
        cop.tx = x + g.rng.range(-40, 40);
        cop.ty = y + g.rng.range(-30, 30);
        c.t = Math.max(c.t, T.search);
      }
  }
}

export function updatePolice(g: MikulasGame, dt: number): void {
  const T = g.tuning.police;
  const p = g.player;
  const visible = p.zone === STREET && p.busy <= 0;
  for (const c of g.police) {
    c.cooldown = Math.max(0, c.cooldown - dt);
    if (c.mode === 'patrol') {
      c.x += c.dir * T.speed * dt;
      if (c.x > c.maxX) c.dir = -1;
      if (c.x < c.minX) c.dir = 1;
      c.t -= dt;
      if (visible && c.cooldown <= 0 && sees(policeCone(g, c), p.x, p.y, g.street.solids)) getOut(g, c, true);
      else if (c.t <= 0) getOut(g, c, false);
      continue;
    }
    // gyalog
    c.t -= dt;
    let anySees = false;
    for (const cop of c.cops) {
      const inLight = visible && sees(copCone(g, cop), p.x, p.y, g.street.solids);
      cop.sus = inLight ? Math.min(1, cop.sus + dt / T.notice) : Math.max(0, cop.sus - dt * 0.5);
      const see = inLight && (cop.sus >= 1 || cop.mode === 'chase');
      if (see) {
        anySees = true;
        cop.mode = 'chase';
        cop.tx = p.x;
        cop.ty = p.y;
      }
      if (cop.mode === 'chase') {
        // az utolsó ismert helyre fut; ha ott sincs, keresgél
        if (step(g, cop, cop.tx, cop.ty, T.copRun, dt) && !see) cop.mode = 'search';
        if (visible && Math.hypot(p.x - cop.x, p.y - cop.y) < T.copCatch) {
          g.arrest(g.police.indexOf(c));
          return;
        }
      } else if (cop.mode === 'search') {
        if (step(g, cop, cop.tx, cop.ty, T.copWalk, dt)) {
          cop.tx = Math.max(c.minX - 100, Math.min(c.maxX + 100, cop.x + g.rng.range(-T.searchRadius, T.searchRadius)));
          cop.ty = g.rng.chance(0.5) ? g.street.laneTop : g.street.laneBottom;
        }
      } else step(g, cop, c.x, c.y, T.copWalk, dt);
    }
    if (c.cops.every((k) => k.mode === 'return')) c.boardT += dt;
    else c.boardT = 0;
    if (anySees) c.t = T.search;
    if (c.t <= 0 && c.cops.every((k) => k.mode !== 'chase')) for (const cop of c.cops) cop.mode = 'return';
    // mindenki visszaült: indulás tovább
    if (c.boardT > 0 && (c.boardT > 6 || c.cops.every((k) => Math.hypot(k.x - c.x, k.y - c.y) < 40))) {
      c.mode = 'patrol';
      c.cops = [];
      c.t = g.rng.range(T.drive[0], T.drive[1]);
      c.cooldown = T.cooldown;
      g.events.emit('sfx', { id: 'carDoor' });
    }
  }
}

/** üldözik-e éppen a Mikulást */
export const policeChasing = (g: MikulasGame): boolean => g.police.some((c) => c.cops.some((k) => k.mode === 'chase'));
