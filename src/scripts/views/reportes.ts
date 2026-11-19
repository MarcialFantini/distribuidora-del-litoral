import { CHANNEL_BY_ID, CHANNEL_IDS } from '../../data/channels';
import { niceMax } from '../../lib/chart';
import { formatCompactMoney, formatMoney, formatSeconds, formatUnits, localHour } from '../../lib/format';
import { setText } from '../dom';
import type { Scope } from '../scope';
import { averageLatency, state } from '../store';

const TONE = { mkt: 'var(--ch-mkt)', web: 'var(--ch-web)', own: 'var(--ch-own)' } as const;

function renderHourly(svg: SVGSVGElement): void {
  const W = 480;
  const H = 200;
  const PAD = { l: 44, r: 6, t: 8, b: 22 };
  const totals = Array.from({ length: 24 }, (_, hour) => CHANNEL_IDS.reduce((sum, channel) => sum + (state.kpi.hourly[channel][hour] ?? 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const band = (W - PAD.l - PAD.r) / 24;
  const y = (value: number) => H - PAD.b - (value / max) * (H - PAD.t - PAD.b);
  const now = localHour(state.sim.now);
  let out = `<desc>Ventas de hoy por hora. Total ${formatMoney(state.kpi.sales)}.</desc>`;
  [0, max / 2, max].forEach((tick) => {
    out += `<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(tick)}" y2="${y(tick)}"/><text x="${PAD.l - 5}" y="${y(tick) + 3}" text-anchor="end">${formatCompactMoney(tick)}</text>`;
  });
  for (let hour = 0; hour < 24; hour++) {
    let base = H - PAD.b;
    const x = PAD.l + hour * band + band * 0.15;
    CHANNEL_IDS.forEach((channel) => {
      const value = state.kpi.hourly[channel][hour] ?? 0;
      const height = (value / max) * (H - PAD.t - PAD.b);
      base -= height;
      if (height > 0) out += `<rect x="${x.toFixed(1)}" y="${base.toFixed(1)}" width="${(band * 0.7).toFixed(1)}" height="${height.toFixed(1)}" fill="${TONE[channel]}" rx="1"/>`;
    });
    if (hour % 4 === 0) out += `<text x="${(x + band * 0.35).toFixed(1)}" y="${H - 6}" text-anchor="middle">${hour}h</text>`;
    if (hour === now) out += `<rect x="${(x - 1).toFixed(1)}" y="${PAD.t}" width="${(band * 0.7 + 2).toFixed(1)}" height="${H - PAD.t - PAD.b}" fill="var(--yellow)" opacity="0.18"/>`;
  }
  svg.innerHTML = out;
}

export function mount(root: HTMLElement, scope: Scope): void {
  const hourly = root.querySelector<SVGSVGElement>('[data-hourly]');
  const tip = root.querySelector('[data-chart-tip]');

  function renderLive(): void {
    if (hourly) renderHourly(hourly);
    setText(root.querySelector('[data-today-sales]'), formatCompactMoney(state.kpi.sales));
    setText(root.querySelector('[data-today-orders]'), `${formatUnits(state.kpi.orders)} pedidos · en vivo`);
    setText(root.querySelector('[data-today-latency]'), formatSeconds(averageLatency()));
    CHANNEL_IDS.forEach((channel) => {
      const row = root.querySelector(`[data-latency="${channel}"]`);
      const value = averageLatency(channel);
      const bar = row?.querySelector<HTMLElement>('.share-bar__track span');
      if (bar) bar.style.transform = `scaleX(${Math.min(1, value / 10)})`;
      setText(row?.querySelector('b') ?? null, formatSeconds(value));
      row?.setAttribute('aria-label', `${CHANNEL_BY_ID[channel].name}: ${formatSeconds(value)}`);
    });
  }

  renderLive();
  let timer = 0;
  scope.add(() => window.clearTimeout(timer));
  scope.listen((event) => {
    if (event.type !== 'kpi' && event.type !== 'published') return;
    if (!timer)
      timer = window.setTimeout(() => {
        timer = 0;
        renderLive();
      }, 500);
  });

  const chart = root.querySelector('[data-daily-chart]');
  if (chart && tip) {
    const show = (event: Event): void => {
      const bar = (event.target as Element).closest<SVGGElement>('[data-bar]');
      if (bar) tip.textContent = bar.dataset['tip'] ?? '';
    };
    scope.on(chart, 'pointerover', show);
    scope.on(chart, 'focusin', show);
  }
}
