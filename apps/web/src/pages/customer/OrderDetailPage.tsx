import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RETURN_REASONS, type ReturnReason, type ReturnStatus } from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useToast } from '../../context/ToastContext';
import {
  Async,
  Button,
  Dialog,
  Field,
  Money,
  Notice,
  PageHeader,
  Pill,
  STATUS_TONE,
  Select,
  Textarea,
} from '../../components/ui';
import { OrderProgress } from '../../components/orders';
import { ShipmentSummary } from './CartPage';
import type { Order } from '../../lib/types';

type OrderDetail = Order & {
  return: {
    id: string;
    status: ReturnStatus;
    reason: ReturnReason;
    refund: { mode: string; recordedAt?: string | null };
  } | null;
  returnWindowHours: number;
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const { t, lang, errorText } = useI18n();
  const toast = useToast();
  const state = useApi((s) => api.get<OrderDetail>(`/api/orders/${id}`, s), [id]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState<ReturnReason>('DAMAGED');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast('success', success);
      setConfirmCancel(false);
      setReturnOpen(false);
      state.reload();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page max-w-4xl">
      <Link to="/orders" className="mb-4 inline-flex text-sm font-medium text-forest-700 hover:underline">
        ← {t('orders.title')}
      </Link>
      <Async state={state}>
        {(o) => {
          const withinWindow =
            o.deliveredAt && Date.now() - new Date(o.deliveredAt).getTime() < o.returnWindowHours * 3600_000;
          return (
            <>
              <PageHeader
                title={t('orders.number', { number: o.orderNumber })}
                subtitle={`${t('orders.fromFarm', { farm: o.farmName })} · ${t('orders.placedOn', { date: formatDate(o.createdAt, lang) })}`}
                actions={<Pill tone={STATUS_TONE[o.status]}>{t(`orderStatus.${o.status}`)}</Pill>}
              />
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="flex flex-col gap-6">
                  <section className="card p-5">
                    <h2 className="mb-3 font-semibold">{t('orders.items')}</h2>
                    <ul className="mb-4 flex flex-col divide-y divide-line text-sm">
                      {o.items.map((i) => (
                        <li key={i.listingId} className="flex justify-between gap-3 py-2">
                          <span>
                            {i.cropName} · {i.quantity} {t(`unit.${i.unit}`)} ×{' '}
                            <Money paise={i.unitPricePaise} />
                          </span>
                          <Money paise={i.lineTotalPaise} className="font-medium" />
                        </li>
                      ))}
                    </ul>
                    <ShipmentSummary
                      s={{
                        subtotalPaise: o.pricing.subtotalPaise,
                        deliveryFeePaise: o.pricing.deliveryFeePaise ?? 0,
                        serviceFeePaise: o.pricing.serviceFeePaise ?? 0,
                        discountPaise: o.pricing.discountPaise ?? 0,
                        totalPaise: o.pricing.totalPaise ?? 0,
                      }}
                    />
                    <Notice tone="amber" className="mt-4">
                      {t('orders.demoNotCharged')}
                    </Notice>
                  </section>

                  <section className="card p-5">
                    <h2 className="mb-2 font-semibold">{t('orders.deliverTo')}</h2>
                    <p className="text-sm text-ink-soft">
                      {o.deliveryAddress.recipientName}, {o.deliveryAddress.line1},{' '}
                      {o.deliveryAddress.locality}, {o.deliveryAddress.district}, {o.deliveryAddress.state}{' '}
                      {o.deliveryAddress.pincode}
                    </p>
                  </section>

                  {o.return && (
                    <section className="card p-5">
                      <h2 className="mb-2 font-semibold">{t('orders.returnStatus')}</h2>
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone={STATUS_TONE[o.return.status]}>
                          {t(`returnStatus.${o.return.status}`)}
                        </Pill>
                        <span className="text-sm text-ink-muted">{t(`returnReason.${o.return.reason}`)}</span>
                      </div>
                      {o.return.status === 'REFUNDED' && (
                        <Notice className="mt-3">{t('orders.refundDemo')}</Notice>
                      )}
                    </section>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {o.status === 'PLACED' && (
                      <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                        {t('orders.cancel')}
                      </Button>
                    )}
                    {o.status === 'DELIVERED' && !o.return && withinWindow && (
                      <Button variant="secondary" onClick={() => setReturnOpen(true)}>
                        {t('orders.requestReturn')}
                      </Button>
                    )}
                    <Link to="/support" className="btn btn-ghost">
                      {t('nav.support')}
                    </Link>
                  </div>
                </div>

                <aside className="card h-fit p-5">
                  <h2 className="mb-4 font-semibold">{t('orders.track')}</h2>
                  <OrderProgress status={o.status} history={o.statusHistory} />
                </aside>
              </div>

              <Dialog
                open={confirmCancel}
                onClose={() => setConfirmCancel(false)}
                title={t('orders.cancel')}
                footer={
                  <>
                    <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
                      {t('common.back')}
                    </Button>
                    <Button
                      variant="danger"
                      loading={busy}
                      onClick={() =>
                        act(() => api.post(`/api/orders/${o.id}/cancel`), t('orderStatus.CANCELLED'))
                      }
                    >
                      {t('common.confirm')}
                    </Button>
                  </>
                }
              >
                <p>{t('orders.cancelConfirm')}</p>
              </Dialog>

              <Dialog
                open={returnOpen}
                onClose={() => setReturnOpen(false)}
                title={t('orders.requestReturn')}
                footer={
                  <>
                    <Button variant="ghost" onClick={() => setReturnOpen(false)}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      loading={busy}
                      onClick={() =>
                        act(
                          () => api.post('/api/returns', { orderId: o.id, reason, details }),
                          t('orders.returnSubmitted'),
                        )
                      }
                    >
                      {t('common.confirm')}
                    </Button>
                  </>
                }
              >
                <div className="flex flex-col gap-4">
                  <Field label={t('orders.returnReason')}>
                    {(p) => (
                      <Select
                        {...p}
                        value={reason}
                        onChange={(e) => setReason(e.target.value as ReturnReason)}
                      >
                        {RETURN_REASONS.map((r) => (
                          <option key={r} value={r}>
                            {t(`returnReason.${r}`)}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label={t('orders.returnDetails')} optional>
                    {(p) => (
                      <Textarea
                        {...p}
                        maxLength={500}
                        value={details}
                        onChange={(e) => setDetails(e.target.value)}
                      />
                    )}
                  </Field>
                </div>
              </Dialog>
            </>
          );
        }}
      </Async>
    </div>
  );
}
