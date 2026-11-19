import { iconSvg, type IconName } from '../../lib/icons';
import { formatClock } from '../../lib/format';
import { bump, escapeHtml } from '../dom';
import { markAllRead, state, subscribe, unreadCount, type AppNotification, type NotificationKind } from '../store';
import { toast } from './toasts';

const ICON: Readonly<Record<NotificationKind, IconName>> = {
  sale: 'cart',
  error: 'alert',
  conflict: 'sync',
  stock: 'box',
  system: 'check',
};

function itemHtml(notification: AppNotification): string {
  const title = notification.href
    ? `<a href="${notification.href}">${escapeHtml(notification.title)}</a>`
    : escapeHtml(notification.title);
  return `<li class="notif notif--${notification.kind}${notification.read ? '' : ' is-unread'}">
    <span class="notif__icon">${iconSvg(ICON[notification.kind], 16)}</span>
    <div class="notif__body"><p class="notif__title">${title}</p><p class="notif__text">${escapeHtml(notification.body)}</p></div>
    <time class="notif__time num">${formatClock(notification.at)}</time>
  </li>`;
}

function render(): void {
  const list = document.querySelector<HTMLElement>('[data-notif-list]');
  if (!list) return;
  list.innerHTML = state.notifications.length
    ? state.notifications.slice(0, 30).map(itemHtml).join('')
    : `<li class="empty"><p class="empty__title">Todo al día</p><p>No hay notificaciones nuevas.</p></li>`;
}

function renderBadge(animate = false): void {
  const badge = document.querySelector<HTMLElement>('[data-unread]');
  if (!badge) return;
  const count = unreadCount();
  badge.hidden = count === 0;
  badge.textContent = count > 9 ? '9+' : String(count);
  document.querySelector('[data-open-notifications]')?.setAttribute('aria-label', `Notificaciones, ${count} sin leer`);
  if (animate && count > 0) bump(badge);
}

export function toggleNotifications(force?: boolean): void {
  const panel = document.querySelector<HTMLElement>('[data-notifications]');
  const button = document.querySelector<HTMLElement>('[data-open-notifications]');
  if (!panel || !button) return;
  const open = force ?? panel.hidden;
  if (!open && !panel.hidden) markAllRead();
  panel.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (open) {
    render();
    panel.querySelector<HTMLElement>('[data-mark-read]')?.focus({ preventScroll: true });
  }
}

const TOAST_TONE: Readonly<Record<NotificationKind, 'info' | 'ok' | 'warn' | 'error'>> = {
  sale: 'info',
  error: 'error',
  conflict: 'warn',
  stock: 'warn',
  system: 'ok',
};

export function mountNotifications(): void {
  render();
  renderBadge();
  document.querySelector('[data-open-notifications]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleNotifications();
  });
  document.querySelector('[data-mark-read]')?.addEventListener('click', () => {
    markAllRead();
    render();
  });
  document.addEventListener('click', (event) => {
    const panel = document.querySelector<HTMLElement>('[data-notifications]');
    if (panel && !panel.hidden && !panel.contains(event.target as Node)) toggleNotifications(false);
  });
  document.querySelector('[data-notifications]')?.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) toggleNotifications(false);
  });
  subscribe((event) => {
    if (event.type === 'notification') {
      renderBadge(true);
      const panel = document.querySelector<HTMLElement>('[data-notifications]');
      if (panel && !panel.hidden) render();
      const { notification } = event;
      if (notification.kind !== 'sale') {
        toast({
          title: notification.title,
          body: notification.body,
          icon: ICON[notification.kind],
          tone: TOAST_TONE[notification.kind],
          background: notification.kind !== 'system',
        });
      }
    }
    if (event.type === 'notifications-read') {
      renderBadge();
      render();
    }
  });
}
