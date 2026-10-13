import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Role } from '@rythubazaar/shared';
import { loadEnv } from '../src/config/env';
import { createDeps } from '../src/context';
import { createApp } from '../src/app';
import { DeliveryAgent, FarmerProfile, User } from '../src/models';

export const TEST_PASSWORD = 'test-password-123';

export function makeApp(overrides: Record<string, string> = {}) {
  const env = loadEnv({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:1/unused-app-uses-shared-connection',
    JWT_SECRET: 'test-only-jwt-secret-value-that-is-long-enough',
    RATE_LIMIT_ENABLED: 'false',
    LOG_LEVEL: 'silent',
    UPLOAD_DIR: '.data/test-uploads',
    ...overrides,
  });
  const deps = createDeps(env);
  return { app: createApp(deps), deps };
}

/** A supertest agent that keeps cookies and sends the CSRF header automatically. */
export async function client(app: ReturnType<typeof makeApp>['app']) {
  const agent = request.agent(app);
  const res = await agent.get('/api/auth/csrf').expect(200);
  const token = res.body.data.csrfToken as string;
  const wrap = (method: 'post' | 'put' | 'patch' | 'delete') => (url: string) =>
    agent[method](url).set('X-CSRF-Token', token);
  return {
    agent,
    csrf: token,
    get: (url: string) => agent.get(url),
    post: wrap('post'),
    put: wrap('put'),
    patch: wrap('patch'),
    delete: wrap('delete'),
  };
}

export type Client = Awaited<ReturnType<typeof client>>;

let counter = 0;
export async function createUser(role: Role, extra: { email?: string; name?: string } = {}) {
  counter += 1;
  const email = extra.email ?? `${role.toLowerCase()}${counter}@example.test`;
  const user = await User.create({
    name: extra.name ?? `${role} User ${counter}`,
    email,
    phone: `98765${String(10000 + counter).slice(-5)}`,
    passwordHash: await bcrypt.hash(TEST_PASSWORD, 4),
    role,
    preferredLanguage: 'en-IN',
  });
  if (role === 'FARMER') {
    await FarmerProfile.create({
      userId: user._id,
      farmName: `Farm ${counter}`,
      village: 'Kollur',
      district: 'Guntur',
      state: 'Andhra Pradesh',
      pincode: '522324',
    });
  }
  return user;
}

export async function loginAs(
  app: ReturnType<typeof makeApp>['app'],
  role: Role,
  extra: { email?: string } = {},
) {
  const user = await createUser(role, extra);
  const c = await client(app);
  await c.post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(200);
  // The CSRF cookie is rotated on login; refresh the header value.
  const fresh = await c.agent.get('/api/auth/csrf');
  const token = fresh.body.data.csrfToken as string;
  const wrap = (method: 'post' | 'put' | 'patch' | 'delete') => (url: string) =>
    c.agent[method](url).set('X-CSRF-Token', token);
  return {
    ...c,
    csrf: token,
    post: wrap('post'),
    put: wrap('put'),
    patch: wrap('patch'),
    delete: wrap('delete'),
    user,
  };
}

export const listingInput = (over: Record<string, unknown> = {}) => ({
  cropName: 'Tomato',
  category: 'VEGETABLES',
  description: 'Fresh tomatoes',
  unit: 'KG',
  pricePerUnitPaise: 4000,
  quantityTotal: 10,
  growingPractice: 'CONVENTIONAL',
  ...over,
});

export async function createActiveListing(farmer: Client, over: Record<string, unknown> = {}) {
  const created = await farmer.post('/api/farmer/listings').send(listingInput(over)).expect(201);
  const id = created.body.data.id as string;
  await farmer.post(`/api/farmer/listings/${id}/status`).send({ status: 'ACTIVE' }).expect(200);
  return id;
}

export const address = {
  recipientName: 'Lakshmi Devi',
  phone: '9876543210',
  line1: '12-3 Gandhi Road, near temple',
  locality: 'Vijayawada',
  district: 'Krishna',
  state: 'Andhra Pradesh',
  pincode: '520001',
};

/** Give an async supertest flow a supertest-like `.expect(status)` that reports the body on mismatch. */
export function withExpect(p: Promise<request.Response>) {
  return Object.assign(p, {
    expect: (status: number) =>
      p.then((res) => {
        if (res.status !== status)
          throw new Error(`Expected ${status}, got ${res.status}: ${JSON.stringify(res.body)}`);
        return res;
      }),
  });
}

export function checkout(customer: Client, key = `key-${Date.now()}-${Math.random().toString(36).slice(2)}`) {
  return withExpect(
    (async () => {
      const cart = await customer.get('/api/cart').expect(200);
      return customer.post('/api/checkout').set('Idempotency-Key', key).send({
        address,
        expectedTotalPaise: cart.body.data.grandTotalPaise,
        paymentMode: 'DEMO_PAY_ON_DELIVERY',
      });
    })(),
  );
}

export async function createAgent() {
  return DeliveryAgent.create({ name: 'Kiran', phone: '9000000101', zone: 'Guntur' });
}
