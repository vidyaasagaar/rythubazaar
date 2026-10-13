import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TICKET_STATUSES, type TicketStatus } from '@rythubazaar/shared';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Async, EmptyState, PageHeader, Pagination, Pill, STATUS_TONE, Select } from '../../components/ui';
import { FilterBar, FilterField } from '../../components/datalist';

interface Ticket {
  id: string;
  ticketNumber: string;
  userId: string;
  subject: string;
  message: string;
  orderId: string | null;
  channel: 'WEB' | 'CALL';
  callId: string | null;
  status: TicketStatus;
  createdAt: string;
}

export default function OpsTicketsPage() {
  const { lang, errorText } = useI18n();
  const { can } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const state = useApi(
    (s) => api.page<Ticket>(`/api/admin/tickets${qs({ status, page, pageSize: 20 })}`, s),
    [status, page],
  );

  const setTicketStatus = async (id: string, next: TicketStatus) => {
    try {
      await api.patch(`/api/admin/tickets/${id}/status`, { status: next });
      toast('success', `Ticket ${next.toLowerCase().replace('_', ' ')}`);
      state.reload();
    } catch (err) {
      toast('error', errorText(err));
    }
  };

  return (
    <>
      <PageHeader title="Support tickets" />
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
            {TICKET_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>
      <Async state={state} isEmpty={(d) => d.data.length === 0} empty={<EmptyState title="No tickets." />}>
        {(d) => (
          <>
            <ul className="flex flex-col gap-3">
              {d.data.map((tk) => (
                <li key={tk.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{tk.subject}</p>
                      <p className="text-xs text-ink-muted">
                        {tk.ticketNumber} · {tk.channel} · user …{tk.userId.slice(-6)} ·{' '}
                        {formatDate(tk.createdAt, lang, true)}
                      </p>
                    </div>
                    <Pill tone={STATUS_TONE[tk.status]}>{tk.status}</Pill>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{tk.message}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    {tk.orderId && (
                      <Link to={`/ops/orders/${tk.orderId}`} className="text-forest-700 hover:underline">
                        Linked order →
                      </Link>
                    )}
                    {tk.callId && (
                      <Link to={`/ops/calls/${tk.callId}`} className="text-forest-700 hover:underline">
                        Call record →
                      </Link>
                    )}
                    {can('support:manage') && (
                      <Select
                        className="ml-auto max-w-[12rem]"
                        value={tk.status}
                        onChange={(e) => setTicketStatus(tk.id, e.target.value as TicketStatus)}
                        aria-label="Ticket status"
                      >
                        {TICKET_STATUSES.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </Select>
                    )}
                  </div>
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
