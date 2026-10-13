import { useState } from 'react';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { Async, EmptyState, Input, Notice, PageHeader, Pagination, Pill, Select } from '../../components/ui';
import { DataList, FilterBar, FilterField } from '../../components/datalist';
import { ExportButtons } from '../../components/exports';

interface AuditRow {
  id: string;
  at: string;
  category: string;
  action: string;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILURE';
  actorType: string;
  actorRole: string | null;
  actorId: string | null;
  resourceType: string | null;
  resourceId: string | null;
  correlationId: string | null;
  details: Record<string, unknown>;
}

export default function OpsAuditPage() {
  const { lang } = useI18n();
  const { can } = useAuth();
  const empty = {
    action: '',
    category: '',
    outcome: '',
    resourceId: '',
    correlationId: '',
    from: '',
    to: '',
  };
  const [f, setF] = useState(empty);
  const [page, setPage] = useState(1);
  const state = useApi(
    (s) => api.page<AuditRow>(`/api/admin/audit${qs({ ...f, page, pageSize: 25 })}`, s),
    [f, page],
  );
  const set = (k: keyof typeof empty, v: string) => {
    setF({ ...f, [k]: v });
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Append-only record of business, security, admin and export events. Corrections are new events, never edits."
        actions={
          can('audit:export') ? (
            <ExportButtons base="/api/admin/audit/export" query={qs(f)} name="audit-log" />
          ) : undefined
        }
      />
      {!can('audit:read') && <Notice tone="amber">Your role cannot read the audit log.</Notice>}
      <FilterBar onReset={() => setF(empty)}>
        <FilterField label="Action starts with">
          <Input
            defaultValue={f.action}
            placeholder="ORDER_"
            onBlur={(e) => set('action', e.target.value.trim())}
          />
        </FilterField>
        <FilterField label="Category">
          <Select value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All</option>
            {['BUSINESS', 'SECURITY', 'ADMIN', 'EXPORT'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Outcome">
          <Select value={f.outcome} onChange={(e) => set('outcome', e.target.value)}>
            <option value="">All</option>
            {['SUCCESS', 'DENIED', 'FAILURE'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Resource ID">
          <Input defaultValue={f.resourceId} onBlur={(e) => set('resourceId', e.target.value.trim())} />
        </FilterField>
        <FilterField label="Correlation ID">
          <Input defaultValue={f.correlationId} onBlur={(e) => set('correlationId', e.target.value.trim())} />
        </FilterField>
        <FilterField label="From">
          <Input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <Input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} />
        </FilterField>
      </FilterBar>
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={<EmptyState title="No audit records match." />}
      >
        {(d) => (
          <>
            <DataList
              rows={d.data}
              rowKey={(a) => a.id}
              title={(a) => a.action}
              columns={[
                { header: 'Action', cell: (a) => <span className="font-medium">{a.action}</span> },
                { header: 'When', cell: (a) => formatDate(a.at, lang, true) },
                { header: 'Category', cell: (a) => a.category },
                {
                  header: 'Outcome',
                  cell: (a) => (
                    <Pill tone={a.outcome === 'SUCCESS' ? 'green' : a.outcome === 'DENIED' ? 'amber' : 'red'}>
                      {a.outcome}
                    </Pill>
                  ),
                },
                {
                  header: 'Actor',
                  cell: (a) => `${a.actorRole ?? a.actorType}${a.actorId ? ` …${a.actorId.slice(-6)}` : ''}`,
                },
                {
                  header: 'Resource',
                  cell: (a) =>
                    a.resourceType ? `${a.resourceType} …${(a.resourceId ?? '').slice(-8)}` : '—',
                },
                {
                  header: 'Details',
                  hideOnCard: false,
                  cell: (a) => (
                    <code
                      className="block max-w-[22rem] truncate text-xs text-ink-muted"
                      title={JSON.stringify(a.details)}
                    >
                      {JSON.stringify(a.details)}
                    </code>
                  ),
                },
              ]}
            />
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </Async>
    </>
  );
}
