import { describe, expect, it } from 'vitest';
import { LANGUAGES, LANGUAGE_CODES, IVR_PROMPTS, interpolate } from '@rythubazaar/shared';
import { AuditLog, CallEvent, CallSession, Listing, SupportTicket } from '../src/models';
import { client, loginAs, makeApp, type Client } from './helpers';

const { app } = makeApp();

function dial(c: Client, body: Record<string, unknown> = { dialedCode: '12908' }) {
  return c.post('/api/calls').send(body);
}

function caller(c: Client, callId: string, token: string) {
  return {
    input: (body: Record<string, unknown>) =>
      c.post(`/api/calls/${callId}/input`).set('X-Call-Token', token).send(body),
    end: (reason = 'HANGUP') =>
      c.post(`/api/calls/${callId}/end`).set('X-Call-Token', token).send({ reason }),
  };
}

describe('demo IVR routing', () => {
  it('reports unknown numbers as not available and logs the attempt', async () => {
    const c = await client(app);
    const res = await dial(c, { dialedCode: '55555' }).expect(404);
    expect(res.body.error.code).toBe('NUMBER_NOT_AVAILABLE');
    const session = await CallSession.findOne({ callId: res.body.error.details.callId }).lean();
    expect(session).toMatchObject({ outcome: 'NOT_AVAILABLE', state: 'ENDED', dialedCode: '55555' });
    expect(await CallEvent.countDocuments({ callId: session!.callId, kind: 'DIAL_FAILED' })).toBe(1);
  });

  it('routes the configured dial code (from env, not hard-coded) to the demo IVR', async () => {
    const custom = makeApp({ DEMO_DIAL_CODE: '4321' }).app;
    const c = await client(custom);
    await dial(c, { dialedCode: '12908' }).expect(404);
    const ok = await dial(c, { dialedCode: '4321' }).expect(201);
    expect(ok.body.data).toMatchObject({ mode: 'DEMO', state: 'CONNECTED' });
    const cfg = await c.get('/api/config').expect(200);
    expect(cfg.body.data).toMatchObject({
      demoDialCodes: ['4321'],
      telephonyMode: 'DEMO',
      placesRealCalls: false,
    });
  });

  it('validates the dialed digits', async () => {
    const c = await client(app);
    await dial(c, { dialedCode: '12a08' }).expect(400);
  });
});

describe('language selection', () => {
  it('offers all six languages and switches the journey into each one', async () => {
    for (const code of LANGUAGE_CODES) {
      const c = await client(app);
      const start = (await dial(c).expect(201)).body.data;
      expect(start.prompt.node).toBe('LANGUAGE');
      expect(start.prompt.options).toHaveLength(6);
      const call = caller(c, start.callId, start.callToken);
      const res = (await call.input({ kind: 'DTMF', value: LANGUAGES[code].ivrKey }).expect(200)).body.data;
      expect(res.prompt).toMatchObject({ node: 'MAIN', language: code });
      expect(res.prompt.text).toContain(IVR_PROMPTS[code].languageSet);
      expect(res.prompt.text).toContain(
        interpolate(IVR_PROMPTS[code].pressKey, { label: IVR_PROMPTS[code]['opt.farmer'], key: '1' }),
      );
      const session = await CallSession.findOne({ callId: start.callId }).lean();
      expect(session).toMatchObject({ language: code, languageSource: 'IVR_MENU' });
    }
  });

  it('can start in a preselected language and change it mid-call', async () => {
    const c = await client(app);
    const start = (await dial(c, { dialedCode: '12908', language: 'hi-IN' }).expect(201)).body.data;
    expect(start.prompt).toMatchObject({ node: 'MAIN', language: 'hi-IN' });
    const call = caller(c, start.callId, start.callToken);
    const res = (await call.input({ kind: 'LANGUAGE', value: 'ta-IN' }).expect(200)).body.data;
    expect(res.prompt.language).toBe('ta-IN');
    expect(await CallEvent.countDocuments({ callId: start.callId, kind: 'LANGUAGE_CHANGED' })).toBe(1);
  });
});

describe('farmer listing journey by phone', () => {
  async function farmerToReview() {
    const farmer = await loginAs(app, 'FARMER');
    const start = (await dial(farmer, { dialedCode: '12908', language: 'te-IN' }).expect(201)).body.data;
    const call = caller(farmer, start.callId, start.callToken);
    await call.input({ kind: 'DTMF', value: '1' }).expect(200); // farmer services
    await call.input({ kind: 'DTMF', value: '1' }).expect(200); // new draft
    await call.input({ kind: 'DTMF', value: '1' }).expect(200); // tomato
    await call.input({ kind: 'DTMF', value: '1' }).expect(200); // kg
    const bad = (await call.input({ kind: 'DTMF', value: '0#' }).expect(200)).body.data;
    expect(bad.prompt.node).toBe('LISTING_QTY'); // 0 is out of range: re-prompted
    // Number entry offers no menu keys: every digit (including 0) is input; * goes back.
    expect(bad.prompt.inputMode).toBe('DIGITS');
    expect(bad.prompt.options).toEqual([]);
    await call.input({ kind: 'DTMF', value: '50#' }).expect(200);
    const review = (await call.input({ kind: 'DTMF', value: '30#' }).expect(200)).body.data;
    return { farmer, start, call, review };
  }

  it('reviews interpreted details and saves a DRAFT only after explicit confirmation', async () => {
    const { farmer, start, call, review } = await farmerToReview();
    expect(review.prompt.node).toBe('LISTING_REVIEW');
    expect(review.prompt.text).toContain('టమాటా');
    expect(review.prompt.text).toContain('50');
    expect(await Listing.countDocuments()).toBe(0); // nothing written before confirmation

    const saved = (await call.input({ kind: 'DTMF', value: '1' }).expect(200)).body.data;
    expect(saved.prompt.node).toBe('LISTING_RESULT');
    const listing = await Listing.findOne().lean();
    expect(listing).toMatchObject({
      cropName: 'Tomato',
      unit: 'KG',
      quantityTotal: 50,
      pricePerUnitPaise: 3000,
      status: 'DRAFT',
      source: 'CALL',
      sourceCallId: start.callId,
    });
    expect(listing!.farmerId.toString()).toBe(farmer.user._id.toString());

    const kinds = (await CallEvent.find({ callId: start.callId }).sort({ seq: 1 }).lean()).map((e) => e.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'CALL_STARTED',
        'PROMPT',
        'KEYPAD',
        'INTERPRETATION',
        'TOOL_REQUEST',
        'TOOL_RESULT',
        'BUSINESS_EVENT',
      ]),
    );
    // Business event is recorded after the tool result.
    expect(kinds.indexOf('BUSINESS_EVENT')).toBeGreaterThan(kinds.indexOf('TOOL_RESULT'));

    const summary = (await call.end().expect(200)).body.data;
    expect(summary.events.map((e: { kind: string }) => e.kind)).toEqual(['PROMPT', 'CALL_ENDED']);
    expect(summary).toMatchObject({ callId: start.callId, outcome: 'COMPLETED', state: 'ENDED' });
    expect(summary.linked.listingIds).toEqual([listing!._id.toString()]);
    await call.input({ kind: 'DTMF', value: '1' }).expect(409);
  });

  it('writes nothing when the caller cancels at review', async () => {
    const { call, start } = await farmerToReview();
    const res = (await call.input({ kind: 'DTMF', value: '2' }).expect(200)).body.data;
    expect(res.prompt.node).toBe('LISTING_RESULT');
    expect(await Listing.countDocuments()).toBe(0);
    expect(await CallEvent.countDocuments({ callId: start.callId, kind: 'TOOL_REQUEST' })).toBe(0);
    expect((await call.end().expect(200)).body.data.outcome).toBe('CANCELLED');
  });

  it('accepts speech/typed input through the rules interpreter', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const start = (await dial(farmer, { dialedCode: '12908', language: 'en-IN' }).expect(201)).body.data;
    const call = caller(farmer, start.callId, start.callToken);
    const r1 = (await call.input({ kind: 'SPEECH', value: 'Farmer services please' }).expect(200)).body.data;
    expect(r1.prompt.node).toBe('FARMER_MENU');
    const interp = await CallEvent.findOne({ callId: start.callId, kind: 'INTERPRETATION' })
      .sort({ seq: -1 })
      .lean();
    expect(interp!.payload).toMatchObject({ method: 'RULES_DEMO', resolvedKey: '1' });
    const r2 = (await call.input({ kind: 'SPEECH', value: 'gibberish words' }).expect(200)).body.data;
    expect(r2.prompt.node).toBe('FARMER_MENU');
    expect(r2.prompt.text).toContain('Please use the keypad');
  });

  it('tells guests that farmer services need a farmer account, and fails safely', async () => {
    const c = await client(app);
    const start = (await dial(c, { dialedCode: '12908', language: 'en-IN' }).expect(201)).body.data;
    const call = caller(c, start.callId, start.callToken);
    const res = (await call.input({ kind: 'DTMF', value: '1' }).expect(200)).body.data;
    expect(res.prompt.text).toContain('sign in as a farmer');
    const again = (await call.input({ kind: 'DTMF', value: '1' }).expect(200)).body.data;
    expect(again.prompt.text).toContain('not a valid choice');
    expect(await Listing.countDocuments()).toBe(0);
  });
});

describe('order status and support by phone', () => {
  it('only reveals the caller’s own orders', async () => {
    const customer = await loginAs(app, 'CUSTOMER');
    const start = (await dial(customer, { dialedCode: '12908', language: 'en-IN' }).expect(201)).body.data;
    const call = caller(customer, start.callId, start.callToken);
    await call.input({ kind: 'DTMF', value: '2' }).expect(200);
    const res = (await call.input({ kind: 'DTMF', value: '123456#' }).expect(200)).body.data;
    expect(res.prompt.node).toBe('ORDER_RESULT');
    expect(res.prompt.text).toContain('could not find');
  });

  it('creates a support callback only after confirmation', async () => {
    const customer = await loginAs(app, 'CUSTOMER');
    const start = (await dial(customer, { dialedCode: '12908', language: 'kn-IN' }).expect(201)).body.data;
    const call = caller(customer, start.callId, start.callToken);
    await call.input({ kind: 'DTMF', value: '3' }).expect(200);
    await call.input({ kind: 'DTMF', value: '1' }).expect(200);
    expect(await SupportTicket.countDocuments()).toBe(0);
    const done = (await call.input({ kind: 'DTMF', value: '1' }).expect(200)).body.data;
    expect(done.prompt.node).toBe('SUPPORT_RESULT');
    const ticket = await SupportTicket.findOne().lean();
    expect(ticket).toMatchObject({ channel: 'CALL', callId: start.callId });
  });
});

describe('call safety and audit center', () => {
  it('rejects input without the call token', async () => {
    const c = await client(app);
    const start = (await dial(c).expect(201)).body.data;
    await c.post(`/api/calls/${start.callId}/input`).send({ kind: 'DTMF', value: '1' }).expect(404);
    await c
      .post(`/api/calls/${start.callId}/input`)
      .set('X-Call-Token', 'wrong')
      .send({ kind: 'DTMF', value: '1' })
      .expect(404);
  });

  it('records interrupted calls with a safe outcome', async () => {
    const c = await client(app);
    const start = (await dial(c, { dialedCode: '12908', language: 'ml-IN' }).expect(201)).body.data;
    const res = await caller(c, start.callId, start.callToken).end('INTERRUPTED').expect(200);
    expect(res.body.data.outcome).toBe('INTERRUPTED');
    expect((await CallSession.findOne({ callId: start.callId }).lean())!.hasError).toBe(true);
  });

  it('lets staff search, inspect the timeline, and export redacted data — and audits the export', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const start = (await dial(farmer, { dialedCode: '12908', language: 'en-IN' }).expect(201)).body.data;
    const call = caller(farmer, start.callId, start.callToken);
    await call
      .input({ kind: 'SPEECH', value: 'my number is 9876543210 and mail me at ravi@example.test' })
      .expect(200);
    await call.end().expect(200);

    const support = await loginAs(app, 'SUPPORT');
    const list = await support.get('/api/admin/calls?language=en-IN&dialedCode=12908').expect(200);
    expect(list.body.data.map((s: { callId: string }) => s.callId)).toContain(start.callId);
    const detail = (await support.get(`/api/admin/calls/${start.callId}`).expect(200)).body.data;
    const speech = detail.events.find((e: { kind: string }) => e.kind === 'SPEECH');
    expect(speech.text).not.toContain('9876543210');
    expect(speech.text).not.toContain('ravi@example.test');
    expect(detail.auditTrail.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['CALL_STARTED', 'CALL_ENDED']),
    );

    const ops = await loginAs(app, 'OPERATIONS');
    const json = await ops.get(`/api/admin/calls/export?format=json&callId=${start.callId}`).expect(200);
    const parsed = JSON.parse(json.text);
    expect(parsed.meta.redacted).toBe(true);
    expect(parsed.calls[0].session.callId).toBe(start.callId);
    expect(json.text).not.toContain('9876543210');
    const csv = await ops.get(`/api/admin/calls/export?format=csv&callId=${start.callId}`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\r\n')[0]).toContain('"lane"');
    const md = await ops.get(`/api/admin/calls/export?format=md&callId=${start.callId}`).expect(200);
    expect(md.text).toContain('# RythuBazaar call audit export');
    expect(await AuditLog.countDocuments({ action: 'CALL_AUDIT_EXPORTED' })).toBe(3);

    const auditCsv = await ops.get('/api/admin/audit/export?format=csv').expect(200);
    expect(auditCsv.text).toContain('CALL_AUDIT_EXPORTED');
  });

  it('keeps the audit log append-only', async () => {
    await AuditLog.create({ category: 'BUSINESS', action: 'X', outcome: 'SUCCESS', actorType: 'SYSTEM' });
    await expect(AuditLog.updateOne({ action: 'X' }, { $set: { action: 'Y' } })).rejects.toThrow(
      /append-only/,
    );
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
