import type { AuthorProfileDto, BookDto, BookStage } from '@bookleaf/contracts';
import { toIsoDate } from '@bookleaf/utils';
import type { AuthorDoc, BookDoc } from '../../database/models';

/** Derives the filterable stage and the production sub-stage from the raw status string. */
export function deriveStage(status: string): { stage: BookStage; productionStage: string | null } {
  const match = /^In Production\s*-\s*(.+)$/i.exec(status.trim());
  if (match?.[1]) return { stage: 'IN_PRODUCTION', productionStage: match[1].trim() };
  if (/in production/i.test(status)) return { stage: 'IN_PRODUCTION', productionStage: null };
  return { stage: 'PUBLISHED', productionStage: null };
}

export function toBookDto(book: BookDoc): BookDto {
  return {
    id: book._id.toString(),
    bookCode: book.bookCode,
    title: book.title,
    isbn: book.isbn,
    genre: book.genre,
    publicationDate: toIsoDate(book.publicationDate),
    status: book.status,
    stage: book.stage,
    productionStage: book.productionStage,
    mrp: book.mrp,
    authorRoyaltyPerCopy: book.authorRoyaltyPerCopy,
    totalCopiesSold: book.totalCopiesSold,
    totalRoyaltyEarned: book.totalRoyaltyEarned,
    royaltyPaid: book.royaltyPaid,
    royaltyPending: book.royaltyPending,
    lastRoyaltyPayoutDate: toIsoDate(book.lastRoyaltyPayoutDate),
    printPartner: book.printPartner,
    availableOn: book.availableOn ?? [],
  };
}

export function toAuthorProfileDto(author: AuthorDoc): AuthorProfileDto {
  return {
    id: author._id.toString(),
    authorCode: author.authorCode,
    name: author.name,
    email: author.email,
    phone: author.phone,
    city: author.city,
    joinedDate: toIsoDate(author.joinedDate),
  };
}

export function sumRoyalties(
  books: Pick<
    BookDoc,
    'totalRoyaltyEarned' | 'royaltyPaid' | 'royaltyPending' | 'totalCopiesSold'
  >[],
) {
  return books.reduce(
    (acc, b) => ({
      totalRoyaltyEarned: acc.totalRoyaltyEarned + b.totalRoyaltyEarned,
      royaltyPaid: acc.royaltyPaid + b.royaltyPaid,
      royaltyPending: acc.royaltyPending + b.royaltyPending,
      totalCopiesSold: acc.totalCopiesSold + b.totalCopiesSold,
    }),
    { totalRoyaltyEarned: 0, royaltyPaid: 0, royaltyPending: 0, totalCopiesSold: 0 },
  );
}
