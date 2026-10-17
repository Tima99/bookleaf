import { TICKET_CATEGORY_LABELS, TICKET_PRIORITY_LABELS } from '@bookleaf/contracts';
import {
  formatINR,
  getRoyaltyCalendar,
  ROYALTY_PAYOUT_THRESHOLD_INR,
  toIsoDate,
} from '@bookleaf/utils';
import type { CalibrationExample } from '../../knowledge-base/examples';
import { getSection, type KnowledgeSection } from '../../knowledge-base/sections';
import { fact, untrusted } from './sanitize';
import type {
  ComposedPrompt,
  PromptBook,
  PromptHistoryMessage,
  PromptTicket,
  ResolvedStrategy,
} from './types';

export const DRAFT_LIMITS = {
  descriptionChars: 4000,
  historyMessageChars: 900,
} as const;

export interface DraftPromptInput {
  strategy: ResolvedStrategy;
  ticket: PromptTicket;
  author: { name: string; joinedDate: string | null; city: string | null };
  book: PromptBook | null;
  /** Account-wide royalty totals (all books) — used for the ₹1,000 threshold logic. */
  accountRoyalty: { totalPending: number; totalPaid: number; bookCount: number } | null;
  knowledge: KnowledgeSection[];
  examples: CalibrationExample[];
  /** Most recent public messages (already bounded by the strategy's maxHistoryMessages). */
  history: PromptHistoryMessage[];
  now: Date;
}

function bookFacts(book: PromptBook): string {
  const lines = [
    fact('Book id', book.bookCode),
    fact('Title', book.title),
    fact('ISBN on record', book.isbn),
    fact('Genre', book.genre),
    fact('Current status', book.status),
  ];
  if (book.stage === 'IN_PRODUCTION') {
    lines.push(
      fact('Production stage', book.productionStage ?? 'in production (stage not specified)'),
      'Publication: not yet published, so there is no MRP, sales or royalty yet.',
    );
  } else {
    lines.push(
      fact('Publication date', book.publicationDate),
      fact('MRP', formatINR(book.mrp, '')),
      fact('Author royalty per copy', formatINR(book.authorRoyaltyPerCopy, '')),
      fact('Total copies sold', book.totalCopiesSold),
      fact('Total royalty earned', formatINR(book.totalRoyaltyEarned)),
      fact('Royalty paid to date', formatINR(book.royaltyPaid)),
      fact('Royalty pending', formatINR(book.royaltyPending)),
      fact('Last royalty payout date', book.lastRoyaltyPayoutDate, 'no payout has been made yet'),
      fact('Print partner', book.printPartner),
      fact(
        'Available on',
        book.availableOn.length ? book.availableOn.join(', ') : 'no platforms listed',
      ),
    );
  }
  return lines.join('\n');
}

function royaltyCalendarFacts(now: Date, account: DraftPromptInput['accountRoyalty']): string {
  const cal = getRoyaltyCalendar(now);
  const lines = [
    fact('Today', toIsoDate(now)),
    fact('Current quarter', `${cal.current.label}, ends ${toIsoDate(cal.current.end)}`),
    fact('Payout deadline for the current quarter', toIsoDate(cal.current.payoutBy)),
    fact(
      'Most recent completed quarter',
      `${cal.previous.label}, ended ${toIsoDate(cal.previous.end)}`,
    ),
    fact(
      'Payout deadline for the most recent completed quarter',
      `${toIsoDate(cal.previous.payoutBy)} (${cal.previousPayoutWindowOpen ? 'window still open' : 'window has passed'})`,
    ),
    fact('Minimum payout threshold', formatINR(ROYALTY_PAYOUT_THRESHOLD_INR)),
  ];
  if (account) {
    lines.push(
      fact('Account-wide pending royalty (all books)', formatINR(account.totalPending)),
      fact('Account-wide royalty paid to date', formatINR(account.totalPaid)),
      account.totalPending > 0 && account.totalPending < ROYALTY_PAYOUT_THRESHOLD_INR
        ? 'Pending royalty is below the payout threshold, so it rolls over to the next quarter.'
        : 'Pending royalty meets the payout threshold.',
    );
  }
  lines.push('Bank account linkage status: not available in this system (must be confirmed).');
  return lines.join('\n');
}

/**
 * Composes the reply-drafting prompt. Stable instructions go in the system prompt; the
 * per-ticket context goes in the user prompt as clearly delimited sections so the model
 * can tell verified facts (<author_facts>, <book_facts>, <royalty_calendar>,
 * <knowledge_base>) apart from untrusted author text (<ticket>, <conversation>).
 */
export function buildDraftPrompt(input: DraftPromptInput): ComposedPrompt {
  const { strategy, ticket, author, book, knowledge, examples, history, now } = input;
  const tone = getSection('communication-tone');

  const system = [
    strategy.config.instructions,
    strategy.config.categoryInstructions,
    strategy.config.tone ? `Voice: ${strategy.config.tone}` : '',
    tone ? `BookLeaf communication guidelines:\n${tone.content}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const includeRoyaltyCalendar =
    ticket.category === 'ROYALTY_PAYMENTS' ||
    (book?.stage === 'PUBLISHED' &&
      /royalt|payout|payment/i.test(`${ticket.subject} ${ticket.description}`));

  const sections: string[] = [
    `<ticket reference="${ticket.reference}" category="${ticket.category ? TICKET_CATEGORY_LABELS[ticket.category] : 'unclassified'}" priority="${ticket.priority ? TICKET_PRIORITY_LABELS[ticket.priority] : 'unknown'}" opened="${ticket.createdAt.slice(0, 10)}">`,
    `<subject>${untrusted(ticket.subject, 200)}</subject>`,
    `<description>${untrusted(ticket.description, DRAFT_LIMITS.descriptionChars)}</description>`,
    '</ticket>',
    '',
    '<author_facts>',
    fact('Name', author.name),
    fact('First name', author.name.split(/\s+/)[0]),
    fact('Author since', author.joinedDate),
    '</author_facts>',
    '',
    book
      ? `<book_facts>\n${bookFacts(book)}\n</book_facts>`
      : '<book_facts>No specific book was selected — this is a general / account-level query.</book_facts>',
  ];

  if (includeRoyaltyCalendar) {
    sections.push(
      '',
      `<royalty_calendar>\n${royaltyCalendarFacts(now, input.accountRoyalty)}\n</royalty_calendar>`,
    );
  }

  if (knowledge.length) {
    sections.push(
      '',
      '<knowledge_base>',
      ...knowledge.map((k) => `## ${k.title} [${k.id}]\n${k.content}`),
      '</knowledge_base>',
    );
  }

  if (strategy.config.includeExamples && examples.length) {
    sections.push(
      '',
      '<calibration_examples>',
      'How BookLeaf expects similar queries to be handled (guidance on approach, not text to copy):',
      ...examples.map(
        (e) => `Author asked: "${e.query}"\nExpected approach: ${e.expectedApproach}`,
      ),
      '</calibration_examples>',
    );
  }

  if (history.length) {
    sections.push(
      '',
      '<conversation>',
      'Earlier public messages on this ticket, oldest first:',
      ...history.map(
        (m) =>
          `[${m.createdAt.slice(0, 10)}] ${m.senderType === 'AUTHOR' ? 'Author' : 'BookLeaf support'}: ${untrusted(m.body, DRAFT_LIMITS.historyMessageChars)}`,
      ),
      '</conversation>',
    );
  }

  sections.push(
    '',
    history.length && history[history.length - 1]?.senderType === 'AUTHOR'
      ? "Draft BookLeaf's next reply, responding to the author's latest message in the conversation."
      : "Draft BookLeaf's reply to this ticket.",
    'List in verificationChecklist anything the agent must confirm before sending, and the knowledge base section ids you relied on in knowledgeSectionsUsed.',
  );

  return { system, prompt: sections.join('\n') };
}
