import { CHANNELS, type ChannelId } from './channels';
import { PRODUCTS } from './catalog';
import { createRng, type Rng } from './rng';

/** 800 orders of a fictional month (October 2026), spread across the three channels. */
export type OrderLine = { p: number; q: number };

export type HistoricOrder = {
  id: string;
  number: string;
  channel: ChannelId;
  at: number;
  lines: OrderLine[];
  total: number;
  customer: string;
  city: string;
  cancelled: boolean;
};

export const HISTORY_COUNT = 800;
/** October 1st 2026, 00:00 in Argentina (UTC-3). */
export const MONTH_START = Date.UTC(2026, 9, 1, 3, 0, 0);
export const MONTH_DAYS = 31;
/** The integration went live on day 8; the first week shows what happened without it. */
export const GO_LIVE_DAY = 7;
/** The live day starts on Monday November 2nd 2026, 08:00 in Argentina. */
export const LIVE_START = Date.UTC(2026, 10, 2, 11, 0, 0);

const FIRST = ['Lucía', 'Martín', 'Sofía', 'Joaquín', 'Valentina', 'Tomás', 'Camila', 'Facundo', 'Julieta', 'Agustín', 'Florencia', 'Nicolás', 'Micaela', 'Lautaro', 'Carla', 'Gonzalo', 'Rocío', 'Matías', 'Paula', 'Ramiro'];
const LAST = ['Gómez', 'Ferreyra', 'Acosta', 'Benítez', 'Ríos', 'Medina', 'Sosa', 'Correa', 'Vera', 'Godoy', 'Ledesma', 'Molina', 'Romero', 'Ojeda', 'Paz', 'Quiroga'];
export const CITIES = ['Santa Fe', 'Rosario', 'Paraná', 'Rafaela', 'Reconquista', 'Venado Tuerto', 'Esperanza', 'Santo Tomé', 'Córdoba', 'San Justo', 'Gálvez', 'Villa Constitución'];

/** Hourly order intensity: quiet nights, a late-morning peak and an evening peak. */
export const HOUR_WEIGHTS: readonly number[] = [0.2, 0.1, 0.05, 0.05, 0.05, 0.1, 0.3, 0.6, 1, 1.4, 1.7, 1.8, 1.5, 1.2, 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.9, 1.8, 1.2, 0.6];

export function channelPrice(base: number, markup: number): number {
  return Math.round((base * (1 + markup / 100)) / 50) * 50;
}

export function customerName(rng: Rng): string {
  return `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
}

/** Popular products sell more: a skewed pick over the catalogue. */
export function pickProduct(rng: Rng): number {
  return Math.min(PRODUCTS.length - 1, Math.floor(Math.pow(rng.next(), 1.9) * PRODUCTS.length));
}

export function pickQuantity(rng: Rng): number {
  return rng.weighted([1, 2, 3, 6], [0.55, 0.25, 0.12, 0.08]);
}

function build(): HistoricOrder[] {
  const rng = createRng(31102026);
  const hours = Array.from({ length: 24 }, (_, hour) => hour);
  const days = Array.from({ length: MONTH_DAYS }, (_, day) => day);
  // Weekends are slower, and the month grows a little towards the end.
  const dayWeights = days.map((day) => {
    const weekday = new Date(MONTH_START - 3 * 3_600_000 + day * 86_400_000).getUTCDay();
    return (weekday === 0 ? 0.55 : weekday === 6 ? 0.75 : 1) * (0.85 + day / 100);
  });
  const orders: HistoricOrder[] = [];
  for (let i = 0; i < HISTORY_COUNT; i++) {
    const channel = rng.weighted(
      CHANNELS.map((item) => item.id),
      CHANNELS.map((item) => item.weight),
    );
    const day = rng.weighted(days, dayWeights);
    const hour = rng.weighted(hours, HOUR_WEIGHTS);
    const at = MONTH_START + day * 86_400_000 + hour * 3_600_000 + rng.int(0, 3_599) * 1000;
    const lineCount = rng.weighted([1, 2, 3], [0.62, 0.28, 0.1]);
    const lines: OrderLine[] = [];
    for (let j = 0; j < lineCount; j++) {
      const p = pickProduct(rng);
      if (lines.some((line) => line.p === p)) continue;
      lines.push({ p, q: pickQuantity(rng) });
    }
    const markup = CHANNELS.find((item) => item.id === channel)?.markup ?? 0;
    const total = lines.reduce((sum, line) => sum + channelPrice(PRODUCTS[line.p]?.price ?? 0, markup) * line.q, 0);
    orders.push({
      id: '',
      number: '',
      channel,
      at,
      lines,
      total,
      customer: customerName(rng),
      city: rng.pick(CITIES),
      // Before go-live, channels sold from stale copies: some orders had no stock and were cancelled.
      cancelled: day < GO_LIVE_DAY ? rng.chance(0.09) : false,
    });
  }
  orders.sort((a, b) => a.at - b.at);
  orders.forEach((order, index) => {
    order.id = `h${index}`;
    order.number = `DL-${String(10241 + index).padStart(6, '0')}`;
  });
  return orders;
}

let cache: HistoricOrder[] | null = null;

/** Built lazily: views that do not need the month never pay for it. */
export function history(): HistoricOrder[] {
  cache ??= build();
  return cache;
}
