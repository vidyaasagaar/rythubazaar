import { useEffect, useRef } from 'react';
import { BatteryMedium, Delete, Phone, PhoneOff, Signal } from 'lucide-react';
import { translate, type LanguageCode, type UiKey, type Vars } from '@rythubazaar/shared';
import { useI18n } from '../../context/I18nContext';
import { cx, formatDuration } from '../../lib/format';
import type { CallState, Prompt, Summary } from './types';

const KEYS: { key: string; sub: string }[] = [
  { key: '1', sub: '' },
  { key: '2', sub: 'ABC' },
  { key: '3', sub: 'DEF' },
  { key: '4', sub: 'GHI' },
  { key: '5', sub: 'JKL' },
  { key: '6', sub: 'MNO' },
  { key: '7', sub: 'PQRS' },
  { key: '8', sub: 'TUV' },
  { key: '9', sub: 'WXYZ' },
  { key: '*', sub: '' },
  { key: '0', sub: '+' },
  { key: '#', sub: '' },
];

interface HandsetProps {
  state: CallState;
  dialed: string;
  entry: string;
  prompt: Prompt | null;
  elapsed: number;
  summary: Summary | null;
  failure: string | null;
  lastError: string | null;
  demoCode: string;
  onKey: (k: string) => void;
  onBackspace: () => void;
  onClearAll: () => void;
  onCall: () => void;
  onHangup: () => void;
  onRepeat: () => void;
  screenLang?: LanguageCode;
}

function Clock() {
  const now = new Date();
  return (
    <span className="tabular-nums">{`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}</span>
  );
}

export function Handset(p: HandsetProps) {
  const ui = useI18n();
  // The handset screen speaks the call's language once one is chosen; otherwise the UI language.
  const screenLang: LanguageCode = p.screenLang ?? ui.lang;
  const t = (key: UiKey, vars?: Vars) => translate(screenLang, key, vars);
  const screenRef = useRef<HTMLDivElement>(null);
  const live = p.state === 'CONNECTED' || p.state === 'PROCESSING';
  const holdTimer = useRef<number | null>(null);

  useEffect(() => {
    // scrollTop (not scrollTo) for older Android WebViews.
    if (screenRef.current) screenRef.current.scrollTop = 0;
  }, [p.prompt]);

  const stateLabel = t(`phone.state.${p.state}`);

  return (
    <div
      className="relative mx-auto w-full max-w-[19.5rem] select-none rounded-[2.6rem] bg-gradient-to-b from-handset-600 via-handset-800 to-handset-900 p-3.5 pb-5 shadow-lift ring-1 ring-black/40"
      aria-label={t('phone.title')}
    >
      {/* earpiece */}
      <div
        className="mx-auto mb-3 mt-1 h-1.5 w-16 rounded-full bg-black/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]"
        aria-hidden
      />

      {/* screen */}
      <div className="rounded-[1.1rem] bg-black/60 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]">
        <div className="flex h-[17.5rem] flex-col overflow-hidden rounded-xl bg-gradient-to-b from-lcd-50 to-lcd-100 text-lcd-ink shadow-lcd">
          <div className="flex items-center justify-between px-2.5 pt-1.5 text-[11px] font-semibold">
            <span className="flex items-center gap-1">
              <Signal className="h-3 w-3" aria-hidden />
              <span>RythuBazaar</span>
            </span>
            <span className="rounded bg-turmeric-600 px-1.5 py-px text-[10px] font-bold tracking-wide text-white">
              {live || p.state === 'DIALING' || p.state === 'CONNECTING' ? t('phone.demoCall') : 'DEMO'}
            </span>
            <span className="flex items-center gap-1">
              <Clock />
              <BatteryMedium className="h-3.5 w-3.5" aria-hidden />
            </span>
          </div>

          <div className="flex items-center justify-between border-b border-lcd-200 px-2.5 pb-1.5 pt-1 text-xs">
            <span className="font-semibold" aria-live="polite">
              {stateLabel}
            </span>
            {live && <span className="font-mono tabular-nums">{formatDuration(p.elapsed)}</span>}
          </div>

          <div
            ref={screenRef}
            className="relative min-h-0 flex-1 overflow-y-auto px-2.5 py-2 text-[13px] leading-snug"
          >
            {p.state === 'IDLE' && (
              <div className="flex h-full flex-col justify-between">
                <p className="text-xs text-lcd-ink/60">{p.dialed ? '' : t('phone.enterNumber')}</p>
                <p
                  className={cx(
                    'break-all text-right font-mono tracking-[0.12em]',
                    p.dialed.length > 9 ? 'text-2xl' : 'text-[2rem]',
                  )}
                  aria-live="polite"
                >
                  {p.dialed || <span className="text-lcd-ink/30">{p.demoCode}</span>}
                </p>
              </div>
            )}

            {(p.state === 'DIALING' || p.state === 'CONNECTING') && (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <span className="relative grid h-14 w-14 place-items-center">
                  <span
                    className="absolute inset-0 animate-pulseRing rounded-full bg-forest-500/40"
                    aria-hidden
                  />
                  <span className="relative grid h-12 w-12 place-items-center rounded-full bg-forest-600 text-white">
                    <Phone className="h-5 w-5" aria-hidden />
                  </span>
                </span>
                <p className="font-mono text-xl tracking-[0.15em]">{p.dialed}</p>
                <p className="text-xs">RythuBazaar IVR</p>
              </div>
            )}

            {live && p.prompt && (
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  {p.prompt.body.map((line, i) => (
                    <p key={i} className={i === 0 ? 'font-semibold' : ''}>
                      {line}
                    </p>
                  ))}
                </div>
                {p.prompt.options.length > 0 && (
                  <ul className="flex flex-col gap-0.5" aria-label={t('phone.options')}>
                    {p.prompt.options.map((o) => (
                      <li key={o.key} className="flex items-baseline gap-1.5">
                        <span className="grid h-5 min-w-[1.25rem] shrink-0 place-items-center rounded bg-lcd-ink px-1 font-mono text-[11px] font-bold text-lcd-50">
                          {o.key}
                        </span>
                        <span className="min-w-0">{o.label}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {p.prompt.inputMode === 'DIGITS' && (
                  <div
                    className="mt-1 rounded-md border border-lcd-ink/30 bg-white/50 px-2 py-1.5 font-mono text-xl tracking-[0.15em]"
                    aria-live="polite"
                  >
                    {p.entry}
                    <span
                      className="ml-0.5 inline-block h-5 w-[2px] translate-y-0.5 animate-pulse bg-lcd-ink"
                      aria-hidden
                    />
                  </div>
                )}
                {p.lastError && (
                  <p className="rounded bg-chili-100 px-2 py-1 text-xs text-chili-700">{p.lastError}</p>
                )}
              </div>
            )}

            {(p.state === 'ENDED' || p.state === 'INTERRUPTED' || p.state === 'FAILED') && (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                <PhoneOff className="h-7 w-7 text-chili-600" aria-hidden />
                <p className="font-semibold">{stateLabel}</p>
                {p.failure && <p className="text-xs">{p.failure}</p>}
                {p.summary && (
                  <>
                    <p className="font-mono text-lg tabular-nums">{formatDuration(p.summary.durationSec)}</p>
                    <p className="text-xs">{t(`outcome.${p.summary.outcome}`)}</p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-lcd-200 px-2.5 py-1 text-[11px] font-semibold">
            <span>{live ? t('phone.repeat') : ''}</span>
            <span>{live && p.prompt?.inputMode === 'DIGITS' ? '# OK' : ''}</span>
            <span>
              {p.state === 'IDLE' && p.dialed ? t('common.clear') : live && p.entry ? t('common.clear') : ''}
            </span>
          </div>
        </div>
      </div>

      {/* soft keys + call keys */}
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-1">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="h-9 rounded-full bg-handset-600 text-[11px] font-semibold text-ivory-200 shadow-key active:shadow-keyPressed disabled:opacity-40"
            onClick={p.onRepeat}
            disabled={!live}
            aria-label={t('phone.repeat')}
          >
            {t('phone.repeat')}
          </button>
          <button
            type="button"
            className="grid h-12 place-items-center rounded-2xl bg-forest-600 text-white shadow-key transition-transform active:translate-y-px active:shadow-keyPressed disabled:opacity-50"
            onClick={p.onCall}
            disabled={
              p.state !== 'IDLE' && p.state !== 'ENDED' && p.state !== 'FAILED' && p.state !== 'INTERRUPTED'
            }
            aria-label={
              p.state === 'ENDED' || p.state === 'FAILED' || p.state === 'INTERRUPTED'
                ? t('phone.callAgain')
                : 'Call'
            }
          >
            <Phone className="h-6 w-6" aria-hidden />
          </button>
        </div>
        <button
          type="button"
          className="grid h-14 w-14 place-items-center rounded-full bg-handset-500 text-xs font-bold text-ivory-100 shadow-key ring-4 ring-handset-700 active:shadow-keyPressed"
          onClick={() => p.onKey('#')}
          disabled={!live || p.prompt?.inputMode !== 'DIGITS'}
          aria-label="OK (#)"
        >
          OK
        </button>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="grid h-9 place-items-center rounded-full bg-handset-600 text-ivory-200 shadow-key active:shadow-keyPressed"
            onClick={p.onBackspace}
            onPointerDown={() => {
              holdTimer.current = window.setTimeout(() => {
                p.onClearAll();
                holdTimer.current = null;
              }, 600);
            }}
            onPointerUp={() => holdTimer.current && window.clearTimeout(holdTimer.current)}
            onPointerLeave={() => holdTimer.current && window.clearTimeout(holdTimer.current)}
            aria-label={t('common.clear')}
          >
            <Delete className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            className="grid h-12 place-items-center rounded-2xl bg-chili-600 text-white shadow-key transition-transform active:translate-y-px active:shadow-keyPressed"
            onClick={p.onHangup}
            aria-label="End call"
          >
            <PhoneOff className="h-6 w-6" aria-hidden />
          </button>
        </div>
      </div>

      {/* keypad */}
      <div className="mt-4 grid grid-cols-3 gap-2.5 px-1" role="group" aria-label="Keypad">
        {KEYS.map(({ key, sub }) => (
          <button
            key={key}
            type="button"
            onClick={() => p.onKey(key)}
            className="flex h-[3.25rem] flex-col items-center justify-center rounded-[1.1rem] bg-gradient-to-b from-handset-500 to-handset-600 text-ivory-50 shadow-key transition-transform active:translate-y-px active:shadow-keyPressed"
            aria-label={`Key ${key}`}
          >
            <span className="text-xl font-semibold leading-none">{key}</span>
            {sub && (
              <span className="mt-0.5 text-[9px] font-semibold tracking-[0.15em] text-ivory-300/70">
                {sub}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
