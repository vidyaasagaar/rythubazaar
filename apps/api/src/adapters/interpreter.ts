import {
  IVR_CROPS,
  LANGUAGES,
  LANGUAGE_CODES,
  type LanguageCode,
  type SpeechIntent,
} from '@rythubazaar/shared';

export interface InterpretContext {
  language: LanguageCode;
  /** Keys valid at this node, mapped to the meaning they carry there. */
  options: { key: string; intent?: SpeechIntent; matchTerms?: string[] }[];
  expectsDigits: boolean;
}

export interface Interpretation {
  method: 'KEYPAD' | 'RULES_DEMO';
  resolvedKey: string | null;
  digits: string | null;
  intent: SpeechIntent | 'DIGITS' | 'OPTION' | 'UNKNOWN';
  confidence: number;
  matchedTerm?: string;
}

/**
 * Speech/AI interpretation interface. Without AI credentials the app uses this deterministic,
 * rules-based interpreter (labelled RULES_DEMO). It can only select among the options the IVR
 * already offers at the current node; it cannot invoke tools or query data.
 */
export interface Interpreter {
  readonly name: 'RULES_DEMO';
  interpretSpeech(utterance: string, ctx: InterpretContext): Interpretation;
}

const normalize = (s: string) =>
  s
    .toLocaleLowerCase()
    .replace(/[.,!?।]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export class RulesInterpreter implements Interpreter {
  readonly name = 'RULES_DEMO' as const;

  interpretSpeech(utterance: string, ctx: InterpretContext): Interpretation {
    const text = normalize(utterance);
    if (ctx.expectsDigits) {
      const digits = text.replace(/[^0-9]/g, '');
      if (digits)
        return { method: 'RULES_DEMO', resolvedKey: null, digits, intent: 'DIGITS', confidence: 0.8 };
    }
    // Specific option terms first (crop names, language names, unit names).
    for (const opt of ctx.options) {
      for (const term of opt.matchTerms ?? []) {
        const t = normalize(term);
        if (t && text.includes(t)) {
          return {
            method: 'RULES_DEMO',
            resolvedKey: opt.key,
            digits: null,
            intent: 'OPTION',
            confidence: 0.75,
            matchedTerm: term,
          };
        }
      }
    }
    // Then intents from the language registry's sample utterances (plus English as a fallback).
    const langs: LanguageCode[] = ctx.language === 'en-IN' ? ['en-IN'] : [ctx.language, 'en-IN'];
    for (const opt of ctx.options) {
      if (!opt.intent) continue;
      for (const lang of langs) {
        for (const sample of LANGUAGES[lang].sampleUtterances[opt.intent]) {
          const s = normalize(sample);
          if (s && text.includes(s)) {
            return {
              method: 'RULES_DEMO',
              resolvedKey: opt.key,
              digits: null,
              intent: opt.intent,
              confidence: lang === ctx.language ? 0.7 : 0.6,
              matchedTerm: sample,
            };
          }
        }
      }
    }
    // A bare digit spoken in a menu ("two" may come through as "2").
    const single = text.match(/^\d$/);
    if (single && ctx.options.some((o) => o.key === single[0])) {
      return {
        method: 'RULES_DEMO',
        resolvedKey: single[0],
        digits: null,
        intent: 'OPTION',
        confidence: 0.7,
      };
    }
    return { method: 'RULES_DEMO', resolvedKey: null, digits: null, intent: 'UNKNOWN', confidence: 0 };
  }
}

/** Every spoken form of each crop across languages, used as match terms. */
export function cropTerms(key: string): string[] {
  const crop = IVR_CROPS.find((c) => c.key === key);
  if (!crop) return [];
  return [...LANGUAGE_CODES.map((l) => crop.names[l]), ...crop.synonyms];
}
