import { z } from 'zod';
import {
  KNOWLEDGE_SECTION_IDS,
  TicketCategorySchema,
  TicketPrioritySchema,
} from '@bookleaf/contracts';

/**
 * Structured outputs come in two layers:
 *
 * 1. *Model-facing* schemas, sent to the provider as the response format. They use only
 *    keywords every provider's strict structured-output mode accepts (types, enums,
 *    required fields, numeric bounds, maxItems) — no string length limits, which e.g.
 *    OpenAI's strict JSON-schema mode rejects. Limits are stated in the descriptions.
 * 2. *Application* schemas, the source of truth. The services normalise the model's
 *    object (trim, clamp, cap list lengths) and validate it against these before anything
 *    is persisted — model output never writes to the database directly.
 */

/* ------------------------------ triage ------------------------------ */

export const TriageModelOutputSchema = z.object({
  category: TicketCategorySchema.describe('Exactly one of the allowed category codes'),
  categoryConfidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Your confidence in the category from 0 to 1 (self-reported, not calibrated)'),
  priority: TicketPrioritySchema,
  rationale: z.string().describe('One or two sentences (max ~300 characters) citing the ticket'),
  priorityRationale: z
    .string()
    .describe('Why this priority, citing the rubric (max ~300 characters)'),
  escalate: z
    .boolean()
    .describe('True if the ticket needs a specialist team (production, finance) right away'),
});

export const TriageOutputSchema = z.object({
  category: TicketCategorySchema,
  categoryConfidence: z.number().min(0).max(1),
  priority: TicketPrioritySchema,
  rationale: z.string().min(1).max(400),
  priorityRationale: z.string().min(1).max(400),
  escalate: z.boolean(),
});
export type TriageOutput = z.infer<typeof TriageOutputSchema>;

/* ------------------------------ drafting ---------------------------- */

export const DraftModelOutputSchema = z.object({
  reply: z
    .string()
    .describe(
      'The complete reply to the author, plain text with paragraphs; signed by the BookLeaf Author Support Team',
    ),
  verificationChecklist: z
    .array(z.string())
    .max(6)
    .describe(
      'Facts the support agent must verify before sending (things you could not confirm from the provided data); short items',
    ),
  suggestedStatus: z
    .enum(['IN_PROGRESS', 'RESOLVED'])
    .describe('RESOLVED only if the reply fully answers the question'),
  escalationRecommended: z.boolean(),
  knowledgeSectionsUsed: z.array(z.enum(KNOWLEDGE_SECTION_IDS)).max(8),
});

export const DraftOutputSchema = z.object({
  reply: z.string().min(40).max(4000),
  verificationChecklist: z.array(z.string().min(3).max(200)).max(6),
  suggestedStatus: z.enum(['IN_PROGRESS', 'RESOLVED']),
  escalationRecommended: z.boolean(),
  knowledgeSectionsUsed: z.array(z.enum(KNOWLEDGE_SECTION_IDS)).max(8),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

/* ---------------------------- normalisation ------------------------- */

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
};

/** Normalises the model's triage object, then validates it (throws ZodError if unusable). */
export function toTriageOutput(raw: z.infer<typeof TriageModelOutputSchema>): TriageOutput {
  return TriageOutputSchema.parse({
    ...raw,
    rationale: clip(raw.rationale, 400),
    priorityRationale: clip(raw.priorityRationale, 400),
  });
}

/** Normalises the model's draft object, then validates it (throws ZodError if unusable). */
export function toDraftOutput(raw: z.infer<typeof DraftModelOutputSchema>): DraftOutput {
  return DraftOutputSchema.parse({
    ...raw,
    reply: raw.reply.trim(),
    verificationChecklist: raw.verificationChecklist
      .map((item) => clip(item, 200))
      .filter((item) => item.length >= 3)
      .slice(0, 6),
    knowledgeSectionsUsed: [...new Set(raw.knowledgeSectionsUsed)],
  });
}
