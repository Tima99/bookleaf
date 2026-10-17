import {
  PRIORITY_RANK,
  TICKET_PRIORITIES,
  type PriorityFloorRule,
  type TicketCategory,
  type TicketPriority,
} from '@bookleaf/contracts';

/**
 * Explicit priority rules combined with the model's judgement:
 *   effective priority = max(model priority, highest matching floor rule).
 * Floors encode non-negotiable business policy (e.g. ISBN errors are always ≥ HIGH per
 * the KB) so a model mistake can lower confidence but never bury an urgent ticket.
 */

/** Baseline when no model is available and no floor rule matches. */
export const CATEGORY_BASELINE_PRIORITY: Record<TicketCategory, TicketPriority> = {
  ROYALTY_PAYMENTS: 'MEDIUM',
  ISBN_METADATA: 'HIGH',
  PRINTING_QUALITY: 'MEDIUM',
  DISTRIBUTION_AVAILABILITY: 'MEDIUM',
  BOOK_STATUS_PRODUCTION: 'MEDIUM',
  GENERAL_INQUIRY: 'LOW',
};

export function maxPriority(a: TicketPriority, b: TicketPriority): TicketPriority {
  return PRIORITY_RANK[a] >= PRIORITY_RANK[b] ? a : b;
}

function matchesKeyword(text: string, keyword: string): boolean {
  if (/^[a-z' ]+$/.test(keyword)) {
    const pattern = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return new RegExp(`\\b${pattern}\\b`).test(text);
  }
  return text.includes(keyword);
}

export interface FloorResult {
  floor: TicketPriority | null;
  applied: string[];
}

export function evaluateFloorRules(
  rules: readonly PriorityFloorRule[],
  subject: string,
  description: string,
): FloorResult {
  const text = `${subject}\n${description}`.toLowerCase().replace(/[’`]/g, "'");
  let floor: TicketPriority | null = null;
  const applied: string[] = [];
  for (const rule of rules) {
    const hit = rule.keywords.find((k) => matchesKeyword(text, k));
    if (!hit) continue;
    applied.push(`${rule.label} (≥ ${rule.minimumPriority}, matched "${hit}")`);
    floor = floor ? maxPriority(floor, rule.minimumPriority) : rule.minimumPriority;
  }
  return { floor, applied };
}

export function isPriority(value: string): value is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(value);
}
