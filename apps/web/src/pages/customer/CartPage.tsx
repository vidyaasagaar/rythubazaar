import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { useI18n } from '../../context/I18nContext';
import { useToast } from '../../context/ToastContext';
import { Async, Button, EmptyState, Money, Notice, PageHeader } from '../../components/ui';
import { ProduceImage } from '../../components/listing';
import { QuantityStepper } from '../ListingDetailPage';
import type { CartQuote, Shipment } from '../../lib/types';

/** Every fee shown on its own line; totals come from the server. */
export function ShipmentSummary({
  s,
}: {
  s: Pick<
    Shipment,
    'subtotalPaise' | 'deliveryFeePaise' | 'serviceFeePaise' | 'discountPaise' | 'totalPaise'
  >;
}) {
  const { t } = useI18n();
  const row = (label: string, value: React.ReactNode, strong = false) => (
    <div
      className={`flex justify-between gap-4 ${strong ? 'border-t border-line pt-2 font-semibold' : 'text-ink-soft'}`}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {row(t('cart.subtotal'), <Money paise={s.subtotalPaise} />)}
      {row(
        t('cart.deliveryFee'),
        s.deliveryFeePaise === 0 ? t('cart.free') : <Money paise={s.deliveryFeePaise} />,
      )}
      {row(t('cart.serviceFee'), <Money paise={s.serviceFeePaise} />)}
      {s.discountPaise > 0 &&
        row(
          t('cart.discount'),
          <>
            −<Money paise={s.discountPaise} />
          </>,
        )}
      {row(t('cart.total'), <Money paise={s.totalPaise} />, true)}
    </dl>
  );
}

export default function CartPage() {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const state = useApi((s) => api.get<CartQuote>('/api/cart', s), []);
  const [busy, setBusy] = useState<string | null>(null);

  const mutate = async (listingId: string, fn: () => Promise<CartQuote>) => {
    setBusy(listingId);
    try {
      state.setData(await fn());
    } catch (err) {
      toast('error', errorText(err));
      state.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container-page">
      <PageHeader title={t('cart.title')} />
      <Async
        state={state}
        isEmpty={(d) => d.lines.length === 0}
        empty={
          <EmptyState
            title={t('cart.empty')}
            action={
              <Link to="/market" className="btn btn-primary">
                {t('home.ctaBrowse')}
              </Link>
            }
          />
        }
      >
        {(cart) => (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="flex flex-col gap-5">
              {cart.shipments.length > 1 && <Notice tone="blue">{t('cart.multiShipment')}</Notice>}
              {cart.shipments.map((s) => (
                <section key={s.farmerId} className="card p-4 sm:p-5">
                  <h2 className="mb-3 font-semibold">{t('cart.shipmentFrom', { farm: s.farmName })}</h2>
                  <ul className="flex flex-col divide-y divide-line">
                    {s.lines.map((l) => (
                      <li key={l.listingId} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                        <div className="w-16 shrink-0">
                          <ProduceImage
                            listing={{
                              photos: l.photo ? [l.photo] : [],
                              category: 'VEGETABLES',
                              cropName: l.cropName,
                            }}
                            className="aspect-square"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link to={`/market/${l.listingId}`} className="font-medium hover:underline">
                            {l.cropName}
                          </Link>
                          <p className="text-sm text-ink-muted">
                            <Money paise={l.unitPricePaise} />{' '}
                            {t('market.perUnit', { unit: t(`unit.${l.unit}`) })}
                          </p>
                          {l.issue === 'UNAVAILABLE' && (
                            <p className="mt-1 flex items-center gap-1 text-sm text-chili-700">
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                              {t('cart.unavailable')}
                            </p>
                          )}
                          {l.issue === 'INSUFFICIENT_STOCK' && (
                            <p className="mt-1 flex items-center gap-1 text-sm text-turmeric-700">
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                              {t('cart.limited', { qty: l.quantityAvailable })}
                            </p>
                          )}
                        </div>
                        <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                          {l.issue !== 'UNAVAILABLE' && (
                            <QuantityStepper
                              value={l.quantity}
                              max={Math.max(l.quantityAvailable, 1)}
                              label={t('market.quantity')}
                              onChange={(n) =>
                                mutate(l.listingId, () =>
                                  api.put<CartQuote>('/api/cart/items', {
                                    listingId: l.listingId,
                                    quantity: n,
                                  }),
                                )
                              }
                            />
                          )}
                          <Money paise={l.lineTotalPaise} className="w-20 text-right font-semibold" />
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('cart.remove')}
                            loading={busy === l.listingId}
                            onClick={() =>
                              mutate(l.listingId, () => api.del<CartQuote>(`/api/cart/items/${l.listingId}`))
                            }
                            icon={<Trash2 className="h-4 w-4" />}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 border-t border-line pt-3">
                    <ShipmentSummary s={s} />
                  </div>
                </section>
              ))}
            </div>
            <aside className="card h-fit p-5 lg:sticky lg:top-24">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-semibold">{t('cart.grandTotal')}</span>
                <Money paise={cart.grandTotalPaise} className="text-2xl font-semibold" />
              </div>
              <p className="mt-2 text-sm text-ink-muted">{t('cart.feeNote')}</p>
              {cart.hasIssues ? (
                <Notice tone="amber" className="mt-4">
                  {t('error.LISTING_UNAVAILABLE')}
                </Notice>
              ) : null}
              <Link
                to="/checkout"
                className={`btn btn-primary mt-4 w-full ${cart.hasIssues ? 'pointer-events-none opacity-55' : ''}`}
                aria-disabled={cart.hasIssues}
              >
                {t('cart.checkout')}
              </Link>
            </aside>
          </div>
        )}
      </Async>
    </div>
  );
}
