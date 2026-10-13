import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { inject } from 'vitest';
import { loadEnv } from '../src/config/env';
import { connectDb } from '../src/lib/db';
import { client, makeApp } from './helpers';

const { app } = makeApp();

describe('environment validation', () => {
  it('fails fast with actionable messages', () => {
    expect(() => loadEnv({})).toThrow(/MONGODB_URI is required/);
    expect(() => loadEnv({ MONGODB_URI: 'http://x', JWT_SECRET: 'short' })).toThrow(
      /must start with mongodb[\s\S]*at least 32/,
    );
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb://h/db',
        JWT_SECRET: 'replace-with-a-long-random-secret-of-at-least-32-chars',
      }),
    ).toThrow(/Placeholder JWT_SECRET/);
    expect(() =>
      loadEnv({
        MONGODB_URI: 'mongodb://h/db',
        JWT_SECRET: 'x'.repeat(40),
        EXTRA_DEMO_ROUTES: '777:UNKNOWN',
      }),
    ).toThrow(/Invalid EXTRA_DEMO_ROUTES/);
    const env = loadEnv({
      MONGODB_URI: 'mongodb://h/db',
      JWT_SECRET: 'x'.repeat(40),
      EXTRA_DEMO_ROUTES: '777:RYTHUBAZAAR_DEMO_IVR',
    });
    expect(env.demoRoutes).toEqual({ '12908': 'RYTHUBAZAAR_DEMO_IVR', '777': 'RYTHUBAZAAR_DEMO_IVR' });
  });
});

describe('safe failures', () => {
  it('rejects malformed JSON and oversized bodies with the standard envelope', async () => {
    const c = await client(app);
    const bad = await c
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
    const big = await c
      .post('/api/auth/login')
      .send({ email: 'a@b.test', password: 'x'.repeat(200_000) })
      .expect(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    const missing = await c.get('/api/does-not-exist').expect(404);
    expect(missing.body.error).toMatchObject({ code: 'NOT_FOUND' });
    expect(missing.body.error.requestId).toBeTruthy();
  });

  it('reports MongoDB outages as 503 without false success, while health stays up', async () => {
    const c = await client(app);
    await mongoose.disconnect();
    try {
      await request(app).get('/api/health').expect(200);
      const ready = await request(app).get('/api/ready').expect(503);
      expect(ready.body.data.database).toBe('unavailable');
      const res = await c.post('/api/calls').send({ dialedCode: '12908' }).expect(503);
      expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
      const listings = await c.get('/api/listings').expect(503);
      expect(listings.body.error.message).toMatch(/No changes were made/);
    } finally {
      await connectDb(inject('mongoUri'));
    }
    await request(app).get('/api/ready').expect(200);
  });

  it('rejects uploads that are not real images', async () => {
    const { loginAs } = await import('./helpers');
    const farmer = await loginAs(app, 'FARMER');
    const res = await farmer
      .post('/api/uploads/image')
      .attach('file', Buffer.from('<svg onload=alert(1)>'), { filename: 'x.png', contentType: 'image/png' })
      .expect(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_FILE');
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const ok = await farmer
      .post('/api/uploads/image')
      .attach('file', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(201);
    expect(ok.body.data.path).toMatch(/^\/uploads\/[a-f0-9]{24}\.png$/);
    const customer = await loginAs(app, 'CUSTOMER');
    await customer.post('/api/uploads/image').attach('file', png, { filename: 'p.png' }).expect(403);
  });
});
