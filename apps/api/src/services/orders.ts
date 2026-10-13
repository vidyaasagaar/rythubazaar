import { Types } from 'mongoose';
import {
  ORDER_STATUSES_ASSIGNABLE,
  ORDER_STATUSES_HOLDING_RESERVATION,
  findOrderTransition,
  hasPermission,
  orderActorFor,
  type CollectionInput,
  type OrderStatus,
} from '@rythubazaar/shared';
import { DeliveryAgent, Listing, Order, Payout, StockMovement, type IOrder } from '../models';
import { AppError, Errors } from '../lib/errors';
import { runInTransaction } from '../lib/db';
import { maskName, maskPhone } from '../lib/redact';
import { audit } from './audit';
import type { AuthUser } from '../types/express';
import type { Notifier } from '../adapters/notifications';

export async function loadOrder(orderId: string) {
  if (!Types.ObjectId.isValid(orderId)) throw Errors.notFound('Order');
  const order = await Order.findById(orderId);
  if (!order) throw Errors.notFound('Order');
  return order;
}

export function ownsOrder(actor: AuthUser, order: Pick<IOrder, 'customerId' | 'farmerId'>) {
  return { customer: order.customerId.equals(actor._id), farmer: order.farmerId.equals(actor._id) };
}

export interface TransitionOptions {
  reason?: string;
  pickup?: CollectionInput;
  correlationId?: string;
  notifier?: Notifier;
}

/**
 * The single entry point for order status changes. Validates the transition against the
 * shared state machine, checks the actor, applies stock/payout side effects atomically,
 * and records who changed what and when.
 */
export async function transitionOrder(
  actor: AuthUser,
  orderId: string,
  to: OrderStatus,
  opts: TransitionOptions,
  onDenied: () => never,
) {
  const order = await loadOrder(orderId);
  const orderActor = orderActorFor(actor.role, ownsOrder(actor, order));
  if (!orderActor) onDenied();
  const from = order.status;
  const rule = findOrderTransition(from, to);
  if (!rule) throw Errors.invalidTransition(from, to);
  if (!rule.actors.includes(orderActor!)) {
    throw Errors.forbidden(`Your role cannot change this order from ${from} to ${to}`);
  }
  if (rule.requiresReason && !opts.reason?.trim()) {
    throw Errors.validation([{ path: 'reason', message: 'A reason is required for this change' }]);
  }
  if (rule.requiresAgent && !order.delivery.agentId) {
    throw new AppError(409, 'INVALID_TRANSITION', 'Assign a delivery agent first');
  }
  if (rule.requiresCollection && !opts.pickup) {
    throw Errors.validation([{ path: 'pickup', message: 'Collection details are required' }]);
  }

  const now = new Date();
  const updated = await runInTransaction(async (session) => {
    const sopts = session ? { session } : {};
    const set: Record<string, unknown> = { status: to };
    const inc: Record<string, number> = {};
    if (to === 'CANCELLED') set.cancellationReason = opts.reason ?? 'Cancelled';
    if (to === 'DELIVERED') set.deliveredAt = now;
    if (to === 'DELIVERY_FAILED') inc['delivery.failedAttempts'] = 1;
    if (to === 'COLLECTED' && opts.pickup) {
      set.pickup = {
        collectedAt: now,
        collectedBy: actor._id,
        quantitiesVerified: opts.pickup.quantitiesVerified,
        qualityGrade: opts.pickup.qualityGrade,
        weightKg: opts.pickup.weightKg ?? null,
        notes: opts.pickup.notes ?? null,
        evidencePhoto: opts.pickup.evidencePhoto ?? null,
      };
    }
    // Optimistic concurrency: only apply if the order is still in the status we validated.
    const doc = await Order.findOneAndUpdate(
      { _id: order._id, status: from },
      {
        $set: set,
        ...(Object.keys(inc).length ? { $inc: inc } : {}),
        $push: {
          statusHistory: { from, to, at: now, actorId: actor._id, actorRole: actor.role, note: opts.reason },
        },
      },
      { new: true, ...sopts },
    );
    if (!doc)
      throw Errors.conflict('INVALID_TRANSITION', 'The order changed while you were updating it; reload');

    if (to === 'CANCELLED' && ORDER_STATUSES_HOLDING_RESERVATION.includes(from)) {
      for (const it of doc.items) {
        await Listing.updateOne({ _id: it.listingId }, { $inc: { quantityReserved: -it.quantity } }, sopts);
      }
      await StockMovement.insertMany(
        doc.items.map((it) => ({
          listingId: it.listingId,
          orderId: doc._id,
          type: 'RELEASE',
          quantity: it.quantity,
          actorId: actor._id,
          at: now,
        })),
        sopts,
      );
    }

    if (to === 'COLLECTED') {
      for (const it of doc.items) {
        await Listing.updateOne(
          { _id: it.listingId },
          { $inc: { quantityReserved: -it.quantity, quantitySold: it.quantity } },
          sopts,
        );
      }
      await StockMovement.insertMany(
        doc.items.map((it) => ({
          listingId: it.listingId,
          orderId: doc._id,
          type: 'SELL',
          quantity: it.quantity,
          actorId: actor._id,
          at: now,
        })),
        sopts,
      );
      // Verified collection releases the farmer's payout (zero commission: full item subtotal).
      const [payout] = await Payout.create(
        [
          {
            farmerId: doc.farmerId,
            orderId: doc._id,
            orderNumber: doc.orderNumber,
            amountPaise: doc.pricing.farmerPayoutPaise,
            status: 'PENDING',
            provider: 'MOCK',
            simulated: true,
            history: [
              {
                from: null,
                to: 'PENDING',
                at: now,
                source: 'SYSTEM',
                note: 'Created on verified collection',
              },
            ],
          },
        ],
        sopts,
      );
      await audit(
        {
          category: 'BUSINESS',
          action: 'PAYOUT_CREATED',
          outcome: 'SUCCESS',
          actor: 'SYSTEM',
          resourceType: 'Payout',
          resourceId: payout!._id.toString(),
          correlationId: opts.correlationId,
          details: { orderId: doc._id.toString(), amountPaise: payout!.amountPaise, simulated: true },
        },
        session,
      );
    }

    await audit(
      {
        category: 'BUSINESS',
        action: 'ORDER_STATUS_CHANGED',
        outcome: 'SUCCESS',
        actor,
        resourceType: 'Order',
        resourceId: doc._id.toString(),
        correlationId: opts.correlationId,
        details: { orderNumber: doc.orderNumber, from, to, reason: opts.reason ?? null },
      },
      session,
    );
    return doc;
  });

  void opts.notifier?.notify({
    userId: updated.customerId.toString(),
    template: `ORDER_${to}`,
    data: { orderNumber: updated.orderNumber },
  });
  return updated;
}

export async function assignDeliveryAgent(
  actor: AuthUser,
  orderId: string,
  agentId: string,
  correlationId?: string,
) {
  const order = await loadOrder(orderId);
  if (!ORDER_STATUSES_ASSIGNABLE.includes(order.status)) {
    throw new AppError(409, 'INVALID_TRANSITION', `Cannot assign delivery while order is ${order.status}`);
  }
  if (!Types.ObjectId.isValid(agentId)) throw Errors.notFound('Delivery agent');
  const agent = await DeliveryAgent.findOne({ _id: agentId, active: true }).lean();
  if (!agent) throw Errors.notFound('Delivery agent');
  const now = new Date();
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    {
      $set: {
        'delivery.agentId': agent._id,
        'delivery.agentName': agent.name,
        'delivery.agentPhone': agent.phone,
        'delivery.assignedAt': now,
        'delivery.assignedBy': actor._id,
      },
      $push: {
        assignmentHistory: { agentId: agent._id, agentName: agent.name, at: now, actorId: actor._id },
      },
    },
    { new: true },
  );
  if (!updated) throw Errors.conflict('INVALID_TRANSITION', 'The order changed; reload and try again');
  await audit({
    category: 'BUSINESS',
    action: 'DELIVERY_ASSIGNED',
    outcome: 'SUCCESS',
    actor,
    resourceType: 'Order',
    resourceId: order._id.toString(),
    correlationId,
    details: { orderNumber: order.orderNumber, agentId: agent._id.toString() },
  });
  return updated;
}

/** Order as seen by a given viewer. Contact details are masked unless the viewer may see PII. */
export function presentOrder(o: IOrder, viewer: AuthUser) {
  const isOwnerCustomer = o.customerId.equals(viewer._id);
  const piiAllowed = isOwnerCustomer || hasPermission(viewer.role, 'pii:read');
  const isFarmerView = viewer.role === 'FARMER';
  const address = piiAllowed
    ? o.deliveryAddress
    : {
        recipientName: maskName(o.deliveryAddress.recipientName),
        phone: maskPhone(o.deliveryAddress.phone),
        locality: o.deliveryAddress.locality,
        district: o.deliveryAddress.district,
        state: o.deliveryAddress.state,
      };
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    checkoutGroupId: o.checkoutGroupId,
    customerId: isFarmerView ? undefined : o.customerId.toString(),
    farmerId: o.farmerId.toString(),
    farmName: o.farmName,
    items: o.items.map((i) => ({ ...i, listingId: i.listingId.toString() })),
    // Farmers see what they receive; customers and staff see the full price breakdown.
    pricing: isFarmerView
      ? {
          subtotalPaise: o.pricing.subtotalPaise,
          farmerPayoutPaise: o.pricing.farmerPayoutPaise,
          currency: 'INR',
        }
      : o.pricing,
    deliveryAddress: isFarmerView
      ? { locality: o.deliveryAddress.locality, district: o.deliveryAddress.district }
      : address,
    payment: o.payment,
    status: o.status,
    statusHistory: o.statusHistory.map((h) => ({
      from: h.from,
      to: h.to,
      at: h.at,
      actorRole: h.actorRole,
      actorId: isFarmerView || viewer.role === 'CUSTOMER' ? undefined : h.actorId?.toString(),
      note: h.note,
    })),
    delivery: {
      agentName: o.delivery.agentName ?? null,
      agentPhone:
        piiAllowed && viewer.role !== 'CUSTOMER'
          ? (o.delivery.agentPhone ?? null)
          : maskPhone(o.delivery.agentPhone),
      assignedAt: o.delivery.assignedAt ?? null,
      failedAttempts: o.delivery.failedAttempts,
    },
    assignmentHistory:
      viewer.role === 'CUSTOMER' || isFarmerView
        ? undefined
        : o.assignmentHistory.map((a) => ({
            agentName: a.agentName,
            at: a.at,
            actorId: a.actorId.toString(),
          })),
    pickup: {
      collectedAt: o.pickup.collectedAt ?? null,
      qualityGrade: o.pickup.qualityGrade ?? null,
      quantitiesVerified: o.pickup.quantitiesVerified ?? false,
      weightKg: o.pickup.weightKg ?? null,
      notes: viewer.role === 'CUSTOMER' ? undefined : (o.pickup.notes ?? null),
      evidencePhoto: viewer.role === 'CUSTOMER' ? undefined : (o.pickup.evidencePhoto ?? null),
      collectedBy:
        viewer.role === 'CUSTOMER' || isFarmerView ? undefined : (o.pickup.collectedBy?.toString() ?? null),
    },
    cancellationReason: o.cancellationReason ?? null,
    deliveredAt: o.deliveredAt ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
