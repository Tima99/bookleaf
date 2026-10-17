import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig, loadDotEnv } from '../../config/env';
import { createLogger } from '../../common/logger';
import { AuditService } from '../../modules/audit/audit.service';
import { StrategyService } from '../../modules/ai/services/strategy.service';
import { connectDatabase, disconnectDatabase } from '../connection';
import { parseDataset, seedDatabase } from './seed';

/**
 * CLI: pnpm seed [--file path/to/bookleaf_sample_data.json] [--no-demo-tickets]
 *
 * Passwords come from SEED_AUTHOR_PASSWORD / SEED_ADMIN_PASSWORD. In production they
 * must be set explicitly (no defaults), so a demo password never ships by accident.
 */
async function main(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  const logger = createLogger('info', !config.isProduction);
  const args = process.argv.slice(2);
  const fileArg = args.indexOf('--file');
  const file = resolve(
    fileArg >= 0 && args[fileArg + 1]
      ? args[fileArg + 1]!
      : (process.env.SEED_DATA_PATH ?? '../../data/bookleaf_sample_data.json'),
  );

  const authorPassword =
    process.env.SEED_AUTHOR_PASSWORD ?? (config.isProduction ? undefined : 'Author@2026');
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? (config.isProduction ? undefined : 'Admin@2026');
  if (!authorPassword || !adminPassword) {
    throw new Error(
      'Set SEED_AUTHOR_PASSWORD and SEED_ADMIN_PASSWORD to seed a production database.',
    );
  }

  const dataset = parseDataset(JSON.parse(readFileSync(file, 'utf8')));
  await connectDatabase(config.mongoUri, logger);
  try {
    const summary = await seedDatabase(dataset, {
      authorPassword,
      adminPassword,
      withDemoTickets: !args.includes('--no-demo-tickets'),
      strategies: new StrategyService(new AuditService(logger)),
    });
    logger.info(summary, 'Seed complete');
  } finally {
    await disconnectDatabase();
  }
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
