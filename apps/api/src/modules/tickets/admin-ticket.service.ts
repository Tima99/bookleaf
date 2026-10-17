import { Types } from 'mongoose';
import {
  formatTicketReference,
  PRIORITY_RANK,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_TRANSITIONS,
  type AdminTicketDetailDto,
  type AdminTicketListQuery,
  type AdminTicketSummaryDto,
  type AdminUserDto,
  type CreateResponseRequest,
  type DraftResultDto,
  type PaginationMeta,
  type ResponseOrigin,
  type TicketEventType,
  type TicketStatus,
  type UpdateTicketRequest,
} from '@bookleaf/contracts';
import { escapeRegExp } from '@bookleaf/utils';
import type { AuthUser } from '../../common/auth-user';
import { InvalidStateTransitionError, NotFoundError, ValidationError } from '../../common/errors';
import { buildMeta } from '../../common/http';
import {
  AuthorModel,
  BookModel,
  InternalNoteModel,
  TicketMessageModel,
  TicketModel,
  UserModel,
  type AuditChange,
  type TicketDoc,
} from '../../database/models';
import type { TicketEventBus } from '../../events/event-bus';
import { actorFrom, type AuditService } from '../audit/audit.service';
import { toAuthorProfileDto, toBookDto } from '../books/book.mapper';
import { toDraftDto, type ResponseDraftService } from '../ai/services/response-draft.service';
import type { TriageService } from '../ai/services/triage.service';
import { excerpt, loadTicketRefs, toAdminTicketSummary, toTriageDto } from './ticket.mapper';

const SORTS: Record<AdminTicketListQuery['sort'], Record<string, 1 | -1>> = {
  // Most urgent first, then oldest first within the same priority.
  urgency: { priorityRank: -1, createdAt: 1, _id: 1 },
  priority: { priorityRank: -1, createdAt: -1, _id: -1 },
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  updated: { lastActivityAt: -1, _id: -1 },
};

/**
 * Admin ticket workflow: queue, overrides, assignment, notes and responses.
 * Every state change writes an audit event and publishes a real-time event *after*
 * the database write succeeds.
 */
export class AdminTicketService {
  constructor(
    private readonly deps: {
      triage: TriageService;
      drafts: ResponseDraftService;
      audit: AuditService;
      events: TicketEventBus;
    },
  ) {}

  /* ------------------------------- queue ------------------------------ */

  async list(
    user: AuthUser,
    query: AdminTicketListQuery,
  ): Promise<{ items: AdminTicketSummaryDto[]; meta: PaginationMeta }> {
    const filter = await this.buildFilter(user, query);
    const [tickets, total] = await Promise.all([
      TicketModel.find(filter)
        .sort(SORTS[query.sort])
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .select('-draft -description')
        .lean(),
      TicketModel.countDocuments(filter),
    ]);
    const refs = await loadTicketRefs(tickets);
    return {
      items: tickets.map((t) => toAdminTicketSummary(t, refs)),
      meta: buildMeta(query.page, query.pageSize, total),
    };
  }

  private async buildFilter(
    user: AuthUser,
    query: AdminTicketListQuery,
  ): Promise<Record<string, unknown>> {
    const filter: Record<string, unknown> = {};
    if (query.status?.length) filter.status = { $in: query.status };
    if (query.category?.length) filter.category = { $in: query.category };
    if (query.priority?.length) filter.priority = { $in: query.priority };
    if (query.authorId) filter.author = new Types.ObjectId(query.authorId);
    if (query.assignee === 'me') filter.assignee = new Types.ObjectId(user.id);
    else if (query.assignee === 'unassigned') filter.assignee = null;
    else if (query.assignee) filter.assignee = new Types.ObjectId(query.assignee);

    if (query.createdFrom || query.createdTo) {
      const range: Record<string, Date> = {};
      if (query.createdFrom) range.$gte = query.createdFrom;
      if (query.createdTo) {
        // Inclusive end-of-day when a plain date is given.
        const end = new Date(query.createdTo);
        if (end.getUTCHours() === 0 && end.getUTCMinutes() === 0) end.setUTCHours(23, 59, 59, 999);
        range.$lte = end;
      }
      filter.createdAt = range;
    }

    if (query.search) {
      const term = query.search.trim();
      const ref = /^(?:bl-?)?(\d{3,9})$/i.exec(term);
      const rx = new RegExp(escapeRegExp(term), 'i');
      // Author name/email matches are resolved to ids (bounded) and OR-ed in.
      const authors = await AuthorModel.find({
        $or: [{ name: rx }, { email: rx }, { authorCode: rx }],
      })
        .select('_id')
        .limit(50)
        .lean();
      filter.$or = [
        { subject: rx },
        ...(authors.length ? [{ author: { $in: authors.map((a) => a._id) } }] : []),
        ...(ref?.[1] ? [{ ticketNumber: Number(ref[1]) }] : []),
      ];
    }
    return filter;
  }

  /* ------------------------------- detail ----------------------------- */

  async get(ticketId: string): Promise<AdminTicketDetailDto> {
    const ticket = await this.findTicket(ticketId);
    const [refs, author, book, messages, notes, activity] = await Promise.all([
      loadTicketRefs([ticket]),
      AuthorModel.findById(ticket.author).lean(),
      ticket.book ? BookModel.findById(ticket.book).lean() : Promise.resolve(null),
      TicketMessageModel.find({ ticket: ticket._id }).sort({ createdAt: 1 }).lean(),
      InternalNoteModel.find({ ticket: ticket._id }).sort({ createdAt: 1 }).lean(),
      this.deps.audit.listForEntity('TICKET', ticket._id.toString(), 50),
    ]);
    if (!author) throw new NotFoundError('Author');

    return {
      ...toAdminTicketSummary(ticket, refs),
      description: ticket.description,
      authorProfile: toAuthorProfileDto(author),
      bookDetail: book ? toBookDto(book) : null,
      triage: toTriageDto(ticket),
      messages: messages.map((m) => ({
        id: m._id.toString(),
        senderType: m.senderType,
        senderName: m.senderName,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        origin: m.origin,
      })),
      internalNotes: notes.map((n) => ({
        id: n._id.toString(),
        body: n.body,
        author: { id: n.author.toString(), name: n.authorName },
        createdAt: n.createdAt.toISOString(),
      })),
      activity,
      draft: ticket.draft ? toDraftDto(ticket.draft, ticket.publicMessageCount) : null,
      allowedTransitions: [...TICKET_STATUS_TRANSITIONS[ticket.status]],
    };
  }

  /* ----------------------- status / overrides ------------------------- */

  async update(
    user: AuthUser,
    ticketId: string,
    input: UpdateTicketRequest,
  ): Promise<AdminTicketDetailDto> {
    const ticket = await this.findTicket(ticketId);
    const set: Record<string, unknown> = { lastActivityAt: new Date() };
    const changes: AuditChange[] = [];
    const summaries: string[] = [];
    const events: TicketEventType[] = [];
    const override = { by: new Types.ObjectId(user.id), byName: user.name, at: new Date() };

    if (input.status && input.status !== ticket.status) {
      this.assertTransition(ticket.status, input.status);
      Object.assign(set, this.statusSideEffects(input.status));
      set.status = input.status;
      changes.push({ field: 'status', from: ticket.status, to: input.status });
      summaries.push(`status → ${TICKET_STATUS_LABELS[input.status]}`);
      events.push('ticket.status.changed');
    }
    if (
      input.category &&
      (input.category !== ticket.category || ticket.categorySource !== 'ADMIN')
    ) {
      Object.assign(set, {
        category: input.category,
        categorySource: 'ADMIN',
        categoryOverride: override,
      });
      changes.push({ field: 'category', from: ticket.category, to: input.category });
      summaries.push(`category → ${TICKET_CATEGORY_LABELS[input.category]}`);
      events.push('ticket.updated');
    }
    if (
      input.priority &&
      (input.priority !== ticket.priority || ticket.prioritySource !== 'ADMIN')
    ) {
      Object.assign(set, {
        priority: input.priority,
        priorityRank: PRIORITY_RANK[input.priority],
        prioritySource: 'ADMIN',
        priorityOverride: override,
      });
      changes.push({ field: 'priority', from: ticket.priority, to: input.priority });
      summaries.push(`priority → ${input.priority}`);
      events.push('ticket.updated');
    }
    if (!changes.length) return this.get(ticketId);

    await TicketModel.updateOne({ _id: ticket._id }, { $set: set });
    await this.deps.audit.record({
      entityType: 'TICKET',
      entityId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      action: 'ticket.updated',
      summary: `${user.name} updated ${formatTicketReference(ticket.ticketNumber)}: ${summaries.join(', ')}`,
      actor: actorFrom(user),
      changes,
    });
    for (const type of new Set(events)) this.publish(type, ticket);
    return this.get(ticketId);
  }

  async assign(
    user: AuthUser,
    ticketId: string,
    assigneeId: string | null,
  ): Promise<AdminTicketDetailDto> {
    const ticket = await this.findTicket(ticketId);
    let assigneeName: string | null = null;
    if (assigneeId) {
      const assignee = await UserModel.findOne({
        _id: new Types.ObjectId(assigneeId),
        role: 'ADMIN',
        isActive: true,
      })
        .select('name')
        .lean();
      if (!assignee)
        throw new ValidationError(
          'Tickets can only be assigned to an active admin',
          undefined,
          422,
        );
      assigneeName = assignee.name;
    }
    const previous = ticket.assignee?.toString() ?? null;
    if (previous === assigneeId) return this.get(ticketId);

    await TicketModel.updateOne(
      { _id: ticket._id },
      {
        $set: {
          assignee: assigneeId ? new Types.ObjectId(assigneeId) : null,
          lastActivityAt: new Date(),
        },
      },
    );
    await this.deps.audit.record({
      entityType: 'TICKET',
      entityId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      action: assigneeId ? 'ticket.assigned' : 'ticket.unassigned',
      summary: assigneeId
        ? `${user.name} assigned ${formatTicketReference(ticket.ticketNumber)} to ${assigneeId === user.id ? 'themselves' : assigneeName}`
        : `${user.name} unassigned ${formatTicketReference(ticket.ticketNumber)}`,
      actor: actorFrom(user),
      changes: [{ field: 'assignee', from: previous, to: assigneeId }],
    });
    this.publish('ticket.assigned', ticket);
    return this.get(ticketId);
  }

  /* --------------------------- notes / replies ------------------------ */

  async addNote(user: AuthUser, ticketId: string, body: string): Promise<AdminTicketDetailDto> {
    const ticket = await this.findTicket(ticketId);
    await InternalNoteModel.create({
      ticket: ticket._id,
      author: new Types.ObjectId(user.id),
      authorName: user.name,
      body,
    });
    await TicketModel.updateOne({ _id: ticket._id }, { $set: { lastActivityAt: new Date() } });
    await this.deps.audit.record({
      entityType: 'TICKET',
      entityId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      action: 'ticket.note_added',
      // The note body is intentionally not copied into the audit summary.
      summary: `${user.name} added an internal note on ${formatTicketReference(ticket.ticketNumber)}`,
      actor: actorFrom(user),
    });
    this.publish('ticket.note.created', ticket);
    return this.get(ticketId);
  }

  async respond(
    user: AuthUser,
    ticketId: string,
    input: CreateResponseRequest,
  ): Promise<AdminTicketDetailDto> {
    const ticket = await this.findTicket(ticketId);
    if (ticket.status === 'CLOSED') {
      throw new InvalidStateTransitionError('This ticket is closed. Re-open it before replying.');
    }

    const origin = this.responseOrigin(ticket, input);
    const nextStatus: TicketStatus =
      input.statusAfter ?? (ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status);
    if (nextStatus !== ticket.status) this.assertTransition(ticket.status, nextStatus);

    const now = new Date();
    await TicketMessageModel.create({
      ticket: ticket._id,
      senderType: 'ADMIN',
      sender: new Types.ObjectId(user.id),
      senderName: user.name,
      body: input.body,
      origin,
    });
    await TicketModel.updateOne(
      { _id: ticket._id },
      {
        $inc: { publicMessageCount: 1 },
        $set: {
          lastPublicSender: 'ADMIN',
          lastActivityAt: now,
          latestAdminResponse: { excerpt: excerpt(input.body), at: now },
          draft: null,
          ...(ticket.firstResponseAt ? {} : { firstResponseAt: now }),
          // Whoever answers an unassigned ticket owns it.
          ...(ticket.assignee ? {} : { assignee: new Types.ObjectId(user.id) }),
          ...(nextStatus !== ticket.status
            ? { status: nextStatus, ...this.statusSideEffects(nextStatus) }
            : {}),
        },
      },
    );

    const changes: AuditChange[] = [];
    if (nextStatus !== ticket.status)
      changes.push({ field: 'status', from: ticket.status, to: nextStatus });
    await this.deps.audit.record({
      entityType: 'TICKET',
      entityId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      action: 'ticket.responded',
      summary: `${user.name} replied to ${formatTicketReference(ticket.ticketNumber)} (${this.originLabel(origin)})${
        nextStatus !== ticket.status ? ` and set status to ${TICKET_STATUS_LABELS[nextStatus]}` : ''
      }`,
      actor: actorFrom(user),
      changes,
    });
    this.publish('ticket.message.created', ticket);
    if (nextStatus !== ticket.status) this.publish('ticket.status.changed', ticket);
    return this.get(ticketId);
  }

  /* -------------------------------- AI -------------------------------- */

  /** Re-runs triage on demand. Admin overrides are preserved by the triage service. */
  async retriage(user: AuthUser, ticketId: string): Promise<AdminTicketDetailDto> {
    const ticket = await this.findTicket(ticketId);
    await this.deps.triage.triageTicket(ticket._id.toString());
    await this.deps.audit.record({
      entityType: 'TICKET',
      entityId: ticket._id,
      ticketNumber: ticket.ticketNumber,
      action: 'ticket.retriaged',
      summary: `${user.name} re-ran AI triage on ${formatTicketReference(ticket.ticketNumber)}`,
      actor: actorFrom(user),
    });
    return this.get(ticketId);
  }

  async draft(ticketId: string, force: boolean): Promise<DraftResultDto> {
    const ticket = await this.findTicket(ticketId);
    return this.deps.drafts.getOrGenerate(ticket._id.toString(), { force });
  }

  async listAdmins(): Promise<AdminUserDto[]> {
    const admins = await UserModel.find({ role: 'ADMIN', isActive: true })
      .sort({ name: 1 })
      .select('name email')
      .lean();
    return admins.map((a) => ({ id: a._id.toString(), name: a.name, email: a.email }));
  }

  /* ------------------------------ helpers ----------------------------- */

  private assertTransition(from: TicketStatus, to: TicketStatus): void {
    if (!TICKET_STATUS_TRANSITIONS[from].includes(to)) {
      throw new InvalidStateTransitionError(
        `Cannot move a ticket from ${TICKET_STATUS_LABELS[from]} to ${TICKET_STATUS_LABELS[to]}`,
      );
    }
  }

  private statusSideEffects(status: TicketStatus): Record<string, Date | null> {
    const now = new Date();
    switch (status) {
      case 'RESOLVED':
        return { resolvedAt: now };
      case 'CLOSED':
        return { closedAt: now };
      default:
        return { resolvedAt: null, closedAt: null };
    }
  }

  /** Provenance: was the reply typed manually, sent from an AI draft as-is, or edited? */
  private responseOrigin(ticket: TicketDoc, input: CreateResponseRequest): ResponseOrigin {
    const draft = ticket.draft;
    if (!input.draftId || !draft || draft.draftId !== input.draftId) return 'MANUAL';
    if (draft.source === 'TEMPLATE') return 'TEMPLATE';
    const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
    return normalise(draft.body) === normalise(input.body)
      ? 'AI_DRAFT_UNEDITED'
      : 'AI_DRAFT_EDITED';
  }

  private originLabel(origin: ResponseOrigin): string {
    return {
      MANUAL: 'written manually',
      AI_DRAFT_EDITED: 'AI draft, edited',
      AI_DRAFT_UNEDITED: 'AI draft, unedited',
      TEMPLATE: 'from template',
    }[origin];
  }

  private async findTicket(ticketId: string): Promise<TicketDoc> {
    const ticket = await TicketModel.findById(ticketId).lean();
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
