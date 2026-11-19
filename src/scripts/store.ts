/**
 * Single source of truth for the demo. Every view, scene and the simulation engine reads and
 * writes through here, so all screens stay in sync. Persisted to localStorage (debounced).
 */
import { CHANNELS, CHANNEL_BY_ID, CHANNEL_IDS, type ChannelId } from '../data/channels';
import { PRODUCTS, productAt } from '../data/catalog';
import { LIVE_START, channelPrice, type OrderLine } from '../data/history';
import { dayStart, formatUnits, localHour } from '../lib/format';
import { publishedFor, type StockRules } from '../lib/stock';
import { random } from './random';

export type Speed = 1 | 4 | 10;
export type Stage = 'nuevo' | 'central' | 'factura' | 'etiqueta' | 'despachado' | 'cancelado';
export type Level = 'info' | 'ok' | 'warn' | 'error';
export type EventKind = 'venta' | 'sync' | 'reintento' | 'error' | 'conflicto' | 'resuelto' | 'regla' | 'canal' | 'stock' | 'pedido';

export type LiveOrder = {
  id: string;
  number: string;
  channel: ChannelId;
  at: number;
  lines: OrderLine[];
  total: number;
  customer: string;
  city: string;
  stage: Stage;
  /** Demo-seconds timestamp of the last stage change. */
  stageAt: number;
  invoice: string | null;
  tracking: string | null;
  manual: boolean;
};

export type SyncJob = {
  id: number;
  /** Product index, or -1 for a bulk republish of the whole catalogue. */
  p: number;
  channel: ChannelId;
  createdAt: number;
  dueAt: number;
  attempt: number;
  status: 'queued' | 'retrying' | 'waiting';
};

export type LogEvent = {
  id: number;
  at: number;
  kind: EventKind;
  level: Level;
  channel: ChannelId | null;
  p: number | null;
  text: string;
  meta: string;
};

export type ConflictKind = 'sync_failed' | 'stock_mismatch' | 'price_mismatch';

export type Conflict = {
  id: number;
  at: number;
  kind: ConflictKind;
  channel: ChannelId;
  p: number;
  central: number;
  remote: number;
  code: string;
  status: 'open' | 'resolved';
  resolution: string | null;
};

export type NotificationKind = 'sale' | 'error' | 'conflict' | 'stock' | 'system';

export type AppNotification = {
  id: number;
  at: number;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
};

export type Movement = {
  at: number;
  p: number;
  delta: number;
  after: number;
  channel: ChannelId | null;
  reason: 'venta' | 'reposicion' | 'ajuste' | 'cancelacion';
  ref: string;
};

export type ChannelState = {
  connected: boolean;
  autoSync: boolean;
  latency: number;
  errorRate: number;
  markup: number;
  lastSyncAt: number;
  syncs: number;
  failures: number;
  latencySum: number;
};

export type DayStats = { day: number; sales: number; orders: number };

export type Kpi = {
  sales: number;
  orders: number;
  units: number;
  syncs: number;
  latencySum: number;
  avoided: number;
  cancelled: number;
  byChannel: Record<ChannelId, { orders: number; sales: number; units: number }>;
  hourly: Record<ChannelId, number[]>;
};

export type State = {
  version: number;
  sim: { now: number; demo: number; paused: boolean; speed: Speed };
  stock: number[];
  published: Record<ChannelId, number[]>;
  channels: Record<ChannelId, ChannelState>;
  rules: StockRules & { centralWins: boolean };
  jobs: SyncJob[];
  orders: LiveOrder[];
  events: LogEvent[];
  conflicts: Conflict[];
  notifications: AppNotification[];
  movements: Movement[];
  kpi: Kpi;
  days: DayStats[];
  seq: { order: number; event: number; job: number; conflict: number; notification: number; invoice: number };
};

export type StoreEvent =
  | { type: 'clock' }
  | { type: 'sim' }
  | { type: 'sale'; order: LiveOrder }
  | { type: 'order'; order: LiveOrder }
  | { type: 'stock'; p: number; before: number; after: number }
  | { type: 'published'; p: number; channel: ChannelId; value: number; latency: number }
  | { type: 'jobs' }
  | { type: 'event'; event: LogEvent }
  | { type: 'conflict'; conflict: Conflict }
  | { type: 'notification'; notification: AppNotification }
  | { type: 'notifications-read' }
  | { type: 'rules' }
  | { type: 'channel'; channel: ChannelId }
  | { type: 'kpi' }
  | { type: 'fast-forward'; active: boolean };

const VERSION = 3;
const STORAGE_KEY = 'dl-sync-demo-v3';
const LIMITS = { orders: 260, events: 400, conflicts: 80, notifications: 60, movements: 700 } as const;
export const MAX_ATTEMPTS = 3;

export const STAGES: readonly Stage[] = ['nuevo', 'central', 'factura', 'etiqueta', 'despachado'];
export const STAGE_LABEL: Readonly<Record<Stage, string>> = {
  nuevo: 'Recibido',
  central: 'Sistema central',
  factura: 'Factura',
  etiqueta: 'Etiqueta',
  despachado: 'Despachado',
  cancelado: 'Cancelado',
};
/** Demo seconds each stage takes before the order moves on. */
export const STAGE_SECONDS: Readonly<Record<Stage, number>> = {
  nuevo: 2.5,
  central: 3,
  factura: 4,
  etiqueta: 5,
  despachado: Infinity,
  cancelado: Infinity,
};

const ERROR_CODES = ['HTTP 504 · tiempo de espera agotado', 'HTTP 429 · límite de pedidos por minuto', 'HTTP 503 · canal en mantenimiento', 'HTTP 401 · token vencido, renovado'];

function emptyKpi(): Kpi {
  const perChannel = () => ({ orders: 0, sales: 0, units: 0 });
  const hours = () => Array.from({ length: 24 }, () => 0);
  return {
    sales: 0,
    orders: 0,
    units: 0,
    syncs: 0,
    latencySum: 0,
    avoided: 0,
    cancelled: 0,
    byChannel: { mkt: perChannel(), web: perChannel(), own: perChannel() },
    hourly: { mkt: hours(), web: hours(), own: hours() },
  };
}

function initialRules(): State['rules'] {
  return {
    reserve: { mkt: CHANNEL_BY_ID.mkt.reserve, web: CHANNEL_BY_ID.web.reserve, own: CHANNEL_BY_ID.own.reserve },
    safety: 2,
    pauseBelow: 0,
    centralWins: false,
  };
}

function createState(): State {
  const rules = initialRules();
  const stock = PRODUCTS.map((product) => product.stock);
  const published = Object.fromEntries(
    CHANNEL_IDS.map((channel) => [channel, stock.map((units) => publishedFor(units, rules, channel))]),
  ) as Record<ChannelId, number[]>;
  const channels = Object.fromEntries(
    CHANNELS.map((channel) => [
      channel.id,
      {
        connected: true,
        autoSync: true,
        latency: channel.latency,
        errorRate: channel.errorRate,
        markup: channel.markup,
        lastSyncAt: LIVE_START,
        syncs: 0,
        failures: 0,
        latencySum: 0,
      },
    ]),
  ) as Record<ChannelId, ChannelState>;
  return {
    version: VERSION,
    sim: { now: LIVE_START, demo: 0, paused: false, speed: 1 },
    stock,
    published,
    channels,
    rules,
    jobs: [],
    orders: [],
    events: [],
    conflicts: [],
    notifications: [],
    movements: [],
    kpi: emptyKpi(),
    days: [],
    seq: { order: 0, event: 0, job: 0, conflict: 0, notification: 0, invoice: 1840 },
  };
}

export const state: State = createState();

/* ---------- pub/sub ---------- */

type Listener = (event: StoreEvent) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let quiet = false;
/** While bootstrapping, nothing is emitted: there is nobody listening yet and it keeps it fast. */
export function setQuiet(value: boolean): void {
  quiet = value;
}

function emit(event: StoreEvent): void {
  if (quiet) return;
  listeners.forEach((listener) => listener(event));
  if (event.type !== 'clock') schedulePersist();
}

function cap<T>(list: T[], limit: number): void {
  if (list.length > limit) list.length = limit;
}

/* ---------- selectors ---------- */

export function channelPriceFor(p: number, channel: ChannelId): number {
  return channelPrice(productAt(p).price, state.channels[channel].markup);
}

export function targetFor(p: number, channel: ChannelId): number {
  return publishedFor(state.stock[p] ?? 0, state.rules, channel);
}

export function isInSync(p: number, channel: ChannelId): boolean {
  return (state.published[channel][p] ?? 0) === targetFor(p, channel);
}

export function jobFor(p: number, channel: ChannelId): SyncJob | undefined {
  return state.jobs.find((job) => job.p === p && job.channel === channel);
}

export function openConflicts(): Conflict[] {
  return state.conflicts.filter((conflict) => conflict.status === 'open');
}

export function unreadCount(): number {
  return state.notifications.filter((notification) => !notification.read).length;
}

export function averageLatency(channel?: ChannelId): number {
  if (channel) {
    const item = state.channels[channel];
    return item.syncs ? item.latencySum / item.syncs : CHANNEL_BY_ID[channel].latency;
  }
  return state.kpi.syncs ? state.kpi.latencySum / state.kpi.syncs : 0;
}

export function channelHealth(channel: ChannelId): 'ok' | 'degraded' | 'down' {
  const item = state.channels[channel];
  if (!item.connected) return 'down';
  const failing = state.jobs.some((job) => job.channel === channel && job.status === 'retrying');
  const failed = openConflicts().some((conflict) => conflict.channel === channel && conflict.kind === 'sync_failed');
  return failing || failed || item.errorRate > 0.25 ? 'degraded' : 'ok';
}

export function productMovements(p: number): Movement[] {
  return state.movements.filter((movement) => movement.p === p);
}

/* ---------- log, notifications ---------- */

export function log(kind: EventKind, level: Level, text: string, options: { channel?: ChannelId | null; p?: number | null; meta?: string } = {}): LogEvent {
  state.seq.event += 1;
  const event: LogEvent = {
    id: state.seq.event,
    at: state.sim.now,
    kind,
    level,
    channel: options.channel ?? null,
    p: options.p ?? null,
    text,
    meta: options.meta ?? '',
  };
  state.events.unshift(event);
  cap(state.events, LIMITS.events);
  emit({ type: 'event', event });
  return event;
}

export function notify(kind: NotificationKind, title: string, body: string, href: string | null = null): void {
  state.seq.notification += 1;
  const notification: AppNotification = { id: state.seq.notification, at: state.sim.now, kind, title, body, href, read: false };
  state.notifications.unshift(notification);
  cap(state.notifications, LIMITS.notifications);
  emit({ type: 'notification', notification });
}

export function markAllRead(): void {
  state.notifications.forEach((notification) => {
    notification.read = true;
  });
  emit({ type: 'notifications-read' });
}

/* ---------- stock and sync ---------- */

function setStock(p: number, after: number, movement: Omit<Movement, 'at' | 'p' | 'after' | 'delta'>): void {
  const before = state.stock[p] ?? 0;
  state.stock[p] = after;
  state.movements.unshift({ at: state.sim.now, p, delta: after - before, after, ...movement });
  cap(state.movements, LIMITS.movements);
  emit({ type: 'stock', p, before, after });
  if (after <= productAt(p).min && before > productAt(p).min) {
    notify('stock', 'Stock bajo', `${productAt(p).name}: quedan ${formatUnits(after)} u.`, `/productos/${productAt(p).sku.toLowerCase()}`);
  }
}

/** Queues a push of the current central stock to one or every channel; coalesces duplicates. */
export function enqueueSync(p: number, channels: readonly ChannelId[] = CHANNEL_IDS, urgent = false): void {
  channels.forEach((channel) => {
    const settings = state.channels[channel];
    const existing = jobFor(p, channel);
    const jitter = 0.65 + random() * 0.7;
    const delay = urgent ? 0.4 : settings.latency * jitter;
    if (existing) {
      if (urgent) existing.dueAt = Math.min(existing.dueAt, state.sim.demo + delay);
      return;
    }
    state.seq.job += 1;
    state.jobs.push({
      id: state.seq.job,
      p,
      channel,
      createdAt: state.sim.demo,
      dueAt: state.sim.demo + delay,
      attempt: 0,
      status: settings.connected && settings.autoSync ? 'queued' : 'waiting',
    });
  });
  emit({ type: 'jobs' });
}

function applyPublished(p: number, channel: ChannelId, latency: number): void {
  const before = state.published[channel][p] ?? 0;
  const value = targetFor(p, channel);
  state.published[channel][p] = value;
  const settings = state.channels[channel];
  settings.lastSyncAt = state.sim.now;
  settings.syncs += 1;
  settings.latencySum += latency;
  state.kpi.syncs += 1;
  state.kpi.latencySum += latency;
  // A listing corrected downwards while stock was nearly gone is a sale that can no longer oversell.
  if (value < before && value <= Math.max(3, productAt(p).min)) state.kpi.avoided += 1;
  emit({ type: 'published', p, channel, value, latency });
}

function failJob(job: SyncJob): void {
  const settings = state.channels[job.channel];
  settings.failures += 1;
  job.attempt += 1;
  const code = ERROR_CODES[Math.floor(random() * ERROR_CODES.length)] ?? 'HTTP 500';
  const name = job.p >= 0 ? productAt(job.p).name : 'Catálogo completo';
  if (job.attempt >= MAX_ATTEMPTS) {
    state.jobs = state.jobs.filter((item) => item !== job);
    state.seq.conflict += 1;
    const conflict: Conflict = {
      id: state.seq.conflict,
      at: state.sim.now,
      kind: 'sync_failed',
      channel: job.channel,
      p: Math.max(0, job.p),
      central: job.p >= 0 ? targetFor(job.p, job.channel) : 0,
      remote: job.p >= 0 ? (state.published[job.channel][job.p] ?? 0) : 0,
      code,
      status: 'open',
      resolution: null,
    };
    state.conflicts.unshift(conflict);
    cap(state.conflicts, LIMITS.conflicts);
    log('error', 'error', `Sincronización fallida tras ${MAX_ATTEMPTS} intentos`, { channel: job.channel, p: job.p >= 0 ? job.p : null, meta: code });
    notify('error', `Falló la sincronización con ${CHANNEL_BY_ID[job.channel].name}`, `${name}. ${code}.`, '/sincronizacion?filtro=conflictos');
    emit({ type: 'conflict', conflict });
    return;
  }
  job.status = 'retrying';
  job.dueAt = state.sim.demo + 2 ** job.attempt;
  log('reintento', 'warn', `Reintento ${job.attempt} de ${MAX_ATTEMPTS - 1} en ${2 ** job.attempt} s`, { channel: job.channel, p: job.p >= 0 ? job.p : null, meta: code });
}

/** Called by the engine: completes, retries or fails the jobs that are due. */
export function processJobs(): void {
  if (!state.jobs.length) return;
  let changed = false;
  const due = state.jobs.filter((job) => job.dueAt <= state.sim.demo);
  due.forEach((job) => {
    const settings = state.channels[job.channel];
    if (!settings.connected || !settings.autoSync) {
      if (job.status !== 'waiting') {
        job.status = 'waiting';
        changed = true;
      }
      return;
    }
    changed = true;
    if (random() < settings.errorRate) {
      failJob(job);
      return;
    }
    state.jobs = state.jobs.filter((item) => item !== job);
    const latency = state.sim.demo - job.createdAt;
    if (job.p < 0) {
      for (let p = 0; p < PRODUCTS.length; p++) state.published[job.channel][p] = targetFor(p, job.channel);
      settings.lastSyncAt = state.sim.now;
      log('sync', 'ok', `Catálogo republicado: ${formatUnits(PRODUCTS.length)} publicaciones`, { channel: job.channel, meta: `${latency.toFixed(1)} s` });
      emit({ type: 'published', p: -1, channel: job.channel, value: 0, latency });
      return;
    }
    if (job.attempt > 0) log('resuelto', 'ok', `Sincronizado al reintento ${job.attempt}`, { channel: job.channel, p: job.p, meta: `${latency.toFixed(1)} s` });
    applyPublished(job.p, job.channel, latency);
  });
  if (changed) emit({ type: 'jobs' });
}

/** Releases jobs that were waiting for a channel to come back. */
function wakeJobs(channel: ChannelId): void {
  state.jobs.forEach((job) => {
    if (job.channel === channel && job.status === 'waiting') {
      job.status = 'queued';
      job.dueAt = state.sim.demo + 0.3 + random() * 1.5;
    }
  });
}

/* ---------- orders ---------- */

function nextOrderNumber(): string {
  state.seq.order += 1;
  return `DL-${String(11041 + state.seq.order).padStart(6, '0')}`;
}

export type SaleInput = { channel: ChannelId; lines: OrderLine[]; customer: string; city: string; manual: boolean };

/**
 * A sale lands in the central system. Central stock is the authority: if it cannot cover the
 * order (a channel sold from a copy that was still syncing), the order is cancelled.
 */
export function registerSale(input: SaleInput): LiveOrder {
  const id = `o${state.seq.order + 1}`;
  const number = nextOrderNumber();
  const covered = input.lines.every((line) => (state.stock[line.p] ?? 0) >= line.q);
  const total = input.lines.reduce((sum, line) => sum + channelPriceFor(line.p, input.channel) * line.q, 0);
  const order: LiveOrder = {
    id,
    number,
    channel: input.channel,
    at: state.sim.now,
    lines: input.lines,
    total,
    customer: input.customer,
    city: input.city,
    stage: covered ? 'nuevo' : 'cancelado',
    stageAt: state.sim.demo,
    invoice: null,
    tracking: null,
    manual: input.manual,
  };
  state.orders.unshift(order);
  cap(state.orders, LIMITS.orders);
  const channelName = CHANNEL_BY_ID[input.channel].name;
  const first = productAt(input.lines[0]?.p ?? 0);
  if (!covered) {
    state.kpi.cancelled += 1;
    log('error', 'error', `Venta sin stock real: pedido ${number} cancelado`, { channel: input.channel, p: first.index, meta: 'La publicación todavía no se había actualizado' });
    notify('error', `Pedido ${number} cancelado`, `${channelName} vendió ${first.name} sin stock disponible.`, `/pedidos?pedido=${id}`);
    emit({ type: 'sale', order });
    return order;
  }
  const units = input.lines.reduce((sum, line) => sum + line.q, 0);
  input.lines.forEach((line) => {
    const after = (state.stock[line.p] ?? 0) - line.q;
    // The selling channel already discounted its own listing; the others learn it through the sync.
    state.published[input.channel][line.p] = Math.max(0, (state.published[input.channel][line.p] ?? 0) - line.q);
    setStock(line.p, after, { channel: input.channel, reason: 'venta', ref: number });
    enqueueSync(line.p);
  });
  const kpi = state.kpi;
  kpi.sales += total;
  kpi.orders += 1;
  kpi.units += units;
  kpi.byChannel[input.channel].orders += 1;
  kpi.byChannel[input.channel].sales += total;
  kpi.byChannel[input.channel].units += units;
  const hour = localHour(state.sim.now);
  kpi.hourly[input.channel][hour] = (kpi.hourly[input.channel][hour] ?? 0) + total;
  const lineText = input.lines.length > 1 ? `${first.name} y ${input.lines.length - 1} más` : `${input.lines[0]?.q ?? 1} × ${first.name}`;
  log('venta', 'info', `${input.manual ? 'Venta manual' : 'Venta'} ${number}: ${lineText}`, { channel: input.channel, p: first.index, meta: `−${units} u.` });
  if (input.manual) notify('sale', `Venta manual en ${channelName}`, `${number} · ${lineText}`, `/pedidos?pedido=${id}`);
  emit({ type: 'sale', order });
  emit({ type: 'kpi' });
  return order;
}

/** Moves live orders along central → invoice → shipping label → dispatched. */
export function progressOrders(): void {
  const demo = state.sim.demo;
  state.orders.forEach((order) => {
    const seconds = STAGE_SECONDS[order.stage];
    if (demo - order.stageAt < seconds) return;
    const next = STAGES[STAGES.indexOf(order.stage) + 1];
    if (!next) return;
    order.stage = next;
    order.stageAt = demo;
    if (next === 'factura') {
      state.seq.invoice += 1;
      order.invoice = `B 0004-${String(state.seq.invoice).padStart(8, '0')}`;
      log('pedido', 'info', `Factura simulada ${order.invoice}`, { channel: order.channel, meta: order.number });
    }
    if (next === 'etiqueta') {
      order.tracking = `LT${String(order.number.replace(/\D/g, '')).padStart(9, '0')}AR`;
      log('pedido', 'info', `Etiqueta de envío generada ${order.tracking}`, { channel: order.channel, meta: order.number });
    }
    emit({ type: 'order', order });
  });
}

export function cancelOrder(id: string): void {
  const order = state.orders.find((item) => item.id === id);
  if (!order || order.stage === 'cancelado' || order.stage === 'despachado') return;
  order.stage = 'cancelado';
  order.stageAt = state.sim.demo;
  order.lines.forEach((line) => {
    setStock(line.p, (state.stock[line.p] ?? 0) + line.q, { channel: order.channel, reason: 'cancelacion', ref: order.number });
    enqueueSync(line.p);
  });
  log('pedido', 'warn', `Pedido ${order.number} cancelado a mano: stock devuelto`, { channel: order.channel });
  emit({ type: 'order', order });
}

export function restock(p: number, units: number, ref = 'Reposición manual'): void {
  setStock(p, (state.stock[p] ?? 0) + units, { channel: null, reason: 'reposicion', ref });
  log('stock', 'ok', `Ingreso de ${formatUnits(units)} u.: ${productAt(p).name}`, { p, meta: ref });
  enqueueSync(p);
}

export function adjustStock(p: number, value: number, ref: string): void {
  setStock(p, Math.max(0, value), { channel: null, reason: 'ajuste', ref });
  enqueueSync(p);
}

/** Pushes one product to every channel right now (skips latency). */
export function forceSync(p: number): void {
  enqueueSync(p, CHANNEL_IDS, true);
  log('sync', 'info', `Sincronización forzada: ${productAt(p).name}`, { p });
}

/* ---------- conflicts ---------- */

export function raiseMismatch(p: number, channel: ChannelId, remote: number): Conflict {
  state.published[channel][p] = remote;
  state.seq.conflict += 1;
  const conflict: Conflict = {
    id: state.seq.conflict,
    at: state.sim.now,
    kind: 'stock_mismatch',
    channel,
    p,
    central: targetFor(p, channel),
    remote,
    code: 'Stock editado desde el panel del canal',
    status: 'open',
    resolution: null,
  };
  state.conflicts.unshift(conflict);
  cap(state.conflicts, LIMITS.conflicts);
  log('conflicto', 'warn', `Diferencia de stock: canal ${remote} u. · central ${conflict.central} u.`, { channel, p, meta: conflict.code });
  notify('conflict', `Conflicto en ${CHANNEL_BY_ID[channel].name}`, `${productAt(p).name}: el canal muestra ${remote} u. y el sistema central ${conflict.central} u.`, '/sincronizacion?filtro=conflictos');
  emit({ type: 'conflict', conflict });
  return conflict;
}

export function raisePriceMismatch(p: number, channel: ChannelId): Conflict {
  const expected = channelPriceFor(p, channel);
  state.seq.conflict += 1;
  const conflict: Conflict = {
    id: state.seq.conflict,
    at: state.sim.now,
    kind: 'price_mismatch',
    channel,
    p,
    central: expected,
    remote: Math.round((expected * 0.88) / 50) * 50,
    code: 'Precio cambiado desde el panel del canal',
    status: 'open',
    resolution: null,
  };
  state.conflicts.unshift(conflict);
  cap(state.conflicts, LIMITS.conflicts);
  log('conflicto', 'warn', 'Precio distinto al de la regla del canal', { channel, p, meta: conflict.code });
  notify('conflict', `Precio desalineado en ${CHANNEL_BY_ID[channel].name}`, productAt(p).name, '/sincronizacion?filtro=conflictos');
  emit({ type: 'conflict', conflict });
  return conflict;
}

export type Resolution = 'push' | 'accept' | 'retry' | 'dismiss';

export const RESOLUTION_LABEL: Readonly<Record<Resolution, string>> = {
  push: 'Se impuso el valor del sistema central',
  accept: 'Se aceptó el valor del canal',
  retry: 'Reintento manual enviado',
  dismiss: 'Descartado',
};

export function resolveConflict(id: number, resolution: Resolution): void {
  const conflict = state.conflicts.find((item) => item.id === id);
  if (!conflict || conflict.status !== 'open') return;
  conflict.status = 'resolved';
  conflict.resolution = RESOLUTION_LABEL[resolution];
  if (resolution === 'accept' && conflict.kind === 'stock_mismatch') {
    // The channel's number becomes the truth: central absorbs the difference, then fans out.
    const central = state.stock[conflict.p] ?? 0;
    const delta = conflict.remote - conflict.central;
    adjustStock(conflict.p, central + delta, `Conflicto #${conflict.id}`);
  } else if (resolution === 'push' || resolution === 'retry') {
    enqueueSync(conflict.p, [conflict.channel], true);
  }
  log('resuelto', 'ok', `Conflicto #${conflict.id} resuelto: ${conflict.resolution.toLowerCase()}`, { channel: conflict.channel, p: conflict.p });
  emit({ type: 'conflict', conflict });
}

export function resolveAll(): number {
  const open = openConflicts();
  open.forEach((conflict) => resolveConflict(conflict.id, conflict.kind === 'sync_failed' ? 'retry' : 'push'));
  return open.length;
}

/* ---------- rules and channels ---------- */

export function setRules(partial: Partial<State['rules']>, announce = true): void {
  Object.assign(state.rules, partial);
  if (partial.reserve) state.rules.reserve = { ...partial.reserve };
  emit({ type: 'rules' });
  if (!announce) return;
  log('regla', 'info', 'Reglas de stock actualizadas: republicando catálogo', { meta: 'Lote en los tres canales' });
  CHANNEL_IDS.forEach((channel) => {
    state.jobs = state.jobs.filter((job) => !(job.channel === channel && job.p < 0));
    state.seq.job += 1;
    const settings = state.channels[channel];
    state.jobs.push({
      id: state.seq.job,
      p: -1,
      channel,
      createdAt: state.sim.demo,
      dueAt: state.sim.demo + settings.latency * 1.4,
      attempt: 0,
      status: settings.connected && settings.autoSync ? 'queued' : 'waiting',
    });
  });
  emit({ type: 'jobs' });
}

export function setChannel(channel: ChannelId, partial: Partial<ChannelState>): void {
  const settings = state.channels[channel];
  const wasLive = settings.connected && settings.autoSync;
  Object.assign(settings, partial);
  const live = settings.connected && settings.autoSync;
  const name = CHANNEL_BY_ID[channel].name;
  if ('connected' in partial && partial.connected !== undefined) {
    log('canal', partial.connected ? 'ok' : 'warn', partial.connected ? `${name} conectado` : `${name} desconectado: los cambios quedan en cola`, { channel });
    notify(partial.connected ? 'system' : 'error', partial.connected ? `${name} volvió a estar en línea` : `${name} fuera de línea`, partial.connected ? 'Se envían los cambios pendientes.' : 'Las ventas de ese canal se pausan y los cambios esperan en cola.', '/canales');
  }
  if ('markup' in partial) log('regla', 'info', `Nuevo recargo de precio para ${name}: ${settings.markup} %`, { channel });
  if (!wasLive && live) wakeJobs(channel);
  emit({ type: 'channel', channel });
  emit({ type: 'jobs' });
}

/* ---------- clock ---------- */

/** Advances simulated time; rolls the daily KPIs over at midnight. */
export function advanceClock(simMs: number, demoSeconds: number): void {
  const before = dayStart(state.sim.now);
  state.sim.now += simMs;
  state.sim.demo += demoSeconds;
  const after = dayStart(state.sim.now);
  if (after !== before) {
    state.days.push({ day: before, sales: state.kpi.sales, orders: state.kpi.orders });
    cap(state.days, 30);
    const { avoided, syncs, latencySum } = state.kpi;
    state.kpi = emptyKpi();
    Object.assign(state.kpi, { avoided, syncs, latencySum });
    log('canal', 'info', 'Cierre del día: totales archivados en reportes');
    emit({ type: 'kpi' });
  }
  emit({ type: 'clock' });
}

export function setPaused(paused: boolean): void {
  state.sim.paused = paused;
  emit({ type: 'sim' });
}

export function setSpeed(speed: Speed): void {
  state.sim.speed = speed;
  emit({ type: 'sim' });
}

export function announceFastForward(active: boolean): void {
  emit({ type: 'fast-forward', active });
}

/* ---------- persistence ---------- */

let persistTimer = 0;
let frozen = false;

/** Throttled, not debounced: under a constant stream of events a debounce would never fire. */
function schedulePersist(): void {
  if (frozen || persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = 0;
    persist();
  }, 1500);
}

export function persist(): void {
  if (frozen) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Private mode or full storage: the demo keeps working in memory. */
  }
}

export function hydrate(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as State;
    if (saved.version !== VERSION || saved.stock?.length !== PRODUCTS.length) return false;
    Object.assign(state, saved);
    return true;
  } catch {
    return false;
  }
}

/** Showcase mode never touches the visitor's saved session. */
export function freezePersistence(): void {
  frozen = true;
  window.clearTimeout(persistTimer);
}

export function resetDemo(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.clearTimeout(persistTimer);
  frozen = true;
}
