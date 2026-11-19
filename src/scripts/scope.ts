import { subscribe, type StoreEvent } from './store';

/** Collects listeners, store subscriptions and timers of a mounted view so they die on navigation. */
export type Scope = {
  on: (target: EventTarget, type: string, handler: (event: Event) => void, options?: AddEventListenerOptions) => void;
  listen: (listener: (event: StoreEvent) => void) => void;
  every: (ms: number, callback: () => void) => void;
  add: (dispose: () => void) => void;
  dispose: () => void;
};

export function createScope(): Scope {
  const disposers: (() => void)[] = [];
  return {
    on(target, type, handler, options) {
      target.addEventListener(type, handler, options);
      disposers.push(() => target.removeEventListener(type, handler, options));
    },
    listen(listener) {
      disposers.push(subscribe(listener));
    },
    every(ms, callback) {
      const id = window.setInterval(callback, ms);
      disposers.push(() => window.clearInterval(id));
    },
    add(dispose) {
      disposers.push(dispose);
    },
    dispose() {
      while (disposers.length) disposers.pop()?.();
    },
  };
}
