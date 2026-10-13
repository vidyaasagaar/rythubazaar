import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react';
import { cx } from '../lib/format';
import { useI18n } from '../context/I18nContext';
import type { PageMeta } from '../lib/api';

// ---------- Buttons ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'md' | 'sm';
  loading?: boolean;
  icon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading,
    icon,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// ---------- Form fields ----------
interface FieldProps {
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}
export function Field({ label, error, hint, optional, children, className }: FieldProps) {
  const id = useId();
  const { t } = useI18n();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {optional && <span className="ml-1 font-normal text-ink-faint">({t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-chili-700">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx('input', (invalid || rest['aria-invalid']) && 'input-invalid', className)}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'input appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10',
        rest['aria-invalid'] && 'input-invalid',
        className,
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235F6A5D' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx('input min-h-[96px] py-2.5', rest['aria-invalid'] && 'input-invalid', className)}
      {...rest}
    />
  );
}

// ---------- Status ----------
export type Tone = 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'earth';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-ivory-200 text-ink-soft',
  green: 'bg-forest-100 text-forest-800',
  amber: 'bg-turmeric-100 text-turmeric-700',
  red: 'bg-chili-100 text-chili-700',
  blue: 'bg-sky-100 text-sky-700',
  earth: 'bg-earth-100 text-earth-700',
};
export function Pill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx('chip', toneClass[tone], className)}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  ACTIVE: 'green',
  PAUSED: 'amber',
  ARCHIVED: 'neutral',
  PLACED: 'blue',
  CONFIRMED: 'blue',
  READY_FOR_COLLECTION: 'earth',
  COLLECTED: 'earth',
  DISPATCHED: 'blue',
  DELIVERED: 'green',
  DELIVERY_FAILED: 'red',
  CANCELLED: 'neutral',
  PENDING: 'amber',
  INITIATED: 'blue',
  SUCCEEDED: 'green',
  FAILED: 'red',
  REQUESTED: 'amber',
  APPROVED: 'blue',
  REJECTED: 'neutral',
  REFUNDED: 'green',
  OPEN: 'amber',
  IN_PROGRESS: 'blue',
  RESOLVED: 'green',
  COMPLETED: 'green',
  ABANDONED: 'neutral',
  INTERRUPTED: 'red',
  NOT_AVAILABLE: 'neutral',
};

// ---------- Layout helpers ----------
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
  as: As = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <As className={cx('card', className)}>{children}</As>;
}

export function Notice({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const border: Record<Tone, string> = {
    neutral: 'border-line bg-ivory-50 text-ink-soft',
    green: 'border-forest-200 bg-forest-50 text-forest-900',
    amber: 'border-turmeric-100 bg-turmeric-50 text-turmeric-700',
    red: 'border-chili-100 bg-chili-50 text-chili-700',
    blue: 'border-sky-100 bg-sky-50 text-sky-700',
    earth: 'border-earth-100 bg-earth-50 text-earth-700',
  };
  return (
    <div
      className={cx(
        'flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm',
        border[tone],
        className,
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ---------- States ----------
export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-ink-muted">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      <span className="text-sm">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-ivory-200', className)} aria-hidden />;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-ivory-50 px-6 py-10 text-center">
      <Inbox className="h-7 w-7 text-ink-faint" aria-hidden />
      <p className="font-medium text-ink-soft">{title}</p>
      {body && <p className="max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, errorText } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-chili-100 bg-chili-50 px-6 py-8 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-chili-600" aria-hidden />
      <p className="max-w-md text-sm text-chili-700">{errorText(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

/** Wraps the three async states so every page handles loading, error and empty consistently. */
export function Async<T>({
  state,
  children,
  empty,
  isEmpty,
  skeleton,
}: {
  state: { data: T | undefined; error: unknown; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  skeleton?: ReactNode;
}) {
  if (state.error) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return <>{skeleton ?? <Spinner />}</>;
  if (empty && isEmpty?.(state.data)) return <>{empty}</>;
  return <>{children(state.data)}</>;
}

export function Pagination({ meta, onPage }: { meta?: PageMeta; onPage: (page: number) => void }) {
  const { t } = useI18n();
  if (!meta || meta.pages <= 1) return null;
  return (
    <nav className="mt-6 flex items-center justify-between gap-3" aria-label="Pagination">
      <Button variant="secondary" size="sm" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        {t('common.previous')}
      </Button>
      <span className="text-sm text-ink-muted">
        {t('common.pageOf', { page: meta.page, pages: meta.pages })}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={meta.page >= meta.pages}
        onClick={() => onPage(meta.page + 1)}
      >
        {t('common.next')}
      </Button>
    </nav>
  );
}

// ---------- Dialog ----------
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-white p-0 text-ink shadow-lift backdrop:bg-ink/40"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 className="text-lg font-semibold">{title}</h2>
            <button
              className="-m-1 rounded-lg p-1.5 text-ink-muted hover:bg-ivory-200"
              onClick={onClose}
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">{label}</p>
        {icon && <span className="text-forest-600">{icon}</span>}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export function Money({ paise, className }: { paise: number | null | undefined; className?: string }) {
  return (
    <span className={cx('tabular-nums', className)}>
      {typeof paise === 'number'
        ? new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
          }).format(paise / 100)
        : '—'}
    </span>
  );
}

export function DemoBadge({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <span className="chip border border-turmeric-100 bg-turmeric-50 text-turmeric-700">
      {children ?? t('common.demoMode')}
    </span>
  );
}
