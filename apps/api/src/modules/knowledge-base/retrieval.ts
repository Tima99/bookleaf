import type { KnowledgeSectionDto, KnowledgeSectionId, TicketCategory } from '@bookleaf/contracts';
import { estimateTokens } from '@bookleaf/utils';
import { KNOWLEDGE_SECTIONS, type KnowledgeSection } from './sections';

export interface RetrievalOptions {
  category: TicketCategory;
  /** Ticket subject + description used for keyword matching. */
  text: string;
  /** Sections pinned by the active response strategy (always included first). */
  pinned?: readonly KnowledgeSectionId[];
  maxSections?: number;
  maxChars?: number;
}

/**
 * Selects the knowledge-base sections relevant to one ticket.
 *
 * Deliberately simple and deterministic (no embeddings needed at this KB size):
 *   1. sections pinned by the strategy,
 *   2. sections tagged with the ticket's category,
 *   3. other sections ranked by keyword hits in the ticket text,
 * capped by count and character budget. Tone guidelines are excluded here because they
 * live in the system prompt.
 */
export function selectKnowledgeSections(options: RetrievalOptions): KnowledgeSection[] {
  const { category, text, pinned = [], maxSections = 3, maxChars = 2400 } = options;
  const haystack = text.toLowerCase();
  const pool = KNOWLEDGE_SECTIONS.filter((s) => s.id !== 'communication-tone');

  const score = (s: KnowledgeSection): number => {
    let value = 0;
    if (pinned.includes(s.id)) value += 100;
    if (s.categories.includes(category)) value += 50;
    for (const kw of s.keywords) if (haystack.includes(kw)) value += 5;
    return value;
  };

  const ranked = pool
    .map((s) => ({ s, score: score(s) }))
    .filter((r) => r.score >= 10) // at least two keyword hits, a category tag or a pin
    .sort((a, b) => b.score - a.score);

  const chosen: KnowledgeSection[] = [];
  let used = 0;
  for (const { s } of ranked) {
    if (chosen.length >= maxSections) break;
    if (used + s.content.length > maxChars && chosen.length > 0) continue;
    chosen.push(s);
    used += s.content.length;
  }
  return chosen;
}

export function toKnowledgeSectionDto(section: KnowledgeSection): KnowledgeSectionDto {
  return {
    id: section.id,
    title: section.title,
    categories: section.categories,
    content: section.content,
    approxTokens: estimateTokens(section.content),
  };
}
