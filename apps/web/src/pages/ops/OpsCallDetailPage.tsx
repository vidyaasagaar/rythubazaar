import { Link, useParams } from 'react-router-dom';
import { CALL_EVENT_LANE, type CallEventKind } from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { cx, formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { Async, PageHeader, Pill, STATUS_TONE } from '../../components/ui';
import { ExportButtons } from '../../components/exports';
import type { CallSessionRow } from './OpsCallsPage';

interface EventRow {
  seq: number;
  at: string;
  kind: CallEventKind;
  node: string;
  text: string | null;
  payload: Record<string, unknown>;
}

interface Detail {
  session: CallSessionRow;
  events: EventRow[];
  auditTrail: {
    at: string;
    category: string;
    action: string;
    outcome: string;
    actorType: string;
    actorRole: string | null;
    resourceType: string | null;
    resourceId: string | null;
  }[];
}

const LANE_STYLE: Record<string, { label: string; cls: string }> = {
  CALLER: { label: '1 · Caller said / pressed', cls: 'border-l-forest-500 bg-forest-50' },
  INTERPRETATION: { label: '2 · Interpretation', cls: 'border-l-sky-600 bg-sky-50' },
  TOOL: { label: '3–4 · Backend request / result', cls: 'border-l-earth-500 bg-earth-50' },
  BUSINESS: { label: '5 · Business action committed', cls: 'border-l-forest-800 bg-forest-100' },
  SYSTEM: { label: 'System / IVR prompt', cls: 'border-l-line-strong bg-white' },
};

export default function OpsCallDetailPage() {
  const { callId } = useParams();
  const { lang } = useI18n();
  const { can } = useAuth();
  const state = useApi((s) => api.get<Detail>(`/api/admin/calls/${callId}`, s), [callId]);

  return (
    <>
      <Link to="/ops/calls" className="mb-4 inline-flex text-sm font-medium text-forest-700 hover:underline">
        ← Call audit center
      </Link>
      <Async state={state}>
        {(d) => (
          <>
            <PageHeader
              title="Call timeline"
              subtitle={<span className="break-all font-mono text-xs">{d.session.callId}</span>}
              actions={
                can('audit:export') ? (
                  <ExportButtons
                    base="/api/admin/calls/export"
                    query={`?callId=${d.session.callId}`}
                    name={`call-${d.session.callId}`}
                  />
                ) : undefined
              }
            />
            <section className="card mb-5 grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
              {[
                [
                  'Outcome',
                  <Pill key="o" tone={STATUS_TONE[d.session.outcome] ?? 'neutral'}>
                    {d.session.outcome}
                  </Pill>,
                ],
                [
                  'Dialed',
                  <span key="d" className="font-mono">
                    {d.session.dialedCode}
                  </span>,
                ],
                ['Mode', d.session.mode],
                ['Language', `${d.session.language ?? '—'} (${d.session.languageSource})`],
                ['Caller', d.session.userRole],
                ['Started', formatDate(d.session.startedAt, lang, true)],
                ['Ended', formatDate(d.session.endedAt, lang, true)],
                ['Interpreter', d.session.interpreter],
                ['Audio recording', d.session.audioRecording],
                [
                  'Correlation ID',
                  <span key="c" className="break-all font-mono text-xs">
                    {d.session.correlationId}
                  </span>,
                ],
                [
                  'Error',
                  d.session.hasError ? (
                    <Pill key="e" tone="red">
                      {d.session.errorSummary ?? 'ERROR'}
                    </Pill>
                  ) : (
                    '—'
                  ),
                ],
                [
                  'Linked',
                  <span key="l" className="flex flex-col gap-0.5 text-xs">
                    {d.session.linked.listingIds.map((id) => (
                      <span key={id}>listing …{id.slice(-6)}</span>
                    ))}
                    {d.session.linked.orderIds.map((id) => (
                      <Link key={id} to={`/ops/orders/${id}`} className="text-forest-700 hover:underline">
                        order …{id.slice(-6)}
                      </Link>
                    ))}
                    {d.session.linked.ticketIds.map((id) => (
                      <span key={id}>ticket …{id.slice(-6)}</span>
                    ))}
                    {!d.session.linked.listingIds.length &&
                      !d.session.linked.orderIds.length &&
                      !d.session.linked.ticketIds.length &&
                      '—'}
                  </span>,
                ],
              ].map(([k, v]) => (
                <div key={String(k)} className="min-w-0">
                  <p className="text-xs text-ink-muted">{k}</p>
                  <div className="min-w-0">{v}</div>
                </div>
              ))}
            </section>

            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              {Object.entries(LANE_STYLE).map(([k, v]) => (
                <span key={k} className={cx('rounded-md border-l-4 px-2 py-1', v.cls)}>
                  {v.label}
                </span>
              ))}
            </div>

            <ol className="flex flex-col gap-1.5">
              {d.events.map((e) => {
                const lane = e.kind === 'PROMPT' ? 'SYSTEM' : (CALL_EVENT_LANE[e.kind] ?? 'SYSTEM');
                return (
                  <li
                    key={e.seq}
                    className={cx(
                      'rounded-lg border border-l-4 border-line px-3 py-2 text-sm',
                      LANE_STYLE[lane]!.cls,
                    )}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span className="font-mono text-xs text-ink-muted">#{e.seq}</span>
                      <span className="text-xs font-semibold">{e.kind}</span>
                      <span className="text-xs text-ink-muted">{e.node}</span>
                      <time className="ml-auto text-xs text-ink-muted">
                        {new Date(e.at).toLocaleTimeString()}
                      </time>
                    </div>
                    {e.text && <p className="mt-1 break-words">{e.text}</p>}
                    {Object.keys(e.payload).length > 0 && (
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded bg-black/5 p-2 font-mono text-[11px] leading-snug text-ink-soft">
                        {JSON.stringify(e.payload, null, 1)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ol>

            {d.auditTrail.length > 0 && (
              <section className="card mt-6 p-4">
                <h2 className="mb-3 font-semibold">Audit records for this call (correlation)</h2>
                <ul className="flex flex-col gap-1 text-sm">
                  {d.auditTrail.map((a, i) => (
                    <li key={i} className="flex flex-wrap gap-x-3">
                      <span className="text-xs text-ink-muted">{formatDate(a.at, lang, true)}</span>
                      <span className="font-medium">{a.action}</span>
                      <span className="text-ink-muted">
                        {a.outcome} · {a.actorRole ?? a.actorType} · {a.resourceType}{' '}
                        {a.resourceId?.slice(-8)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </Async>
    </>
  );
}
