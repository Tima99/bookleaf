import { TICKET_CATEGORIES, type TicketCategory } from '@bookleaf/contracts';

/**
 * Deterministic fallback classifier used when the LLM is unavailable (no key, outage,
 * rate limit, malformed output). It keeps the queue organised in degraded mode; results
 * are clearly labelled as rule-based, never presented as AI output.
 */
const CATEGORY_KEYWORDS: Record<TicketCategory, Array<[keyword: string, weight: number]>> = {
  ROYALTY_PAYMENTS: [
    ['royalty', 3],
    ['royalties', 3],
    ['payout', 3],
    ['payment', 2],
    ['paid', 1],
    ['bank', 2],
    ['earning', 2],
    ['earnings', 2],
    ['statement', 1],
    ['₹', 1],
    ['rupees', 1],
    ['money', 1],
    ['tds', 2],
  ],
  ISBN_METADATA: [
    ['isbn', 4],
    ['barcode', 3],
    ['imprint', 2],
    ['metadata', 3],
    ['wrong author name', 3],
    ['duplicate', 1],
    ['misspelled', 2],
    ['wrong title', 3],
  ],
  PRINTING_QUALITY: [
    ['print quality', 4],
    ['printing', 2],
    ['misprint', 4],
    ['blurry', 3],
    ['binding', 3],
    ['misaligned', 3],
    ['pages', 1],
    ['defect', 3],
    ['defective', 3],
    ['damaged', 2],
    ['torn', 2],
    ['ink', 2],
    ['colour', 1],
    ['color', 1],
    ['reprint', 3],
    ['author copies', 2],
    ['paper quality', 3],
  ],
  DISTRIBUTION_AVAILABILITY: [
    ['currently unavailable', 4],
    ['unavailable', 3],
    ['out of stock', 4],
    ['not available', 3],
    ['amazon', 1],
    ['flipkart', 1],
    ['listing', 2],
    ['not showing', 2],
    ['buy link', 3],
    ['sync', 2],
    ['delivery', 1],
  ],
  BOOK_STATUS_PRODUCTION: [
    ['typesetting', 4],
    ['cover design', 3],
    ['proofreading', 4],
    ['proof', 2],
    ['editing', 2],
    ['manuscript', 2],
    ['production', 2],
    ['when will', 1],
    ['still in', 2],
    ['published yet', 3],
    ['status of my book', 3],
    ['delay', 1],
    ['delayed', 1],
  ],
  GENERAL_INQUIRY: [
    ['author bio', 3],
    ['bio', 2],
    ['account', 1],
    ['password', 2],
    ['package', 2],
    ['contract', 2],
    ['update the description', 3],
    ['description', 1],
    ['profile', 1],
    ['how do i', 1],
    ['can i', 1],
  ],
};

function countMatches(text: string, keyword: string): number {
  if (/^[a-z ]+$/.test(keyword)) {
    const rx = new RegExp(`\\b${keyword.replace(/ /g, '\\s+')}\\b`, 'g');
    return text.match(rx)?.length ?? 0;
  }
  return text.split(keyword).length - 1;
}

export interface KeywordClassification {
  category: TicketCategory;
  /** Heuristic share of keyword weight; not a calibrated probability. */
  confidence: number;
  matched: string[];
}

export function classifyByKeywords(subject: string, description: string): KeywordClassification {
  // Subject words count double — authors summarise the problem there.
  const text = `${subject} ${subject} ${description}`.toLowerCase();
  let best: TicketCategory = 'GENERAL_INQUIRY';
  let bestScore = 0;
  let total = 0;
  const matchedByCategory = new Map<TicketCategory, string[]>();

  for (const category of TICKET_CATEGORIES) {
    let score = 0;
    const matched: string[] = [];
    for (const [keyword, weight] of CATEGORY_KEYWORDS[category]) {
      const hits = Math.min(countMatches(text, keyword), 3);
      if (hits > 0) {
        score += hits * weight;
        matched.push(keyword);
      }
    }
    matchedByCategory.set(category, matched);
    total += score;
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }

  const confidence = total === 0 ? 0.2 : Math.min(0.85, Number((bestScore / total).toFixed(2)));
  return { category: best, confidence, matched: matchedByCategory.get(best) ?? [] };
}
