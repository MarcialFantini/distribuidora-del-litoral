import { CHANNEL_IDS, type ChannelId } from '../data/channels';
import { PRODUCTS } from '../data/catalog';
import { GO_LIVE_DAY, MONTH_DAYS, MONTH_START, history } from '../data/history';

export type DayRow = { day: number; at: number; total: number; byChannel: Record<ChannelId, number>; orders: number; cancelled: number };

/** October aggregates from the 800 seeded orders. Pure, so it runs at build time. */
export function monthReport() {
  const orders = history();
  const days: DayRow[] = Array.from({ length: MONTH_DAYS }, (_, day) => ({
    day,
    at: MONTH_START + day * 86_400_000,
    total: 0,
    byChannel: { mkt: 0, web: 0, own: 0 },
    orders: 0,
    cancelled: 0,
  }));
  const share: Record<ChannelId, { sales: number; orders: number }> = { mkt: { sales: 0, orders: 0 }, web: { sales: 0, orders: 0 }, own: { sales: 0, orders: 0 } };
  const units = new Map<number, number>();
  let sales = 0;
  let cancelledBefore = 0;
  let cancelledAfter = 0;
  let ordersBefore = 0;
  let ordersAfter = 0;
  orders.forEach((order) => {
    const day = Math.min(MONTH_DAYS - 1, Math.floor((order.at - MONTH_START) / 86_400_000));
    const row = days[day];
    if (!row) return;
    if (day < GO_LIVE_DAY) ordersBefore += 1;
    else ordersAfter += 1;
    if (order.cancelled) {
      row.cancelled += 1;
      if (day < GO_LIVE_DAY) cancelledBefore += 1;
      else cancelledAfter += 1;
      return;
    }
    row.total += order.total;
    row.orders += 1;
    row.byChannel[order.channel] += order.total;
    share[order.channel].sales += order.total;
    share[order.channel].orders += 1;
    sales += order.total;
    order.lines.forEach((line) => units.set(line.p, (units.get(line.p) ?? 0) + line.q));
  });
  const top = [...units.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([p, count]) => ({ product: PRODUCTS[p]!, units: count }));
  const delivered = orders.filter((order) => !order.cancelled).length;
  return {
    days,
    share,
    top,
    sales,
    orders: orders.length,
    delivered,
    ticket: sales / Math.max(1, delivered),
    before: { orders: ordersBefore, cancelled: cancelledBefore, rate: (cancelledBefore / Math.max(1, ordersBefore)) * 100 },
    after: { orders: ordersAfter, cancelled: cancelledAfter, rate: (cancelledAfter / Math.max(1, ordersAfter)) * 100 },
  };
}

export const CHANNEL_ORDER: readonly ChannelId[] = CHANNEL_IDS;
