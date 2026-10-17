import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { UserRole } from '@bookleaf/contracts';
import { AuthenticationError, CsrfError, ForbiddenError } from '../errors';
import type { AuthService } from '../../modules/auth/auth.service';

export const SESSION_COOKIE = 'bl_session';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Resolves the session cookie into `req.user`. The user record is re-read on every
 * request so deactivated accounts and role changes take effect immediately.
 * Never trusts identity hints from the client (e.g. an authorId in the body).
 */
export function authenticate(auth: AuthService): RequestHandler {
  return async (req, _res, next) => {
    try {
      const token: unknown = req.cookies?.[SESSION_COOKIE];
      if (typeof token !== 'string' || !token) throw new AuthenticationError();
      req.user = await auth.resolveSession(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function authorize(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(new AuthenticationError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * CSRF protection for cookie-authenticated requests (synchronizer token).
 * The token is bound to the signed session and returned to the SPA in the login/me
 * response body; the SPA echoes it in `X-CSRF-Token`. A cross-site attacker can make
 * the browser send the cookie but cannot read or forge the token.
 */
export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const header = req.header(CSRF_HEADER);
  if (!req.user || !header || !safeEqual(header, req.user.csrfToken)) return next(new CsrfError());
  next();
};

/** Rejects state-changing requests that aren't JSON (blocks simple cross-site form posts). */
export const requireJson: RequestHandler = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const length = Number(req.header('content-length') ?? 0);
  if (length > 0 && !req.is('application/json')) {
    res.status(415).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Content-Type must be application/json',
        requestId: req.requestId,
      },
    });
    return;
  }
  next();
};
