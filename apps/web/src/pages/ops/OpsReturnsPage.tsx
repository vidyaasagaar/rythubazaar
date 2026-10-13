import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RETURN_STATUSES } from '@rythubazaar/shared';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Async,
  Button,
  EmptyState,
  Money,
  Notice,
  PageHeader,
  Pagination,
  Pill,
  STATUS_TONE,
  Select,
} from '../../components/ui';
import { FilterBar, FilterField } from '../../components/datalist';

interface Ret {
  id: string;
  orderId: string;
  orderNumber: string;
  reason: string;
  details: string;
  status: string;
  refund: { amountPaise: number; mode: string; recordedAt?: string | null };
  payoutImpact: string;
  createdAt: string;
}

export default function OpsReturnsPage() {
  const { t, lang, errorText } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const state = useApi(
    (s) => api.page<Ret>(`/api/admin/returns${qs({ status, page, pageSize: 20 })}`, s),
    [status, page],
  );
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, path: string, body: unknown, msg: string) => {
    setBusy(id);
    try {
      await api.post(`/api/admin/returns/${id}/${path}`, body);
      toast('success', msg);
      state.reload();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Returns & refunds" />
      <Notice tone="blue" className="mb-4">
        After verified collection the company carries return risk: approving or refunding a return never
        reduces the farmer’s payout. Refunds are recorded in demo mode only.
      </Notice>
      <FilterBar>
        <FilterField label="Status">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            {RETURN_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>
      <Async state={state} isEmpty={(d) => d.data.length === 0} empty={<EmptyState title="No returns." />}>
        {(d) => (
          <>
            <ul className="flex flex-col gap-3">
              {d.data.map((r) => (
                <li key={r.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`/ops/orders/${r.orderId}`}
                        className="font-semibold text-forest-800 hover:underline"
                      >
                        Order {r.orderNumber}
                      </Link>
                      <p className="text-sm">
                        {t(`returnReason.${r.reason as 'OTHER'}`)}
                        {r.details ? ` — “${r.details}”` : ''}
                      </p>
                      <p className="text-xs text-ink-muted">{formatDate(r.createdAt, lang, true)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>
                      {r.status === 'REFUNDED' && (
                        <span className="text-xs text-ink-muted">
                          <Money paise={r.refund.amountPaise} /> · {r.refund.mode}
                        </span>
                      )}
                    </div>
                  </div>
                  {can('returns:manage') && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.status === 'REQUESTED' && (
                        <>
                          <Button
                            size="sm"
                            loading={busy === r.id}
                            onClick={() => act(r.id, 'review', { decision: 'APPROVED' }, 'Return approved')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === r.id}
                            onClick={() => act(r.id, 'review', { decision: 'REJECTED' }, 'Return rejected')}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {r.status === 'APPROVED' && (
                        <Button
                          size="sm"
                          loading={busy === r.id}
                          onClick={() => act(r.id, 'refund', {}, 'Refund recorded (demo)')}
                        >
                          Record refund (demo)
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </Async>
    </>
  );
}
