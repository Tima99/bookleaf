import type { TicketCategory } from '@bookleaf/contracts';

/**
 * Calibration examples from BookLeaf (sample query → expected response approach).
 * Only the example(s) for the ticket's category are included in a drafting prompt.
 */
export interface CalibrationExample {
  category: TicketCategory;
  query: string;
  expectedApproach: string;
}

export const CALIBRATION_EXAMPLES: readonly CalibrationExample[] = [
  {
    category: 'ROYALTY_PAYMENTS',
    query:
      "I published my book 4 months ago and still haven't received any royalty. What's going on?",
    expectedApproach:
      'Acknowledge the frustration. Explain the quarterly royalty cycle and 45-day payout window. Check if their bank details are linked. Provide the specific next payout date. If the payment is genuinely overdue, escalate with a 48-hour resolution timeline.',
  },
  {
    category: 'ROYALTY_PAYMENTS',
    query: 'My royalty amount seems too low. I sold 200 copies but only received ₹3,000.',
    expectedApproach:
      "Explain the net profit calculation: MRP minus printing, platform commission, and shipping. Offer to share a detailed line-by-line royalty breakdown. Don't be defensive — offer transparency.",
  },
  {
    category: 'ISBN_METADATA',
    query: "My book is showing a different ISBN on Amazon than what's on the physical copy.",
    expectedApproach:
      'Treat as high priority. Acknowledge this is a serious data issue. Confirm you are escalating to the production team immediately. Provide a 48-hour resolution timeline.',
  },
  {
    category: 'PRINTING_QUALITY',
    query:
      'I received my author copies and the print quality is terrible. The images are blurry and pages are misaligned.',
    expectedApproach:
      'Apologise sincerely. Ask the author to share photos of the defective copies. Confirm that BookLeaf will arrange a free reprint once verified. Provide a timeline of 5–7 business days for the reprint.',
  },
  {
    category: 'DISTRIBUTION_AVAILABILITY',
    query: 'My book is published but it\'s showing as "Currently Unavailable" on Amazon.',
    expectedApproach:
      "Explain that this is typically a stock sync issue. Confirm you're triggering a re-sync with the distribution team. Set expectation: 24–48 hours for it to go live again.",
  },
  {
    category: 'BOOK_STATUS_PRODUCTION',
    query: "It's been 3 weeks and my book is still in typesetting. When will it be done?",
    expectedApproach:
      "Check the actual production status. If it's delayed, be honest about why (e.g., waiting on author approval for proofs). Provide a specific updated timeline. Don't blame the author even if the delay is on their side — frame it collaboratively.",
  },
  {
    category: 'GENERAL_INQUIRY',
    query: "Can I update the description of my book on Amazon after it's already live?",
    expectedApproach:
      'Yes, metadata updates can be submitted through the dashboard or by emailing the BookLeaf team. Changes typically reflect on platforms within 3–5 business days.',
  },
];

export function examplesFor(category: TicketCategory, max = 1, text = ''): CalibrationExample[] {
  const candidates = CALIBRATION_EXAMPLES.filter((e) => e.category === category);
  if (candidates.length <= max) return candidates;
  // Prefer the example sharing the most words with the ticket (cheap lexical overlap).
  const words = new Set(text.toLowerCase().match(/[a-z₹]{4,}/g) ?? []);
  const score = (e: CalibrationExample) =>
    (e.query.toLowerCase().match(/[a-z₹]{4,}/g) ?? []).filter((w) => words.has(w)).length;
  return [...candidates].sort((a, b) => score(b) - score(a)).slice(0, max);
}
