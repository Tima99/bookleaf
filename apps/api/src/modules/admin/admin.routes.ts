import { Router } from 'express';
import { AdminAuthorListQuerySchema, IdParamsSchema } from '@bookleaf/contracts';
import { handle, ok, paginated, requireUser } from '../../common/http';
import type { TicketEventBus } from '../../events/event-bus';
import { createTicketEventStream } from '../../events/sse';
import type { AdminTicketService } from '../tickets/admin-ticket.service';
import type { AdminService } from './admin.service';

/** `/api/v1/admin/*` (dashboard, authors, users, event stream). */
export function createAdminRouter(deps: {
  admin: AdminService;
  tickets: AdminTicketService;
  events: TicketEventBus;
}) {
  const { admin } = deps;
  const router = Router();

  router.get(
    '/dashboard',
    handle({}, async ({ req }) => ok(await admin.dashboard(requireUser(req)))),
  );

  router.get(
    '/authors',
    handle({ query: AdminAuthorListQuerySchema }, async ({ query }) => {
      const { items, meta } = await admin.listAuthors(query);
      return paginated(items, meta);
    }),
  );

  router.get(
    '/authors/:id',
    handle({ params: IdParamsSchema }, async ({ params }) => ok(await admin.getAuthor(params.id))),
  );

  router.get(
    '/users',
    handle({}, async () => ok(await deps.tickets.listAdmins())),
  );

  router.get('/events', createTicketEventStream(deps.events, 'ADMIN'));

  return router;
}
