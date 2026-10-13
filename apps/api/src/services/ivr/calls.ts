import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  IVR_CROPS,
  LANGUAGES,
  LANGUAGE_CODES,
  type CallEndReason,
  type CallEventKind,
  type CallInput,
  type CallOutcome,
  type LanguageCode,
} from '@rythubazaar/shared';
import { CallEvent, CallSession, type ICallSession } from '../../models';
import { AppError, Errors } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { scrubText } from '../../lib/redact';
import { audit } from '../audit';
import {
  IVR_UNITS,
  digitsSpec,
  nodeOptions,
  renderNode,
  type Caller,
  type IvrContext,
  type IvrKeyLine,
  type IvrNode,
  type RenderedPrompt,
} from './flow';
import { runTool, type ToolName } from './tools';
import type { AuthUser } from '../../types/express';
import type { AppDeps } from '../../context';

interface PendingEvent {
  kind: CallEventKind;
  node: string;
  text?: string;
  payload?: Record<string, unknown>;
}

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

// Serialise inputs per call within this process; the version check below guards across processes.
const locks = new Map<string, Promise<unknown>>();
async function withCallLock<T>(callId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(callId) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  locks.set(callId, run);
  try {
    return await run;
  } finally {
    if (locks.get(callId) === run) locks.delete(callId);
  }
}

async function appendEvents(callId: string, events: PendingEvent[]) {
  if (!events.length) return [];
  const session = await CallSession.findOneAndUpdate(
    { callId },
    { $inc: { eventCount: events.length }, $set: { lastActivityAt: new Date() } },
    { new: false, projection: { eventCount: 1 } },
  ).lean();
  if (!session) throw Errors.notFound('Call');
  const base = session.eventCount;
  const now = Date.now();
  const docs = events.map((e, i) => ({
    callId,
    seq: base + i + 1,
    at: new Date(now + i),
    kind: e.kind,
    node: e.node,
    text: e.text ? scrubText(e.text) : null,
    payload: e.payload ?? {},
  }));
  await CallEvent.insertMany(docs);
  return docs;
}

function callerOf(session: Pick<ICallSession, 'userId' | 'userRole'>): Caller {
  return {
    signedIn: !!session.userId && ['CUSTOMER', 'FARMER'].includes(session.userRole ?? ''),
    role: session.userRole ?? null,
  };
}

function promptEvent(p: RenderedPrompt, extra?: Record<string, unknown>): PendingEvent {
  return {
    kind: 'PROMPT',
    node: p.node,
    text: p.text,
    payload: { options: p.options, inputMode: p.inputMode, language: p.language, ...extra },
  };
}

export function presentEvent(e: {
  seq: number;
  at: Date;
  kind: string;
  node: string;
  text?: string | null;
  payload: Record<string, unknown>;
}) {
  return { seq: e.seq, at: e.at, kind: e.kind, node: e.node, text: e.text ?? null, payload: e.payload };
}

export async function startCall(
  deps: AppDeps,
  input: { dialedCode: string; language?: LanguageCode },
  user: AuthUser | undefined,
  requestId: string,
) {
  const callId = randomUUID();
  const correlationId = randomUUID();
  const now = new Date();
  const route = deps.telephony.resolveRoute(input.dialedCode);

  if (!route) {
    await CallSession.create({
      callId,
      correlationId,
      callTokenHash: hashToken(randomBytes(16).toString('hex')),
      dialedCode: input.dialedCode,
      route: null,
      node: 'NONE',
      state: 'ENDED',
      outcome: 'NOT_AVAILABLE',
      hasError: true,
      errorSummary: 'NUMBER_NOT_AVAILABLE',
      userId: user?._id ?? null,
      userRole: user?.role ?? null,
      startedAt: now,
      endedAt: now,
      lastActivityAt: now,
    });
    await appendEvents(callId, [
      {
        kind: 'DIAL_FAILED',
        node: 'NONE',
        payload: { dialedCode: input.dialedCode, reason: 'NUMBER_NOT_AVAILABLE', mode: 'DEMO' },
      },
    ]);
    await audit({
      category: 'BUSINESS',
      action: 'CALL_DIAL_FAILED',
      outcome: 'FAILURE',
      actor: user ?? null,
      resourceType: 'CallSession',
      resourceId: callId,
      correlationId,
      requestId,
      details: { dialedCode: input.dialedCode },
    });
    throw new AppError(404, 'NUMBER_NOT_AVAILABLE', 'Number not available in demo', { callId });
  }

  const callToken = randomBytes(24).toString('base64url');
  const language = input.language ?? null;
  const node: IvrNode = language ? 'MAIN' : 'LANGUAGE';
  const caller: Caller = {
    signedIn: !!user && ['CUSTOMER', 'FARMER'].includes(user.role),
    role: user?.role ?? null,
  };
  const prompt = renderNode(node, language, {}, caller, language ? [['welcome']] : []);

  await CallSession.create({
    callId,
    correlationId,
    callTokenHash: hashToken(callToken),
    dialedCode: input.dialedCode,
    route,
    mode: 'DEMO',
    language,
    languageSource: language ? 'PRESELECTED' : 'NONE',
    userId: user?._id ?? null,
    userRole: user?.role ?? null,
    node,
    context: {},
    state: 'ACTIVE',
    outcome: 'IN_PROGRESS',
    startedAt: now,
    connectedAt: now,
    lastActivityAt: now,
  });
  const events = await appendEvents(callId, [
    {
      kind: 'CALL_STARTED',
      node,
      payload: {
        dialedCode: input.dialedCode,
        route,
        mode: 'DEMO',
        telephony: 'IN_APP_SIMULATION_NO_REAL_CALL',
        interpreter: deps.interpreter.name,
        audioRecording: 'DISABLED',
        caller: user ? { role: user.role } : { role: 'GUEST' },
        language,
      },
    },
    promptEvent(prompt),
  ]);
  await audit({
    category: 'BUSINESS',
    action: 'CALL_STARTED',
    outcome: 'SUCCESS',
    actor: user ?? null,
    resourceType: 'CallSession',
    resourceId: callId,
    correlationId,
    requestId,
    details: { dialedCode: input.dialedCode, route, language },
  });
  return {
    callId,
    callToken,
    correlationId,
    mode: 'DEMO' as const,
    state: 'CONNECTED' as const,
    prompt,
    events: events.map(presentEvent),
  };
}

export async function loadCallForCaller(callId: string, token: string | undefined) {
  const session = await CallSession.findOne({ callId }).select('+callTokenHash');
  if (!session || !token) throw Errors.notFound('Call');
  const a = Buffer.from(session.callTokenHash);
  const b = Buffer.from(hashToken(token));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw Errors.notFound('Call');
  return session;
}

interface StepOutput {
  node: IvrNode;
  language: LanguageCode | null;
  context: IvrContext;
  prefix: IvrKeyLine[];
  events: PendingEvent[];
  slow?: boolean;
  languageSource?: ICallSession['languageSource'];
  linked?: { listingIds?: string[]; orderIds?: string[]; ticketIds?: string[] };
}

async function callTool(
  name: ToolName,
  args: Record<string, unknown>,
  session: ICallSession,
  out: StepOutput,
) {
  out.events.push({ kind: 'TOOL_REQUEST', node: out.node, payload: { tool: name, args } });
  const result = await runTool(name, args, {
    callerUserId: session.userId ? session.userId.toString() : null,
    callId: session.callId,
    correlationId: session.correlationId,
  });
  out.events.push({
    kind: 'TOOL_RESULT',
    node: out.node,
    payload: result.ok
      ? { tool: name, ok: true, result: result.data }
      : { tool: name, ok: false, error: { code: result.code, message: result.message } },
  });
  if (result.ok && result.business) {
    // Only recorded after the backend confirmed the write.
    out.events.push({
      kind: 'BUSINESS_EVENT',
      node: out.node,
      payload: { type: result.business.type, ...result.business.ids, committed: true },
    });
  }
  if (!result.ok) {
    out.events.push({
      kind: 'ERROR',
      node: out.node,
      payload: { source: 'TOOL', tool: name, code: result.code },
    });
    out.context.errors = (out.context.errors ?? 0) + 1;
  }
  return result;
}

const UNKNOWN = Symbol('unknown');

/** Resolve the caller's input into a key (menus) or a digit string (number entry). */
function resolveInput(
  deps: AppDeps,
  session: ICallSession,
  input: CallInput,
  out: StepOutput,
): { key?: string; digits?: string; back?: boolean } | typeof UNKNOWN {
  const node = session.node as IvrNode;
  const lang = (session.language ?? 'en-IN') as LanguageCode;
  const caller = callerOf(session);
  const expectsDigits = !!digitsSpec(node) && !(node === 'ORDER_ENTRY' && !caller.signedIn);
  const options = nodeOptions(
    node,
    session.language as LanguageCode | null,
    session.context as IvrContext,
    caller,
  );

  if (input.kind === 'DTMF') {
    out.events.push({ kind: 'KEYPAD', node, text: input.value, payload: { keys: input.value } });
    if (expectsDigits) {
      if (input.value === '*') {
        out.events.push({
          kind: 'INTERPRETATION',
          node,
          payload: { method: 'KEYPAD', meaning: 'BACK', confidence: 1 },
        });
        return { back: true };
      }
      const digits = input.value.replace(/#$/, '');
      out.events.push({
        kind: 'INTERPRETATION',
        node,
        payload: { method: 'KEYPAD', meaning: 'DIGITS', digits, confidence: 1 },
      });
      return /^\d+$/.test(digits) ? { digits } : UNKNOWN;
    }
    const key = input.value.slice(0, 1);
    const match = options.find((o) => o.key === key);
    out.events.push({
      kind: 'INTERPRETATION',
      node,
      payload: {
        method: 'KEYPAD',
        resolvedKey: key,
        meaning: match ? match.label : 'INVALID',
        confidence: 1,
      },
    });
    return match ? { key } : UNKNOWN;
  }

  // SPEECH (browser speech recognition or typed text): rules-based demo interpreter.
  out.events.push({
    kind: 'SPEECH',
    node,
    text: input.value,
    payload: { source: 'BROWSER_SPEECH_OR_TYPED' },
  });
  const interp = deps.interpreter.interpretSpeech(input.value, {
    language: lang,
    options: options.map((o) => ({ key: o.key, intent: o.intent, matchTerms: o.matchTerms })),
    expectsDigits,
  });
  out.events.push({
    kind: 'INTERPRETATION',
    node,
    payload: {
      method: interp.method,
      intent: interp.intent,
      resolvedKey: interp.resolvedKey,
      digits: interp.digits,
      confidence: interp.confidence,
      matchedTerm: interp.matchedTerm ?? null,
      meaning: interp.resolvedKey ? (options.find((o) => o.key === interp.resolvedKey)?.label ?? null) : null,
    },
  });
  if (interp.digits) return { digits: interp.digits };
  if (interp.resolvedKey) return { key: interp.resolvedKey };
  out.prefix.push(['speechNotUnderstood']);
  return UNKNOWN;
}

async function step(deps: AppDeps, session: ICallSession, input: CallInput): Promise<StepOutput> {
  const out: StepOutput = {
    node: session.node as IvrNode,
    language: (session.language as LanguageCode | null) ?? null,
    context: structuredClone((session.context ?? {}) as IvrContext),
    prefix: [],
    events: [],
  };
  const caller = callerOf(session);

  if (input.kind === 'LANGUAGE') {
    out.events.push({
      kind: 'LANGUAGE_CHANGED',
      node: out.node,
      payload: { from: session.language, to: input.value, via: 'SCREEN_SELECTOR' },
    });
    out.language = input.value;
    out.languageSource = 'PRESELECTED';
    out.prefix.push(['languageSet']);
    if (out.node === 'LANGUAGE') {
      out.node = 'MAIN';
      out.prefix.push(['welcome']);
    }
    return out;
  }
  if (input.kind === 'REPEAT') {
    out.slow = input.value === 'SLOW';
    return out;
  }

  const resolved = resolveInput(deps, session, input, out);
  if (resolved === UNKNOWN) {
    if (!out.prefix.length) out.prefix.push(['invalidChoice']);
    return out;
  }
  const { key, digits, back } = resolved;
  if (key === '*') return out; // repeat current node

  const draft = (out.context.draft ??= {});

  switch (out.node) {
    case 'LANGUAGE': {
      const code = LANGUAGE_CODES.find((c) => LANGUAGES[c].ivrKey === key);
      if (!code) break;
      out.events.push({
        kind: 'LANGUAGE_CHANGED',
        node: out.node,
        payload: { from: session.language, to: code, via: 'IVR_MENU' },
      });
      out.language = code;
      out.languageSource = 'IVR_MENU';
      out.node = 'MAIN';
      out.prefix.push(['languageSet'], ['welcome']);
      break;
    }
    case 'MAIN':
      if (key === '1') out.node = 'FARMER_MENU';
      else if (key === '2') out.node = 'ORDER_ENTRY';
      else if (key === '3') out.node = 'SUPPORT_MENU';
      else if (key === '9') out.node = 'LANGUAGE';
      break;
    case 'FARMER_MENU':
      if (key === '1' && caller.role === 'FARMER') {
        out.context.draft = {};
        out.node = 'LISTING_CROP';
      } else if (key === '0') out.node = 'MAIN';
      break;
    case 'LISTING_CROP': {
      if (key === '0') {
        out.node = 'FARMER_MENU';
        break;
      }
      const crop = IVR_CROPS.find((c) => c.ivrKey === key);
      if (crop) {
        draft.cropKey = crop.key;
        draft.unit = crop.defaultUnit;
        out.node = 'LISTING_UNIT';
      }
      break;
    }
    case 'LISTING_UNIT': {
      if (key === '0') {
        out.node = 'LISTING_CROP';
        break;
      }
      const unit = IVR_UNITS[Number(key) - 1];
      if (unit) {
        draft.unit = unit;
        out.node = 'LISTING_QTY';
      }
      break;
    }
    case 'LISTING_QTY':
    case 'LISTING_PRICE':
    case 'ORDER_ENTRY': {
      if (out.node === 'ORDER_ENTRY' && !caller.signedIn) {
        if (key === '0') out.node = 'MAIN';
        break;
      }
      if (back) {
        out.node =
          out.node === 'LISTING_QTY' ? 'LISTING_UNIT' : out.node === 'LISTING_PRICE' ? 'LISTING_QTY' : 'MAIN';
        break;
      }
      const spec = digitsSpec(out.node)!;
      const n = Number(digits);
      const validLength = out.node !== 'ORDER_ENTRY' || digits?.length === 6;
      if (!digits || !Number.isInteger(n) || n < spec.min || n > spec.max || !validLength) {
        out.prefix.push(
          out.node === 'ORDER_ENTRY'
            ? ['orderNotFound']
            : ['invalidNumber', { min: spec.min, max: spec.max }],
        );
        break;
      }
      if (out.node === 'LISTING_QTY') {
        draft.quantity = n;
        out.node = 'LISTING_PRICE';
      } else if (out.node === 'LISTING_PRICE') {
        draft.priceRupees = n;
        out.node = 'LISTING_REVIEW';
      } else {
        const orderNumber = `RB${digits}`;
        const result = await callTool('getOrderStatus', { orderNumber }, session, out);
        out.context.orderResult = result.ok
          ? {
              found: Boolean(result.data.found),
              orderNumber,
              status: result.data.status as string | undefined,
            }
          : { found: false, orderNumber };
        if (result.ok && result.data.found) {
          out.context.completedTasks = (out.context.completedTasks ?? 0) + 1;
          out.linked = { orderIds: [String(result.data.orderId)] };
        }
        out.node = 'ORDER_RESULT';
      }
      break;
    }
    case 'LISTING_REVIEW':
      if (key === '1') {
        // Explicit confirmation received; only now is the write requested.
        const result = await callTool(
          'createListingDraft',
          {
            cropKey: draft.cropKey,
            unit: draft.unit,
            quantity: draft.quantity,
            priceRupees: draft.priceRupees,
          },
          session,
          out,
        );
        if (result.ok) {
          out.context.result = { kind: 'DRAFT_SAVED', ref: String(result.data.ref) };
          out.context.completedTasks = (out.context.completedTasks ?? 0) + 1;
          out.linked = { listingIds: [String(result.data.listingId)] };
        } else {
          out.context.result = { kind: result.code === 'PROFILE_REQUIRED' ? 'PROFILE_REQUIRED' : 'FAILED' };
        }
        out.node = 'LISTING_RESULT';
      } else if (key === '2') {
        out.context.result = { kind: 'CANCELLED' };
        out.context.cancelledTasks = (out.context.cancelledTasks ?? 0) + 1;
        out.events.push({
          kind: 'INTERPRETATION',
          node: out.node,
          payload: { method: 'FLOW', meaning: 'CALLER_CANCELLED_NO_WRITE' },
        });
        out.node = 'LISTING_RESULT';
      }
      break;
    case 'LISTING_RESULT':
      if (key === '1' && out.context.result?.kind === 'FAILED') out.node = 'LISTING_REVIEW';
      else if (key === '0') out.node = 'MAIN';
      break;
    case 'ORDER_RESULT':
      if (key === '2') out.node = 'ORDER_ENTRY';
      else if (key === '0') out.node = 'MAIN';
      break;
    case 'SUPPORT_MENU':
      if (key === '1' && caller.signedIn) out.node = 'SUPPORT_CONFIRM';
      else if (key === '0') out.node = 'MAIN';
      break;
    case 'SUPPORT_CONFIRM':
      if (key === '1') {
        const result = await callTool('createSupportCallback', {}, session, out);
        if (result.ok) {
          out.context.supportResult = { ref: String(result.data.ref) };
          out.context.completedTasks = (out.context.completedTasks ?? 0) + 1;
          out.linked = { ticketIds: [String(result.data.ticketId)] };
          out.node = 'SUPPORT_RESULT';
        } else {
          out.context.result = { kind: 'FAILED' };
          out.prefix.push(['toolFailed']);
          out.node = 'SUPPORT_MENU';
        }
      } else if (key === '2') {
        out.context.cancelledTasks = (out.context.cancelledTasks ?? 0) + 1;
        out.prefix.push(['draftCancelled']);
        out.node = 'MAIN';
      }
      break;
    case 'SUPPORT_RESULT':
      if (key === '0') out.node = 'MAIN';
      break;
  }
  return out;
}

export async function handleInput(
  deps: AppDeps,
  callId: string,
  token: string | undefined,
  input: CallInput,
) {
  return withCallLock(callId, async () => {
    const session = await loadCallForCaller(callId, token);
    if (session.state !== 'ACTIVE') throw new AppError(409, 'CALL_ENDED', 'This call has already ended');

    let out: StepOutput;
    try {
      out = await step(deps, session, input);
    } catch (err) {
      logger.error({ err, callId }, 'IVR step failed');
      await appendEvents(callId, [
        { kind: 'ERROR', node: session.node, payload: { source: 'ENGINE', code: 'INTERNAL_ERROR' } },
      ]);
      await CallSession.updateOne({ callId }, { $set: { hasError: true, errorSummary: 'ENGINE_ERROR' } });
      throw err;
    }

    const caller = callerOf(session);
    const prompt = renderNode(out.node, out.language, out.context, caller, out.prefix);
    out.events.push(
      promptEvent(prompt, input.kind === 'REPEAT' ? { repeat: true, slow: !!out.slow } : undefined),
    );

    const update: Record<string, unknown> = {
      node: out.node,
      language: out.language,
      context: out.context,
      lastActivityAt: new Date(),
    };
    if (out.languageSource) update.languageSource = out.languageSource;
    if (out.events.some((e) => e.kind === 'ERROR')) {
      update.hasError = true;
      update.errorSummary = String(out.events.find((e) => e.kind === 'ERROR')?.payload?.code ?? 'ERROR');
    }
    const addToSet: Record<string, unknown> = {};
    if (out.linked?.listingIds) addToSet['linked.listingIds'] = { $each: out.linked.listingIds };
    if (out.linked?.orderIds) addToSet['linked.orderIds'] = { $each: out.linked.orderIds };
    if (out.linked?.ticketIds) addToSet['linked.ticketIds'] = { $each: out.linked.ticketIds };

    const saved = await CallSession.findOneAndUpdate(
      { callId, version: session.version, state: 'ACTIVE' },
      {
        $set: update,
        $inc: { version: 1 },
        ...(Object.keys(addToSet).length ? { $addToSet: addToSet } : {}),
      },
      { new: true },
    );
    if (!saved)
      throw Errors.conflict('REQUEST_IN_PROGRESS', 'Another input for this call is being processed');
    const events = await appendEvents(callId, out.events);
    return {
      callId,
      state: 'CONNECTED' as const,
      prompt,
      slow: !!out.slow,
      events: events.map(presentEvent),
    };
  });
}

function decideOutcome(ctx: IvrContext, reason: CallEndReason | 'IDLE_TIMEOUT'): CallOutcome {
  if (reason === 'INTERRUPTED') return 'INTERRUPTED';
  if (reason === 'IDLE_TIMEOUT') return 'ABANDONED';
  if ((ctx.completedTasks ?? 0) > 0) return 'COMPLETED';
  if ((ctx.cancelledTasks ?? 0) > 0) return 'CANCELLED';
  if ((ctx.errors ?? 0) > 0) return 'FAILED';
  return 'ABANDONED';
}

export function summarize(
  s: Pick<
    ICallSession,
    | 'callId'
    | 'correlationId'
    | 'dialedCode'
    | 'mode'
    | 'language'
    | 'outcome'
    | 'state'
    | 'startedAt'
    | 'endedAt'
    | 'eventCount'
    | 'linked'
    | 'hasError'
  >,
) {
  const end = s.endedAt ?? new Date();
  return {
    callId: s.callId,
    correlationId: s.correlationId,
    dialedCode: s.dialedCode,
    mode: s.mode,
    language: s.language,
    outcome: s.outcome,
    state: s.state,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
    durationSec: Math.max(0, Math.round((end.getTime() - s.startedAt.getTime()) / 1000)),
    eventCount: s.eventCount,
    linked: s.linked,
    hasError: s.hasError,
  };
}

export async function endCall(
  callId: string,
  token: string | undefined,
  reason: CallEndReason,
  requestId?: string,
) {
  return withCallLock(callId, async () => {
    const session = await loadCallForCaller(callId, token);
    if (session.state === 'ENDED') return summarize(session);
    const outcome = decideOutcome(session.context as IvrContext, reason);
    const lang = (session.language ?? 'en-IN') as LanguageCode;
    const events: PendingEvent[] = [];
    if (reason === 'HANGUP' && session.language) {
      events.push({
        kind: 'PROMPT',
        node: session.node,
        text: renderGoodbye(lang),
        payload: { goodbye: true },
      });
    }
    events.push({ kind: 'CALL_ENDED', node: session.node, payload: { reason, outcome } });
    const saved = await CallSession.findOneAndUpdate(
      { callId, state: 'ACTIVE' },
      {
        $set: {
          state: 'ENDED',
          outcome,
          endedAt: new Date(),
          ...(reason === 'INTERRUPTED' ? { hasError: true, errorSummary: 'INTERRUPTED' } : {}),
        },
        $inc: { version: 1 },
      },
      { new: true },
    );
    if (!saved) return summarize(session);
    const closing = await appendEvents(callId, events);
    await audit({
      category: 'BUSINESS',
      action: 'CALL_ENDED',
      outcome: 'SUCCESS',
      // The call is authorised by its call token; the linked user (if any) is in the session record.
      actor: null,
      resourceType: 'CallSession',
      resourceId: callId,
      correlationId: session.correlationId,
      requestId,
      details: { reason, outcome },
    });
    const fresh = await CallSession.findOne({ callId }).lean();
    return { ...summarize(fresh ?? saved), events: closing.map(presentEvent) };
  });
}

function renderGoodbye(lang: LanguageCode) {
  return renderNode('MAIN', lang, {}, { signedIn: false, role: null }, [['goodbye']]).lines[0] ?? '';
}

/** Mark calls with no activity past the idle timeout as abandoned. */
export async function sweepIdleCalls(timeoutMinutes: number): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);
  const stale = await CallSession.find(
    { state: 'ACTIVE', lastActivityAt: { $lt: cutoff } },
    { callId: 1, node: 1 },
  )
    .limit(100)
    .lean();
  for (const s of stale) {
    const res = await CallSession.updateOne(
      { callId: s.callId, state: 'ACTIVE' },
      { $set: { state: 'ENDED', outcome: 'ABANDONED', endedAt: new Date() }, $inc: { version: 1 } },
    );
    if (res.modifiedCount)
      await appendEvents(s.callId, [
        { kind: 'CALL_ENDED', node: s.node, payload: { reason: 'IDLE_TIMEOUT', outcome: 'ABANDONED' } },
      ]);
  }
  return stale.length;
}
