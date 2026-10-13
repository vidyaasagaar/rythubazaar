import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  FALLBACK_LANGUAGE,
  isLanguageCode,
  isUiKey,
  translate,
  type LanguageCode,
  type UiKey,
  type Vars,
} from '@rythubazaar/shared';
import { ApiError } from '../lib/api';

const STORAGE_KEY = 'rb.lang';

interface I18nValue {
  lang: LanguageCode;
  setLang: (lang: LanguageCode) => void;
  t: (key: UiKey, vars?: Vars) => string;
  errorText: (err: unknown) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLanguage(): LanguageCode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLanguageCode(saved)) return saved;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  const match = (['te', 'ta', 'kn', 'ml', 'hi'] as const).find((p) => nav.startsWith(p));
  return match ? (`${match}-IN` as LanguageCode) : FALLBACK_LANGUAGE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<LanguageCode>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: LanguageCode) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = (key: UiKey, vars?: Vars) => translate(lang, key, vars);
    const errorText = (err: unknown) => {
      if (err instanceof ApiError) {
        const key = `error.${err.code}`;
        if (isUiKey(key)) return t(key);
      }
      return t('common.error');
    };
    return { lang, setLang, t, errorText };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
