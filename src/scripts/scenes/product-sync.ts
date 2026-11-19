import { CHANNEL_BY_ID, CHANNEL_IDS, type ChannelId } from '../../data/channels';
import { FEATURED_INDEX } from '../../data/catalog';
import { formatMoney, formatSeconds, formatUnits } from '../../lib/format';
import { countTo, flash, setText } from '../dom';
import type { Scope } from '../scope';
import { sellManually } from '../shell/shell';
import { channelPriceFor, jobFor, state, targetFor } from '../store';

/**
 * Scene 3: one product, its central stock and the three channel listings. After a sale the
 * channels show "sincronizando" with a live delay counter until all three match the central.
 */
export function mountProductSync(section: HTMLElement, scope: Scope, p = FEATURED_INDEX): void {
  const p0 = p;
  const row = (channel: ChannelId) => section.querySelector<HTMLElement>(`[data-ps-ch="${channel}"]`);
  const timer = section.querySelector('[data-ps-timer]');
  const result = section.querySelector('[data-ps-result]');
  let startedAt = 0;
  let running = false;
  let frame = 0;
  let lastDemo = state.sim.demo;
  let lastReal = performance.now();

  /** Demo seconds right now, interpolated between engine ticks. */
  function demoNow(): number {
    if (state.sim.demo !== lastDemo) {
      lastDemo = state.sim.demo;
      lastReal = performance.now();
    }
    if (state.sim.paused) return state.sim.demo;
    return state.sim.demo + ((performance.now() - lastReal) / 1000) * state.sim.speed;
  }

  function renderStatic(): void {
    countTo(section.querySelector('[data-ps-central]'), state.stock[p0] ?? 0);
    CHANNEL_IDS.forEach((channel) => {
      countTo(row(channel)?.querySelector('[data-ps-units]') ?? null, state.published[channel][p0] ?? 0);
      setText(section.querySelector(`[data-ps-price="${channel}"]`), formatMoney(channelPriceFor(p0, channel)));
    });
  }

  function paint(): void {
    frame = 0;
    const now = demoNow();
    let pending = 0;
    CHANNEL_IDS.forEach((channel) => {
      const element = row(channel);
      if (!element) return;
      const job = jobFor(p0, channel);
      const bar = element.querySelector<HTMLElement>('[data-ps-bar]');
      const status = element.querySelector('[data-ps-status]');
      if (job) {
        pending += 1;
        const total = Math.max(0.1, job.dueAt - job.createdAt);
        const progress = Math.min(1, Math.max(0, (now - job.createdAt) / total));
        element.dataset['state'] = job.status === 'retrying' ? 'retry' : 'syncing';
        if (bar) bar.style.transform = `scaleX(${job.status === 'retrying' ? 1 : progress})`;
        setText(
          status,
          job.status === 'retrying'
            ? `Reintento ${job.attempt}: el canal no respondió`
            : job.status === 'waiting'
              ? 'En cola: canal desconectado'
              : `Sincronizando · ${formatSeconds(Math.max(0, job.dueAt - now))}`,
        );
      } else {
        element.dataset['state'] = (state.published[channel][p0] ?? 0) === targetFor(p0, channel) ? 'ok' : 'syncing';
        if (bar) bar.style.transform = 'scaleX(1)';
        setText(status, element.dataset['state'] === 'ok' ? 'En sincronía' : 'Diferencia detectada');
      }
    });
    if (pending && !running) {
      running = true;
      startedAt = Math.min(...CHANNEL_IDS.map((channel) => jobFor(p0, channel)?.createdAt ?? Infinity));
    }
    if (running) {
      const elapsed = Math.max(0, now - startedAt);
      setText(timer, formatSeconds(elapsed));
      if (!pending) {
        running = false;
        setText(result, `Los tres canales quedaron iguales en ${formatSeconds(elapsed)}${elapsed < 10 ? ', menos de 10 segundos.' : '.'}`);
        flash(result);
      } else setText(result, `${pending} ${pending === 1 ? 'canal todavía muestra' : 'canales todavía muestran'} el valor anterior.`);
    }
    if (running) frame = requestAnimationFrame(paint);
  }

  const schedule = (): void => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  renderStatic();
  paint();
  scope.add(() => cancelAnimationFrame(frame));
  scope.listen((event) => {
    if (event.type === 'stock' && event.p === p0) {
      countTo(section.querySelector('[data-ps-central]'), event.after);
      schedule();
    } else if (event.type === 'published' && (event.p === p0 || event.p < 0)) {
      countTo(row(event.channel)?.querySelector('[data-ps-units]') ?? null, state.published[event.channel][p0] ?? 0);
      schedule();
    } else if (event.type === 'jobs') schedule();
    else if (event.type === 'channel') renderStatic();
    else if (event.type === 'sale' && event.order.lines.some((line) => line.p === p0)) {
      CHANNEL_IDS.forEach((channel) => countTo(row(channel)?.querySelector('[data-ps-units]') ?? null, state.published[channel][p0] ?? 0));
    }
  });

  section.querySelectorAll<HTMLButtonElement>('[data-ps-sell]').forEach((button) => {
    scope.on(button, 'click', () => {
      const channel = button.dataset['psSell'] as ChannelId;
      if ((state.stock[p0] ?? 0) < 3) {
        setText(result, `No hay 3 unidades en el central para vender en ${CHANNEL_BY_ID[channel].name}.`);
        return;
      }
      sellManually(channel, p0, 3);
      setText(result, `Venta de 3 u. en ${CHANNEL_BY_ID[channel].name}: el central ya tiene ${formatUnits(state.stock[p0] ?? 0)} u.`);
    });
  });
}

export function mount(section: HTMLElement, scope: Scope): void {
  mountProductSync(section, scope);
}
