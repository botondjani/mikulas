import items from './data/items.json';

export type GiftId = keyof typeof items.gifts;
export type ToolId = keyof typeof items.tools;
export type HandItem = GiftId | 'candy';
export type Phase = 'pack' | 'deliver' | 'dawn' | 'result';

export const GIFTS = Object.keys(items.gifts) as GiftId[];
export const TOOLS = Object.keys(items.tools) as ToolId[];
/** az utca zónája; a házak zónája a ház indexe */
export const STREET = -1;
/** a Mikulás-gyár (pakolás) zónája */
export const FACTORY = -2;
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
}

export type EventId = 'dogBark' | 'catChimney' | 'childToss' | 'grandpaWake' | 'blizzard' | 'krampus';

export interface LevelDef {
  id: number;
  name: string;
  subtitle: string;
  durations: { pack: number; deliver: number; dawn: number };
  noiseScale: number;
  houses: HouseDef[];
  decoys: number;
  tools: Record<ToolId, number>;
  events: Record<EventId, number>;
  stars: number[];
  hints: boolean;
  /** akadály-sűrűség az utcán, 0..3 */
  obstacles: number;
}

export const icon = (i: HandItem | ToolId): string =>
  i === 'candy' ? items.candy.icon : i in items.gifts ? items.gifts[i as GiftId].icon : items.tools[i as ToolId].icon;
