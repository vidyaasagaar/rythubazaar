import '../lib/mongoose-setup';

export * from './user';
export * from './farmerProfile';
export * from './listing';
export * from './cart';
export * from './order';
export * from './operations';
export * from './audit';
export * from './call';

import { User } from './user';
import { FarmerProfile } from './farmerProfile';
import { Listing } from './listing';
import { Cart } from './cart';
import { Order } from './order';
import {
  DeliveryAgent,
  IdempotencyRecord,
  Payout,
  ReturnRequest,
  StockMovement,
  SupportTicket,
} from './operations';
import { AuditLog } from './audit';
import { CallEvent, CallSession } from './call';

export const ALL_MODELS = [
  User,
  FarmerProfile,
  Listing,
  Cart,
  Order,
  StockMovement,
  DeliveryAgent,
  Payout,
  ReturnRequest,
  SupportTicket,
  IdempotencyRecord,
  AuditLog,
  CallSession,
  CallEvent,
];

/**
 * Create collections and indexes up front (collections cannot be created inside transactions
 * on older servers). Non-destructive: existing indexes that are not in the schema are left alone.
 */
export async function ensureIndexes(): Promise<void> {
  for (const m of ALL_MODELS) {
    await m.createCollection().catch((err: { codeName?: string }) => {
      if (err?.codeName !== 'NamespaceExists') throw err;
    });
    await m.createIndexes();
  }
}
