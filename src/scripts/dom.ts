import { formatUnits } from '../lib/format';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function qsa<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(selector)];
}

export function setText(element: Element | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text;
}

export function reducedMotion(): boolean {
  return document.documentElement.classList.contains('reduced');
}

export function isShowcase(): boolean {
  return document.documentElement.classList.contains('is-showcase');
}

const counters = new WeakMap<Element, { value: number; frame: number }>();

/** Rolls a number towards its new value. Text only; layout never moves (tabular figures). */
export function countTo(element: Element | null, value: number, format: (value: number) => string = formatUnits, duration = 600): void {
  if (!element) return;
  const current = counters.get(element);
  const from = current?.value ?? (Number(element.getAttribute('data-value')) || value);
  if (current) cancelAnimationFrame(current.frame);
  element.setAttribute('data-value', String(value));
  if (reducedMotion() || from === value || document.visibilityState === 'hidden') {
    counters.set(element, { value, frame: 0 });
    setText(element, format(value));
    return;
  }
  const start = performance.now();
  const entry = { value, frame: 0 };
  counters.set(element, entry);
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    setText(element, format(Math.round(from + (value - from) * eased)));
    if (t < 1) entry.frame = requestAnimationFrame(step);
  };
  entry.frame = requestAnimationFrame(step);
}

/** Quick attention cue on a changed value (transform and opacity only). */
export function bump(element: Element | null): void {
  if (!element || reducedMotion()) return;
  (element as HTMLElement).animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
    { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
}

export function flash(element: Element | null): void {
  if (!element || reducedMotion()) return;
  (element as HTMLElement).animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 520, easing: 'ease-out' });
}

/** Enter animation for a freshly inserted row. */
export function slideIn(element: Element | null): void {
  if (!element || reducedMotion()) return;
  (element as HTMLElement).animate(
    [
      { transform: 'translateY(-10px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' },
  );
}

export function announce(message: string): void {
  const host = document.querySelector('[data-announcer]');
  if (!host) return;
  host.textContent = '';
  window.setTimeout(() => {
    host.textContent = message;
  }, 50);
}

export function downloadFile(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Runs `callback` once `element` scrolls near the viewport (lazy scenes). */
export function whenVisible(element: Element, callback: () => void, rootMargin = '200px'): () => void {
  if (!('IntersectionObserver' in window)) {
    callback();
    return () => undefined;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        callback();
      }
    },
    { rootMargin },
  );
  observer.observe(element);
  return () => observer.disconnect();
}
