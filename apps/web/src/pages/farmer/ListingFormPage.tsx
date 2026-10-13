import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ImagePlus, X } from 'lucide-react';
import {
  CATEGORIES,
  GROWING_PRACTICES,
  UNITS,
  listingCreateSchema,
  listingUpdateSchema,
  type Category,
  type GrowingPractice,
  type Unit,
} from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { apiFieldErrors, zodFieldErrors } from '../../lib/forms';
import { useI18n } from '../../context/I18nContext';
import { useToast } from '../../context/ToastContext';
import {
  Button,
  ErrorState,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';
import type { OwnerListing } from '../../lib/types';

interface FormState {
  cropName: string;
  category: Category;
  description: string;
  photos: string[];
  unit: Unit;
  price: string;
  quantity: string;
  harvestDate: string;
  availableFrom: string;
  availableUntil: string;
  growingPractice: GrowingPractice;
  certBody: string;
  certNumber: string;
  certValidUntil: string;
}

const empty: FormState = {
  cropName: '',
  category: 'VEGETABLES',
  description: '',
  photos: [],
  unit: 'KG',
  price: '',
  quantity: '',
  harvestDate: '',
  availableFrom: '',
  availableUntil: '',
  growingPractice: 'CONVENTIONAL',
  certBody: '',
  certNumber: '',
  certValidUntil: '',
};

const day = (d: string | null | undefined) => (d ? d.slice(0, 10) : '');

export default function ListingFormPage() {
  const { id } = useParams();
  const editing = !!id;
  const { t, errorText } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(empty);
  const [original, setOriginal] = useState<OwnerListing | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get<OwnerListing>(`/api/farmer/listings/${id}`)
      .then((l) => {
        setOriginal(l);
        setForm({
          cropName: l.cropName,
          category: l.category,
          description: l.description,
          photos: l.photos,
          unit: l.unit,
          price: String(l.pricePerUnitPaise / 100),
          quantity: String(l.quantityTotal),
          harvestDate: day(l.harvestDate),
          availableFrom: day(l.availableFrom),
          availableUntil: day(l.availableUntil),
          growingPractice: l.growingPractice,
          certBody: l.certification.body ?? '',
          certNumber: l.certification.certificateNumber ?? '',
          certValidUntil: day(l.certification.validUntil),
        });
      })
      .catch(setLoadError);
  }, [id]);

  const set =
    <K extends keyof FormState>(k: K) =>
    (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [k]: e.target.value as FormState[K] }));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api.upload<{ path: string }>('/api/uploads/image', fd);
      setForm((f) => ({ ...f, photos: [...f.photos, r.path].slice(0, 4) }));
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const certified = form.growingPractice === 'ORGANIC_CERTIFIED_CLAIMED';
    const payload = {
      cropName: form.cropName,
      category: form.category,
      description: form.description,
      photos: form.photos,
      unit: form.unit,
      pricePerUnitPaise: Math.round(Number(form.price) * 100),
      quantityTotal: Number(form.quantity),
      harvestDate: form.harvestDate || undefined,
      availableFrom: form.availableFrom || undefined,
      availableUntil: form.availableUntil || undefined,
      growingPractice: form.growingPractice,
      certification:
        certified && (form.certBody || form.certNumber || form.certValidUntil)
          ? { body: form.certBody, certificateNumber: form.certNumber, validUntil: form.certValidUntil }
          : undefined,
    };
    const parsed = (editing ? listingUpdateSchema : listingCreateSchema).safeParse(payload);
    if (!parsed.success) {
      const errs = zodFieldErrors(t, parsed.error);
      if (errs.pricePerUnitPaise) errs.price = errs.pricePerUnitPaise;
      if (errs.quantityTotal) errs.quantity = errs.quantityTotal;
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      // Unchanged certificate details are not resent, so verification is not reset needlessly.
      const body = { ...parsed.data } as Record<string, unknown>;
      if (
        editing &&
        original &&
        original.growingPractice === form.growingPractice &&
        original.certification.certificateNumber === form.certNumber &&
        original.certification.body === form.certBody
      ) {
        delete body.certification;
        delete body.growingPractice;
      }
      if (editing) await api.patch(`/api/farmer/listings/${id}`, body);
      else await api.post('/api/farmer/listings', body);
      toast('success', t('listing.saved'));
      navigate('/farmer/listings');
    } catch (err) {
      setError(err);
      const errs = apiFieldErrors(t, err);
      if (errs.pricePerUnitPaise) errs.price = errs.pricePerUnitPaise;
      if (errs.quantityTotal) errs.quantity = errs.quantityTotal;
      setErrors(errs);
    } finally {
      setBusy(false);
    }
  };

  if (loadError)
    return (
      <div className="container-page">
        <ErrorState error={loadError} />
      </div>
    );
  if (editing && !original) return <Spinner />;

  return (
    <div className="container-page max-w-3xl">
      <Link
        to="/farmer/listings"
        className="mb-4 inline-flex text-sm font-medium text-forest-700 hover:underline"
      >
        ← {t('farmer.listingsTitle')}
      </Link>
      <PageHeader
        title={editing ? t('listing.editTitle') : t('listing.newTitle')}
        subtitle={!editing ? t('listing.draftNote') : undefined}
      />
      <form onSubmit={submit} noValidate className="card flex flex-col gap-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('listing.cropName')} error={errors.cropName}>
            {(p) => <Input {...p} maxLength={80} value={form.cropName} onChange={set('cropName')} />}
          </Field>
          <Field label={t('listing.category')}>
            {(p) => (
              <Select {...p} value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`category.${c}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('listing.unit')}>
            {(p) => (
              <Select {...p} value={form.unit} onChange={set('unit')}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {t(`unit.${u}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('listing.price')} error={errors.price}>
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="decimal"
                min={1}
                step="0.5"
                value={form.price}
                onChange={set('price')}
              />
            )}
          </Field>
          <Field
            label={t('listing.quantity')}
            error={errors.quantity}
            hint={
              original
                ? `${t('farmer.qtyReserved')}: ${original.quantityReserved} · ${t('farmer.qtySold')}: ${original.quantitySold}`
                : undefined
            }
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={1}
                step="1"
                value={form.quantity}
                onChange={set('quantity')}
              />
            )}
          </Field>
          <Field label={t('listing.harvestDate')} optional error={errors.harvestDate}>
            {(p) => <Input {...p} type="date" value={form.harvestDate} onChange={set('harvestDate')} />}
          </Field>
          <Field label={t('listing.availableFrom')} optional error={errors.availableFrom}>
            {(p) => <Input {...p} type="date" value={form.availableFrom} onChange={set('availableFrom')} />}
          </Field>
          <Field label={t('listing.availableUntil')} optional error={errors.availableUntil}>
            {(p) => <Input {...p} type="date" value={form.availableUntil} onChange={set('availableUntil')} />}
          </Field>
        </div>

        <Field label={t('listing.description')} optional error={errors.description}>
          {(p) => <Textarea {...p} maxLength={1000} value={form.description} onChange={set('description')} />}
        </Field>

        <div>
          <p className="label">{t('listing.photos')}</p>
          <div className="flex flex-wrap gap-3">
            {form.photos.map((src) => (
              <div key={src} className="relative">
                <img src={src} alt="" className="h-20 w-20 rounded-xl object-cover" />
                <button
                  type="button"
                  className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full bg-ink text-white shadow"
                  onClick={() => setForm((f) => ({ ...f, photos: f.photos.filter((x) => x !== src) }))}
                  aria-label={t('cart.remove')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            {form.photos.length < 4 && (
              <label className="grid h-20 w-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line-strong text-ink-muted hover:bg-ivory-50">
                {uploading ? <Spinner label="" /> : <ImagePlus className="h-6 w-6" aria-hidden />}
                <span className="sr-only">{t('listing.addPhoto')}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-ivory-50 p-4">
          <Field label={t('listing.practice')}>
            {(p) => (
              <Select {...p} value={form.growingPractice} onChange={set('growingPractice')}>
                {GROWING_PRACTICES.map((g) => (
                  <option key={g} value={g}>
                    {t(`practice.${g}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {form.growingPractice !== 'CONVENTIONAL' &&
            form.growingPractice !== 'ORGANIC_CERTIFIED_CLAIMED' && (
              <p className="mt-2 text-sm text-ink-muted">{t('claim.farmerReported')}</p>
            )}
          {form.growingPractice === 'ORGANIC_CERTIFIED_CLAIMED' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field
                label={t('listing.certBody')}
                error={errors['certification.body'] ?? errors.certification}
              >
                {(p) => <Input {...p} value={form.certBody} onChange={set('certBody')} />}
              </Field>
              <Field label={t('listing.certNumber')} error={errors['certification.certificateNumber']}>
                {(p) => <Input {...p} value={form.certNumber} onChange={set('certNumber')} />}
              </Field>
              <Field label={t('listing.certValidUntil')} error={errors['certification.validUntil']}>
                {(p) => (
                  <Input {...p} type="date" value={form.certValidUntil} onChange={set('certValidUntil')} />
                )}
              </Field>
              <Notice tone="blue" className="sm:col-span-3">
                {t('listing.certNote')}
              </Notice>
            </div>
          )}
        </div>
        <p className="text-sm text-ink-muted">{t('listing.locationHint')}</p>

        {error ? <Notice tone="red">{errorText(error)}</Notice> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to="/farmer/listings" className="btn btn-ghost">
            {t('common.cancel')}
          </Link>
          <Button type="submit" loading={busy}>
            {editing ? t('listing.saveChanges') : t('listing.saveDraft')}
          </Button>
        </div>
      </form>
    </div>
  );
}
