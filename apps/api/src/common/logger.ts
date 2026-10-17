import { createRequire } from 'node:module';
import pino, { type Logger } from 'pino';

/**
 * Structured logger. Credentials, cookies and free-text ticket content are redacted so
 * personal data and secrets never reach log storage.
 */
export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.apiKey',
  '*.token',
  '*.csrfToken',
  '*.body',
  '*.description',
];

/** pino-pretty is a dev dependency; deployed bundles (no node_modules) log plain JSON. */
function prettyAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'bookleaf-api' },
    ...(pretty && prettyAvailable()
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss' },
          },
        }
      : {}),
  });
}

export type { Logger };
