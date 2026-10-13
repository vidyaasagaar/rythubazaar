import { useState } from 'react';
import { CheckCircle2, PackageCheck, Truck, XCircle } from 'lucide-react';
import { ORDER_STATUSES, type OrderStatus } from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { cx, formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useToast } from '../../context/ToastContext';
import {
  Async,
  Button,
  Dialog,
  EmptyState,
  Field,
  Money,
  PageHeader,
  Pagination,
  Pill,
  STATUS_TONE,
  Select,
  Textarea,
} from '../../components/ui';
import type { Order } from '../../lib/types';

export default function FarmerOrdersPage() {
  const { t, lang, errorText } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [reason, setReason] = useState('');
  const state = useApi(
    (s) =>
      api.page<Order>(`/api/farmer/orders?page=${page}&pageSize=10${status ? `&status=${status}` : ''}`, s),
    [status, page],
  );

  const move = async (o: Order, to: OrderStatus, why?: string) => {
    setBusy(o.id);
    try {
      await api.post(`/api/farmer/orders/${o.id}/transition`, { to, reason: why });
      toast('success', t(`orderStatus.${to}`));
      setRejecting(null);
      setReason('');
      state.reload();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container-page max-w-4xl">
      <PageHeader title={t('farmer.ordersTitle')} subtitle={t('farmer.payoutRule')} />
      <div className="mb-5 max-w-xs">
        <label className="label" htmlFor="ord-status">
          {t('common.status')}
        </label>
        <Select
          id="ord-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as OrderStatus);
            setPage(1);
          }}
        >
          <option value="">{t('common.all')}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`orderStatus.${s}`)}
            </option>
          ))}
        </Select>
      </div>
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={<EmptyState title={t('common.empty')} />}
      >
        {(d) => (
          <>
            <ul className="flex flex-col gap-3">
              {d.data.map((o) => (
                <li key={o.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{t('orders.number', { number: o.orderNumber })}</span>
                        <Pill tone={STATUS_TONE[o.status]}>{t(`orderStatus.${o.status}`)}</Pill>
                      </div>
                      <p className="text-xs text-ink-muted">
                        {formatDate(o.createdAt, lang, true)} · {o.deliveryAddress.locality},{' '}
                        {o.deliveryAddress.district}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-ink-muted">{t('farmer.youReceive')}</p>
                      <Money
                        paise={o.pricing.farmerPayoutPaise}
                        className="text-lg font-semibold text-forest-800"
                      />
                    </div>
                  </div>
                  <ul className="mt-3 flex flex-col gap-1 text-sm">
                    {o.items.map((i) => (
                      <li key={i.listingId} className="flex justify-between gap-3">
                        <span>
                          {i.cropName} · {i.quantity} {t(`unit.${i.unit}`)}
                        </span>
                        <Money paise={i.lineTotalPaise} />
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center gap-2 rounded-xl bg-ivory-50 px-3 py-2 text-sm">
                    <Truck
                      className={cx('h-4 w-4', o.pickup.collectedAt ? 'text-forest-600' : 'text-ink-faint')}
                      aria-hidden
                    />
                    {o.pickup.collectedAt
                      ? t('farmer.collected', { date: formatDate(o.pickup.collectedAt, lang, true) })
                      : t('farmer.awaitingCollection')}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.status === 'PLACED' && (
                      <Button
                        size="sm"
                        loading={busy === o.id}
                        onClick={() => move(o, 'CONFIRMED')}
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      >
                        {t('farmer.confirmOrder')}
                      </Button>
                    )}
                    {o.status === 'CONFIRMED' && (
                      <Button
                        size="sm"
                        loading={busy === o.id}
                        onClick={() => move(o, 'READY_FOR_COLLECTION')}
                        icon={<PackageCheck className="h-3.5 w-3.5" />}
                      >
                        {t('farmer.markReady')}
                      </Button>
                    )}
                    {(o.status === 'PLACED' || o.status === 'CONFIRMED') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRejecting(o)}
                        icon={<XCircle className="h-3.5 w-3.5" />}
                      >
                        {t('farmer.rejectOrder')}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </Async>
      <Dialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title={t('farmer.rejectOrder')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              {t('common.back')}
            </Button>
            <Button
              variant="danger"
              loading={!!busy}
              disabled={!reason.trim()}
              onClick={() => rejecting && move(rejecting, 'CANCELLED', reason.trim())}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-muted">{t('orders.cancelConfirm')}</p>
        <Field label={t('common.reason')}>
          {(p) => (
            <Textarea {...p} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          )}
        </Field>
      </Dialog>
    </div>
  );
}
