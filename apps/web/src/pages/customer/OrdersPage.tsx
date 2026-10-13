import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { Async, EmptyState, Money, PageHeader, Pagination, Pill, STATUS_TONE } from '../../components/ui';
import type { Order } from '../../lib/types';

export default function OrdersPage() {
  const { t, lang } = useI18n();
  const [page, setPage] = useState(1);
  const state = useApi((s) => api.page<Order>(`/api/orders?page=${page}&pageSize=10`, s), [page]);
  return (
    <div className="container-page max-w-3xl">
      <PageHeader title={t('orders.title')} />
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={
          <EmptyState
            title={t('orders.empty')}
            action={
              <Link to="/market" className="btn btn-primary">
                {t('home.ctaBrowse')}
              </Link>
            }
          />
        }
      >
        {(d) => (
          <>
            <ul className="flex flex-col gap-3">
              {d.data.map((o) => (
                <li key={o.id}>
                  <Link to={`/orders/${o.id}`} className="card flex items-center gap-3 p-4 hover:shadow-card">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{t('orders.number', { number: o.orderNumber })}</span>
                        <Pill tone={STATUS_TONE[o.status]}>{t(`orderStatus.${o.status}`)}</Pill>
                      </div>
                      <p className="mt-1 truncate text-sm text-ink-muted">
                        {t('orders.fromFarm', { farm: o.farmName })} ·{' '}
                        {o.items.map((i) => i.cropName).join(', ')}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {t('orders.placedOn', { date: formatDate(o.createdAt, lang) })}
                      </p>
                    </div>
                    <Money paise={o.pricing.totalPaise} className="shrink-0 font-semibold" />
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                  </Link>
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
