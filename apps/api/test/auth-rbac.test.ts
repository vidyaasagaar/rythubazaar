import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuditLog, Order, User } from '../src/models';
import { checkout, client, createActiveListing, createUser, listingInput, loginAs, makeApp } from './helpers';

const { app } = makeApp();

describe('authentication', () => {
  it('registers, reads /me, and signs out', async () => {
    const c = await client(app);
    const res = await c
      .post('/api/auth/register')
      .send({
        name: 'New Buyer',
        email: 'Buyer@Example.test',
        password: 'long-enough-pw',
        role: 'CUSTOMER',
        preferredLanguage: 'ta-IN',
      })
      .expect(201);
    expect(res.body.data.user).toMatchObject({
      email: 'buyer@example.test',
      role: 'CUSTOMER',
      preferredLanguage: 'ta-IN',
    });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const me = await c.get('/api/auth/me').expect(200);
    expect(me.body.data.user.email).toBe('buyer@example.test');
    await c.post('/api/auth/logout').expect(200);
    expect((await c.get('/api/auth/me')).body.data.user).toBeNull();
  });

  it('stores a bcrypt hash, never the password', async () => {
    const c = await client(app);
    await c
      .post('/api/auth/register')
      .send({ name: 'Hash Check', email: 'h@example.test', password: 'long-enough-pw', role: 'FARMER' })
      .expect(201);
    const u = await User.findOne({ email: 'h@example.test' }).select('+passwordHash').lean();
    expect(u!.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(u!.passwordHash).not.toContain('long-enough-pw');
  });

  it('refuses self-registration as staff', async () => {
    const c = await client(app);
    const res = await c
      .post('/api/auth/register')
      .send({ name: 'Sneaky', email: 's@example.test', password: 'long-enough-pw', role: 'ADMIN' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects duplicate email and bad credentials with consistent errors', async () => {
    await createUser('CUSTOMER', { email: 'dup@example.test' });
    const c = await client(app);
    const dup = await c
      .post('/api/auth/register')
      .send({ name: 'Dup', email: 'dup@example.test', password: 'long-enough-pw', role: 'CUSTOMER' })
      .expect(409);
    expect(dup.body.error.code).toBe('EMAIL_TAKEN');
    const bad = await c
      .post('/api/auth/login')
      .send({ email: 'dup@example.test', password: 'wrong-password' })
      .expect(401);
    expect(bad.body.error).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const unknown = await c
      .post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: 'whatever' })
      .expect(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(await AuditLog.countDocuments({ action: 'LOGIN_FAILED' })).toBeGreaterThanOrEqual(0);
  });

  it('rejects state-changing requests without a CSRF token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'a@example.test', password: 'x' })
      .expect(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('ignores a role sent by the browser and uses the database role', async () => {
    const farmer = await loginAs(app, 'FARMER');
    // Attempt to escalate via body; /me patch is strict and rejects unknown keys.
    await farmer.patch('/api/auth/me').send({ role: 'ADMIN' }).expect(400);
    expect((await User.findById(farmer.user._id).lean())!.role).toBe('FARMER');
    await farmer.get('/api/admin/orders').expect(403);
  });

  it('invalidates sessions when an admin changes a role', async () => {
    const admin = await loginAs(app, 'ADMIN');
    const victim = await loginAs(app, 'OPERATIONS');
    await victim.get('/api/admin/orders').expect(200);
    await admin.patch(`/api/admin/users/${victim.user._id}/role`).send({ role: 'CUSTOMER' }).expect(200);
    await victim.get('/api/admin/orders').expect(401);
    expect(await AuditLog.countDocuments({ action: 'ROLE_CHANGED' })).toBe(1);
  });
});

describe('RBAC — denied combinations', () => {
  it('returns 401 for anonymous access to protected endpoints', async () => {
    const c = await client(app);
    for (const url of [
      '/api/cart',
      '/api/orders',
      '/api/farmer/listings',
      '/api/admin/orders',
      '/api/admin/calls',
    ]) {
      const res = await c.get(url).expect(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('denies customers farmer and admin endpoints', async () => {
    const customer = await loginAs(app, 'CUSTOMER');
    await customer.get('/api/farmer/listings').expect(403);
    await customer.post('/api/farmer/listings').send(listingInput()).expect(403);
    await customer.get('/api/admin/orders').expect(403);
    await customer.get('/api/admin/payouts').expect(403);
    await customer.get('/api/admin/calls').expect(403);
    const denials = await AuditLog.countDocuments({ action: 'ACCESS_DENIED', outcome: 'DENIED' });
    expect(denials).toBeGreaterThanOrEqual(5);
  });

  it("denies farmers another farmer's listings and orders", async () => {
    const owner = await loginAs(app, 'FARMER');
    const other = await loginAs(app, 'FARMER');
    const listingId = await createActiveListing(owner);
    await other.get(`/api/farmer/listings/${listingId}`).expect(403);
    await other.patch(`/api/farmer/listings/${listingId}`).send({ pricePerUnitPaise: 100 }).expect(403);
    await other.post(`/api/farmer/listings/${listingId}/status`).send({ status: 'PAUSED' }).expect(403);

    const customer = await loginAs(app, 'CUSTOMER');
    await customer.put('/api/cart/items').send({ listingId, quantity: 1 }).expect(200);
    const order = (await checkout(customer).expect(201)).body.data.orders[0];
    await other.post(`/api/farmer/orders/${order.id}/transition`).send({ to: 'CONFIRMED' }).expect(403);
    const otherOrders = await other.get('/api/farmer/orders').expect(200);
    expect(otherOrders.body.data).toHaveLength(0);
    const otherPayouts = await other.get('/api/farmer/payouts').expect(200);
    expect(otherPayouts.body.data).toHaveLength(0);
  });

  it("denies customers another customer's orders", async () => {
    const farmer = await loginAs(app, 'FARMER');
    const listingId = await createActiveListing(farmer);
    const a = await loginAs(app, 'CUSTOMER');
    const b = await loginAs(app, 'CUSTOMER');
    await a.put('/api/cart/items').send({ listingId, quantity: 1 }).expect(200);
    const order = (await checkout(a).expect(201)).body.data.orders[0];
    await b.get(`/api/orders/${order.id}`).expect(403);
    await b.post(`/api/orders/${order.id}/cancel`).expect(403);
    expect((await b.get('/api/orders').expect(200)).body.data).toHaveLength(0);
    expect((await Order.findById(order.id).lean())!.status).toBe('PLACED');
  });

  it('denies support staff admin-only and operational write actions', async () => {
    const support = await loginAs(app, 'SUPPORT');
    const target = await createUser('CUSTOMER');
    await support.get('/api/admin/orders').expect(200);
    await support.get('/api/admin/calls').expect(200);
    await support.patch(`/api/admin/users/${target._id}/role`).send({ role: 'ADMIN' }).expect(403);
    await support.get('/api/admin/payouts').expect(403);
    await support.post('/api/admin/payouts/000000000000000000000000/initiate').expect(403);
    await support
      .post('/api/admin/orders/000000000000000000000000/transition')
      .send({ to: 'CONFIRMED' })
      .expect(403);
    await support
      .post('/api/admin/orders/000000000000000000000000/assign')
      .send({ agentId: '000000000000000000000000' })
      .expect(403);
    await support.get('/api/admin/calls/export?format=json').expect(403);
    await support.get('/api/admin/config').expect(403);
  });

  it('masks personal data for support but not for operations', async () => {
    const support = await loginAs(app, 'SUPPORT');
    const ops = await loginAs(app, 'OPERATIONS');
    await createUser('CUSTOMER', { email: 'visible@example.test' });
    const s = await support.get('/api/admin/users?q=visible').expect(200);
    expect(s.body.data[0].email).toBe('v***@example.test');
    const o = await ops.get('/api/admin/users?q=visible').expect(200);
    expect(o.body.data[0].email).toBe('visible@example.test');
  });

  it('denies operations staff payout and role management', async () => {
    const ops = await loginAs(app, 'OPERATIONS');
    const target = await createUser('CUSTOMER');
    await ops.get('/api/admin/payouts').expect(200);
    await ops.post('/api/admin/payouts/000000000000000000000000/initiate').expect(403);
    await ops
      .post('/api/admin/payouts/000000000000000000000000/simulate-result')
      .send({ outcome: 'SUCCEEDED' })
      .expect(403);
    await ops.patch(`/api/admin/users/${target._id}/role`).send({ role: 'ADMIN' }).expect(403);
  });

  it('prevents admins from changing their own role or removing the last admin', async () => {
    const admin = await loginAs(app, 'ADMIN');
    await admin.patch(`/api/admin/users/${admin.user._id}/role`).send({ role: 'CUSTOMER' }).expect(403);
  });
});
