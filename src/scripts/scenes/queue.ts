import { CHANNEL_BY_ID } from '../../data/channels';
import { productAt } from '../../data/catalog';
import { formatMoney, formatUnits } from '../../lib/format';
import { STAGES_VISIBLE } from '../../lib/stages';
import { escapeHtml, reducedMotion, setText } from '../dom';
import { mountOrderDialog, openOrder } from '../order-dialog';
import type { Scope } from '../scope';
import { state, type LiveOrder } from '../store';

type Plugins = typeof import('../plugins');
const PER_COLUMN = 4;

function cardHtml(order: LiveOrder): string {
  const channel = CHANNEL_BY_ID[order.channel];
  const first = productAt(order.lines[0]?.p ?? 0);
  const more = order.lines.length > 1 ? ` +${order.lines.length - 1}` : '';
  return `<li class="qcard-wrap" data-flip-id="${order.id}"><button class="qcard" type="button" data-order="${order.id}">
    <span class="qcard__top"><span class="ch-badge ch-badge--sm ch-badge--${channel.id}" aria-hidden="true">${channel.initials}</span>
    <b class="qcard__num">${order.number}</b><span class="qcard__total num">${formatMoney(order.total)}</span></span>
    <span class="qcard__item">${escapeHtml(first.name)}${more}</span>
    <span class="qcard__who">${escapeHtml(order.customer)} · ${escapeHtml(order.city)}</span>
  </button></li>`;
}

/** Scene 4: orders walk central → invoice → shipping label; cards glide between columns (Flip). */
export function mount(section: HTMLElement, scope: Scope): void {
  mountOrderDialog();
  let plugins: Plugins | null = null;
  if (!reducedMotion()) void import('../plugins').then((module) => (plugins = module));
  let timer = 0;

  function render(): void {
    timer = 0;
    const cards = section.querySelectorAll('.qcard-wrap');
    const flipState = plugins && cards.length ? plugins.Flip.getState(cards) : null;
    STAGES_VISIBLE.forEach((stage) => {
      const column = section.querySelector<HTMLElement>(`[data-col="${stage.id}"]`);
      const list = column?.querySelector<HTMLElement>('[data-col-list]');
      if (!column || !list) return;
      const orders = state.orders.filter((order) => order.stage === stage.id);
      setText(column.querySelector('[data-col-count]'), formatUnits(orders.length));
      list.innerHTML = orders.length
        ? orders.slice(0, PER_COLUMN).map(cardHtml).join('')
        : '<li class="queue__empty">Sin pedidos en este paso</li>';
    });
    const done = state.orders.filter((order) => order.stage === 'despachado').length;
    setText(section.querySelector('[data-queue-done]'), formatUnits(done));
    if (flipState && plugins) {
      plugins.Flip.from(flipState, {
        targets: section.querySelectorAll('.qcard-wrap'),
        duration: 0.5,
        ease: 'power2.inOut',
        absolute: true,
        onEnter: (elements) => plugins!.gsap.fromTo(elements, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: 0.35 }),
        onLeave: (elements) => plugins!.gsap.to(elements, { opacity: 0, duration: 0.2 }),
      });
    }
  }

  const schedule = (): void => {
    if (!timer) timer = window.setTimeout(render, 380);
  };

  render();
  scope.add(() => window.clearTimeout(timer));
  scope.listen((event) => {
    if (event.type === 'order' || event.type === 'sale') schedule();
  });
  scope.on(section, 'click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-order]');
    if (button?.dataset['order']) openOrder(button.dataset['order']);
  });
}
