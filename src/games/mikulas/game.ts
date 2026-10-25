import { Rng } from '../../core/rng';
import { PhaseMachine } from '../../core/fsm';
import { Director, planEvents, intensityAt, type PlannedEvent } from '../../core/director';
import { ScoreBook, starsFor } from '../../core/scoring';
import { Emitter } from '../../core/events';
import { Pocket, Slot } from '../../core/inventory';
import { moveCircle, pointInPolygon, pointInRect, type Rect } from '../../core/geom';
import { noiseEffect } from '../../core/noise';
import { sees } from '../../core/vision';
import type { InputFrame } from '../../core/input';
import tuningData from './data/tuning.json';
import { modeLevel, modeTuning, type GameMode, type Tuning } from './modes';
import eventsData from './data/events.json';
import items from './data/items.json';
import {
  STREET,
  FACTORY,
  ROAD,
  isHouse,
  GIFTS,
  TOOLS,
  icon,
  type EventId,
  type GiftId,
  type HandItem,
  type HouseDef,
  type LevelDef,
  type PackTool,
  type Phase,
  type StockTool,
  type ToolId,
} from './types';
import {
  buildFactory,
  buildRoad,
  type RoadLayout,
  buildInterior,
  buildStreet,
  type FactoryLayout,
  type InteriorLayout,
  type StreetHouse,
  type StreetLayout,
} from './layout';
import { createChild, hearChild, hearSleeper, sleepersOf, updateChild, childAwake, type ChildState } from './agents/child';
import { createGrandpa, hearElder, updateGrandpa, wakeGrandpa, type GrandpaState } from './agents/grandpa';
import { createDog, updateDog, bark, type DogState } from './agents/dog';
import { createCat, updateCat, type CatState } from './agents/cat';
import { createStorm, inPuddle, updateStorm, type StormState } from './agents/storm';
import { createKrampus, spawnKrampus, updateKrampus, type KrampusState } from './agents/krampus';
import { calmStray, createStrays, updateStrays, type StrayState } from './agents/stray';
import { createPolice, policeHear, updatePolice, type PoliceState } from './agents/police';

export type { Tuning } from './modes';
export type CaptionKey = keyof typeof eventsData.captions;
export type HintKey = keyof typeof eventsData.hints;
export type CaptionKind = 'info' | 'warn' | 'bad' | 'good' | 'hint';

export const SCORE_TABLE = {
  gift: 100,
  quiet: 50,
  fast: 20,
  wrongGift: -30,
  caught: -50,
  giftRevoked: -100,
  fastRevoked: -20,
  star: 10,
} as const;
export type ScoreKey = keyof typeof SCORE_TABLE;

export interface GameEvents extends Record<string, unknown> {
  caption: { text: string; kind: CaptionKind };
  noise: { zone: number; x: number; y: number; amount: number; kind: string };
  sfx: { id: string };
  score: { points: number; label: string; zone: number; x: number; y: number };
  zone: { zone: number; via: 'door' | 'chimney' | 'caught' | 'sled' | 'road' };
  phase: { phase: Phase };
  happy: { house: number };
  snowHit: { x: number; y: number };
  caught: { house: number };
  /** időbónusz (mp) */
  time: { seconds: number };
  /** vége a pályának (elveszett) */
  gameOver: { reason: GameOverReason };
}

/** a pálya elvesztésének oka */
export type GameOverReason = 'time' | 'police' | 'krampus';

/** sötét-e a ház adott pontja (sötét ház, és nem kivilágított szoba) */
export const inDark = (h: HouseState, x: number, y: number): boolean => h.dark && !h.litRooms.some((r) => pointInRect(x, y, r));

/** a még nem a szalagon lévő tárgyak helye (a manóknál, a kupacban) */
export const WAITING = -10000;

export type HouseStatus = 'pending' | 'happy' | 'sad' | 'lost';

export interface HouseState {
  idx: number;
  def: HouseDef;
  street: StreetHouse;
  interior: InteriorLayout;
  status: HouseStatus;
  gift: GiftId | null;
  fastBonus: boolean;
  child: ChildState;
  /** a gyereken kívül alvók (szülők, testvér) */
  others: ChildState[];
  /** sötét (vagy félig sötét) ház: zseblámpával lehet tájékozódni */
  dark: boolean;
  /** félig sötét házban a kivilágított szobák */
  litRooms: Rect[];
  dog?: DogState;
  cat?: CatState;
  grandpa?: GrandpaState;
}

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  zone: number;
  dir: number;
  quiet: boolean;
  speed01: number;
  busy: number;
  busyKind: string;
  hand: Slot<HandItem>;
  /** eszközök a zsebben (legfeljebb 5) */
  pocket: Pocket<ToolId>;
  /** a kézben lévő ajándék szán-azonosítója (-1, ha nincs) */
  handFrom: number;
  creak: number;
  /** zörgő akadály hangjának várakozása */
  bumpCd: number;
  /** a felvett ajándék csak akkor tehető vissza, ha már eltávolodott a helyétől (ne legyen véletlen) */
  putBackArmed: boolean;
  /** a házban elbújt (virág mögé guggolt): nem látják, de nagyon lassú */
  hidden: boolean;
  /** hátralévő hógolyók (a figyelem elterelésére) */
  snowballs: number;
  /** melyik szekrényben bújik (-1: egyikben sem) */
  closet: number;
  /** belépés utáni türelmi idő: még senki sem veheti észre */
  grace: number;
  /** mennyi ideje rohan a jégen (elcsúszáshoz) */
  iceT: number;
  /** elcsúszott: a földön fekszik (animációhoz is) */
  slipT: number;
  /** van-e nála zseblámpa (sötétben magától világít) */
  flashlight: boolean;
}

export interface GroundItem {
  kind: 'candy' | 'bell' | 'gift';
  /** elejtett ajándéknál a szán-azonosító */
  item?: number;
  zone: number;
  x: number;
  y: number;
  ttl: number;
}

export type TargetKind =
  | 'takeGift'
  | 'putBack'
  | 'packTake'
  | 'packPut'
  | 'packReturn'
  | 'takeTool'
  | 'goHome'
  | 'door'
  | 'chimney'
  | 'packPutTool'
  | 'feedCat'
  | 'feedDog'
  | 'candy'
  | 'pickCandy'
  | 'pickGift'
  | 'feedStray'
  | 'dropGift'
  | 'dropCandy'
  | 'locked'
  | 'tree'
  | 'exitDoor'
  | 'exitChimney'
  | 'bell'
  | 'closetIn'
  | 'snowball'
  | 'launch'
  | 'closetOut';

export interface Target {
  kind: TargetKind;
  x: number;
  y: number;
  house: number;
  label: string;
  icon: string;
  /** szánról felvehető ajándék azonosítója */
  item?: number;
  tool?: StockTool;
  /** szán-hely indexe */
  slot?: number;
}

/** Egy ajándék a helyén a szánon; a címke a ház, amelyiknek szánják (-1: senkinek). */
export interface SledItem {
  id: number;
  gift: GiftId;
  tag: number;
  x: number;
  y: number;
  /** a szán melyik helyén áll */
  slot: number;
  /** a Mikulásnál (vagy a Krampusznál) van */
  taken: boolean;
  /** a fa alatt van */
  gone: boolean;
}

export interface PackItem {
  id: number;
  /** ajándék, vagy (ha null) eszköz */
  gift: GiftId | null;
  tool: PackTool | null;
  /** a helye a futószalagon (x) */
  beltX: number;
  /** a szán (eszköznél az eszközláda) melyik helyén áll (-1: a szalagon vagy a kézben) */
  slot: number;
}

export interface GameResult {
  levelId: number;
  happy: number;
  total: number;
  ratio: number;
  stars: number;
  score: number;
  statuses: HouseStatus[];
  /** ha elveszett a pálya: miért */
  gameOver?: GameOverReason;
}

const LABELS: Record<TargetKind, [string, string]> = {
  takeGift: ['Felvesz', '🎁'],
  putBack: ['Szánra', '🛷'],
  packTake: ['Felvesz', '🎁'],
  packPut: ['Szánra', '🛷'],
  packReturn: ['Szalagra', '🏭'],
  takeTool: ['Zsebre', '🧰'],
  goHome: ['Haza!', '🏠'],
  door: ['Be', '🚪'],
  chimney: ['Mászás', '🪜'],
  packPutTool: ['Ládába', '🧰'],
  feedCat: ['Hal', '🐟'],
  feedDog: ['Csont', '🦴'],
  candy: ['Felvesz', '🍬'],
  pickCandy: ['Felvesz', '🍬'],
  pickGift: ['Felvesz', '🎁'],
  feedStray: ['Csont', '🦴'],
  dropGift: ['Letesz', '⬇️'],
  dropCandy: ['Ledob', '🍬'],
  locked: ['Zárva', '🔒'],
  tree: ['Lerak', '🎁'],
  exitDoor: ['Ki', '🚪'],
  exitChimney: ['Fel', '🪜'],
  bell: ['Dob', '🔔'],
  closetIn: ['Bebújik', '🚪'],
  snowball: ['Dob', '⚪'],
  launch: ['Indulás', '🛷'],
  closetOut: ['Kibújik', '🚪'],
};

export class MikulasGame {
  readonly tuning: Tuning;
  readonly level: LevelDef;
  /** a játékmód (hard / horror) */
  readonly mode: GameMode;
  readonly rng: Rng;
  readonly street: StreetLayout;
  readonly factory: FactoryLayout;
  readonly road: RoadLayout;
  readonly strays: StrayState[];
  readonly police: PoliceState[];
  /** a szánút sebessége */
  driveSpeed = 0;
  /** ütközés-jelzés (megjelenítéshez) */
  driveBump = 0;
  /** a szán a jégen megcsúszott (pörgés animációhoz) */
  driveSkid = 0;
  /** a szán a levegőben (ugrató után), hátralévő idő */
  driveAir = 0;
  /** indulás: a Mikulás megtolja a szánt, felugrik rá (hátralévő idő) */
  launchT = 0;
  /** tolás: 0..1, a sárga gomb minden nyomása tolja tovább a szánt */
  launchP = 0;
  /** a futószalagot töltő manók */
  readonly elves: { x: number; home: number; tx: number; item: number; carry: boolean; dropT: number; wait: number }[] = [];
  /** repülő hógolyók */
  readonly snowFlights: { x0: number; y0: number; x1: number; y1: number; t: number; T: number }[] = [];
  private wasOnIce = false;
  private bumpCd = 0;
  private sledLoaded = false;
  readonly houses: HouseState[];
  readonly player: PlayerState;
  readonly phases: PhaseMachine<Phase>;
  readonly director: Director;
  readonly plan: PlannedEvent[];
  readonly score = new ScoreBook<ScoreKey>(SCORE_TABLE);
  readonly events = new Emitter<GameEvents>();
  readonly krampus: KrampusState = createKrampus();
  readonly ground: GroundItem[] = [];
  /** a szalag (sack), a szán, az eszközláda és ami a kézben van */
  readonly pack: { sack: PackItem[]; sled: PackItem[]; box: PackItem[]; held: PackItem | null };
  sledItems: SledItem[] = [];
  /** az eszközládában lévő eszközök (az utcán innen vehetők el) */
  toolStock: Record<StockTool, number> = { bone: 0, fish: 0, bell: 0, candy: 0 };
  readonly storm: StormState;
  /** az éjszakából hátralévő idő (a gyárban, a szánúton és a faluban is ez fogy) */
  clock: number;
  /** elveszett a pálya: ok és az azóta eltelt idő (a jelenet után jön az eredmény) */
  over: { reason: GameOverReason; t: number; car: number } | null = null;
  /** az eszköz-gombbal elérhető célpont */
  toolTarget: Target | null = null;
  blizzard = 0;
  /** köd: hátralévő idő */
  fog = 0;
  /** a kézbesítés kezdete óta eltelt idő */
  deliverT = 0;
  result: GameResult | null = null;
  target: Target | null = null;
  /** az óra és a director áll (pl. tutorial alatt); a szereplők közben élnek */
  clockFrozen = false;
  /** a pálya tipp-feliratai (a tutorial alatt kikapcsolva) */
  hintsEnabled = true;
  private captionRng: Rng;
  private hintsShown = new Set<HintKey>();
  private allDoneSaid = false;
  private saidOnce = new Set<string>();

  constructor(
    baseLevel: LevelDef,
    readonly seed: number,
    mode: GameMode = {},
  ) {
    this.mode = mode;
    const level = modeLevel(baseLevel, mode);
    this.level = level;
    this.tuning = modeTuning(tuningData, mode);
    this.rng = new Rng(seed).fork(2);
    this.captionRng = new Rng(seed).fork(3);
    const layoutRng = new Rng(seed).fork(4);
    this.street = buildStreet(level.houses.length, new Rng(seed).fork(6), level.obstacles);
    this.factory = buildFactory(level.houses.length, level.toolbox);
    this.road = buildRoad(new Rng(seed).fork(7), level.obstacles);
    this.houses = level.houses.map((def, idx) => {
      const h = {
        idx,
        def,
        street: this.street.houses[idx],
        interior: buildInterior(layoutRng, def.grandpa ? (def.elder ?? 'grandpa') : null, {
          rooms: def.rooms ?? 2,
          extra: [...(def.parents ? (['parents'] as const) : []), ...(def.sibling ? (['sibling'] as const) : [])],
        }),
        status: 'pending',
        gift: null,
        fastBonus: false,
      } as unknown as HouseState;
      const sl = h.interior.sleepers;
      h.child = createChild(def.child, h.interior.childBed, this, 'child', sl[0].path, sl[0].room);
      h.others = sl.slice(1).map((z) => createChild(z.kind === 'parents' ? 'a szülők' : 'a testvér', z.spot, this, z.kind, z.path, z.room));
      const light = def.light ?? 'on';
      h.dark = light !== 'on';
      h.litRooms = [];
      if (light === 'partial') {
        // 1-2 szobában ég a lámpa (a többiben sötét)
        const lr = new Rng(seed).fork(500 + idx);
        const rooms = lr.shuffle([...h.interior.rooms]);
        // a gyerekszoba az esetek felében biztosan ki van világítva
        if (lr.chance(0.5)) rooms.sort((a, b) => (a.kind === 'kid' ? -1 : 0) - (b.kind === 'kid' ? -1 : 0));
        h.litRooms = rooms.slice(0, rooms.length > 2 ? lr.int(1, 2) : 1).map((r) => r.rect);
      }
      if (def.dog) h.dog = createDog(h);
      if (def.cat) h.cat = createCat(h, seed);
      if (def.grandpa) h.grandpa = createGrandpa(h, this, def.elder ?? 'grandpa');
      return h;
    });
    this.strays = createStrays(this, level.strays);
    this.police = createPolice(this, level.police ?? 0);
    this.player = {
      x: this.factory.spawn.x,
      y: this.factory.spawn.y,
      vx: 0,
      vy: 0,
      zone: FACTORY,
      dir: -Math.PI / 2,
      quiet: false,
      speed01: 0,
      busy: 0,
      busyKind: '',
      hand: new Slot<HandItem>(),
      pocket: new Pocket<ToolId>(5),
      handFrom: -1,
      creak: -1,
      bumpCd: 0,
      putBackArmed: false,
      hidden: false,
      closet: -1,
      snowballs: mode.hard ? 2 : 3,
      grace: 0,
      iceT: 0,
      slipT: 0,
      // a zseblámpa mindig nálunk van: sötétben magától világít
      flashlight: true,
    };

    // pakolás: a kívánságok, néhány csalitárgy és az eszközök összekeverve a futószalagon
    const packRng = new Rng(seed).fork(5);
    const items: { gift: GiftId | null; tool: PackTool | null }[] = level.houses.map((h) => ({ gift: h.wish, tool: null }));
    for (let i = 0; i < level.decoys; i++) items.push({ gift: packRng.pick(GIFTS), tool: null });
    for (const t of TOOLS) for (let i = 0; i < level.tools[t]; i++) items.push({ gift: null, tool: t });
    for (let i = 0; i < level.candy; i++) items.push({ gift: null, tool: 'candy' });
    // a futószalagra sorban érkeznek (a gépből), egymás után
    const B = this.tuning.belt;
    this.pack = {
      sack: packRng
        .shuffle(items.map((it, id) => ({ id, ...it, beltX: 0, slot: -1 })))
        // az első néhány már a szalagon van, a többit a manók rakják fel
        .map((p, i) => ({ ...p, beltX: i < 3 ? this.factory.beltStart + 60 + i * B.gap * 1.8 : WAITING })),
      sled: [],
      box: [],
      held: null,
    };
    const ne = mode.hard ? 4 : 3;
    for (let i = 0; i < ne; i++) {
      const home = this.factory.beltStart + ((i + 1) * (this.factory.beltEnd - this.factory.beltStart)) / (ne + 1) - 60;
      this.elves.push({ x: home, home, tx: home, item: -1, carry: false, dropT: 0, wait: 0.3 + i * 0.6 });
    }
    this.storm = createStorm(seed, level.storm, this.tuning.storm);
    this.clock = level.durations.pack + level.durations.deliver;

    const d = level.durations;
    this.phases = new PhaseMachine<Phase>(
      [
        { id: 'pack' },
        { id: 'drive', duration: this.tuning.drive.maxTime, next: 'deliver' },
        { id: 'deliver' },
        { id: 'dawn' },
        { id: 'result' },
      ],
      'pack',
    );
    this.phases.onChange((to) => this.onPhase(to));

    this.plan = planEvents(
      {
        duration: d.deliver,
        interval: [6, 11],
        grace: 8,
        events: (Object.keys(level.events) as EventId[]).map((id) => ({
          id,
          weight: level.events[id],
          ...eventsData.defs[id],
        })),
      },
      new Rng(seed).fork(1),
    );
    this.director = new Director(this.plan);
  }

  get phase(): Phase {
    return this.phases.phase;
  }

  get intensity(): number {
    return intensityAt(Math.min(1, this.deliverT / this.level.durations.deliver));
  }

  get pendingCount(): number {
    return this.houses.filter((h) => h.status === 'pending').length;
  }

  get happyCount(): number {
    return this.houses.filter((h) => h.status === 'happy').length;
  }

  // ---------- szövegek ----------

  say(key: CaptionKey, vars: Record<string, string | number>, kind: CaptionKind): void {
    const v: Record<string, string | number> = { ...vars };
    if (typeof v.gift === 'string' && v.gift in items.gifts) {
      v.icon = icon(v.gift as GiftId);
      v.gift = items.gifts[v.gift as GiftId].acc;
    }
    // üres lista: az esemény felirat nélkül történik (csak a látvány és a hang jelzi)
    const list: string[] = eventsData.captions[key];
    if (!list.length) return;
    const text = this.captionRng.pick(list).replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
    this.events.emit('caption', { text, kind });
  }

  /** Felirat egyszer (pl. házanként egyszer). */
  sayOnce(id: string, key: CaptionKey, vars: Record<string, string | number>, kind: CaptionKind): void {
    if (this.saidOnce.has(id)) return;
    this.saidOnce.add(id);
    this.say(key, vars, kind);
  }

  hint(key: HintKey): void {
    if (!this.level.hints || !this.hintsEnabled || this.hintsShown.has(key)) return;
    this.hintsShown.add(key);
    this.events.emit('caption', { text: eventsData.hints[key], kind: 'hint' });
  }

  private addScore(key: ScoreKey, zone: number, x: number, y: number, label: string): void {
    const points = this.score.add(key, this.deliverT, label);
    this.events.emit('score', { points, label, zone, x, y });
    // ami pontot hoz, az egy kis időt is
    const tb = this.tuning.timeBonus as Record<string, number>;
    if (points > 0 && tb[key]) this.extraTime(tb[key]);
  }

  // ---------- pakolás ----------

  /**
   * Szánvezetés: a szán magától halad előre; fel-le kormányozni, előre gyorsítani,
   * hátra fékezni lehet. Akadálynak ütközve lelassul, a jégen csúszik; a csillag pont és idő.
   */
  private updateDrive(dt: number, input: InputFrame): void {
    const p = this.player;
    const T = this.tuning.drive;
    const R = this.road;
    this.driveBump = Math.max(0, this.driveBump - dt);
    this.bumpCd = Math.max(0, this.bumpCd - dt);
    const target = Math.max(T.min, Math.min(T.max, T.speed + input.mx * 110));
    this.driveSpeed += (target - this.driveSpeed) * Math.min(1, dt * 2.2);
    // ugrató: a levegőben nem ütközik és nem csúszik
    const wasAir = this.driveAir > 0;
    this.driveAir = Math.max(0, this.driveAir - dt);
    if (wasAir && this.driveAir === 0) {
      this.driveBump = 0.15;
      this.events.emit('sfx', { id: 'land' });
    }
    if (!wasAir && this.driveSpeed > T.min + 30 && R.ramps.some((r) => pointInRect(p.x, p.y, r))) {
      this.driveAir = T.air;
      this.events.emit('sfx', { id: 'jump' });
    }
    const air = this.driveAir > 0;
    const onIce = !air && R.obstacles.some((o) => o.slippery && o.poly && pointInPolygon(p.x, p.y, o.poly));
    this.driveSkid = Math.max(0, this.driveSkid - dt);
    // jégre érve a szán oldalra csúszik
    if (onIce && !this.wasOnIce) {
      p.vy += (this.rng.chance(0.5) ? 1 : -1) * T.skid;
      this.driveSkid = 0.8;
      this.sayOnce('sledSkid', 'sledSkid', {}, 'warn');
      this.events.emit('sfx', { id: 'skid' });
    }
    this.wasOnIce = onIce;
    const steer = input.my * T.steer * (air ? 0.3 : 1);
    p.vy += (steer - p.vy) * Math.min(1, dt * (onIce ? 1.2 : 9));
    const pos = { x: p.x, y: p.y };
    moveCircle(pos, T.radius, this.driveSpeed * dt, p.vy * dt, air ? [] : R.solids, R.band);
    // előre nem jutott: nekiment valaminek
    if (!air && pos.x - p.x < this.driveSpeed * dt * 0.5 && this.bumpCd <= 0) {
      this.driveSpeed = T.bumpSpeed;
      this.driveBump = 0.4;
      this.bumpCd = 0.6;
      this.events.emit('sfx', { id: 'thud' });
    }
    p.vx = (pos.x - p.x) / Math.max(dt, 1e-6);
    p.x = pos.x;
    p.y = pos.y;
    p.speed01 = Math.min(1, this.driveSpeed / T.max);
    for (let i = R.stars.length - 1; i >= 0; i--) {
      const s = R.stars[i];
      if (Math.hypot(s.x - p.x, s.y - p.y) < T.radius + 16) {
        R.stars.splice(i, 1);
        this.addScore('star', ROAD, s.x, s.y, 'Csillag');
        this.events.emit('sfx', { id: 'star' });
      }
    }
    if (p.x >= R.finishX) this.finishDrive();
  }

  /** A futószalag viszi az ajándékokat; a végén a sor végére állnak vissza (körbe jár). Áramszünetben áll. */
  private moveBelt(dt: number): void {
    // áramszünetben is megy a szalag (csak sötét lesz)
    const F = this.factory;
    const B = this.tuning.belt;
    for (const it of this.pack.sack) {
      if (it.beltX === WAITING) continue;
      it.beltX += B.speed * dt;
      // a végén leesik a kupacba, onnan a manók újra felrakják
      if (it.beltX > F.beltEnd) {
        it.beltX = WAITING;
        this.pack.sack.push(...this.pack.sack.splice(this.pack.sack.indexOf(it), 1));
      }
    }
    this.updateElves(dt);
  }

  /**
   * A manók a szalag túloldalán dolgoznak: a bal szélen lévő nagy kupachoz futnak, kézbe
   * veszik a következő tárgyat, elviszik a szalag egy szabad pontjára, és leteszik (hardban gyorsan).
   */
  private updateElves(dt: number): void {
    const F = this.factory;
    const B = this.tuning.belt;
    const E = this.tuning.elves;
    const speed = this.mode.hard ? E.speedHard : E.speed;
    const pickX = F.pile.x + 46;
    for (const e of this.elves) {
      if (e.wait > 0) {
        e.wait -= dt;
        continue;
      }
      if (e.item < 0) {
        // a következő tárgy a kupacból: odafut érte
        const next = this.pack.sack.find((it) => it.beltX === WAITING && !this.elves.some((o) => o.item === it.id));
        if (!next) continue;
        e.item = next.id;
        e.carry = false;
        e.tx = pickX + this.rng.range(0, 20);
      }
      if (e.dropT > 0) {
        e.dropT -= dt;
        if (e.dropT > 0) continue;
        if (!e.carry) {
          // felvette: viszi a szalag egy pontjára
          e.carry = true;
          e.tx = this.rng.range(F.beltStart + 80, F.beltEnd - 180);
          continue;
        }
        const it = this.pack.sack.find((x) => x.id === e.item);
        if (it) it.beltX = e.x;
        e.item = -1;
        e.carry = false;
        e.wait = this.mode.hard ? E.pauseHard : E.pause;
        continue;
      }
      const d = e.tx - e.x;
      if (Math.abs(d) > 3) {
        e.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
        continue;
      }
      if (!e.carry) e.dropT = 0.3;
      // csak szabad helyre teszi le
      else if (this.pack.sack.some((it) => it.beltX !== WAITING && Math.abs(it.beltX - e.x) < B.gap * 0.6))
        e.tx = clampTo(e.x + (this.rng.chance(0.5) ? 60 : -60), F.beltStart + 80, F.beltEnd - 180);
      else e.dropT = 0.3;
    }
  }

  /** a szán első szabad helye (középről kifelé), vagy -1 */
  private freePackSlot(): number {
    return this.street.slotOrder.find((i) => !this.pack.sled.some((p) => p.slot === i)) ?? -1;
  }

  /**
   * Programozott pakolás (robot, tesztek): a szalagról az ajándék a szán, az eszköz az
   * eszközláda első szabad helyére (a zseblámpa a Mikuláshoz).
   */
  packAdd(id: number): void {
    if (this.phase !== 'pack') return;
    const i = this.pack.sack.findIndex((p) => p.id === id);
    if (i < 0) return;
    const it = this.pack.sack[i];
    if (it.tool === 'flashlight') {
      this.pack.sack.splice(i, 1);
      this.player.flashlight = true;
      return;
    }
    const slot = it.gift ? this.freePackSlot() : this.freeBoxSlot();
    if (slot < 0) return;
    this.pack.sack.splice(i, 1);
    it.slot = slot;
    (it.gift ? this.pack.sled : this.pack.box).push(it);
    this.events.emit('sfx', { id: 'pack' });
  }

  /** az eszközláda első szabad helye, vagy -1 */
  private freeBoxSlot(): number {
    return this.factory.boxSlots.findIndex((_, i) => !this.pack.box.some((p) => p.slot === i));
  }

  packRemove(id: number): void {
    if (this.phase !== 'pack') return;
    const i = this.pack.sled.findIndex((p) => p.id === id);
    if (i < 0) return;
    const [it] = this.pack.sled.splice(i, 1);
    it.slot = -1;
    this.pack.sack.push(it);
    this.events.emit('sfx', { id: 'unpack' });
  }

  packDone(): void {
    if (this.phase === 'pack') this.phases.goto('drive');
  }

  /** A szánút vége: beérkezés a faluba. */
  finishDrive(): void {
    if (this.phase === 'drive') this.phases.goto('deliver');
  }

  /** Időbónusz (vagy -levonás) az éjszaka órájához. */
  extraTime(seconds: number): void {
    if (seconds === 0 || this.over || this.phase === 'result') return;
    this.clock = Math.max(0, this.clock + seconds);
    this.events.emit('time', { seconds });
  }

  /** Hány darab kell még az adott ajándékból a szánra. */
  packNeed(gift: GiftId): number {
    const need = this.level.houses.filter((h) => h.wish === gift).length;
    return need - this.pack.sled.filter((p) => p.gift === gift).length;
  }

  /** Hány darab van már az eszközládában az adott eszközből. */
  boxCount(tool: PackTool): number {
    return this.pack.box.filter((p) => p.tool === tool).length;
  }

  /** Pakolás vége: ami a kézben maradt, vissza a szalagra; a szán megrakása (egyszer). */
  private loadSled(): void {
    if (this.sledLoaded) return;
    this.sledLoaded = true;
    const p = this.player;
    if (this.pack.held) {
      this.pack.held.slot = -1;
      this.pack.sack.push(this.pack.held);
      this.pack.held = null;
      p.hand.take();
      p.handFrom = -1;
    }
    for (const it of this.pack.box) if (it.tool && it.tool !== 'flashlight') this.toolStock[it.tool]++;
    // az eszközasztal csak annyi széles, ahány féle eszközt hoztunk: a helyek középre igazítva
    const ts = this.street.toolSlots;
    const kinds = (['candy', 'bone', 'fish', 'bell'] as const).filter((k) => this.toolStock[k] > 0);
    kinds.forEach((k, i) => (ts[k].x = this.street.plazaX + (i - (kinds.length - 1) / 2) * 100));
    this.layOutGifts();
  }

  /** A szánra pakolt ajándékok a helyükre kerülnek, és címkét kapnak: melyik házé. */
  private layOutGifts(): void {
    const slots = this.street.giftSlots;
    // ahová a pakolásnál tették
    this.sledItems = this.pack.sled.map((p) => ({
      id: p.id,
      gift: p.gift!,
      tag: -1,
      slot: p.slot,
      x: slots[p.slot].x,
      y: slots[p.slot].y,
      taken: false,
      gone: false,
    })) as SledItem[];
    for (const h of this.houses) {
      const it = this.sledItems.find((s) => s.tag < 0 && s.gift === h.def.wish);
      if (it) it.tag = h.idx;
    }
  }

  /** Hány darab van még a szánon az adott ajándékból. */
  sledCount(gift: GiftId): number {
    return this.sledItems.filter((s) => s.gift === gift && !s.taken && !s.gone).length;
  }

  /** A kézben lévő ajándék címkéje (melyik házé), vagy -1. */
  get handTag(): number {
    return this.sledItems.find((s) => s.id === this.player.handFrom)?.tag ?? -1;
  }

  /** Szabad-e a szán adott helye (a kézben lévő ajándék régi helye is szabadnak számít). */
  slotFree(i: number): boolean {
    return !this.sledItems.some((x) => x.slot === i && !x.taken && !x.gone);
  }

  /** Egy ajándékot a szán egy helyére tesz (ha a kért hely foglalt, a legközelebbi szabadra). */
  placeOnSled(it: SledItem, slot = it.slot): void {
    const order = this.street.slotOrder;
    const s = this.slotFree(slot) ? slot : (order.find((i) => this.slotFree(i)) ?? it.slot);
    it.slot = s;
    it.x = this.street.giftSlots[s].x;
    it.y = this.street.giftSlots[s].y;
    it.taken = false;
  }

  /** A kézben lévő tárgyat visszateszi (ajándék a szánra, szaloncukor az eszközládába). */
  private returnHand(slot?: number): void {
    const p = this.player;
    const item = p.hand.take();
    if (item === 'candy') this.toolStock.candy++;
    else if (item) {
      const s = this.sledItems.find((x) => x.id === p.handFrom);
      if (s) this.placeOnSled(s, slot ?? s.slot);
    }
    p.handFrom = -1;
  }

  private onPhase(to: Phase): void {
    if (to === 'drive') {
      this.loadSled();
      const p = this.player;
      p.zone = ROAD;
      p.x = this.road.start.x;
      p.y = this.road.start.y;
      p.vx = p.vy = 0;
      p.busy = 0;
      p.hand.take();
      this.driveSpeed = this.tuning.drive.speed * 0.5;
      this.say('drive', {}, 'hint');
      this.events.emit('zone', { zone: ROAD, via: 'road' });
    } else if (to === 'deliver') {
      this.loadSled();
      const p = this.player;
      // a Mikulás a szánnal együtt az utcára
      p.zone = STREET;
      p.x = this.street.sledCenter.x + 90;
      p.y = this.street.laneBottom;
      p.vx = p.vy = 0;
      p.busy = 0;
      this.events.emit('zone', { zone: STREET, via: 'sled' });
    } else if (to === 'dawn') {
      this.say('dawn', {}, 'warn');
      this.events.emit('sfx', { id: 'dawn' });
    } else if (to === 'result') {
      this.finish();
    }
    this.events.emit('phase', { phase: to });
  }

  private finish(): void {
    if (this.over) {
      this.result = {
        levelId: this.level.id,
        happy: 0,
        total: this.houses.length,
        ratio: 0,
        stars: 0,
        score: 0,
        statuses: this.houses.map((h) => h.status),
        gameOver: this.over.reason,
      };
      return;
    }
    for (const h of this.houses)
      if (h.status === 'happy' && h.child.meter.peak <= this.tuning.child.quietLimit)
        this.addScore('quiet', h.idx, 0, 0, `Csendes bónusz: ${h.def.child}`);
    const happy = this.happyCount;
    const total = this.houses.length;
    this.result = {
      levelId: this.level.id,
      happy,
      total,
      ratio: happy / total,
      stars: starsFor(happy / total, this.level.stars),
      score: this.score.total,
      statuses: this.houses.map((h) => h.status),
    };
  }

  // ---------- fő ciklus ----------

  /** Elveszett a pálya: rövid jelenet (pl. a háziak kiszaladnak), utána az eredmény. */
  gameOver(reason: GameOverReason, car = -1): void {
    if (this.over || this.phase === 'result') return;
    this.over = { reason, t: 0, car };
    const p = this.player;
    this.target = this.toolTarget = null;
    if (reason === 'time' && p.zone !== STREET) {
      // a jelenet az utcán játszódik
      p.zone = STREET;
      p.x = this.street.sledCenter.x + 90;
      p.y = this.street.laneBottom;
      this.events.emit('zone', { zone: STREET, via: 'caught' });
    }
    p.vx = p.vy = 0;
    p.speed01 = 0;
    this.events.emit('gameOver', { reason });
    this.events.emit('sfx', { id: reason === 'time' ? 'scream' : reason === 'police' ? 'cuff' : 'krampusCatch' });
  }

  /** Egy gyalogos rendőr elkapta: megbilincselik, beültetik az autóba, és elviszik. */
  arrest(car: number): void {
    this.gameOver('police', car);
  }

  /** Fogy az éjszaka ideje; az utolsó másodpercekben hajnalodik, ha lejár: vége. */
  private tickClock(dt: number): void {
    if (this.clockFrozen) return;
    this.clock = Math.max(0, this.clock - dt);
    if (this.phase === 'deliver' && this.clock <= this.tuning.clock.dawnWarn) this.phases.goto('dawn');
    if (this.clock <= 0) this.gameOver('time');
  }

  update(dt: number, input: InputFrame): void {
    const ph = this.phase;
    if (ph === 'result') return;
    if (this.over) {
      this.over.t += dt;
      if (this.over.t >= this.tuning.clock.gameOverDelay[this.over.reason]) this.phases.goto('result');
      return;
    }
    this.tickClock(dt);
    if (this.over) return;
    if (ph === 'drive') {
      this.updateDrive(dt, input);
      this.target = this.toolTarget = null;
      this.phases.update(dt);
      return;
    }
    if (ph === 'pack') {
      this.hint('start');
      updateStorm(this, dt);
      this.moveBelt(dt);
      if (this.launchT > 0) {
        this.launchT -= dt;
        this.target = this.toolTarget = null;
        if (this.launchT <= 0) this.packDone();
        return;
      }
      if (this.launchP > 0) {
        // tolja a szánt: minden gombnyomás tovább viszi; a végén felugrik, és kigördülnek
        const S = this.factory.sled;
        const [label, ic] = LABELS.launch;
        this.target = { kind: 'launch', x: S.x - 26 + this.launchP * this.tuning.pushDist, y: S.y + S.h / 2, house: -1, label, icon: ic };
        this.toolTarget = null;
        if (input.interact) {
          this.launchP = Math.min(1, this.launchP + 1 / this.tuning.pushes);
          this.events.emit('sfx', { id: 'push' });
          if (this.launchP >= 1) {
            this.launchT = this.tuning.launch;
            this.events.emit('sfx', { id: 'launch' });
          }
        }
        return;
      }
      this.updatePlayer(dt, input);
      this.target = this.findTarget();
      this.toolTarget = null;
      return;
    }
    if (!this.clockFrozen) {
      this.deliverT += dt;
      if (ph === 'deliver') for (const e of this.director.update(this.deliverT)) this.fire(e);
    }

    this.updatePlayer(dt, input);
    this.updateLamp(dt);
    for (const h of this.houses) {
      updateChild(h, dt, this);
      if (h.grandpa) updateGrandpa(h, dt, this);
      if (h.dog) updateDog(h, dt, this);
      if (h.cat) updateCat(h, dt, this);
    }
    this.updateSnowballs(dt);
    updateKrampus(this, dt);
    updateStrays(this, dt);
    updatePolice(this, dt);
    if (this.fog > 0) {
      this.fog -= dt;
      if (this.fog <= 0) this.say('fogEnd', {}, 'info');
    }
    if (this.blizzard > 0) {
      this.blizzard -= dt;
      if (this.blizzard <= 0) this.say('blizzardEnd', {}, 'info');
    }
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i];
      if (g.kind === 'bell' && (g.ttl -= dt) <= 0) this.ground.splice(i, 1);
    }
    if (this.pendingCount === 0 && !this.allDoneSaid && this.phase === 'deliver') {
      this.allDoneSaid = true;
      this.say('allDone', {}, 'good');
    }
    this.target = this.findTarget();
    this.toolTarget = this.findToolTarget();
    if (this.nearHouseWithGift()) this.hint('nearHouse');
  }

  private updatePlayer(dt: number, input: InputFrame): void {
    const p = this.player;
    const T = this.tuning.player;
    p.quiet = input.quiet;
    if (!isHouse(p.zone)) p.closet = -1;
    p.hidden = isHouse(p.zone) && (input.hide || p.closet >= 0);
    p.grace = Math.max(0, p.grace - dt);
    p.slipT = Math.max(0, p.slipT - dt);
    if (p.busy > 0 || p.closet >= 0) {
      p.busy = Math.max(0, p.busy - dt);
      p.vx = p.vy = 0;
      p.speed01 = 0;
      // a szekrényből a gombbal ki lehet bújni
      if (p.busy <= 0 && p.closet >= 0 && input.interact) this.interact();
      return;
    }
    const inHouse = isHouse(p.zone);
    const inFactory = p.zone === FACTORY;
    const full = inHouse || inFactory ? T.speedHouse : T.speedStreet;
    const onIce =
      p.zone === STREET &&
      this.street.obstacles.some((o) => o.slippery && (o.poly ? pointInPolygon(p.x, p.y, o.poly) : pointInRect(p.x, p.y, o.rect)));
    const slippery = (p.zone === STREET && (this.blizzard > 0 || onIce)) || (inFactory && inPuddle(this.storm, p.x, p.y));
    // a jégen rohanva elcsúszik (csendben-módban nem)
    if (onIce && !p.quiet && Math.hypot(p.vx, p.vy) > full * T.slipFast) p.iceT += dt;
    else p.iceT = Math.max(0, p.iceT - dt * 2);
    if (p.iceT > T.slipAfter) {
      this.slip();
      return;
    }
    const speed =
      full * (p.hidden ? T.hideFactor : p.quiet ? T.quietFactor : 1) * (slippery ? this.tuning.blizzard.speedFactor : 1);
    const tx = input.mx * speed;
    const ty = input.my * speed;
    const a = Math.min(1, (slippery ? T.accelSlippery : T.accel) * dt);
    p.vx += (tx - p.vx) * a;
    p.vy += (ty - p.vy) * a;
    const pos = { x: p.x, y: p.y };
    if (inHouse) {
      const it = this.houses[p.zone].interior;
      moveCircle(pos, T.radiusHouse, p.vx * dt, p.vy * dt, it.solids, it.bounds);
    } else if (inFactory) {
      moveCircle(pos, T.radiusHouse, p.vx * dt, p.vy * dt, this.factory.solids, this.factory.bounds);
    } else {
      moveCircle(pos, T.radiusStreet, p.vx * dt, p.vy * dt, this.street.solids, this.street.bounds);
      // zörgő kuka: ha gyorsan nekimegy
      p.bumpCd = Math.max(0, p.bumpCd - dt);
      if (p.bumpCd <= 0 && !p.quiet && Math.hypot(p.vx, p.vy) > full * 0.5) {
        const r = T.radiusStreet + 2;
        const bin = this.street.obstacles.find(
          (o) => o.noisy && pos.x > o.rect.x - r && pos.x < o.rect.x + o.rect.w + r && pos.y > o.rect.y - r && pos.y < o.rect.y + o.rect.h + r,
        );
        if (bin) {
          p.bumpCd = this.tuning.binCooldown;
          this.emitNoise(STREET, pos.x, pos.y, this.tuning.noise.bin, 'bin');
        }
      }
    }
    p.x = pos.x;
    p.y = pos.y;
    const sp = Math.hypot(p.vx, p.vy);
    p.speed01 = Math.min(1, sp / full);
    if (sp > 8) p.dir = Math.atan2(p.vy, p.vx);

    if (inHouse && p.speed01 > 0.05) {
      const h = this.houses[p.zone];
      const N = this.tuning.noise;
      const soft = p.quiet || p.hidden;
      this.emitNoise(h.idx, p.x, p.y, (p.hidden ? N.stepQuiet * 0.5 : soft ? N.stepQuiet : N.step) * p.speed01 * dt, 'step');
      // nyikorgó padlólap
      const idx = h.interior.creaks.findIndex((c) => pointInRect(p.x, p.y, c));
      if (idx >= 0 && idx !== p.creak) this.emitNoise(h.idx, p.x, p.y, soft ? N.creakQuiet : N.creak, 'creak');
      p.creak = idx;
    } else if (!inHouse) p.creak = -1;

    if (p.handFrom >= 0 && !p.putBackArmed) {
      const it = this.sledItems.find((x) => x.id === p.handFrom);
      if (!it || p.zone !== STREET || Math.hypot(p.x - it.x, p.y - it.y) > 70) p.putBackArmed = true;
    }
    if (input.interact) this.interact();
    if (input.tool) this.useTool();
  }

  /** Sötét házban a zseblámpa a nézési irányba világít: ha egy alvó arcába világít, felébreszti. */
  private updateLamp(dt: number): void {
    const p = this.player;
    if (!isHouse(p.zone) || !p.flashlight) return;
    const h = this.houses[p.zone];
    if (!h.dark) return;
    const L = this.tuning.light;
    const cone = { x: p.x, y: p.y - 20, dir: p.dir, halfAngle: L.half, range: L.range };
    for (const c of sleepersOf(h))
      if (!childAwake(c) && inDark(h, c.x, c.y) && sees(cone, c.x, c.y, h.interior.blockers)) hearSleeper(h, c, L.wake * dt, this);
  }

  // ---------- zaj ----------

  /** Elcsúszás a jégen: kicsit tovább csúszik, elesik, zajt csap, és ami a kezében volt, leesik. */
  private slip(): void {
    const p = this.player;
    const T = this.tuning.player;
    p.iceT = 0;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const pos = { x: p.x, y: p.y };
    moveCircle(pos, T.radiusStreet, (p.vx / sp) * T.slipSlide, (p.vy / sp) * T.slipSlide, this.street.solids, this.street.bounds);
    p.x = pos.x;
    p.y = pos.y;
    const item = p.hand.take();
    if (item) {
      const dx = (p.vx / sp) * 34;
      const dy = (p.vy / sp) * 34;
      if (item === 'candy') this.ground.push({ kind: 'candy', zone: STREET, x: p.x + dx, y: p.y + dy, ttl: Infinity });
      else if (p.handFrom >= 0) this.ground.push({ kind: 'gift', zone: STREET, x: p.x + dx, y: p.y + dy, ttl: Infinity, item: p.handFrom });
      p.handFrom = -1;
    }
    p.slipT = T.slipTime;
    this.busy(T.slipTime, 'slip');
    this.emitNoise(STREET, p.x, p.y, this.tuning.noise.slip, 'slip');
    this.events.emit('sfx', { id: 'slip' });
    this.say('slip', {}, 'bad');
  }

  emitNoise(zone: number, x: number, y: number, amount: number, kind: string): void {
    amount *= this.level.noiseScale;
    const N = this.tuning.noise;
    if (zone === STREET) {
      for (const h of this.houses) {
        const d = Math.hypot(h.street.door.x - x, h.street.door.y - y);
        const eff = amount * N.streetFactor * Math.max(0, 1 - d / N.streetRadius);
        if (eff > 0) hearChild(h, eff, this);
      }
    } else {
      const h = this.houses[zone];
      const gp = h.grandpa;
      // a szóló tévé elnyomja a zajok egy részét
      const tvMask = gp?.kind === 'tv' && gp.mode === 'awake' ? this.tuning.tv.mask : 1;
      const n = { zone, x, y, amount: amount * tvMask, radius: N.houseRadius, minFactor: N.houseMinFactor };
      // az alvó saját szobájában keltett zaj sokkal jobban hallatszik
      for (const c of sleepersOf(h)) {
        const f = pointInRect(x, y, c.room) ? N.kidRoomFactor : 1;
        hearSleeper(h, c, noiseEffect(n, c.x, c.y) * f, this);
      }
      if (gp && kind !== 'step') hearElder(gp, this, noiseEffect(n, gp.x, gp.y), x, y);
    }
    if (kind === 'bark' && zone === STREET) policeHear(this, x, y);
    if (kind !== 'step') this.events.emit('noise', { zone, x, y, amount, kind });
  }

  // ---------- lebukás ----------

  caught(h: HouseState, by: 'child' | 'grandpa'): void {
    if (h.status === 'lost') return;
    const p = this.player;
    const x = p.x;
    const y = p.y;
    if (h.status === 'happy') {
      this.addScore('giftRevoked', h.idx, x, y, 'Ajándék elveszett');
      if (h.fastBonus) this.addScore('fastRevoked', h.idx, x, y, 'Gyors bónusz elveszett');
    }
    h.status = 'lost';
    h.gift = null;
    this.addScore('caught', h.idx, x, y, 'Lebukás');
    this.say(by === 'grandpa' ? 'caughtGrandpa' : 'caught', { child: h.def.child }, 'bad');
    this.events.emit('caught', { house: h.idx });
    this.events.emit('sfx', { id: 'caught' });
    // kidobjuk az utcára
    p.zone = STREET;
    p.x = h.street.door.x;
    p.y = h.street.door.y + (h.street.top ? 18 : -18);
    p.vx = p.vy = 0;
    p.busy = this.tuning.actions.caught;
    p.busyKind = 'caught';
    this.events.emit('zone', { zone: STREET, via: 'caught' });
  }

  // ---------- director ----------

  private fire(e: PlannedEvent): void {
    const pickOf = <T>(arr: T[]): T | undefined => (arr.length ? arr[Math.floor(e.roll * arr.length)] : undefined);
    const alive = this.houses.filter((h) => h.status !== 'lost');
    const n = (h: HouseState) => ({ n: h.idx + 1, child: h.def.child, owner: h.def.owner });
    switch (e.id as EventId) {
      case 'dogBark': {
        const h = pickOf(alive.filter((h) => h.dog && h.dog.mode === 'alert'));
        if (!h) return;
        h.dog!.queue = 3;
        this.say('dogBark', n(h), 'warn');
        break;
      }
      case 'childToss': {
        const h = pickOf(alive.filter((h) => !childAwake(h.child)));
        if (!h) return;
        this.say('childToss', n(h), 'warn');
        hearSleeper(h, h.child, this.tuning.toss * this.level.noiseScale, this);
        break;
      }
      case 'grandpaWake': {
        const h = pickOf(alive.filter((h) => h.grandpa?.mode === 'dozing' || h.grandpa?.mode === 'knit'));
        if (!h) return;
        wakeGrandpa(h.grandpa!, this, 12);
        this.say('grandpaWake', n(h), 'warn');
        break;
      }
      // az időjárás váltakozik: egyszerre csak egy
      case 'fog':
        if (this.fog > 0 || this.blizzard > 0) return;
        this.fog = this.tuning.fog.duration;
        this.say('fog', {}, 'warn');
        break;
      case 'blizzard':
        if (this.blizzard > 0 || this.fog > 0) return;
        this.blizzard = this.tuning.blizzard.duration;
        this.say('blizzard', {}, 'warn');
        this.events.emit('sfx', { id: 'wind' });
        break;
      case 'krampus':
        spawnKrampus(this, e.roll);
        break;
    }
  }

  // ---------- interakció ----------

  private findTarget(): Target | null {
    const p = this.player;
    if (p.busy > 0 || this.phase === 'result' || this.over) return null;
    const R = this.tuning.interactRadius;
    let best: Target | null = null;
    let bestD = Infinity;
    const consider = (kind: TargetKind, x: number, y: number, house: number, r = R, extra: Partial<Target> = {}): void => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < r && d < bestD) {
        bestD = d;
        const [label, ic] = LABELS[kind];
        best = { kind, x, y, house, label, icon: ic, ...extra };
      }
    };
    if (this.phase === 'pack') {
      if (p.zone !== FACTORY) return null;
      const F = this.factory;
      const held = this.pack.held;
      const ic = (it: PackItem) => icon((it.gift ?? it.tool)!);
      if (!held) {
        // a szalagról (ami épp előtte halad), vagy le a szánról / az eszközládából
        for (const it of this.pack.sack)
          if (it.beltX >= F.beltStart && it.beltX <= F.beltEnd) consider('packTake', it.beltX, F.beltY, -1, 62, { item: it.id, icon: ic(it) });
        for (const it of this.pack.sled) consider('packTake', F.slots[it.slot].x, F.slots[it.slot].y, -1, 46, { item: it.id, icon: ic(it) });
        for (const it of this.pack.box) consider('packTake', F.boxSlots[it.slot].x, F.boxSlots[it.slot].y, -1, 52, { item: it.id, icon: ic(it) });
      } else if (held.gift) {
        F.slots.forEach((sp, i) => {
          if (!this.pack.sled.some((x) => x.slot === i)) consider('packPut', sp.x, sp.y, -1, 46, { slot: i });
        });
      } else {
        F.boxSlots.forEach((sp, i) => {
          if (!this.pack.box.some((x) => x.slot === i)) consider('packPutTool', sp.x, sp.y, -1, 52, { slot: i });
        });
      }
      // indulás: a szán végénél megtolja
      if (!held) consider('launch', F.sled.x - 26, F.sled.y + F.sled.h / 2, -1, 46);
      // vissza a szalagra (ami nem kell)
      if (held && p.y < F.belt.y + F.belt.h + 60)
        consider('packReturn', Math.max(F.beltStart, Math.min(F.beltEnd, p.x)), F.beltY, -1, 62);
      return best;
    }
    if (p.zone === STREET) {
      const hs = this.street.homeSpot;
      consider('goHome', hs.x, hs.y, -1, this.tuning.sledRadius);
      // ajándékok a szánon: felvétel vagy csere; a saját üres helyére visszatehető
      for (const it of this.sledItems) {
        if (it.gone || it.taken) continue;
        consider('takeGift', it.x, it.y, it.tag, 34, { item: it.id, icon: icon(it.gift) });
      }
      // a kézben lévő ajándék a szán bármelyik szabad helyére visszatehető
      if (p.handFrom >= 0 && p.putBackArmed && p.hand.item !== 'candy')
        this.street.giftSlots.forEach((sp, i) => {
          if (this.slotFree(i)) consider('putBack', sp.x, sp.y, -1, 34, { slot: i });
        });
      // az eszközládából: eszköz a zsebbe, szaloncukor a kézbe
      const ts = this.street.toolSlots;
      for (const tool of TOOLS)
        if (this.toolStock[tool] > 0 && !p.pocket.full) consider('takeTool', ts[tool].x, ts[tool].y, -1, 40, { tool, icon: icon(tool) });
      if (p.hand.empty && this.toolStock.candy > 0) consider('candy', ts.candy.x, ts.candy.y, -1, 40);
      else if (p.hand.item === 'candy') consider('putBack', ts.candy.x, ts.candy.y, -1, 40, { icon: '🍬' });
      for (const h of this.houses) {
        const st = h.street;
        if (h.status === 'lost') {
          consider('locked', st.door.x, st.door.y, h.idx);
          continue;
        }
        consider('door', st.door.x, st.door.y, h.idx);
        consider('chimney', st.ladder.x, st.ladder.y, h.idx);
      }
      for (const g of this.ground) {
        if (g.zone !== STREET || !p.hand.empty) continue;
        if (g.kind === 'candy') consider('pickCandy', g.x, g.y, -1);
        if (g.kind === 'gift') {
          const it = this.sledItems.find((x) => x.id === g.item);
          if (it) consider('pickGift', g.x, g.y, it.tag, R, { item: it.id, icon: icon(it.gift) });
        }
      }
      // az ajándék bárhol letehető az utcára, és később felvehető
      if (!best && p.handFrom >= 0 && p.hand.item && p.hand.item !== 'candy') {
        const [label, ic] = LABELS.dropGift;
        return { kind: 'dropGift', x: p.x, y: p.y, house: -1, label, icon: ic };
      }
    } else {
      const h = this.houses[p.zone];
      const it = h.interior;
      const hand = p.hand.item;
      // szekrényből csak kibújni lehet
      if (p.closet >= 0) {
        const [label, ic] = LABELS.closetOut;
        return { kind: 'closetOut', x: p.x, y: p.y, house: h.idx, label, icon: ic };
      }
      it.closets.forEach((c, i) => consider('closetIn', c.front.x, c.front.y, h.idx, 50, { item: i }));
      if (hand && hand !== 'candy' && h.status === 'pending' && !h.gift)
        consider('tree', it.treeSpot.x, it.treeSpot.y, h.idx, 64, hand === h.def.wish ? {} : { icon: '⚠️' });
      consider('exitDoor', it.doorSpot.x, it.doorSpot.y, h.idx, 54);
      consider('exitChimney', it.fireSpot.x, it.fireSpot.y, h.idx, 58);
    }
    return best;
  }

  /** Az eszköz-gomb célpontja: csont a kutyának, hal a macskának, csengő, ledobott szaloncukor. */
  private findToolTarget(): Target | null {
    const p = this.player;
    if (p.busy > 0 || this.over) return null;
    let best: Target | null = null;
    let bestD = Infinity;
    const consider = (kind: TargetKind, x: number, y: number, house: number, r: number, extra: Partial<Target> = {}): void => {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < r && d < bestD) {
        bestD = d;
        const [label, ic] = LABELS[kind];
        best = { kind, x, y, house, label, icon: ic, ...extra };
      }
    };
    const tool = p.pocket;
    if (p.zone === STREET) {
      if (tool.has('bone')) {
        for (const h of this.houses) if (h.dog?.mode === 'alert' && h.status !== 'lost') consider('feedDog', h.dog.x, h.dog.y, h.idx, 90);
        this.strays.forEach((d, i) => {
          if (d.mode !== 'calm') consider('feedStray', d.x, d.y, -1, 80, { item: i });
        });
      }
      if (!best && p.hand.item === 'candy') {
        const [label, ic] = LABELS.dropCandy;
        return { kind: 'dropCandy', x: p.x, y: p.y, house: -1, label, icon: ic };
      }
      // hógolyó: arra dobja, amerre néz (zajjal elcsalja a rendőröket, a Krampuszt)
      if (!best && p.snowballs > 0 && (this.phase === 'deliver' || this.phase === 'dawn')) {
        const [label, ic] = LABELS.snowball;
        const R = this.tuning.snowball.range;
        return { kind: 'snowball', x: p.x + Math.cos(p.dir) * R, y: p.y + Math.sin(p.dir) * R, house: -1, label, icon: ic };
      }
    } else if (isHouse(p.zone)) {
      const h = this.houses[p.zone];
      if (tool.has('fish') && h.cat && h.cat.mode !== 'fed') consider('feedCat', h.cat.x, h.cat.y, h.idx, 100);
      if (!best && tool.has('bell') && h.grandpa) {
        const [label, ic] = LABELS.bell;
        return { kind: 'bell', x: p.x, y: p.y, house: h.idx, label, icon: ic };
      }
    }
    return best;
  }

  /** Repülő hógolyók; becsapódáskor zaj: a rendőr és a Krampusz odamegy. */
  private updateSnowballs(dt: number): void {
    for (let i = this.snowFlights.length - 1; i >= 0; i--) {
      const s = this.snowFlights[i];
      s.t += dt;
      if (s.t < s.T) continue;
      this.snowFlights.splice(i, 1);
      this.emitNoise(STREET, s.x1, s.y1, this.tuning.noise.snowball, 'snowball');
      policeHear(this, s.x1, s.y1);
      const k = this.krampus;
      if (k.active && k.mode === 'walk') {
        k.lureX = s.x1;
        k.lureY = s.y1;
        k.lureT = this.tuning.snowball.lure;
      }
      this.events.emit('snowHit', { x: s.x1, y: s.y1 });
      this.events.emit('sfx', { id: 'snowHit' });
    }
  }

  /** Az eszköz-gomb: a zsebben lévő eszköz (vagy a kézben lévő szaloncukor) használata. */
  useTool(): void {
    const t = this.findToolTarget();
    if (t) this.perform(t);
  }

  private busy(t: number, kind: string): void {
    this.player.busy = t;
    this.player.busyKind = kind;
    this.player.vx = this.player.vy = 0;
  }

  interact(): void {
    const t = this.findTarget();
    if (t) this.perform(t);
  }

  private perform(t: Target): void {
    const p = this.player;
    const A = this.tuning.actions;
    const N = this.tuning.noise;
    const h = t.house >= 0 ? this.houses[t.house] : null;
    switch (t.kind) {
      case 'takeGift': {
        const it = this.sledItems.find((x) => x.id === t.item);
        if (!it) break;
        this.returnHand();
        it.taken = true;
        p.hand.put(it.gift);
        p.handFrom = it.id;
        p.putBackArmed = false;
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'pick' });
        break;
      }
      case 'putBack':
        this.returnHand(t.slot);
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'unpack' });
        break;
      case 'packTake': {
        const fromSack = this.pack.sack.findIndex((x) => x.id === t.item);
        const fromSled = this.pack.sled.findIndex((x) => x.id === t.item);
        const fromBox = this.pack.box.findIndex((x) => x.id === t.item);
        const it =
          fromSack >= 0
            ? this.pack.sack.splice(fromSack, 1)[0]
            : fromSled >= 0
              ? this.pack.sled.splice(fromSled, 1)[0]
              : fromBox >= 0
                ? this.pack.box.splice(fromBox, 1)[0]
                : null;
        if (!it) break;
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'pick' });
        // a zseblámpa rögtön a Mikulásnál marad
        if (it.tool === 'flashlight') {
          p.flashlight = true;
          break;
        }
        it.slot = -1;
        this.pack.held = it;
        if (it.gift) {
          p.hand.put(it.gift);
          p.handFrom = it.id;
        }
        break;
      }
      case 'packPut':
      case 'packPutTool':
      case 'packReturn': {
        const it = this.pack.held;
        if (!it) break;
        this.pack.held = null;
        p.hand.take();
        p.handFrom = -1;
        if (t.kind === 'packPut') {
          if (this.packNeed(it.gift!) > 0) this.extraTime(this.tuning.timeBonus.packGift);
          it.slot = t.slot!;
          this.pack.sled.push(it);
          this.events.emit('sfx', { id: 'pack' });
        } else if (t.kind === 'packPutTool') {
          it.slot = t.slot!;
          this.pack.box.push(it);
          this.events.emit('sfx', { id: 'pack' });
        } else {
          it.slot = -1;
          it.beltX = Math.max(this.factory.beltStart, Math.min(this.factory.beltEnd, p.x));
          this.pack.sack.push(it);
          this.events.emit('sfx', { id: 'unpack' });
        }
        this.busy(A.pick, 'pick');
        break;
      }
      case 'closetIn': {
        const c = h!.interior.closets[t.item!];
        p.closet = t.item!;
        p.x = c.front.x;
        p.y = c.front.y;
        this.busy(A.pick, 'closet');
        this.events.emit('sfx', { id: 'creak' });
        break;
      }
      case 'snowball': {
        p.snowballs--;
        const B = this.street.bounds;
        const x1 = clampTo(t.x, B.x + 10, B.x + B.w - 10);
        const y1 = clampTo(t.y, B.y + 10, B.y + B.h - 10);
        this.snowFlights.push({ x0: p.x, y0: p.y - 20, x1, y1, t: 0, T: this.tuning.snowball.flight });
        this.busy(0.25, 'throw');
        this.events.emit('sfx', { id: 'throw' });
        break;
      }
      case 'launch':
        // nekifeszül a szánnak: innentől a gomb nyomkodásával tolja
        this.launchP = 1 / this.tuning.pushes;
        p.x = this.factory.sled.x - 26;
        p.y = this.factory.sled.y + this.factory.sled.h / 2;
        p.vx = p.vy = 0;
        this.events.emit('sfx', { id: 'push' });
        break;
      case 'closetOut':
        p.closet = -1;
        this.busy(A.pick, 'closet');
        this.events.emit('sfx', { id: 'creak' });
        break;
      case 'takeTool': {
        const tool = t.tool as ToolId;
        if (!p.pocket.put(tool)) break;
        this.toolStock[tool]--;
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'pick' });
        break;
      }
      case 'dropGift':
        p.hand.take();
        this.ground.push({ kind: 'gift', zone: STREET, x: p.x, y: p.y + 8, ttl: Infinity, item: p.handFrom });
        p.handFrom = -1;
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'pick' });
        this.sayOnce('giftDrop', 'giftDrop', {}, 'info');
        break;
      case 'goHome':
        this.phases.goto('result');
        break;
      case 'locked':
        this.say('lost', {}, 'info');
        break;
      case 'door':
      case 'chimney': {
        const viaDoor = t.kind === 'door';
        const it = h!.interior;
        p.zone = h!.idx;
        p.x = viaDoor ? it.doorSpot.x : it.fireSpot.x;
        p.y = viaDoor ? it.doorSpot.y - 16 : it.fireSpot.y + 10;
        p.dir = viaDoor ? -Math.PI / 2 : Math.PI / 2;
        p.creak = -1;
        p.grace = this.tuning.player.entryGrace;
        this.busy(viaDoor ? A.door : A.chimney, viaDoor ? 'door' : 'chimney');
        if (viaDoor) {
          this.emitNoise(h!.idx, p.x, p.y, p.quiet ? N.doorQuiet : N.door, 'door');
          if (h!.dog) bark(h!, this);
        } else this.emitNoise(h!.idx, p.x, p.y, N.chimney, 'chimney');
        this.events.emit('zone', { zone: h!.idx, via: viaDoor ? 'door' : 'chimney' });
        this.hint('inside');
        if (h!.grandpa) this.sayOnce('hideHint', 'hideHint', {}, 'hint');
        break;
      }
      case 'exitDoor':
      case 'exitChimney': {
        const viaDoor = t.kind === 'exitDoor';
        if (viaDoor) {
          this.emitNoise(h!.idx, p.x, p.y, p.quiet ? N.doorQuiet : N.door, 'door');
          if (h!.dog) bark(h!, this);
        } else this.emitNoise(h!.idx, p.x, p.y, N.chimney, 'chimney');
        const st = h!.street;
        const spot = viaDoor ? st.door : st.ladder;
        p.zone = STREET;
        p.x = spot.x;
        p.y = spot.y + (st.top ? 10 : -10);
        p.dir = st.top ? Math.PI / 2 : -Math.PI / 2;
        this.busy(viaDoor ? A.door : A.chimney, viaDoor ? 'door' : 'chimney');
        this.events.emit('zone', { zone: STREET, via: viaDoor ? 'door' : 'chimney' });
        break;
      }
      case 'feedCat':
        p.pocket.take('fish');
        h!.cat!.mode = 'fed';
        this.busy(A.feed, 'feed');
        this.say('catFed', {}, 'good');
        this.events.emit('sfx', { id: 'meow' });
        break;
      case 'feedStray': {
        const d = this.strays[t.item!];
        if (!d) break;
        p.pocket.take('bone');
        calmStray(this, d);
        this.busy(A.feed, 'feed');
        break;
      }
      case 'feedDog':
        p.pocket.take('bone');
        h!.dog!.mode = 'chewing';
        this.busy(A.feed, 'feed');
        this.say('dogFed', {}, 'good');
        break;
      case 'candy':
      case 'pickCandy':
        p.hand.put('candy');
        if (t.kind === 'candy') this.toolStock.candy--;
        if (t.kind === 'pickCandy') {
          const i = this.ground.findIndex((g) => g.kind === 'candy' && g.x === t.x && g.y === t.y);
          if (i >= 0) this.ground.splice(i, 1);
        }
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'pick' });
        break;
      case 'pickGift': {
        const i = this.ground.findIndex((x) => x.kind === 'gift' && x.item === t.item);
        const it = this.sledItems.find((x) => x.id === t.item);
        if (i < 0 || !it) break;
        this.ground.splice(i, 1);
        p.hand.put(it.gift);
        p.handFrom = it.id;
        p.putBackArmed = true;
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'pick' });
        break;
      }
      case 'dropCandy':
        p.hand.take();
        this.ground.push({ kind: 'candy', zone: STREET, x: p.x, y: p.y + 6, ttl: Infinity });
        this.events.emit('sfx', { id: 'pick' });
        break;
      case 'tree': {
        const gift = p.hand.take() as GiftId;
        const placed = this.sledItems.find((x) => x.id === p.handFrom);
        if (placed) placed.gone = true;
        p.handFrom = -1;
        const it = h!.interior;
        h!.gift = gift;
        this.busy(p.quiet ? A.placeQuiet : A.place, 'place');
        this.emitNoise(h!.idx, it.treeSpot.x, it.treeSpot.y, p.quiet ? N.giftQuiet : N.giftDrop, 'gift');
        if (h!.status === 'lost') break; // a ledobás zajára felébredt és meglátott
        if (gift === h!.def.wish) {
          h!.status = 'happy';
          this.addScore('gift', h!.idx, it.treeSpot.x, it.treeSpot.y, 'Helyes ajándék');
          if (this.deliverT < this.level.durations.deliver / 2) {
            h!.fastBonus = true;
            this.addScore('fast', h!.idx, it.treeSpot.x, it.treeSpot.y - 30, 'Gyors bónusz');
          }
          this.say('happy', { child: h!.def.child, gift }, 'good');
          this.events.emit('happy', { house: h!.idx });
          this.events.emit('sfx', { id: 'happy' });
          this.hint('firstHappy');
        } else {
          h!.status = 'sad';
          h!.child.sad = true;
          this.addScore('wrongGift', h!.idx, it.treeSpot.x, it.treeSpot.y, 'Rossz ajándék');
          this.say('wrong', { child: h!.def.child, gift: h!.def.wish }, 'bad');
          this.events.emit('sfx', { id: 'sad' });
        }
        break;
      }
      case 'bell': {
        p.pocket.take('bell');
        const it = h!.interior;
        const bx = clampTo(p.x + Math.cos(p.dir) * 150, it.living.x + 20, it.living.x + it.living.w - 20);
        const by = clampTo(p.y + Math.sin(p.dir) * 150, it.living.y + 20, it.living.y + it.living.h - 20);
        const T = this.tuning.grandpa;
        this.ground.push({ kind: 'bell', zone: h!.idx, x: bx, y: by, ttl: T.bellTime });
        const gp = h!.grandpa!;
        wakeGrandpa(gp, this, T.bellTime + 1);
        gp.distract = T.bellTime;
        gp.distractDir = Math.atan2(by - gp.y, bx - gp.x);
        gp.suspicion = 0;
        this.emitNoise(h!.idx, bx, by, N.bell, 'bell');
        this.events.emit('sfx', { id: 'bell' });
        break;
      }
    }
  }

  /** Ajándékkal a kezében egy ház közelében jár-e (tippekhez). */
  private nearHouseWithGift(): boolean {
    const p = this.player;
    if (p.zone !== STREET || !p.hand.item || p.hand.item === 'candy') return false;
    return this.houses.some((h) => Math.hypot(h.street.door.x - p.x, h.street.door.y - p.y) < 120);
  }
}

const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
