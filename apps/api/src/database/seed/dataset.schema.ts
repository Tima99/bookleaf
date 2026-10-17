import { z } from 'zod';

/**
 * Shape of the BookLeaf-provided `bookleaf_sample_data.json`. The seed validates the
 * file before writing anything, so a malformed dataset fails loudly instead of
 * producing half-imported data.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const RawBookSchema = z.object({
  book_id: z.string().min(1),
  title: z.string().min(1),
  isbn: z.string().nullable(),
  genre: z.string().min(1),
  publication_date: isoDate.nullable(),
  status: z.string().min(1),
  mrp: z.number().nonnegative().nullable(),
  author_royalty_per_copy: z.number().nonnegative().nullable(),
  total_copies_sold: z.number().int().nonnegative(),
  total_royalty_earned: z.number().nonnegative(),
  royalty_paid: z.number().nonnegative(),
  royalty_pending: z.number().nonnegative(),
  last_royalty_payout_date: isoDate.nullable(),
  print_partner: z.string().nullable(),
  available_on: z.array(z.string()),
});

export const RawAuthorSchema = z.object({
  author_id: z.string().min(1),
  name: z.string().min(1),
  email: z.email(),
  phone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  joined_date: isoDate.nullable().optional(),
  books: z.array(RawBookSchema),
});

export const RawDatasetSchema = z.object({ authors: z.array(RawAuthorSchema).min(1) });
export type RawDataset = z.infer<typeof RawDatasetSchema>;
