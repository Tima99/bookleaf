import type { TicketStatus } from '@bookleaf/contracts';

/** Demo admin accounts (passwords come from SEED_ADMIN_PASSWORD, never from code). */
export const DEMO_ADMINS = [
  { email: 'support.lead@bookleaf.test', name: 'Aditi Rao' },
  { email: 'ops.agent@bookleaf.test', name: 'Karan Mehta' },
] as const;

export interface DemoTicket {
  seedKey: string;
  authorCode: string;
  bookCode: string | null;
  subject: string;
  description: string;
  status: TicketStatus;
  hoursAgo: number;
  adminReply?: string;
}

/** Realistic tickets modelled on BookLeaf's sample queries, spread over the last week. */
export const DEMO_TICKETS: DemoTicket[] = [
  {
    seedKey: 'demo-royalty-none',
    authorCode: 'AUTH003',
    bookCode: 'BK005',
    subject: 'No royalty received since my book was published',
    description:
      "Between Two Temples was published in July 2024 and I still haven't received any royalty payment at all. My dashboard shows a pending amount but nothing has reached my bank account. What's going on?",
    status: 'OPEN',
    hoursAgo: 70,
  },
  {
    seedKey: 'demo-isbn-mismatch',
    authorCode: 'AUTH002',
    bookCode: 'BK003',
    subject: 'Amazon shows a different ISBN than my printed copy',
    description:
      'The ISBN shown on the Amazon listing for Code & Karma is different from the ISBN printed on the back cover of my physical copies. Readers are asking me which one is correct.',
    status: 'OPEN',
    hoursAgo: 30,
  },
  {
    seedKey: 'demo-print-quality',
    authorCode: 'AUTH001',
    bookCode: 'BK001',
    subject: 'Author copies have blurry images and misaligned pages',
    description:
      'I received my author copies of Whispers of the Ganges yesterday and the print quality is terrible. The images in chapter 3 are blurry and several pages are misaligned. I have a launch event next week.',
    status: 'OPEN',
    hoursAgo: 20,
  },
  {
    seedKey: 'demo-unavailable',
    authorCode: 'AUTH010',
    bookCode: 'BK018',
    subject: 'Howrah Nights shows "Currently Unavailable" on Amazon',
    description:
      'My book is published but it has been showing as "Currently Unavailable" on Amazon India for the past few days. A few readers told me they could not order it.',
    status: 'IN_PROGRESS',
    hoursAgo: 52,
    adminReply:
      "Hi Diya, thank you for flagging this. This is usually a stock sync issue between our warehouse and Amazon. We've triggered a re-sync with our distribution team and the listing should be purchasable again within 24–48 hours. We'll confirm here once it's live.",
  },
  {
    seedKey: 'demo-typesetting-delay',
    authorCode: 'AUTH009',
    bookCode: 'BK015',
    subject: 'Raising Roots has been in typesetting for 3 weeks',
    description:
      "It's been 3 weeks and my book is still in typesetting. When will it be done? I was hoping to have it out before the school holidays.",
    status: 'OPEN',
    hoursAgo: 8,
  },
  {
    seedKey: 'demo-royalty-low',
    authorCode: 'AUTH007',
    bookCode: 'BK012',
    subject: 'Royalty amount seems too low for my sales',
    description:
      'My royalty amount seems too low. I sold a lot of copies of Ctrl+Alt+Delete My Ex this year but the payout was much smaller than I expected. Can you explain how it is calculated?',
    status: 'OPEN',
    hoursAgo: 5,
  },
  {
    seedKey: 'demo-update-bio',
    authorCode: 'AUTH004',
    bookCode: null,
    subject: 'Can I update my author bio?',
    description:
      'Can I update my author bio and the description of my book on Amazon after it is already live? How long does it take?',
    status: 'RESOLVED',
    hoursAgo: 120,
    adminReply:
      'Hi Vikram, yes — metadata updates such as your author bio and book description can be submitted through your dashboard or by emailing the BookLeaf team. Changes typically reflect on all platforms within 3–5 business days. Let us know if you need help with the wording!',
  },
];
