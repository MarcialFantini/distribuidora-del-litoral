import { formatMoney, formatSeconds, formatUnits } from '../../lib/format';
import { countTo, flash, setText } from '../dom';
import type { Scope } from '../scope';
import { averageLatency, openConflicts, state } from '../store';

/** Live KPI strip: values roll to their new number whenever the engine changes them. */
export function mountKpis(root: HTMLElement, scope: Scope): void {
  const host = root.querySelector<HTMLElement>('[data-kpis]');
  if (!host) return;
  const value = (id: string) => host.querySelector(`[data-kpi="${id}"] [data-kpi-value]`);
  const note = (id: string) => host.querySelector(`[data-kpi="${id}"] [data-kpi-note]`);
  let lastConflicts = -1;

  function render(): void {
    const { kpi } = state;
    countTo(value('sales'), Math.round(kpi.sales), formatMoney, 700);
    countTo(value('orders'), kpi.orders);
    countTo(value('syncs'), kpi.syncs);
    setText(value('latency'), formatSeconds(averageLatency()));
    countTo(value('avoided'), kpi.avoided);
    const conflicts = openConflicts().length;
    setText(value('conflicts'), formatUnits(conflicts));
    if (conflicts !== lastConflicts && lastConflicts >= 0) flash(value('conflicts'));
    lastConflicts = conflicts;
    host!.querySelector('[data-kpi="conflicts"]')?.classList.toggle('kpi--alert', conflicts > 0);
    setText(note('orders'), `${formatUnits(kpi.units)} unidades vendidas`);
    setText(note('sales'), kpi.cancelled ? `${kpi.cancelled} cancelados sin stock` : 'Tres canales, cero cancelaciones');
  }

  let queued = false;
  const queue = (): void => {
    if (queued) return;
    queued = true;
    window.setTimeout(() => {
      queued = false;
      render();
    }, 250);
  };

  render();
  scope.listen((event) => {
    if (event.type === 'kpi' || event.type === 'published' || event.type === 'conflict' || event.type === 'sale') queue();
  });
}
