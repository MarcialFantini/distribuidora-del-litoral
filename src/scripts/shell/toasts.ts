import { iconSvg, type IconName } from '../../lib/icons';
import { escapeHtml } from '../dom';

type ToastOptions = {
  title: string;
  body?: string;
  icon?: IconName;
  tone?: 'info' | 'ok' | 'warn' | 'error';
  action?: { label: string; run: () => void };
  /** Background events are rate limited so 10x never floods the screen. */
  background?: boolean;
};

const MAX_TOASTS = 3;
let lastBackground = 0;

export function toast({ title, body, icon = 'check', tone = 'info', action, background = false }: ToastOptions): void {
  const host = document.querySelector<HTMLElement>('[data-toasts]');
  if (!host) return;
  if (background) {
    const now = performance.now();
    if (now - lastBackground < 5000) return;
    lastBackground = now;
  }
  const item = document.createElement('div');
  item.className = `toast toast--${tone}`;
  item.setAttribute('role', 'status');
  item.innerHTML = `<span class="toast__icon">${iconSvg(icon, 18)}</span><p class="toast__text"><strong>${escapeHtml(title)}</strong>${body ? `<span>${escapeHtml(body)}</span>` : ''}</p>`;
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast__action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.run();
      dismiss(item);
    });
    item.append(button);
  }
  host.append(item);
  [...host.children].slice(0, -MAX_TOASTS).forEach((old) => old.remove());
  window.setTimeout(() => dismiss(item), action ? 6500 : 4200);
}

function dismiss(item: HTMLElement): void {
  if (!item.isConnected || item.classList.contains('is-leaving')) return;
  item.classList.add('is-leaving');
  window.setTimeout(() => item.remove(), 260);
}
