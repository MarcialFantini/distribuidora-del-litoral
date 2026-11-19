import { productAt } from '../data/catalog';
import type { ChannelId } from '../data/channels';
import { LIVE_START, history } from '../data/history';

export type HistoryMovement = {
  at: number;
  delta: number;
  after: number;
  channel: ChannelId | null;
  reason: 'venta' | 'reposicion' | 'cancelada';
  ref: string;
};

const cache = new Map<number, HistoryMovement[]>();

/**
 * October movements for one product, rebuilt backwards from its stock at the start of the
 * live day: sales from the 800 orders, plus supplier deliveries whenever the level would
 * otherwise climb past a realistic shelf maximum.
 */
export function monthMovements(p: number): HistoryMovement[] {
  const hit = cache.get(p);
  if (hit) return hit;
  const product = productAt(p);
  const ceiling = Math.max(60, product.stock * 1.25, product.min * 6);
  const sales = history()
    .flatMap((order) =>
      order.lines
        .filter((line) => line.p === p)
        .map((line) => ({ at: order.at, q: line.q, channel: order.channel, ref: order.number, cancelled: order.cancelled })),
    )
    .sort((a, b) => b.at - a.at);
  const out: HistoryMovement[] = [];
  let level = product.stock;
  let restocks = 0;
  sales.forEach((sale) => {
    if (sale.cancelled) {
      out.push({ at: sale.at, delta: 0, after: level, channel: sale.channel, reason: 'cancelada', ref: sale.ref });
      return;
    }
    // Walking back in time a sale adds units; a delivery removes them.
    if (level + sale.q > ceiling) {
      const delivered = Math.max(12, Math.round((level * 0.7) / 6) * 6);
      out.push({ at: sale.at + 3_600_000, delta: delivered, after: level, channel: null, reason: 'reposicion', ref: `Remito R-${String(4100 + p * 7 + restocks).padStart(5, '0')}` });
      level -= delivered;
      restocks += 1;
    }
    out.push({ at: sale.at, delta: -sale.q, after: level, channel: sale.channel, reason: 'venta', ref: sale.ref });
    level += sale.q;
  });
  out.sort((a, b) => b.at - a.at);
  cache.set(p, out);
  return out;
}

/** Stock level points through October, oldest first, ending at the live day. */
export function stockSeries(p: number): { at: number; value: number }[] {
  const movements = monthMovements(p).filter((movement) => movement.reason !== 'cancelada');
  const points = movements.map((movement) => ({ at: movement.at, value: movement.after })).reverse();
  const first = movements[movements.length - 1];
  const start = first ? first.after - first.delta : productAt(p).stock;
  return [{ at: LIVE_START - 32 * 86_400_000, value: start }, ...points, { at: LIVE_START, value: productAt(p).stock }];
}
