import { useState } from 'react';
import { CERTIFICATION_STATUSES, LISTING_STATUSES } from '@rythubazaar/shared';
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
  Input,
  Money,
  PageHeader,
  Pagination,
  Pill,
  STATUS_TONE,
  Select,
} from '../../components/ui';
import { DataList, FilterBar, FilterField } from '../../components/datalist';
import type { OwnerListing } from '../../lib/types';

export default function OpsListingsPage() {
  const { t, lang, errorText } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState({ q: '', status: '', certificationStatus: '', page: 1 });
  const state = useApi(
    (s) => api.page<OwnerListing>(`/api/admin/listings${qs({ ...f, pageSize: 20 })}`, s),
    [f],
  );
  const [busy, setBusy] = useState<string | null>(null);

  const review = async (id: string, decision: 'VERIFIED' | 'REJECTED') => {
    setBusy(id);
    try {
      await api.post(`/api/admin/listings/${id}/certification`, {
        decision,
        note: decision === 'VERIFIED' ? 'Certificate checked by staff' : 'Could not verify certificate',
      });
      toast('success', `Certificate ${decision.toLowerCase()}`);
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
        title="Listings"
        subtitle="Inspect listings and verify organic certificates. Badges are shown to buyers only after verification."
      />
      <FilterBar onReset={() => setF({ q: '', status: '', certificationStatus: '', page: 1 })}>
        <FilterField label="Crop">
          <Input defaultValue={f.q} onBlur={(e) => setF({ ...f, q: e.target.value.trim(), page: 1 })} />
        </FilterField>
        <FilterField label="Status">
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}>
            <option value="">All</option>
            {LISTING_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Certificate">
          <Select
            value={f.certificationStatus}
            onChange={(e) => setF({ ...f, certificationStatus: e.target.value, page: 1 })}
          >
            <option value="">All</option>
            {CERTIFICATION_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={<EmptyState title="No listings match." />}
      >
        {(d) => (
          <>
            <DataList
              rows={d.data}
              rowKey={(l) => l.id}
              columns={[
                { header: 'Crop', cell: (l) => l.cropName },
                { header: 'Status', cell: (l) => <Pill tone={STATUS_TONE[l.status]}>{l.status}</Pill> },
                {
                  header: 'Price',
                  cell: (l) => (
                    <>
                      <Money paise={l.pricePerUnitPaise} /> / {t(`unit.${l.unit}`)}
                    </>
                  ),
                },
                {
                  header: 'Stock (avail/res/sold)',
                  cell: (l) => `${l.quantityAvailable} / ${l.quantityReserved} / ${l.quantitySold}`,
                },
                { header: 'Location', cell: (l) => `${l.location.village}, ${l.location.district}` },
                {
                  header: 'Source',
                  cell: (l) => (l.source === 'CALL' ? <Pill tone="blue">Phone call</Pill> : 'Web'),
                },
                {
                  header: 'Certificate',
                  cell: (l) =>
                    l.certification.status === 'NONE' ? (
                      <span className="text-ink-faint">—</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span>
                          <Pill
                            className="whitespace-normal"
                            tone={
                              l.certification.status === 'VERIFIED'
                                ? 'green'
                                : l.certification.status === 'REJECTED'
                                  ? 'red'
                                  : 'amber'
                            }
                          >
                            {l.certification.status.replace(/_/g, ' ').toLowerCase()}
                          </Pill>
                        </span>
                        <span className="text-xs text-ink-muted">
                          {l.certification.body} · {l.certification.certificateNumber} · until{' '}
                          {formatDate(l.certification.validUntil, lang)}
                        </span>
                        {l.certification.status === 'PENDING_VERIFICATION' &&
                          can('listings:verify-certification') && (
                            <span className="flex gap-1">
                              <Button
                                size="sm"
                                loading={busy === l.id}
                                onClick={() => review(l.id, 'VERIFIED')}
                              >
                                Verify
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={busy === l.id}
                                onClick={() => review(l.id, 'REJECTED')}
                              >
                                Reject
                              </Button>
                            </span>
                          )}
                      </div>
                    ),
                },
              ]}
            />
            <Pagination meta={d.meta} onPage={(p) => setF({ ...f, page: p })} />
          </>
        )}
      </Async>
    </>
  );
}
