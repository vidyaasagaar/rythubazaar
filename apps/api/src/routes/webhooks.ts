import express, { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors';
import { ah, ok, parse } from '../lib/http';
import { auditAsync } from '../services/audit';
import { applyProviderResult } from '../services/payouts';
import type { AppDeps } from '../context';

/**
 * Provider webhooks. Signatures are verified against the raw body before anything is parsed.
 * The mock payout provider has no webhook and rejects every signature, so in demo mode this
 * endpoint can never mark a payout as paid.
 */
export function webhooksRouter(deps: AppDeps) {
  const r = Router();

  r.post(
    '/payouts',
    express.raw({ type: 'application/json', limit: '64kb' }),
    ah(async (req, res) => {
      const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      if (!deps.payouts.verifyWebhookSignature(raw, req.get('x-provider-signature'))) {
        auditAsync({
          category: 'SECURITY',
          action: 'WEBHOOK_SIGNATURE_REJECTED',
          outcome: 'DENIED',
          actor: null,
          correlationId: req.correlationId,
          details: { provider: deps.payouts.name },
        });
        throw new AppError(401, 'UNAUTHENTICATED', 'Invalid webhook signature');
      }
      const body = parse(
        z.object({
          reference: z.string().min(4).max(100),
          status: z.enum(['SUCCEEDED', 'FAILED']),
          reason: z.string().max(200).optional(),
        }),
        JSON.parse(raw.toString('utf8')),
      );
      await applyProviderResult({
        reference: body.reference,
        outcome: body.status,
        failureReason: body.reason,
        via: 'PROVIDER_WEBHOOK',
        correlationId: req.correlationId,
      });
      ok(res, { received: true });
    }),
  );

  return r;
}
