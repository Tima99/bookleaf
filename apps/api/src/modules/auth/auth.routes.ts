import { Router, type CookieOptions, type RequestHandler } from 'express';
import { LoginRequestSchema } from '@bookleaf/contracts';
import type { AppConfig } from '../../config/env';
import { handle, ok, requireUser } from '../../common/http';
import { authenticate, SESSION_COOKIE } from '../../common/middleware/auth';
import type { AuthService } from './auth.service';

export function createAuthRouter(deps: {
  auth: AuthService;
  config: AppConfig;
  loginRateLimit: RequestHandler;
}) {
  const { auth, config } = deps;
  const router = Router();

  const cookieOptions = (): CookieOptions => ({
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: '/',
  });

  router.post(
    '/login',
    deps.loginRateLimit,
    handle({ body: LoginRequestSchema }, async ({ body, res }) => {
      const { token, session, maxAgeMs } = await auth.login(body);
      res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: maxAgeMs });
      return ok(session);
    }),
  );

  // Logout only clears the cookie, so it works even with an expired session. It is
  // JSON-only (requireJson) like every other mutation, which blocks cross-site form posts.
  router.post(
    '/logout',
    handle({}, async ({ res }) => {
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      return ok({ loggedOut: true });
    }),
  );

  router.get(
    '/me',
    authenticate(auth),
    handle({}, async ({ req }) => ok(auth.toSessionDto(requireUser(req)))),
  );

  return router;
}
