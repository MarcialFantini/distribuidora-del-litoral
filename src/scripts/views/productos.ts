import { CATEGORY_BY_ID, PRODUCTS, type Product } from '../../data/catalog';
import { CHANNEL_IDS } from '../../data/channels';
import { formatMoney, formatUnits } from '../../lib/format';
import { LEVEL_LABEL, stockLevel } from '../../lib/stock';
import { downloadFile, escapeHtml, flash, setText } from '../dom';
import type { Scope } from '../scope';
import { jobFor, state } from '../store';

type Status = 'all' | 'low' | 'out' | 'syncing';
type Sort = 'name' | 'stock' | 'price' | null;
const PAGE = 30;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function isSyncing(p: number): boolean {
  return CHANNEL_IDS.some((channel) => Boolean(jobFor(p, channel)));
}

function statusOf(product: Product): Status {
  const level = stockLevel(state.stock[product.index] ?? 0, product.min);
  return level === 'ok' ? 'all' : level;
}

function channelCell(p: number, channel: (typeof CHANNEL_IDS)[number]): string {
  const job = jobFor(p, channel);
  const value = state.published[channel][p] ?? 0;
  const sync = job ? (job.status === 'retrying' ? 'retry' : 'pending') : 'ok';
  return `<td class="num" data-label="${channel === 'mkt' ? 'Bazar Federal' : channel === 'web' ? 'Vitrina Plus' : 'litoral.shop'}" data-ch-cell="${channel}"><span data-v><span class="sync-dot sync-dot--${sync}" aria-hidden="true"></span>${formatUnits(value)}</span></td>`;
}

function rowHtml(product: Product): string {
  const central = state.stock[product.index] ?? 0;
  const level = stockLevel(central, product.min);
  const pill = level === 'out' ? 'pill--error' : level === 'low' ? 'pill--warn' : 'pill--ok';
  const syncing = isSyncing(product.index);
  return `<tr data-p="${product.index}">
    <td class="cell-product"><a class="row-link" href="/productos/${product.sku.toLowerCase()}">${escapeHtml(product.name)}</a><span class="sku">${product.sku}</span></td>
    <td data-label="Categoría">${escapeHtml(CATEGORY_BY_ID[product.category]?.label ?? '')}</td>
    <td class="num cell-central" data-label="Central" data-central>${formatUnits(central)}</td>
    ${CHANNEL_IDS.map((channel) => channelCell(product.index, channel)).join('')}
    <td class="num" data-label="Precio base">${formatMoney(product.price)}</td>
    <td data-label="Estado" data-state><span class="pill ${syncing ? 'pill--info' : pill}">${syncing ? 'Sincronizando' : LEVEL_LABEL[level]}</span></td>
  </tr>`;
}

export function mount(root: HTMLElement, scope: Scope): void {
  const rows = root.querySelector<HTMLElement>('[data-rows]');
  const info = root.querySelector('[data-info]');
  const more = root.querySelector<HTMLButtonElement>('[data-more]');
  const search = root.querySelector<HTMLInputElement>('[data-search]');
  const category = root.querySelector<HTMLSelectElement>('[data-category]');
  if (!rows) return;
  const params = new URLSearchParams(location.search);
  let query = params.get('q') ?? '';
  let status: Status = (params.get('estado') as Status | null) ?? 'all';
  let sort: Sort = null;
  let limit = PAGE;
  if (search) search.value = query;

  function filtered(): Product[] {
    const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
    const list = PRODUCTS.filter((product) => {
      if (category?.value && product.category !== category.value) return false;
      if (status === 'syncing' && !isSyncing(product.index)) return false;
      if ((status === 'low' || status === 'out') && statusOf(product) !== status) return false;
      if (!tokens.length) return true;
      const haystack = normalize(`${product.name} ${product.sku} ${product.ean}`);
      return tokens.every((token) => haystack.includes(token));
    });
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    if (sort === 'stock') list.sort((a, b) => (state.stock[a.index] ?? 0) - (state.stock[b.index] ?? 0));
    if (sort === 'price') list.sort((a, b) => b.price - a.price);
    return list;
  }

  function renderCounts(): void {
    let low = 0;
    let out = 0;
    let syncing = 0;
    PRODUCTS.forEach((product) => {
      const value = statusOf(product);
      if (value === 'low') low += 1;
      if (value === 'out') out += 1;
      if (isSyncing(product.index)) syncing += 1;
    });
    setText(root.querySelector('[data-status-count="low"]'), formatUnits(low));
    setText(root.querySelector('[data-status-count="out"]'), formatUnits(out));
    setText(root.querySelector('[data-status-count="syncing"]'), formatUnits(syncing));
  }

  function render(): void {
    const list = filtered();
    const page = list.slice(0, limit);
    rows!.innerHTML = page.length
      ? page.map(rowHtml).join('')
      : `<tr><td colspan="8"><div class="empty"><p class="empty__title">Ningún producto coincide</p><p>Probá con otro nombre, un SKU como DL-LAV-004 o quitá los filtros.</p></div></td></tr>`;
    setText(info, `Mostrando ${formatUnits(page.length)} de ${formatUnits(list.length)} productos`);
    if (more) more.hidden = page.length >= list.length;
    root.querySelectorAll('[data-status]').forEach((chip) => chip.setAttribute('aria-pressed', String((chip as HTMLElement).dataset['status'] === status)));
    renderCounts();
  }

  /** Live: only the rows that changed are patched, so the table never jumps. */
  function patch(p: number): void {
    const row = rows!.querySelector<HTMLElement>(`tr[data-p="${p}"]`);
    if (!row) return;
    const product = PRODUCTS[p];
    if (!product) return;
    const central = row.querySelector('[data-central]');
    const next = formatUnits(state.stock[p] ?? 0);
    if (central && central.textContent !== next) {
      central.textContent = next;
      flash(central);
    }
    CHANNEL_IDS.forEach((channel) => {
      const cell = row.querySelector(`[data-ch-cell="${channel}"]`);
      if (cell) cell.outerHTML = channelCell(p, channel);
    });
    const tmp = document.createElement('tbody');
    tmp.innerHTML = rowHtml(product);
    const stateCell = tmp.querySelector('[data-state]');
    const current = row.querySelector('[data-state]');
    if (stateCell && current) current.innerHTML = stateCell.innerHTML;
  }

  const dirty = new Set<number>();
  let timer = 0;
  function flush(): void {
    timer = 0;
    dirty.forEach(patch);
    dirty.clear();
    renderCounts();
  }

  render();
  scope.add(() => window.clearTimeout(timer));
  scope.listen((event) => {
    if (event.type === 'stock') dirty.add(event.p);
    else if (event.type === 'published' && event.p >= 0) dirty.add(event.p);
    else if (event.type === 'published' || event.type === 'rules') {
      render();
      return;
    } else if (event.type !== 'jobs') return;
    if (event.type === 'jobs') state.jobs.forEach((job) => job.p >= 0 && dirty.add(job.p));
    if (!timer) timer = window.setTimeout(flush, 300);
  });

  if (search) {
    scope.on(search, 'input', () => {
      query = search.value;
      limit = PAGE;
      render();
    });
  }
  if (category) scope.on(category, 'change', () => render());
  root.querySelectorAll<HTMLButtonElement>('[data-status]').forEach((chip) => {
    scope.on(chip, 'click', () => {
      status = (chip.dataset['status'] ?? 'all') as Status;
      limit = PAGE;
      render();
    });
  });
  root.querySelectorAll<HTMLButtonElement>('[data-sort]').forEach((button) => {
    scope.on(button, 'click', () => {
      const next = button.dataset['sort'] as Sort;
      sort = sort === next ? null : next;
      root.querySelectorAll('[data-sort]').forEach((item) => item.setAttribute('aria-pressed', String((item as HTMLElement).dataset['sort'] === sort)));
      render();
    });
  });
  if (more) {
    scope.on(more, 'click', () => {
      limit += PAGE;
      render();
    });
  }
  const exportButton = root.querySelector('[data-export]');
  if (exportButton) {
    scope.on(exportButton, 'click', () => {
      const header = 'sku;producto;categoria;central;bazar_federal;vitrina_plus;litoral_shop;precio_base';
      const lines = filtered().map((product) =>
        [
          product.sku,
          `"${product.name}"`,
          CATEGORY_BY_ID[product.category]?.label ?? '',
          state.stock[product.index] ?? 0,
          ...CHANNEL_IDS.map((channel) => state.published[channel][product.index] ?? 0),
          product.price,
        ].join(';'),
      );
      downloadFile('productos-distribuidora-del-litoral.csv', [header, ...lines].join('\n'), 'text/csv;charset=utf-8');
    });
  }
}
