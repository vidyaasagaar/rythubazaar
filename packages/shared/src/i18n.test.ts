import { describe, expect, it } from 'vitest';
import {
  IVR_CROPS,
  IVR_PROMPTS,
  LANGUAGES,
  LANGUAGE_CODES,
  SPEECH_INTENTS,
  UI_DICTIONARIES,
  ivrText,
  translate,
} from './i18n';
import { ERROR_CODES, ORDER_STATUSES, UNITS } from './domain';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('language registry', () => {
  it('covers exactly the six launch languages', () => {
    expect([...LANGUAGE_CODES].sort()).toEqual(['en-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'ta-IN', 'te-IN']);
  });

  it('assigns unique IVR keys 1-6', () => {
    const keys = LANGUAGE_CODES.map((c) => LANGUAGES[c].ivrKey).sort();
    expect(keys).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('has sample utterances for every intent in every language', () => {
    for (const code of LANGUAGE_CODES) {
      for (const intent of SPEECH_INTENTS) {
        expect(LANGUAGES[code].sampleUtterances[intent].length, `${code} ${intent}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('UI dictionaries', () => {
  const enKeys = Object.keys(UI_DICTIONARIES['en-IN']).sort();

  for (const code of LANGUAGE_CODES) {
    it(`${code} has every key, non-empty, with matching placeholders`, () => {
      const dict = UI_DICTIONARIES[code];
      expect(Object.keys(dict).sort()).toEqual(enKeys);
      for (const key of enKeys) {
        const value = dict[key as keyof typeof dict];
        expect(value.trim().length, `${code}:${key}`).toBeGreaterThan(0);
        expect(placeholders(value), `${code}:${key}`).toEqual(
          placeholders(UI_DICTIONARIES['en-IN'][key as keyof typeof dict]),
        );
      }
    });
  }

  it('translates critical checkout, error and status strings in native script', () => {
    const critical = [
      'checkout.placeOrder',
      'checkout.demoPayment',
      'orders.cancelConfirm',
      'error.INSUFFICIENT_STOCK',
      'error.DATABASE_UNAVAILABLE',
    ] as const;
    for (const code of LANGUAGE_CODES.filter((c) => c !== 'en-IN')) {
      for (const key of critical) {
        expect(translate(code, key), `${code}:${key}`).not.toEqual(translate('en-IN', key));
      }
    }
  });

  it('has a translation for every error code, order status and unit', () => {
    for (const code of LANGUAGE_CODES) {
      for (const err of ERROR_CODES) expect(translate(code, `error.${err}`)).toBeTruthy();
      for (const s of ORDER_STATUSES) expect(translate(code, `orderStatus.${s}`)).toBeTruthy();
      for (const u of UNITS) expect(translate(code, `unit.${u}`)).toBeTruthy();
    }
  });

  it('interpolates variables', () => {
    expect(translate('en-IN', 'orders.number', { number: 'RB123456' })).toBe('Order RB123456');
    expect(translate('te-IN', 'home.callBody', { code: '12908' })).toContain('12908');
  });
});

describe('IVR prompts', () => {
  const enKeys = Object.keys(IVR_PROMPTS['en-IN']).sort();
  for (const code of LANGUAGE_CODES) {
    it(`${code} has every IVR prompt with matching placeholders`, () => {
      const dict = IVR_PROMPTS[code];
      expect(Object.keys(dict).sort()).toEqual(enKeys);
      for (const key of enKeys) {
        const value = dict[key as keyof typeof dict];
        expect(value.trim().length).toBeGreaterThan(0);
        expect(placeholders(value), `${code}:${key}`).toEqual(
          placeholders(IVR_PROMPTS['en-IN'][key as keyof typeof dict]),
        );
      }
    });
  }

  it('renders a language menu line in each language', () => {
    for (const code of LANGUAGE_CODES) {
      expect(ivrText(code, 'languageOption', { key: LANGUAGES[code].ivrKey })).toContain(
        LANGUAGES[code].ivrKey,
      );
    }
  });

  it('names every IVR crop in every language with unique keypad digits', () => {
    expect(new Set(IVR_CROPS.map((c) => c.ivrKey)).size).toBe(IVR_CROPS.length);
    for (const crop of IVR_CROPS) {
      for (const code of LANGUAGE_CODES) expect(crop.names[code].length).toBeGreaterThan(0);
    }
  });
});
