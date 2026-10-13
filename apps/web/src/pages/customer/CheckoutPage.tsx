import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { addressSchema, type AddressInput } from '@rythubazaar/shared';
import { ApiError, api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { newIdempotencyKey } from '../../lib/format';
import { apiFieldErrors, zodFieldErrors } from '../../lib/forms';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import {
  Async,
  Button,
  EmptyState,
  Field,
  Input,
  Money,
  Notice,
  PageHeader,
  Pill,
  STATUS_TONE,
} from '../../components/ui';
import { ShipmentSummary } from './CartPage';
import type { CartQuote } from '../../lib/types';

interface PlacedOrder {
  id: string;
  orderNumber: string;
  farmName: string;
  status: string;
  pricing: { totalPaise: number };
}

export default function CheckoutPage() {
  const { t, errorText } = useI18n();
  const { user } = useAuth();
  const cart = useApi((s) => api.get<CartQuote>('/api/cart', s), []);
  const [address, setAddress] = useState<AddressInput>({
    recipientName: user?.name ?? '',
    phone: user?.phone ?? '',
    line1: '',
    locality: '',
    district: '',
    state: '',
    pincode: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder[] | null>(null);
  // One key per checkout attempt: network retries reuse it so the server never creates duplicates.
  const keyRef = useRef(newIdempotencyKey());

  const set = (k: keyof AddressInput) => (e: { target: { value: string } }) =>
    setAddress((a) => ({ ...a, [k]: e.target.value }));

  const submit = async (e: FormEvent, quote: CartQuote) => {
    e.preventDefault();
    setError(null);
    const parsed = addressSchema.safeParse(address);
    if (!parsed.success) {
      setErrors(zodFieldErrors(t, parsed.error));
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api.post<{ orders: PlacedOrder[] }>(
        '/api/checkout',
        {
          address: parsed.data,
          expectedTotalPaise: quote.grandTotalPaise,
          paymentMode: 'DEMO_PAY_ON_DELIVERY',
        },
        { 'Idempotency-Key': keyRef.current },
      );
      setPlaced(res.orders);
    } catch (err) {
      setError(err);
      setErrors(
        Object.fromEntries(
          Object.entries(apiFieldErrors(t, err)).map(([k, v]) => [k.replace(/^address\./, ''), v]),
        ),
      );
      if (
        err instanceof ApiError &&
        ['PRICE_CHANGED', 'INSUFFICIENT_STOCK', 'LISTING_UNAVAILABLE'].includes(err.code)
      ) {
        // The server rejected the attempt; refresh the quote and use a fresh key for the next try.
        keyRef.current = newIdempotencyKey();
        cart.reload();
      }
    } finally {
      setBusy(false);
    }
  };

  if (placed) {
    return (
      <div className="container-page">
        <div className="card mx-auto max-w-xl p-6 text-center sm:p-8">
          <CheckCircle2 className="mx-auto h-10 w-10 text-forest-600" aria-hidden />
          <h1 className="mt-3 font-display text-2xl font-semibold">{t('checkout.confirmTitle')}</h1>
          <p className="mt-2 text-ink-muted">{t('checkout.confirmBody')}</p>
          <Notice tone="amber" className="mt-4 text-left">
            {t('orders.demoNotCharged')}
          </Notice>
          <ul className="mt-5 flex flex-col gap-2 text-left">
            {placed.map((o) => (
              <li key={o.id}>
                <Link
                  to={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 hover:bg-ivory-50"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {t('orders.number', { number: o.orderNumber })}
                    </span>
                    <span className="block truncate text-sm text-ink-muted">
                      {t('orders.fromFarm', { farm: o.farmName })}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Money paise={o.pricing.totalPaise} className="font-semibold" />
                    <Pill tone={STATUS_TONE[o.status]}>{t(`orderStatus.${o.status as 'PLACED'}`)}</Pill>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page">
      <PageHeader title={t('checkout.title')} />
      <Async
        state={cart}
        isEmpty={(d) => d.lines.length === 0}
        empty={<EmptyState title={t('cart.empty')} />}
      >
        {(quote) => (
          <form
            onSubmit={(e) => submit(e, quote)}
            noValidate
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]"
          >
            <section className="card p-5">
              <h2 className="mb-4 font-semibold">{t('checkout.address')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('checkout.recipient')} error={errors.recipientName}>
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="name"
                      value={address.recipientName}
                      onChange={set('recipientName')}
                    />
                  )}
                </Field>
                <Field label={t('auth.phone')} error={errors.phone}>
                  {(p) => (
                    <Input
                      {...p}
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      autoComplete="tel-national"
                      value={address.phone}
                      onChange={set('phone')}
                    />
                  )}
                </Field>
                <Field label={t('checkout.addressLine')} error={errors.line1} className="sm:col-span-2">
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="street-address"
                      value={address.line1}
                      onChange={set('line1')}
                    />
                  )}
                </Field>
                <Field label={t('checkout.locality')} error={errors.locality}>
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="address-level2"
                      value={address.locality}
                      onChange={set('locality')}
                    />
                  )}
                </Field>
                <Field label={t('checkout.district')} error={errors.district}>
                  {(p) => <Input {...p} value={address.district} onChange={set('district')} />}
                </Field>
                <Field label={t('checkout.state')} error={errors.state}>
                  {(p) => (
                    <Input
                      {...p}
                      autoComplete="address-level1"
                      value={address.state}
                      onChange={set('state')}
                    />
                  )}
                </Field>
                <Field label={t('checkout.pincode')} error={errors.pincode}>
                  {(p) => (
                    <Input
                      {...p}
                      inputMode="numeric"
                      maxLength={6}
                      autoComplete="postal-code"
                      value={address.pincode}
                      onChange={set('pincode')}
                    />
                  )}
                </Field>
              </div>
              <h2 className="mb-2 mt-6 font-semibold">{t('checkout.payment')}</h2>
              <Notice tone="amber" icon={<ShieldAlert className="h-4 w-4" />}>
                {t('checkout.demoPayment')}
              </Notice>
            </section>

            <aside className="card h-fit p-5 lg:sticky lg:top-24">
              <h2 className="mb-3 font-semibold">{t('checkout.review')}</h2>
              <div className="flex flex-col gap-4">
                {quote.shipments.map((s) => (
                  <div key={s.farmerId}>
                    <p className="mb-1.5 text-sm font-medium">
                      {t('cart.shipmentFrom', { farm: s.farmName })}
                    </p>
                    <ShipmentSummary s={s} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-baseline justify-between border-t border-line pt-3">
                <span className="font-semibold">{t('cart.grandTotal')}</span>
                <Money paise={quote.grandTotalPaise} className="text-2xl font-semibold" />
              </div>
              {error ? (
                <Notice tone="red" className="mt-4">
                  {error instanceof ApiError && error.code === 'PRICE_CHANGED'
                    ? t('checkout.priceChanged')
                    : errorText(error)}
                </Notice>
              ) : null}
              <Button type="submit" className="mt-4 w-full" loading={busy} disabled={quote.hasIssues}>
                {busy ? t('checkout.placing') : t('checkout.placeOrder')}
              </Button>
            </aside>
          </form>
        )}
      </Async>
    </div>
  );
}
