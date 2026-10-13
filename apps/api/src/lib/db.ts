import './mongoose-setup';
import mongoose, { type ClientSession } from 'mongoose';
import { logger } from './logger';

let transactionsSupported = false;

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function supportsTransactions(): boolean {
  return transactionsSupported;
}

/** Multi-document transactions need a replica set or sharded cluster; detect rather than assume. */
export async function detectTransactionSupport(): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!db) return false;
  const hello = await db.admin().command({ hello: 1 });
  transactionsSupported = Boolean(hello.setName) || hello.msg === 'isdbgrid';
  return transactionsSupported;
}

export async function connectDb(uri: string): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await detectTransactionSupport();
  logger.info({ transactions: transactionsSupported }, 'MongoDB connected');
  if (!transactionsSupported) {
    logger.warn(
      'MongoDB is not a replica set: multi-document transactions are unavailable. ' +
        'Checkout falls back to compensating writes. Use a replica set in production.',
    );
  }
}

/**
 * Run `fn` inside a transaction when the deployment supports it. Without transactions,
 * `fn` receives `undefined` and must perform its own compensation on failure.
 */
export async function runInTransaction<T>(
  fn: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  if (!transactionsSupported) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}
