import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import {
  authenticate,
  authorize,
  csrfProtection,
  CSRF_HEADER,
  requireJson,
} from './common/middleware/auth';
import { createErrorHandler, notFoundHandler } from './common/middleware/error-handler';
import { createRateLimiters } from './common/middleware/rate-limit';
import { requestId } from './common/middleware/request-id';
import type { Container } from './container';
import { databaseState, isDatabaseReady } from './database/connection';
import { createAdminRouter } from './modules/admin/admin.routes';
import { createAiAdminRouter } from './modules/ai/ai.routes';
import { createAuthRouter } from './modules/auth/auth.routes';
import { createAuthorSelfRouter } from './modules/authors/author.routes';
import { createAdminTicketRouter, createAuthorTicketRouter } from './modules/tickets/ticket.routes';

/**
 * Builds the Express application. Request lifecycle:
 * requestId → logging → security headers → CORS → body parsing → rate limit →
 * JSON-only mutations → [authenticate → CSRF → role check] → validated handler →
 * centralised error handler.
 */
export function createApp(container: Container, options: { rateLimitMultiplier?: number } = {}) {
  const { config, logger } = container;
  const limiters = createRateLimiters(options.rateLimitMultiplier ?? 1);
  const app = express();

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).requestId ?? '',
      autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
      // Log method/url/status only — never headers or bodies (cookies, ticket content).
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet());
  // Behind a gateway that already answers CORS (CORS_HANDLED_BY_PROXY), adding our own
  // headers would send Access-Control-Allow-Origin twice and the browser would block it.
  if (!config.corsHandledByProxy) {
    app.use(
      cors({
        origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
        credentials: true,
        allowedHeaders: ['Content-Type', CSRF_HEADER, 'X-Request-Id'],
        exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
        methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
        maxAge: 600,
      }),
    );
  }
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(limiters.global);

  /* ------------------------------- home ------------------------------- */
  // A friendly landing response for anyone opening the API URL in a browser.
  app.get('/', (_req, res) => {
    res.json({
      name: 'BookLeaf Author Support API',
      message: 'Welcome to the BookLeaf Author Support & Communication Portal API.',
      version: 'v1',
      links: {
        health: '/health',
        api: '/api/v1',
      },
    });
  });

  /* ------------------------------ health ------------------------------ */
  // One check for monitors: 200 when the server and MongoDB are both up, 503 otherwise.
  app.get('/health', (_req, res) => {
    const connected = isDatabaseReady();
    res.status(connected ? 200 : 503).json({
      status: connected ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      database: { connected, state: databaseState() },
      timestamp: new Date().toISOString(),
    });
  });

  /* -------------------------------- API ------------------------------- */
  const api = Router();
  api.use(requireJson);
  api.use(
    '/auth',
    createAuthRouter({ auth: container.auth, config, loginRateLimit: limiters.login }),
  );

  // Everything below requires a valid session + CSRF token on mutations.
  const protectedApi = Router();
  protectedApi.use(authenticate(container.auth), csrfProtection);

  protectedApi.use(
    '/authors/me',
    authorize('AUTHOR'),
    createAuthorSelfRouter({ books: container.books }),
  );
  protectedApi.use(
    '/tickets',
    authorize('AUTHOR'),
    createAuthorTicketRouter({
      tickets: container.authorTickets,
      events: container.events,
      ticketCreateRateLimit: limiters.ticketCreate,
    }),
  );

  const admin = Router();
  admin.use(authorize('ADMIN'));
  admin.use(
    '/tickets',
    createAdminTicketRouter({ tickets: container.adminTickets, aiRateLimit: limiters.ai }),
  );
  admin.use(
    '/ai',
    createAiAdminRouter({
      strategies: container.strategies,
      tester: container.tester,
      runs: container.runs,
      llm: container.llm,
      aiRateLimit: limiters.ai,
    }),
  );
  admin.use(
    '/',
    createAdminRouter({
      admin: container.admin,
      tickets: container.adminTickets,
      events: container.events,
    }),
  );
  protectedApi.use('/admin', admin);

  api.use(protectedApi);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}
