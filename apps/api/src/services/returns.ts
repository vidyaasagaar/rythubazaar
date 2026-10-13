import { Types } from 'mongoose';
import { RETURN_TRANSITIONS, type ReturnReason } from '@rythubazaar/shared';
import { Order, ReturnRequest } from '../models';
import { AppError, Errors } from '../lib/errors';
import { audit } from './audit';
import type { AuthUser } from '../types/express';

export async function requestReturn(
  actor: AuthUser,
  input: { orderId: string; reason: ReturnReason; details: string },
  returnWindowHours: number,
  onDenied: () => never,
  correlationId?: string,
) {
  const order = await Order.findById(input.orderId);
  if (!order) throw Errors.notFound('Order');
  if (!order.customerId.equals(actor._id)) onDenied();
  if (order.status !== 'DELIVERED' || !order.deliveredAt) {
    throw new AppError(409, 'RETURN_NOT_ALLOWED', 'Returns can only be requested for delivered orders');
  }
  const deadline = order.deliveredAt.getTime() + returnWindowHours * 60 * 60 * 1000;
  if (Date.now() > deadline) {
    throw new AppError(409, 'RETURN_NOT_ALLOWED', `The ${returnWindowHours}-hour return window has closed`);
  }
  try {
    const ret = await ReturnRequest.create({
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerId: actor._id,
      farmerId: order.farmerId,
      reason: input.reason,
      details: input.details,
      status: 'REQUESTED',
      history: [{ from: null, to: 'REQUESTED', at: new Date(), actorId: actor._id, actorRole: actor.role }],
    });
    await audit({
      category: 'BUSINESS',
      action: 'RETURN_REQUESTED',
      outcome: 'SUCCESS',
      actor,
      resourceType: 'ReturnRequest',
      resourceId: ret._id.toString(),
      correlationId,
      details: { orderId: order._id.toString(), reason: input.reason },
    });
    return ret;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'RETURN_NOT_ALLOWED', 'A return was already requested for this order');
    }
    throw err;
  }
}

async function moveReturn(
  actor: AuthUser,
  returnId: string,
  to: 'APPROVED' | 'REJECTED' | 'REFUNDED',
  note: string | undefined,
  correlationId?: string,
) {
  if (!Types.ObjectId.isValid(returnId)) throw Errors.notFound('Return');
  const ret = await ReturnRequest.findById(returnId);
  if (!ret) throw Errors.notFound('Return');
  const from = ret.status;
  if (!RETURN_TRANSITIONS[from].includes(to)) throw Errors.invalidTransition(from, to);
  const set: Record<string, unknown> = { status: to };
  if (to === 'REFUNDED') {
    const order = await Order.findById(ret.orderId).lean();
    // Demo: the refund is recorded only. Farmer payout is intentionally untouched —
    // after verified collection the company bears the return risk.
    set.refund = {
      amountPaise: order?.pricing.totalPaise ?? 0,
      mode: 'DEMO_NO_MONEY_MOVED',
      recordedAt: new Date(),
    };
  }
  const updated = await ReturnRequest.findOneAndUpdate(
    { _id: ret._id, status: from },
    {
      $set: set,
      $push: { history: { from, to, at: new Date(), actorId: actor._id, actorRole: actor.role, note } },
    },
    { new: true },
  );
  if (!updated) throw Errors.conflict('INVALID_TRANSITION', 'Return changed; reload and try again');
  await audit({
    category: 'BUSINESS',
    action: `RETURN_${to}`,
    outcome: 'SUCCESS',
    actor,
    resourceType: 'ReturnRequest',
    resourceId: ret._id.toString(),
    correlationId,
    details: { from, to, note: note ?? null, payoutImpact: 'NONE_COMPANY_BEARS_RISK' },
  });
  return updated;
}

export const reviewReturn = (
  actor: AuthUser,
  id: string,
  decision: 'APPROVED' | 'REJECTED',
  note?: string,
  c?: string,
) => moveReturn(actor, id, decision, note, c);
export const recordRefund = (actor: AuthUser, id: string, c?: string) =>
  moveReturn(actor, id, 'REFUNDED', 'Demo refund recorded', c);
