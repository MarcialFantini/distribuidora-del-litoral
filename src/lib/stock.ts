import { CHANNEL_IDS, type ChannelId } from '../data/channels';

/**
 * Pure stock rules. One central stock; each channel publishes its exclusive reserve plus the
 * shared pool. A safety stock stays in the warehouse and no channel ever sees it.
 */
export type StockRules = {
  /** Percentage of the sellable stock reserved exclusively for each channel. */
  reserve: Record<ChannelId, number>;
  /** Units kept back from every channel. */
  safety: number;
  /** Channels show the listing as paused below this many units (0 = never). */
  pauseBelow: number;
};

export const MAX_TOTAL_RESERVE = 90;

export function sellable(central: number, rules: StockRules): number {
  return Math.max(0, central - rules.safety);
}

export function reservedUnits(central: number, rules: StockRules, channel: ChannelId): number {
  return Math.floor((sellable(central, rules) * rules.reserve[channel]) / 100);
}

export function sharedPool(central: number, rules: StockRules): number {
  const reserved = CHANNEL_IDS.reduce((sum, id) => sum + reservedUnits(central, rules, id), 0);
  return Math.max(0, sellable(central, rules) - reserved);
}

/** What a channel should display for a product with `central` units. */
export function publishedFor(central: number, rules: StockRules, channel: ChannelId): number {
  const value = reservedUnits(central, rules, channel) + sharedPool(central, rules);
  return value < rules.pauseBelow ? 0 : value;
}

export function totalReserve(rules: StockRules): number {
  return CHANNEL_IDS.reduce((sum, id) => sum + rules.reserve[id], 0);
}

/** Clamps one channel's reserve so the three never add up to more than the maximum. */
export function clampReserve(rules: StockRules, channel: ChannelId, value: number): number {
  const others = CHANNEL_IDS.filter((id) => id !== channel).reduce((sum, id) => sum + rules.reserve[id], 0);
  return Math.max(0, Math.min(value, MAX_TOTAL_RESERVE - others));
}

export type StockLevel = 'out' | 'low' | 'ok';

export function stockLevel(central: number, min: number): StockLevel {
  if (central <= 0) return 'out';
  if (central <= min) return 'low';
  return 'ok';
}

export const LEVEL_LABEL: Readonly<Record<StockLevel, string>> = {
  out: 'Sin stock',
  low: 'Stock bajo',
  ok: 'Normal',
};
