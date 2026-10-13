import { useSearchParams } from 'react-router-dom';
import { CALL_OUTCOMES, LANGUAGE_LIST } from '@rythubazaar/shared';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import {
  Async,
  EmptyState,
  Input,
  Notice,
  PageHeader,
  Pagination,
  Pill,
  STATUS_TONE,
  Select,
} from '../../components/ui';
import { DataList, FilterBar, FilterField } from '../../components/datalist';
import { ExportButtons } from '../../components/exports';

export interface CallSessionRow {
  callId: string;
  correlationId: string;
  dialedCode: string;
  route: string | null;
  mode: string;
  language: string | null;
  languageSource: string;
  userId: string | null;
  userRole: string;
  node: string;
  state: string;
  outcome: string;
  hasError: boolean;
  errorSummary: string | null;
  interpreter: string;
  audioRecording: string;
  eventCount: number;
  linked: { listingIds: string[]; orderIds: string[]; ticketIds: string[] };
  startedAt: string;
  endedAt: string | null;
}

const FILTERS = ['callId', 'dialedCode', 'language', 'outcome', 'hasError', 'from', 'to'] as const;

export default function OpsCallsPage() {
  const { lang } = useI18n();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const filterQuery = qs(Object.fromEntries(FILTERS.map((k) => [k, get(k)])));
  const state = useApi(
    (s) =>
      api.page<CallSessionRow>(
        `/api/admin/calls${qs({ ...Object.fromEntries(FILTERS.map((k) => [k, get(k)])), page: get('page') || 1, pageSize: 20 })}`,
        s,
      ),
    [params.toString()],
  );
  const update = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Call audit center"
        subtitle="Every demo call with its transcript, interpretation, backend requests/results and committed business events."
        actions={
          can('audit:export') ? (
            <ExportButtons base="/api/admin/calls/export" query={filterQuery} name="call-audit" />
          ) : undefined
        }
      />
      <Notice className="mb-4">
        Calls are in-app simulations (DEMO). Audio recording is disabled. Exports are redacted and the export
        itself is audited.
      </Notice>
      <FilterBar onReset={() => setParams({})}>
        <FilterField label="Call ID">
          <Input defaultValue={get('callId')} onBlur={(e) => update('callId', e.target.value.trim())} />
        </FilterField>
        <FilterField label="Dial code">
          <Input
            defaultValue={get('dialedCode')}
            inputMode="numeric"
            onBlur={(e) => update('dialedCode', e.target.value.trim())}
          />
        </FilterField>
        <FilterField label="Language">
          <Select value={get('language')} onChange={(e) => update('language', e.target.value)}>
            <option value="">All</option>
            {LANGUAGE_LIST.map((l) => (
              <option key={l.code} value={l.code}>
                {l.englishName}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Outcome">
          <Select value={get('outcome')} onChange={(e) => update('outcome', e.target.value)}>
            <option value="">All</option>
            {CALL_OUTCOMES.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Errors">
          <Select value={get('hasError')} onChange={(e) => update('hasError', e.target.value)}>
            <option value="">Any</option>
            <option value="true">With errors</option>
            <option value="false">No errors</option>
          </Select>
        </FilterField>
        <FilterField label="From">
          <Input type="date" value={get('from')} onChange={(e) => update('from', e.target.value)} />
        </FilterField>
        <FilterField label="To">
          <Input type="date" value={get('to')} onChange={(e) => update('to', e.target.value)} />
        </FilterField>
      </FilterBar>
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={<EmptyState title="No calls match these filters." />}
      >
        {(d) => (
          <>
            <DataList
              rows={d.data}
              rowKey={(c) => c.callId}
              href={(c) => `/ops/calls/${c.callId}`}
              title={(c) => <span className="break-all font-mono text-xs">{c.callId}</span>}
              columns={[
                {
                  header: 'Call ID',
                  cell: (c) => <span className="font-mono text-xs">{c.callId.slice(0, 8)}…</span>,
                },
                { header: 'Started', cell: (c) => formatDate(c.startedAt, lang, true) },
                { header: 'Dialed', cell: (c) => <span className="font-mono">{c.dialedCode}</span> },
                { header: 'Language', cell: (c) => c.language ?? '—' },
                { header: 'Caller', cell: (c) => c.userRole },
                {
                  header: 'Outcome',
                  cell: (c) => <Pill tone={STATUS_TONE[c.outcome] ?? 'neutral'}>{c.outcome}</Pill>,
                },
                { header: 'Events', cell: (c) => c.eventCount },
                {
                  header: 'Error',
                  cell: (c) => (c.hasError ? <Pill tone="red">{c.errorSummary ?? 'ERROR'}</Pill> : '—'),
                },
              ]}
            />
            <Pagination meta={d.meta} onPage={(p) => update('page', String(p))} />
          </>
        )}
      </Async>
    </>
  );
}
