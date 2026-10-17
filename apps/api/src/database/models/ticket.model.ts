import { Schema, model, type Types } from 'mongoose';
import {
  AI_FAILURE_KINDS,
  MESSAGE_SENDER_TYPES,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TRIAGE_STATUSES,
  VALUE_SOURCES,
  type AiFailureKind,
  type MessageSenderType,
  type TicketCategory,
  type TicketPriority,
  type TicketStatus,
  type TriageStatus,
  type ValueSource,
} from '@bookleaf/contracts';

export interface StrategyRef {
  strategy: Types.ObjectId | null;
  name: string;
  version: number;
}

/**
 * Raw output of the most recent triage run. Kept separate from the *effective*
 * category/priority on the ticket, so an admin override is never silently replaced by
 * a later AI run and the AI's original opinion stays auditable.
 */
export interface TriageSubdoc {
  status: TriageStatus;
  source: 'AI' | 'RULES' | null;
  category: TicketCategory | null;
  categoryConfidence: number | null;
  priority: TicketPriority | null;
  rationale: string | null;
  priorityRationale: string | null;
  escalate: boolean;
  rulesApplied: string[];
  model: string | null;
  strategyVersions: StrategyRef[];
  failureKind: AiFailureKind | null;
  failureMessage: string | null;
  attempts: number;
  completedAt: Date | null;
}

/** Cached AI (or template) draft so re-opening a ticket doesn't trigger a new paid call. */
export interface DraftSubdoc {
  draftId: string;
  body: string;
  source: 'AI' | 'TEMPLATE';
  model: string | null;
  strategy: StrategyRef | null;
  knowledgeSectionsUsed: string[];
  verificationChecklist: string[];
  suggestedStatus: 'IN_PROGRESS' | 'RESOLVED';
  escalationRecommended: boolean;
  /** Public message count when generated — a newer message marks the draft stale. */
  basedOnPublicMessageCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  generatedAt: Date;
}

export interface OverrideSubdoc {
  by: Types.ObjectId;
  byName: string;
  at: Date;
}

export interface TicketDoc {
  _id: Types.ObjectId;
  ticketNumber: number;
  author: Types.ObjectId;
  book: Types.ObjectId | null;
  subject: string;
  description: string;
  status: TicketStatus;
  /** Effective values used by the queue (AI → rules → admin override). */
  category: TicketCategory | null;
  categorySource: ValueSource | null;
  categoryOverride: OverrideSubdoc | null;
  priority: TicketPriority | null;
  /** Numeric rank of `priority` (0 when unknown) so MongoDB can sort by urgency. */
  priorityRank: number;
  prioritySource: ValueSource | null;
  priorityOverride: OverrideSubdoc | null;
  triage: TriageSubdoc;
  assignee: Types.ObjectId | null;
  publicMessageCount: number;
  lastPublicSender: MessageSenderType | null;
  lastActivityAt: Date;
  firstResponseAt: Date | null;
  latestAdminResponse: { excerpt: string; at: Date } | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  draft: DraftSubdoc | null;
  /** Set only for demo tickets created by the seed script (idempotency key). */
  seedKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const strategyRefSchema = new Schema<StrategyRef>(
  {
    strategy: { type: Schema.Types.ObjectId, ref: 'AiStrategy', default: null },
    name: { type: String, required: true },
    version: { type: Number, required: true },
  },
  { _id: false },
);

const triageSchema = new Schema<TriageSubdoc>(
  {
    status: { type: String, enum: TRIAGE_STATUSES, required: true, default: 'PENDING' },
    source: { type: String, enum: ['AI', 'RULES', null], default: null },
    category: { type: String, enum: [...TICKET_CATEGORIES, null], default: null },
    categoryConfidence: { type: Number, min: 0, max: 1, default: null },
    priority: { type: String, enum: [...TICKET_PRIORITIES, null], default: null },
    rationale: { type: String, default: null, maxlength: 1000 },
    priorityRationale: { type: String, default: null, maxlength: 1000 },
    escalate: { type: Boolean, default: false },
    rulesApplied: { type: [String], default: [] },
    model: { type: String, default: null },
    strategyVersions: { type: [strategyRefSchema], default: [] },
    failureKind: { type: String, enum: [...AI_FAILURE_KINDS, null], default: null },
    failureMessage: { type: String, default: null, maxlength: 500 },
    attempts: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { _id: false },
);

const draftSchema = new Schema<DraftSubdoc>(
  {
    draftId: { type: String, required: true },
    body: { type: String, required: true },
    source: { type: String, enum: ['AI', 'TEMPLATE'], required: true },
    model: { type: String, default: null },
    strategy: { type: strategyRefSchema, default: null },
    knowledgeSectionsUsed: { type: [String], default: [] },
    verificationChecklist: { type: [String], default: [] },
    suggestedStatus: { type: String, enum: ['IN_PROGRESS', 'RESOLVED'], default: 'IN_PROGRESS' },
    escalationRecommended: { type: Boolean, default: false },
    basedOnPublicMessageCount: { type: Number, required: true },
    inputTokens: { type: Number, default: null },
    outputTokens: { type: Number, default: null },
    generatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const overrideSchema = new Schema<OverrideSubdoc>(
  {
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byName: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const ticketSchema = new Schema<TicketDoc>(
  {
    ticketNumber: { type: Number, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'Author', required: true },
    book: { type: Schema.Types.ObjectId, ref: 'Book', default: null },
    subject: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    status: { type: String, enum: TICKET_STATUSES, required: true, default: 'OPEN' },
    category: { type: String, enum: [...TICKET_CATEGORIES, null], default: null },
    categorySource: { type: String, enum: [...VALUE_SOURCES, null], default: null },
    categoryOverride: { type: overrideSchema, default: null },
    priority: { type: String, enum: [...TICKET_PRIORITIES, null], default: null },
    priorityRank: { type: Number, required: true, default: 0 },
    prioritySource: { type: String, enum: [...VALUE_SOURCES, null], default: null },
    priorityOverride: { type: overrideSchema, default: null },
    triage: { type: triageSchema, required: true, default: () => ({}) },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    publicMessageCount: { type: Number, required: true, default: 0 },
    lastPublicSender: { type: String, enum: [...MESSAGE_SENDER_TYPES, null], default: null },
    lastActivityAt: { type: Date, required: true, default: () => new Date() },
    firstResponseAt: { type: Date, default: null },
    latestAdminResponse: {
      type: new Schema({ excerpt: String, at: Date }, { _id: false }),
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    draft: { type: draftSchema, default: null },
    seedKey: { type: String },
  },
  { timestamps: true },
);

// Human-friendly reference (BL-1001).
ticketSchema.index({ ticketNumber: 1 }, { unique: true });
// Author "My Tickets" (newest first) and author-scoped lookups.
ticketSchema.index({ author: 1, createdAt: -1 });
// Admin queue default "urgency" sort: unresolved, most urgent, oldest first.
ticketSchema.index({ status: 1, priorityRank: -1, createdAt: 1 });
// Queue filtered by category.
ticketSchema.index({ category: 1, status: 1, createdAt: -1 });
// "Assigned to me" / unassigned filters and dashboard counters.
ticketSchema.index({ assignee: 1, status: 1 });
// Recently-updated sort.
ticketSchema.index({ lastActivityAt: -1 });
// Idempotent demo-ticket seeding.
ticketSchema.index(
  { seedKey: 1 },
  { unique: true, partialFilterExpression: { seedKey: { $type: 'string' } } },
);

export const TicketModel = model<TicketDoc>('Ticket', ticketSchema);
