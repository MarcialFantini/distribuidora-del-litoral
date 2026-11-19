import type { ViewId } from '../lib/nav';
import { isShowcase, reducedMotion } from './dom';
import { reseed } from './random';
import { createScope, type Scope } from './scope';
import { mountNotifications } from './shell/notifications';
import { mountPalette } from './shell/palette';
import { mountShell, renderSim, syncNav } from './shell/shell';
import { bootstrap, startSimulation } from './sim';
import { freezePersistence, hydrate, persist, setPaused, state } from './store';

type ViewModule = { mount: (root: HTMLElement, scope: Scope) => void };

const VIEWS: Readonly<Record<ViewId, () => Promise<ViewModule>>> = {
  mapa: () => import('./views/mapa'),
  productos: () => import('./views/productos'),
  producto: () => import('./views/producto'),
  pedidos: () => import('./views/pedidos'),
  sincronizacion: () => import('./views/sincronizacion'),
  reglas: () => import('./views/reglas'),
  canales: () => import('./views/canales'),
  reportes: () => import('./views/reportes'),
};

/* One engine for the whole session: it survives view transitions, so every view stays in sync. */
const showcase = isShowcase();
if (showcase) freezePersistence();
if (!showcase && hydrate()) reseed(Math.floor(state.sim.now / 1000));
else bootstrap();
mountShell();
mountNotifications();
mountPalette();

/* The engine starts once the first paint settles, so loading stays fast. */
const start = (): void => {
  // Reduced motion: a complete static version. The simulation waits until the visitor presses play.
  if (reducedMotion() && !showcase) setPaused(true);
  startSimulation();
  renderSim();
};
if (showcase) start();
else if (document.readyState === 'complete') window.setTimeout(start, 700);
else window.addEventListener('load', () => window.setTimeout(start, 700), { once: true });

let scope: Scope | null = null;
let generation = 0;

async function mountView(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-view]');
  const view = root?.dataset['view'] as ViewId | undefined;
  if (!root || !view || !(view in VIEWS)) return;
  syncNav(view);
  const current = ++generation;
  const module = await VIEWS[view]();
  if (current !== generation) return;
  scope?.dispose();
  scope = createScope();
  module.mount(root, scope);
  root.dataset['ready'] = 'true';
}

document.addEventListener('astro:page-load', () => void mountView());
document.addEventListener('astro:before-swap', () => {
  generation += 1;
  scope?.dispose();
  scope = null;
});
window.addEventListener('pagehide', persist);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persist();
});

if (showcase) void import('./showcase').then(({ runShowcase }) => runShowcase());
