import { formatINR, type LanguageCode } from '@rythubazaar/shared';

export const money = (paise: number | null | undefined) =>
  typeof paise === 'number' ? formatINR(paise) : '—';

export function formatDate(
  value: string | Date | null | undefined,
  lang: LanguageCode,
  withTime = false,
): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d);
}

export function formatTime(value: string | Date | null | undefined, lang: LanguageCode): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(d);
}

export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
