import { useSearchParams } from 'react-router-dom';
import { ORDER_STATUSES } from '@rythubazaar/shared';
import { api, qs } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import {
  Async,
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
import type { Order } from '../../lib/types';

export default function OpsOrdersPage() {
  const { t, lang } = useI18n();
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const state = useApi(
    (s) =>
      api.page<Order>(
        `/api/admin/orders${qs({ status: get('status'), q: get('q'), from: get('from'), to: get('to'), page: get('page') || 1, pageSize: 20 })}`,
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
        title="Orders & delivery"
        subtitle="Assign agents, record collection, and move orders through dispatch and delivery."
      />
      <FilterBar onReset={() => setParams({})}>
        <FilterField label="Order number">
          <Input
            defaultValue={get('q')}
            placeholder="RB123456"
            onBlur={(e) => update('q', e.target.value.trim())}
          />
        </FilterField>
        <FilterField label="Status">
          <Select value={get('status')} onChange={(e) => update('status', e.target.value)}>
            <option value="">All</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`orderStatus.${s}`)}
              </option>
            ))}
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
        empty={<EmptyState title="No orders match these filters." />}
      >
        {(d) => (
          <>
            <DataList
              rows={d.data}
              rowKey={(o) => o.id}
              href={(o) => `/ops/orders/${o.id}`}
              columns={[
                { header: 'Order', cell: (o) => o.orderNumber },
                {
                  header: 'Status',
                  cell: (o) => <Pill tone={STATUS_TONE[o.status]}>{t(`orderStatus.${o.status}`)}</Pill>,
                },
                { header: 'Farm', cell: (o) => o.farmName },
                {
                  header: 'Deliver to',
                  cell: (o) => `${o.deliveryAddress.locality ?? ''}, ${o.deliveryAddress.district ?? ''}`,
                },
                {
                  header: 'Agent',
                  cell: (o) => o.delivery.agentName ?? <span className="text-ink-faint">Unassigned</span>,
                },
                { header: 'Total', cell: (o) => <Money paise={o.pricing.totalPaise} /> },
                { header: 'Placed', cell: (o) => formatDate(o.createdAt, lang, true) },
              ]}
            />
            <Pagination meta={d.meta} onPage={(p) => update('page', String(p))} />
          </>
        )}
      </Async>
    </>
  );
}
