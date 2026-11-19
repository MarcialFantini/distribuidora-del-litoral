import { navigate } from 'astro:transitions/client';
import { CATEGORY_BY_ID, PRODUCTS } from '../../data/catalog';
import { CHANNELS } from '../../data/channels';
import { formatUnits } from '../../lib/format';
import { NAV } from '../../lib/nav';
import { escapeHtml } from '../dom';
import { STAGE_LABEL, openConflicts, resolveAll, setChannel, setPaused, setSpeed, state } from '../store';
import { toggleNotifications } from './notifications';
import { askReset, openShortcuts, sellManually, startFastForward } from './shell';
import { toast } from './toasts';

type Item = { group: string; label: string; meta: string; glyph: string; keywords: string; run: () => void };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function go(href: string): () => void {
  return () => void navigate(href);
}

function buildItems(): Item[] {
  const actions: Item[] = [
    {
      group: 'Acciones',
      label: state.sim.paused ? 'Reanudar simulación' : 'Pausar simulación',
      meta: 'P',
      glyph: state.sim.paused ? '▶' : 'II',
      keywords: 'pausa pausar reanudar simulacion vivo',
      run: () => setPaused(!state.sim.paused),
    },
    { group: 'Acciones', label: 'Adelantar un día de pedidos', meta: 'F', glyph: '»', keywords: 'adelantar tiempo dia rapido', run: startFastForward },
    ...CHANNELS.map((channel) => ({
      group: 'Acciones',
      label: `Vender a mano en ${channel.name}`,
      meta: channel.kind,
      glyph: channel.initials,
      keywords: `vender venta manual ${channel.kind}`,
      run: () => sellManually(channel.id),
    })),
    ...([1, 4, 10] as const).map((speed) => ({
      group: 'Acciones',
      label: `Velocidad ${speed}x`,
      meta: speed === state.sim.speed ? 'Actual' : 'S',
      glyph: `${speed}x`,
      keywords: `velocidad rapido acelerar ${speed}x`,
      run: () => {
        setSpeed(speed);
        setPaused(false);
        toast({ title: `Velocidad ${speed}x`, icon: 'play' });
      },
    })),
    {
      group: 'Acciones',
      label: `Resolver conflictos abiertos (${openConflicts().length})`,
      meta: 'Sincronización',
      glyph: '✓',
      keywords: 'resolver conflictos errores todos',
      run: () => {
        const count = resolveAll();
        toast({ title: count ? `${count} conflictos resueltos` : 'No hay conflictos abiertos', icon: 'check', tone: 'ok' });
      },
    },
    ...CHANNELS.map((channel) => {
      const connected = state.channels[channel.id].connected;
      return {
        group: 'Acciones',
        label: `${connected ? 'Desconectar' : 'Conectar'} ${channel.name}`,
        meta: 'Canales',
        glyph: connected ? '⏻' : '⚡',
        keywords: 'conectar desconectar caida canal simular',
        run: () => setChannel(channel.id, { connected: !connected }),
      };
    }),
    { group: 'Acciones', label: 'Exportar pedidos a CSV', meta: 'Pedidos', glyph: '↓', keywords: 'exportar csv descargar excel pedidos', run: go('/pedidos?exportar=1') },
    { group: 'Acciones', label: 'Ver notificaciones', meta: 'N', glyph: '!', keywords: 'notificaciones alertas', run: () => toggleNotifications(true) },
    { group: 'Acciones', label: 'Atajos de teclado', meta: '?', glyph: '?', keywords: 'atajos teclado ayuda', run: openShortcuts },
    { group: 'Acciones', label: 'Reiniciar demo', meta: '', glyph: '↺', keywords: 'reiniciar reset borrar demo', run: askReset },
  ];

  const views: Item[] = NAV.map((item) => ({
    group: 'Ir a',
    label: item.label,
    meta: item.key,
    glyph: item.key,
    keywords: `ir vista ${item.label}`,
    run: go(item.href),
  }));

  const conflictItems: Item[] = openConflicts().map((conflict) => ({
    group: 'Conflictos abiertos',
    label: `#${conflict.id} · ${PRODUCTS[conflict.p]?.name ?? ''}`,
    meta: CHANNELS.find((channel) => channel.id === conflict.channel)?.name ?? '',
    glyph: '!',
    keywords: `conflicto error ${conflict.code}`,
    run: go('/sincronizacion?filtro=conflictos'),
  }));

  const orderItems: Item[] = state.orders.slice(0, 60).map((order) => ({
    group: 'Pedidos de hoy',
    label: `${order.number} · ${order.customer}`,
    meta: STAGE_LABEL[order.stage],
    glyph: 'P',
    keywords: `pedido ${order.number} ${order.city}`,
    run: go(`/pedidos?pedido=${order.id}`),
  }));

  const productItems: Item[] = PRODUCTS.map((product) => ({
    group: 'Productos',
    label: product.name,
    meta: `${product.sku} · ${formatUnits(state.stock[product.index] ?? 0)} u.`,
    glyph: product.sku.slice(3, 5),
    keywords: `${product.sku} ${product.ean} ${CATEGORY_BY_ID[product.category]?.label ?? ''}`,
    run: go(`/productos/${product.sku.toLowerCase()}`),
  }));

  return [...actions, ...views, ...conflictItems, ...orderItems, ...productItems];
}

let items: Item[] = [];
let visible: Item[] = [];
let active = 0;

function highlight(label: string, query: string): string {
  if (!query) return escapeHtml(label);
  const index = normalize(label).indexOf(query);
  if (index < 0) return escapeHtml(label);
  return `${escapeHtml(label.slice(0, index))}<mark>${escapeHtml(label.slice(index, index + query.length))}</mark>${escapeHtml(label.slice(index + query.length))}`;
}

function search(raw: string): Item[] {
  const query = normalize(raw.trim());
  if (!query) {
    return [
      ...items.filter((item) => item.group === 'Acciones').slice(0, 5),
      ...items.filter((item) => item.group === 'Ir a'),
      ...items.filter((item) => item.group === 'Conflictos abiertos').slice(0, 3),
    ];
  }
  const tokens = query.split(/\s+/);
  return items
    .map((item) => {
      const label = normalize(item.label);
      const haystack = `${label} ${normalize(item.meta)} ${normalize(item.keywords)}`;
      if (!tokens.every((token) => haystack.includes(token))) return null;
      const score = (label.startsWith(query) ? 0 : label.includes(query) ? 1 : 2) + (item.group === 'Acciones' ? -0.5 : 0);
      return { item, score };
    })
    .filter((entry): entry is { item: Item; score: number } => entry !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, 40)
    .map((entry) => entry.item);
}

function render(): void {
  const input = document.querySelector<HTMLInputElement>('[data-palette-input]');
  const host = document.querySelector<HTMLElement>('[data-palette-results]');
  if (!input || !host) return;
  const query = normalize(input.value.trim());
  visible = search(input.value);
  active = Math.min(active, Math.max(0, visible.length - 1));
  if (!visible.length) {
    host.innerHTML = `<div class="empty"><p class="empty__title">Sin resultados</p><p>Probá con un SKU (DL-LAV-004), un número de pedido o una acción.</p></div>`;
    input.removeAttribute('aria-activedescendant');
    return;
  }
  let lastGroup = '';
  host.innerHTML = visible
    .map((item, index) => {
      const head = item.group !== lastGroup ? `<p class="palette__group" role="presentation">${item.group}</p>` : '';
      lastGroup = item.group;
      return `${head}<div class="palette__item" role="option" id="pal-${index}" data-index="${index}" aria-selected="${index === active}">
        <span class="palette__glyph" aria-hidden="true">${escapeHtml(item.glyph)}</span>
        <span class="palette__label">${highlight(item.label, query)}</span>
        <span class="palette__meta">${escapeHtml(item.meta)}</span>
      </div>`;
    })
    .join('');
  input.setAttribute('aria-activedescendant', `pal-${active}`);
}

function move(delta: number): void {
  if (!visible.length) return;
  active = (active + delta + visible.length) % visible.length;
  const host = document.querySelector<HTMLElement>('[data-palette-results]');
  host?.querySelectorAll('[role="option"]').forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
  host?.querySelector(`#pal-${active}`)?.scrollIntoView({ block: 'nearest' });
  document.querySelector('[data-palette-input]')?.setAttribute('aria-activedescendant', `pal-${active}`);
}

function runActive(index = active): void {
  const item = visible[index];
  if (!item) return;
  document.querySelector<HTMLDialogElement>('[data-palette]')?.close();
  item.run();
}

export function openPalette(query = ''): void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-palette]');
  const input = document.querySelector<HTMLInputElement>('[data-palette-input]');
  if (!dialog || !input) return;
  items = buildItems();
  active = 0;
  input.value = query;
  render();
  if (!dialog.open) dialog.showModal();
  input.focus();
}

/** For the showcase: types into the palette as a person would. */
export function typeInPalette(text: string): void {
  const input = document.querySelector<HTMLInputElement>('[data-palette-input]');
  if (!input) return;
  input.value = text;
  active = 0;
  render();
}

export function closePalette(): void {
  document.querySelector<HTMLDialogElement>('[data-palette]')?.close();
}

export function mountPalette(): void {
  const input = document.querySelector<HTMLInputElement>('[data-palette-input]');
  const host = document.querySelector<HTMLElement>('[data-palette-results]');
  input?.addEventListener('input', () => {
    active = 0;
    render();
  });
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runActive();
    }
  });
  host?.addEventListener('click', (event) => {
    const option = (event.target as Element).closest<HTMLElement>('[data-index]');
    if (option) runActive(Number(option.dataset['index']));
  });
  host?.addEventListener('pointermove', (event) => {
    const option = (event.target as Element).closest<HTMLElement>('[data-index]');
    const index = Number(option?.dataset['index'] ?? -1);
    if (option && index !== active) move(index - active);
  });
}
