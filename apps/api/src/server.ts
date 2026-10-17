import { createApp } from './app';
import { loadConfig, loadDotEnv } from './config/env';
import { createLogger } from './common/logger';
import { buildContainer } from './container';
import { connectDatabase, disconnectDatabase } from './database/connection';

async function main(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  const logger = createLogger(config.logLevel, !config.isProduction);

  if (config.jwtSecretIsEphemeral) {
    logger.warn('JWT_SECRET not set — using an ephemeral secret; sessions reset on every restart.');
  }

  await connectDatabase(config.mongoUri, logger);
  const container = buildContainer(config, logger);
  // Make sure the AI strategy defaults exist even if the seed script was never run.
  await container.strategies.ensureDefaults();

  const app = createApp(container);
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'BookLeaf API listening');
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    server.close();
    // SSE connections are long-lived; close them so the process can exit promptly.
    server.closeAllConnections();
    await container.jobs.drain();
    await disconnectDatabase();
    logger.info('Shutdown complete');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error('Fatal startup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
