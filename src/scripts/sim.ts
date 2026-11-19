/**
 * The one simulation engine. It feeds every live surface: sales from each channel, central stock,
 * sync jobs with retries and failures, conflicts, notifications and the KPIs.
 */
import { CHANNEL_IDS, type ChannelId } from '../data/channels';
import { FEATURED_INDEX, PRODUCTS, productAt } from '../data/catalog';
import { CHANNELS } from '../data/channels';
import { CITIES, HOUR_WEIGHTS, customerName, pickProduct, pickQuantity } from '../data/history';
import { localHour } from '../lib/format';
import { live } from './random';
import {
  advanceClock,
  announceFastForward,
  notify,
  openConflicts,
  processJobs,
  progressOrders,
  raiseMismatch,
  raisePriceMismatch,
  registerSale,
  resolveConflict,
  restock,
  setQuiet,
  state,
} from './store';

/** 1 real second = 30 simulated seconds at 1x. */
const SIM_RATE = 30;
const TICK_MS = 150;
/** Fast forward: a full day in about six seconds. */
const FAST_FORWARD_MS = 6000;
const DAY_MS = 86_400_000;

let timer = 0;
let lastTick = 0;
let untilSale = 1200;
let untilIncident = 26_000;
let untilRestock = 9000;
let fastForwardLeft = 0;

function activeChannels(): ChannelId[] {
  return CHANNEL_IDS.filter((channel) => state.channels[channel].connected);
}

/** A buyer only sees what the channel publishes, so sales come from the channel's listing. */
export function simulateSale(forceChannel?: ChannelId): void {
  const rng = live();
  const channels = activeChannels();
  if (!channels.length) return;
  const channel =
    forceChannel ??
    rng.weighted(
      channels,
      channels.map((id) => CHANNELS.find((item) => item.id === id)?.weight ?? 0.3),
    );
  const lineCount = rng.weighted([1, 2], [0.78, 0.22]);
  const lines: { p: number; q: number }[] = [];
  for (let attempt = 0; attempt < 8 && lines.length < lineCount; attempt++) {
    // The featured product sells often, so the hero always has something to show.
    const p = rng.chance(0.22) ? FEATURED_INDEX : pickProduct(rng);
    const q = pickQuantity(rng);
    if (lines.some((line) => line.p === p)) continue;
    if ((state.published[channel][p] ?? 0) < q) continue;
    lines.push({ p, q });
  }
  if (!lines.length) return;
  registerSale({ channel, lines, customer: customerName(rng), city: rng.pick(CITIES), manual: false });
}

function simulateIncident(): void {
  const rng = live();
  if (openConflicts().length >= 4) return;
  const channel = rng.weighted<ChannelId>(['mkt', 'web', 'own'], [0.6, 0.3, 0.1]);
  if (!state.channels[channel].connected) return;
  const p = pickProduct(rng);
  if (rng.chance(0.7)) {
    const current = state.published[channel][p] ?? 0;
    raiseMismatch(p, channel, Math.max(0, current + rng.pick([-6, -3, 4, 8, 12])));
  } else raisePriceMismatch(p, channel);
}

/** A supplier delivery now and then keeps the catalogue alive during long sessions. */
function supplierDelivery(): void {
  const rng = live();
  const low = state.stock
    .map((units, p) => ({ p, units }))
    .filter(({ p, units }) => units <= productAt(p).min)
    .sort((a, b) => a.units - b.units);
  const featured = state.stock[FEATURED_INDEX] ?? 0;
  if (featured < 40) restock(FEATURED_INDEX, 120, 'Ingreso de proveedor');
  const target = low[0];
  if (target && rng.chance(0.6)) restock(target.p, rng.int(24, 96), 'Ingreso de proveedor');
}

/** "El sistema central siempre gana": differences edited on a channel are corrected on their own. */
function autoResolve(): void {
  openConflicts().forEach((conflict) => {
    if (conflict.kind !== "sync_failed" && state.sim.now - conflict.at > 45_000) resolveConflict(conflict.id, "push");
  });
}

function hourFactor(): number {
  return (HOUR_WEIGHTS[localHour(state.sim.now)] ?? 1) / 1.4;
}

function step(real: number): void {
  const fast = fastForwardLeft > 0;
  const speed = fast ? 40 : state.sim.speed;
  const simMs = fast ? (real / FAST_FORWARD_MS) * DAY_MS : real * SIM_RATE * speed;
  advanceClock(simMs, (real / 1000) * speed);
  untilSale -= real * (fast ? 1 : Math.max(0.35, hourFactor()));
  let guard = 0;
  while (untilSale <= 0 && guard++ < 6) {
    simulateSale();
    untilSale += fast ? live().range(90, 170) : live().range(2300, 4300) / speed;
  }
  processJobs();
  progressOrders();
  if (state.rules.centralWins) autoResolve();
  untilIncident -= real * speed;
  if (untilIncident <= 0) {
    simulateIncident();
    untilIncident = live().range(30_000, 55_000);
  }
  untilRestock -= real * speed;
  if (untilRestock <= 0) {
    supplierDelivery();
    untilRestock = live().range(14_000, 22_000);
  }
  if (fast) {
    fastForwardLeft -= real;
    if (fastForwardLeft <= 0) {
      fastForwardLeft = 0;
      announceFastForward(false);
    }
  }
}

function tick(): void {
  const now = performance.now();
  const real = Math.min(600, now - lastTick);
  lastTick = now;
  if (state.sim.paused && fastForwardLeft <= 0) return;
  step(real);
}

/** "Adelantar el tiempo": a full day of orders in a few seconds. */
export function fastForward(): void {
  if (fastForwardLeft > 0) return;
  fastForwardLeft = FAST_FORWARD_MS;
  announceFastForward(true);
}

export function isFastForwarding(): boolean {
  return fastForwardLeft > 0;
}

/** First visit: a believable morning so tables, logs and charts are not empty. */
export function bootstrap(): void {
  setQuiet(true);
  for (let i = 0; i < 160; i++) step(1000);
  // One open incident of each kind, so the conflicts inbox has something to resolve.
  raiseMismatch(41, 'mkt', Math.max(0, (state.published.mkt[41] ?? 0) + 7));
  raisePriceMismatch(12, 'web');
  state.notifications.forEach((notification, index) => {
    notification.read = index > 2;
  });
  setQuiet(false);
  notify('system', 'Turno iniciado', `Tres canales conectados · ${PRODUCTS.length} productos publicados.`);
}

export function startSimulation(): void {
  if (timer) return;
  lastTick = performance.now();
  timer = window.setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    lastTick = performance.now();
  });
}

export function isRunning(): boolean {
  return timer !== 0;
}

