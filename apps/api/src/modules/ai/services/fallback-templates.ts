import type { TicketCategory } from '@bookleaf/contracts';
import { formatINR } from '@bookleaf/utils';
import type { PromptBook } from '../prompts/types';

/**
 * Deterministic reply templates used when AI drafting is unavailable. They contain only
 * knowledge-base policy plus verified book data, with [bracketed] gaps the agent must
 * fill in — they are presented in the UI as templates, never as AI output.
 */
export interface TemplateDraft {
  body: string;
  verificationChecklist: string[];
  knowledgeSectionsUsed: string[];
}

export function buildTemplateDraft(input: {
  category: TicketCategory | null;
  authorName: string;
  book: PromptBook | null;
}): TemplateDraft {
  const first = input.authorName.split(/\s+/)[0] ?? input.authorName;
  const book = input.book;
  const bookRef = book ? `"${book.title}"` : 'your book';

  const body = (paragraphs: string[]) =>
    [`Dear ${first},`, ...paragraphs, 'Warm regards,\nBookLeaf Author Support Team'].join('\n\n');

  switch (input.category) {
    case 'ROYALTY_PAYMENTS':
      return {
        body: body([
          `Thank you for reaching out about the royalties for ${bookRef} — I understand how important it is to have clarity on your earnings.`,
          `Royalties at BookLeaf are calculated quarterly and paid within 45 days of each quarter ending, by bank transfer to the account linked in your dashboard. Balances below ₹1,000 roll over to the next quarter.${
            book && book.stage === 'PUBLISHED'
              ? ` Our records show ${formatINR(book.royaltyPaid)} paid to date and ${formatINR(book.royaltyPending)} currently pending for ${bookRef}.`
              : ''
          }`,
          '[Add the specific next payout date / status from finance.]',
          'Could you please confirm that your bank details are linked in your dashboard? Our team will review your account and get back to you within 48 hours.',
        ]),
        verificationChecklist: [
          'Confirm payout status with finance',
          'Confirm bank details are linked',
        ],
        knowledgeSectionsUsed: ['royalty-policy'],
      };
    case 'ISBN_METADATA':
      return {
        body: body([
          `Thank you for flagging this — an ISBN or metadata mismatch for ${bookRef} is a serious data issue, and fixing it is our responsibility.`,
          `${book?.isbn ? `The ISBN on our records is ${book.isbn}. ` : ''}I am escalating this to our production team right away, and we will get back to you with a resolution within 48 hours.`,
          'If you have a screenshot of the incorrect listing, please reply with it — it will help us correct it faster.',
        ]),
        verificationChecklist: ['Escalate to production team', 'Confirm ISBN on the live listing'],
        knowledgeSectionsUsed: ['isbn-policy'],
      };
    case 'PRINTING_QUALITY':
      return {
        body: body([
          `I'm truly sorry that the copies of ${bookRef} didn't meet the standard you should expect from us.`,
          'Could you please reply with clear photos of the affected pages or copies? Once our team verifies the issue, BookLeaf will arrange a free reprint, which typically takes 5–7 business days.',
          'We will confirm the next steps as soon as we receive the photos.',
        ]),
        verificationChecklist: ['Request and review defect photos', 'Confirm order details'],
        knowledgeSectionsUsed: ['printing-quality'],
      };
    case 'DISTRIBUTION_AVAILABILITY':
      return {
        body: body([
          `Thank you for letting us know that ${bookRef} is showing as unavailable — I understand how frustrating that is when readers are trying to buy it.`,
          'This is usually caused by a stock sync issue with the platform. Our distribution team is triggering a re-sync, and the listing should be available again within 24–48 hours.',
          "If it still shows as unavailable after 48 hours, please reply here and we'll escalate it immediately.",
        ]),
        verificationChecklist: ['Trigger re-sync with distribution team'],
        knowledgeSectionsUsed: ['distribution-availability'],
      };
    case 'BOOK_STATUS_PRODUCTION':
      return {
        body: body([
          `Thank you for checking in on ${bookRef} — I know how eager you are to see it published.`,
          book?.productionStage
            ? `Your book is currently at the ${book.productionStage} stage. [Add the reason for any delay and what is needed next.]`
            : '[Add the current production stage and next step.]',
          'I will confirm an updated timeline with our production team and get back to you within 48 hours.',
        ]),
        verificationChecklist: ['Confirm current stage ETA with production'],
        knowledgeSectionsUsed: ['production-stages'],
      };
    default:
      return {
        body: body([
          'Thank you for reaching out to BookLeaf.',
          '[Answer the question here.]',
          "If anything else comes up, just reply to this message and we'll be glad to help.",
        ]),
        verificationChecklist: ['Fill in the answer before sending'],
        knowledgeSectionsUsed: [],
      };
  }
}
