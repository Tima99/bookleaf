import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLogger } from '../src/common/logger';
import { connectDatabase } from '../src/database/connection';
import {
  AiStrategyModel,
  AuthorModel,
  BookModel,
  TicketModel,
  UserModel,
} from '../src/database/models';
import { parseDataset, seedDatabase } from '../src/database/seed/seed';
import { AuditService } from '../src/modules/audit/audit.service';
import { StrategyService } from '../src/modules/ai/services/strategy.service';
import { TEST_DATASET } from './helpers/fixtures';

let mongo: MongoMemoryServer;
const logger = createLogger('silent', false);
const strategies = () => new StrategyService(new AuditService(logger));
const options = () => ({
  authorPassword: 'a-password',
  adminPassword: 'b-password',
  withDemoTickets: false,
  strategies: strategies(),
});

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await connectDatabase(mongo.getUri('seed_test'), logger);
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('seed', () => {
  it('is idempotent — running twice creates no duplicates and keeps passwords', async () => {
    await seedDatabase(TEST_DATASET, options());
    const hashBefore = (
      await UserModel.findOne({ email: 'asha.verma@example.test' }).select('+passwordHash').lean()
    )?.passwordHash;
    await seedDatabase(TEST_DATASET, { ...options(), authorPassword: 'changed' });
    expect(await AuthorModel.countDocuments()).toBe(2);
    expect(await BookModel.countDocuments()).toBe(3);
    expect(await UserModel.countDocuments({ role: 'AUTHOR' })).toBe(2);
    expect(await UserModel.countDocuments({ role: 'ADMIN' })).toBe(2);
    expect(await AiStrategyModel.countDocuments()).toBe(13);
    const hashAfter = (
      await UserModel.findOne({ email: 'asha.verma@example.test' }).select('+passwordHash').lean()
    )?.passwordHash;
    expect(hashAfter).toBe(hashBefore);
  });

  it('preserves identifiers and null values', async () => {
    const book = await BookModel.findOne({ bookCode: 'TBK02' }).lean();
    expect(book).toMatchObject({
      mrp: null,
      authorRoyaltyPerCopy: null,
      publicationDate: null,
      printPartner: null,
      stage: 'IN_PRODUCTION',
    });
    const author = await AuthorModel.findOne({ authorCode: 'TAUTH02' }).lean();
    expect(author?.phone).toBeNull();
  });

  it('creates demo tickets only once', async () => {
    // Demo tickets reference real dataset authors; they are skipped when absent.
    await seedDatabase(TEST_DATASET, { ...options(), withDemoTickets: true });
    const first = await TicketModel.countDocuments();
    await seedDatabase(TEST_DATASET, { ...options(), withDemoTickets: true });
    expect(await TicketModel.countDocuments()).toBe(first);
  });

  it('rejects a malformed dataset before writing anything', () => {
    expect(() =>
      parseDataset({ authors: [{ author_id: 'X', name: 'Y', email: 'not-an-email', books: [] }] }),
    ).toThrow();
  });

  // Runs only where the BookLeaf-provided file exists locally (it is not committed).
  const datasetPath = resolve(import.meta.dirname, '../../../data/bookleaf_sample_data.json');
  it.skipIf(!existsSync(datasetPath))(
    'imports the provided dataset: exactly 10 authors and 18 books, twice',
    async () => {
      await mongoose.connection.dropDatabase();
      const dataset = parseDataset(JSON.parse(readFileSync(datasetPath, 'utf8')));
      await seedDatabase(dataset, { ...options(), withDemoTickets: true });
      await seedDatabase(dataset, { ...options(), withDemoTickets: true });
      expect(await AuthorModel.countDocuments()).toBe(10);
      expect(await BookModel.countDocuments()).toBe(18);
      expect(await BookModel.countDocuments({ stage: 'IN_PRODUCTION' })).toBe(2);
      expect(await TicketModel.countDocuments({ seedKey: { $exists: true } })).toBe(7);
    },
  );
});
