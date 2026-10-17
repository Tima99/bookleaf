const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('en-IN');

/** "₹11,970" — returns the fallback for null/undefined (books in production have no MRP). */
export function formatINR(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return inrFormatter.format(value);
}

export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return numberFormatter.format(value);
}

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** "20 Jun 2023". Date-only values are formatted in UTC so they never shift a day. */
export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? fallback : dateFormatter.format(d);
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const d = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? fallback : dateTimeFormatter.format(d);
}

/** Compact age such as "5m", "3h", "2d" — used for queue SLA cues. */
export function formatAge(from: string | Date, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(from).getTime();
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function hoursSince(from: string | Date, now: Date = new Date()): number {
  return (now.getTime() - new Date(from).getTime()) / 3_600_000;
}

/** Converts a Date to YYYY-MM-DD (UTC). */
export function toIsoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}
