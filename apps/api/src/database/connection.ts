import mongoose from 'mongoose';
import type { Logger } from '../common/logger';
// Register every model so syncIndexes() covers all collections.
import './models';

// Set during graceful shutdown so an intentional disconnect isn't logged as a warning.
let closing = false;

export async function connectDatabase(uri: string, logger: Logger): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('disconnected', () => {
    if (!closing) logger.warn('MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, maxPoolSize: 20 });
  // Build declared indexes (idempotent). In a larger system this would be a migration step.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  return conn;
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function disconnectDatabase(): Promise<void> {
  closing = true;
  await mongoose.disconnect();
}
