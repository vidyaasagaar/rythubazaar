import { LANGUAGES, type LanguageCode } from '@rythubazaar/shared';

/**
 * Browser speech capabilities, detected at runtime. Nothing here claims a language works —
 * availability depends on the browser and the voices installed on the device, so the UI
 * always keeps the keypad and on-screen text as the primary path.
 */

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function speechRecognitionAvailable(): boolean {
  return recognitionCtor() !== null;
}

export function listenOnce(
  lang: LanguageCode,
  handlers: { onResult: (text: string) => void; onError: (code: string) => void; onEnd: () => void },
): (() => void) | null {
  const Ctor = recognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = LANGUAGES[lang].speechLocale;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript?.trim();
    if (text) handlers.onResult(text);
  };
  rec.onerror = (e) => handlers.onError(e.error);
  rec.onend = handlers.onEnd;
  try {
    rec.start();
  } catch {
    handlers.onError('start-failed');
    return null;
  }
  return () => rec.abort();
}

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** Find an installed voice for the language (exact locale first, then same base language). */
export function findVoice(lang: LanguageCode): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  const locale = LANGUAGES[lang].ttsLocale.toLowerCase();
  const base = locale.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === locale) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(`${base}-`) || v.lang.toLowerCase() === base) ??
    null
  );
}

/** Voices load asynchronously in most browsers; resolve once they are known (or after a timeout). */
export function voicesReady(timeoutMs = 1500): Promise<void> {
  if (!ttsSupported()) return Promise.resolve();
  if (window.speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', done);
      resolve();
    };
    window.speechSynthesis.addEventListener('voiceschanged', done);
    setTimeout(done, timeoutMs);
  });
}

export function speak(text: string, lang: LanguageCode, rate = 1): boolean {
  if (!ttsSupported()) return false;
  const voice = findVoice(lang);
  if (!voice) return false;
  window.speechSynthesis.cancel();
  // Speak sentence by sentence: Chrome silently stops long utterances (~15 s) on some voices.
  const sentences = text
    .match(/[^.!?।]+[.!?।]*/g)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [text];
  for (const sentence of sentences) {
    const u = new SpeechSynthesisUtterance(sentence);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    window.speechSynthesis.speak(u);
  }
  return true;
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
