import mongoose from 'mongoose';
import { loadEnv } from './config/env';
import { createDeps } from './context';
import { createApp } from './app';
import { connectDb } from './lib/db';
import { logger } from './lib/logger';
import { ensureIndexes } from './models';
import { sweepIdleCalls } from './services/ivr/calls';

async function main() {
  let env;
  try {
    env = loadEnv();
  } catch (err) {
    // Print plainly so the actionable message is visible even with JSON logs.
    console.error((err as Error).message);
    process.exit(1);
  }
  logger.level = env.LOG_LEVEL;
  const deps = createDeps(env);
  const app = createApp(deps);

  const server = app.listen(env.PORT, () => {
    logger.info(
      { port: env.PORT, mode: env.NODE_ENV, demoRoutes: Object.keys(env.demoRoutes) },
      'RythuBazaar API listening',
    );
  });

  // Connect in the background and keep retrying: the API stays up and reports 503 /ready
  // (and DATABASE_UNAVAILABLE on data routes) instead of crashing when MongoDB is down.
  const connect = async (attempt = 1): Promise<void> => {
    try {
      await connectDb(env.MONGODB_URI);
      await ensureIndexes();
    } catch (err) {
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5));
      logger.error({ err: (err as Error).message, retryInMs: delay }, 'MongoDB connection failed');
      setTimeout(() => void connect(attempt + 1), delay);
    }
  };
  void connect();

  const sweeper = setInterval(() => {
    if (mongoose.connection.readyState !== 1) return;
    sweepIdleCalls(env.CALL_IDLE_TIMEOUT_MINUTES).catch((err) =>
      logger.warn({ err }, 'Idle call sweep failed'),
    );
  }, 60_000);
  sweeper.unref();

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
