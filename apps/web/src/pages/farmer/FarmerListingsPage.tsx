import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, Pause, Pencil, Phone, Play, Plus, Send } from 'lucide-react';
import { LISTING_STATUSES, type ListingStatus } from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { cx } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';
import { useToast } from '../../context/ToastContext';
import {
  Async,
  Button,
  Dialog,
  EmptyState,
  Money,
  PageHeader,
  Pagination,
  Pill,
  STATUS_TONE,
} from '../../components/ui';
import { ClaimBadge, ProduceImage } from '../../components/listing';
import type { OwnerListing } from '../../lib/types';

export default function FarmerListingsPage() {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<ListingStatus | ''>('');
  const [page, setPage] = useState(1);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const state = useApi(
    (s) =>
      api.page<OwnerListing>(
        `/api/farmer/listings?page=${page}&pageSize=12${status ? `&status=${status}` : ''}`,
        s,
      ),
    [status, page],
  );

  const change = async (id: string, to: ListingStatus) => {
    setBusy(id);
    try {
      await api.post(`/api/farmer/listings/${id}/status`, { status: to });
      toast('success', t(`listingStatus.${to}`));
      setArchiveId(null);
      state.reload();
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container-page">
      <PageHeader
        title={t('farmer.listingsTitle')}
        subtitle={t('listing.draftNote')}
        actions={
          <Link to="/farmer/listings/new" className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            {t('farmer.newListing')}
          </Link>
        }
      />
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist">
        {(['', ...LISTING_STATUSES] as const).map((s) => (
          <button
            key={s || 'all'}
            role="tab"
            aria-selected={status === s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={cx('btn btn-sm shrink-0', status === s ? 'btn-primary' : 'btn-secondary')}
          >
            {s ? t(`listingStatus.${s}`) : t('common.all')}
          </button>
        ))}
      </div>
      <Async
        state={state}
        isEmpty={(d) => d.data.length === 0}
        empty={
          <EmptyState
            title={t('common.empty')}
            action={
              <Link to="/farmer/listings/new" className="btn btn-primary">
                {t('farmer.newListing')}
              </Link>
            }
          />
        }
      >
        {(d) => (
          <>
            <ul className="grid gap-4 md:grid-cols-2">
              {d.data.map((l) => (
                <li key={l.id} className="card flex flex-col gap-3 p-4">
                  <div className="flex gap-3">
                    <div className="w-20 shrink-0">
                      <ProduceImage listing={l} className="aspect-square" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold">{l.cropName}</h2>
                        <Pill tone={STATUS_TONE[l.status]}>{t(`listingStatus.${l.status}`)}</Pill>
                        {l.source === 'CALL' && (
                          <Pill tone="blue">
                            <Phone className="h-3 w-3" aria-hidden />
                            {t('farmer.fromCall')}
                          </Pill>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm">
                        <Money paise={l.pricePerUnitPaise} className="font-semibold" />{' '}
                        {t('market.perUnit', { unit: t(`unit.${l.unit}`) })}
                      </p>
                      <div className="mt-1">
                        <ClaimBadge listing={l} />
                      </div>
                    </div>
                  </div>
                  <dl className="grid grid-cols-3 gap-2 rounded-xl bg-ivory-50 p-2.5 text-center text-sm">
                    {[
                      [t('farmer.qtyAvailable'), l.quantityAvailable],
                      [t('farmer.qtyReserved'), l.quantityReserved],
                      [t('farmer.qtySold'), l.quantitySold],
                    ].map(([label, v]) => (
                      <div key={String(label)}>
                        <dt className="truncate text-xs text-ink-muted">{label}</dt>
                        <dd className="font-semibold tabular-nums">
                          {v}{' '}
                          <span className="text-xs font-normal text-ink-muted">{t(`unit.${l.unit}`)}</span>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {l.status !== 'ARCHIVED' && (
                    <div className="flex flex-wrap gap-2">
                      <Link to={`/farmer/listings/${l.id}/edit`} className="btn btn-secondary btn-sm">
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        {t('common.edit')}
                      </Link>
                      {(l.status === 'DRAFT' || l.status === 'PAUSED') && (
                        <Button
                          size="sm"
                          loading={busy === l.id}
                          onClick={() => change(l.id, 'ACTIVE')}
                          icon={
                            l.status === 'DRAFT' ? (
                              <Send className="h-3.5 w-3.5" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )
                          }
                        >
                          {l.status === 'DRAFT' ? t('farmer.publish') : t('farmer.resume')}
                        </Button>
                      )}
                      {l.status === 'ACTIVE' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          loading={busy === l.id}
                          onClick={() => change(l.id, 'PAUSED')}
                          icon={<Pause className="h-3.5 w-3.5" />}
                        >
                          {t('farmer.pause')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setArchiveId(l.id)}
                        icon={<Archive className="h-3.5 w-3.5" />}
                      >
                        {t('farmer.archive')}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination meta={d.meta} onPage={setPage} />
          </>
        )}
      </Async>
      <Dialog
        open={!!archiveId}
        onClose={() => setArchiveId(null)}
        title={t('farmer.archive')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setArchiveId(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={!!busy}
              onClick={() => archiveId && change(archiveId, 'ARCHIVED')}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p>{t('farmer.archiveConfirm')}</p>
      </Dialog>
    </div>
  );
}
