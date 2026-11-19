import { CHANNEL_BY_ID, CHANNEL_IDS, isChannelId } from '../../data/channels';
import { productAt } from '../../data/catalog';
import { history, type HistoricOrder } from '../../data/history';
import { formatClock, formatDateTime, formatMoney, formatUnits } from '../../lib/format';
import { downloadFile, escapeHtml, setText, slideIn } from '../dom';
import { mountOrderDialog, openOrder } from '../order-dialog';
import type { Scope } from '../scope';
import { STAGE_LABEL, state, type LiveOrder } from '../store';

const PAGE = 40;

type Row = LiveOrder & { historic: boolean };

function fromHistory(order: HistoricOrder): Row {
  return {
    id: order.id,
    number: order.number,
    channel: order.channel,
    at: order.at,
    lines: order.lines,
    total: order.total,
    customer: order.customer,
    city: order.city,
    stage: order.cancelled ? 'cancelado' : 'despachado',
    stageAt: 0,
    invoice: order.cancelled ? null : `B 0004-${String(Number(order.number.replace(/\D/g, '')) - 8500).padStart(8, '0')}`,
    tracking: order.cancelled ? null : `LT${order.number.replace(/\D/g, '').padStart(9, '0')}AR`,
    manual: false,
    historic: true,
  };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function stagePill(order: LiveOrder): string {
  const tone = order.stage === 'despachado' ? 'pill--ok' : order.stage === 'cancelado' ? 'pill--error' : order.stage === 'nuevo' ? 'pill--warn' : 'pill--info';
  return `<span class="pill ${tone}">${STAGE_LABEL[order.stage]}</span>`;
}

function rowHtml(order: Row): string {
  const channel = CHANNEL_BY_ID[order.channel];
  const first = productAt(order.lines[0]?.p ?? 0);
  const more = order.lines.length > 1 ? ` y ${order.lines.length - 1} más` : '';
  return `<tr class="order-row" data-order-row="${order.id}">
    <td class="cell-main"><button class="row-link link-reset" type="button" data-open="${order.id}">${order.number}</button><span class="sku">${order.historic ? formatDateTime(order.at) : `Hoy ${formatClock(order.at)}`}${order.manual ? ' · venta manual' : ''}</span></td>
    <td data-label="Canal"><span class="pill pill--${channel.id}">${escapeHtml(channel.name)}</span></td>
    <td data-label="Cliente">${escapeHtml(order.customer)}<span class="sku"> · ${escapeHtml(order.city)}</span></td>
    <td data-label="Productos" class="cell-items">${escapeHtml(first.name)}${more}</td>
    <td class="num" data-label="Total">${formatMoney(order.total)}</td>
    <td data-label="Estado" data-stage-cell>${stagePill(order)}</td>
  </tr>`;
}

export function mount(root: HTMLElement, scope: Scope): void {
  mountOrderDialog();
  const rows = root.querySelector<HTMLElement>('[data-rows]');
  const info = root.querySelector('[data-info]');
  const more = root.querySelector<HTMLButtonElement>('[data-more]');
  const search = root.querySelector<HTMLInputElement>('[data-search]');
  const channelSelect = root.querySelector<HTMLSelectElement>('[data-channel]');
  const stageSelect = root.querySelector<HTMLSelectElement>('[data-stage]');
  if (!rows) return;
  const params = new URLSearchParams(location.search);
  let period: 'today' | 'month' = 'today';
  let limit = PAGE;
  const canal = params.get('canal');
  if (channelSelect && isChannelId(canal)) channelSelect.value = canal;
  let monthRows: Row[] | null = null;

  function source(): Row[] {
    if (period === 'today') return state.orders.map((order) => ({ ...order, historic: false }));
    monthRows ??= history()
      .slice()
      .reverse()
      .map(fromHistory);
    return monthRows;
  }

  function matches(order: Row): boolean {
    if (channelSelect?.value && order.channel !== channelSelect.value) return false;
    const stage = stageSelect?.value;
    if (stage === 'abiertos' && (order.stage === 'despachado' || order.stage === 'cancelado')) return false;
    if ((stage === 'despachado' || stage === 'cancelado') && order.stage !== stage) return false;
    const query = normalize(search?.value.trim() ?? '');
    if (!query) return true;
    return normalize(`${order.number} ${order.customer} ${order.city}`).includes(query);
  }

  function render(): void {
    const list = source().filter(matches);
    const page = list.slice(0, limit);
    rows!.innerHTML = page.length
      ? page.map(rowHtml).join('')
      : `<tr><td colspan="6"><div class="empty"><p class="empty__title">No hay pedidos con estos filtros</p><p>Cambiá el canal o el estado, o esperá unos segundos: entran pedidos nuevos todo el tiempo.</p></div></td></tr>`;
    setText(info, `Mostrando ${formatUnits(page.length)} de ${formatUnits(list.length)} pedidos`);
    if (more) more.hidden = page.length >= list.length;
    root.querySelectorAll('[data-period]').forEach((chip) => chip.setAttribute('aria-pressed', String((chip as HTMLElement).dataset['period'] === period)));
  }

  function renderSplit(): void {
    setText(root.querySelector('[data-period-count="today"]'), formatUnits(state.orders.length));
    CHANNEL_IDS.forEach((channel) => {
      const card = root.querySelector(`[data-split="${channel}"]`);
      const stats = state.kpi.byChannel[channel];
      setText(card?.querySelector('[data-split-orders]') ?? null, formatUnits(stats.orders));
      setText(card?.querySelector('[data-split-sales]') ?? null, `${formatMoney(stats.sales)} · ${formatUnits(stats.units)} u.`);
    });
  }

  render();
  renderSplit();
  const opened = params.get('pedido');
  if (opened) {
    const live = state.orders.find((order) => order.id === opened);
    const old = history().find((order) => order.id === opened);
    if (live) openOrder(live.id);
    else if (old) openOrder(old.id, fromHistory(old));
  }

  scope.listen((event) => {
    if (event.type === 'sale') {
      renderSplit();
      if (period !== 'today' || !matches({ ...event.order, historic: false })) return;
      rows!.querySelector('.empty')?.closest('tr')?.remove();
      rows!.insertAdjacentHTML('afterbegin', rowHtml({ ...event.order, historic: false }));
      slideIn(rows!.firstElementChild);
      while (rows!.children.length > limit) rows!.lastElementChild?.remove();
    } else if (event.type === 'order') {
      const cell = rows!.querySelector(`[data-order-row="${event.order.id}"] [data-stage-cell]`);
      if (cell) cell.innerHTML = stagePill(event.order);
    } else if (event.type === 'kpi') renderSplit();
  });

  scope.on(rows, 'click', (event) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-order-row]');
    const id = target?.dataset['orderRow'];
    if (!id) return;
    const row = source().find((order) => order.id === id);
    if (row) openOrder(row.id, row);
  });
  if (search) scope.on(search, 'input', () => render());
  if (channelSelect) scope.on(channelSelect, 'change', () => render());
  if (stageSelect) scope.on(stageSelect, 'change', () => render());
  root.querySelectorAll<HTMLButtonElement>('[data-period]').forEach((chip) => {
    scope.on(chip, 'click', () => {
      period = chip.dataset['period'] === 'month' ? 'month' : 'today';
      limit = PAGE;
      render();
    });
  });
  if (more) {
    scope.on(more, 'click', () => {
      limit += PAGE;
      render();
    });
  }

  const exportCsv = (): void => {
    const header = 'pedido;fecha;canal;cliente;ciudad;unidades;total;estado';
    const lines = source()
      .filter(matches)
      .map((order) =>
        [order.number, new Date(order.at).toISOString(), CHANNEL_BY_ID[order.channel].name, order.customer, order.city, order.lines.reduce((sum, line) => sum + line.q, 0), order.total, STAGE_LABEL[order.stage]].join(';'),
      );
    downloadFile(`pedidos-${period === 'today' ? 'hoy' : 'octubre'}.csv`, [header, ...lines].join('\n'), 'text/csv;charset=utf-8');
  };
  const exportButton = root.querySelector('[data-export]');
  if (exportButton) scope.on(exportButton, 'click', exportCsv);
  if (params.has('exportar')) exportCsv();
}
