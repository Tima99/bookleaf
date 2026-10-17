import { Types } from 'mongoose';
import {
  formatTicketReference,
  type AuthorTicketDetailDto,
  type AuthorTicketListQuery,
  type AuthorTicketSummaryDto,
  type CreateTicketRequest,
  type PaginationMeta,
  type TicketEventType,
} from '@bookleaf/contracts';
import { escapeRegExp } from '@bookleaf/utils';
import type { AuthUser } from '../../common/auth-user';
import {
  ConflictError,
  ForbiddenError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { buildMeta } from '../../common/http';
import type { BackgroundJobs } from '../../common/jobs';
import {
  BookModel,
  nextSequence,
  TicketMessageModel,
  TicketModel,
  type TicketDoc,
} from '../../database/models';
import type { TicketEventBus } from '../../events/event-bus';
import { actorFrom, type AuditService } from '../audit/audit.service';
import type { TriageService } from '../ai/services/triage.service';
import { loadTicketRefs, toAuthorTicketSummary } from './ticket.mapper';

const DUPLICATE_WINDOW_MS = 2 * 60_000;

function requireAuthor(user: AuthUser): Types.ObjectId {
  if (user.role !== 'AUTHOR' || !user.authorId)
    throw new ForbiddenError('Only authors can use this endpoint');
  return new Types.ObjectId(user.authorId);
}

/**
 * Author-facing ticket operations. The author id always comes from the session; every
 * query is scoped by it, and only PUBLIC messages are ever read here (internal notes
 * live in a different collection that this service never touches).
 */
export class AuthorTicketService {
  constructor(
    private readonly deps: {
      triage: TriageService;
      audit: AuditService;
      events: TicketEventBus;
      jobs: BackgroundJobs;
    },
  ) {}

  async create(user: AuthUser, input: CreateTicketRequest): Promise<AuthorTicketDetailDto> {
    const authorId = requireAuthor(user);

    let bookId: Types.ObjectId | null = null;
    if (input.bookId) {
      const book = await BookModel.findOne({ bookCode: input.bookId, author: authorId })
        .select('_id')
        .lean();
      if (!book)
        throw new ValidationError(
          'Select one of your books or "General / Account Level"',
          [{ path: 'bookId', message: 'Book not found in your library' }],
          422,
        );
      bookId = book._id;
    }

    // Guard against double-submits (double click, flaky network retry).
    const duplicate = await TicketModel.exists({
      author: authorId,
      subject: input.subject,
      description: input.description,
      createdAt: { $gte: new Date(Date.now() - DUPLICATE_WINDOW_MS) },
    });
    if (duplicate)
      throw new ConflictError('This looks like a duplicate of a ticket you just submitted.');

    const now = new Date();
    const ticket = await TicketModel.create({
      ticketNumber: await nextSequence('ticket'),
      author: authorId,
      book: bookId,
      subject: input.subject,
      description: input.description,
      status: 'OPEN',
      triage: { status: 'PENDING', attempts: 0 },
      lastActivityAt: now,
    });

    await this.deps.audit.record({
      entityType: 'TICKET',
      entityId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      action: 'ticket.created',
      summary: `${user.name} opened ${formatTicketReference(ticket.ticketNumber)}`,
      actor: actorFrom(user),
    });
    this.publish('ticket.created', ticket);

    // AI triage runs after the response is sent; failures never affect ticket creation.
    const id = ticket._id.toString();
    this.deps.jobs.run(`triage:${id}`, () => this.deps.triage.triageTicket(id));

    return this.get(user, id);
  }

  async list(
    user: AuthUser,
    query: AuthorTicketListQuery,
  ): Promise<{ items: AuthorTicketSummaryDto[]; meta: PaginationMeta }> {
    const authorId = requireAuthor(user);
    const filter: Record<string, unknown> = { author: authorId };
    if (query.status?.length) filter.status = { $in: query.status };
    if (query.search) {
      const ref = /^(?:bl-?)?(\d{3,9})$/i.exec(query.search.trim());
      filter.$or = [
        { subject: new RegExp(escapeRegExp(query.search), 'i') },
        ...(ref?.[1] ? [{ ticketNumber: Number(ref[1]) }] : []),
      ];
    }
    const [tickets, total] = await Promise.all([
      TicketModel.find(filter)
        .sort({ lastActivityAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .select('-draft -triage')
        .lean(),
      TicketModel.countDocuments(filter),
    ]);
    const refs = await loadTicketRefs(tickets);
    return {
      items: tickets.map((t) => toAuthorTicketSummary(t, refs)),
      meta: buildMeta(query.page, query.pageSize, total),
    };
  }

  async get(user: AuthUser, ticketId: string): Promise<AuthorTicketDetailDto> {
    const ticket = await this.findOwnTicket(user, ticketId);
    const [refs, messages] = await Promise.all([
      loadTicketRefs([ticket]),
      TicketMessageModel.find({ ticket: ticket._id }).sort({ createdAt: 1 }).lean(),
    ]);
    return {
      ...toAuthorTicketSummary(ticket, refs),
      description: ticket.description,
      messages: messages.map((m) => ({
        id: m._id.toString(),
        senderType: m.senderType,
        senderName: m.senderType === 'ADMIN' ? `${m.senderName} · BookLeaf Support` : m.senderName,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
      })),
      canReply: ticket.status !== 'CLOSED',
    };
  }

  /** Author follow-up. Re-opens a RESOLVED ticket; CLOSED tickets need a new ticket. */
  async addMessage(user: AuthUser, ticketId: string, body: string): Promise<AuthorTicketDetailDto> {
    const ticket = await this.findOwnTicket(user, ticketId);
    if (ticket.status === 'CLOSED') {
      throw new InvalidStateTransitionError(
        'This ticket is closed. Please open a new ticket for further help.',
      );
    }
    const now = new Date();
    await TicketMessageModel.create({
      ticket: ticket._id,
      senderType: 'AUTHOR',
      sender: new Types.ObjectId(user.id),
      senderName: user.name,
      body,
      origin: null,
    });
    const reopen = ticket.status === 'RESOLVED';
    await TicketModel.updateOne(
      { _id: ticket._id },
      {
        $inc: { publicMessageCount: 1 },
        $set: {
          lastPublicSender: 'AUTHOR',
          lastActivityAt: now,
          ...(reopen ? { status: 'IN_PROGRESS', resolvedAt: null } : {}),
        },
      },
    );
    await this.deps.audit.record({
      entityType: 'TICKET',
      entityId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      action: reopen ? 'ticket.reopened' : 'ticket.author_replied',
      summary: reopen
        ? `${user.name} replied and re-opened ${formatTicketReference(ticket.ticketNumber)}`
        : `${user.name} replied on ${formatTicketReference(ticket.ticketNumber)}`,
      actor: actorFrom(user),
      ...(reopen ? { changes: [{ field: 'status', from: 'RESOLVED', to: 'IN_PROGRESS' }] } : {}),
    });
    this.publish('ticket.message.created', ticket);
    if (reopen) this.publish('ticket.status.changed', ticket);
    return this.get(user, ticketId);
  }

  private async findOwnTicket(user: AuthUser, ticketId: string): Promise<TicketDoc> {
    const authorId = requireAuthor(user);
    // Scoped lookup: another author's ticket is indistinguishable from a missing one.
    const ticket = await TicketModel.findOne({
      _id: new Types.ObjectId(ticketId),
      author: authorId,
    })
      .select('-draft')
      .lean();
    if (!ticket) throw new NotFoundError('Ticket');
    return ticket;
  }

  private publish(
    type: TicketEventType,
    ticket: Pick<TicketDoc, '_id' | 'ticketNumber' | 'author'>,
  ): void {
    this.deps.events.publish({
      type,
      ticketId: ticket._id.toString(),
      reference: formatTicketReference(ticket.ticketNumber),
      authorId: ticket.author.toString(),
      at: new Date().toISOString(),
    });
  }
}
