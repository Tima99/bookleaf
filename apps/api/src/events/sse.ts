import type { Request, RequestHandler, Response } from 'express';
import {
  ADMIN_ONLY_EVENT_TYPES,
  SSE_EVENT_NAME,
  type ClientTicketEvent,
  type TicketEvent,
} from '@bookleaf/contracts';
import { AuthenticationError } from '../common/errors';
import type { TicketEventBus } from './event-bus';

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 5_000;

/**
 * Server-Sent Events stream.
 *
 * Authorisation happens per event: authors receive only events about their own tickets
 * and never admin-only event types (internal notes, assignment). Payloads contain ids
 * only, so even a mis-routed event couldn't disclose content.
 */
export function createTicketEventStream(
  bus: TicketEventBus,
  audience: 'AUTHOR' | 'ADMIN',
): RequestHandler {
  return (req: Request, res: Response) => {
    const user = req.user;
    if (!user) throw new AuthenticationError();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Disable proxy buffering (nginx / Render) so events are delivered immediately.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write(`retry: ${RETRY_MS}\n`);
    res.write(`event: ready\ndata: {}\n\n`);

    const canSee = (event: TicketEvent): boolean => {
      if (audience === 'ADMIN') return true;
      return event.authorId === user.authorId && !ADMIN_ONLY_EVENT_TYPES.includes(event.type);
    };

    const unsubscribe = bus.subscribe((event) => {
      if (!canSee(event)) return;
      const payload: ClientTicketEvent = {
        type: event.type,
        ticketId: event.ticketId,
        reference: event.reference,
        at: event.at,
      };
      res.write(`event: ${SSE_EVENT_NAME}\ndata: ${JSON.stringify(payload)}\n\n`);
    });

    const heartbeat = setInterval(() => res.write(`: ping\n\n`), HEARTBEAT_MS);
    // Close long-lived streams when the session expires; the browser reconnects and
    // re-authenticates (or gets a 401 and is sent to the login page).
    const msUntilExpiry = Math.max(0, user.sessionExpiresAt.getTime() - Date.now());
    const expiryTimer = setTimeout(() => res.end(), Math.min(msUntilExpiry, 2 ** 31 - 1));

    req.on('close', () => {
      clearInterval(heartbeat);
      clearTimeout(expiryTimer);
      unsubscribe();
    });
  };
}
