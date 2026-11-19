import { CHANNEL_IDS } from '../../data/channels';
import { whenVisible } from '../dom';
import { live } from '../random';
import { mountHub } from '../scenes/hub';
import { mountKpis } from '../scenes/kpis';
import type { Scope } from '../scope';
import { sellManually, startFastForward } from '../shell/shell';

type SceneModule = { mount: (section: HTMLElement, scope: Scope) => void };

/* Below-the-fold scenes are fetched only when they come close to the viewport. */
const SCENES: Readonly<Record<string, () => Promise<SceneModule>>> = {
  compare: () => import('../scenes/compare'),
  product: () => import('../scenes/product-sync'),
  feed: () => import('../scenes/feed'),
  queue: () => import('../scenes/queue'),
  rules: () => import('../scenes/rules-live'),
};

export function mount(root: HTMLElement, scope: Scope): void {
  mountHub(root, scope);
  mountKpis(root, scope);
  root.querySelector('[data-hero-sell]')?.addEventListener('click', () => sellManually(live().pick(CHANNEL_IDS)));
  root.querySelector('[data-hero-forward]')?.addEventListener('click', startFastForward);
  root.querySelectorAll<HTMLElement>('[data-scene]').forEach((section) => {
    const load = SCENES[section.dataset['scene'] ?? ''];
    if (!load) return;
    let disposed = false;
    scope.add(() => {
      disposed = true;
    });
    scope.add(
      whenVisible(section, () => {
        void load().then((module) => {
          if (!disposed) module.mount(section, scope);
        });
      }),
    );
  });
}
