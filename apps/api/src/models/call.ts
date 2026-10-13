import { Schema, model, type Types } from 'mongoose';
import {
  CALL_EVENT_KINDS,
  CALL_OUTCOMES,
  LANGUAGE_CODES,
  type CallEventKind,
  type CallOutcome,
  type LanguageCode,
} from '@rythubazaar/shared';

export interface ICallSession {
  _id: Types.ObjectId;
  callId: string;
  correlationId: string;
  callTokenHash: string;
  dialedCode: string;
  route: string | null;
  mode: 'DEMO';
  language: LanguageCode | null;
  languageSource: 'PRESELECTED' | 'IVR_MENU' | 'NONE';
  userId?: Types.ObjectId | null;
  userRole?: string | null;
  node: string;
  context: Record<string, unknown>;
  state: 'ACTIVE' | 'ENDED';
  outcome: CallOutcome;
  hasError: boolean;
  errorSummary?: string | null;
  interpreter: 'RULES_DEMO';
  audioRecording: 'DISABLED';
  eventCount: number;
  version: number;
  linked: { listingIds: string[]; orderIds: string[]; ticketIds: string[] };
  startedAt: Date;
  connectedAt?: Date | null;
  endedAt?: Date | null;
  lastActivityAt: Date;
}

const callSessionSchema = new Schema<ICallSession>(
  {
    callId: { type: String, required: true },
    correlationId: { type: String, required: true },
    callTokenHash: { type: String, required: true, select: false },
    dialedCode: { type: String, required: true },
    route: { type: String, default: null },
    mode: { type: String, default: 'DEMO' },
    language: { type: String, enum: [...LANGUAGE_CODES, null], default: null },
    languageSource: { type: String, enum: ['PRESELECTED', 'IVR_MENU', 'NONE'], default: 'NONE' },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userRole: { type: String, default: null },
    node: { type: String, required: true },
    context: { type: Schema.Types.Mixed, default: {} },
    state: { type: String, enum: ['ACTIVE', 'ENDED'], default: 'ACTIVE' },
    outcome: { type: String, enum: CALL_OUTCOMES, default: 'IN_PROGRESS' },
    hasError: { type: Boolean, default: false },
    errorSummary: { type: String, default: null },
    interpreter: { type: String, default: 'RULES_DEMO' },
    audioRecording: { type: String, default: 'DISABLED' },
    eventCount: { type: Number, default: 0 },
    version: { type: Number, default: 0 },
    linked: {
      listingIds: { type: [String], default: [] },
      orderIds: { type: [String], default: [] },
      ticketIds: { type: [String], default: [] },
    },
    startedAt: { type: Date, required: true },
    connectedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    lastActivityAt: { type: Date, required: true },
  },
  { minimize: false },
);
callSessionSchema.index({ callId: 1 }, { unique: true });
callSessionSchema.index({ startedAt: -1 });
callSessionSchema.index({ dialedCode: 1, startedAt: -1 });
callSessionSchema.index({ language: 1, startedAt: -1 });
callSessionSchema.index({ outcome: 1, startedAt: -1 });
callSessionSchema.index({ hasError: 1, startedAt: -1 });
callSessionSchema.index({ state: 1, lastActivityAt: 1 });

export const CallSession = model<ICallSession>('CallSession', callSessionSchema);

export interface ICallEvent {
  _id: Types.ObjectId;
  callId: string;
  seq: number;
  at: Date;
  kind: CallEventKind;
  node: string;
  text?: string | null;
  payload: Record<string, unknown>;
}

const callEventSchema = new Schema<ICallEvent>(
  {
    callId: { type: String, required: true },
    seq: { type: Number, required: true },
    at: { type: Date, required: true },
    kind: { type: String, enum: CALL_EVENT_KINDS, required: true },
    node: { type: String, required: true },
    text: { type: String, default: null },
    payload: { type: Schema.Types.Mixed, default: {} },
  },
  { versionKey: false, minimize: false },
);
callEventSchema.index({ callId: 1, seq: 1 }, { unique: true });
callEventSchema.index({ kind: 1, at: -1 });

export const CallEvent = model<ICallEvent>('CallEvent', callEventSchema);
