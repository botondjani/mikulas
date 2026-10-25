import items from './data/items.json';

export type GiftId = keyof typeof items.gifts;
export type ToolId = keyof typeof items.tools;
export type HandItem = GiftId | 'candy';
export type Phase = 'pack' | 'deliver' | 'dawn' | 'result';

export const GIFTS = Object.keys(items.gifts) as GiftId[];
export const TOOLS = Object.keys(items.tools) as ToolId[];
/** az utca zónája; a házak zónája a ház indexe */
export const STREET = -1;

export interface HouseDef {
  child: string;
  owner: string;
  wish: GiftId;
  dog?: boolean;
  cat?: boolean;
  grandpa?: boolean;
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
}

export const icon = (i: HandItem | ToolId): string =>
  i === 'candy' ? items.candy.icon : i in items.gifts ? items.gifts[i as GiftId].icon : items.tools[i as ToolId].icon;
