import { navigate } from 'astro:transitions/client';
import { CHANNEL_BY_ID, CHANNEL_IDS, type ChannelId } from '../../data/channels';
import { FEATURED_INDEX, productAt } from '../../data/catalog';
import { CITIES } from '../../data/history';
import { formatClock, formatUnits } from '../../lib/format';
import { iconSvg } from '../../lib/icons';
import { NAV } from '../../lib/nav';
import { live } from '../random';
import { fastForward, isFastForwarding, isRunning } from '../sim';
import { channelHealth, registerSale, resetDemo, setPaused, setSpeed, state, subscribe, type Speed } from '../store';
import { announce, setText } from '../dom';
import { toggleNotifications } from './notifications';
import { openPalette } from './palette';
import { toast } from './toasts';

const SPEEDS: readonly Speed[] = [1, 4, 10];

export function renderSim(): void {
  const { paused, speed } = state.sim;
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
    button.setAttribute('aria-pressed', String(!paused && Number(button.dataset['speed']) === speed));
  });
  const pause = document.querySelector<HTMLButtonElement>('[data-sim-pause]');
  if (pause) {
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? 'Reanudar simulación' : 'Pausar simulación');
    pause.innerHTML = iconSvg(paused ? 'play' : 'pause', 16);
  }
  document.querySelector('[data-live]')?.classList.toggle('is-paused', paused);
  document.documentElement.classList.toggle('sim-paused', paused);
  const cycle = document.querySelector('[data-speed-cycle]');
  if (cycle) {
    cycle.textContent = `${speed}x`;
    cycle.setAttribute('aria-label', `Velocidad ${speed}x, cambiar`);
  }
  const label = !isRunning() ? 'Conectando' : paused ? 'En pausa' : speed === 1 ? 'En vivo' : `En vivo ${speed}x`;
  setText(document.querySelector('[data-live-label]'), label);
}

let lastMinute = -1;
function renderClock(): void {
  const minute = Math.floor(state.sim.now / 60_000);
  if (minute === lastMinute) return;
  lastMinute = minute;
  const clock = document.querySelector<HTMLTimeElement>('[data-clock]');
  if (clock) {
    clock.textContent = formatClock(state.sim.now);
    clock.dateTime = new Date(state.sim.now).toISOString();
  }
  if (isFastForwarding()) setText(document.querySelector('[data-ff-clock]'), formatClock(state.sim.now));
}

const HEALTH_LABEL = { ok: 'Conectado', degraded: 'Con reintentos', down: 'Desconectado' } as const;

function renderChannels(): void {
  CHANNEL_IDS.forEach((channel) => {
    const item = document.querySelector<HTMLElement>(`[data-side-channel="${channel}"]`);
    if (!item) return;
    const health = channelHealth(channel);
    item.dataset['health'] = health;
    setText(item.querySelector('[data-side-status]'), HEALTH_LABEL[health]);
    const queued = state.jobs.filter((job) => job.channel === channel).length;
    const queue = item.querySelector('[data-side-queue]');
    setText(queue, formatUnits(queued));
    queue?.setAttribute('title', `${queued} cambios en cola`);
  });
}

export function togglePause(): void {
  setPaused(!state.sim.paused);
  toast({ title: state.sim.paused ? 'Simulación en pausa' : 'Simulación reanudada', icon: state.sim.paused ? 'pause' : 'play' });
}

export function cycleSpeed(): void {
  const next = SPEEDS[(SPEEDS.indexOf(state.sim.speed) + 1) % SPEEDS.length] ?? 1;
  setSpeed(next);
  if (state.sim.paused) setPaused(false);
  toast({ title: `Velocidad ${next}x`, body: next === 1 ? 'Ritmo normal de la demo.' : 'Los pedidos y las sincronizaciones se aceleran.', icon: 'play' });
}

/** "Vender a mano": a real order on the chosen channel; the other two follow through the sync. */
export function sellManually(channel: ChannelId, p = FEATURED_INDEX, q = 1): void {
  const rng = live();
  const order = registerSale({ channel, lines: [{ p, q }], customer: 'Venta de mostrador', city: rng.pick(CITIES), manual: true });
  if (order.stage === 'cancelado') return;
  announce(`Venta de ${q} unidad en ${CHANNEL_BY_ID[channel].name}. Stock central: ${formatUnits(state.stock[p] ?? 0)}.`);
}

export function sellRandom(): void {
  const channel = live().pick(CHANNEL_IDS);
  sellManually(channel);
  toast({ title: `Venta manual en ${CHANNEL_BY_ID[channel].name}`, body: `1 × ${productAt(FEATURED_INDEX).name}`, icon: 'cart' });
}

let ffStart = { orders: 0, syncs: 0, now: 0 };
function startFastForward(): void {
  if (isFastForwarding()) return;
  ffStart = { orders: state.kpi.orders, syncs: state.kpi.syncs, now: state.sim.now };
  fastForward();
}

function renderFastForward(active: boolean): void {
  const overlay = document.querySelector<HTMLElement>('[data-ff-overlay]');
  document.documentElement.classList.toggle('is-fast', active);
  if (!overlay) return;
  overlay.hidden = !active;
  if (active) return;
  const orders = state.kpi.orders - ffStart.orders;
  toast({ title: 'Un día después', body: `${formatUnits(Math.max(0, orders))} pedidos y ${formatUnits(state.kpi.syncs - ffStart.syncs)} sincronizaciones, sin sobreventas.`, icon: 'forward', tone: 'ok' });
}

function renderFastForwardProgress(): void {
  if (!isFastForwarding()) return;
  const elapsed = state.sim.now - ffStart.now;
  const bar = document.querySelector<HTMLElement>('[data-ff-bar]');
  if (bar) bar.style.transform = `scaleX(${Math.min(1, elapsed / 86_400_000)})`;
  setText(document.querySelector('[data-ff-orders]'), formatUnits(Math.max(0, state.kpi.orders - ffStart.orders)));
  setText(document.querySelector('[data-ff-syncs]'), formatUnits(Math.max(0, state.kpi.syncs - ffStart.syncs)));
}

export function openShortcuts(): void {
  document.querySelector<HTMLDialogElement>('[data-shortcuts]')?.showModal();
}

export function askReset(): void {
  document.querySelector<HTMLDialogElement>('[data-reset-dialog]')?.showModal();
}

export function syncNav(view: string): void {
  const active = view === 'producto' ? 'productos' : view;
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((link) => {
    if (link.dataset['nav'] === active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

function bindKeys(): void {
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openPalette();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    if (document.querySelector('dialog[open]')) return;
    const key = event.key.toLowerCase();
    const nav = NAV.find((item) => item.key === key);
    if (nav) {
      event.preventDefault();
      void navigate(nav.href);
    } else if (key === '/') {
      event.preventDefault();
      openPalette();
    } else if (key === 'p') togglePause();
    else if (key === 's') cycleSpeed();
    else if (key === 'f') startFastForward();
    else if (key === 'v') sellRandom();
    else if (key === 'n') toggleNotifications();
    else if (event.key === '?') openShortcuts();
    else if (key === 'escape') toggleNotifications(false);
  });
}

let channelsQueued = false;
function queueChannels(): void {
  if (channelsQueued) return;
  channelsQueued = true;
  window.setTimeout(() => {
    channelsQueued = false;
    renderChannels();
  }, 400);
}

export function mountShell(): void {
  renderSim();
  renderClock();
  renderChannels();
  subscribe((event) => {
    if (event.type === 'clock') {
      renderClock();
      renderFastForwardProgress();
    }
    if (event.type === 'sim') renderSim();
    if (event.type === 'jobs' || event.type === 'channel' || event.type === 'conflict') queueChannels();
    if (event.type === 'fast-forward') renderFastForward(event.active);
  });
  document.querySelector('[data-sim-pause]')?.addEventListener('click', togglePause);
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
    button.addEventListener('click', () => {
      setSpeed(Number(button.dataset['speed']) as Speed);
      if (state.sim.paused) setPaused(false);
    });
  });
  document.querySelector('[data-speed-cycle]')?.addEventListener('click', cycleSpeed);
  document.querySelector('[data-fast-forward]')?.addEventListener('click', startFastForward);
  document.querySelector('[data-open-palette]')?.addEventListener('click', () => openPalette());
  document.querySelectorAll('[data-open-shortcuts]').forEach((button) => button.addEventListener('click', openShortcuts));
  document.querySelectorAll('[data-reset-demo]').forEach((button) => button.addEventListener('click', askReset));
  document.querySelector('[data-open-more]')?.addEventListener('click', () => document.querySelector<HTMLDialogElement>('[data-more]')?.showModal());
  document.querySelectorAll('[data-close-more]').forEach((item) =>
    item.addEventListener('click', () => document.querySelector<HTMLDialogElement>('[data-more]')?.close()),
  );
  document.querySelectorAll<HTMLButtonElement>('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });
  const resetDialog = document.querySelector<HTMLDialogElement>('[data-reset-dialog]');
  resetDialog?.addEventListener('close', () => {
    if (resetDialog.returnValue !== 'confirm') return;
    resetDemo();
    window.location.assign('/');
  });
  document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  bindKeys();
}

export { startFastForward };
