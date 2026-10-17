import { z } from 'zod';
import {
  KNOWLEDGE_SECTION_IDS,
  TicketCategorySchema,
  TicketPrioritySchema,
} from '@bookleaf/contracts';

/**
 * Structured-output schemas the model must satisfy. The SDK enforces them at generation
 * time and the services re-validate (and normalise) before anything is persisted —
 * model output never writes to the database directly.
 */

export const TriageOutputSchema = z.object({
  category: TicketCategorySchema.describe('Exactly one of the allowed category codes'),
  categoryConfidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Your confidence in the category from 0 to 1 (self-reported, not calibrated)'),
  priority: TicketPrioritySchema,
  rationale: z
    .string()
    .min(1)
    .max(400)
    .describe('One or two sentences citing evidence from the ticket'),
  priorityRationale: z.string().min(1).max(400).describe('Why this priority, citing the rubric'),
  escalate: z
    .boolean()
    .describe('True if the ticket needs a specialist team (production, finance) right away'),
});
export type TriageOutput = z.infer<typeof TriageOutputSchema>;

export const DraftOutputSchema = z.object({
  reply: z
    .string()
    .min(40)
    .max(4000)
    .describe(
      'The complete reply to the author, plain text with paragraphs; signed by the BookLeaf Author Support Team',
    ),
  verificationChecklist: z
    .array(z.string().min(3).max(200))
    .max(6)
    .describe(
      'Facts the support agent must verify before sending (things you could not confirm from the provided data)',
    ),
  suggestedStatus: z
    .enum(['IN_PROGRESS', 'RESOLVED'])
    .describe('RESOLVED only if the reply fully answers the question'),
  escalationRecommended: z.boolean(),
  knowledgeSectionsUsed: z.array(z.enum(KNOWLEDGE_SECTION_IDS)).max(8),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;
