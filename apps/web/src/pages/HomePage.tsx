import { Link } from 'react-router-dom';
import { ArrowRight, Languages, Phone, ReceiptText, Sprout } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useI18n } from '../context/I18nContext';
import { useConfig } from '../context/ConfigContext';
import { ListingCard } from '../components/listing';
import { Skeleton } from '../components/ui';
import type { PublicListing } from '../lib/types';

export function HomePage() {
  const { t } = useI18n();
  const { config } = useConfig();
  const featured = useApi((s) => api.page<PublicListing>('/api/listings?pageSize=4', s), []);
  const code = config?.demoDialCodes[0] ?? '…';

  return (
    <div className="container-page flex flex-col gap-12">
      <section className="grid items-center gap-8 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <p className="eyebrow mb-3 text-forest-700">{t('app.tagline')}</p>
          <h1 className="font-display text-[2rem] font-semibold leading-[1.15] tracking-tight sm:text-5xl">
            {t('home.heroTitle')}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-muted">{t('home.heroBody')}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link to="/market" className="btn btn-primary">
              {t('home.ctaBrowse')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link to="/register?role=FARMER" className="btn btn-secondary">
              <Sprout className="h-4 w-4" aria-hidden />
              {t('home.ctaSell')}
            </Link>
          </div>
          <ul className="mt-8 grid gap-3 text-sm text-ink-soft sm:grid-cols-3">
            <li className="flex items-center gap-2">
              <Sprout className="h-4 w-4 text-forest-600" aria-hidden /> {t('home.zeroCommission')}
            </li>
            <li className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-forest-600" aria-hidden /> {t('home.transparentFees')}
            </li>
            <li className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-forest-600" aria-hidden /> {t('home.sixLanguages')}
            </li>
          </ul>
        </div>

        <Link
          to="/phone"
          className="group relative overflow-hidden rounded-3xl border border-forest-800 bg-forest-800 p-6 text-ivory-50 shadow-lift sm:p-8"
        >
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-forest-600/40 blur-2xl"
            aria-hidden
          />
          <div className="relative flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ivory-50/10 ring-1 ring-ivory-50/20">
              <Phone className="h-6 w-6" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold text-ivory-50">{t('home.callTitle')}</h2>
              <p className="mt-2 text-forest-100">{t('home.callBody', { code })}</p>
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center justify-between gap-4">
            <span className="font-mono text-3xl tracking-[0.2em] text-ivory-50">{code}</span>
            <span className="btn bg-ivory-50 text-forest-900 group-hover:bg-white">
              {t('home.ctaCall')}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </Link>
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">{t('home.featured')}</h2>
          <Link to="/market" className="text-sm font-semibold text-forest-700 hover:underline">
            {t('nav.market')} →
          </Link>
        </div>
        {featured.error ? null : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.data
              ? featured.data.data.map((l) => <ListingCard key={l.id} listing={l} />)
              : [0, 1, 2, 3].map((k) => <Skeleton key={k} className="h-64" />)}
          </div>
        )}
      </section>
    </div>
  );
}
