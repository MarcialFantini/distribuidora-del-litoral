import { CHANNEL_BY_ID } from '../data/channels';
import { productAt } from '../data/catalog';
import { formatClock, formatDay, formatMoney } from '../lib/format';
import { iconSvg } from '../lib/icons';
import { labelSvg } from '../lib/label';
import { downloadFile, escapeHtml } from './dom';
import { STAGES, STAGE_LABEL, cancelOrder, channelPriceFor, state, subscribe, type LiveOrder } from './store';

let current: string | null = null;
let snapshot: LiveOrder | null = null;

function timeline(order: LiveOrder): string {
  const reached = order.stage === 'cancelado' ? -1 : STAGES.indexOf(order.stage);
  const steps = STAGES.map((stage, index) => {
    const status = order.stage === 'cancelado' ? 'off' : index < reached || order.stage === 'despachado' ? 'done' : index === reached ? 'now' : 'off';
    return `<li class="tl__step tl__step--${status}"><span class="tl__dot">${status === 'done' ? iconSvg('check', 12) : ''}</span>${STAGE_LABEL[stage]}</li>`;
  });
  if (order.stage === 'cancelado') steps.push(`<li class="tl__step tl__step--bad"><span class="tl__dot">${iconSvg('close', 12)}</span>Cancelado</li>`);
  return `<ol class="tl">${steps.join('')}</ol>`;
}

function invoice(order: LiveOrder): string {
  if (!order.invoice) return `<p class="doc__empty">La factura se genera cuando el pedido pasa por el sistema central.</p>`;
  const rows = order.lines
    .map((line) => {
      const product = productAt(line.p);
      const price = channelPriceFor(line.p, order.channel);
      return `<tr><td>${line.q}</td><td>${escapeHtml(product.name)}<span class="sku"> ${product.sku}</span></td><td class="num">${formatMoney(price * line.q)}</td></tr>`;
    })
    .join('');
  return `<div class="doc doc--invoice">
    <header class="doc__head"><b>Factura ${escapeHtml(order.invoice)}</b><span class="pill pill--warn">Comprobante simulado · sin validez fiscal</span></header>
    <p class="doc__meta">Distribuidora del Litoral · CUIT 30-00000000-0 (ficticio) · ${formatDay(order.at)} ${formatClock(order.at)}</p>
    <table class="table doc__table"><thead><tr><th>Cant.</th><th>Producto</th><th class="num">Importe</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><td></td><td>Total</td><td class="num">${formatMoney(order.total)}</td></tr></tfoot></table>
  </div>`;
}

function label(order: LiveOrder): string {
  if (!order.tracking) return `<p class="doc__empty">La etiqueta se genera después de facturar.</p>`;
  return `<figure class="doc doc--label">${labelSvgFor(order)}<figcaption>
    <button class="btn btn--ghost btn--sm" type="button" data-download-label>${iconSvg('download', 16)} Descargar etiqueta (SVG)</button></figcaption></figure>`;
}

function labelSvgFor(order: LiveOrder): string {
  return labelSvg({
    number: order.number,
    tracking: order.tracking ?? '',
    channel: CHANNEL_BY_ID[order.channel].name,
    customer: order.customer,
    city: order.city,
    items: order.lines.reduce((sum, line) => sum + line.q, 0),
    date: formatDay(order.at),
  });
}

function render(): void {
  const dialog = document.querySelector<HTMLDialogElement>('[data-order-dialog]');
  const body = dialog?.querySelector<HTMLElement>('[data-order-body]');
  const order = state.orders.find((item) => item.id === current) ?? snapshot;
  if (!dialog || !body || !order) return;
  const channel = CHANNEL_BY_ID[order.channel];
  const title = dialog.querySelector('[data-order-title]');
  if (title) title.textContent = `Pedido ${order.number}`;
  const canCancel = order.stage !== 'cancelado' && order.stage !== 'despachado';
  body.innerHTML = `
    <p class="order-meta"><span class="pill pill--${channel.id}">${escapeHtml(channel.name)}</span>
      <span>${escapeHtml(order.customer)} · ${escapeHtml(order.city)}</span><span>${formatClock(order.at)}</span>
      <b class="num">${formatMoney(order.total)}</b></p>
    ${timeline(order)}
    <div class="order-docs">${invoice(order)}${label(order)}</div>
    ${canCancel ? `<div class="modal__actions"><button class="btn btn--danger btn--sm" type="button" data-cancel-order>Cancelar pedido y devolver stock</button></div>` : ''}`;
  body.querySelector('[data-download-label]')?.addEventListener('click', () => {
    downloadFile(`etiqueta-${order.number}.svg`, labelSvgFor(order), 'image/svg+xml');
  });
  body.querySelector('[data-cancel-order]')?.addEventListener('click', () => cancelOrder(order.id));
}

export function openOrder(id: string, fallback: LiveOrder | null = null): void {
  const dialog = document.querySelector<HTMLDialogElement>("[data-order-dialog]");
  if (!dialog) return;
  current = id;
  snapshot = fallback;
  render();
  if (!dialog.open) dialog.showModal();
}

export function closeOrder(): void {
  document.querySelector<HTMLDialogElement>('[data-order-dialog]')?.close();
}

let mounted = false;
/** Re-renders the open order when the engine moves it along. Mounted once per session. */
export function mountOrderDialog(): void {
  if (mounted) return;
  mounted = true;
  subscribe((event) => {
    const dialog = document.querySelector<HTMLDialogElement>('[data-order-dialog]');
    if (event.type === 'order' && dialog?.open && event.order.id === current) render();
  });
  document.querySelector('[data-order-dialog]')?.addEventListener('close', () => {
    current = null;
  });
}
