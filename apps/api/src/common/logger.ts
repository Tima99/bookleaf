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

export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'bookleaf-api' },
    ...(pretty
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
