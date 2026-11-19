import type { IconName } from './icons';

export type VisibleStage = { id: 'nuevo' | 'central' | 'factura' | 'etiqueta'; label: string; icon: IconName };

/** The four steps every order walks through before it is dispatched. */
export const STAGES_VISIBLE: readonly VisibleStage[] = [
  { id: 'nuevo', label: 'Recibido', icon: 'cart' },
  { id: 'central', label: 'Sistema central', icon: 'box' },
  { id: 'factura', label: 'Factura', icon: 'invoice' },
  { id: 'etiqueta', label: 'Etiqueta', icon: 'label' },
];
