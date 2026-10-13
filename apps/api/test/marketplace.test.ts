import { describe, expect, it } from 'vitest';
import { Listing, Order, StockMovement } from '../src/models';
import { address, checkout, client, createActiveListing, listingInput, loginAs, makeApp } from './helpers';

const { app } = makeApp();

describe('farmer listings', () => {
  it('creates drafts, keeps them private, then publishes, pauses and archives', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const created = await farmer.post('/api/farmer/listings').send(listingInput()).expect(201);
    const id = created.body.data.id;
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.location.district).toBe('Guntur');

    const anon = await client(app);
    await anon.get(`/api/listings/${id}`).expect(404);
    expect((await anon.get('/api/listings').expect(200)).body.data).toHaveLength(0);

    await farmer
      .patch(`/api/farmer/listings/${id}`)
      .send({ pricePerUnitPaise: 4500, quantityTotal: 20 })
      .expect(200);
    await farmer.post(`/api/farmer/listings/${id}/status`).send({ status: 'ACTIVE' }).expect(200);
    const pub = await anon.get(`/api/listings/${id}`).expect(200);
    expect(pub.body.data).toMatchObject({
      pricePerUnitPaise: 4500,
      quantityAvailable: 20,
      purchasable: true,
    });
    expect(pub.body.data.claim.basis).toBe('FARMER_REPORTED');

    await farmer.post(`/api/farmer/listings/${id}/status`).send({ status: 'PAUSED' }).expect(200);
    expect((await anon.get(`/api/listings/${id}`).expect(200)).body.data.purchasable).toBe(false);
    await farmer.post(`/api/farmer/listings/${id}/status`).send({ status: 'ARCHIVED' }).expect(200);
    const back = await farmer
      .post(`/api/farmer/listings/${id}/status`)
      .send({ status: 'ACTIVE' })
      .expect(409);
    expect(back.body.error.code).toBe('INVALID_TRANSITION');
    const hist = (await Listing.findById(id).lean())!.statusHistory.map((h) => h.to);
    expect(hist).toEqual(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']);
  });

  it('validates listing input on the server', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const res = await farmer
      .post('/api/farmer/listings')
      .send(listingInput({ pricePerUnitPaise: 5, unit: 'TONNE' }))
      .expect(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['pricePerUnitPaise', 'unit']));
    const cert = await farmer
      .post('/api/farmer/listings')
      .send(listingInput({ growingPractice: 'ORGANIC_CERTIFIED_CLAIMED' }))
      .expect(400);
    expect(cert.body.error.details[0].path).toBe('certification');
  });

  it('requires a farm profile before listing', async () => {
    const c = await client(app);
    await c
      .post('/api/auth/register')
      .send({ name: 'No Profile', email: 'np@example.test', password: 'long-enough-pw', role: 'FARMER' })
      .expect(201);
    const res = await c.post('/api/farmer/listings').send(listingInput()).expect(422);
    expect(res.body.error.code).toBe('PROFILE_REQUIRED');
  });

  it('never shows a certified claim as verified until staff verify it', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const ops = await loginAs(app, 'OPERATIONS');
    const id = await createActiveListing(farmer, {
      growingPractice: 'ORGANIC_CERTIFIED_CLAIMED',
      certification: { body: 'APOCA', certificateNumber: 'X-1', validUntil: '2030-01-01' },
    });
    const anon = await client(app);
    expect((await anon.get(`/api/listings/${id}`)).body.data.claim).toMatchObject({
      basis: 'FARMER_REPORTED',
      certificationStatus: 'PENDING_VERIFICATION',
    });
    await ops.post(`/api/admin/listings/${id}/certification`).send({ decision: 'VERIFIED' }).expect(200);
    expect((await anon.get(`/api/listings/${id}`)).body.data.claim).toMatchObject({
      basis: 'STAFF_VERIFIED_CERTIFICATE',
      body: 'APOCA',
    });
  });
});

describe('cart and checkout', () => {
  it('quotes fees separately on the server and places an order with an immutable snapshot', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const id = await createActiveListing(farmer, { pricePerUnitPaise: 4000, quantityTotal: 10 });
    const customer = await loginAs(app, 'CUSTOMER');
    await customer.put('/api/cart/items').send({ listingId: id, quantity: 3 }).expect(200);
    const cart = (await customer.get('/api/cart').expect(200)).body.data;
    expect(cart.shipments[0]).toMatchObject({
      subtotalPaise: 12000,
      deliveryFeePaise: 3000,
      serviceFeePaise: 240,
      discountPaise: 0,
      totalPaise: 15240,
      farmerPayoutPaise: 12000,
    });

    const res = await checkout(customer).expect(201);
    const order = await Order.findById(res.body.data.orders[0].id).lean();
    expect(order!.items[0]).toMatchObject({
      cropName: 'Tomato',
      unitPricePaise: 4000,
      quantity: 3,
      lineTotalPaise: 12000,
    });
    expect(order!.pricing.totalPaise).toBe(15240);
    expect(order!.payment).toEqual({ mode: 'DEMO_PAY_ON_DELIVERY', status: 'NOT_CHARGED_DEMO' });

    // Snapshot is unaffected by later price edits.
    await farmer.patch(`/api/farmer/listings/${id}`).send({ pricePerUnitPaise: 9900 }).expect(200);
    const after = await customer.get(`/api/orders/${order!._id}`).expect(200);
    expect(after.body.data.items[0].unitPricePaise).toBe(4000);

    const listing = await Listing.findById(id).lean();
    expect(listing!.quantityReserved).toBe(3);
    expect(await StockMovement.countDocuments({ type: 'RESERVE' })).toBe(1);
    expect((await customer.get('/api/cart')).body.data.lines).toHaveLength(0);
  });

  it('ignores browser totals and rejects a stale expected total', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const id = await createActiveListing(farmer);
    const customer = await loginAs(app, 'CUSTOMER');
    await customer.put('/api/cart/items').send({ listingId: id, quantity: 1 }).expect(200);
    const res = await customer
      .post('/api/checkout')
      .set('Idempotency-Key', 'stale-total-key-1')
      .send({ address, expectedTotalPaise: 1, paymentMode: 'DEMO_PAY_ON_DELIVERY' })
      .expect(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(await Order.countDocuments()).toBe(0);
    expect((await Listing.findById(id).lean())!.quantityReserved).toBe(0);
  });

  it('is idempotent: retrying with the same key returns the same orders', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const id = await createActiveListing(farmer);
    const customer = await loginAs(app, 'CUSTOMER');
    await customer.put('/api/cart/items').send({ listingId: id, quantity: 2 }).expect(200);
    const cart = (await customer.get('/api/cart')).body.data;
    const body = { address, expectedTotalPaise: cart.grandTotalPaise, paymentMode: 'DEMO_PAY_ON_DELIVERY' };
    const first = await customer
      .post('/api/checkout')
      .set('Idempotency-Key', 'same-key-12345')
      .send(body)
      .expect(201);
    const second = await customer
      .post('/api/checkout')
      .set('Idempotency-Key', 'same-key-12345')
      .send(body)
      .expect(201);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.data.orders[0].id).toBe(first.body.data.orders[0].id);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Listing.findById(id).lean())!.quantityReserved).toBe(2);

    const reused = await customer
      .post('/api/checkout')
      .set('Idempotency-Key', 'same-key-12345')
      .send({ ...body, expectedTotalPaise: 5 })
      .expect(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    await customer.post('/api/checkout').send(body).expect(400);
  });

  it('rejects insufficient stock when adding and at checkout', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const id = await createActiveListing(farmer, { quantityTotal: 2 });
    const customer = await loginAs(app, 'CUSTOMER');
    const add = await customer.put('/api/cart/items').send({ listingId: id, quantity: 5 }).expect(409);
    expect(add.body.error.code).toBe('INSUFFICIENT_STOCK');

    await customer.put('/api/cart/items').send({ listingId: id, quantity: 2 }).expect(200);
    await Listing.updateOne({ _id: id }, { $set: { quantityTotal: 1 } });
    const res = await checkout(customer).expect(409);
    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect(await Order.countDocuments()).toBe(0);
  });

  it('does not oversell when customers race for the last units', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const id = await createActiveListing(farmer, { quantityTotal: 3 });
    const buyers = await Promise.all([1, 2, 3, 4].map(() => loginAs(app, 'CUSTOMER')));
    for (const b of buyers) await b.put('/api/cart/items').send({ listingId: id, quantity: 2 }).expect(200);
    const results = await Promise.all(buyers.map((b) => checkout(b)));
    const succeeded = results.filter((r) => r.status === 201).length;
    expect(succeeded).toBe(1);
    for (const r of results.filter((x) => x.status !== 201))
      expect(['INSUFFICIENT_STOCK', 'LISTING_UNAVAILABLE']).toContain(r.body.error.code);
    const l = await Listing.findById(id).lean();
    expect(l!.quantityReserved).toBe(2);
    expect(l!.quantityReserved + l!.quantitySold).toBeLessThanOrEqual(l!.quantityTotal);
  });

  it('splits multi-farmer carts into separate shipments with their own fees', async () => {
    const f1 = await loginAs(app, 'FARMER');
    const f2 = await loginAs(app, 'FARMER');
    const a = await createActiveListing(f1, { pricePerUnitPaise: 1000 });
    const b = await createActiveListing(f2, { pricePerUnitPaise: 2000 });
    const customer = await loginAs(app, 'CUSTOMER');
    await customer.put('/api/cart/items').send({ listingId: a, quantity: 1 }).expect(200);
    await customer.put('/api/cart/items').send({ listingId: b, quantity: 1 }).expect(200);
    const res = await checkout(customer).expect(201);
    expect(res.body.data.orders).toHaveLength(2);
    expect(new Set(res.body.data.orders.map((o: { orderNumber: string }) => o.orderNumber)).size).toBe(2);
  });

  it('lets the customer cancel a PLACED order and releases stock', async () => {
    const farmer = await loginAs(app, 'FARMER');
    const id = await createActiveListing(farmer);
    const customer = await loginAs(app, 'CUSTOMER');
    await customer.put('/api/cart/items').send({ listingId: id, quantity: 4 }).expect(200);
    const order = (await checkout(customer).expect(201)).body.data.orders[0];
    await customer.post(`/api/orders/${order.id}/cancel`).expect(200);
    expect((await Listing.findById(id).lean())!.quantityReserved).toBe(0);
    await customer.post(`/api/orders/${order.id}/cancel`).expect(409);
  });

  it('filters and paginates the public market', async () => {
    const farmer = await loginAs(app, 'FARMER');
    for (let i = 0; i < 5; i++)
      await createActiveListing(farmer, { cropName: `Onion ${i}`, pricePerUnitPaise: 1000 + i * 100 });
    await createActiveListing(farmer, { cropName: 'Mango', category: 'FRUITS', pricePerUnitPaise: 9000 });
    const anon = await client(app);
    const page = await anon.get('/api/listings?pageSize=2&page=2&sort=price_asc').expect(200);
    expect(page.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 6, pages: 3 });
    expect(page.body.data[0].pricePerUnitPaise).toBe(1200);
    const fruit = await anon.get('/api/listings?category=FRUITS').expect(200);
    expect(fruit.body.data.map((l: { cropName: string }) => l.cropName)).toEqual(['Mango']);
    const search = await anon.get('/api/listings?q=oni&maxPricePaise=1100').expect(200);
    expect(search.body.meta.total).toBe(2);
    await anon.get('/api/listings?pageSize=1000').expect(400);
  });
});
