import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LANGUAGE_LIST, isStaff, registerSchema, type LanguageCode, type Role } from '@rythubazaar/shared';
import { apiFieldErrors, zodFieldErrors } from '../lib/forms';
import { useAuth, type SessionUser } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { Button, Field, Input, Notice, Select } from '../components/ui';
import { Logo } from '../components/layout';

export function homeFor(user: Pick<SessionUser, 'role'>): string {
  if (user.role === 'FARMER') return '/farmer';
  if (isStaff(user.role)) return '/ops';
  return '/market';
}

/** Only allow same-site relative redirects after login (rejects //host, /\host and control chars). */
export function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  if ([...next].some((ch) => ch.charCodeAt(0) < 0x20)) return null;
  return next;
}

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container-page">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="mb-6 font-display text-2xl font-semibold">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { t, errorText } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      navigate(safeNext(params.get('next')) ?? homeFor(user), { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t('auth.signInTitle')}>
      {params.get('next') && <Notice className="mb-4">{t('auth.signInRequired')}</Notice>}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={t('auth.email')}>
          {(p) => (
            <Input
              {...p}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        <Field label={t('auth.password')}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        {error ? <Notice tone="red">{errorText(error)}</Notice> : null}
        <Button type="submit" loading={busy}>
          {t('auth.submitSignIn')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('auth.noAccount')}{' '}
        <Link to="/register" className="font-semibold text-forest-700 hover:underline">
          {t('nav.register')}
        </Link>
      </p>
    </AuthCard>
  );
}

export function RegisterPage() {
  const { t, lang, errorText } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: (params.get('role') === 'FARMER' ? 'FARMER' : 'CUSTOMER') as Extract<Role, 'CUSTOMER' | 'FARMER'>,
    preferredLanguage: lang as LanguageCode,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = registerSchema.safeParse({ ...form, phone: form.phone || undefined });
    if (!parsed.success) {
      setFieldErrors(zodFieldErrors(t, parsed.error));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const user = await register(parsed.data);
      navigate(user.role === 'FARMER' ? '/farmer/profile' : '/market', { replace: true });
    } catch (err) {
      setError(err);
      setFieldErrors(apiFieldErrors(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard title={t('auth.registerTitle')}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <fieldset>
          <legend className="label">{t('auth.role')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['CUSTOMER', 'FARMER'] as const).map((r) => (
              <label
                key={r}
                className={`flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2 text-sm font-medium ${form.role === r ? 'border-forest-500 bg-forest-50 text-forest-900' : 'border-line-strong bg-white'}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={form.role === r}
                  onChange={set('role')}
                  className="h-4 w-4 accent-forest-700"
                />
                {r === 'CUSTOMER' ? t('auth.roleCustomer') : t('auth.roleFarmer')}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t('auth.name')} error={fieldErrors.name}>
          {(p) => <Input {...p} autoComplete="name" value={form.name} onChange={set('name')} />}
        </Field>
        <Field label={t('auth.email')} error={fieldErrors.email}>
          {(p) => (
            <Input {...p} type="email" autoComplete="email" value={form.email} onChange={set('email')} />
          )}
        </Field>
        <Field label={t('auth.phone')} optional error={fieldErrors.phone}>
          {(p) => (
            <Input
              {...p}
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              value={form.phone}
              onChange={set('phone')}
            />
          )}
        </Field>
        <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={fieldErrors.password}>
          {(p) => (
            <Input
              {...p}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
            />
          )}
        </Field>
        <Field label={t('auth.preferredLanguage')}>
          {(p) => (
            <Select {...p} value={form.preferredLanguage} onChange={set('preferredLanguage')}>
              {LANGUAGE_LIST.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeName} — {l.englishName}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error ? <Notice tone="red">{errorText(error)}</Notice> : null}
        <Button type="submit" loading={busy}>
          {t('auth.submitRegister')}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-muted">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-forest-700 hover:underline">
          {t('nav.signIn')}
        </Link>
      </p>
    </AuthCard>
  );
}
