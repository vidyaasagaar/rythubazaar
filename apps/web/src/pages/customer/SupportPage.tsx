import { useState, type FormEvent } from 'react';
import { supportTicketSchema, type TicketStatus } from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { zodFieldErrors } from '../../lib/forms';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Async,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Pill,
  STATUS_TONE,
  Select,
  Textarea,
} from '../../components/ui';
import type { Order, ReturnSummary } from '../../lib/types';

interface Ticket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: TicketStatus;
  channel: 'WEB' | 'CALL';
  createdAt: string;
}

export default function SupportPage() {
  const { t, lang, errorText } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const tickets = useApi((s) => api.page<Ticket>('/api/support/tickets?pageSize=20', s), []);
  const orders = useApi(
    (s) =>
      user?.role === 'CUSTOMER'
        ? api.page<Order>('/api/orders?pageSize=20', s)
        : api.page<Order>('/api/farmer/orders?pageSize=20', s),
    [user?.role],
  );
  const returns = useApi(
    (s) =>
      user?.role === 'CUSTOMER'
        ? api.page<ReturnSummary>('/api/returns?pageSize=20', s)
        : Promise.resolve(null),
    [user?.role],
  );
  const [form, setForm] = useState({ subject: '', message: '', orderId: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = supportTicketSchema.safeParse({ ...form, orderId: form.orderId || undefined });
    if (!parsed.success) return setErrors(zodFieldErrors(t, parsed.error));
    setErrors({});
    setBusy(true);
    try {
      const r = await api.post<{ ticketNumber: string }>('/api/support/tickets', parsed.data);
      toast('success', t('support.created', { number: r.ticketNumber }));
      setForm({ subject: '', message: '', orderId: '' });
      tickets.reload();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page">
      <PageHeader title={t('support.title')} />
      <div className="grid gap-6 lg:grid-cols-2">
        <form className="card flex flex-col gap-4 p-5" onSubmit={submit} noValidate>
          <Field label={t('support.subject')} error={errors.subject}>
            {(p) => (
              <Input
                {...p}
                maxLength={120}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            )}
          </Field>
          <Field label={t('support.order')} optional>
            {(p) => (
              <Select
                {...p}
                value={form.orderId}
                onChange={(e) => setForm({ ...form, orderId: e.target.value })}
              >
                <option value="">{t('support.none')}</option>
                {orders.data?.data.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.orderNumber} · {o.farmName}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('support.message')} error={errors.message}>
            {(p) => (
              <Textarea
                {...p}
                maxLength={2000}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
            )}
          </Field>
          <Button type="submit" loading={busy}>
            {t('support.submit')}
          </Button>
        </form>

        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-3 font-semibold">{t('support.myTickets')}</h2>
            <Async
              state={tickets}
              isEmpty={(d) => d.data.length === 0}
              empty={<EmptyState title={t('common.empty')} />}
            >
              {(d) => (
                <ul className="flex flex-col gap-2">
                  {d.data.map((tk) => (
                    <li key={tk.id} className="card flex items-center justify-between gap-3 p-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tk.subject}</p>
                        <p className="text-xs text-ink-muted">
                          {tk.ticketNumber} · {tk.channel === 'CALL' ? t('nav.phone') : 'Web'} ·{' '}
                          {formatDate(tk.createdAt, lang)}
                        </p>
                      </div>
                      <Pill tone={STATUS_TONE[tk.status]}>{t(`ticketStatus.${tk.status}`)}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Async>
          </section>
          {user?.role === 'CUSTOMER' && (
            <section>
              <h2 className="mb-3 font-semibold">{t('support.returns')}</h2>
              <Async
                state={returns}
                isEmpty={(d) => !d || d.data.length === 0}
                empty={<EmptyState title={t('common.empty')} />}
              >
                {(d) => (
                  <ul className="flex flex-col gap-2">
                    {d!.data.map((r) => (
                      <li key={r.id} className="card flex items-center justify-between gap-3 p-3.5">
                        <div>
                          <p className="font-medium">{t('orders.number', { number: r.orderNumber })}</p>
                          <p className="text-xs text-ink-muted">{t(`returnReason.${r.reason}`)}</p>
                        </div>
                        <Pill tone={STATUS_TONE[r.status]}>{t(`returnStatus.${r.status}`)}</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </Async>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
