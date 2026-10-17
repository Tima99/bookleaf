/**
 * Real-time ticket events delivered over Server-Sent Events.
 *
 * Payloads deliberately carry identifiers only — never message bodies or notes.
 * Clients react by re-fetching through the authorised REST endpoints, so the
 * event stream can never leak content a user is not allowed to read.
 */
export const TICKET_EVENT_TYPES = [
  'ticket.created',
  'ticket.updated',
  'ticket.triaged',
  'ticket.assigned',
  'ticket.status.changed',
  'ticket.message.created',
  'ticket.note.created',
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];

/** Event types that must never reach author clients. */
export const ADMIN_ONLY_EVENT_TYPES: readonly TicketEventType[] = [
  'ticket.note.created',
  'ticket.assigned',
];

export interface TicketEvent {
  type: TicketEventType;
  ticketId: string;
  reference: string;
  /** Internal author id — used for server-side routing, stripped before sending to clients. */
  authorId: string;
  at: string;
}

export type ClientTicketEvent = Omit<TicketEvent, 'authorId'>;

export const SSE_EVENT_NAME = 'ticket';
