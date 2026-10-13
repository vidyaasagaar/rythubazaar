import { Link } from 'react-router-dom';
import { ClipboardList, IndianRupee, Phone, Plus, Sprout } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { Async, EmptyState, Money, Notice, PageHeader, Pill, STATUS_TONE, Stat } from '../../components/ui';
import type { Order } from '../../lib/types';

interface Overview {
  activeListings: number;
  draftListings: number;
  openOrders: number;
  payouts: Partial<
    Record<'PENDING' | 'INITIATED' | 'SUCCEEDED' | 'FAILED', { amountPaise: number; count: number }>
  >;
  profileComplete: boolean;
  recentOrders: Order[];
}

export default function FarmerOverviewPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { config } = useConfig();
  const state = useApi((s) => api.get<Overview>('/api/farmer/overview', s), []);

  return (
    <div className="container-page">
      <PageHeader
        eyebrow={user?.name}
        title={t('farmer.overviewTitle')}
        actions={
          <Link to="/farmer/listings/new" className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            {t('farmer.newListing')}
          </Link>
        }
      />
      <Async state={state}>
        {(o) => {
          const pending =
            (o.payouts.PENDING?.amountPaise ?? 0) +
            (o.payouts.INITIATED?.amountPaise ?? 0) +
            (o.payouts.FAILED?.amountPaise ?? 0);
          return (
            <div className="flex flex-col gap-6">
              {!o.profileComplete && (
                <Notice tone="amber">
                  {t('farmer.profileIncomplete')}{' '}
                  <Link to="/farmer/profile" className="font-semibold underline">
                    {t('farmer.completeProfile')}
                  </Link>
                </Notice>
              )}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                  label={t('farmer.activeListings')}
                  value={o.activeListings}
                  hint={`${t('listingStatus.DRAFT')}: ${o.draftListings}`}
                  icon={<Sprout className="h-4 w-4" />}
                />
                <Stat
                  label={t('farmer.openOrders')}
                  value={o.openOrders}
                  icon={<ClipboardList className="h-4 w-4" />}
                />
                <Stat
                  label={t('farmer.payoutsPending')}
                  value={<Money paise={pending} />}
                  icon={<IndianRupee className="h-4 w-4" />}
                />
                <Stat
                  label={t('farmer.payoutsPaid')}
                  value={<Money paise={o.payouts.SUCCEEDED?.amountPaise ?? 0} />}
                  hint={config?.payoutProvider.simulated ? t('common.demoMode') : undefined}
                />
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <section>
                  <h2 className="mb-3 font-semibold">{t('farmer.recentOrders')}</h2>
                  {o.recentOrders.length === 0 ? (
                    <EmptyState title={t('common.empty')} />
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {o.recentOrders.map((ord) => (
                        <li key={ord.id}>
                          <Link
                            to="/farmer/orders"
                            className="card flex items-center justify-between gap-3 p-3.5 hover:shadow-card"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">{t('orders.number', { number: ord.orderNumber })}</p>
                              <p className="truncate text-sm text-ink-muted">
                                {ord.items.map((i) => `${i.cropName} × ${i.quantity}`).join(', ')} ·{' '}
                                {formatDate(ord.createdAt, lang)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <Money paise={ord.pricing.farmerPayoutPaise} className="font-semibold" />
                              <Pill tone={STATUS_TONE[ord.status]}>{t(`orderStatus.${ord.status}`)}</Pill>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <aside className="flex flex-col gap-3">
                  <Link to="/phone" className="card flex items-start gap-3 p-4 hover:shadow-card">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-700 text-ivory-50">
                      <Phone className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <p className="font-semibold">{t('home.callTitle')}</p>
                      <p className="text-sm text-ink-muted">
                        {t('home.callBody', { code: config?.demoDialCodes[0] ?? '…' })}
                      </p>
                    </div>
                  </Link>
                  <Notice tone="green">{t('farmer.payoutRule')}</Notice>
                </aside>
              </div>
            </div>
          );
        }}
      </Async>
    </div>
  );
}
