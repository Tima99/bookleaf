import {
  ipKeyGenerator,
  rateLimit,
  type Options,
  type RateLimitRequestHandler,
} from 'express-rate-limit';
import type { Request, Response } from 'express';

function limitExceeded(message: string) {
  return (req: Request, res: Response) => {
    res
      .status(429)
      .json({ success: false, error: { code: 'RATE_LIMITED', message, requestId: req.requestId } });
  };
}

export interface RateLimiters {
  login: RateLimitRequestHandler;
  ai: RateLimitRequestHandler;
  ticketCreate: RateLimitRequestHandler;
  global: RateLimitRequestHandler;
}

/**
 * Rate limiters are created per app instance (in-memory store). For a multi-instance
 * deployment swap the store for Redis — see docs/SECURITY.md.
 */
export function createRateLimiters(multiplier = 1): RateLimiters {
  const common: Partial<Options> = { standardHeaders: 'draft-8', legacyHeaders: false };
  const userOrIp = (req: Request) => req.user?.id ?? ipKeyGenerator(req.ip ?? '');

  return {
    // Brute-force protection: keyed by IP + submitted email; successful logins don't count.
    login: rateLimit({
      ...common,
      windowMs: 15 * 60_000,
      limit: 10 * multiplier,
      skipSuccessfulRequests: true,
      keyGenerator: (req) => {
        const body: unknown = req.body;
        const email =
          typeof body === 'object' && body !== null && 'email' in body
            ? String((body as { email: unknown }).email)
            : '';
        return `${ipKeyGenerator(req.ip ?? '')}|${email.toLowerCase().slice(0, 120)}`;
      },
      handler: limitExceeded('Too many sign-in attempts. Please wait a few minutes and try again.'),
    }),
    // AI endpoints cost money — limit per signed-in admin.
    ai: rateLimit({
      ...common,
      windowMs: 60_000,
      limit: 20 * multiplier,
      keyGenerator: userOrIp,
      handler: limitExceeded('Too many AI requests. Please wait a minute before trying again.'),
    }),
    // Ticket creation per author (spam / accidental duplicate protection).
    ticketCreate: rateLimit({
      ...common,
      windowMs: 10 * 60_000,
      limit: 10 * multiplier,
      keyGenerator: userOrIp,
      handler: limitExceeded(
        'You have created several tickets in a short time. Please wait a few minutes.',
      ),
    }),
    global: rateLimit({
      ...common,
      windowMs: 60_000,
      limit: 600 * multiplier,
      handler: limitExceeded('Too many requests. Please slow down.'),
    }),
  };
}
