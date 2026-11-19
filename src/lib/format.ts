const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 });
const units = new Intl.NumberFormat('es-AR');
const decimal = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Times are always shown in Argentina (UTC-3), so the server render and the browser agree. */
const OFFSET = -3 * 3_600_000;

export const formatMoney = (value: number): string => money.format(value);
export const formatCompactMoney = (value: number): string => compactMoney.format(value);
export const formatUnits = (value: number): string => units.format(value);
export const formatDecimal = (value: number): string => decimal.format(value);
export const formatSeconds = (seconds: number): string => `${decimal.format(seconds)} s`;
export const formatPercent = (value: number): string => `${Math.round(value)} %`;

function local(at: number): Date {
  return new Date(at + OFFSET);
}

export function formatClock(at: number): string {
  const date = local(at);
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatClockSeconds(at: number): string {
  const date = local(at);
  return `${formatClock(at)}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function formatDay(at: number): string {
  const date = local(at);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''}`;
}

export function formatWeekday(at: number): string {
  const date = local(at);
  return `${WEEKDAYS[date.getUTCDay()] ?? ''} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()] ?? ''}`;
}

export function formatDateTime(at: number): string {
  return `${formatDay(at)} · ${formatClock(at)}`;
}

/** Hour of day (0-23) in Argentina. */
export function localHour(at: number): number {
  return local(at).getUTCHours();
}

/** Start of the Argentine day that contains `at`. */
export function dayStart(at: number): number {
  const date = local(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - OFFSET;
}

export function plural(count: number, one: string, many: string): string {
  return `${formatUnits(count)} ${count === 1 ? one : many}`;
}
