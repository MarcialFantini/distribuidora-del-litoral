import { CHANNEL_BY_ID } from '../data/channels';
import { productAt } from '../data/catalog';
import { formatClockSeconds } from '../lib/format';
import { iconSvg, type IconName } from '../lib/icons';
import { escapeHtml } from './dom';
import type { EventKind, LogEvent } from './store';

const ICON: Readonly<Record<EventKind, IconName>> = {
  venta: 'cart',
  sync: 'sync',
  reintento: 'reset',
  error: 'alert',
  conflicto: 'alert',
  resuelto: 'check',
  regla: 'sliders',
  canal: 'plug',
  stock: 'box',
  pedido: 'invoice',
};

export const KIND_LABEL: Readonly<Record<EventKind, string>> = {
  venta: 'Venta',
  sync: 'Sincronización',
  reintento: 'Reintento',
  error: 'Error',
  conflicto: 'Conflicto',
  resuelto: 'Resuelto',
  regla: 'Regla',
  canal: 'Canal',
  stock: 'Stock',
  pedido: 'Pedido',
};

export type FeedFilter = 'all' | 'venta' | 'sync' | 'problemas' | 'pedido';

export function matchesFilter(event: LogEvent, filter: FeedFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'sync') return event.kind === 'sync' || event.kind === 'resuelto' || event.kind === 'regla';
  if (filter === 'problemas') return event.level === 'error' || event.level === 'warn';
  return event.kind === filter;
}

export function eventHtml(event: LogEvent, linkProducts = true): string {
  const channel = event.channel ? CHANNEL_BY_ID[event.channel] : null;
  const product = event.p !== null ? productAt(event.p) : null;
  const productHtml = product
    ? linkProducts
      ? `<a class="ev__product" href="/productos/${product.sku.toLowerCase()}">${escapeHtml(product.name)}</a>`
      : `<span class="ev__product">${escapeHtml(product.name)}</span>`
    : '';
  return `<li class="ev ev--${event.level}" data-event="${event.id}">
    <span class="ev__icon">${iconSvg(ICON[event.kind], 15)}</span>
    <div class="ev__body">
      <p class="ev__text">${escapeHtml(event.text)}</p>
      <p class="ev__meta">${channel ? `<span class="pill pill--${channel.id}">${escapeHtml(channel.name)}</span>` : '<span class="pill pill--info">Central</span>'}${productHtml}${event.meta ? `<span class="ev__extra">${escapeHtml(event.meta)}</span>` : ''}</p>
    </div>
    <time class="ev__time num">${formatClockSeconds(event.at)}</time>
  </li>`;
}
