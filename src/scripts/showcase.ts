import { navigate } from 'astro:transitions/client';
import { FEATURED_INDEX, productAt } from '../data/catalog';
import { openOrder, closeOrder } from './order-dialog';
import { toggleNotifications } from './shell/notifications';
import { closePalette, openPalette, typeInPalette } from './shell/palette';
import { sellManually } from './shell/shell';
import { setSpeed, state } from './store';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

/** Navigates keeping ?showcase and resolves once the new view has mounted. */
async function visit(path: string): Promise<HTMLElement | null> {
  const separator = path.includes('?') ? '&' : '?';
  await navigate(`${path}${separator}showcase`);
  for (let i = 0; i < 60; i++) {
    const root = document.querySelector<HTMLElement>('[data-view][data-ready="true"]');
    if (root) return root;
    await sleep(50);
  }
  return null;
}

function scrollToSelector(selector: string, offset = 76): void {
  const element = document.querySelector(selector);
  if (!element) return;
  window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
}

async function slide(selector: string, values: number[]): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) return;
  for (const value of values) {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(260);
  }
}

async function type(text: string): Promise<void> {
  for (let i = 1; i <= text.length; i++) {
    typeInPalette(text.slice(0, i));
    await sleep(85);
  }
}

/**
 * `?showcase`: a ~28 s loop through the whole product, with no cursor, for the portfolio video.
 * Map (manual sales, pulses) → before/after → product sync → order queue → rules sliders →
 * command palette → product detail → sync conflicts → orders and label → reports → notifications.
 * It starts from a clean seeded state and never writes to the visitor's saved session.
 */
export async function runShowcase(): Promise<void> {
  for (;;) {
    setSpeed(1);
    await visit('/');
    window.scrollTo(0, 0);
    await sleep(1400);
    sellManually('mkt');
    await sleep(700);
    sellManually('web');
    await sleep(600);
    sellManually('own');
    setSpeed(4);
    await sleep(1600);
    scrollToSelector('#antes-despues');
    await sleep(2600);
    scrollToSelector('#ficha');
    await sleep(700);
    if ((state.stock[FEATURED_INDEX] ?? 0) >= 3) sellManually('mkt', FEATURED_INDEX, 3);
    await sleep(2300);
    scrollToSelector('#cola');
    await sleep(2000);
    scrollToSelector('#reglas-vivo');
    await sleep(600);
    await slide('[data-rule-input="mkt"]', [5, 10, 15, 20, 25]);
    await slide('[data-rule-input="own"]', [10, 5]);
    await sleep(500);

    openPalette();
    await sleep(300);
    await type(productAt(FEATURED_INDEX).name.split(' ')[0]?.toLowerCase() ?? 'limpiador');
    await sleep(500);
    closePalette();
    await visit(`/productos/${productAt(FEATURED_INDEX).sku.toLowerCase()}`);
    await sleep(1800);

    await visit('/sincronizacion');
    await sleep(1300);
    document.querySelector<HTMLElement>('[data-conflict] [data-resolve]')?.click();
    await sleep(1400);

    await visit('/pedidos');
    await sleep(900);
    const withLabel = state.orders.find((order) => order.tracking) ?? state.orders[0];
    if (withLabel) openOrder(withLabel.id);
    await sleep(2200);
    closeOrder();

    await visit('/reportes');
    await sleep(1600);
    toggleNotifications(true);
    await sleep(1500);
    toggleNotifications(false);
    await sleep(300);
  }
}
