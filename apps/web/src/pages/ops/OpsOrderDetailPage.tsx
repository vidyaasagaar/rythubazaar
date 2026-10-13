import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  allowedOrderTransitions,
  collectionSchema,
  ORDER_STATUSES_ASSIGNABLE,
  type OrderStatus,
} from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Async,
  Button,
  Dialog,
  Field,
  Input,
  Money,
  Notice,
  PageHeader,
  Pill,
  STATUS_TONE,
  Select,
  Textarea,
} from '../../components/ui';
import { HistoryList } from '../../components/orders';
import { ShipmentSummary } from '../customer/CartPage';
import type { Order, Payout } from '../../lib/types';

type Detail = Order & {
  customer: { name: string; email: string; phone: string | null } | null;
  farmer: { name: string; email: string; phone: string | null; village?: string; district?: string } | null;
  payout: Payout | null;
  return: { id: string; status: string; reason: string } | null;
};

interface Agent {
  id: string;
  name: string;
  zone: string;
  phone: string;
}

export default function OpsOrderDetailPage() {
  const { id } = useParams();
  const { t, lang, errorText } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const state = useApi((s) => api.get<Detail>(`/api/admin/orders/${id}`, s), [id]);
  const agents = useApi(
    (s) =>
      can('deliveries:manage')
        ? api.get<Agent[]>('/api/admin/delivery-agents', s)
        : Promise.resolve([] as Agent[]),
    [],
  );
  const [agentId, setAgentId] = useState('');
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [reason, setReason] = useState('');
  const [collectOpen, setCollectOpen] = useState(false);
  const [pickup, setPickup] = useState({
    quantitiesVerified: false,
    qualityGrade: 'A' as 'A' | 'B' | 'C',
    weightKg: '',
    notes: '',
  });
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast('success', msg);
      setPending(null);
      setReason('');
      setCollectOpen(false);
      state.reload();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Link to="/ops/orders" className="mb-4 inline-flex text-sm font-medium text-forest-700 hover:underline">
        ← All orders
      </Link>
      <Async state={state}>
        {(o) => {
          const transitions = can('orders:manage')
            ? allowedOrderTransitions(o.status, 'OPERATIONS').filter((x) => x.to !== 'COLLECTED')
            : [];
          const canCollect = can('deliveries:manage') && o.status === 'READY_FOR_COLLECTION';
          const canAssign = can('deliveries:manage') && ORDER_STATUSES_ASSIGNABLE.includes(o.status);
          return (
            <>
              <PageHeader
                title={`Order ${o.orderNumber}`}
                subtitle={`${o.farmName} · placed ${formatDate(o.createdAt, lang, true)}`}
                actions={<Pill tone={STATUS_TONE[o.status]}>{t(`orderStatus.${o.status}`)}</Pill>}
              />
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="flex flex-col gap-5">
                  {(transitions.length > 0 || canCollect || canAssign) && (
                    <section className="card p-4">
                      <h2 className="mb-3 font-semibold">Actions</h2>
                      <div className="flex flex-col gap-4">
                        {canAssign && (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <label className="block flex-1">
                              <span className="label">Delivery agent</span>
                              <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                                <option value="">
                                  {o.delivery.agentName
                                    ? `Current: ${o.delivery.agentName}`
                                    : 'Choose an agent'}
                                </option>
                                {agents.data?.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.name} · {a.zone}
                                  </option>
                                ))}
                              </Select>
                            </label>
                            <Button
                              disabled={!agentId}
                              loading={busy}
                              onClick={() =>
                                run(
                                  () => api.post(`/api/admin/orders/${o.id}/assign`, { agentId }),
                                  'Agent assigned',
                                )
                              }
                            >
                              {o.delivery.agentName ? 'Reassign' : 'Assign'}
                            </Button>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {canCollect && (
                            <Button
                              onClick={() => setCollectOpen(true)}
                              disabled={!o.delivery.agentName}
                              title={!o.delivery.agentName ? 'Assign an agent first' : undefined}
                            >
                              Record collection
                            </Button>
                          )}
                          {transitions.map((tr) => (
                            <Button
                              key={tr.to}
                              variant={
                                tr.to === 'CANCELLED' || tr.to === 'DELIVERY_FAILED' ? 'danger' : 'secondary'
                              }
                              onClick={() =>
                                tr.requiresReason
                                  ? setPending(tr.to)
                                  : run(
                                      () => api.post(`/api/admin/orders/${o.id}/transition`, { to: tr.to }),
                                      t(`orderStatus.${tr.to}`),
                                    )
                              }
                              loading={busy && pending === tr.to}
                              disabled={tr.requiresAgent && !o.delivery.agentName}
                            >
                              → {t(`orderStatus.${tr.to}`)}
                            </Button>
                          ))}
                        </div>
                        {canCollect && !o.delivery.agentName && (
                          <Notice tone="amber">Assign a delivery agent before recording collection.</Notice>
                        )}
                      </div>
                    </section>
                  )}
                  {!can('orders:manage') && <Notice>Your role can view orders but not change them.</Notice>}

                  <section className="card p-4">
                    <h2 className="mb-3 font-semibold">Items & price snapshot</h2>
                    <ul className="mb-3 flex flex-col divide-y divide-line text-sm">
                      {o.items.map((i) => (
                        <li key={i.listingId} className="flex justify-between gap-3 py-2">
                          <span>
                            {i.cropName} · {i.quantity} {t(`unit.${i.unit}`)} ×{' '}
                            <Money paise={i.unitPricePaise} />
                          </span>
                          <Money paise={i.lineTotalPaise} />
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
                    <p className="mt-2 text-xs text-ink-muted">
                      Farmer receives <Money paise={o.pricing.farmerPayoutPaise} /> (zero commission).
                      Payment: {o.payment.mode} · {o.payment.status}
                    </p>
                  </section>

                  <section className="grid gap-4 sm:grid-cols-2">
                    <div className="card p-4 text-sm">
                      <h3 className="mb-2 font-semibold">Customer & address</h3>
                      <p>{o.customer?.name}</p>
                      <p className="text-ink-muted">{o.customer?.email}</p>
                      <p className="mt-2">
                        {o.deliveryAddress.recipientName} · {o.deliveryAddress.phone}
                      </p>
                      <p className="text-ink-muted">
                        {[
                          o.deliveryAddress.line1,
                          o.deliveryAddress.locality,
                          o.deliveryAddress.district,
                          o.deliveryAddress.state,
                          o.deliveryAddress.pincode,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                    </div>
                    <div className="card p-4 text-sm">
                      <h3 className="mb-2 font-semibold">Farmer & collection</h3>
                      <p>{o.farmer?.name}</p>
                      <p className="text-ink-muted">
                        {o.farmer?.village}, {o.farmer?.district} · {o.farmer?.phone}
                      </p>
                      <p className="mt-2">
                        Agent: {o.delivery.agentName ?? '—'}{' '}
                        {o.delivery.agentPhone ? `· ${o.delivery.agentPhone}` : ''}
                      </p>
                      {o.pickup.collectedAt ? (
                        <p className="text-ink-muted">
                          Collected {formatDate(o.pickup.collectedAt, lang, true)} · grade{' '}
                          {o.pickup.qualityGrade} · qty verified {o.pickup.quantitiesVerified ? 'yes' : 'no'}
                          {o.pickup.weightKg ? ` · ${o.pickup.weightKg} kg` : ''}
                          {o.pickup.notes ? ` · “${o.pickup.notes}”` : ''} · by{' '}
                          {o.pickup.collectedBy?.slice(-6)}
                        </p>
                      ) : (
                        <p className="text-ink-muted">Not collected yet</p>
                      )}
                      {o.delivery.failedAttempts > 0 && (
                        <p className="text-chili-700">
                          Failed delivery attempts: {o.delivery.failedAttempts}
                        </p>
                      )}
                    </div>
                  </section>
                </div>

                <aside className="flex flex-col gap-5">
                  <section className="card p-4">
                    <h2 className="mb-3 font-semibold">Status history</h2>
                    <HistoryList history={o.statusHistory} />
                    {o.assignmentHistory && o.assignmentHistory.length > 0 && (
                      <>
                        <h3 className="mb-2 mt-4 text-sm font-semibold">Assignments</h3>
                        <ul className="flex flex-col gap-1 text-xs text-ink-muted">
                          {o.assignmentHistory.map((a, i) => (
                            <li key={i}>
                              {a.agentName} · {formatDate(a.at, lang, true)} · by {a.actorId.slice(-6)}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </section>
                  {o.payout && (
                    <section className="card p-4 text-sm">
                      <h2 className="mb-2 font-semibold">Payout</h2>
                      <div className="flex items-center justify-between">
                        <Money paise={o.payout.amountPaise} className="font-semibold" />
                        <Pill tone={STATUS_TONE[o.payout.status]}>{o.payout.status}</Pill>
                      </div>
                      <Link to={`/ops/payouts`} className="mt-2 inline-block text-forest-700 hover:underline">
                        Manage payouts →
                      </Link>
                    </section>
                  )}
                  {o.return && (
                    <section className="card p-4 text-sm">
                      <h2 className="mb-2 font-semibold">Return</h2>
                      <Pill tone={STATUS_TONE[o.return.status]}>{o.return.status}</Pill>{' '}
                      <span className="text-ink-muted">{o.return.reason}</span>
                    </section>
                  )}
                </aside>
              </div>

              <Dialog
                open={!!pending}
                onClose={() => setPending(null)}
                title={pending ? `Move to ${t(`orderStatus.${pending}`)}` : ''}
                footer={
                  <>
                    <Button variant="ghost" onClick={() => setPending(null)}>
                      Back
                    </Button>
                    <Button
                      variant="danger"
                      disabled={!reason.trim()}
                      loading={busy}
                      onClick={() =>
                        pending &&
                        run(
                          () =>
                            api.post(`/api/admin/orders/${o.id}/transition`, {
                              to: pending,
                              reason: reason.trim(),
                            }),
                          t(`orderStatus.${pending}`),
                        )
                      }
                    >
                      Confirm
                    </Button>
                  </>
                }
              >
                <Field label="Reason (recorded in the order history)">
                  {(p) => (
                    <Textarea
                      {...p}
                      maxLength={300}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  )}
                </Field>
              </Dialog>

              <Dialog
                open={collectOpen}
                onClose={() => setCollectOpen(false)}
                title="Record collection"
                footer={
                  <>
                    <Button variant="ghost" onClick={() => setCollectOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      loading={busy}
                      disabled={!pickup.quantitiesVerified}
                      onClick={() => {
                        const parsed = collectionSchema.safeParse({
                          quantitiesVerified: pickup.quantitiesVerified,
                          qualityGrade: pickup.qualityGrade,
                          weightKg: pickup.weightKg ? Number(pickup.weightKg) : undefined,
                          notes: pickup.notes || undefined,
                        });
                        if (!parsed.success) return toast('error', 'Check the collection details.');
                        void run(
                          () => api.post(`/api/admin/orders/${o.id}/collect`, parsed.data),
                          'Collection recorded · payout created',
                        );
                      }}
                    >
                      Confirm collection
                    </Button>
                  </>
                }
              >
                <div className="flex flex-col gap-4">
                  <Notice tone="blue">
                    Confirming collection moves stock from reserved to sold and creates the farmer's payout
                    (PENDING).
                  </Notice>
                  <label className="flex min-h-[44px] items-center gap-2.5 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-5 w-5 accent-forest-700"
                      checked={pickup.quantitiesVerified}
                      onChange={(e) => setPickup({ ...pickup, quantitiesVerified: e.target.checked })}
                    />
                    I verified the quantities against the order
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Quality grade">
                      {(p) => (
                        <Select
                          {...p}
                          value={pickup.qualityGrade}
                          onChange={(e) =>
                            setPickup({ ...pickup, qualityGrade: e.target.value as 'A' | 'B' | 'C' })
                          }
                        >
                          <option value="A">A — as listed</option>
                          <option value="B">B — minor issues</option>
                          <option value="C">C — significant issues</option>
                        </Select>
                      )}
                    </Field>
                    <Field label="Weighed (kg)" optional>
                      {(p) => (
                        <Input
                          {...p}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step="0.1"
                          value={pickup.weightKg}
                          onChange={(e) => setPickup({ ...pickup, weightKg: e.target.value })}
                        />
                      )}
                    </Field>
                  </div>
                  <Field label="Notes" optional>
                    {(p) => (
                      <Textarea
                        {...p}
                        maxLength={500}
                        value={pickup.notes}
                        onChange={(e) => setPickup({ ...pickup, notes: e.target.value })}
                      />
                    )}
                  </Field>
                </div>
              </Dialog>
            </>
          );
        }}
      </Async>
    </>
  );
}
