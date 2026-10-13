import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';
import { PAYOUT_STATUSES } from '@rythubazaar/shared';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Async,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Money,
  Notice,
  PageHeader,
  Pagination,
  Pill,
  STATUS_TONE,
  Select,
} from '../../components/ui';
import { FilterBar, FilterField } from '../../components/datalist';
import type { Payout } from '../../lib/types';

export default function OpsPayoutsPage() {
  const { lang, errorText } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? 1);
  const state = useApi(
    (s) => api.page<Payout>(`/api/admin/payouts${qs({ status, page, pageSize: 20 })}`, s),
    [status, page],
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failing, setFailing] = useState<Payout | null>(null);
  const [failReason, setFailReason] = useState('');
  const manage = can('payouts:manage');

  const act = async (id: string, path: string, body: unknown, msg: string) => {
    setBusy(id);
    try {
      const r = await api.post<{ note?: string; changed?: boolean }>(
        `/api/admin/payouts/${id}/${path}`,
        body,
      );
      toast('success', r?.note ? `${msg} — ${r.note}` : msg);
      setFailing(null);
      setFailReason('');
      state.reload();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="Payouts are created on verified collection. Success or failure only comes from the payout provider."
      />
      <Notice tone="amber" icon={<FlaskConical className="h-4 w-4" />} className="mb-4">
        Provider: <strong>MOCK (simulated)</strong>. No real money moves. “Simulate provider result” stands in
        for a signed provider webhook and is admin-only and audited.
      </Notice>
      {!manage && (
        <Notice className="mb-4">
          Your role can view payouts. Only administrators can initiate, retry or reconcile them.
        </Notice>
      )}
      <FilterBar onReset={() => setParams({})}>
        <FilterField label="Status">
          <Select
            value={status}
            onChange={(e) => setParams(e.target.value ? { status: e.target.value } : {})}
          >
            <option value="">All</option>
            {PAYOUT_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={<EmptyState title="No payouts yet." />}
      >
        {(d) => (
          <>
            <ul className="flex flex-col gap-3">
              {d.data.map((p) => (
                <li key={p.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">Order {p.orderNumber}</p>
                      <p className="text-xs text-ink-muted">
                        Farmer …{p.farmerId.slice(-6)} · created {formatDate(p.createdAt, lang, true)} ·
                        attempts {p.attempts}
                      </p>
                      {p.providerReference && (
                        <p className="break-all font-mono text-xs text-ink-muted">{p.providerReference}</p>
                      )}
                      {p.failureReason && <p className="text-sm text-chili-700">{p.failureReason}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Money paise={p.amountPaise} className="text-lg font-semibold" />
                      <div className="flex gap-1">
                        <Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill>
                        {p.simulated && <Pill tone="amber">SIMULATED</Pill>}
                      </div>
                    </div>
                  </div>
                  <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                    {p.history.map((h, i) => (
                      <li key={i}>
                        {h.to} · {h.source}
                        {h.actorId ? ` …${h.actorId.slice(-6)}` : ''} · {formatDate(h.at, lang, true)}
                      </li>
                    ))}
                  </ol>
                  {manage && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(p.status === 'PENDING' || p.status === 'FAILED') && (
                        <Button
                          size="sm"
                          loading={busy === p.id}
                          onClick={() =>
                            act(
                              p.id,
                              'initiate',
                              {},
                              p.status === 'FAILED' ? 'Retry initiated' : 'Payout initiated',
                            )
                          }
                        >
                          {p.status === 'FAILED' ? 'Retry payout' : 'Initiate payout'}
                        </Button>
                      )}
                      {p.status === 'INITIATED' && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === p.id}
                            onClick={() => act(p.id, 'reconcile', {}, 'Reconciled')}
                          >
                            Reconcile with provider
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === p.id}
                            onClick={() =>
                              act(
                                p.id,
                                'simulate-result',
                                { outcome: 'SUCCEEDED' },
                                'Provider reported success (simulated)',
                              )
                            }
                          >
                            Simulate provider success
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => setFailing(p)}>
                            Simulate provider failure
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination
              meta={d.meta}
              onPage={(n) => setParams({ ...(status ? { status } : {}), page: String(n) })}
            />
          </>
        )}
      </Async>
      <Dialog
        open={!!failing}
        onClose={() => setFailing(null)}
        title="Simulate provider failure"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFailing(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!failReason.trim()}
              loading={!!busy}
              onClick={() =>
                failing &&
                act(
                  failing.id,
                  'simulate-result',
                  { outcome: 'FAILED', failureReason: failReason.trim() },
                  'Provider reported failure (simulated)',
                )
              }
            >
              Record failure
            </Button>
          </>
        }
      >
        <Field label="Failure reason">
          {(p) => (
            <Input
              {...p}
              maxLength={200}
              value={failReason}
              onChange={(e) => setFailReason(e.target.value)}
              placeholder="e.g. Beneficiary account closed"
            />
          )}
        </Field>
      </Dialog>
    </>
  );
}
