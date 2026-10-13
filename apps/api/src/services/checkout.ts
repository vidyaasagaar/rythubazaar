import { createHash, randomInt, randomUUID } from 'node:crypto';
import { Types, type ClientSession } from 'mongoose';
import { priceShipment, type CheckoutInput, type FeeConfig } from '@rythubazaar/shared';
import {
  Cart,
  FarmerProfile,
  IdempotencyRecord,
  Listing,
  Order,
  StockMovement,
  availableQuantity,
  type IListing,
  type IOrder,
} from '../models';
import { AppError, Errors } from '../lib/errors';
import { runInTransaction } from '../lib/db';
import { audit } from './audit';
import { isExpired } from './listings';
import type { AuthUser } from '../types/express';
import type { Notifier } from '../adapters/notifications';

export type CartIssue = 'UNAVAILABLE' | 'INSUFFICIENT_STOCK';

export interface CartLine {
  listingId: string;
  quantity: number;
  cropName: string;
  unit: IListing['unit'];
  unitPricePaise: number;
  lineTotalPaise: number;
  quantityAvailable: number;
  farmerId: string;
  photo: string | null;
  issue: CartIssue | null;
}

export interface Shipment {
  farmerId: string;
  farmName: string;
  lines: CartLine[];
  subtotalPaise: number;
  deliveryFeePaise: number;
  serviceFeePaise: number;
  discountPaise: number;
  totalPaise: number;
  farmerPayoutPaise: number;
}

export interface CartQuote {
  lines: CartLine[];
  shipments: Shipment[];
  grandTotalPaise: number;
  hasIssues: boolean;
  currency: 'INR';
}

/** Price the cart on the server from current listing data. Browser totals are never trusted. */
export async function quoteCart(userId: Types.ObjectId, fees: FeeConfig): Promise<CartQuote> {
  const cart = await Cart.findOne({ userId }).lean();
  const items = cart?.items ?? [];
  const listings = await Listing.find({ _id: { $in: items.map((i) => i.listingId) } }).lean();
  const byId = new Map(listings.map((l) => [l._id.toString(), l]));

  const lines: CartLine[] = items.flatMap((item) => {
    const l = byId.get(item.listingId.toString());
    if (!l) return [];
    const available = availableQuantity(l);
    const purchasable = l.status === 'ACTIVE' && !isExpired(l) && available > 0;
    return [
      {
        listingId: l._id.toString(),
        quantity: item.quantity,
        cropName: l.cropName,
        unit: l.unit,
        unitPricePaise: l.pricePerUnitPaise,
        lineTotalPaise: l.pricePerUnitPaise * item.quantity,
        quantityAvailable: purchasable ? available : 0,
        farmerId: l.farmerId.toString(),
        photo: l.photos[0] ?? null,
        issue: !purchasable ? 'UNAVAILABLE' : item.quantity > available ? 'INSUFFICIENT_STOCK' : null,
      },
    ];
  });

  const farmerIds = [...new Set(lines.map((l) => l.farmerId))];
  const profiles = await FarmerProfile.find(
    { userId: { $in: farmerIds.map((id) => new Types.ObjectId(id)) } },
    { userId: 1, farmName: 1, village: 1 },
  ).lean();
  const farmName = new Map(profiles.map((p) => [p.userId.toString(), p.farmName || `${p.village} farm`]));

  const shipments: Shipment[] = farmerIds.map((farmerId) => {
    const shipmentLines = lines.filter((l) => l.farmerId === farmerId);
    const valid = shipmentLines.filter((l) => !l.issue);
    // A shipment with no purchasable lines carries no fees at all.
    const priced = valid.length
      ? priceShipment(
          valid.map((l) => ({ unitPricePaise: l.unitPricePaise, quantity: l.quantity })),
          fees,
        )
      : {
          subtotalPaise: 0,
          deliveryFeePaise: 0,
          serviceFeePaise: 0,
          discountPaise: 0,
          totalPaise: 0,
          farmerPayoutPaise: 0,
        };
    return { farmerId, farmName: farmName.get(farmerId) ?? 'Farm', lines: shipmentLines, ...priced };
  });
  return {
    lines,
    shipments,
    grandTotalPaise: shipments.reduce((sum, s) => sum + s.totalPaise, 0),
    hasIssues: lines.some((l) => l.issue),
    currency: 'INR',
  };
}

async function newOrderNumber(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `RB${randomInt(100000, 1000000)}`;
    if (!(await Order.exists({ orderNumber: candidate }))) return candidate;
  }
  throw new AppError(500, 'INTERNAL_ERROR', 'Could not allocate an order number');
}

function hashRequest(input: CheckoutInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export interface CheckoutResult {
  status: number;
  body: { data: { checkoutGroupId: string; orders: ReturnType<typeof summarizeOrder>[] } };
  replayed: boolean;
}

export function summarizeOrder(o: IOrder) {
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    farmName: o.farmName,
    status: o.status,
    pricing: o.pricing,
    itemCount: o.items.length,
    createdAt: o.createdAt,
  };
}

/**
 * Place an order. Idempotent per (customer, Idempotency-Key): a retried request with the same
 * key returns the original result instead of creating duplicates.
 */
export async function placeOrder(
  actor: AuthUser,
  input: CheckoutInput,
  idempotencyKey: string | undefined,
  deps: { fees: FeeConfig; notifier: Notifier; correlationId: string },
): Promise<CheckoutResult> {
  if (!idempotencyKey || !/^[\w-]{8,100}$/.test(idempotencyKey)) {
    throw new AppError(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'An Idempotency-Key header (8–100 chars) is required',
    );
  }
  const requestHash = hashRequest(input);

  // Claim the key. The unique index makes concurrent duplicates fail here.
  try {
    await IdempotencyRecord.create({
      userId: actor._id,
      scope: 'checkout',
      key: idempotencyKey,
      requestHash,
      status: 'IN_PROGRESS',
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
    const existing = await IdempotencyRecord.findOne({
      userId: actor._id,
      scope: 'checkout',
      key: idempotencyKey,
    }).lean();
    if (!existing) throw Errors.conflict('REQUEST_IN_PROGRESS', 'Request is being processed');
    if (existing.requestHash !== requestHash) {
      throw Errors.unprocessable(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was used with a different request',
      );
    }
    if (existing.status === 'IN_PROGRESS') {
      throw Errors.conflict('REQUEST_IN_PROGRESS', 'The original request is still being processed');
    }
    return {
      status: existing.responseStatus ?? 201,
      body: existing.responseBody as CheckoutResult['body'],
      replayed: true,
    };
  }

  try {
    const result = await executeCheckout(actor, input, deps);
    await IdempotencyRecord.updateOne(
      { userId: actor._id, scope: 'checkout', key: idempotencyKey },
      { $set: { status: 'COMPLETED', responseStatus: 201, responseBody: result } },
    );
    return { status: 201, body: result, replayed: false };
  } catch (err) {
    // Release the key so the customer can retry after fixing the problem (e.g. stock changed).
    await IdempotencyRecord.deleteOne({ userId: actor._id, scope: 'checkout', key: idempotencyKey }).catch(
      () => undefined,
    );
    throw err;
  }
}

async function executeCheckout(
  actor: AuthUser,
  input: CheckoutInput,
  deps: { fees: FeeConfig; notifier: Notifier; correlationId: string },
): Promise<CheckoutResult['body']> {
  const quote = await quoteCart(actor._id, deps.fees);
  if (quote.lines.length === 0) throw Errors.unprocessable('CART_EMPTY', 'Your cart is empty');
  const unavailable = quote.lines.filter((l) => l.issue === 'UNAVAILABLE');
  if (unavailable.length) {
    throw Errors.conflict('LISTING_UNAVAILABLE', 'Some items are no longer available', {
      listingIds: unavailable.map((l) => l.listingId),
    });
  }
  const short = quote.lines.filter((l) => l.issue === 'INSUFFICIENT_STOCK');
  if (short.length) {
    throw Errors.conflict('INSUFFICIENT_STOCK', 'Not enough stock for some items', {
      items: short.map((l) => ({ listingId: l.listingId, available: l.quantityAvailable })),
    });
  }
  if (quote.grandTotalPaise !== input.expectedTotalPaise) {
    throw Errors.conflict('PRICE_CHANGED', 'The total changed since it was shown to you', {
      expectedTotalPaise: input.expectedTotalPaise,
      currentTotalPaise: quote.grandTotalPaise,
    });
  }

  const checkoutGroupId = randomUUID();
  const orderNumbers = await Promise.all(quote.shipments.map(() => newOrderNumber()));
  const reserved: { listingId: string; quantity: number }[] = [];

  const reserve = async (line: CartLine, session?: ClientSession) => {
    // Atomic, conditional reservation: only succeeds if the listing is still ACTIVE at the quoted
    // price and enough unreserved stock remains. Prevents overselling under concurrency.
    const res = await Listing.updateOne(
      {
        _id: new Types.ObjectId(line.listingId),
        status: 'ACTIVE',
        pricePerUnitPaise: line.unitPricePaise,
        $expr: {
          $gte: [
            { $subtract: ['$quantityTotal', { $add: ['$quantityReserved', '$quantitySold'] }] },
            line.quantity,
          ],
        },
      },
      { $inc: { quantityReserved: line.quantity } },
      session ? { session } : {},
    );
    if (res.modifiedCount !== 1) {
      throw Errors.conflict('INSUFFICIENT_STOCK', 'Stock or price changed while placing the order', {
        items: [{ listingId: line.listingId }],
      });
    }
  };

  try {
    const orders = await runInTransaction(async (session) => {
      const opts = session ? { session } : {};
      for (const line of quote.lines) {
        await reserve(line, session);
        if (!session) reserved.push({ listingId: line.listingId, quantity: line.quantity });
      }
      const now = new Date();
      const docs = quote.shipments.map((s, i) => ({
        orderNumber: orderNumbers[i],
        checkoutGroupId,
        customerId: actor._id,
        farmerId: new Types.ObjectId(s.farmerId),
        farmName: s.farmName,
        items: s.lines.map((l) => ({
          listingId: new Types.ObjectId(l.listingId),
          cropName: l.cropName,
          unit: l.unit,
          unitPricePaise: l.unitPricePaise,
          quantity: l.quantity,
          lineTotalPaise: l.lineTotalPaise,
        })),
        pricing: {
          subtotalPaise: s.subtotalPaise,
          deliveryFeePaise: s.deliveryFeePaise,
          serviceFeePaise: s.serviceFeePaise,
          discountPaise: s.discountPaise,
          totalPaise: s.totalPaise,
          farmerPayoutPaise: s.farmerPayoutPaise,
          currency: 'INR' as const,
        },
        deliveryAddress: input.address,
        payment: { mode: 'DEMO_PAY_ON_DELIVERY' as const, status: 'NOT_CHARGED_DEMO' as const },
        status: 'PLACED' as const,
        statusHistory: [
          { from: null, to: 'PLACED' as const, at: now, actorId: actor._id, actorRole: actor.role },
        ],
      }));
      const created = await Order.create(docs, { ...opts, ordered: true });
      await StockMovement.insertMany(
        created.flatMap((o) =>
          o.items.map((it) => ({
            listingId: it.listingId,
            orderId: o._id,
            type: 'RESERVE',
            quantity: it.quantity,
            actorId: actor._id,
            at: now,
          })),
        ),
        opts,
      );
      await Cart.updateOne({ userId: actor._id }, { $set: { items: [] } }, opts);
      for (const o of created) {
        await audit(
          {
            category: 'BUSINESS',
            action: 'ORDER_PLACED',
            outcome: 'SUCCESS',
            actor,
            resourceType: 'Order',
            resourceId: o._id.toString(),
            correlationId: deps.correlationId,
            details: { orderNumber: o.orderNumber, totalPaise: o.pricing.totalPaise, checkoutGroupId },
          },
          session,
        );
      }
      return created;
    });

    for (const o of orders) {
      void deps.notifier.notify({
        userId: o.farmerId.toString(),
        template: 'ORDER_PLACED_FARMER',
        data: { orderNumber: o.orderNumber },
      });
    }
    return { data: { checkoutGroupId, orders: orders.map((o) => summarizeOrder(o.toObject())) } };
  } catch (err) {
    // Without transactions, undo any reservations already made.
    for (const r of reserved) {
      await Listing.updateOne(
        { _id: new Types.ObjectId(r.listingId) },
        { $inc: { quantityReserved: -r.quantity } },
      ).catch(() => undefined);
    }
    throw err;
  }
}
