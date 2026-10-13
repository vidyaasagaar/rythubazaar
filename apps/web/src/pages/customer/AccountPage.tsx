import { useState, type FormEvent } from 'react';
import { LANGUAGE_LIST, updateMeSchema, type LanguageCode } from '@rythubazaar/shared';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import { useToast } from '../../context/ToastContext';
import { zodFieldErrors } from '../../lib/forms';
import { Button, Field, Input, PageHeader, Select } from '../../components/ui';

export default function AccountPage() {
  const { user, updateMe } = useAuth();
  const { t, setLang, errorText } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    preferredLanguage: user?.preferredLanguage ?? 'en-IN',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = updateMeSchema.safeParse({ ...form, phone: form.phone || undefined });
    if (!parsed.success) return setErrors(zodFieldErrors(t, parsed.error));
    setErrors({});
    setBusy(true);
    try {
      await updateMe(parsed.data);
      setLang(form.preferredLanguage as LanguageCode);
      toast('success', t('common.saved'));
    } catch (err) {
      toast('error', errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-page max-w-xl">
      <PageHeader title={t('account.title')} subtitle={`${user?.email} · ${user?.role}`} />
      <form className="card flex flex-col gap-4 p-5" onSubmit={submit} noValidate>
        <Field label={t('auth.name')} error={errors.name}>
          {(p) => (
            <Input {...p} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          )}
        </Field>
        <Field label={t('auth.phone')} optional error={errors.phone}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="numeric"
              maxLength={10}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          )}
        </Field>
        <Field label={t('auth.preferredLanguage')}>
          {(p) => (
            <Select
              {...p}
              value={form.preferredLanguage}
              onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value as LanguageCode })}
            >
              {LANGUAGE_LIST.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} — {l.englishName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" loading={busy}>
          {t('common.save')}
        </Button>
      </form>
    </div>
  );
}
