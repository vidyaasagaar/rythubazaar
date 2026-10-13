import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import {
  Async,
  EmptyState,
  Money,
  Notice,
  PageHeader,
  Pagination,
  Pill,
  STATUS_TONE,
} from '../../components/ui';
import type { Payout } from '../../lib/types';

export default function FarmerPayoutsPage() {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const state = useApi((s) => api.page<Payout>(`/api/farmer/payouts?page=${page}&pageSize=10`, s), [page]);
  return (
    <div className="container-page max-w-3xl">
      <PageHeader title={t('farmer.payoutsTitle')} />
      <div className="mb-5 flex flex-col gap-2">
        <Notice tone="green">{t('farmer.payoutRule')}</Notice>
        <Notice tone="amber" icon={<FlaskConical className="h-4 w-4" />}>
          {t('farmer.payoutSimulated')}
        </Notice>
      </div>
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={<EmptyState title={t('common.empty')} body={t('farmer.noPayouts')} />}
      >
        {(d) => (
          <>
            <ul className="flex flex-col gap-3">
              {d.data.map((p) => (
                <li key={p.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{t('orders.number', { number: p.orderNumber })}</p>
                      <p className="text-xs text-ink-muted">{formatDate(p.createdAt, lang, true)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Money paise={p.amountPaise} className="text-lg font-semibold" />
                      <Pill tone={STATUS_TONE[p.status]}>{t(`payoutStatus.${p.status}`)}</Pill>
                    </div>
                  </div>
                  {p.failureReason && <p className="mt-2 text-sm text-chili-700">{p.failureReason}</p>}
                  <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                    {p.history.map((h, i) => (
                      <li key={i}>
                        {t(`payoutStatus.${h.to as 'PENDING'}`)} · {formatDate(h.at, lang, true)}
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </Async>
    </div>
  );
}
