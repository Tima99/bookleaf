import { z } from 'zod';

/**
 * Canonical enum-like constants shared by the API and the web app.
 * Always import these instead of writing string literals by hand.
 */

export const USER_ROLES = ['AUTHOR', 'ADMIN'] as const;
export const UserRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const TICKET_CATEGORIES = [
  'ROYALTY_PAYMENTS',
  'ISBN_METADATA',
  'PRINTING_QUALITY',
  'DISTRIBUTION_AVAILABILITY',
  'BOOK_STATUS_PRODUCTION',
  'GENERAL_INQUIRY',
] as const;
export const TicketCategorySchema = z.enum(TICKET_CATEGORIES);
export type TicketCategory = z.infer<typeof TicketCategorySchema>;

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  ROYALTY_PAYMENTS: 'Royalty & Payments',
  ISBN_METADATA: 'ISBN & Metadata Issues',
  PRINTING_QUALITY: 'Printing & Quality',
  DISTRIBUTION_AVAILABILITY: 'Distribution & Availability',
  BOOK_STATUS_PRODUCTION: 'Book Status & Production Updates',
  GENERAL_INQUIRY: 'General Inquiry',
};

export const TICKET_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export const TicketPrioritySchema = z.enum(TICKET_PRIORITIES);
export type TicketPriority = z.infer<typeof TicketPrioritySchema>;

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

/** Numeric rank persisted on tickets so the queue can sort by urgency in MongoDB. */
export const PRIORITY_RANK: Record<TicketPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export const TicketStatusSchema = z.enum(TICKET_STATUSES);
export type TicketStatus = z.infer<typeof TicketStatusSchema>;

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
};

export const UNRESOLVED_STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS'];

/**
 * Allowed status transitions. Admins drive the lifecycle; an author follow-up on a
 * RESOLVED ticket re-opens it (handled in the ticket service, not here).
 */
export const TICKET_STATUS_TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: ['IN_PROGRESS'],
};

/** Where the effective category/priority value came from. ADMIN always wins. */
export const VALUE_SOURCES = ['AI', 'RULES', 'ADMIN'] as const;
export const ValueSourceSchema = z.enum(VALUE_SOURCES);
export type ValueSource = z.infer<typeof ValueSourceSchema>;

export const TRIAGE_STATUSES = ['PENDING', 'COMPLETED', 'FAILED', 'SKIPPED'] as const;
export const TriageStatusSchema = z.enum(TRIAGE_STATUSES);
export type TriageStatus = z.infer<typeof TriageStatusSchema>;

export const MESSAGE_SENDER_TYPES = ['AUTHOR', 'ADMIN'] as const;
export const MessageSenderTypeSchema = z.enum(MESSAGE_SENDER_TYPES);
export type MessageSenderType = z.infer<typeof MessageSenderTypeSchema>;

/** Provenance of a public admin reply: typed by hand, or derived from an AI draft. */
export const RESPONSE_ORIGINS = [
  'MANUAL',
  'AI_DRAFT_EDITED',
  'AI_DRAFT_UNEDITED',
  'TEMPLATE',
] as const;
export const ResponseOriginSchema = z.enum(RESPONSE_ORIGINS);
export type ResponseOrigin = z.infer<typeof ResponseOriginSchema>;

export const BOOK_STAGES = ['PUBLISHED', 'IN_PRODUCTION'] as const;
export const BookStageSchema = z.enum(BOOK_STAGES);
export type BookStage = z.infer<typeof BookStageSchema>;

export const AI_STRATEGY_KINDS = ['CLASSIFICATION', 'PRIORITY', 'RESPONSE'] as const;
export const AiStrategyKindSchema = z.enum(AI_STRATEGY_KINDS);
export type AiStrategyKind = z.infer<typeof AiStrategyKindSchema>;

export const AI_STRATEGY_KIND_LABELS: Record<AiStrategyKind, string> = {
  CLASSIFICATION: 'Classification',
  PRIORITY: 'Priority scoring',
  RESPONSE: 'Response drafting',
};

export const AI_PROVIDERS = ['anthropic', 'openai'] as const;
export const AiProviderSchema = z.enum(AI_PROVIDERS);
export type AiProvider = z.infer<typeof AiProviderSchema>;

export const AI_RUN_KINDS = ['TRIAGE', 'DRAFT', 'STRATEGY_TEST'] as const;
export const AiRunKindSchema = z.enum(AI_RUN_KINDS);
export type AiRunKind = z.infer<typeof AiRunKindSchema>;

export const AI_FAILURE_KINDS = [
  'NOT_CONFIGURED',
  'RATE_LIMITED',
  'TIMEOUT',
  'PROVIDER_ERROR',
  'INVALID_OUTPUT',
  'CIRCUIT_OPEN',
] as const;
export const AiFailureKindSchema = z.enum(AI_FAILURE_KINDS);
export type AiFailureKind = z.infer<typeof AiFailureKindSchema>;

export const KNOWLEDGE_SECTION_IDS = [
  'company-overview',
  'royalty-policy',
  'isbn-policy',
  'printing-quality',
  'distribution-availability',
  'production-stages',
  'metadata-updates',
  'communication-tone',
] as const;
export const KnowledgeSectionIdSchema = z.enum(KNOWLEDGE_SECTION_IDS);
export type KnowledgeSectionId = z.infer<typeof KnowledgeSectionIdSchema>;
