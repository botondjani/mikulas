import items from './data/items.json';

export type GiftId = keyof typeof items.gifts;
export type ToolId = keyof typeof items.tools;
export type HandItem = GiftId | 'candy';
/** a gyárban a szalagon érkező eszközök (a zseblámpa a Mikulásnál marad) */
export type PackTool = ToolId | 'candy' | 'flashlight';
/** az eszközládában tárolható eszközök */
export type StockTool = ToolId | 'candy';
export type Phase = 'pack' | 'drive' | 'deliver' | 'dawn' | 'result';

export const GIFTS = Object.keys(items.gifts) as GiftId[];
export const TOOLS = Object.keys(items.tools) as ToolId[];
/** az utca zónája; a házak zónája a ház indexe */
export const STREET = -1;
/** a Mikulás-gyár (pakolás) zónája */
export const FACTORY = -2;
/** az út a gyártól a faluig (szánvezetés) */
export const ROAD = -3;
/** házban van-e (a házak zónája a ház indexe, 0-tól) */
export const isHouse = (zone: number): boolean => zone >= 0;

export interface HouseDef {
  child: string;
  owner: string;
  wish: GiftId;
  dog?: boolean;
  cat?: boolean;
  /** van-e idős szereplő a nappaliban */
  grandpa?: boolean;
  /** milyen: szundikáló nagypapa, tévéző nagypapa vagy kötögető nagymama */
  elder?: 'grandpa' | 'tv' | 'grandma';
  /** szobák száma (alapból 2) */
  rooms?: 2 | 3 | 4;
  /** a szülők is otthon alszanak */
  parents?: boolean;
  /** testvér is alszik a házban */
  sibling?: boolean;
  /** sötét ház: zseblámpával lehet tájékozódni */
  dark?: boolean;
}

export type EventId = 'dogBark' | 'childToss' | 'grandpaWake' | 'blizzard' | 'fog' | 'krampus';

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  durations: { pack: number; deliver: number; dawn: number };
  noiseScale: number;
  houses: HouseDef[];
  decoys: number;
  /** ennyi jön az egyes eszközökből a futószalagon */
  tools: Record<ToolId, number>;
  /** szaloncukor a futószalagon */
  candy: number;
  /** az eszközláda mérete */
  toolbox: number;
  /** vihar a gyárban (beázás, villám, áramszünet; jön a zseblámpa is) */
  storm: boolean;
  events: Record<EventId, number>;
  stars: number[];
  hints: boolean;
  /** akadály-sűrűség az utcán, 0..3 */
  obstacles: number;
  /** kóbor kutyák száma az utcán */
  strays: number;
  /** járőröző rendőrautók száma */
  police: number;
}

export const icon = (i: HandItem | PackTool): string =>
  i === 'candy'
    ? items.candy.icon
    : i === 'flashlight'
      ? items.flashlight.icon
      : i in items.gifts
        ? items.gifts[i as GiftId].icon
        : items.tools[i as ToolId].icon;
