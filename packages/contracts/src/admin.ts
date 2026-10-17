import { z } from 'zod';
import { PaginationQuerySchema } from './common';
import type { AuthorProfileDto, BookDto } from './books';
import type { TicketCategory } from './enums';
import type { ActivityDto, AdminTicketSummaryDto } from './tickets';

export const AdminAuthorListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
});
export type AdminAuthorListQuery = z.infer<typeof AdminAuthorListQuerySchema>;

export interface AdminAuthorListItemDto extends AuthorProfileDto {
  bookCount: number;
  openTicketCount: number;
}

export interface AdminAuthorDetailDto {
  author: AuthorProfileDto;
  books: BookDto[];
  tickets: AdminTicketSummaryDto[];
  totals: {
    totalRoyaltyEarned: number;
    royaltyPaid: number;
    royaltyPending: number;
    totalCopiesSold: number;
  };
}

export interface AdminDashboardDto {
  counts: {
    total: number;
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    criticalUnresolved: number;
    highUnresolved: number;
    unassignedUnresolved: number;
    awaitingTeamReply: number;
    myUnresolved: number;
  };
  /** Mean minutes from ticket creation to first public admin response; null if no data. */
  avgFirstResponseMinutes: number | null;
  unresolvedByCategory: Array<{ category: TicketCategory | null; count: number }>;
  needsAttention: AdminTicketSummaryDto[];
  recentActivity: ActivityDto[];
  ai: { configured: boolean; runsLast24h: number; failuresLast24h: number };
}
