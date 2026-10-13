/**
 * Local development database: a real single-node MongoDB replica set (so transactions work),
 * downloaded and managed by mongodb-memory-server, with data persisted under apps/api/.data.
 * Use this only when no local MongoDB/Docker is available. Not for production.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const port = Number(process.env.DEV_DB_PORT ?? 27017);
const dbPath = path.resolve(process.cwd(), '.data', 'mongo');
mkdirSync(dbPath, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { name: 'rb-dev', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port, dbPath, storageEngine: 'wiredTiger' }],
});
console.log(`Dev MongoDB replica set running: mongodb://127.0.0.1:${port}/rythubazaar?replicaSet=rb-dev`);
console.log(`Data directory: ${dbPath}`);
console.log('Press Ctrl+C to stop.');

const stop = async () => {
  await replSet.stop({ doCleanup: false, force: false });
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
