import { Types } from 'mongoose';
import { canTransitionPayout, type PayoutStatus } from '@rythubazaar/shared';
import { Payout } from '../models';
import { AppError, Errors } from '../lib/errors';
import { logger } from '../lib/logger';
import { audit } from './audit';
import type { AuthUser } from '../types/express';
import type { PayoutProvider } from '../adapters/payouts';

async function loadPayout(payoutId: string) {
  if (!Types.ObjectId.isValid(payoutId)) throw Errors.notFound('Payout');
  const payout = await Payout.findById(payoutId);
  if (!payout) throw Errors.notFound('Payout');
  return payout;
}

/** Admin action: hand the payout to the provider. Never marks success by itself. */
export async function initiatePayout(
  actor: AuthUser,
  payoutId: string,
  provider: PayoutProvider,
  correlationId?: string,
) {
  const payout = await loadPayout(payoutId);
  const from = payout.status;
  if (!canTransitionPayout(from, 'INITIATED', 'USER')) throw Errors.invalidTransition(from, 'INITIATED');

  let reference: string;
  try {
    ({ reference } = await provider.initiate({
      payoutId: payout._id.toString(),
      amountPaise: payout.amountPaise,
      farmerId: payout.farmerId.toString(),
    }));
  } catch (err) {
    logger.error({ err, payoutId }, 'Payout provider initiate failed');
    await audit({
      category: 'BUSINESS',
      action: 'PAYOUT_INITIATE_FAILED',
      outcome: 'FAILURE',
      actor,
      resourceType: 'Payout',
      resourceId: payoutId,
      correlationId,
    });
    throw new AppError(
      502,
      'PROVIDER_UNAVAILABLE',
      'Payout provider did not accept the request. No money moved.',
    );
  }

  const updated = await Payout.findOneAndUpdate(
    { _id: payout._id, status: from },
    {
      $set: { status: 'INITIATED', providerReference: reference, failureReason: null },
      $inc: { attempts: 1 },
      $push: {
        history: {
          from,
          to: 'INITIATED',
          at: new Date(),
          source: 'USER',
          actorId: actor._id,
          note: `Provider reference ${reference}`,
        },
      },
    },
    { new: true },
  );
  if (!updated) throw Errors.conflict('INVALID_TRANSITION', 'Payout changed; reload and try again');
  await audit({
    category: 'BUSINESS',
    action: from === 'FAILED' ? 'PAYOUT_RETRIED' : 'PAYOUT_INITIATED',
    outcome: 'SUCCESS',
    actor,
    resourceType: 'Payout',
    resourceId: payoutId,
    correlationId,
    details: {
      reference,
      amountPaise: updated.amountPaise,
      provider: provider.name,
      simulated: provider.simulated,
    },
  });
  return updated;
}

/**
 * Apply a provider result. This is the only path to SUCCEEDED/FAILED, reached from a verified
 * webhook or from the permission-checked mock "simulate" action.
 */
export async function applyProviderResult(input: {
  reference: string;
  outcome: Extract<PayoutStatus, 'SUCCEEDED' | 'FAILED'>;
  failureReason?: string;
  via: 'MOCK_CONTROLLED_ACTION' | 'PROVIDER_WEBHOOK';
  triggeredBy?: AuthUser;
  correlationId?: string;
}) {
  const payout = await Payout.findOne({ providerReference: input.reference });
  if (!payout) throw Errors.notFound('Payout');
  if (!canTransitionPayout(payout.status, input.outcome, 'PROVIDER')) {
    throw Errors.invalidTransition(payout.status, input.outcome);
  }
  const updated = await Payout.findOneAndUpdate(
    { _id: payout._id, status: payout.status, providerReference: input.reference },
    {
      $set: {
        status: input.outcome,
        failureReason:
          input.outcome === 'FAILED' ? (input.failureReason ?? 'Provider reported failure') : null,
      },
      $push: {
        history: {
          from: payout.status,
          to: input.outcome,
          at: new Date(),
          source: 'PROVIDER',
          actorId: input.triggeredBy?._id ?? null,
          note:
            input.via === 'MOCK_CONTROLLED_ACTION' ? 'Simulated provider result (mock)' : 'Provider webhook',
        },
      },
    },
    { new: true },
  );
  if (!updated) throw Errors.conflict('INVALID_TRANSITION', 'Payout changed; reload and try again');
  await audit({
    category: 'BUSINESS',
    action: input.outcome === 'SUCCEEDED' ? 'PAYOUT_SUCCEEDED' : 'PAYOUT_FAILED',
    outcome: 'SUCCESS',
    actor: 'PROVIDER',
    resourceType: 'Payout',
    resourceId: payout._id.toString(),
    correlationId: input.correlationId,
    details: {
      via: input.via,
      triggeredBy: input.triggeredBy?.id ?? null,
      reference: input.reference,
      failureReason: updated.failureReason ?? null,
      simulated: updated.simulated,
    },
  });
  return updated;
}

export async function simulatePayoutResult(
  actor: AuthUser,
  payoutId: string,
  outcome: 'SUCCEEDED' | 'FAILED',
  failureReason: string | undefined,
  provider: PayoutProvider,
  correlationId?: string,
) {
  if (!provider.simulated) {
    throw new AppError(
      409,
      'PROVIDER_UNAVAILABLE',
      'Simulation is only available with the mock payout provider',
    );
  }
  const payout = await loadPayout(payoutId);
  if (!payout.providerReference || payout.status !== 'INITIATED') {
    throw Errors.invalidTransition(payout.status, outcome);
  }
  return applyProviderResult({
    reference: payout.providerReference,
    outcome,
    failureReason,
    via: 'MOCK_CONTROLLED_ACTION',
    triggeredBy: actor,
    correlationId,
  });
}

export async function reconcilePayout(
  actor: AuthUser,
  payoutId: string,
  provider: PayoutProvider,
  correlationId?: string,
) {
  const payout = await loadPayout(payoutId);
  if (!payout.providerReference) throw Errors.invalidTransition(payout.status, 'reconcile');
  const result = await provider.fetchStatus(payout.providerReference);
  await audit({
    category: 'BUSINESS',
    action: 'PAYOUT_RECONCILE_CHECKED',
    outcome: 'SUCCESS',
    actor,
    resourceType: 'Payout',
    resourceId: payoutId,
    correlationId,
    details: { providerStatus: result.status },
  });
  if ((result.status === 'SUCCEEDED' || result.status === 'FAILED') && payout.status === 'INITIATED') {
    const updated = await applyProviderResult({
      reference: payout.providerReference,
      outcome: result.status,
      failureReason: 'reason' in result ? result.reason : undefined,
      via: 'PROVIDER_WEBHOOK',
      correlationId,
    });
    return { payout: updated, providerStatus: result.status, changed: true };
  }
  return {
    payout,
    providerStatus: result.status,
    changed: false,
    note: 'reason' in result ? result.reason : undefined,
  };
}

export function presentPayout(p: InstanceType<typeof Payout> | Record<string, unknown>) {
  const o = (
    typeof (p as { toObject?: unknown }).toObject === 'function'
      ? (p as { toObject: () => Record<string, unknown> }).toObject()
      : p
  ) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: String(o._id),
    farmerId: String(o.farmerId),
    orderId: String(o.orderId),
    orderNumber: o.orderNumber,
    amountPaise: o.amountPaise,
    currency: o.currency,
    status: o.status,
    provider: o.provider,
    simulated: o.simulated,
    providerReference: o.providerReference ?? null,
    failureReason: o.failureReason ?? null,
    attempts: o.attempts,
    history: (o.history ?? []).map((h: Record<string, unknown>) => ({
      ...h,
      actorId: h.actorId ? String(h.actorId) : null,
    })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}
