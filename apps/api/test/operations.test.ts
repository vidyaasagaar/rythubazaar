import { describe, expect, it } from 'vitest';
import { AuditLog, Listing, Order, Payout, ReturnRequest } from '../src/models';
import { checkout, createActiveListing, createAgent, loginAs, makeApp } from './helpers';

const { app } = makeApp();

async function placedOrder(qty = 2) {
  const farmer = await loginAs(app, 'FARMER');
  const listingId = await createActiveListing(farmer, { pricePerUnitPaise: 5000, quantityTotal: 10 });
  const customer = await loginAs(app, 'CUSTOMER');
  await customer.put('/api/cart/items').send({ listingId, quantity: qty }).expect(200);
  const order = (await checkout(customer).expect(201)).body.data.orders[0];
  return { farmer, customer, listingId, orderId: order.id as string };
}

describe('operations workflow', () => {
  it('runs PLACED → DELIVERED with history, stock and payout side effects', async () => {
    const { farmer, customer, listingId, orderId } = await placedOrder(2);
    const ops = await loginAs(app, 'OPERATIONS');
    const agent = await createAgent();

    await farmer.post(`/api/farmer/orders/${orderId}/transition`).send({ to: 'CONFIRMED' }).expect(200);
    await farmer
      .post(`/api/farmer/orders/${orderId}/transition`)
      .send({ to: 'READY_FOR_COLLECTION' })
      .expect(200);
    // Farmers cannot mark their own order collected.
    await farmer.post(`/api/farmer/orders/${orderId}/transition`).send({ to: 'COLLECTED' }).expect(403);

    // Collection requires an agent and verified metadata.
    const noAgent = await ops
      .post(`/api/admin/orders/${orderId}/collect`)
      .send({ quantitiesVerified: true, qualityGrade: 'A' })
      .expect(409);
    expect(noAgent.body.error.code).toBe('INVALID_TRANSITION');
    await ops.post(`/api/admin/orders/${orderId}/assign`).send({ agentId: agent._id.toString() }).expect(200);
    await ops
      .post(`/api/admin/orders/${orderId}/collect`)
      .send({ quantitiesVerified: false, qualityGrade: 'A' })
      .expect(400);
    await ops
      .post(`/api/admin/orders/${orderId}/collect`)
      .send({ quantitiesVerified: true, qualityGrade: 'A', weightKg: 2.1, notes: 'Good crates' })
      .expect(200);

    const listing = await Listing.findById(listingId).lean();
    expect(listing).toMatchObject({ quantityReserved: 0, quantitySold: 2 });
    const payout = await Payout.findOne({ orderId }).lean();
    expect(payout).toMatchObject({ status: 'PENDING', amountPaise: 10000, simulated: true });

    await ops.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'DISPATCHED' }).expect(200);
    await ops.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'DELIVERY_FAILED' }).expect(400); // reason required
    await ops
      .post(`/api/admin/orders/${orderId}/transition`)
      .send({ to: 'DELIVERY_FAILED', reason: 'Customer not home' })
      .expect(200);
    await ops.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'DISPATCHED' }).expect(200);
    await ops.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'DELIVERED' }).expect(200);
    await ops
      .post(`/api/admin/orders/${orderId}/transition`)
      .send({ to: 'CANCELLED', reason: 'late' })
      .expect(409);

    const detail = (await ops.get(`/api/admin/orders/${orderId}`).expect(200)).body.data;
    expect(detail.statusHistory.map((h: { to: string }) => h.to)).toEqual([
      'PLACED',
      'CONFIRMED',
      'READY_FOR_COLLECTION',
      'COLLECTED',
      'DISPATCHED',
      'DELIVERY_FAILED',
      'DISPATCHED',
      'DELIVERED',
    ]);
    for (const h of detail.statusHistory) {
      expect(h.at).toBeTruthy();
      expect(h.actorRole).toBeTruthy();
    }
    expect(detail.pickup).toMatchObject({ qualityGrade: 'A', quantitiesVerified: true, weightKg: 2.1 });
    expect(detail.assignmentHistory).toHaveLength(1);
    expect(detail.delivery.failedAttempts).toBe(1);

    const tracked = (await customer.get(`/api/orders/${orderId}`).expect(200)).body.data;
    expect(tracked.status).toBe('DELIVERED');
    expect(tracked.statusHistory[0].actorId).toBeUndefined(); // staff identities hidden from customers
    expect(await AuditLog.countDocuments({ action: 'ORDER_STATUS_CHANGED', resourceId: orderId })).toBe(7);
  });

  it('releases stock when ops cancel a ready order, and keeps it sold after collection', async () => {
    const { listingId, orderId } = await placedOrder(3);
    const ops = await loginAs(app, 'OPERATIONS');
    await ops.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'CONFIRMED' }).expect(200);
    await ops.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'CANCELLED' }).expect(400);
    await ops
      .post(`/api/admin/orders/${orderId}/transition`)
      .send({ to: 'CANCELLED', reason: 'Farmer unavailable' })
      .expect(200);
    expect((await Listing.findById(listingId).lean())!.quantityReserved).toBe(0);
  });

  it('lets support view but not change orders', async () => {
    const { orderId } = await placedOrder();
    const support = await loginAs(app, 'SUPPORT');
    const view = (await support.get(`/api/admin/orders/${orderId}`).expect(200)).body.data;
    expect(view.deliveryAddress.phone).toMatch(/\*/);
    expect(view.payout).toBeNull();
    await support.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'CONFIRMED' }).expect(403);
  });
});

describe('payouts', () => {
  async function collectedOrder() {
    const ctx = await placedOrder(2);
    const ops = await loginAs(app, 'OPERATIONS');
    const agent = await createAgent();
    await ops.post(`/api/admin/orders/${ctx.orderId}/transition`).send({ to: 'CONFIRMED' }).expect(200);
    await ops
      .post(`/api/admin/orders/${ctx.orderId}/transition`)
      .send({ to: 'READY_FOR_COLLECTION' })
      .expect(200);
    await ops
      .post(`/api/admin/orders/${ctx.orderId}/assign`)
      .send({ agentId: agent._id.toString() })
      .expect(200);
    await ops
      .post(`/api/admin/orders/${ctx.orderId}/collect`)
      .send({ quantitiesVerified: true, qualityGrade: 'B' })
      .expect(200);
    const payout = await Payout.findOne({ orderId: ctx.orderId }).lean();
    return { ...ctx, ops, payoutId: payout!._id.toString() };
  }

  it('only reaches SUCCEEDED through a provider-controlled result, and audits each step', async () => {
    const { payoutId, farmer } = await collectedOrder();
    const admin = await loginAs(app, 'ADMIN');
    // Cannot mark success before initiation.
    await admin
      .post(`/api/admin/payouts/${payoutId}/simulate-result`)
      .send({ outcome: 'SUCCEEDED' })
      .expect(409);
    const init = await admin.post(`/api/admin/payouts/${payoutId}/initiate`).expect(200);
    expect(init.body.data).toMatchObject({ status: 'INITIATED', simulated: true });
    expect(init.body.data.providerReference).toMatch(/^MOCKPAY-/);
    await admin.post(`/api/admin/payouts/${payoutId}/initiate`).expect(409);

    const rec = await admin.post(`/api/admin/payouts/${payoutId}/reconcile`).expect(200);
    expect(rec.body.data).toMatchObject({ changed: false, providerStatus: 'UNKNOWN' });

    await admin
      .post(`/api/admin/payouts/${payoutId}/simulate-result`)
      .send({ outcome: 'FAILED' })
      .expect(400);
    await admin
      .post(`/api/admin/payouts/${payoutId}/simulate-result`)
      .send({ outcome: 'FAILED', failureReason: 'Bank account closed' })
      .expect(200);
    const retry = await admin.post(`/api/admin/payouts/${payoutId}/initiate`).expect(200);
    expect(retry.body.data.attempts).toBe(2);
    const done = await admin
      .post(`/api/admin/payouts/${payoutId}/simulate-result`)
      .send({ outcome: 'SUCCEEDED' })
      .expect(200);
    expect(done.body.data.status).toBe('SUCCEEDED');
    expect(done.body.data.history.map((h: { to: string; source: string }) => `${h.to}:${h.source}`)).toEqual([
      'PENDING:SYSTEM',
      'INITIATED:USER',
      'FAILED:PROVIDER',
      'INITIATED:USER',
      'SUCCEEDED:PROVIDER',
    ]);
    const actions = (await AuditLog.find({ resourceId: payoutId }).sort({ at: 1 }).lean()).map(
      (a) => a.action,
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        'PAYOUT_CREATED',
        'PAYOUT_INITIATED',
        'PAYOUT_FAILED',
        'PAYOUT_RETRIED',
        'PAYOUT_SUCCEEDED',
      ]),
    );

    const mine = (await farmer.get('/api/farmer/payouts').expect(200)).body.data;
    expect(mine[0]).toMatchObject({ status: 'SUCCEEDED', amountPaise: 10000, simulated: true });
  });

  it('rejects unsigned provider webhooks so they cannot mark payouts paid', async () => {
    const { payoutId } = await collectedOrder();
    const admin = await loginAs(app, 'ADMIN');
    const ref = (await admin.post(`/api/admin/payouts/${payoutId}/initiate`).expect(200)).body.data
      .providerReference;
    const res = await admin.agent
      .post('/api/webhooks/payouts')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ reference: ref, status: 'SUCCEEDED' }))
      .expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect((await Payout.findById(payoutId).lean())!.status).toBe('INITIATED');
  });

  it('does not claw back payouts when a delivered order is returned and refunded', async () => {
    const { payoutId, ops, orderId, customer } = await collectedOrder();
    const admin = await loginAs(app, 'ADMIN');
    await admin.post(`/api/admin/payouts/${payoutId}/initiate`).expect(200);
    await admin
      .post(`/api/admin/payouts/${payoutId}/simulate-result`)
      .send({ outcome: 'SUCCEEDED' })
      .expect(200);
    await ops.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'DISPATCHED' }).expect(200);

    // Not yet delivered: return not allowed.
    const early = await customer.post('/api/returns').send({ orderId, reason: 'DAMAGED' }).expect(409);
    expect(early.body.error.code).toBe('RETURN_NOT_ALLOWED');
    await ops.post(`/api/admin/orders/${orderId}/transition`).send({ to: 'DELIVERED' }).expect(200);

    const ret = await customer
      .post('/api/returns')
      .send({ orderId, reason: 'DAMAGED', details: 'Crushed box' })
      .expect(201);
    await customer.post('/api/returns').send({ orderId, reason: 'DAMAGED' }).expect(409);
    const support = await loginAs(app, 'SUPPORT');
    await support
      .post(`/api/admin/returns/${ret.body.data.id}/review`)
      .send({ decision: 'APPROVED' })
      .expect(403);
    await ops
      .post(`/api/admin/returns/${ret.body.data.id}/review`)
      .send({ decision: 'APPROVED' })
      .expect(200);
    const refunded = await ops.post(`/api/admin/returns/${ret.body.data.id}/refund`).expect(200);
    expect(refunded.body.data.refund.mode).toBe('DEMO_NO_MONEY_MOVED');
    expect(refunded.body.data.payoutImpact).toBe('NONE_COMPANY_BEARS_RISK');

    const payout = await Payout.findById(payoutId).lean();
    expect(payout).toMatchObject({ status: 'SUCCEEDED', amountPaise: 10000 });
    expect((await ReturnRequest.findOne({ orderId }).lean())!.status).toBe('REFUNDED');
    expect((await Order.findById(orderId).lean())!.status).toBe('DELIVERED');
  });
});
