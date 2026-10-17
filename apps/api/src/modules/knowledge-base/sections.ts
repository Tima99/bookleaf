import type { KnowledgeSectionId, TicketCategory } from '@bookleaf/contracts';

/**
 * BookLeaf knowledge base — the authoritative policy source for AI drafts.
 *
 * Content mirrors the policies supplied by BookLeaf in the assignment brief. It is
 * version-controlled (reviewed like code) and split into small sections so the drafting
 * prompt only carries the 1–3 sections relevant to a ticket instead of the whole KB.
 */
export interface KnowledgeSection {
  id: KnowledgeSectionId;
  title: string;
  /** Categories for which this section is relevant by default. */
  categories: TicketCategory[];
  /** Lower-cased keywords that pull this section in even for other categories. */
  keywords: string[];
  content: string;
}

export const KNOWLEDGE_SECTIONS: readonly KnowledgeSection[] = [
  {
    id: 'company-overview',
    title: 'Company overview',
    categories: ['GENERAL_INQUIRY'],
    keywords: [
      'package',
      'bestseller breakthrough',
      'standard free',
      'services',
      'cover design',
      'marketing',
      'contract',
    ],
    content: [
      '- BookLeaf Publishing is a self-publishing company operating in India and the US.',
      '- Publishing packages: Standard Free (no upfront cost) and Bestseller Breakthrough (premium, paid package with marketing and distribution add-ons).',
      '- BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution, and royalty management for authors.',
      '- In-house printing facility and warehouse are in Delhi. Print partners include Repro India and Epitome Books.',
    ].join('\n'),
  },
  {
    id: 'royalty-policy',
    title: 'Royalty policy',
    categories: ['ROYALTY_PAYMENTS'],
    keywords: [
      'royalty',
      'royalties',
      'payout',
      'payment',
      'paid',
      'bank',
      'earning',
      'statement',
      'breakdown',
      '₹',
      'rs',
    ],
    content: [
      '- Royalty split: 80% of the net profit per book goes to the author, 20% to BookLeaf.',
      '- Net profit = MRP minus printing cost, platform commission (Amazon/Flipkart), and shipping charges.',
      '- Royalties are calculated quarterly and paid within 45 days of the quarter ending.',
      '- Minimum payout threshold: ₹1,000. Accumulated royalties below this roll over to the next quarter.',
      "- Payouts are made by bank transfer to the account linked in the author's dashboard.",
      '- Authors can view a detailed royalty breakdown in their dashboard, with sales figures per platform.',
    ].join('\n'),
  },
  {
    id: 'isbn-policy',
    title: 'ISBN policy',
    categories: ['ISBN_METADATA'],
    keywords: ['isbn', 'barcode', 'imprint', 'duplicate', 'wrong book'],
    content: [
      '- Every book published through BookLeaf receives a unique ISBN assigned by BookLeaf.',
      "- ISBNs are registered under BookLeaf's publisher imprint. An author who wants an ISBN under their own imprint must obtain it independently.",
      '- Reported ISBN errors (duplicate ISBN, wrong book linked) are treated as HIGH priority and escalated to the production team. Resolution timeline: 48 hours.',
    ].join('\n'),
  },
  {
    id: 'metadata-updates',
    title: 'Metadata & listing updates',
    categories: ['ISBN_METADATA', 'GENERAL_INQUIRY'],
    keywords: [
      'description',
      'metadata',
      'blurb',
      'author bio',
      'bio',
      'title change',
      'keywords',
      'category',
      'update',
    ],
    content: [
      '- Metadata updates (book description, author bio, keywords) can be submitted through the dashboard or by emailing the BookLeaf team.',
      '- Changes typically reflect on platforms within 3–5 business days.',
    ].join('\n'),
  },
  {
    id: 'printing-quality',
    title: 'Printing & quality',
    categories: ['PRINTING_QUALITY'],
    keywords: [
      'print',
      'printing',
      'misprint',
      'blurry',
      'binding',
      'pages',
      'colour',
      'color',
      'defect',
      'damaged',
      'reprint',
      'author copies',
    ],
    content: [
      '- In-house printing (Delhi) handles most orders. Overflow or specific format requirements go to Repro India or Epitome Books.',
      '- Standard print turnaround: 5–7 business days from order confirmation.',
      '- Quality issues (misprints, binding defects, colour inconsistency): BookLeaf arranges a FREE reprint after verification. The author may need to share photos of the defective copy. Reprint timeline: 5–7 business days once verified.',
    ].join('\n'),
  },
  {
    id: 'distribution-availability',
    title: 'Distribution & availability',
    categories: ['DISTRIBUTION_AVAILABILITY'],
    keywords: [
      'amazon',
      'flipkart',
      'unavailable',
      'out of stock',
      'listing',
      'live',
      'store',
      'not showing',
      'buy',
    ],
    content: [
      '- Books are listed on Amazon India, Flipkart, Amazon US, Amazon UK, and the BookLeaf Store.',
      '- New listings typically go live within 7–10 business days after publication is complete.',
      "- A book showing as unavailable on a platform usually indicates a stock sync issue. BookLeaf's team can trigger a re-sync; the listing is typically live again within 24–48 hours.",
    ].join('\n'),
  },
  {
    id: 'production-stages',
    title: 'Production stages',
    categories: ['BOOK_STATUS_PRODUCTION'],
    keywords: [
      'typesetting',
      'cover',
      'proofreading',
      'proof',
      'editing',
      'manuscript',
      'production',
      'stage',
      'delay',
      'status',
    ],
    content: [
      '- Stages in order: Manuscript Received → Editing (if opted) → Cover Design → Typesetting → Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.',
      '- Authors are updated by email at each stage.',
      '- Delays typically happen at Cover Design (waiting for author approval) and Proofreading (revision rounds).',
    ].join('\n'),
  },
  {
    id: 'communication-tone',
    title: 'Communication tone guidelines',
    categories: [],
    keywords: [],
    content: [
      '- Always empathetic and professional. Authors are partners, not customers to be managed.',
      "- Acknowledge the author's concern before jumping to solutions.",
      '- Be specific: include actual numbers, dates and statuses wherever possible rather than vague reassurances.',
      "- If something is BookLeaf's fault (delayed royalties, ISBN error), own it directly. No corporate deflection.",
      '- If the issue requires escalation or investigation, give a clear timeline (e.g. "Our team will look into this and get back to you within 48 hours") rather than open-ended promises.',
      '- Always end with a clear next step for the author and/or the BookLeaf team.',
    ].join('\n'),
  },
];

export function getSection(id: KnowledgeSectionId): KnowledgeSection | undefined {
  return KNOWLEDGE_SECTIONS.find((s) => s.id === id);
}
