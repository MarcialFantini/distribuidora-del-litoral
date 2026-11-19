import { CHANNEL_BY_ID, CHANNEL_IDS } from '../../data/channels';
import { productAt } from '../../data/catalog';
import { formatDateTime, formatMoney, formatPercent, formatUnits } from '../../lib/format';
import { escapeHtml, setText, slideIn } from '../dom';
import { mountProductSync } from '../scenes/product-sync';
import type { Scope } from '../scope';
import { toast } from '../shell/toasts';
import { adjustStock, channelPriceFor, forceSync, productMovements, restock, state, type Movement } from '../store';

const REASON: Readonly<Record<Movement['reason'], string>> = {
  venta: 'Venta',
  reposicion: 'Ingreso de proveedor',
  ajuste: 'Ajuste de inventario',
  cancelacion: 'Cancelación: stock devuelto',
};

function movementHtml(movement: Movement): string {
  const delta = movement.delta > 0 ? `+${movement.delta}` : String(movement.delta);
  return `<tr class="is-today">
    <td data-label="Fecha">${formatDateTime(movement.at)} <span class="pill pill--info">Hoy</span></td>
    <td data-label="Movimiento">${REASON[movement.reason]}</td>
    <td data-label="Canal">${movement.channel ? escapeHtml(CHANNEL_BY_ID[movement.channel].name) : 'Depósito'}</td>
    <td class="num ${movement.delta > 0 ? 'is-up' : 'is-down'}" data-label="Cantidad">${delta}</td>
    <td class="num" data-label="Stock">${formatUnits(movement.after)}</td>
    <td class="sku" data-label="Referencia">${escapeHtml(movement.ref)}</td>
  </tr>`;
}

export function mount(root: HTMLElement, scope: Scope): void {
  const p = Number(root.querySelector<HTMLElement>('[data-product]')?.dataset['product'] ?? -1);
  if (p < 0) return;
  const product = productAt(p);
  const panel = root.querySelector<HTMLElement>('[data-ps-root]');
  if (panel) mountProductSync(panel, scope, p);

  const today = root.querySelector<HTMLElement>('[data-today]');
  const renderToday = (): void => {
    if (today) today.innerHTML = productMovements(p).map(movementHtml).join('');
  };
  renderToday();

  const renderPrices = (): void => {
    CHANNEL_IDS.forEach((channel) => {
      const row = root.querySelector(`[data-price-row="${channel}"]`);
      if (!row) return;
      const price = channelPriceFor(p, channel);
      const fee = Math.round((price * CHANNEL_BY_ID[channel].fee) / 100);
      setText(row.querySelector('[data-markup]'), formatPercent(state.channels[channel].markup));
      setText(row.querySelector('[data-price]'), formatMoney(price));
      setText(row.querySelector('[data-fee]'), formatMoney(fee));
      setText(row.querySelector('[data-margin]'), formatPercent(((price - fee - product.cost) / price) * 100));
    });
  };
  renderPrices();

  const input = root.querySelector<HTMLInputElement>('[data-adjust-input]');
  if (input) input.value = String(state.stock[p] ?? 0);

  scope.listen((event) => {
    if (event.type === 'stock' && event.p === p) {
      const first = productMovements(p)[0];
      if (today && first) {
        today.insertAdjacentHTML('afterbegin', movementHtml(first));
        slideIn(today.firstElementChild);
      }
      if (input && document.activeElement !== input) input.value = String(state.stock[p] ?? 0);
    }
    if (event.type === 'channel') renderPrices();
  });

  const restockButton = root.querySelector('[data-restock]');
  if (restockButton) {
    scope.on(restockButton, 'click', () => {
      restock(p, 24, 'Ingreso manual');
      toast({ title: 'Ingreso registrado', body: `+24 u. de ${product.name}. Se publica en los tres canales.`, icon: 'box', tone: 'ok' });
    });
  }
  const syncButton = root.querySelector('[data-force-sync]');
  if (syncButton) {
    scope.on(syncButton, 'click', () => {
      forceSync(p);
      toast({ title: 'Sincronización forzada', body: 'Se envía el stock central a los tres canales ahora.', icon: 'sync' });
    });
  }
  const form = root.querySelector<HTMLFormElement>('[data-adjust]');
  if (form && input) {
    scope.on(form, 'submit', (event) => {
      event.preventDefault();
      const value = Math.max(0, Math.round(Number(input.value)));
      if (!Number.isFinite(value)) return;
      adjustStock(p, value, 'Conteo de depósito');
      toast({ title: 'Conteo guardado', body: `${product.name}: ${formatUnits(value)} u.`, icon: 'check', tone: 'ok' });
    });
  }
  renderToday();
}
