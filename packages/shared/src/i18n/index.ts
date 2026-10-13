import { en, type UiDict, type UiKey } from './ui/en';
import { te } from './ui/te';
import { ta } from './ui/ta';
import { kn } from './ui/kn';
import { ml } from './ui/ml';
import { hi } from './ui/hi';
import { IVR_PROMPTS, type IvrKey } from './ivr';
import { FALLBACK_LANGUAGE, LANGUAGE_CODES, LANGUAGES, type LanguageCode } from './languages';

export * from './languages';
export * from './crops';
export { IVR_PROMPTS, type IvrKey, type IvrDict } from './ivr';
export type { UiKey, UiDict } from './ui/en';

export const UI_DICTIONARIES: Record<LanguageCode, UiDict> = {
  'te-IN': te,
  'ta-IN': ta,
  'kn-IN': kn,
  'ml-IN': ml,
  'hi-IN': hi,
  'en-IN': en,
};

export type Vars = Record<string, string | number>;

export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Translate a UI key; falls back to English if a language is missing a value. */
export function translate(lang: LanguageCode, key: UiKey, vars?: Vars): string {
  const dict = UI_DICTIONARIES[lang] ?? UI_DICTIONARIES[FALLBACK_LANGUAGE];
  return interpolate(dict[key] ?? en[key] ?? key, vars);
}

export function ivrText(lang: LanguageCode, key: IvrKey, vars?: Vars): string {
  const dict = IVR_PROMPTS[lang] ?? IVR_PROMPTS[FALLBACK_LANGUAGE];
  return interpolate(dict[key] ?? IVR_PROMPTS[FALLBACK_LANGUAGE][key], vars);
}

export function isUiKey(key: string): key is UiKey {
  return key in en;
}

/** Ordered list for language pickers. */
export const LANGUAGE_LIST = LANGUAGE_CODES.map((code) => LANGUAGES[code]);
