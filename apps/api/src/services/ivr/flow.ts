import {
  IVR_CROPS,
  LANGUAGES,
  LANGUAGE_CODES,
  findCrop,
  ivrText,
  translate,
  type IvrKey,
  type LanguageCode,
  type SpeechIntent,
  type Unit,
} from '@rythubazaar/shared';
import { cropTerms } from '../../adapters/interpreter';

export const IVR_NODES = [
  'LANGUAGE',
  'MAIN',
  'FARMER_MENU',
  'LISTING_CROP',
  'LISTING_UNIT',
  'LISTING_QTY',
  'LISTING_PRICE',
  'LISTING_REVIEW',
  'LISTING_RESULT',
  'ORDER_ENTRY',
  'ORDER_RESULT',
  'SUPPORT_MENU',
  'SUPPORT_CONFIRM',
  'SUPPORT_RESULT',
] as const;
export type IvrNode = (typeof IVR_NODES)[number];

export const IVR_UNITS: readonly Unit[] = ['KG', 'QUINTAL', 'DOZEN', 'PIECE', 'BUNCH'];

export interface IvrContext {
  draft?: { cropKey?: string; unit?: Unit; quantity?: number; priceRupees?: number };
  result?: { kind: 'DRAFT_SAVED' | 'CANCELLED' | 'FAILED' | 'PROFILE_REQUIRED'; ref?: string };
  orderResult?: { found: boolean; orderNumber: string; status?: string };
  supportResult?: { ref: string };
  completedTasks?: number;
  cancelledTasks?: number;
  errors?: number;
}

export interface Caller {
  signedIn: boolean;
  role: string | null;
}

export interface OptionDef {
  key: string;
  label: string;
  intent?: SpeechIntent;
  matchTerms?: string[];
}

export interface RenderedPrompt {
  node: IvrNode;
  language: LanguageCode | null;
  /** Everything spoken, in order (body + one line per option). */
  lines: string[];
  /** Spoken lines other than the per-option menu lines, for on-screen display. */
  body: string[];
  options: { key: string; label: string }[];
  inputMode: 'MENU' | 'DIGITS';
  digits?: { min: number; max: number; maxLength: number };
  text: string;
}

const opt = (lang: LanguageCode, key: string, labelKey: IvrKey, intent?: SpeechIntent): OptionDef => ({
  key,
  label: ivrText(lang, labelKey),
  intent,
});

const cropName = (lang: LanguageCode, key?: string) => (key ? (findCrop(key)?.names[lang] ?? key) : '');
const unitName = (lang: LanguageCode, unit?: Unit) => (unit ? translate(lang, `unit.${unit}`) : '');

export function digitsSpec(node: IvrNode): RenderedPrompt['digits'] | undefined {
  if (node === 'LISTING_QTY') return { min: 1, max: 100000, maxLength: 6 };
  if (node === 'LISTING_PRICE') return { min: 1, max: 100000, maxLength: 6 };
  if (node === 'ORDER_ENTRY') return { min: 100000, max: 999999, maxLength: 6 };
  return undefined;
}

/** Options (and their speech hooks) valid at a node, for the caller's identity. */
export function nodeOptions(
  node: IvrNode,
  lang: LanguageCode | null,
  ctx: IvrContext,
  caller: Caller,
): OptionDef[] {
  if (node === 'LANGUAGE' || !lang) {
    return LANGUAGE_CODES.map((code) => ({
      key: LANGUAGES[code].ivrKey,
      label: LANGUAGES[code].nativeName,
      matchTerms: [LANGUAGES[code].nativeName, LANGUAGES[code].englishName],
    }));
  }
  const repeat = opt(lang, '*', 'opt.repeat', 'REPEAT');
  const main = opt(lang, '0', 'opt.mainMenu', 'BACK');
  switch (node) {
    case 'MAIN':
      return [
        opt(lang, '1', 'opt.farmer', 'FARMER_SERVICES'),
        opt(lang, '2', 'opt.order', 'ORDER_STATUS'),
        opt(lang, '3', 'opt.support', 'SUPPORT'),
        opt(lang, '9', 'opt.changeLanguage'),
        repeat,
      ];
    case 'FARMER_MENU':
      return caller.role === 'FARMER' ? [opt(lang, '1', 'opt.createDraft', 'CONFIRM'), main, repeat] : [main];
    case 'LISTING_CROP':
      return [
        ...IVR_CROPS.map((c) => ({ key: c.ivrKey, label: c.names[lang], matchTerms: cropTerms(c.key) })),
        { ...opt(lang, '0', 'opt.back', 'BACK') },
        repeat,
      ];
    case 'LISTING_UNIT':
      return [
        ...IVR_UNITS.map((u, i) => ({
          key: String(i + 1),
          label: unitName(lang, u),
          matchTerms: LANGUAGE_CODES.map((l) => translate(l, `unit.${u}`)),
        })),
        opt(lang, '0', 'opt.back', 'BACK'),
        repeat,
      ];
    case 'LISTING_REVIEW':
      return [opt(lang, '1', 'opt.saveDraft', 'CONFIRM'), opt(lang, '2', 'opt.cancel', 'CANCEL'), repeat];
    case 'LISTING_RESULT':
      return ctx.result?.kind === 'FAILED' ? [opt(lang, '1', 'opt.tryAgain', 'CONFIRM'), main] : [main];
    case 'ORDER_ENTRY':
      return caller.signedIn ? [] : [main];
    case 'ORDER_RESULT':
      return [opt(lang, '2', 'opt.anotherOrder', 'ORDER_STATUS'), main];
    case 'SUPPORT_MENU':
      return caller.signedIn ? [opt(lang, '1', 'opt.requestCallback', 'CONFIRM'), main, repeat] : [main];
    case 'SUPPORT_CONFIRM':
      return [opt(lang, '1', 'opt.confirm', 'CONFIRM'), opt(lang, '2', 'opt.cancel', 'CANCEL')];
    case 'SUPPORT_RESULT':
      return [main];
    case 'LISTING_QTY':
    case 'LISTING_PRICE':
      // Number entry: every digit is input; # submits and * goes back (see digitsHint).
      return [];
    default:
      return [main];
  }
}

function bodyLines(node: IvrNode, lang: LanguageCode, ctx: IvrContext, caller: Caller): IvrKeyLine[] {
  const d = ctx.draft ?? {};
  const crop = cropName(lang, d.cropKey);
  const unit = unitName(lang, d.unit);
  switch (node) {
    case 'MAIN':
      return [['mainMenu']];
    case 'FARMER_MENU':
      return caller.role === 'FARMER' ? [['farmerMenu']] : [['farmerNotSignedIn']];
    case 'LISTING_CROP':
      return [['askCrop']];
    case 'LISTING_UNIT':
      return [['askUnit', { crop }]];
    case 'LISTING_QTY':
      return [['askQuantity', { crop, unit }]];
    case 'LISTING_PRICE':
      return [['askPrice', { unit }]];
    case 'LISTING_REVIEW':
      return [
        ['review', { crop, unit, quantity: d.quantity ?? 0, price: d.priceRupees ?? 0 }],
        ['reviewNote'],
      ];
    case 'LISTING_RESULT': {
      const r = ctx.result;
      if (r?.kind === 'DRAFT_SAVED') return [['draftSaved', { ref: r.ref ?? '' }]];
      if (r?.kind === 'CANCELLED') return [['draftCancelled']];
      if (r?.kind === 'PROFILE_REQUIRED') return [['profileRequired']];
      return [['toolFailed']];
    }
    case 'ORDER_ENTRY':
      return caller.signedIn ? [['askOrderNumber']] : [['orderNeedsSignIn']];
    case 'ORDER_RESULT': {
      const r = ctx.orderResult;
      if (r?.found && r.status) {
        return [
          [
            'orderStatus',
            { orderNumber: r.orderNumber, status: translate(lang, `orderStatus.${r.status}` as never) },
          ],
        ];
      }
      return [['orderNotFound']];
    }
    case 'SUPPORT_MENU':
      return caller.signedIn ? [['supportMenu']] : [['supportNeedsSignIn']];
    case 'SUPPORT_CONFIRM':
      return [['supportConfirm']];
    case 'SUPPORT_RESULT':
      return [['callbackCreated', { ref: ctx.supportResult?.ref ?? '' }]];
    default:
      return [];
  }
}

type IvrKeyLine = [IvrKey, Record<string, string | number>?];

export function renderNode(
  node: IvrNode,
  lang: LanguageCode | null,
  ctx: IvrContext,
  caller: Caller,
  prefix: IvrKeyLine[] = [],
): RenderedPrompt {
  const options = nodeOptions(node, lang, ctx, caller);
  const digits = digitsSpec(node);
  const inputMode: RenderedPrompt['inputMode'] =
    digits && !(node === 'ORDER_ENTRY' && !caller.signedIn) ? 'DIGITS' : 'MENU';

  let lines: string[];
  let body: string[];
  if (node === 'LANGUAGE' || !lang) {
    lines = LANGUAGE_CODES.map((code) => ivrText(code, 'languageOption', { key: LANGUAGES[code].ivrKey }));
    body = [];
  } else {
    body = [...prefix, ...bodyLines(node, lang, ctx, caller)].map(([k, v]) => ivrText(lang, k, v));
    if (inputMode === 'DIGITS') body.push(ivrText(lang, 'digitsHint'));
    const menuLines = options
      .filter((o) => o.key !== '*')
      .map((o) => ivrText(lang, 'pressKey', { label: o.label, key: o.key }));
    lines = [
      ...body.slice(0, inputMode === 'DIGITS' ? -1 : undefined),
      ...menuLines,
      ...(inputMode === 'DIGITS' ? body.slice(-1) : []),
    ];
  }
  return {
    node,
    language: lang,
    lines,
    body,
    options: options.map((o) => ({ key: o.key, label: o.label })),
    inputMode,
    digits: inputMode === 'DIGITS' ? digits : undefined,
    text: lines.join(' '),
  };
}

export type { IvrKeyLine };
