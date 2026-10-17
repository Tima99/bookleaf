/**
 * Royalty calendar derived from the BookLeaf knowledge base:
 *  - royalties are calculated per calendar quarter,
 *  - paid within 45 days of the quarter ending,
 *  - minimum payout threshold ₹1,000 (smaller balances roll over).
 *
 * These facts are computed deterministically and handed to the AI as verified context,
 * so drafted replies can quote real dates instead of inventing them.
 */

export const ROYALTY_PAYOUT_WINDOW_DAYS = 45;
export const ROYALTY_PAYOUT_THRESHOLD_INR = 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface QuarterInfo {
  year: number;
  /** 1–4 */
  quarter: number;
  label: string;
  start: Date;
  end: Date;
  payoutBy: Date;
}

function quarterOf(year: number, quarter: number): QuarterInfo {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  // Day 0 of the following month = last day of the quarter.
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  const payoutBy = new Date(end.getTime() + ROYALTY_PAYOUT_WINDOW_DAYS * 86_400_000);
  const label = `Q${quarter} ${year} (${MONTHS[startMonth]}–${MONTHS[startMonth + 2]})`;
  return { year, quarter, label, start, end, payoutBy };
}

export function getQuarter(date: Date): QuarterInfo {
  return quarterOf(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) + 1);
}

export function getPreviousQuarter(date: Date): QuarterInfo {
  const q = getQuarter(date);
  return q.quarter === 1 ? quarterOf(q.year - 1, 4) : quarterOf(q.year, q.quarter - 1);
}

export interface RoyaltyCalendar {
  current: QuarterInfo;
  previous: QuarterInfo;
  /** True while we are still inside the 45-day payout window of the previous quarter. */
  previousPayoutWindowOpen: boolean;
}

export function getRoyaltyCalendar(now: Date = new Date()): RoyaltyCalendar {
  const current = getQuarter(now);
  const previous = getPreviousQuarter(now);
  return {
    current,
    previous,
    previousPayoutWindowOpen: now.getTime() <= previous.payoutBy.getTime(),
  };
}
