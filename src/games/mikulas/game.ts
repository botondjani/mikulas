import { Rng } from '../../core/rng';
import { PhaseMachine } from '../../core/fsm';
import { Director, planEvents, intensityAt, type PlannedEvent } from '../../core/director';
import { ScoreBook, starsFor } from '../../core/scoring';
import { Emitter } from '../../core/events';
import { Slot } from '../../core/inventory';
import { moveCircle, pointInPolygon, pointInRect } from '../../core/geom';
import { noiseEffect } from '../../core/noise';
import type { InputFrame } from '../../core/input';
import tuningData from './data/tuning.json';
import eventsData from './data/events.json';
import items from './data/items.json';
import {
  STREET,
  FACTORY,
  isHouse,
  GIFTS,
  TOOLS,
  icon,
  type EventId,
  type GiftId,
  type HandItem,
  type HouseDef,
  type LevelDef,
  type Phase,
  type ToolId,
} from './types';
import {
  buildFactory,
  buildInterior,
  buildStreet,
  type FactoryLayout,
  type InteriorLayout,
  type StreetHouse,
  type StreetLayout,
} from './layout';
import { createChild, hearChild, updateChild, childAwake, type ChildState } from './agents/child';
import { createGrandpa, hearElder, updateGrandpa, wakeGrandpa, type GrandpaState } from './agents/grandpa';
import { createDog, updateDog, bark, type DogState } from './agents/dog';
import { createCat, chimneyBlocked, updateCat, type CatState } from './agents/cat';
import { createKrampus, spawnKrampus, updateKrampus, type KrampusState } from './agents/krampus';

export type Tuning = typeof tuningData;
export type CaptionKey = keyof typeof eventsData.captions;
export type HintKey = keyof typeof eventsData.hints;
export type CaptionKind = 'info' | 'warn' | 'bad' | 'good' | 'hint';

export const SCORE_TABLE = {
  gift: 100,
  boot: 30,
  quiet: 50,
  fast: 20,
  wrongGift: -30,
  caught: -50,
  packWrong: -10,
  giftRevoked: -100,
  fastRevoked: -20,
  bootRevoked: -30,
} as const;
export type ScoreKey = keyof typeof SCORE_TABLE;

export interface GameEvents extends Record<string, unknown> {
  caption: { text: string; kind: CaptionKind };
  noise: { zone: number; x: number; y: number; amount: number; kind: string };
  sfx: { id: string };
  score: { points: number; label: string; zone: number; x: number; y: number };
  zone: { zone: number; via: 'door' | 'chimney' | 'caught' | 'sled' };
  phase: { phase: Phase };
  happy: { house: number };
  caught: { house: number };
}

export type HouseStatus = 'pending' | 'happy' | 'sad' | 'lost';

export interface HouseState {
  idx: number;
  def: HouseDef;
  street: StreetHouse;
  interior: InteriorLayout;
  status: HouseStatus;
  gift: GiftId | null;
  bootFilled: boolean;
  fastBonus: boolean;
  child: ChildState;
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
  pocket: Slot<ToolId>;
  /** a kézben lévő ajándék szán-azonosítója (-1, ha nincs) */
  handFrom: number;
  creak: number;
  /** zörgő akadály hangjának várakozása */
  bumpCd: number;
  /** a felvett ajándék csak akkor tehető vissza, ha már eltávolodott a helyétől (ne legyen véletlen) */
  putBackArmed: boolean;
  /** a házban elbújt (virág mögé guggolt): nem látják, de nagyon lassú */
  hidden: boolean;
  /** belépés utáni türelmi idő: még senki sem veheti észre */
  grace: number;
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
  | 'chimneyBlocked'
  | 'feedCat'
  | 'feedDog'
  | 'candy'
  | 'pickCandy'
  | 'pickGift'
  | 'dropCandy'
  | 'locked'
  | 'tree'
  | 'boot'
  | 'exitDoor'
  | 'exitChimney'
  | 'bell';

export interface Target {
  kind: TargetKind;
  x: number;
  y: number;
  house: number;
  label: string;
  icon: string;
  /** szánról felvehető ajándék azonosítója */
  item?: number;
  tool?: ToolId;
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
  gift: GiftId;
  /** a helye a futószalagon (x) */
  beltX: number;
  /** a szán melyik helyén áll (-1: a halomban vagy a kézben) */
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
  boots: number;
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
  chimneyBlocked: ['Foglalt', '🐈'],
  feedCat: ['Hal', '🐟'],
  feedDog: ['Csont', '🦴'],
  candy: ['Felvesz', '🍬'],
  pickCandy: ['Felvesz', '🍬'],
  pickGift: ['Felvesz', '🎁'],
  dropCandy: ['Ledob', '🍬'],
  locked: ['Zárva', '🔒'],
  tree: ['Lerak', '🎁'],
  boot: ['Csizma', '🥾'],
  exitDoor: ['Ki', '🚪'],
  exitChimney: ['Fel', '🪜'],
  bell: ['Dob', '🔔'],
};

export class MikulasGame {
  readonly tuning: Tuning = tuningData;
  readonly rng: Rng;
  readonly street: StreetLayout;
  readonly factory: FactoryLayout;
  readonly houses: HouseState[];
  readonly player: PlayerState;
  readonly phases: PhaseMachine<Phase>;
  readonly director: Director;
  readonly plan: PlannedEvent[];
  readonly score = new ScoreBook<ScoreKey>(SCORE_TABLE);
  readonly events = new Emitter<GameEvents>();
  readonly krampus: KrampusState = createKrampus();
  readonly ground: GroundItem[] = [];
  readonly pack: { sack: PackItem[]; sled: PackItem[]; held: PackItem | null };
  sledItems: SledItem[] = [];
  toolStock: Record<ToolId, number>;
  blizzard = 0;
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
  private toolExplained = new Set<ToolId>();
  private saidOnce = new Set<string>();

  constructor(
    readonly level: LevelDef,
    readonly seed: number,
  ) {
    this.rng = new Rng(seed).fork(2);
    this.captionRng = new Rng(seed).fork(3);
    const layoutRng = new Rng(seed).fork(4);
    this.street = buildStreet(level.houses.length, new Rng(seed).fork(6), level.obstacles);
    this.factory = buildFactory();
    this.houses = level.houses.map((def, idx) => {
      const h = {
        idx,
        def,
        street: this.street.houses[idx],
        interior: buildInterior(layoutRng, def.grandpa ? (def.elder ?? 'grandpa') : null),
        status: 'pending',
        gift: null,
        bootFilled: false,
        fastBonus: false,
      } as unknown as HouseState;
      h.child = createChild(def.child, h.interior.childBed, this);
      if (def.dog) h.dog = createDog(h);
      if (def.cat) h.cat = createCat();
      if (def.grandpa) h.grandpa = createGrandpa(h, this, def.elder ?? 'grandpa');
      return h;
    });
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
      pocket: new Slot<ToolId>(),
      handFrom: -1,
      creak: -1,
      bumpCd: 0,
      putBackArmed: false,
      hidden: false,
      grace: 0,
    };

    // pakolás: a kívánságok és néhány csalitárgy összekeverve a zsákban
    const packRng = new Rng(seed).fork(5);
    const gifts: GiftId[] = level.houses.map((h) => h.wish);
    for (let i = 0; i < level.decoys; i++) gifts.push(packRng.pick(GIFTS));
    // a futószalagra sorban érkeznek (a gépből), egymás után
    const B = this.tuning.belt;
    this.pack = {
      sack: packRng
        .shuffle(gifts.map((gift, id) => ({ id, gift, beltX: 0, slot: -1 })))
        .map((p, i) => ({ ...p, beltX: this.factory.beltStart + 60 - i * B.gap })),
      sled: [],
      held: null,
    };
    this.toolStock = { ...level.tools };

    const d = level.durations;
    this.phases = new PhaseMachine<Phase>(
      [
        { id: 'pack', duration: d.pack, next: 'deliver' },
        { id: 'deliver', duration: d.deliver, next: 'dawn' },
        { id: 'dawn', duration: d.dawn, next: 'result' },
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
  }

  // ---------- pakolás ----------

  /** A futószalag viszi az ajándékokat; a végén a sor végére állnak vissza (körbe jár). */
  private moveBelt(dt: number): void {
    const F = this.factory;
    const B = this.tuning.belt;
    for (const it of this.pack.sack) {
      it.beltX += B.speed * dt;
      if (it.beltX > F.beltEnd) {
        const last = Math.min(F.beltStart, ...this.pack.sack.filter((x) => x !== it).map((x) => x.beltX));
        it.beltX = last - B.gap;
      }
    }
  }

  /** a szán első szabad helye (középről kifelé), vagy -1 */
  private freePackSlot(): number {
    return this.street.slotOrder.find((i) => !this.pack.sled.some((p) => p.slot === i)) ?? -1;
  }

  /** Programozott pakolás (robot, tesztek): a halomból a szán első szabad helyére. */
  packAdd(id: number): void {
    if (this.phase !== 'pack') return;
    const i = this.pack.sack.findIndex((p) => p.id === id);
    const slot = this.freePackSlot();
    if (i < 0 || slot < 0) return;
    const [it] = this.pack.sack.splice(i, 1);
    it.slot = slot;
    this.pack.sled.push(it);
    this.events.emit('sfx', { id: 'pack' });
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
    if (this.phase === 'pack') this.phases.goto('deliver');
  }

  /** Hány darab kell még az adott ajándékból a szánra. */
  packNeed(gift: GiftId): number {
    const need = this.level.houses.filter((h) => h.wish === gift).length;
    return need - this.pack.sled.filter((p) => p.gift === gift).length;
  }

  /** A szánra pakolt ajándékok a helyükre kerülnek, és címkét kapnak: melyik házé. */
  private layOutGifts(): void {
    const slots = this.street.giftSlots;
    // ahová a pakolásnál tették
    this.sledItems = this.pack.sled.map((p) => ({
      id: p.id,
      gift: p.gift,
      tag: -1,
      slot: p.slot,
      x: slots[p.slot].x,
      y: slots[p.slot].y,
      taken: false,
      gone: false,
    }));
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

  /** A kézben lévő tárgyat visszateszi (ajándék a szánra, szaloncukor a zsákba). */
  private returnHand(slot?: number): void {
    const p = this.player;
    const item = p.hand.take();
    if (item && item !== 'candy') {
      const s = this.sledItems.find((x) => x.id === p.handFrom);
      if (s) this.placeOnSled(s, slot ?? s.slot);
    }
    p.handFrom = -1;
  }

  private onPhase(to: Phase): void {
    if (to === 'deliver') {
      // ami a pakolás végén a kézben maradt, visszakerül a szalagra
      const p = this.player;
      if (this.pack.held) {
        this.pack.held.slot = -1;
        this.pack.sack.push(this.pack.held);
        this.pack.held = null;
        p.hand.take();
        p.handFrom = -1;
      }
      this.layOutGifts();
      // a Mikulás a szánnal együtt az utcára
      p.zone = STREET;
      p.x = this.street.sledCenter.x + 90;
      p.y = this.street.laneBottom;
      p.vx = p.vy = 0;
      p.busy = 0;
      this.events.emit('zone', { zone: STREET, via: 'sled' });
      for (const g of GIFTS) {
        const extra = -this.packNeed(g);
        for (let i = 0; i < extra; i++)
          this.addScore('packWrong', STREET, this.street.sledCenter.x, this.street.sledCenter.y, eventsData.pack.wrong);
      }
    } else if (to === 'dawn') {
      this.say('dawn', {}, 'warn');
      this.events.emit('sfx', { id: 'dawn' });
    } else if (to === 'result') {
      this.finish();
    }
    this.events.emit('phase', { phase: to });
  }

  private finish(): void {
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
      boots: this.houses.filter((h) => h.bootFilled).length,
    };
  }

  // ---------- fő ciklus ----------

  update(dt: number, input: InputFrame): void {
    const ph = this.phase;
    if (ph === 'result') return;
    if (ph === 'pack') {
      this.hint('start');
      this.moveBelt(dt);
      this.updatePlayer(dt, input);
      this.target = this.findTarget();
      if (!this.clockFrozen) this.phases.update(dt);
      return;
    }
    if (!this.clockFrozen) {
      this.deliverT += dt;
      if (ph === 'deliver') for (const e of this.director.update(this.deliverT)) this.fire(e);
    }

    this.updatePlayer(dt, input);
    for (const h of this.houses) {
      updateChild(h, dt, this);
      if (h.grandpa) updateGrandpa(h, dt, this);
      if (h.dog) updateDog(h, dt, this);
      if (h.cat) updateCat(h, dt, this);
    }
    updateKrampus(this, dt);
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
    if (this.nearHouseWithGift()) this.hint('nearHouse');
    // a fázisváltás a frissítés végén, hogy a 'result' már a végleges állapotot lássa
    if (this.phase !== 'result' && !this.clockFrozen) this.phases.update(dt);
  }

  private updatePlayer(dt: number, input: InputFrame): void {
    const p = this.player;
    const T = this.tuning.player;
    p.quiet = input.quiet;
    p.hidden = isHouse(p.zone) && input.hide;
    p.grace = Math.max(0, p.grace - dt);
    if (p.busy > 0) {
      p.busy = Math.max(0, p.busy - dt);
      p.vx = p.vy = 0;
      p.speed01 = 0;
      return;
    }
    const inHouse = isHouse(p.zone);
    const inFactory = p.zone === FACTORY;
    const full = inHouse || inFactory ? T.speedHouse : T.speedStreet;
    const onIce =
      p.zone === STREET &&
      this.street.obstacles.some((o) => o.slippery && (o.poly ? pointInPolygon(p.x, p.y, o.poly) : pointInRect(p.x, p.y, o.rect)));
    const slippery = p.zone === STREET && (this.blizzard > 0 || onIce);
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
  }

  // ---------- zaj ----------

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
      const inKidRoom = pointInRect(x, y, h.interior.kidroom);
      const gp = h.grandpa;
      // a szóló tévé elnyomja a zajok egy részét
      const tvMask = gp?.kind === 'tv' && gp.mode === 'awake' ? this.tuning.tv.mask : 1;
      const n = {
        zone,
        x,
        y,
        amount: amount * (inKidRoom ? N.kidRoomFactor : 1) * tvMask,
        radius: N.houseRadius,
        minFactor: N.houseMinFactor,
      };
      hearChild(h, noiseEffect(n, h.child.x, h.child.y), this);
      if (gp && kind !== 'step') hearElder(gp, this, noiseEffect(n, gp.x, gp.y), x, y);
    }
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
    if (h.bootFilled) this.addScore('bootRevoked', h.idx, x, y, 'Csizma-bónusz elveszett');
    h.status = 'lost';
    h.gift = null;
    h.bootFilled = false;
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
      case 'catChimney': {
        const h = pickOf(alive.filter((h) => h.cat?.mode === 'yard'));
        if (!h) return;
        h.cat!.mode = 'chimney';
        this.say('catChimney', n(h), 'warn');
        this.events.emit('sfx', { id: 'meow' });
        break;
      }
      case 'childToss': {
        const h = pickOf(alive.filter((h) => !childAwake(h.child)));
        if (!h) return;
        this.say('childToss', n(h), 'warn');
        hearChild(h, this.tuning.toss * this.level.noiseScale, this);
        break;
      }
      case 'grandpaWake': {
        const h = pickOf(alive.filter((h) => h.grandpa?.mode === 'dozing' || h.grandpa?.mode === 'knit'));
        if (!h) return;
        wakeGrandpa(h.grandpa!, this, 12);
        this.say('grandpaWake', n(h), 'warn');
        break;
      }
      case 'blizzard':
        if (this.blizzard > 0) return;
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
    if (p.busy > 0 || this.phase === 'result') return null;
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
      if (!held) {
        // a szalagról (ami épp előtte halad), vagy le a szánról
        for (const it of this.pack.sack)
          if (it.beltX >= F.beltStart && it.beltX <= F.beltEnd)
            consider('packTake', it.beltX, F.beltY, -1, 62, { item: it.id, icon: icon(it.gift) });
        for (const it of this.pack.sled) {
          const sp = F.slots[it.slot];
          consider('packTake', sp.x, sp.y, -1, 46, { item: it.id, icon: icon(it.gift), label: 'Leveszi' });
        }
      } else {
        F.slots.forEach((sp, i) => {
          if (!this.pack.sled.some((x) => x.slot === i)) consider('packPut', sp.x, sp.y, -1, 46, { slot: i });
        });
        // vissza a szalagra (ami nem kell)
        if (p.y < F.belt.y + F.belt.h + 60)
          consider('packReturn', Math.max(F.beltStart, Math.min(F.beltEnd, p.x)), F.beltY, -1, 62, { label: 'Szalagra' });
      }
      return best;
    }
    if (p.zone === STREET) {
      const s = this.street.sledCenter;
      if (p.hand.empty && (this.phase === 'dawn' || this.pendingCount === 0))
        consider('goHome', s.x, s.y, -1, this.tuning.sledRadius);
      // ajándékok a szánon: felvétel vagy csere; a saját üres helyére visszatehető
      for (const it of this.sledItems) {
        if (it.gone) continue;
        if (it.taken) continue;
        const who = it.tag >= 0 ? `${it.tag + 1}. ${this.houses[it.tag].def.child}` : '?';
        consider('takeGift', it.x, it.y, it.tag, 34, {
          item: it.id,
          icon: icon(it.gift),
          label: `${p.hand.empty ? 'Felvesz' : 'Csere'} · ${who}`,
        });
      }
      // a kézben lévő ajándék a szán bármelyik szabad helyére visszatehető
      if (p.handFrom >= 0 && p.putBackArmed && p.hand.item !== 'candy')
        this.street.giftSlots.forEach((sp, i) => {
          if (this.slotFree(i)) consider('putBack', sp.x, sp.y, -1, 34, { slot: i });
        });
      // eszközök a téren a zsebbe, szaloncukor a kézbe
      const ts = this.street.toolSlots;
      for (const tool of TOOLS)
        if (this.toolStock[tool] > 0 && p.pocket.item !== tool)
          consider('takeTool', ts[tool].x, ts[tool].y, -1, 40, { tool, icon: icon(tool), label: `Zsebre · ${items.tools[tool].hint}` });
      if (p.hand.empty) consider('candy', ts.candy.x, ts.candy.y, -1, 40);
      else if (p.hand.item === 'candy') consider('putBack', ts.candy.x, ts.candy.y, -1, 40, { icon: '🍬' });
      for (const h of this.houses) {
        const st = h.street;
        if (h.status === 'lost') {
          consider('locked', st.door.x, st.door.y, h.idx);
          continue;
        }
        consider('door', st.door.x, st.door.y, h.idx);
        if (chimneyBlocked(h)) consider(p.pocket.item === 'fish' ? 'feedCat' : 'chimneyBlocked', st.ladder.x, st.ladder.y, h.idx);
        else consider('chimney', st.ladder.x, st.ladder.y, h.idx);
        if (p.hand.empty) consider('candy', st.sack.x, st.sack.y, -1);
        if (h.dog?.mode === 'alert' && p.pocket.item === 'bone') consider('feedDog', h.dog.x, h.dog.y, h.idx, 90);
        if (h.cat?.mode === 'yard' && p.pocket.item === 'fish') consider('feedCat', st.catYard.x, st.catYard.y, h.idx, 80);
      }
      for (const g of this.ground) {
        if (g.zone !== STREET || !p.hand.empty) continue;
        if (g.kind === 'candy') consider('pickCandy', g.x, g.y, -1);
        if (g.kind === 'gift') {
          const it = this.sledItems.find((x) => x.id === g.item);
          if (it) consider('pickGift', g.x, g.y, it.tag, R, { item: it.id, icon: icon(it.gift) });
        }
      }
      if (!best && p.hand.item === 'candy' && this.krampus.active) {
        const [label, ic] = LABELS.dropCandy;
        return { kind: 'dropCandy', x: p.x, y: p.y, house: -1, label, icon: ic };
      }
    } else {
      const h = this.houses[p.zone];
      const it = h.interior;
      const hand = p.hand.item;
      if (hand && hand !== 'candy' && h.status === 'pending' && !h.gift)
        consider('tree', it.treeSpot.x, it.treeSpot.y, h.idx, 64, hand === h.def.wish ? {} : { label: 'Mégis lerak', icon: '⚠️' });
      if (hand === 'candy' && !h.bootFilled) consider('boot', it.bootSpot.x, it.bootSpot.y, h.idx, 60);
      consider('exitDoor', it.doorSpot.x, it.doorSpot.y, h.idx, 54);
      consider('exitChimney', it.fireSpot.x, it.fireSpot.y, h.idx, 58);
      if (!best && p.pocket.item === 'bell' && h.grandpa) {
        const [label, ic] = LABELS.bell;
        return { kind: 'bell', x: p.x, y: p.y, house: h.idx, label, icon: ic };
      }
    }
    return best;
  }

  private busy(t: number, kind: string): void {
    this.player.busy = t;
    this.player.busyKind = kind;
    this.player.vx = this.player.vy = 0;
  }

  interact(): void {
    const t = this.findTarget();
    if (!t) return;
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
        this.hint('firstGift');
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
        const it = fromSack >= 0 ? this.pack.sack.splice(fromSack, 1)[0] : fromSled >= 0 ? this.pack.sled.splice(fromSled, 1)[0] : null;
        if (!it) break;
        it.slot = -1;
        this.pack.held = it;
        p.hand.put(it.gift);
        p.handFrom = it.id;
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'pick' });
        break;
      }
      case 'packPut':
      case 'packReturn': {
        const it = this.pack.held;
        if (!it) break;
        this.pack.held = null;
        p.hand.take();
        p.handFrom = -1;
        if (t.kind === 'packPut') {
          it.slot = t.slot!;
          this.pack.sled.push(it);
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
      case 'takeTool': {
        const tool = t.tool!;
        const old = p.pocket.take();
        if (old) this.toolStock[old]++;
        p.pocket.put(tool);
        this.toolStock[tool]--;
        this.busy(A.pick, 'pick');
        this.events.emit('sfx', { id: 'pick' });
        // az első felvételkor elmondjuk, mire jó
        if (!this.toolExplained.has(tool)) {
          this.toolExplained.add(tool);
          this.say(tool === 'bone' ? 'toolBone' : tool === 'fish' ? 'toolFish' : 'toolBell', {}, 'hint');
        }
        break;
      }
      case 'goHome':
        this.phases.goto('result');
        break;
      case 'locked':
        this.say('lost', {}, 'info');
        break;
      case 'door':
      case 'chimney': {
        if (this.phase === 'dawn') {
          this.say('dawnNoEnter', {}, 'info');
          return;
        }
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
      case 'chimneyBlocked':
        this.say(this.toolStock.fish > 0 ? 'catNeedsFish' : 'chimneyBlocked', {}, 'info');
        this.events.emit('sfx', { id: 'meow' });
        break;
      case 'feedCat':
        p.pocket.take();
        h!.cat!.mode = 'fed';
        this.busy(A.feed, 'feed');
        this.say('catFed', {}, 'good');
        this.events.emit('sfx', { id: 'meow' });
        break;
      case 'feedDog':
        p.pocket.take();
        h!.dog!.mode = 'chewing';
        this.busy(A.feed, 'feed');
        this.say('dogFed', {}, 'good');
        break;
      case 'candy':
      case 'pickCandy':
        p.hand.put('candy');
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
      case 'boot': {
        p.hand.take();
        const it = h!.interior;
        h!.bootFilled = true;
        this.busy(A.boot, 'boot');
        this.emitNoise(h!.idx, it.bootSpot.x, it.bootSpot.y, p.quiet ? N.bootQuiet : N.boot, 'boot');
        if (h!.status === 'lost') break;
        this.addScore('boot', h!.idx, it.bootSpot.x, it.bootSpot.y, 'Csizma');
        this.say('boot', { child: h!.def.child }, 'good');
        this.events.emit('sfx', { id: 'boot' });
        break;
      }
      case 'bell': {
        p.pocket.take();
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
