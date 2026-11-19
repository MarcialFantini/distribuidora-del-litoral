/**
 * The three sales channels. Every brand here is invented for the demo: they stand for
 * "a marketplace", "a hosted online store" and "the company's own site", nothing real.
 */
export type ChannelId = 'mkt' | 'web' | 'own';

export type Channel = {
  id: ChannelId;
  kind: string;
  name: string;
  initials: string;
  /** Base sync latency in demo seconds (real seconds at 1x). */
  latency: number;
  /** Share of incoming orders. */
  weight: number;
  fee: number;
  markup: number;
  reserve: number;
  errorRate: number;
  token: string;
  endpoint: string;
};

export const CHANNELS: readonly Channel[] = [
  {
    id: 'mkt',
    kind: 'Marketplace',
    name: 'Bazar Federal',
    initials: 'BF',
    latency: 4.2,
    weight: 0.5,
    fee: 13,
    markup: 18,
    reserve: 0,
    errorRate: 0.08,
    token: 'bzf_live_••••••••3f9a',
    endpoint: 'https://api.bazar-federal.demo/v2/items/stock',
  },
  {
    id: 'web',
    kind: 'Tienda online',
    name: 'Vitrina Plus',
    initials: 'VP',
    latency: 2.6,
    weight: 0.3,
    fee: 4,
    markup: 8,
    reserve: 10,
    errorRate: 0.04,
    token: 'vtp_sk_••••••••91c2',
    endpoint: 'https://tienda.vitrina-plus.demo/admin/api/inventory',
  },
  {
    id: 'own',
    kind: 'Sitio propio',
    name: 'litoral.shop',
    initials: 'LS',
    latency: 1.1,
    weight: 0.2,
    fee: 0,
    markup: 0,
    reserve: 15,
    errorRate: 0.02,
    token: 'interno · sin token',
    endpoint: 'https://litoral.shop.demo/internal/stock',
  },
];

export const CHANNEL_IDS: readonly ChannelId[] = ['mkt', 'web', 'own'];

export const CHANNEL_BY_ID: Readonly<Record<ChannelId, Channel>> = {
  mkt: CHANNELS[0] as Channel,
  web: CHANNELS[1] as Channel,
  own: CHANNELS[2] as Channel,
};

export function isChannelId(value: string | undefined | null): value is ChannelId {
  return value === 'mkt' || value === 'web' || value === 'own';
}
