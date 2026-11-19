import { CHANNEL_BY_ID, CHANNEL_IDS } from '../../data/channels';
import { FEATURED_INDEX, productAt } from '../../data/catalog';
import { channelPrice } from '../../data/history';
import { formatMoney, formatUnits } from '../../lib/format';
import { publishedFor } from '../../lib/stock';
import { setText } from '../dom';
import { mountRulesEditor } from '../scenes/rules-live';
import type { Scope } from '../scope';
import { toast } from '../shell/toasts';
import { setChannel, setRules, state } from '../store';

export function mount(root: HTMLElement, scope: Scope): void {
  const editorRoot = root.querySelector<HTMLElement>('[data-rules-scene]');
  if (!editorRoot) return;
  const editor = mountRulesEditor(editorRoot, scope);

  function renderPreview(): void {
    const draft = editor.draft();
    root.querySelectorAll<HTMLElement>('[data-preview-row]').forEach((row) => {
      const p = Number(row.dataset['previewRow']);
      const central = state.stock[p] ?? 0;
      setText(row.querySelector('[data-preview-central]'), formatUnits(central));
      CHANNEL_IDS.forEach((channel) => {
        const cell = row.querySelector(`[data-preview-ch="${channel}"]`);
        const next = publishedFor(central, draft, channel);
        const now = state.published[channel][p] ?? 0;
        setText(cell, formatUnits(next));
        cell?.classList.toggle('is-up', next > now);
        cell?.classList.toggle('is-down', next < now);
      });
    });
  }
  renderPreview();
  scope.on(editorRoot, 'input', () => requestAnimationFrame(renderPreview));
  scope.on(editorRoot, 'click', () => requestAnimationFrame(renderPreview));
  scope.listen((event) => {
    if (event.type === 'stock' || event.type === 'published' || event.type === 'rules') renderPreview();
  });

  // Price rules: markup per channel.
  const form = root.querySelector<HTMLFormElement>('[data-markup-form]');
  const inputs = CHANNEL_IDS.map((channel) => root.querySelector<HTMLInputElement>(`[data-markup="${channel}"]`));
  const example = (): void => {
    const product = productAt(FEATURED_INDEX);
    const parts = CHANNEL_IDS.map((channel, index) => `${CHANNEL_BY_ID[channel].initials} ${formatMoney(channelPrice(product.price, Number(inputs[index]?.value ?? 0)))}`);
    setText(root.querySelector('[data-markup-example]'), `Ejemplo, ${product.name} (base ${formatMoney(product.price)}): ${parts.join(' · ')}`);
  };
  inputs.forEach((input, index) => {
    const channel = CHANNEL_IDS[index];
    if (input && channel) input.value = String(state.channels[channel].markup);
    if (input) scope.on(input, 'input', example);
  });
  example();
  if (form) {
    scope.on(form, 'submit', (event) => {
      event.preventDefault();
      CHANNEL_IDS.forEach((channel, index) => {
        const value = Math.max(0, Math.min(60, Math.round(Number(inputs[index]?.value ?? 0))));
        if (value !== state.channels[channel].markup) setChannel(channel, { markup: value });
      });
      toast({ title: 'Recargos guardados', body: 'Los precios se republican en cada canal.', icon: 'check', tone: 'ok' });
    });
  }

  const centralWins = root.querySelector<HTMLInputElement>('[data-central-wins]');
  if (centralWins) {
    centralWins.checked = state.rules.centralWins;
    scope.on(centralWins, 'change', () => {
      setRules({ centralWins: centralWins.checked }, false);
      toast({ title: centralWins.checked ? 'El central siempre gana' : 'Los conflictos esperan tu decisión', icon: 'shield' });
    });
  }
}
