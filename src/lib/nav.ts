import type { IconName } from './icons';

export type ViewId = 'mapa' | 'productos' | 'producto' | 'pedidos' | 'sincronizacion' | 'reglas' | 'canales' | 'reportes';

export type NavItem = { id: ViewId; label: string; short: string; href: string; icon: IconName; key: string; mobile: boolean };

export const NAV: readonly NavItem[] = [
  { id: 'mapa', label: 'Mapa en vivo', short: 'Mapa', href: '/', icon: 'map', key: '1', mobile: true },
  { id: 'productos', label: 'Productos', short: 'Productos', href: '/productos', icon: 'box', key: '2', mobile: true },
  { id: 'pedidos', label: 'Pedidos', short: 'Pedidos', href: '/pedidos', icon: 'cart', key: '3', mobile: true },
  { id: 'sincronizacion', label: 'Sincronización', short: 'Sync', href: '/sincronizacion', icon: 'sync', key: '4', mobile: true },
  { id: 'reglas', label: 'Reglas', short: 'Reglas', href: '/reglas', icon: 'sliders', key: '5', mobile: false },
  { id: 'canales', label: 'Canales', short: 'Canales', href: '/canales', icon: 'plug', key: '6', mobile: false },
  { id: 'reportes', label: 'Reportes', short: 'Reportes', href: '/reportes', icon: 'chart', key: '7', mobile: false },
];

export function activeNav(view: ViewId): ViewId {
  return view === 'producto' ? 'productos' : view;
}
