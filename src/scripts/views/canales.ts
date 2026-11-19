import { CHANNEL_BY_ID, CHANNEL_IDS, type ChannelId } from '../../data/channels';
import { formatCompactMoney, formatSeconds, formatUnits } from '../../lib/format';
import { setText } from '../dom';
import { live } from '../random';
import type { Scope } from '../scope';
import { averageLatency, channelHealth, setChannel, state, type ChannelState } from '../store';

const HEALTH = { ok: ['pill--ok', 'Conectado'], degraded: ['pill--warn', 'Con reintentos'], down: ['pill--error', 'Desconectado'] } as const;

export function mount(root: HTMLElement, scope: Scope): void {
  const card = (channel: ChannelId) => root.querySelector<HTMLElement>(`[data-channel-card="${channel}"]`);

  function render(channel: ChannelId): void {
    const element = card(channel);
    if (!element) return;
    const settings = state.channels[channel];
    const stats = state.kpi.byChannel[channel];
    const health = channelHealth(channel);
    element.dataset['health'] = health;
    const pill = element.querySelector('[data-health-pill]');
    if (pill) {
      pill.className = `pill ${HEALTH[health][0]}`;
      pill.textContent = HEALTH[health][1];
    }
    setText(element.querySelector('[data-stat="orders"]'), formatUnits(stats.orders));
    setText(element.querySelector('[data-stat="sales"]'), formatCompactMoney(stats.sales));
    setText(element.querySelector('[data-stat="latency"]'), formatSeconds(averageLatency(channel)));
    setText(element.querySelector('[data-stat="queue"]'), formatUnits(state.jobs.filter((job) => job.channel === channel).length));
    setText(element.querySelector('[data-stat="syncs"]'), formatUnits(settings.syncs));
    setText(element.querySelector('[data-stat="failures"]'), formatUnits(settings.failures));
    element.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((input) => {
      input.checked = Boolean(settings[input.dataset['toggle'] as 'connected' | 'autoSync']);
    });
    element.querySelectorAll<HTMLInputElement>('[data-range]').forEach((input) => {
      if (document.activeElement === input) return;
      const key = input.dataset['range'] as 'latency' | 'errorRate';
      input.value = String(key === 'errorRate' ? Math.round(settings.errorRate * 100) : settings.latency);
    });
    setText(element.querySelector('[data-out="latency"]'), formatSeconds(settings.latency));
    setText(element.querySelector('[data-out="errorRate"]'), `${Math.round(settings.errorRate * 100)} %`);
  }

  CHANNEL_IDS.forEach((channel) => {
    render(channel);
    const element = card(channel);
    if (!element) return;
    element.querySelectorAll<HTMLInputElement>('[data-toggle]').forEach((input) => {
      scope.on(input, 'change', () => {
        const key = input.dataset['toggle'] as 'connected' | 'autoSync';
        const patch: Partial<ChannelState> = key === 'connected' ? { connected: input.checked } : { autoSync: input.checked };
        setChannel(channel, patch);
      });
    });
    element.querySelectorAll<HTMLInputElement>('[data-range]').forEach((input) => {
      scope.on(input, 'input', () => {
        const value = Number(input.value);
        setChannel(channel, input.dataset['range'] === 'errorRate' ? { errorRate: value / 100 } : { latency: value });
      });
    });
    const test = element.querySelector<HTMLButtonElement>('[data-test]');
    const result = element.querySelector<HTMLElement>('[data-test-result]');
    if (test && result) {
      scope.on(test, 'click', () => {
        const settings = state.channels[channel];
        test.disabled = true;
        result.classList.remove('is-ok');
        result.textContent = `Llamando a ${CHANNEL_BY_ID[channel].name}…`;
        const ms = Math.round(settings.latency * 60 + live().range(20, 90));
        window.setTimeout(() => {
          test.disabled = false;
          if (!settings.connected) {
            result.textContent = 'Sin respuesta: el canal está desconectado.';
            return;
          }
          const fails = live().next() < settings.errorRate;
          result.classList.toggle('is-ok', !fails);
          result.textContent = fails ? `HTTP 503 en ${ms} ms · se reintentaría solo` : `HTTP 200 OK en ${ms} ms · credencial válida`;
        }, 700);
      });
    }
  });

  let queued = 0;
  scope.add(() => window.clearTimeout(queued));
  scope.listen((event) => {
    if (event.type === 'clock' || event.type === 'event') return;
    if (queued) return;
    queued = window.setTimeout(() => {
      queued = 0;
      CHANNEL_IDS.forEach(render);
    }, 300);
  });
}
