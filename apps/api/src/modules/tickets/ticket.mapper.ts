import { type Types } from 'mongoose';
import {
  formatTicketReference,
  UNRESOLVED_STATUSES,
  type AdminTicketSummaryDto,
  type AuthorTicketSummaryDto,
  type TicketBookRefDto,
  type TriageDto,
} from '@bookleaf/contracts';
import { AuthorModel, BookModel, UserModel, type TicketDoc } from '../../database/models';

export interface TicketRefs {
  authors: Map<string, { authorCode: string; name: string }>;
  books: Map<string, TicketBookRefDto>;
  users: Map<string, string>;
}

/** Batch-loads the authors/books/assignees referenced by a page of tickets (no N+1). */
export async function loadTicketRefs(tickets: TicketDoc[]): Promise<TicketRefs> {
  const unique = (ids: Array<Types.ObjectId | null>) => [
    ...new Set(ids.filter((id): id is Types.ObjectId => id !== null).map((id) => id.toString())),
  ];
  const [authors, books, users] = await Promise.all([
    AuthorModel.find({ _id: { $in: unique(tickets.map((t) => t.author)) } })
      .select('authorCode name')
      .lean(),
    BookModel.find({ _id: { $in: unique(tickets.map((t) => t.book)) } })
      .select('bookCode title')
      .lean(),
    UserModel.find({ _id: { $in: unique(tickets.map((t) => t.assignee)) } })
      .select('name')
      .lean(),
  ]);
  return {
    authors: new Map(
      authors.map((a) => [a._id.toString(), { authorCode: a.authorCode, name: a.name }]),
    ),
    books: new Map(
      books.map((b) => [
        b._id.toString(),
        { id: b._id.toString(), bookCode: b.bookCode, title: b.title },
      ]),
    ),
    users: new Map(users.map((u) => [u._id.toString(), u.name])),
  };
}

function bookRef(ticket: TicketDoc, refs: TicketRefs): TicketBookRefDto | null {
  return ticket.book ? (refs.books.get(ticket.book.toString()) ?? null) : null;
}

export function isAwaitingTeamReply(
  ticket: Pick<TicketDoc, 'status' | 'publicMessageCount' | 'lastPublicSender'>,
): boolean {
  return (
    UNRESOLVED_STATUSES.includes(ticket.status) &&
    (ticket.publicMessageCount === 0 || ticket.lastPublicSender === 'AUTHOR')
  );
}

export function toAuthorTicketSummary(ticket: TicketDoc, refs: TicketRefs): AuthorTicketSummaryDto {
  return {
    id: ticket._id.toString(),
    reference: formatTicketReference(ticket.ticketNumber),
    subject: ticket.subject,
    book: bookRef(ticket, refs),
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastActivityAt: ticket.lastActivityAt.toISOString(),
    latestAdminResponse: ticket.latestAdminResponse
      ? {
          excerpt: ticket.latestAdminResponse.excerpt,
          createdAt: ticket.latestAdminResponse.at.toISOString(),
        }
      : null,
    hasTeamReply: ticket.lastPublicSender === 'ADMIN',
  };
}

export function toAdminTicketSummary(ticket: TicketDoc, refs: TicketRefs): AdminTicketSummaryDto {
  const author = refs.authors.get(ticket.author.toString());
  return {
    id: ticket._id.toString(),
    reference: formatTicketReference(ticket.ticketNumber),
    subject: ticket.subject,
    author: {
      id: ticket.author.toString(),
      authorCode: author?.authorCode ?? '—',
      name: author?.name ?? 'Unknown author',
    },
    book: bookRef(ticket, refs),
    category: ticket.category,
    categorySource: ticket.categorySource,
    priority: ticket.priority,
    prioritySource: ticket.prioritySource,
    status: ticket.status,
    triageStatus: ticket.triage?.status ?? 'PENDING',
    assignee: ticket.assignee
      ? {
          id: ticket.assignee.toString(),
          name: refs.users.get(ticket.assignee.toString()) ?? 'Unknown admin',
        }
      : null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    lastActivityAt: ticket.lastActivityAt.toISOString(),
    firstResponseAt: ticket.firstResponseAt ? ticket.firstResponseAt.toISOString() : null,
    awaitingTeamReply: isAwaitingTeamReply(ticket),
  };
}

export function toTriageDto(ticket: TicketDoc): TriageDto {
  const t = ticket.triage;
  return {
    status: t?.status ?? 'PENDING',
    source: t?.source ?? null,
    category: t?.category ?? null,
    categoryConfidence: t?.categoryConfidence ?? null,
    priority: t?.priority ?? null,
    rationale: t?.rationale ?? null,
    priorityRationale: t?.priorityRationale ?? null,
    escalate: t?.escalate ?? false,
    rulesApplied: t?.rulesApplied ?? [],
    model: t?.model ?? null,
    strategyVersions: (t?.strategyVersions ?? []).map((s) => ({
      strategyId: s.strategy?.toString() ?? '',
      name: s.name,
      version: s.version,
    })),
    failureKind: t?.failureKind ?? null,
    failureMessage: t?.failureMessage ?? null,
    attempts: t?.attempts ?? 0,
    completedAt: t?.completedAt ? t.completedAt.toISOString() : null,
  };
}

export function excerpt(text: string, max = 220): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
