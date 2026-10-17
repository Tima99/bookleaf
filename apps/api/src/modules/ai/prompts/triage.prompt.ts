import { TICKET_CATEGORY_LABELS } from '@bookleaf/contracts';
import { PRIORITY_RUBRIC_PREAMBLE } from '../strategies/defaults';
import { untrusted } from './sanitize';
import type { ComposedPrompt, ResolvedStrategy } from './types';

export const TRIAGE_LIMITS = {
  subjectChars: 200,
  /** Classification needs the gist, not every word — bounded for cost. */
  descriptionChars: 2500,
} as const;

export interface TriagePromptInput {
  classification: ResolvedStrategy;
  /** Active priority strategies (one per category). */
  priorities: ResolvedStrategy[];
  ticket: { subject: string; description: string };
  book: { title: string; status: string } | null;
}

/**
 * One model call returns both category and priority (half the cost/latency of two calls).
 * The system prompt = classification strategy + compact per-category priority rubric.
 * No knowledge base is sent: triage only needs category definitions and the rubric.
 */
export function buildTriagePrompt(input: TriagePromptInput): ComposedPrompt {
  const { classification, priorities, ticket, book } = input;

  const rubric = priorities
    .filter((p) => p.category && p.config.priorityRules.length > 0)
    .map((p) => {
      const label = p.category ? TICKET_CATEGORY_LABELS[p.category] : '';
      return `${p.category} (${label}):\n${p.config.priorityRules.map((r) => `- ${r}`).join('\n')}`;
    })
    .join('\n\n');

  const system = [
    classification.config.instructions,
    classification.config.categoryInstructions,
    PRIORITY_RUBRIC_PREAMBLE,
    rubric ? `Category-specific priority guidance:\n${rubric}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const bookContext = book
    ? `Linked book: "${untrusted(book.title, 200)}" — production status: ${book.status}`
    : 'No specific book selected (general / account-level query).';

  const prompt = [
    '<ticket>',
    `<subject>${untrusted(ticket.subject, TRIAGE_LIMITS.subjectChars)}</subject>`,
    `<description>${untrusted(ticket.description, TRIAGE_LIMITS.descriptionChars)}</description>`,
    '</ticket>',
    `<book_context>${bookContext}</book_context>`,
    '',
    'Classify this ticket and assign a priority. Return only the structured result.',
  ].join('\n');

  return { system, prompt };
}
