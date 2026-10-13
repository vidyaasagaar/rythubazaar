import { Check, X } from 'lucide-react';
import { ORDER_PROGRESS, type OrderStatus, type UiKey } from '@rythubazaar/shared';
import { useI18n } from '../context/I18nContext';
import { cx, formatDate } from '../lib/format';
import type { HistoryEntry } from '../lib/types';

/** Visual tracker along the happy path, with failure/cancel states called out. */
export function OrderProgress({ status, history }: { status: OrderStatus; history: HistoryEntry[] }) {
  const { t, lang } = useI18n();
  const reached = new Map<string, string>();
  for (const h of history) if (!reached.has(h.to)) reached.set(h.to, h.at);
  const current = ORDER_PROGRESS.indexOf(status);
  const lastIndex =
    current >= 0 ? current : Math.max(...ORDER_PROGRESS.map((s, i) => (reached.has(s) ? i : -1)));
  return (
    <div>
      <ol className="flex flex-col gap-0">
        {ORDER_PROGRESS.map((s, i) => {
          const done = i <= lastIndex;
          return (
            <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
              {i < ORDER_PROGRESS.length - 1 && (
                <span
                  className={cx(
                    'absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5',
                    i < lastIndex ? 'bg-forest-500' : 'bg-line',
                  )}
                  aria-hidden
                />
              )}
              <span
                className={cx(
                  'relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2',
                  done
                    ? 'border-forest-600 bg-forest-600 text-white'
                    : 'border-line-strong bg-white text-transparent',
                )}
              >
                <Check className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={cx('text-sm font-medium', !done && 'text-ink-faint')}>
                  {t(`orderStatus.${s}`)}
                </p>
                {reached.get(s) && (
                  <p className="text-xs text-ink-muted">{formatDate(reached.get(s), lang, true)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {(status === 'CANCELLED' || status === 'DELIVERY_FAILED') && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-chili-50 px-3 py-2 text-sm font-medium text-chili-700">
          <X className="h-4 w-4" aria-hidden />
          {t(`orderStatus.${status}`)}
        </p>
      )}
    </div>
  );
}

/** Full chronological history with who changed what (actor role) and when. */
export function HistoryList({
  history,
  labelFor,
}: {
  history: HistoryEntry[];
  labelFor?: (s: string) => string;
}) {
  const { t, lang } = useI18n();
  const label = labelFor ?? ((s: string) => t(`orderStatus.${s}` as UiKey));
  return (
    <ol className="flex flex-col gap-2 text-sm">
      {[...history].reverse().map((h, idx) => (
        <li key={idx} className="rounded-xl border border-line bg-ivory-50 px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="font-medium">
              {h.from ? `${label(h.from)} → ` : ''}
              {label(h.to)}
            </span>
            <time className="text-xs text-ink-muted">{formatDate(h.at, lang, true)}</time>
          </div>
          <p className="text-xs text-ink-muted">
            {h.actorRole ?? '—'}
            {h.actorId ? ` · ${h.actorId.slice(-6)}` : ''}
            {h.note ? ` · ${h.note}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
