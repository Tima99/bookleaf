import { describe, expect, it } from 'vitest';
import { getRoyaltyCalendar } from './royalty-calendar';
import { formatINR } from './format';

describe('royalty calendar', () => {
  it('computes the current quarter and 45-day payout deadline', () => {
    const cal = getRoyaltyCalendar(new Date('2026-10-15T10:00:00Z'));
    expect(cal.current.label).toBe('Q4 2026 (Oct–Dec)');
    expect(cal.current.end.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(cal.current.payoutBy.toISOString().slice(0, 10)).toBe('2027-02-14');
    expect(cal.previous.label).toBe('Q3 2026 (Jul–Sep)');
    expect(cal.previous.payoutBy.toISOString().slice(0, 10)).toBe('2026-11-14');
    expect(cal.previousPayoutWindowOpen).toBe(true);
  });

  it('wraps the previous quarter across years', () => {
    const cal = getRoyaltyCalendar(new Date('2027-01-20T00:00:00Z'));
    expect(cal.previous.label).toBe('Q4 2026 (Oct–Dec)');
  });
});

describe('formatINR', () => {
  it('formats rupees and handles null', () => {
    expect(formatINR(11970)).toBe('₹11,970');
    expect(formatINR(null)).toBe('—');
  });
});
