import { CHANNEL_BY_ID, CHANNEL_IDS } from '../../data/channels';
import { productAt } from '../../data/catalog';
import { formatClock, formatMoney, formatSeconds, formatUnits } from '../../lib/format';
import { iconSvg } from '../../lib/icons';
import { escapeHtml, setText, slideIn } from '../dom';
import { eventHtml, matchesFilter, type FeedFilter } from '../event-row';
import type { Scope } from '../scope';
import { toast } from '../shell/toasts';
import { averageLatency, channelHealth, openConflicts, resolveAll, resolveConflict, state, type Conflict, type LogEvent, type Resolution } from '../store';

const ROWS = 60;
const HEALTH = { ok: ['pill--ok', 'Conectado'], degraded: ['pill--warn', 'Con reintentos'], down: ['pill--error', 'Desconectado'] } as const;

const KIND_TITLE: Readonly<Record<Conflict['kind'], string>> = {
  sync_failed: 'Sincronización fallida',
  stock_mismatch: 'Diferencia de stock',
  price_mismatch: 'Precio desalineado',
};

function actions(conflict: Conflict): [Resolution, string][] {
  if (conflict.kind === 'sync_failed') return [['retry', 'Reintentar ahora'], ['dismiss', 'Descartar']];
  if (conflict.kind === 'price_mismatch') return [['push', 'Republicar precio de la regla'], ['dismiss', 'Mantener precio del canal']];
  return [['push', 'Imponer stock central'], ['accept', 'Aceptar valor del canal'], ['dismiss', 'Descartar']];
}

function conflictHtml(conflict: Conflict): string {
  const channel = CHANNEL_BY_ID[conflict.channel];
  const product = productAt(conflict.p);
  const isPrice = conflict.kind === 'price_mismatch';
  const value = (amount: number) => (isPrice ? formatMoney(amount) : `${formatUnits(amount)} u.`);
  const resolved = conflict.status === 'resolved';
  return `<article class="conflict conflict--${conflict.kind}${resolved ? ' conflict--resolved' : ''}" data-conflict="${conflict.id}">
    <header class="conflict__head">
      <span class="conflict__title">#${conflict.id} · ${KIND_TITLE[conflict.kind]}</span>
      <span class="pill pill--${channel.id}">${escapeHtml(channel.name)}</span>
      <time class="num">${formatClock(conflict.at)}</time>
    </header>
    <a class="ev__product" href="/productos/${product.sku.toLowerCase()}">${escapeHtml(product.name)} · ${product.sku}</a>
    <div class="conflict__compare">
      <div>${conflict.kind === 'sync_failed' ? 'Debería mostrar' : 'Sistema central'}<b class="num">${value(conflict.central)}</b></div>
      <div>${conflict.kind === 'sync_failed' ? 'Muestra todavía' : 'Canal'}<b class="num">${value(conflict.remote)}</b></div>
    </div>
    <p class="card__sub">${escapeHtml(conflict.code)}</p>
    ${
      resolved
        ? `<p class="pill pill--ok">${escapeHtml(conflict.resolution ?? 'Resuelto')}</p>`
        : `<div class="conflict__actions">${actions(conflict)
            .map(([resolution, label], index) => `<button class="btn ${index ? 'btn--ghost' : ''} btn--sm" type="button" data-resolve="${resolution}">${label}</button>`)
            .join('')}</div>`
    }
  </article>`;
}

export function mount(root: HTMLElement, scope: Scope): void {
  const stream = root.querySelector<HTMLElement>('[data-stream]');
  const conflictsHost = root.querySelector<HTMLElement>('[data-conflicts]');
  const channelSelect = root.querySelector<HTMLSelectElement>('[data-stream-channel]');
  const pauseButton = root.querySelector<HTMLButtonElement>('[data-stream-pause]');
  if (!stream || !conflictsHost) return;
  let filter: FeedFilter = 'all';
  let frozen = false;
  let missed = 0;
  let pending: LogEvent[] = [];
  let timer = 0;

  const visible = (event: LogEvent): boolean => matchesFilter(event, filter) && (!channelSelect?.value || event.channel === channelSelect.value);

  function renderStream(): void {
    const rows = state.events.filter(visible).slice(0, ROWS);
    stream!.innerHTML = rows.length ? rows.map((event) => eventHtml(event)).join('') : '<li class="empty"><p>Sin eventos para este filtro.</p></li>';
    missed = 0;
    setText(root.querySelector('[data-stream-note]'), '');
  }

  function flush(): void {
    timer = 0;
    const fresh = pending.filter(visible).slice(0, 6);
    pending = [];
    if (!fresh.length) return;
    stream!.querySelector('.empty')?.remove();
    fresh.reverse().forEach((event) => {
      stream!.insertAdjacentHTML('afterbegin', eventHtml(event));
      slideIn(stream!.firstElementChild);
    });
    while (stream!.children.length > ROWS) stream!.lastElementChild?.remove();
  }

  function renderStats(): void {
    CHANNEL_IDS.forEach((channel) => {
      const card = root.querySelector(`[data-qstat="${channel}"]`);
      if (!card) return;
      const jobs = state.jobs.filter((job) => job.channel === channel);
      setText(card.querySelector('[data-qstat-queue]'), formatUnits(jobs.length));
      setText(card.querySelector('[data-qstat-retry]'), formatUnits(jobs.filter((job) => job.status === 'retrying').length));
      setText(card.querySelector('[data-qstat-latency]'), formatSeconds(averageLatency(channel)));
      const [tone, label] = HEALTH[channelHealth(channel)];
      const pill = card.querySelector('[data-qstat-health]');
      if (pill) {
        pill.className = `pill ${tone}`;
        pill.textContent = label;
      }
    });
  }

  function renderConflicts(): void {
    const open = openConflicts();
    const resolved = state.conflicts.filter((conflict) => conflict.status === 'resolved').slice(0, 4);
    setText(root.querySelector('[data-conflict-count]'), formatUnits(open.length));
    conflictsHost!.innerHTML = open.length
      ? open.map(conflictHtml).join('')
      : `<div class="empty">${iconSvg('shield', 28)}<p class="empty__title">Sin conflictos abiertos</p><p>Los tres canales coinciden con el sistema central.</p></div>`;
    if (resolved.length) conflictsHost!.insertAdjacentHTML('beforeend', `<h3 class="card__sub conflicts__past">Resueltos recientemente</h3>${resolved.map(conflictHtml).join('')}`);
  }

  renderStream();
  renderStats();
  renderConflicts();
  if (new URLSearchParams(location.search).get('filtro') === 'conflictos') {
    const panel = root.querySelector<HTMLElement>('#conflictos');
    panel?.scrollIntoView({ block: 'start' });
    panel?.focus({ preventScroll: true });
  }

  let statsQueued = 0;
  scope.add(() => {
    window.clearTimeout(timer);
    window.clearTimeout(statsQueued);
  });
  scope.listen((event) => {
    if (event.type === 'event') {
      if (frozen) {
        if (visible(event.event)) {
          missed += 1;
          setText(root.querySelector('[data-stream-note]'), `${missed} eventos nuevos en pausa`);
        }
        return;
      }
      pending.unshift(event.event);
      if (!timer) timer = window.setTimeout(flush, 150);
    } else if (event.type === 'conflict') renderConflicts();
    if (event.type === 'jobs' || event.type === 'channel' || event.type === 'published' || event.type === 'conflict') {
      if (!statsQueued)
        statsQueued = window.setTimeout(() => {
          statsQueued = 0;
          renderStats();
        }, 300);
    }
  });

  scope.on(conflictsHost, 'click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-resolve]');
    const card = button?.closest<HTMLElement>('[data-conflict]');
    if (!button || !card) return;
    resolveConflict(Number(card.dataset['conflict']), button.dataset['resolve'] as Resolution);
    toast({ title: 'Conflicto resuelto', body: button.textContent ?? '', icon: 'check', tone: 'ok' });
  });
  const resolveAllButton = root.querySelector('[data-resolve-all]');
  if (resolveAllButton) {
    scope.on(resolveAllButton, 'click', () => {
      const count = resolveAll();
      toast({ title: count ? `${count} conflictos resueltos` : 'No hay conflictos abiertos', body: count ? 'Se impuso el sistema central y se reintentaron las fallas.' : '', icon: 'check', tone: 'ok' });
    });
  }
  root.querySelectorAll<HTMLButtonElement>('[data-feed-filter]').forEach((chip) => {
    scope.on(chip, 'click', () => {
      filter = (chip.dataset['feedFilter'] ?? 'all') as FeedFilter;
      root.querySelectorAll('[data-feed-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === chip)));
      renderStream();
    });
  });
  if (channelSelect) scope.on(channelSelect, 'change', renderStream);
  if (pauseButton) {
    scope.on(pauseButton, 'click', () => {
      frozen = !frozen;
      pauseButton.setAttribute('aria-pressed', String(frozen));
      pauseButton.innerHTML = `${iconSvg(frozen ? 'play' : 'pause', 14)} ${frozen ? 'Seguir en vivo' : 'Congelar'}`;
      if (!frozen) renderStream();
    });
  }
}
