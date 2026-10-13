import { randomBytes } from 'node:crypto';

/**
 * Payout provider interface. A real provider (e.g. a bank/UPI payout API) must:
 *  - accept an initiation request and return a provider reference,
 *  - deliver results via signed webhooks (verifySignature) and/or a status lookup (fetchStatus).
 * Only provider results may move a payout to SUCCEEDED or FAILED.
 */
export interface PayoutProvider {
  readonly name: 'MOCK';
  readonly simulated: boolean;
  initiate(input: {
    payoutId: string;
    amountPaise: number;
    farmerId: string;
  }): Promise<{ reference: string }>;
  fetchStatus(
    reference: string,
  ): Promise<{ status: 'INITIATED' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN'; reason?: string }>;
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
}

/**
 * Deterministic mock. It never moves money and has no independent state: results are only
 * produced by an explicit, permission-checked "simulate result" admin action.
 */
export class MockPayoutProvider implements PayoutProvider {
  readonly name = 'MOCK' as const;
  readonly simulated = true;

  async initiate(): Promise<{ reference: string }> {
    return { reference: `MOCKPAY-${randomBytes(6).toString('hex').toUpperCase()}` };
  }

  async fetchStatus(): Promise<{ status: 'UNKNOWN'; reason: string }> {
    return { status: 'UNKNOWN', reason: 'Mock provider keeps no state; use the simulate-result action.' };
  }

  verifyWebhookSignature(): boolean {
    // The mock provider has no webhook. Reject everything so the endpoint cannot be abused.
    return false;
  }
}
