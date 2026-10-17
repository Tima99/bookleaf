import { z } from 'zod';
import { PaginationQuerySchema } from './common';
import { BookStageSchema, type BookStage } from './enums';

/**
 * Public representation of a book. Monetary/date fields are nullable because books
 * still in production legitimately have no MRP, royalty rate or publication date.
 */
export interface BookDto {
  id: string;
  bookCode: string;
  title: string;
  isbn: string | null;
  genre: string;
  /** ISO date (YYYY-MM-DD) or null while in production. */
  publicationDate: string | null;
  /** Raw status as stored, e.g. "Published & Live" or "In Production - Cover Design". */
  status: string;
  stage: BookStage;
  /** Production sub-stage parsed from status (e.g. "Cover Design"), null once published. */
  productionStage: string | null;
  mrp: number | null;
  authorRoyaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: string | null;
  printPartner: string | null;
  availableOn: string[];
}

export const BookListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  stage: BookStageSchema.optional(),
});
export type BookListQuery = z.infer<typeof BookListQuerySchema>;

export const BookCodeParamsSchema = z.object({
  bookId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid book id'),
});

export interface AuthorProfileDto {
  id: string;
  authorCode: string;
  name: string;
  email: string;
  phone: string | null;
  city: string | null;
  joinedDate: string | null;
}

export interface RoyaltyCalendarDto {
  /** e.g. "Q4 2026 (Oct–Dec)" */
  currentQuarterLabel: string;
  currentQuarterEnd: string;
  /** Payout deadline (quarter end + 45 days) for the quarter currently being earned. */
  currentQuarterPayoutBy: string;
  /** Payout deadline for the most recently completed quarter. */
  previousQuarterPayoutBy: string;
  payoutThreshold: number;
  /** True when total pending royalty is below the ₹1,000 payout threshold. */
  pendingBelowThreshold: boolean;
}

export interface AuthorDashboardDto {
  totals: {
    totalBooks: number;
    publishedBooks: number;
    inProductionBooks: number;
    totalCopiesSold: number;
    totalRoyaltyEarned: number;
    royaltyPaid: number;
    royaltyPending: number;
    openTickets: number;
  };
  royaltyCalendar: RoyaltyCalendarDto;
  books: Array<
    Pick<
      BookDto,
      'id' | 'bookCode' | 'title' | 'status' | 'stage' | 'productionStage' | 'royaltyPending'
    >
  >;
}
