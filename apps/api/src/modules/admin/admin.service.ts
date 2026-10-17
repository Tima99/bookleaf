import { Types } from 'mongoose';
import type {
  TicketStatus,
  AdminAuthorDetailDto,
  AdminAuthorListItemDto,
  AdminAuthorListQuery,
  AdminDashboardDto,
  PaginationMeta,
  TicketCategory,
} from '@bookleaf/contracts';
import { escapeRegExp } from '@bookleaf/utils';
import type { AuthUser } from '../../common/auth-user';
import { NotFoundError } from '../../common/errors';
import { buildMeta } from '../../common/http';
import { AuthorModel, BookModel, TicketModel, type TicketDoc } from '../../database/models';
import type { AuditService } from '../audit/audit.service';
import type { AiRunService } from '../ai/services/ai-run.service';
import type { LlmClient } from '../ai/providers/llm-client';
import { sumRoyalties, toAuthorProfileDto, toBookDto } from '../books/book.mapper';
import { loadTicketRefs, toAdminTicketSummary } from '../tickets/ticket.mapper';

const UNRESOLVED: TicketStatus[] = ['OPEN', 'IN_PROGRESS'];

interface CountsFacet {
  byStatus: Array<{ _id: string; count: number }>;
  critical: Array<{ count: number }>;
  high: Array<{ count: number }>;
  unassigned: Array<{ count: number }>;
  awaiting: Array<{ count: number }>;
  mine: Array<{ count: number }>;
  byCategory: Array<{ _id: TicketCategory | null; count: number }>;
  firstResponse: Array<{ avgMs: number | null }>;
}

/** Operations dashboard and author directory — computed from real data, no fabricated metrics. */
export class AdminService {
  constructor(private readonly deps: { audit: AuditService; runs: AiRunService; llm: LlmClient }) {}

  async dashboard(user: AuthUser): Promise<AdminDashboardDto> {
    const unresolved = { status: { $in: UNRESOLVED } };
    const [facet] = await TicketModel.aggregate<CountsFacet>([
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          critical: [{ $match: { ...unresolved, priority: 'CRITICAL' } }, { $count: 'count' }],
          high: [{ $match: { ...unresolved, priority: 'HIGH' } }, { $count: 'count' }],
          unassigned: [{ $match: { ...unresolved, assignee: null } }, { $count: 'count' }],
          awaiting: [
            {
              $match: {
                ...unresolved,
                $or: [{ publicMessageCount: 0 }, { lastPublicSender: 'AUTHOR' }],
              },
            },
            { $count: 'count' },
          ],
          mine: [
            { $match: { ...unresolved, assignee: new Types.ObjectId(user.id) } },
            { $count: 'count' },
          ],
          byCategory: [
            { $match: unresolved },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          firstResponse: [
            { $match: { firstResponseAt: { $ne: null } } },
            {
              $group: {
                _id: null,
                avgMs: { $avg: { $subtract: ['$firstResponseAt', '$createdAt'] } },
              },
            },
          ],
        },
      },
    ]);

    const status = new Map((facet?.byStatus ?? []).map((s) => [s._id, s.count]));
    const first = (rows: Array<{ count: number }> | undefined) => rows?.[0]?.count ?? 0;

    const [needsAttentionDocs, recentActivity, ai] = await Promise.all([
      TicketModel.find(unresolved)
        .sort({ priorityRank: -1, createdAt: 1, _id: 1 })
        .limit(8)
        .select('-draft -description')
        .lean<TicketDoc[]>(),
      this.deps.audit.listRecent(12),
      this.deps.runs.last24h(),
    ]);
    const refs = await loadTicketRefs(needsAttentionDocs);
    const avgMs = facet?.firstResponse?.[0]?.avgMs ?? null;

    return {
      counts: {
        total: [...status.values()].reduce((a, b) => a + b, 0),
        open: status.get('OPEN') ?? 0,
        inProgress: status.get('IN_PROGRESS') ?? 0,
        resolved: status.get('RESOLVED') ?? 0,
        closed: status.get('CLOSED') ?? 0,
        criticalUnresolved: first(facet?.critical),
        highUnresolved: first(facet?.high),
        unassignedUnresolved: first(facet?.unassigned),
        awaitingTeamReply: first(facet?.awaiting),
        myUnresolved: first(facet?.mine),
      },
      avgFirstResponseMinutes: avgMs === null ? null : Math.round(avgMs / 60_000),
      unresolvedByCategory: (facet?.byCategory ?? []).map((c) => ({
        category: c._id,
        count: c.count,
      })),
      needsAttention: needsAttentionDocs.map((t) => toAdminTicketSummary(t, refs)),
      recentActivity,
      ai: {
        configured: this.deps.llm.isConfigured(),
        runsLast24h: ai.runs,
        failuresLast24h: ai.failures,
      },
    };
  }

  async listAuthors(
    query: AdminAuthorListQuery,
  ): Promise<{ items: AdminAuthorListItemDto[]; meta: PaginationMeta }> {
    const filter: Record<string, unknown> = {};
    if (query.search) {
      const rx = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { authorCode: rx }, { city: rx }];
    }
    const [authors, total] = await Promise.all([
      AuthorModel.find(filter)
        .sort({ name: 1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      AuthorModel.countDocuments(filter),
    ]);
    const ids = authors.map((a) => a._id);
    const [bookCounts, ticketCounts] = await Promise.all([
      BookModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { author: { $in: ids } } },
        { $group: { _id: '$author', count: { $sum: 1 } } },
      ]),
      TicketModel.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { author: { $in: ids }, status: { $in: UNRESOLVED } } },
        { $group: { _id: '$author', count: { $sum: 1 } } },
      ]),
    ]);
    const books = new Map(bookCounts.map((b) => [b._id.toString(), b.count]));
    const tickets = new Map(ticketCounts.map((t) => [t._id.toString(), t.count]));
    return {
      items: authors.map((a) => ({
        ...toAuthorProfileDto(a),
        bookCount: books.get(a._id.toString()) ?? 0,
        openTicketCount: tickets.get(a._id.toString()) ?? 0,
      })),
      meta: buildMeta(query.page, query.pageSize, total),
    };
  }

  async getAuthor(authorId: string): Promise<AdminAuthorDetailDto> {
    const author = await AuthorModel.findById(authorId).lean();
    if (!author) throw new NotFoundError('Author');
    const [books, tickets] = await Promise.all([
      BookModel.find({ author: author._id }).sort({ publicationDate: -1, _id: 1 }).lean(),
      TicketModel.find({ author: author._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .select('-draft -description')
        .lean<TicketDoc[]>(),
    ]);
    const refs = await loadTicketRefs(tickets);
    const totals = sumRoyalties(books);
    return {
      author: toAuthorProfileDto(author),
      books: books.map(toBookDto),
      tickets: tickets.map((t) => toAdminTicketSummary(t, refs)),
      totals,
    };
  }
}
