import { z } from 'zod';
import { csvEnum, DateQuerySchema, ObjectIdSchema, PaginationQuerySchema } from './common';
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TicketCategorySchema,
  TicketPrioritySchema,
  TicketStatusSchema,
  type AiFailureKind,
  type MessageSenderType,
  type ResponseOrigin,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type TriageStatus,
  type ValueSource,
} from './enums';
import type { AuthorProfileDto, BookDto } from './books';

export const TICKET_LIMITS = {
  subjectMin: 5,
  subjectMax: 150,
  descriptionMin: 20,
  descriptionMax: 5000,
  messageMax: 10000,
  noteMax: 5000,
} as const;

/* ------------------------------------------------------------------ */
/* Requests                                                           */
/* ------------------------------------------------------------------ */

export const CreateTicketRequestSchema = z.object({
  /** Book code (e.g. BK001) or null for "General / Account Level". */
  bookId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,40}$/, 'Invalid book')
    .nullable(),
  subject: z
    .string()
    .trim()
    .min(
      TICKET_LIMITS.subjectMin,
      `Subject must be at least ${TICKET_LIMITS.subjectMin} characters`,
    )
    .max(
      TICKET_LIMITS.subjectMax,
      `Subject must be at most ${TICKET_LIMITS.subjectMax} characters`,
    ),
  description: z
    .string()
    .trim()
    .min(
      TICKET_LIMITS.descriptionMin,
      `Please describe the issue in at least ${TICKET_LIMITS.descriptionMin} characters`,
    )
    .max(
      TICKET_LIMITS.descriptionMax,
      `Description must be at most ${TICKET_LIMITS.descriptionMax} characters`,
    ),
});
export type CreateTicketRequest = z.infer<typeof CreateTicketRequestSchema>;

export const CreateMessageRequestSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(TICKET_LIMITS.messageMax),
});
export type CreateMessageRequest = z.infer<typeof CreateMessageRequestSchema>;

export const AuthorTicketListQuerySchema = PaginationQuerySchema.extend({
  status: csvEnum(TICKET_STATUSES),
  search: z.string().trim().max(100).optional(),
});
export type AuthorTicketListQuery = z.infer<typeof AuthorTicketListQuerySchema>;

export const ADMIN_TICKET_SORTS = ['urgency', 'newest', 'oldest', 'updated', 'priority'] as const;

export const AdminTicketListQuerySchema = PaginationQuerySchema.extend({
  search: z.string().trim().max(100).optional(),
  status: csvEnum(TICKET_STATUSES),
  category: csvEnum(TICKET_CATEGORIES),
  priority: csvEnum(TICKET_PRIORITIES),
  /** "me", "unassigned" or an admin user id. */
  assignee: z.union([z.enum(['me', 'unassigned']), ObjectIdSchema]).optional(),
  authorId: ObjectIdSchema.optional(),
  createdFrom: DateQuerySchema.optional(),
  createdTo: DateQuerySchema.optional(),
  sort: z.enum(ADMIN_TICKET_SORTS).default('urgency'),
});
export type AdminTicketListQuery = z.infer<typeof AdminTicketListQuerySchema>;
export type AdminTicketSort = (typeof ADMIN_TICKET_SORTS)[number];

/** Query params as a client sends them (the schema above parses/coerces these). */
export interface AdminTicketListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: TicketStatus[];
  category?: TicketCategory[];
  priority?: TicketPriority[];
  assignee?: 'me' | 'unassigned' | (string & {});
  authorId?: string;
  /** YYYY-MM-DD */
  createdFrom?: string;
  /** YYYY-MM-DD (inclusive) */
  createdTo?: string;
  sort?: AdminTicketSort;
}

export const UpdateTicketRequestSchema = z
  .object({
    status: TicketStatusSchema.optional(),
    category: TicketCategorySchema.optional(),
    priority: TicketPrioritySchema.optional(),
  })
  .strict()
  .refine((v) => v.status ?? v.category ?? v.priority, {
    message: 'Provide at least one of status, category or priority',
  });
export type UpdateTicketRequest = z.infer<typeof UpdateTicketRequestSchema>;

export const AssignTicketRequestSchema = z.object({
  /** Admin user id, or null to unassign. */
  assigneeId: ObjectIdSchema.nullable(),
});
export type AssignTicketRequest = z.infer<typeof AssignTicketRequestSchema>;

export const CreateNoteRequestSchema = z.object({
  body: z.string().trim().min(1, 'Note cannot be empty').max(TICKET_LIMITS.noteMax),
});
export type CreateNoteRequest = z.infer<typeof CreateNoteRequestSchema>;

export const CreateResponseRequestSchema = z.object({
  body: z.string().trim().min(1, 'Response cannot be empty').max(TICKET_LIMITS.messageMax),
  /** Status to apply after sending. Defaults to IN_PROGRESS for open tickets. */
  statusAfter: z.enum(['IN_PROGRESS', 'RESOLVED']).optional(),
  /** Id of the AI draft the admin started from, used to record provenance. */
  draftId: z.string().max(64).nullable().optional(),
});
export type CreateResponseRequest = z.infer<typeof CreateResponseRequestSchema>;

export const GenerateDraftRequestSchema = z.object({
  /** Bypass the cached draft and call the model again. */
  force: z.boolean().default(false),
});
export type GenerateDraftRequest = z.infer<typeof GenerateDraftRequestSchema>;

/* ------------------------------------------------------------------ */
/* Responses                                                          */
/* ------------------------------------------------------------------ */

export interface TicketBookRefDto {
  id: string;
  bookCode: string;
  title: string;
}

export interface TicketMessageDto {
  id: string;
  senderType: MessageSenderType;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface AdminTicketMessageDto extends TicketMessageDto {
  origin: ResponseOrigin | null;
}

export interface AuthorTicketSummaryDto {
  id: string;
  reference: string;
  subject: string;
  book: TicketBookRefDto | null;
  category: TicketCategory | null;
  priority: TicketPriority | null;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  latestAdminResponse: { excerpt: string; createdAt: string } | null;
  /** True when the team replied after the author's last message (unread-ish signal). */
  hasTeamReply: boolean;
}

export interface AuthorTicketDetailDto extends AuthorTicketSummaryDto {
  description: string;
  messages: TicketMessageDto[];
  canReply: boolean;
}

export interface TriageDto {
  status: TriageStatus;
  /** Whether the stored category/priority came from the model or from keyword rules. */
  source: 'AI' | 'RULES' | null;
  category: TicketCategory | null;
  categoryConfidence: number | null;
  priority: TicketPriority | null;
  rationale: string | null;
  priorityRationale: string | null;
  escalate: boolean;
  rulesApplied: string[];
  model: string | null;
  strategyVersions: Array<{ strategyId: string; name: string; version: number }>;
  failureKind: AiFailureKind | null;
  failureMessage: string | null;
  attempts: number;
  completedAt: string | null;
}

export interface AdminTicketSummaryDto {
  id: string;
  reference: string;
  subject: string;
  author: { id: string; authorCode: string; name: string };
  book: TicketBookRefDto | null;
  category: TicketCategory | null;
  categorySource: ValueSource | null;
  priority: TicketPriority | null;
  prioritySource: ValueSource | null;
  status: TicketStatus;
  triageStatus: TriageStatus;
  assignee: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  firstResponseAt: string | null;
  /** True if the last public message came from the author (needs a reply). */
  awaitingTeamReply: boolean;
}

export interface InternalNoteDto {
  id: string;
  body: string;
  author: { id: string; name: string };
  createdAt: string;
}

export interface ActivityDto {
  id: string;
  action: string;
  summary: string;
  actor: { id: string | null; name: string; role: 'AUTHOR' | 'ADMIN' | 'SYSTEM' };
  ticket: { id: string; reference: string } | null;
  createdAt: string;
}

export interface AiDraftDto {
  id: string;
  body: string;
  source: 'AI' | 'TEMPLATE';
  model: string | null;
  strategy: { id: string; name: string; version: number } | null;
  knowledgeSectionsUsed: string[];
  /** Facts the admin should confirm before sending (the model must not invent them). */
  verificationChecklist: string[];
  suggestedStatus: 'IN_PROGRESS' | 'RESOLVED';
  escalationRecommended: boolean;
  generatedAt: string;
  /** True when new public messages arrived after the draft was generated. */
  stale: boolean;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
}

export interface DraftResultDto {
  draft: AiDraftDto | null;
  /** Populated when AI drafting failed or is not configured; admins can still reply manually. */
  failure: { kind: AiFailureKind; message: string } | null;
  fromCache: boolean;
}

export interface AdminTicketDetailDto extends AdminTicketSummaryDto {
  description: string;
  authorProfile: AuthorProfileDto;
  bookDetail: BookDto | null;
  triage: TriageDto;
  messages: AdminTicketMessageDto[];
  internalNotes: InternalNoteDto[];
  activity: ActivityDto[];
  draft: AiDraftDto | null;
  allowedTransitions: TicketStatus[];
}

export function formatTicketReference(ticketNumber: number): string {
  return `BL-${ticketNumber}`;
}
