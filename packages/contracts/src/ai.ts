import { z } from 'zod';
import { ObjectIdSchema, PaginationQuerySchema } from './common';
import {
  AiProviderSchema,
  AiStrategyKindSchema,
  KnowledgeSectionIdSchema,
  TicketCategorySchema,
  TicketPrioritySchema,
  type AiFailureKind,
  type AiProvider,
  type AiRunKind,
  type AiStrategyKind,
  type KnowledgeSectionId,
  type TicketCategory,
  type TicketPriority,
} from './enums';
import { TICKET_LIMITS, type AiDraftDto } from './tickets';

export const STRATEGY_LIMITS = {
  nameMax: 80,
  purposeMax: 300,
  instructionsMax: 6000,
  categoryInstructionsMax: 3000,
  toneMax: 800,
  ruleMax: 300,
  rulesMax: 15,
  keywordsMax: 25,
  changeNoteMax: 300,
} as const;

/** Deterministic keyword rule: if any keyword matches, priority is at least `minimumPriority`. */
export const PriorityFloorRuleSchema = z.object({
  label: z.string().trim().min(1).max(80),
  keywords: z
    .array(z.string().trim().toLowerCase().min(2).max(60))
    .min(1)
    .max(STRATEGY_LIMITS.keywordsMax),
  minimumPriority: TicketPrioritySchema,
});
export type PriorityFloorRule = z.infer<typeof PriorityFloorRuleSchema>;

/**
 * Versioned, admin-editable configuration. Every save produces a new immutable version;
 * tickets record the strategy id + version that produced their AI output.
 */
export const AiStrategyConfigSchema = z.object({
  /** System prompt / instruction template. Supports {{placeholders}} documented in AI_PROMPTS.md. */
  instructions: z.string().trim().min(20).max(STRATEGY_LIMITS.instructionsMax),
  categoryInstructions: z.string().trim().max(STRATEGY_LIMITS.categoryInstructionsMax).default(''),
  tone: z.string().trim().max(STRATEGY_LIMITS.toneMax).default(''),
  /** Natural-language rubric lines given to the model (PRIORITY strategies). */
  priorityRules: z
    .array(z.string().trim().min(3).max(STRATEGY_LIMITS.ruleMax))
    .max(STRATEGY_LIMITS.rulesMax)
    .default([]),
  /** Deterministic minimum-priority rules applied after the model (PRIORITY strategies). */
  floorRules: z.array(PriorityFloorRuleSchema).max(STRATEGY_LIMITS.rulesMax).default([]),
  knowledgeSections: z.array(KnowledgeSectionIdSchema).max(8).default([]),
  provider: AiProviderSchema.default('anthropic'),
  /** Model id; empty string means "use the server default for this task". */
  model: z.string().trim().max(80).default(''),
  /** Ignored for models that reject sampling parameters. */
  temperature: z.number().min(0).max(1).nullable().default(null),
  maxOutputTokens: z.number().int().min(64).max(4000).default(700),
  /** Include the category's calibration example (query → expected response) in the prompt. */
  includeExamples: z.boolean().default(true),
  /** Max prior public messages sent to the model when drafting. */
  maxHistoryMessages: z.number().int().min(0).max(20).default(6),
});
export type AiStrategyConfig = z.infer<typeof AiStrategyConfigSchema>;
export type AiStrategyConfigInput = z.input<typeof AiStrategyConfigSchema>;

const strategyMetaShape = {
  name: z.string().trim().min(3).max(STRATEGY_LIMITS.nameMax),
  purpose: z.string().trim().max(STRATEGY_LIMITS.purposeMax).default(''),
  enabled: z.boolean().default(true),
};

export const CreateStrategyRequestSchema = z
  .object({
    ...strategyMetaShape,
    kind: AiStrategyKindSchema,
    category: TicketCategorySchema.nullable(),
    config: AiStrategyConfigSchema,
    changeNote: z.string().trim().max(STRATEGY_LIMITS.changeNoteMax).optional(),
  })
  .refine((v) => (v.kind === 'CLASSIFICATION' ? v.category === null : v.category !== null), {
    message: 'Classification strategies are global (category must be null); others need a category',
    path: ['category'],
  });
export type CreateStrategyRequest = z.infer<typeof CreateStrategyRequestSchema>;

export const UpdateStrategyRequestSchema = z
  .object({
    name: strategyMetaShape.name.optional(),
    purpose: z.string().trim().max(STRATEGY_LIMITS.purposeMax).optional(),
    enabled: z.boolean().optional(),
    /** Supplying config creates a new version. */
    config: AiStrategyConfigSchema.optional(),
    changeNote: z.string().trim().max(STRATEGY_LIMITS.changeNoteMax).optional(),
    /** Activate the new version immediately (default true). */
    activate: z.boolean().default(true),
  })
  .strict()
  .refine((v) => v.name ?? v.purpose ?? v.enabled ?? v.config, {
    message: 'Nothing to update',
  });
export type UpdateStrategyRequest = z.infer<typeof UpdateStrategyRequestSchema>;

export const ActivateStrategyVersionRequestSchema = z.object({
  version: z.number().int().min(1),
});

export const StrategyListQuerySchema = z.object({
  kind: AiStrategyKindSchema.optional(),
  category: TicketCategorySchema.optional(),
});

export const TestStrategyRequestSchema = z.object({
  subject: z.string().trim().min(3).max(TICKET_LIMITS.subjectMax),
  description: z.string().trim().min(10).max(TICKET_LIMITS.descriptionMax),
  /** Optional book code to include real book facts in the prompt. */
  bookId: z.string().trim().max(40).nullable().default(null),
  /** Version to test (defaults to the active version). */
  version: z.number().int().min(1).optional(),
  /** Only compose and return the prompt; do not call the model. */
  dryRun: z.boolean().default(false),
});
export type TestStrategyRequest = z.infer<typeof TestStrategyRequestSchema>;

export const AiRunListQuerySchema = PaginationQuerySchema.extend({
  strategyId: ObjectIdSchema.optional(),
  status: z.enum(['SUCCESS', 'FAILED']).optional(),
});

export interface AiStrategyDto {
  id: string;
  key: string;
  name: string;
  kind: AiStrategyKind;
  category: TicketCategory | null;
  purpose: string;
  enabled: boolean;
  isDefault: boolean;
  activeVersion: number;
  latestVersion: number;
  config: AiStrategyConfig;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  stats: { runs: number; failures: number; lastRunAt: string | null };
}

export interface AiStrategyVersionDto {
  version: number;
  config: AiStrategyConfig;
  changeNote: string;
  createdBy: string | null;
  createdAt: string;
  isActive: boolean;
}

export interface PromptPreviewDto {
  system: string;
  prompt: string;
  /** Rough estimate (chars / 4) to make token cost visible to admins. */
  estimatedInputTokens: number;
  knowledgeSections: KnowledgeSectionId[];
}

export interface TriageResultDto {
  category: TicketCategory;
  categoryConfidence: number;
  priority: TicketPriority;
  rationale: string;
  priorityRationale: string;
  escalate: boolean;
  rulesApplied: string[];
}

export type StrategyTestOutputDto =
  | { kind: 'TRIAGE'; triage: TriageResultDto }
  | {
      kind: 'DRAFT';
      draft: Pick<
        AiDraftDto,
        | 'body'
        | 'verificationChecklist'
        | 'suggestedStatus'
        | 'escalationRecommended'
        | 'knowledgeSectionsUsed'
      >;
    };

export interface StrategyTestResultDto {
  strategyId: string;
  version: number;
  preview: PromptPreviewDto;
  output: StrategyTestOutputDto | null;
  model: string | null;
  latencyMs: number | null;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
  failure: { kind: AiFailureKind; message: string } | null;
}

export interface AiRunDto {
  id: string;
  kind: AiRunKind;
  status: 'SUCCESS' | 'FAILED';
  ticket: { id: string; reference: string } | null;
  strategies: Array<{ strategyId: string; name: string; version: number }>;
  provider: AiProvider | null;
  model: string | null;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  failureKind: AiFailureKind | null;
  failureMessage: string | null;
  createdAt: string;
}

export interface AiStatusDto {
  configured: boolean;
  provider: AiProvider | null;
  defaultModels: { triage: string; draft: string } | null;
  /** When set, calls are paused after rate limiting until this time. */
  circuitOpenUntil: string | null;
  last24h: { runs: number; failures: number; inputTokens: number; outputTokens: number };
}

export interface KnowledgeSectionDto {
  id: KnowledgeSectionId;
  title: string;
  categories: TicketCategory[];
  content: string;
  approxTokens: number;
}
