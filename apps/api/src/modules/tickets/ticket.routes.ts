import { Router, type RequestHandler } from 'express';
import {
  AdminTicketListQuerySchema,
  AssignTicketRequestSchema,
  AuthorTicketListQuerySchema,
  CreateMessageRequestSchema,
  CreateNoteRequestSchema,
  CreateResponseRequestSchema,
  CreateTicketRequestSchema,
  GenerateDraftRequestSchema,
  IdParamsSchema,
  UpdateTicketRequestSchema,
} from '@bookleaf/contracts';
import { created, handle, ok, paginated, requireUser } from '../../common/http';
import type { TicketEventBus } from '../../events/event-bus';
import { createTicketEventStream } from '../../events/sse';
import type { AdminTicketService } from './admin-ticket.service';
import type { AuthorTicketService } from './author-ticket.service';

/** `/api/v1/tickets/*` — author-facing ticket endpoints (AUTHOR role). */
export function createAuthorTicketRouter(deps: {
  tickets: AuthorTicketService;
  events: TicketEventBus;
  ticketCreateRateLimit: RequestHandler;
}) {
  const { tickets } = deps;
  const router = Router();

  router.post(
    '/',
    deps.ticketCreateRateLimit,
    handle({ body: CreateTicketRequestSchema }, async ({ req, body }) =>
      created(await tickets.create(requireUser(req), body)),
    ),
  );

  router.get(
    '/mine',
    handle({ query: AuthorTicketListQuerySchema }, async ({ req, query }) => {
      const { items, meta } = await tickets.list(requireUser(req), query);
      return paginated(items, meta);
    }),
  );

  // Real-time stream of the author's own ticket events (ids only).
  router.get('/mine/events', createTicketEventStream(deps.events, 'AUTHOR'));

  router.get(
    '/mine/:id',
    handle({ params: IdParamsSchema }, async ({ req, params }) =>
      ok(await tickets.get(requireUser(req), params.id)),
    ),
  );

  router.post(
    '/mine/:id/messages',
    handle(
      { params: IdParamsSchema, body: CreateMessageRequestSchema },
      async ({ req, params, body }) =>
        created(await tickets.addMessage(requireUser(req), params.id, body.body)),
    ),
  );

  return router;
}

/** `/api/v1/admin/tickets/*` — operations queue and ticket workspace (ADMIN role). */
export function createAdminTicketRouter(deps: {
  tickets: AdminTicketService;
  aiRateLimit: RequestHandler;
}) {
  const { tickets } = deps;
  const router = Router();

  router.get(
    '/',
    handle({ query: AdminTicketListQuerySchema }, async ({ req, query }) => {
      const { items, meta } = await tickets.list(requireUser(req), query);
      return paginated(items, meta);
    }),
  );

  router.get(
    '/:id',
    handle({ params: IdParamsSchema }, async ({ params }) => ok(await tickets.get(params.id))),
  );

  router.patch(
    '/:id',
    handle(
      { params: IdParamsSchema, body: UpdateTicketRequestSchema },
      async ({ req, params, body }) => ok(await tickets.update(requireUser(req), params.id, body)),
    ),
  );

  router.post(
    '/:id/assign',
    handle(
      { params: IdParamsSchema, body: AssignTicketRequestSchema },
      async ({ req, params, body }) =>
        ok(await tickets.assign(requireUser(req), params.id, body.assigneeId)),
    ),
  );

  router.post(
    '/:id/notes',
    handle(
      { params: IdParamsSchema, body: CreateNoteRequestSchema },
      async ({ req, params, body }) =>
        created(await tickets.addNote(requireUser(req), params.id, body.body)),
    ),
  );

  router.post(
    '/:id/responses',
    handle(
      { params: IdParamsSchema, body: CreateResponseRequestSchema },
      async ({ req, params, body }) =>
        created(await tickets.respond(requireUser(req), params.id, body)),
    ),
  );

  router.post(
    '/:id/ai/classify',
    deps.aiRateLimit,
    handle({ params: IdParamsSchema }, async ({ req, params }) =>
      ok(await tickets.retriage(requireUser(req), params.id)),
    ),
  );

  router.post(
    '/:id/ai/draft',
    deps.aiRateLimit,
    handle({ params: IdParamsSchema, body: GenerateDraftRequestSchema }, async ({ params, body }) =>
      ok(await tickets.draft(params.id, body.force)),
    ),
  );

  return router;
}
