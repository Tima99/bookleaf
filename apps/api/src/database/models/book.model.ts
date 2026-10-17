import { Schema, model, type Types } from 'mongoose';
import { BOOK_STAGES, type BookStage } from '@bookleaf/contracts';

/**
 * Book as provided by BookLeaf. Fields that are unknown for books in production
 * (publication date, MRP, royalty per copy, print partner, payout date) are stored as
 * `null` — never defaulted to 0 — so the UI and the AI can tell "unknown" from "zero".
 */
export interface BookDoc {
  _id: Types.ObjectId;
  /** External id from the dataset, e.g. BK001. */
  bookCode: string;
  author: Types.ObjectId;
  title: string;
  isbn: string | null;
  genre: string;
  publicationDate: Date | null;
  /** Status string exactly as provided, e.g. "In Production - Cover Design". */
  status: string;
  /** Derived for filtering: PUBLISHED or IN_PRODUCTION. */
  stage: BookStage;
  /** Derived production sub-stage ("Cover Design"), null once published. */
  productionStage: string | null;
  mrp: number | null;
  authorRoyaltyPerCopy: number | null;
  totalCopiesSold: number;
  totalRoyaltyEarned: number;
  royaltyPaid: number;
  royaltyPending: number;
  lastRoyaltyPayoutDate: Date | null;
  printPartner: string | null;
  availableOn: string[];
  createdAt: Date;
  updatedAt: Date;
}

const nullableNumber = { type: Number, default: null, min: 0 };

const bookSchema = new Schema<BookDoc>(
  {
    bookCode: { type: String, required: true, trim: true, maxlength: 40 },
    author: { type: Schema.Types.ObjectId, ref: 'Author', required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    isbn: { type: String, default: null, maxlength: 40 },
    genre: { type: String, required: true, trim: true, maxlength: 120 },
    publicationDate: { type: Date, default: null },
    status: { type: String, required: true, trim: true, maxlength: 120 },
    stage: { type: String, enum: BOOK_STAGES, required: true },
    productionStage: { type: String, default: null, maxlength: 80 },
    mrp: nullableNumber,
    authorRoyaltyPerCopy: nullableNumber,
    totalCopiesSold: { type: Number, required: true, min: 0, default: 0 },
    totalRoyaltyEarned: { type: Number, required: true, min: 0, default: 0 },
    royaltyPaid: { type: Number, required: true, min: 0, default: 0 },
    royaltyPending: { type: Number, required: true, min: 0, default: 0 },
    lastRoyaltyPayoutDate: { type: Date, default: null },
    printPartner: { type: String, default: null, maxlength: 80 },
    availableOn: { type: [String], default: [] },
  },
  { timestamps: true },
);

bookSchema.index({ bookCode: 1 }, { unique: true });
// "My Books" filtered by stage; also serves plain author lookups via the prefix.
bookSchema.index({ author: 1, stage: 1 });
// "My Books" default sort (newest publication first).
bookSchema.index({ author: 1, publicationDate: -1 });

export const BookModel = model<BookDoc>('Book', bookSchema);
