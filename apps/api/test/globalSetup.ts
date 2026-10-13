import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

/** One real single-node replica set for the whole run, so transactions are exercised. */
export async function setup({ provide }: { provide: (key: string, value: string) => void }) {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  provide('mongoUri', replSet.getUri('rb-test'));
}

export async function teardown() {
  await replSet?.stop();
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
