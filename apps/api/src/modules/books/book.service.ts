import { Types, type QueryFilter } from 'mongoose';
import type {
  AuthorDashboardDto,
  AuthorProfileDto,
  BookDto,
  BookListQuery,
  PaginationMeta,
} from '@bookleaf/contracts';
import {
  escapeRegExp,
  getRoyaltyCalendar,
  ROYALTY_PAYOUT_THRESHOLD_INR,
  toIsoDate,
} from '@bookleaf/utils';
import { NotFoundError } from '../../common/errors';
import { buildMeta } from '../../common/http';
import { AuthorModel, BookModel, TicketModel, type BookDoc } from '../../database/models';
import { sumRoyalties, toAuthorProfileDto, toBookDto } from './book.mapper';

/**
 * Author-scoped book access. Every method takes the authenticated author's id (from the
 * session, never from the request) and filters by it, so one author can never read
 * another author's books.
 */
export class BookService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async getAuthorProfile(authorId: string): Promise<AuthorProfileDto> {
    const author = await AuthorModel.findById(authorId).lean();
    if (!author) throw new NotFoundError('Author');
    return toAuthorProfileDto(author);
  }

  async listForAuthor(
    authorId: string,
    query: BookListQuery,
  ): Promise<{ items: BookDto[]; meta: PaginationMeta }> {
    const filter: QueryFilter<BookDoc> = { author: new Types.ObjectId(authorId) };
    if (query.stage) filter.stage = query.stage;
    if (query.search) {
      const rx = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ title: rx }, { isbn: rx }, { genre: rx }, { bookCode: rx }];
    }
    const [items, total] = await Promise.all([
      BookModel.find(filter)
        // Books in production (null date) last; stable tiebreak on _id.
        .sort({ publicationDate: -1, _id: 1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      BookModel.countDocuments(filter),
    ]);
    return { items: items.map(toBookDto), meta: buildMeta(query.page, query.pageSize, total) };
  }

  async getForAuthor(authorId: string, bookCode: string): Promise<BookDto> {
    const book = await BookModel.findOne({ author: new Types.ObjectId(authorId), bookCode }).lean();
    // Same 404 whether the book doesn't exist or belongs to someone else (no enumeration).
    if (!book) throw new NotFoundError('Book');
    return toBookDto(book);
  }

  async getDashboard(authorId: string): Promise<AuthorDashboardDto> {
    const authorObjectId = new Types.ObjectId(authorId);
    const [books, openTickets] = await Promise.all([
      BookModel.find({ author: authorObjectId }).sort({ publicationDate: -1, _id: 1 }).lean(),
      TicketModel.countDocuments({
        author: authorObjectId,
        status: { $in: ['OPEN', 'IN_PROGRESS'] },
      }),
    ]);
    const totals = sumRoyalties(books);
    const calendar = getRoyaltyCalendar(this.now());

    return {
      totals: {
        totalBooks: books.length,
        publishedBooks: books.filter((b) => b.stage === 'PUBLISHED').length,
        inProductionBooks: books.filter((b) => b.stage === 'IN_PRODUCTION').length,
        totalCopiesSold: totals.totalCopiesSold,
        totalRoyaltyEarned: totals.totalRoyaltyEarned,
        royaltyPaid: totals.royaltyPaid,
        royaltyPending: totals.royaltyPending,
        openTickets,
      },
      royaltyCalendar: {
        currentQuarterLabel: calendar.current.label,
        currentQuarterEnd: toIsoDate(calendar.current.end) ?? '',
        currentQuarterPayoutBy: toIsoDate(calendar.current.payoutBy) ?? '',
        previousQuarterPayoutBy: toIsoDate(calendar.previous.payoutBy) ?? '',
        payoutThreshold: ROYALTY_PAYOUT_THRESHOLD_INR,
        pendingBelowThreshold:
          totals.royaltyPending > 0 && totals.royaltyPending < ROYALTY_PAYOUT_THRESHOLD_INR,
      },
      books: books.map((b) => {
        const dto = toBookDto(b);
        return {
          id: dto.id,
          bookCode: dto.bookCode,
          title: dto.title,
          status: dto.status,
          stage: dto.stage,
          productionStage: dto.productionStage,
          royaltyPending: dto.royaltyPending,
        };
      }),
    };
  }
}
