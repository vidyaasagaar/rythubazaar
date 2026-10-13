import { useEffect, useState, type FormEvent } from 'react';
import { farmerProfileSchema, type FarmerProfileInput } from '@rythubazaar/shared';
import { api } from '../../lib/api';
import { apiFieldErrors, zodFieldErrors } from '../../lib/forms';
import { useI18n } from '../../context/I18nContext';
import { useToast } from '../../context/ToastContext';
import { Button, ErrorState, Field, Input, PageHeader, Spinner, Textarea } from '../../components/ui';

export default function FarmerProfilePage() {
  const { t, errorText } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState<FarmerProfileInput | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<FarmerProfileInput | null>('/api/farmer/profile')
      .then((p) => setForm(p ?? { farmName: '', village: '', district: '', state: '', pincode: '', bio: '' }))
      .catch(setLoadError);
  }, []);

  if (loadError)
    return (
      <div className="container-page">
        <ErrorState error={loadError} />
      </div>
    );
  if (!form) return <Spinner />;

  const set = (k: keyof FarmerProfileInput) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f!, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = farmerProfileSchema.safeParse(form);
    if (!parsed.success) return setErrors(zodFieldErrors(t, parsed.error));
    setErrors({});
    setBusy(true);
    try {
      await api.put('/api/farmer/profile', parsed.data);
      toast('success', t('common.saved'));
    } catch (err) {
      setErrors(apiFieldErrors(t, err));
      toast('error', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page max-w-2xl">
      <PageHeader title={t('farmer.profileTitle')} subtitle={t('farmer.profileIncomplete')} />
      <form onSubmit={submit} noValidate className="card grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t('farmer.farmName')} optional className="sm:col-span-2">
          {(p) => <Input {...p} maxLength={100} value={form.farmName} onChange={set('farmName')} />}
        </Field>
        <Field label={t('farmer.village')} error={errors.village}>
          {(p) => <Input {...p} value={form.village} onChange={set('village')} />}
        </Field>
        <Field label={t('checkout.district')} error={errors.district}>
          {(p) => <Input {...p} value={form.district} onChange={set('district')} />}
        </Field>
        <Field label={t('checkout.state')} error={errors.state}>
          {(p) => <Input {...p} value={form.state} onChange={set('state')} />}
        </Field>
        <Field label={t('checkout.pincode')} error={errors.pincode}>
          {(p) => (
            <Input {...p} inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} />
          )}
        </Field>
        <Field label={t('farmer.bio')} optional className="sm:col-span-2">
          {(p) => <Textarea {...p} maxLength={500} value={form.bio} onChange={set('bio')} />}
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" loading={busy} className="w-full sm:w-auto">
            {t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
