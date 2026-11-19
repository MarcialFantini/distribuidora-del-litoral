import { slideIn } from '../dom';
import { eventHtml, matchesFilter, type FeedFilter } from '../event-row';
import type { Scope } from '../scope';
import { state, type LogEvent } from '../store';

const ROWS = 12;

/** Scene 5: an animated list of what happens at each moment. */
export function mount(section: HTMLElement, scope: Scope): void {
  const list = section.querySelector<HTMLElement>('[data-feed]');
  if (!list) return;
  let filter: FeedFilter = 'all';
  let pending: LogEvent[] = [];
  let frame = 0;

  function renderAll(): void {
    const rows = state.events.filter((event) => matchesFilter(event, filter)).slice(0, ROWS);
    list!.innerHTML = rows.length ? rows.map((event) => eventHtml(event)).join('') : '<li class="empty"><p>Sin eventos para este filtro todavía.</p></li>';
  }

  function flush(): void {
    frame = 0;
    const fresh = pending.filter((event) => matchesFilter(event, filter)).slice(0, 4);
    pending = [];
    if (!fresh.length) return;
    list!.querySelector('.empty')?.remove();
    // Oldest first, so the newest ends on top.
    fresh.reverse().forEach((event) => {
      list!.insertAdjacentHTML('afterbegin', eventHtml(event));
      slideIn(list!.firstElementChild);
    });
    while (list!.children.length > ROWS) list!.lastElementChild?.remove();
  }

  renderAll();
  scope.listen((event) => {
    if (event.type !== 'event') return;
    pending.unshift(event.event);
    if (!frame) frame = window.setTimeout(flush, 120);
  });
  scope.add(() => window.clearTimeout(frame));

  section.querySelectorAll<HTMLButtonElement>('[data-feed-filter]').forEach((button) => {
    scope.on(button, 'click', () => {
      filter = (button.dataset['feedFilter'] ?? 'all') as FeedFilter;
      section.querySelectorAll('[data-feed-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      renderAll();
    });
  });
}
