import { CHANNEL_BY_ID, CHANNEL_IDS, type ChannelId } from '../../data/channels';
import { createRng } from '../../data/rng';
import { iconSvg } from '../../lib/icons';
import { bump, reducedMotion, setText, slideIn } from '../dom';
import type { Scope } from '../scope';

const START = 12;
const STEP_MS = 850;
const MAX_SALES = 20;

type Side = { real: number; copies: Record<ChannelId, number>; cancelled: number };
type Tick = { text: string; tone: 'ok' | 'bad' | 'blocked' };

function fresh(): Side {
  return { real: START, copies: { mkt: START, web: START, own: START }, cancelled: 0 };
}

/**
 * Scene 2: the same demand on two systems. Before: each channel sells from its own copy and
 * oversells. After: all channels read the central stock and nothing is sold that is not there.
 */
export function mount(section: HTMLElement, scope: Scope): void {
  const sides = {
    before: section.querySelector<HTMLElement>('[data-side="before"]'),
    after: section.querySelector<HTMLElement>('[data-side="after"]'),
  };
  if (!sides.before || !sides.after) return;
  let rng = createRng(77);
  let before = fresh();
  let after = fresh();
  let sales = 0;
  let timer = 0;
  let paused = false;
  let visible = false;

  function render(name: 'before' | 'after', side: Side): void {
    const root = sides[name]!;
    setText(root.querySelector('[data-real]'), String(side.real));
    const realBar = root.querySelector<HTMLElement>('[data-real-bar]');
    if (realBar) realBar.style.transform = `scaleX(${side.real / START})`;
    setText(root.querySelector('[data-cancel]'), String(side.cancelled));
    CHANNEL_IDS.forEach((channel) => {
      const row = root.querySelector<HTMLElement>(`[data-ch="${channel}"]`);
      if (!row) return;
      const value = side.copies[channel];
      setText(row.querySelector('[data-copy]'), String(value));
      const bar = row.querySelector<HTMLElement>('[data-copy-bar]');
      if (bar) bar.style.transform = `scaleX(${Math.max(0, value) / START})`;
      row.classList.toggle('is-wrong', value > side.real);
    });
  }

  function push(name: 'before' | 'after', tick: Tick, animate = true): void {
    const list = sides[name]!.querySelector<HTMLElement>('[data-ticker]');
    if (!list) return;
    const icon = tick.tone === 'bad' ? 'alert' : tick.tone === 'blocked' ? 'shield' : 'check';
    list.insertAdjacentHTML('afterbegin', `<li class="tick tick--${tick.tone}">${iconSvg(icon, 14)}<span>${tick.text}</span></li>`);
    if (animate) slideIn(list.firstElementChild);
    while (list.children.length > 4) list.lastElementChild?.remove();
  }

  function step(animate = true): boolean {
    if (sales >= MAX_SALES || (before.real <= 0 && after.real <= 0 && CHANNEL_IDS.every((id) => before.copies[id] <= 0))) return false;
    sales += 1;
    const channel = rng.weighted<ChannelId>(['mkt', 'web', 'own'], [0.5, 0.3, 0.2]);
    const q = rng.weighted([1, 2], [0.7, 0.3]);
    const name = CHANNEL_BY_ID[channel].initials;

    // Before: the channel only knows its own copy.
    if (before.copies[channel] >= q) {
      before.copies[channel] -= q;
      if (before.real >= q) {
        before.real -= q;
        push('before', { text: `${name} vendió ${q} u.`, tone: 'ok' }, animate);
      } else {
        before.cancelled += 1;
        push('before', { text: `${name} vendió ${q} u. sin stock: cancelada`, tone: 'bad' }, animate);
        if (animate) bump(sides.before!.querySelector('[data-cancel]'));
      }
    } else push('before', { text: `${name} muestra agotado`, tone: 'blocked' }, animate);

    // After: every channel reads the central stock.
    if (after.real >= q) {
      after.real -= q;
      CHANNEL_IDS.forEach((id) => {
        after.copies[id] = after.real;
      });
      push('after', { text: `${name} vendió ${q} u. · los tres canales en ${after.real}`, tone: 'ok' }, animate);
    } else push('after', { text: `${name} no puede vender ${q} u.: quedan ${after.real}`, tone: 'blocked' }, animate);

    render('before', before);
    render('after', after);
    return true;
  }

  function reset(): void {
    rng = createRng(77);
    before = fresh();
    after = fresh();
    sales = 0;
    section.querySelectorAll('[data-ticker]').forEach((list) => {
      list.innerHTML = '';
    });
    render('before', before);
    render('after', after);
  }

  function loop(): void {
    window.clearTimeout(timer);
    if (paused || !visible) return;
    const more = step();
    timer = window.setTimeout(() => {
      if (!more) reset();
      loop();
    }, more ? STEP_MS : 2200);
  }

  reset();
  if (reducedMotion()) {
    // Static version: the finished comparison, with its last events.
    while (step(false));
    const toggle = section.querySelector<HTMLElement>('[data-compare-toggle]');
    if (toggle) toggle.hidden = true;
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
    if (visible) loop();
    else window.clearTimeout(timer);
  });
  observer.observe(section);
  scope.add(() => {
    observer.disconnect();
    window.clearTimeout(timer);
  });

  const toggle = section.querySelector<HTMLButtonElement>('[data-compare-toggle]');
  if (toggle) {
    scope.on(toggle, 'click', () => {
      paused = !paused;
      toggle.setAttribute('aria-pressed', String(paused));
      toggle.innerHTML = `${iconSvg(paused ? 'play' : 'pause', 16)}<span>${paused ? 'Reanudar' : 'Pausar'}</span>`;
      loop();
    });
  }
}
