import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  ClipboardList,
  Headphones,
  Home,
  IndianRupee,
  LayoutGrid,
  ListChecks,
  LogOut,
  Menu,
  Phone,
  ScrollText,
  ShieldCheck,
  ShoppingBasket,
  Sprout,
  Store,
  Truck,
  Undo2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  LANGUAGE_LIST,
  isStaff,
  type LanguageCode,
  type Permission,
  type Role,
  type UiKey,
} from '@rythubazaar/shared';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { cx } from '../lib/format';
import { Spinner } from './ui';

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest-700 text-ivory-50 shadow-soft">
        <Sprout className="h-5 w-5" aria-hidden />
      </span>
      {!compact && (
        <span className="hidden font-display text-lg font-semibold tracking-tight text-forest-900 min-[360px]:inline">
          RythuBazaar
        </span>
      )}
    </span>
  );
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const { user, updateMe } = useAuth();
  return (
    // Display is controlled by the caller's className so responsive classes never conflict.
    <label className={cx('relative items-center', className ?? 'inline-flex')}>
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={lang}
        onChange={(e) => {
          const next = e.target.value as LanguageCode;
          setLang(next);
          if (user) void updateMe({ preferredLanguage: next }).catch(() => undefined);
        }}
        className="min-h-[40px] max-w-[9rem] rounded-xl border border-line bg-white py-1.5 pl-3 pr-8 text-sm font-medium text-ink-soft hover:border-line-strong sm:max-w-none"
      >
        {LANGUAGE_LIST.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}

interface NavItem {
  to: string;
  label: UiKey | string;
  icon: ReactNode;
  end?: boolean;
  permission?: Permission;
}

const i = (C: typeof Home) => <C className="h-[18px] w-[18px]" aria-hidden />;

function primaryNav(role: Role | undefined): NavItem[] {
  if (role === 'FARMER') {
    return [
      { to: '/farmer', label: 'nav.overview', icon: i(LayoutGrid), end: true },
      { to: '/farmer/listings', label: 'nav.listings', icon: i(Sprout) },
      { to: '/farmer/orders', label: 'nav.orders', icon: i(ClipboardList) },
      { to: '/farmer/payouts', label: 'nav.payouts', icon: i(IndianRupee) },
      { to: '/phone', label: 'nav.phone', icon: i(Phone) },
    ];
  }
  if (role === 'CUSTOMER') {
    return [
      { to: '/market', label: 'nav.market', icon: i(Store) },
      { to: '/cart', label: 'nav.cart', icon: i(ShoppingBasket) },
      { to: '/orders', label: 'nav.orders', icon: i(ClipboardList) },
      { to: '/support', label: 'nav.support', icon: i(Headphones) },
      { to: '/phone', label: 'nav.phone', icon: i(Phone) },
    ];
  }
  if (isStaff(role)) {
    return [
      { to: '/ops', label: 'nav.staffConsole', icon: i(ShieldCheck) },
      { to: '/market', label: 'nav.market', icon: i(Store) },
      { to: '/phone', label: 'nav.phone', icon: i(Phone) },
    ];
  }
  return [
    { to: '/', label: 'nav.home', icon: i(Home), end: true },
    { to: '/market', label: 'nav.market', icon: i(Store) },
    { to: '/phone', label: 'nav.phone', icon: i(Phone) },
  ];
}

/** Staff console sections; each is shown only when the role has the permission (server enforces too). */
export const STAFF_NAV: NavItem[] = [
  { to: '/ops', label: 'Overview', icon: i(BarChart3), end: true, permission: 'orders:read:any' },
  { to: '/ops/orders', label: 'Orders & delivery', icon: i(Truck), permission: 'orders:read:any' },
  { to: '/ops/payouts', label: 'Payouts', icon: i(IndianRupee), permission: 'payouts:read:any' },
  { to: '/ops/returns', label: 'Returns', icon: i(Undo2), permission: 'returns:read:any' },
  { to: '/ops/listings', label: 'Listings', icon: i(Sprout), permission: 'listings:read:any' },
  { to: '/ops/users', label: 'People', icon: i(Users), permission: 'users:read' },
  { to: '/ops/tickets', label: 'Support tickets', icon: i(Headphones), permission: 'support:read:any' },
  { to: '/ops/calls', label: 'Call audit', icon: i(Phone), permission: 'calls:read' },
  { to: '/ops/audit', label: 'Audit log', icon: i(ScrollText), permission: 'audit:read' },
];

function useLabel() {
  const { t } = useI18n();
  return (label: string) => (label.includes('.') ? t(label as UiKey) : label);
}

export function AppShell() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const label = useLabel();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const nav = primaryNav(user?.role);
  const showBottomBar = user?.role === 'CUSTOMER' || user?.role === 'FARMER';

  useEffect(() => setDrawer(false), [location.pathname]);

  const signOut = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2"
      >
        {t('nav.skipToContent')}
      </a>
      <header className="sticky top-0 z-30 border-b border-line/80 bg-ivory-100/90 backdrop-blur supports-[backdrop-filter]:bg-ivory-100/75">
        <div className="container-page flex h-16 items-center gap-3">
          <Link
            to={user?.role === 'FARMER' ? '/farmer' : isStaff(user?.role) ? '/ops' : '/'}
            className="shrink-0 rounded-xl"
            aria-label="RythuBazaar home"
          >
            <Logo />
          </Link>
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cx(
                    'whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive ? 'bg-forest-50 text-forest-800' : 'text-ink-soft hover:bg-ivory-200',
                  )
                }
              >
                {label(n.label)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher className="inline-flex" />
            {user ? (
              <div className="hidden items-center gap-1 lg:flex">
                <NavLink to="/account" className="btn btn-ghost btn-sm" title={user.email}>
                  <User className="h-4 w-4" aria-hidden />
                  <span className="max-w-[10rem] truncate">{user.name.split(' ')[0]}</span>
                </NavLink>
                <button className="btn btn-ghost btn-sm" onClick={signOut}>
                  <LogOut className="h-4 w-4" aria-hidden />
                  {t('nav.signOut')}
                </button>
              </div>
            ) : (
              <div className="hidden items-center gap-2 lg:flex">
                <Link to="/login" className="btn btn-ghost btn-sm">
                  {t('nav.signIn')}
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  {t('nav.register')}
                </Link>
              </div>
            )}
            <button
              className="btn btn-ghost btn-sm lg:hidden"
              onClick={() => setDrawer(true)}
              aria-label={t('nav.menu')}
              aria-expanded={drawer}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {drawer && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.menu')}
        >
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] animate-fadeIn flex-col gap-4 bg-ivory-50 p-4 shadow-lift">
            <div className="flex items-center justify-between">
              <Logo />
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setDrawer(false)}
                aria-label={t('common.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <LanguageSwitcher className="flex w-full [&>select]:w-full [&>select]:max-w-none" />
            <nav className="flex flex-col gap-1" aria-label="Mobile">
              {nav.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] font-medium',
                      isActive ? 'bg-forest-50 text-forest-800' : 'text-ink-soft',
                    )
                  }
                >
                  {n.icon}
                  {label(n.label)}
                </NavLink>
              ))}
              {user?.role === 'FARMER' && (
                <NavLink
                  to="/farmer/profile"
                  className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-ink-soft"
                >
                  {i(User)}
                  {t('nav.profile')}
                </NavLink>
              )}
            </nav>
            <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
              {user ? (
                <>
                  <NavLink to="/account" className="btn btn-secondary">
                    <User className="h-4 w-4" />
                    {t('nav.account')}
                  </NavLink>
                  <button className="btn btn-ghost" onClick={signOut}>
                    <LogOut className="h-4 w-4" />
                    {t('nav.signOut')}
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" className="btn btn-secondary">
                    {t('nav.signIn')}
                  </Link>
                  <Link to="/register" className="btn btn-primary">
                    {t('nav.register')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <main id="main" className={cx('flex-1 py-6 sm:py-8', showBottomBar && 'pb-24 lg:pb-8')}>
        <Outlet />
      </main>

      <footer
        className={cx(
          'border-t border-line bg-ivory-50 py-6 text-sm text-ink-muted',
          showBottomBar && 'mb-16 lg:mb-0',
        )}
      >
        <div className="container-page flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <span>RythuBazaar · {t('app.tagline')}</span>
          <span>
            {t('home.zeroCommission')} · {t('common.demoMode')}
          </span>
        </div>
      </footer>

      {showBottomBar && (
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
          aria-label="Quick"
        >
          <ul className="grid grid-cols-5">
            {nav.map((n) => (
              <li key={n.to}>
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium leading-tight',
                      isActive ? 'text-forest-700' : 'text-ink-muted',
                    )
                  }
                >
                  {n.icon}
                  <span className="w-full truncate text-center">{label(n.label)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

/** UX route guard. The API independently enforces every permission. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user)
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (!roles.includes(user.role)) {
    return (
      <div className="container-page">
        <div className="card mx-auto max-w-md p-8 text-center">
          <ShieldCheck className="mx-auto h-8 w-8 text-ink-faint" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">{t('auth.forbidden')}</h1>
          <Link to="/" className="btn btn-secondary mt-5">
            {t('nav.home')}
          </Link>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

export function StaffLayout() {
  const { can, user } = useAuth();
  const items = STAFF_NAV.filter((n) => !n.permission || can(n.permission));
  return (
    <div className="container-page">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <ListChecks className="h-5 w-5 text-forest-700" aria-hidden />
        <span className="font-display text-lg font-semibold">Operations console</span>
        <span className="chip bg-forest-100 text-forest-800">{user?.role}</span>
      </div>
      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav
          aria-label="Console"
          className="-mx-4 mb-6 overflow-x-auto px-4 lg:mx-0 lg:mb-0 lg:overflow-visible lg:px-0"
        >
          <ul className="flex gap-1 lg:sticky lg:top-24 lg:flex-col">
            {items.map((n) => (
              <li key={n.to} className="shrink-0">
                <NavLink
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    cx(
                      'flex min-h-[40px] items-center gap-2.5 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-forest-700 text-ivory-50 shadow-soft'
                        : 'bg-white text-ink-soft ring-1 ring-line hover:bg-ivory-200 lg:bg-transparent lg:ring-0',
                    )
                  }
                >
                  {n.icon}
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
