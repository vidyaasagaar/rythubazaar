import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  hasPermission,
  type LanguageCode,
  type Permission,
  type RegisterInput,
  type Role,
} from '@rythubazaar/shared';
import { api } from '../lib/api';
import { useI18n } from './I18nContext';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  preferredLanguage: LanguageCode;
}

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (input: RegisterInput) => Promise<SessionUser>;
  logout: () => Promise<void>;
  updateMe: (patch: Partial<Pick<SessionUser, 'name' | 'phone' | 'preferredLanguage'>>) => Promise<void>;
  /** UX-only permission check; the server enforces the real boundary. */
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useI18n();

  useEffect(() => {
    api
      .get<{ user: SessionUser | null }>('/api/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api.post<{ user: SessionUser }>('/api/auth/login', { email, password });
      await api.refreshCsrf();
      setUser(r.user);
      setLang(r.user.preferredLanguage);
      return r.user;
    },
    [setLang],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const r = await api.post<{ user: SessionUser }>('/api/auth/register', input);
      setUser(r.user);
      setLang(r.user.preferredLanguage);
      return r.user;
    },
    [setLang],
  );

  const logout = useCallback(async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  }, []);

  const updateMe = useCallback(
    async (patch: Partial<Pick<SessionUser, 'name' | 'phone' | 'preferredLanguage'>>) => {
      const r = await api.patch<{ user: SessionUser }>('/api/auth/me', patch);
      setUser(r.user);
    },
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({ user, loading, login, register, logout, updateMe, can: (p) => hasPermission(user?.role, p) }),
    [user, loading, login, register, logout, updateMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
