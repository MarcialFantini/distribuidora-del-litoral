import { CHANNEL_IDS, type ChannelId } from '../../data/channels';
import { FEATURED_INDEX } from '../../data/catalog';
import { formatUnits } from '../../lib/format';
import { bump, countTo, reducedMotion, setText } from '../dom';
import type { Scope } from '../scope';
import { sellManually } from '../shell/shell';
import { isFastForwarding } from '../sim';
import { state } from '../store';

type Plugins = typeof import('../plugins');

const MAX_PULSES = 18;

function totalCentral(): number {
  return state.stock.reduce((sum, units) => sum + units, 0);
}

function totalPublished(channel: ChannelId): number {
  return state.published[channel].reduce((sum, units) => sum + units, 0);
}

/** Scene 1: orders travel as pulses along the cables; stock drops on all three channels. */
export function mountHub(root: HTMLElement, scope: Scope): void {
  const hub = root.querySelector<HTMLElement>('[data-hub]');
  if (!hub) return;
  let plugins: Plugins | null = null;
  let visible = true;
  let active = 0;
  /** When the inbound pulse for a product lands, so outbound pulses never overtake it. */
  const arrivals = new Map<number, number>();

  if (!reducedMotion()) {
    void import('../plugins').then((module) => {
      plugins = module;
    });
  }

  const observer = new IntersectionObserver((entries) => {
    visible = entries.some((entry) => entry.isIntersecting);
  });
  observer.observe(hub);
  scope.add(() => observer.disconnect());

  const central = hub.querySelector('[data-central-units]');
  const featured = hub.querySelector('[data-central-featured]');
  const centralNode = hub.querySelector<HTMLElement>('[data-central]');
  const node = (channel: ChannelId) => hub.querySelector<HTMLElement>(`[data-node="${channel}"]`);

  function duration(): number {
    if (isFastForwarding()) return 0.32;
    return state.sim.speed === 1 ? 0.9 : state.sim.speed === 4 ? 0.62 : 0.42;
  }

  function wires(): SVGSVGElement | null {
    const all = [...hub!.querySelectorAll<SVGSVGElement>('[data-wires]')];
    return all.find((svg) => svg.getBoundingClientRect().width > 0) ?? null;
  }

  function pulse(channel: ChannelId, direction: 'in' | 'out', delay: number, onArrive: () => void): void {
    const svg = wires();
    const path = svg?.querySelector<SVGPathElement>(`[data-cable="${channel}"]`);
    const layer = svg?.querySelector('[data-pulses]');
    if (!plugins || !visible || !svg || !path || !layer || active >= MAX_PULSES || document.visibilityState === 'hidden') {
      window.setTimeout(onArrive, delay * 1000);
      return;
    }
    const ns = 'http://www.w3.org/2000/svg';
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', `pulse pulse--${direction}`);
    const glow = document.createElementNS(ns, 'circle');
    glow.setAttribute('r', '15');
    glow.setAttribute('fill', `url(#glow-${svg.dataset['wires'] ?? 'wide'})`);
    const core = document.createElementNS(ns, 'circle');
    core.setAttribute('r', direction === 'in' ? '5.5' : '4.5');
    core.setAttribute('class', 'pulse__core');
    group.append(glow, core);
    layer.append(group);
    active += 1;
    const { gsap } = plugins;
    gsap.set(group, { opacity: 0 });
    gsap
      .timeline({
        delay,
        onComplete: () => {
          group.remove();
          active -= 1;
          onArrive();
        },
      })
      .to(group, { opacity: 1, duration: 0.12 }, 0)
      .to(
        group,
        {
          duration: duration(),
          ease: 'power1.inOut',
          motionPath: { path, align: path, alignOrigin: [0.5, 0.5], start: direction === 'in' ? 0 : 1, end: direction === 'in' ? 1 : 0 },
        },
        0,
      )
      .to(group, { opacity: 0, duration: 0.12 }, '>-0.12');
  }

  function ping(element: Element | null, tone: 'in' | 'out'): void {
    if (!element || reducedMotion() || !visible) return;
    const ring = element.querySelector<HTMLElement>('.node__ping');
    if (!ring) return;
    ring.dataset['tone'] = tone;
    ring.animate(
      [
        { opacity: 0.85, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.08)' },
      ],
      { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }

  function renderCentral(): void {
    countTo(central, totalCentral(), formatUnits, 500);
    countTo(featured, state.stock[FEATURED_INDEX] ?? 0, formatUnits, 500);
  }

  function renderChannel(channel: ChannelId): void {
    const element = node(channel);
    if (!element) return;
    countTo(element.querySelector('[data-node-units]'), totalPublished(channel), formatUnits, 500);
    setText(element.querySelector('[data-node-orders]'), formatUnits(state.kpi.byChannel[channel].orders));
  }

  function renderStates(): void {
    CHANNEL_IDS.forEach((channel) => {
      const element = node(channel);
      if (!element) return;
      const settings = state.channels[channel];
      const jobs = state.jobs.filter((job) => job.channel === channel);
      const retrying = jobs.some((job) => job.status === 'retrying');
      let stateName = 'ok';
      let label = 'En sincronía';
      if (!settings.connected) {
        stateName = 'down';
        label = `Desconectado · ${jobs.length} en cola`;
      } else if (retrying) {
        stateName = 'retry';
        label = 'Reintentando';
      } else if (jobs.length) {
        stateName = 'syncing';
        label = `Sincronizando ${jobs.length}`;
      }
      element.dataset['state'] = stateName;
      setText(element.querySelector('[data-node-state-label]'), label);
      const button = element.querySelector<HTMLButtonElement>('[data-sell]');
      if (button) button.disabled = !settings.connected;
    });
  }

  let statesQueued = false;
  function queueStates(): void {
    if (statesQueued) return;
    statesQueued = true;
    requestAnimationFrame(() => {
      statesQueued = false;
      renderStates();
    });
  }

  renderCentral();
  CHANNEL_IDS.forEach(renderChannel);
  renderStates();

  scope.listen((event) => {
    if (event.type === 'sale') {
      const { order } = event;
      const origin = node(order.channel);
      ping(origin, 'in');
      bump(origin?.querySelector('[data-node-orders]') ?? null);
      renderChannel(order.channel);
      if (order.stage === 'cancelado') return;
      const landing = performance.now() + duration() * 1000;
      order.lines.forEach((line) => arrivals.set(line.p, landing));
      pulse(order.channel, 'in', 0, () => {
        renderCentral();
        ping(centralNode, 'in');
      });
    } else if (event.type === 'published') {
      const wait = event.p >= 0 ? Math.max(0, ((arrivals.get(event.p) ?? 0) - performance.now()) / 1000) : 0;
      pulse(event.channel, 'out', wait, () => {
        renderChannel(event.channel);
        ping(node(event.channel), 'out');
      });
    } else if (event.type === 'stock') {
      // Restocks and adjustments have no inbound pulse: show them right away.
      const last = state.movements[0];
      if (last && last.reason !== 'venta') renderCentral();
    } else if (event.type === 'jobs' || event.type === 'channel') {
      queueStates();
    } else if (event.type === 'kpi' || event.type === 'rules') {
      CHANNEL_IDS.forEach(renderChannel);
    }
  });

  hub.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((button) => {
    scope.on(button, 'click', () => {
      const channel = button.dataset['sell'] as ChannelId;
      sellManually(channel);
      button.classList.add('is-pressed');
      window.setTimeout(() => button.classList.remove('is-pressed'), 300);
    });
  });
}


