import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal } from 'lucide-react';
import { CATEGORIES } from '@rythubazaar/shared';
import { api, qs } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useI18n } from '../context/I18nContext';
import { ListingCard } from '../components/listing';
import { Async, Button, EmptyState, Input, PageHeader, Pagination, Select, Skeleton } from '../components/ui';
import type { PublicListing } from '../lib/types';

export function MarketPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [q, setQ] = useState(params.get('q') ?? '');
  const get = (k: string) => params.get(k) ?? '';
  const query = {
    q: get('q'),
    category: get('category'),
    district: get('district'),
    maxPricePaise: get('max') ? Number(get('max')) * 100 : undefined,
    availableOnly: get('all') === '1' ? 'false' : undefined,
    sort: get('sort') || 'newest',
    page: Number(get('page') || 1),
    pageSize: 12,
  };
  const state = useApi((s) => api.page<PublicListing>(`/api/listings${qs(query)}`, s), [params.toString()]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <div className="container-page">
      <PageHeader title={t('market.title')} subtitle={t('cart.feeNote')} />

      <form
        className="mb-4 flex gap-2"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() });
        }}
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('market.searchPlaceholder')}
            aria-label={t('common.search')}
            className="pl-9"
          />
        </div>
        <Button type="submit">{t('common.search')}</Button>
        <Button
          variant="secondary"
          className="lg:hidden"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-label={t('common.filters')}
          icon={<SlidersHorizontal className="h-4 w-4" />}
        />
      </form>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
        <aside
          className={`${showFilters ? 'block' : 'hidden'} card mb-4 flex flex-col gap-4 p-4 lg:sticky lg:top-24 lg:mb-0 lg:block lg:self-start`}
        >
          <div>
            <label className="label" htmlFor="f-cat">
              {t('market.category')}
            </label>
            <Select id="f-cat" value={get('category')} onChange={(e) => update({ category: e.target.value })}>
              <option value="">{t('common.all')}</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`category.${c}`)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="label" htmlFor="f-dist">
              {t('market.district')}
            </label>
            <Input
              id="f-dist"
              defaultValue={get('district')}
              onBlur={(e) => update({ district: e.target.value.trim() })}
            />
          </div>
          <div>
            <label className="label" htmlFor="f-max">
              {t('market.maxPrice')}
            </label>
            <Input
              id="f-max"
              type="number"
              inputMode="numeric"
              min={1}
              defaultValue={get('max')}
              onBlur={(e) => update({ max: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="f-sort">
              {t('market.sort')}
            </label>
            <Select
              id="f-sort"
              value={get('sort') || 'newest'}
              onChange={(e) => update({ sort: e.target.value })}
            >
              <option value="newest">{t('market.sortNewest')}</option>
              <option value="price_asc">{t('market.sortPriceLow')}</option>
              <option value="price_desc">{t('market.sortPriceHigh')}</option>
            </Select>
          </div>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-line-strong accent-forest-700"
              checked={get('all') !== '1'}
              onChange={(e) => update({ all: e.target.checked ? '' : '1' })}
            />
            {t('market.availableOnly')}
          </label>
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            {t('common.clear')}
          </Button>
        </aside>

        <section aria-live="polite">
          <Async
            state={state}
            skeleton={
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <Skeleton key={k} className="h-64" />
                ))}
              </div>
            }
            isEmpty={(d) => d.data.length === 0}
            empty={
              <EmptyState
                title={t('market.noResults')}
                action={
                  <Button variant="secondary" onClick={() => setParams({})}>
                    {t('common.clear')}
                  </Button>
                }
              />
            }
          >
            {(d) => (
              <>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {d.data.map((l) => (
                    <ListingCard key={l.id} listing={l} />
                  ))}
                </div>
                <Pagination meta={d.meta} onPage={(p) => update({ page: String(p) })} />
              </>
            )}
          </Async>
        </section>
      </div>
    </div>
  );
}
