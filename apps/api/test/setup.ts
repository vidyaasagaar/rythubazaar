import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, inject } from 'vitest';
import { connectDb } from '../src/lib/db';
import { ensureIndexes } from '../src/models';

beforeAll(async () => {
  if (mongoose.connection.readyState !== 1) {
    await connectDb(inject('mongoUri'));
    await ensureIndexes();
  }
});

// Each test starts from an empty (ephemeral, in-memory) test database.
beforeEach(async () => {
  const db = mongoose.connection.db!;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
});
