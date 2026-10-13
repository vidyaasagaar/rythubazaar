import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, MapPin, Minus, Plus, ShoppingBasket, Sprout } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { formatDate } from '../lib/format';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ClaimBadge, ProduceImage } from '../components/listing';
import { Async, Button, Money, Notice } from '../components/ui';
import type { PublicListing } from '../lib/types';

export function QuantityStepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div
      className="inline-flex items-center rounded-xl border border-line-strong bg-white"
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className="grid h-11 w-11 place-items-center rounded-l-xl hover:bg-ivory-200 disabled:opacity-40"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        aria-label="−"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        className="h-11 w-14 border-x border-line text-center text-base tabular-nums focus:outline-none"
        inputMode="numeric"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ''));
          if (Number.isFinite(n)) onChange(Math.min(Math.max(1, n), Math.max(1, max)));
        }}
      />
      <button
        type="button"
        className="grid h-11 w-11 place-items-center rounded-r-xl hover:bg-ivory-200 disabled:opacity-40"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="+"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ListingDetailPage() {
  const { id } = useParams();
  const { t, lang, errorText } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const state = useApi((s) => api.get<PublicListing>(`/api/listings/${id}`, s), [id]);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const add = async (l: PublicListing) => {
    if (!user) return navigate(`/login?next=/market/${l.id}`);
    setBusy(true);
    try {
      await api.put('/api/cart/items', { listingId: l.id, quantity: qty });
      toast('success', t('market.added'));
    } catch (err) {
      toast('error', errorText(err));
      state.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page">
      <Link to="/market" className="mb-4 inline-flex text-sm font-medium text-forest-700 hover:underline">
        ← {t('nav.market')}
      </Link>
      <Async state={state}>
        {(l) => (
          <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
            <div className="flex flex-col gap-3">
              <ProduceImage listing={l} className="aspect-[4/3] sm:aspect-[16/11]" />
              {l.photos.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {l.photos.slice(1).map((p) => (
                    <img
                      key={p}
                      src={p}
                      alt=""
                      className="aspect-square w-full rounded-lg object-cover"
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-5">
              <div>
                <p className="eyebrow">{t(`category.${l.category}`)}</p>
                <h1 className="mt-1 font-display text-3xl font-semibold">{l.cropName}</h1>
                <p className="mt-3">
                  <Money paise={l.pricePerUnitPaise} className="text-3xl font-semibold text-forest-900" />{' '}
                  <span className="text-ink-muted">{t('market.perUnit', { unit: t(`unit.${l.unit}`) })}</span>
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {l.purchasable
                    ? t('market.available', { qty: l.quantityAvailable, unit: t(`unit.${l.unit}`) })
                    : t('market.outOfStock')}
                </p>
              </div>

              {l.description && <p className="text-ink-soft">{l.description}</p>}

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 text-ink-faint" aria-hidden />
                  <div>
                    <dt className="text-ink-muted">{t('market.location')}</dt>
                    <dd className="font-medium">
                      {l.location.village}, {l.location.district}, {l.location.state}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 text-ink-faint" aria-hidden />
                  <div>
                    <dt className="text-ink-muted">{t('listing.harvestDate')}</dt>
                    <dd className="font-medium">{formatDate(l.harvestDate, lang)}</dd>
                    {(l.availableFrom || l.availableUntil) && (
                      <dd className="text-ink-muted">
                        {t('market.availableWindow', {
                          from: formatDate(l.availableFrom, lang),
                          to: formatDate(l.availableUntil, lang),
                        })}
                      </dd>
                    )}
                  </div>
                </div>
              </dl>

              <div>
                <p className="label">{t('market.growingPractice')}</p>
                <ClaimBadge listing={l} detailed />
              </div>

              <div className="card flex items-center gap-3 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-forest-50 text-forest-700">
                  <Sprout className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-ink-muted">{t('market.farmer')}</p>
                  <p className="truncate font-semibold">{l.farmer.farmName || l.farmer.name}</p>
                  {l.farmer.sellingSince && (
                    <p className="text-xs text-ink-muted">
                      {t('market.memberSince', { date: formatDate(l.farmer.sellingSince, lang) })}
                    </p>
                  )}
                </div>
              </div>

              {l.purchasable ? (
                user && user.role !== 'CUSTOMER' ? (
                  <Notice>{t('market.signInToBuy')}</Notice>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div>
                      <p className="label">{t('market.quantity')}</p>
                      <QuantityStepper
                        value={qty}
                        max={l.quantityAvailable}
                        onChange={setQty}
                        label={t('market.quantity')}
                      />
                    </div>
                    <Button
                      className="flex-1"
                      loading={busy}
                      onClick={() => add(l)}
                      icon={<ShoppingBasket className="h-4 w-4" />}
                    >
                      {user ? t('market.addToCart') : t('market.signInToBuy')}
                    </Button>
                    {user && (
                      <Link to="/cart" className="btn btn-secondary">
                        {t('market.viewCart')}
                      </Link>
                    )}
                  </div>
                )
              ) : (
                <Notice tone="amber">{t('market.notPurchasable')}</Notice>
              )}
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}
