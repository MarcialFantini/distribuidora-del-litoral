import { CHANNEL_IDS, type ChannelId } from '../../data/channels';
import { FEATURED_INDEX } from '../../data/catalog';
import { formatUnits } from '../../lib/format';
import { clampReserve, publishedFor, reservedUnits, sellable, sharedPool, type StockRules } from '../../lib/stock';
import { countTo, setText } from '../dom';
import type { Scope } from '../scope';
import { toast } from '../shell/toasts';
import { setRules, state } from '../store';

/**
 * Scene 6: sliders that reserve a share of the stock per channel. The preview updates live
 * while dragging; "Aplicar" republishes the catalogue on the three channels.
 */
export function mountRulesEditor(section: HTMLElement, scope: Scope, p = FEATURED_INDEX): { draft: () => StockRules } {
  let draft: StockRules = structuredClone({ reserve: state.rules.reserve, safety: state.rules.safety, pauseBelow: state.rules.pauseBelow });
  const apply = section.querySelector<HTMLButtonElement>('[data-rules-apply]');
  const revert = section.querySelector<HTMLButtonElement>('[data-rules-revert]');

  function dirty(): boolean {
    const live = state.rules;
    return draft.safety !== live.safety || draft.pauseBelow !== live.pauseBelow || CHANNEL_IDS.some((id) => draft.reserve[id] !== live.reserve[id]);
  }

  function render(): void {
    const central = state.stock[p] ?? 0;
    setText(section.querySelector('[data-rules-central]'), formatUnits(central));
    CHANNEL_IDS.forEach((channel) => {
      const input = section.querySelector<HTMLInputElement>(`[data-rule-input="${channel}"]`);
      if (input && Number(input.value) !== draft.reserve[channel]) input.value = String(draft.reserve[channel]);
      setText(section.querySelector(`[data-rule-ch="${channel}"] [data-rule-out]`), `${draft.reserve[channel]} %`);
      countTo(section.querySelector(`[data-rule-result="${channel}"] [data-rule-units]`), publishedFor(central, draft, channel), formatUnits, 300);
    });
    const safetyInput = section.querySelector<HTMLInputElement>('[data-safety-input]');
    if (safetyInput && Number(safetyInput.value) !== draft.safety) safetyInput.value = String(draft.safety);
    setText(section.querySelector('[data-safety-out]'), `${draft.safety} u.`);
    const pause = section.querySelector<HTMLInputElement>('[data-pause-input]');
    if (pause && Number(pause.value) !== draft.pauseBelow) pause.value = String(draft.pauseBelow);
    setText(section.querySelector('[data-pause-out]'), draft.pauseBelow ? `${draft.pauseBelow} u.` : 'Nunca');
    // Stacked bar: proportions of the central stock, drawn with flex-grow only (no layout jumps).
    const total = Math.max(1, central);
    const safety = central - sellable(central, draft);
    const parts: Record<string, number> = {
      safety,
      shared: sharedPool(central, draft),
      ...Object.fromEntries(CHANNEL_IDS.map((id) => [id, reservedUnits(central, draft, id)])),
    };
    Object.entries(parts).forEach(([key, value]) => {
      const seg = section.querySelector<HTMLElement>(`[data-seg="${key}"]`);
      if (seg) seg.style.flexGrow = String(value / total);
    });
    const changed = dirty();
    if (apply) apply.disabled = !changed;
    if (revert) revert.disabled = !changed;
  }

  CHANNEL_IDS.forEach((channel: ChannelId) => {
    const input = section.querySelector<HTMLInputElement>(`[data-rule-input="${channel}"]`);
    if (!input) return;
    scope.on(input, 'input', () => {
      const value = clampReserve(draft, channel, Number(input.value));
      draft = { ...draft, reserve: { ...draft.reserve, [channel]: value } };
      if (Number(input.value) !== value) input.value = String(value);
      render();
    });
  });
  const safetyInput = section.querySelector<HTMLInputElement>('[data-safety-input]');
  if (safetyInput) {
    scope.on(safetyInput, 'input', () => {
      draft = { ...draft, safety: Number(safetyInput.value) };
      render();
    });
  }
  const pause = section.querySelector<HTMLInputElement>('[data-pause-input]');
  if (pause) {
    scope.on(pause, 'input', () => {
      draft = { ...draft, pauseBelow: Number(pause.value) };
      render();
    });
  }
  if (apply) {
    scope.on(apply, 'click', () => {
      setRules({ reserve: { ...draft.reserve }, safety: draft.safety, pauseBelow: draft.pauseBelow });
      toast({ title: 'Reglas aplicadas', body: 'Republicando el catálogo en los tres canales.', icon: 'sliders', tone: 'ok' });
      render();
    });
  }
  if (revert) {
    scope.on(revert, 'click', () => {
      draft = structuredClone({ reserve: state.rules.reserve, safety: state.rules.safety, pauseBelow: state.rules.pauseBelow });
      render();
    });
  }

  render();
  scope.listen((event) => {
    if ((event.type === 'stock' && event.p === p) || event.type === 'rules') {
      if (event.type === 'rules' && !dirty()) draft = structuredClone({ reserve: state.rules.reserve, safety: state.rules.safety, pauseBelow: state.rules.pauseBelow });
      render();
    }
  });
  return { draft: () => draft };
}

export function mount(section: HTMLElement, scope: Scope): void {
  mountRulesEditor(section, scope);
}
