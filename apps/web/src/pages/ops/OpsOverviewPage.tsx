import { Link } from 'react-router-dom';
import { AlertTriangle, Headphones, IndianRupee, Phone, Truck, Undo2 } from 'lucide-react';
import { ORDER_STATUSES } from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useI18n } from '../../context/I18nContext';
import { Async, Money, PageHeader, Pill, STATUS_TONE, Stat } from '../../components/ui';

interface Overview {
  ordersByStatus: Record<string, number>;
  returnsOpen: number;
  ticketsOpen: number;
  callsLast24h: number;
  callErrorsLast24h: number;
  payoutsByStatus: Record<string, { count: number; amountPaise: number }> | null;
}

export default function OpsOverviewPage() {
  const { t } = useI18n();
  const state = useApi((s) => api.get<Overview>('/api/admin/overview', s), []);
  return (
    <>
      <PageHeader
        title="Today's operations"
        subtitle="Orders needing action, open returns, payouts and call health."
      />
      <Async state={state}>
        {(o) => {
          const needsAction =
            (o.ordersByStatus.PLACED ?? 0) +
            (o.ordersByStatus.CONFIRMED ?? 0) +
            (o.ordersByStatus.READY_FOR_COLLECTION ?? 0);
          return (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Stat
                  label="Orders to move"
                  value={needsAction}
                  icon={<Truck className="h-4 w-4" />}
                  hint="Placed, confirmed or ready"
                />
                <Stat label="Open returns" value={o.returnsOpen} icon={<Undo2 className="h-4 w-4" />} />
                <Stat label="Open tickets" value={o.ticketsOpen} icon={<Headphones className="h-4 w-4" />} />
                <Stat
                  label="Calls (24h)"
                  value={o.callsLast24h}
                  icon={<Phone className="h-4 w-4" />}
                  hint={o.callErrorsLast24h ? `${o.callErrorsLast24h} with errors` : 'No errors'}
                />
              </div>
              <section className="card p-4">
                <h2 className="mb-3 font-semibold">Orders by status</h2>
                <div className="flex flex-wrap gap-2">
                  {ORDER_STATUSES.map((s) => (
                    <Link
                      key={s}
                      to={`/ops/orders?status=${s}`}
                      className="rounded-xl border border-line px-3 py-2 hover:bg-ivory-50"
                    >
                      <Pill tone={STATUS_TONE[s]}>{t(`orderStatus.${s}`)}</Pill>
                      <span className="ml-2 font-semibold tabular-nums">{o.ordersByStatus[s] ?? 0}</span>
                    </Link>
                  ))}
                </div>
              </section>
              {o.payoutsByStatus && (
                <section className="card p-4">
                  <h2 className="mb-3 flex items-center gap-2 font-semibold">
                    <IndianRupee className="h-4 w-4" aria-hidden /> Payouts (simulated provider)
                  </h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {(['PENDING', 'INITIATED', 'SUCCEEDED', 'FAILED'] as const).map((s) => (
                      <Link
                        key={s}
                        to={`/ops/payouts?status=${s}`}
                        className="rounded-xl border border-line p-3 hover:bg-ivory-50"
                      >
                        <Pill tone={STATUS_TONE[s]}>{s}</Pill>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {o.payoutsByStatus![s]?.count ?? 0}
                        </p>
                        <Money
                          paise={o.payoutsByStatus![s]?.amountPaise ?? 0}
                          className="text-sm text-ink-muted"
                        />
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {o.callErrorsLast24h > 0 && (
                <Link
                  to="/ops/calls?hasError=true"
                  className="flex items-center gap-2 text-sm font-medium text-chili-700 hover:underline"
                >
                  <AlertTriangle className="h-4 w-4" aria-hidden /> Review calls with errors
                </Link>
              )}
            </div>
          );
        }}
      </Async>
    </>
  );
}
