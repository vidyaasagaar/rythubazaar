import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Mic,
  MicOff,
  Repeat,
  Send,
  Snail,
  Volume2,
  VolumeX,
  WifiOff,
  Info,
  CheckCircle2,
  ArrowRight,
  Server,
  Brain,
  User2,
  Bot,
} from 'lucide-react';
import { LANGUAGE_LIST, type LanguageCode, type UiKey } from '@rythubazaar/shared';
import { ApiError, request } from '../../lib/api';
import { cx, formatDuration, formatTime } from '../../lib/format';
import {
  listenOnce,
  speak,
  speechRecognitionAvailable,
  stopSpeaking,
  findVoice,
  voicesReady,
  ttsSupported,
} from '../../lib/speech';
import { useI18n } from '../../context/I18nContext';
import { useAuth } from '../../context/AuthContext';
import { useConfig } from '../../context/ConfigContext';
import { Button, DemoBadge, Notice, Pill, STATUS_TONE } from '../../components/ui';
import { Handset } from './Handset';
import type { CallEventView, CallState, Prompt, Summary } from './types';

interface StartResponse {
  callId: string;
  callToken: string;
  correlationId: string;
  prompt: Prompt;
  events: CallEventView[];
}
interface InputResponse {
  prompt: Prompt;
  slow: boolean;
  events: CallEventView[];
}

const DIAL_MS = 650;
const MIN_CONNECT_MS = 700;
const CONNECT_TIMEOUT_MS = 10_000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PhonePage() {
  const { t, lang: uiLang, errorText } = useI18n();
  const { user } = useAuth();
  const { config } = useConfig();
  const demoCode = config?.demoDialCodes[0] ?? '';

  const [state, setState] = useState<CallState>('IDLE');
  const [dialed, setDialed] = useState('');
  const [entry, setEntry] = useState('');
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [events, setEvents] = useState<CallEventView[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [callLang, setCallLang] = useState<LanguageCode | 'ASK'>(user?.preferredLanguage ?? 'ASK');
  const [speaker, setSpeaker] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [listening, setListening] = useState(false);
  const [typed, setTyped] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [voiceOk, setVoiceOk] = useState<boolean | null>(null);

  const callRef = useRef<{ callId: string; token: string; connectedAt: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopListenRef = useRef<(() => void) | null>(null);
  const live = state === 'CONNECTED' || state === 'PROCESSING';
  const activeLang: LanguageCode = prompt?.language ?? (callLang === 'ASK' ? uiLang : callLang);

  useEffect(() => {
    if (user?.preferredLanguage) setCallLang((c) => (c === 'ASK' ? user.preferredLanguage : c));
  }, [user?.preferredLanguage]);

  // Timer while connected.
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      if (callRef.current) setElapsed(Math.floor((Date.now() - callRef.current.connectedAt) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [live]);

  // Detect whether this device has a voice for the call language.
  useEffect(() => {
    let cancelled = false;
    voicesReady().then(() => !cancelled && setVoiceOk(ttsSupported() && !!findVoice(activeLang)));
    return () => {
      cancelled = true;
    };
  }, [activeLang]);

  const say = useCallback(
    (p: Prompt, slow = false) => {
      if (!speaker || !p.language) return;
      speak(p.text, p.language, slow ? 0.72 : 1);
    },
    [speaker],
  );

  useEffect(() => {
    if (!speaker) stopSpeaking();
  }, [speaker]);

  const appendEvents = (list: CallEventView[]) =>
    setEvents((prev) => [...prev, ...list.filter((e) => !prev.some((p) => p.seq === e.seq))]);

  const finish = useCallback(
    async (reason: 'HANGUP' | 'INTERRUPTED') => {
      const call = callRef.current;
      stopSpeaking();
      stopListenRef.current?.();
      abortRef.current?.abort();
      callRef.current = null;
      setEntry('');
      if (!call) return;
      try {
        const res = await request<Summary & { events?: CallEventView[] }>(`/api/calls/${call.callId}/end`, {
          method: 'POST',
          body: { reason },
          headers: { 'X-Call-Token': call.token },
        });
        setSummary(res.data);
        if (res.data.events) appendEvents(res.data.events);
      } catch (err) {
        setFailure(errorText(err));
      }
    },
    [errorText],
  );

  // Leaving the page mid-call is recorded as an interruption (best effort).
  useEffect(() => {
    const onHide = () => {
      const call = callRef.current;
      if (!call) return;
      void request(`/api/calls/${call.callId}/end`, {
        method: 'POST',
        body: { reason: 'INTERRUPTED' },
        headers: { 'X-Call-Token': call.token },
        keepalive: true,
      }).catch(() => undefined);
      callRef.current = null;
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, []);

  const startCall = async () => {
    if (!/^[0-9*#]{1,15}$/.test(dialed)) {
      setFailure(t('phone.enterNumber'));
      setState('FAILED');
      return;
    }
    setSummary(null);
    setFailure(null);
    setLastError(null);
    setEvents([]);
    setPrompt(null);
    setElapsed(0);
    setState('DIALING');
    await wait(DIAL_MS);
    setState('CONNECTING');
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await request<StartResponse>('/api/calls', {
        method: 'POST',
        body: { dialedCode: dialed, ...(callLang !== 'ASK' ? { language: callLang } : {}) },
        signal: controller.signal,
      });
      await wait(Math.max(0, MIN_CONNECT_MS - (Date.now() - started)));
      callRef.current = { callId: res.data.callId, token: res.data.callToken, connectedAt: Date.now() };
      setPrompt(res.data.prompt);
      appendEvents(res.data.events);
      setState('CONNECTED');
      say(res.data.prompt);
    } catch (err) {
      await wait(Math.max(0, MIN_CONNECT_MS - (Date.now() - started)));
      if ((err as Error).name === 'AbortError') {
        setFailure(t('error.NETWORK'));
      } else if (err instanceof ApiError && err.code === 'NUMBER_NOT_AVAILABLE') {
        setFailure(t('phone.notAvailable'));
      } else {
        setFailure(errorText(err));
      }
      setState('FAILED');
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const send = async (body: Record<string, unknown>) => {
    const call = callRef.current;
    if (!call || state === 'PROCESSING') return;
    setState('PROCESSING');
    setLastError(null);
    try {
      const res = await request<InputResponse>(`/api/calls/${call.callId}/input`, {
        method: 'POST',
        body,
        headers: { 'X-Call-Token': call.token },
      });
      setPrompt(res.data.prompt);
      appendEvents(res.data.events);
      setEntry('');
      setState('CONNECTED');
      say(res.data.prompt, res.data.slow);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CALL_ENDED') {
        callRef.current = null;
        setState('ENDED');
        return;
      }
      // Nothing is assumed to have happened; the caller can retry.
      setLastError(errorText(err));
      setState('CONNECTED');
    }
  };

  const onKey = (k: string) => {
    if (state === 'IDLE') return setDialed((d) => (d + k).slice(0, 15));
    if (state === 'ENDED' || state === 'FAILED' || state === 'INTERRUPTED') {
      setState('IDLE');
      setSummary(null);
      setFailure(null);
      setDialed(k);
      return;
    }
    if (state !== 'CONNECTED' || !prompt) return;
    if (prompt.inputMode === 'DIGITS') {
      if (/\d/.test(k)) return setEntry((e) => (e + k).slice(0, prompt.digits?.maxLength ?? 8));
      if (k === '#') return void send({ kind: 'DTMF', value: `${entry}#` });
      if (k === '*') return entry ? setEntry('') : void send({ kind: 'DTMF', value: '*' });
      return;
    }
    void send({ kind: 'DTMF', value: k });
  };

  const onBackspace = () => {
    if (state === 'IDLE') setDialed((d) => d.slice(0, -1));
    else if (live) setEntry((e) => e.slice(0, -1));
  };

  const onHangup = async () => {
    if (state === 'IDLE') return setDialed('');
    if (state === 'DIALING' || state === 'CONNECTING') {
      abortRef.current?.abort();
      setState('ENDED');
      return;
    }
    if (live) {
      setState('ENDED');
      await finish('HANGUP');
    }
  };

  const simulateDrop = async () => {
    if (!live) return;
    setState('INTERRUPTED');
    await finish('INTERRUPTED');
  };

  const changeLanguage = (code: LanguageCode | 'ASK') => {
    setCallLang(code);
    if (live && code !== 'ASK') void send({ kind: 'LANGUAGE', value: code });
  };

  const startListening = () => {
    if (micMuted || !live) return;
    const stop = listenOnce(activeLang, {
      onResult: (text) => void send({ kind: 'SPEECH', value: text }),
      onError: () => setLastError(t('phone.speechUnsupported')),
      onEnd: () => setListening(false),
    });
    if (stop) {
      stopListenRef.current = stop;
      setListening(true);
    } else {
      setLastError(t('phone.speechUnsupported'));
    }
  };

  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    const v = typed.trim();
    if (!v || !live) return;
    setTyped('');
    void send({ kind: 'SPEECH', value: v });
  };

  // Physical keyboard support while not typing in a field.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        el.closest('input, textarea, select, [contenteditable="true"]') ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (/^[0-9*#]$/.test(e.key)) {
        e.preventDefault();
        onKey(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        onBackspace();
      } else if (
        e.key === 'Enter' &&
        (state === 'IDLE' || state === 'ENDED' || state === 'FAILED' || state === 'INTERRUPTED')
      ) {
        e.preventDefault();
        void startCall();
      } else if (e.key === 'Escape') {
        void onHangup();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const sttAvailable = useMemo(() => speechRecognitionAvailable(), []);

  return (
    <div className="container-page">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <DemoBadge>{t('phone.demoCall')}</DemoBadge>
            {config && !config.placesRealCalls && <Pill tone="neutral">{t('phone.telephonyDemo')}</Pill>}
          </div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">{t('phone.title')}</h1>
          <p className="mt-1 max-w-2xl text-ink-muted">{t('phone.intro', { code: demoCode || '…' })}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[21rem_minmax(0,1fr)] lg:gap-10">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Handset
            state={state}
            dialed={dialed}
            entry={entry}
            prompt={prompt}
            elapsed={elapsed}
            summary={summary}
            failure={failure}
            lastError={lastError}
            demoCode={demoCode}
            screenLang={prompt?.language ?? (callLang === 'ASK' ? undefined : callLang)}
            onKey={onKey}
            onBackspace={onBackspace}
            onClearAll={() => (state === 'IDLE' ? setDialed('') : setEntry(''))}
            onCall={() => void startCall()}
            onHangup={() => void onHangup()}
            onRepeat={() => void send({ kind: 'REPEAT', value: 'NORMAL' })}
          />
          <p className="mt-3 text-center text-xs text-ink-muted">{t('phone.keyHelp')}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="card p-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label className="label" htmlFor="call-lang">
                  {t('phone.callLanguage')}
                </label>
                <select
                  id="call-lang"
                  className="input"
                  value={callLang}
                  onChange={(e) => changeLanguage(e.target.value as LanguageCode | 'ASK')}
                  disabled={state === 'DIALING' || state === 'CONNECTING' || state === 'PROCESSING'}
                >
                  {!live && <option value="ASK">{t('phone.askInCall')}</option>}
                  {LANGUAGE_LIST.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.nativeName} — {l.englishName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setSpeaker((s) => !s)}
                  aria-pressed={speaker}
                  icon={speaker ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                >
                  {t('phone.speaker')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setMicMuted((m) => !m)}
                  aria-pressed={micMuted}
                  icon={micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                >
                  {t('phone.mute')}
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={!live}
                onClick={() => void send({ kind: 'REPEAT', value: 'NORMAL' })}
                icon={<Repeat className="h-4 w-4" />}
              >
                {t('phone.repeat')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={!live}
                onClick={() => void send({ kind: 'REPEAT', value: 'SLOW' })}
                icon={<Snail className="h-4 w-4" />}
              >
                {t('phone.slower')}
              </Button>
              <Button
                size="sm"
                variant={listening ? 'primary' : 'secondary'}
                disabled={!live || micMuted || !sttAvailable}
                onClick={startListening}
                icon={<Mic className="h-4 w-4" />}
              >
                {listening ? t('phone.listening') : t('phone.speak')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!live}
                onClick={() => void simulateDrop()}
                icon={<WifiOff className="h-4 w-4" />}
              >
                {t('phone.simulateDrop')}
              </Button>
            </div>

            <form className="mt-3 flex gap-2" onSubmit={submitTyped}>
              <label htmlFor="typed" className="sr-only">
                {t('phone.typeInstead')}
              </label>
              <input
                id="typed"
                className="input"
                placeholder={t('phone.typeInstead')}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={!live || micMuted}
                maxLength={200}
              />
              <Button
                type="submit"
                variant="secondary"
                disabled={!live || !typed.trim()}
                aria-label={t('phone.send')}
                icon={<Send className="h-4 w-4" />}
              />
            </form>

            <div className="mt-3 flex flex-col gap-2">
              {!sttAvailable && (
                <Notice icon={<Info className="h-4 w-4" />}>{t('phone.speechUnsupported')}</Notice>
              )}
              {voiceOk === false && (
                <Notice icon={<Info className="h-4 w-4" />}>{t('phone.ttsUnsupported')}</Notice>
              )}
              <p className="text-xs text-ink-muted">
                {user ? t('phone.callingAs', { name: user.name, role: user.role }) : t('phone.guestCaller')} ·{' '}
                {t('phone.meta', { interpreter: config?.interpreter ?? '—' })}
              </p>
            </div>
          </section>

          {summary && (
            <section className="card animate-fadeIn border-forest-200 p-4">
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-5 w-5 text-forest-600" aria-hidden />
                {t('phone.summary')}
              </h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-ink-muted">{t('phone.sessionId')}</dt>
                  <dd className="break-all font-mono text-xs">{summary.callId}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">{t('phone.outcome')}</dt>
                  <dd>
                    <Pill tone={STATUS_TONE[summary.outcome] ?? 'neutral'}>
                      {t(`outcome.${summary.outcome}`)}
                    </Pill>
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">{t('phone.duration')}</dt>
                  <dd className="font-mono">{formatDuration(summary.durationSec)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.linked.listingIds.length > 0 && (
                  <Link to="/farmer/listings?status=DRAFT" className="btn btn-primary btn-sm">
                    {t('nav.listings')}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
                {summary.linked.ticketIds.length > 0 && (
                  <Link to="/support" className="btn btn-secondary btn-sm">
                    {t('support.myTickets')}
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setState('IDLE');
                    setSummary(null);
                  }}
                >
                  {t('phone.newCall')}
                </Button>
              </div>
            </section>
          )}

          <Transcript events={events} />
        </div>
      </div>
    </div>
  );
}

const LANE_ICON = {
  CALLER: User2,
  IVR: Bot,
  INTERPRETATION: Brain,
  TOOL: Server,
  BUSINESS: CheckCircle2,
  SYSTEM: Info,
};

function laneOf(kind: string): keyof typeof LANE_ICON {
  if (kind === 'KEYPAD' || kind === 'SPEECH') return 'CALLER';
  if (kind === 'PROMPT') return 'IVR';
  if (kind === 'INTERPRETATION') return 'INTERPRETATION';
  if (kind === 'TOOL_REQUEST' || kind === 'TOOL_RESULT') return 'TOOL';
  if (kind === 'BUSINESS_EVENT') return 'BUSINESS';
  return 'SYSTEM';
}

function Transcript({ events }: { events: CallEventView[] }) {
  const { t, lang } = useI18n();
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    // Keep the newest event in view inside the panel without scrolling the page.
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [events.length]);
  const laneLabel: Record<keyof typeof LANE_ICON, string> = {
    CALLER: t('phone.you'),
    IVR: t('phone.ivr'),
    INTERPRETATION: t('phone.lane.interpretation'),
    TOOL: t('phone.lane.tool'),
    BUSINESS: t('phone.lane.business'),
    SYSTEM: t('phone.lane.system'),
  };
  return (
    <section className="card p-4">
      <h2 className="mb-3 font-semibold">{t('phone.transcript')}</h2>
      {events.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('common.empty')}</p>
      ) : (
        <ol
          ref={listRef}
          className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1 text-sm"
          aria-live="polite"
        >
          {events.map((e) => {
            const lane = laneOf(e.kind);
            const Icon = LANE_ICON[lane];
            const detail = describe(e, t);
            return (
              <li
                key={e.seq}
                className={cx(
                  'flex gap-2.5 rounded-xl px-3 py-2',
                  lane === 'CALLER' && 'ml-6 bg-forest-50',
                  lane === 'IVR' && 'mr-6 bg-ivory-50 ring-1 ring-line',
                  lane === 'INTERPRETATION' && 'bg-sky-50 text-sky-700',
                  lane === 'TOOL' && 'bg-ivory-200/60 font-mono text-xs text-ink-soft',
                  lane === 'BUSINESS' && 'bg-forest-100 font-medium text-forest-900',
                  lane === 'SYSTEM' && 'text-xs text-ink-muted',
                )}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                    {laneLabel[lane]} · {formatTime(e.at, lang)}
                  </p>
                  <p className="break-words">{detail}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function describe(e: CallEventView, t: (k: UiKey, v?: Record<string, string | number>) => string): string {
  const p = e.payload;
  switch (e.kind) {
    case 'PROMPT':
      return e.text ?? '';
    case 'KEYPAD':
      return `⌨ ${e.text}`;
    case 'SPEECH':
      return `“${e.text}”`;
    case 'INTERPRETATION':
      return `${String(p.meaning ?? p.intent ?? '—')} · ${String(p.method)}${typeof p.confidence === 'number' ? ` · ${Math.round(p.confidence * 100)}%` : ''}`;
    case 'TOOL_REQUEST':
      return `→ ${String(p.tool)} ${JSON.stringify(p.args ?? {})}`;
    case 'TOOL_RESULT':
      return p.ok
        ? `← ${String(p.tool)} ok ${JSON.stringify(p.result ?? {})}`
        : `← ${String(p.tool)} ✗ ${JSON.stringify(p.error ?? {})}`;
    case 'BUSINESS_EVENT':
      return `✓ ${String(p.type)}`;
    case 'LANGUAGE_CHANGED':
      return `${t('common.language')}: ${String(p.from ?? '—')} → ${String(p.to)}`;
    case 'CALL_STARTED':
      return `${t('phone.state.CONNECTED')} · ${String(p.dialedCode)} · ${String(p.telephony ?? 'DEMO')}`;
    case 'CALL_ENDED':
      return `${t('phone.state.ENDED')} · ${t(`outcome.${String(p.outcome)}` as UiKey)}`;
    default:
      return `${e.kind} ${JSON.stringify(p)}`;
  }
}
