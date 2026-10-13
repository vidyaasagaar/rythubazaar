import type { CallOutcome, LanguageCode } from '@rythubazaar/shared';

export type CallState =
  'IDLE' | 'DIALING' | 'CONNECTING' | 'CONNECTED' | 'PROCESSING' | 'ENDED' | 'FAILED' | 'INTERRUPTED';

export interface Prompt {
  node: string;
  language: LanguageCode | null;
  lines: string[];
  body: string[];
  options: { key: string; label: string }[];
  inputMode: 'MENU' | 'DIGITS';
  digits?: { min: number; max: number; maxLength: number };
  text: string;
}

export interface CallEventView {
  seq: number;
  at: string;
  kind: string;
  node: string;
  text: string | null;
  payload: Record<string, unknown>;
}

export interface Summary {
  callId: string;
  correlationId: string;
  dialedCode: string;
  language: LanguageCode | null;
  outcome: CallOutcome;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  eventCount: number;
  linked: { listingIds: string[]; orderIds: string[]; ticketIds: string[] };
}
