import type { RawDataset } from '../../src/database/seed/dataset.schema';

/**
 * Synthetic dataset with the same shape and edge cases as the BookLeaf sample data
 * (published books, zero payouts, a book in production with null fields). Kept fake so
 * the provided dataset never has to be committed to the repository.
 */
export const TEST_DATASET: RawDataset = {
  authors: [
    {
      author_id: 'TAUTH01',
      name: 'Asha Verma',
      email: 'asha.verma@example.test',
      phone: '+91-90000-00001',
      city: 'Jaipur',
      joined_date: '2023-01-10',
      books: [
        {
          book_id: 'TBK01',
          title: 'Monsoon Letters',
          isbn: '978-00-TEST-01-1',
          genre: 'Literary Fiction',
          publication_date: '2023-05-01',
          status: 'Published & Live',
          mrp: 399,
          author_royalty_per_copy: 35,
          total_copies_sold: 100,
          total_royalty_earned: 3500,
          royalty_paid: 2000,
          royalty_pending: 1500,
          last_royalty_payout_date: '2025-08-15',
          print_partner: 'In-House',
          available_on: ['Amazon India', 'BookLeaf Store'],
        },
        {
          book_id: 'TBK02',
          title: 'The Unwritten Chapter',
          isbn: '978-00-TEST-02-8',
          genre: 'Thriller',
          publication_date: null,
          status: 'In Production - Cover Design',
          mrp: null,
          author_royalty_per_copy: null,
          total_copies_sold: 0,
          total_royalty_earned: 0,
          royalty_paid: 0,
          royalty_pending: 0,
          last_royalty_payout_date: null,
          print_partner: null,
          available_on: [],
        },
      ],
    },
    {
      author_id: 'TAUTH02',
      name: 'Dev Malhotra',
      email: 'dev.malhotra@example.test',
      phone: null,
      city: 'Pune',
      joined_date: '2024-02-01',
      books: [
        {
          book_id: 'TBK03',
          title: 'Debug Your Days',
          isbn: '978-00-TEST-03-5',
          genre: 'Self-Help',
          publication_date: '2024-06-01',
          status: 'Published & Live',
          mrp: 299,
          author_royalty_per_copy: 25,
          total_copies_sold: 20,
          total_royalty_earned: 500,
          royalty_paid: 0,
          royalty_pending: 500,
          last_royalty_payout_date: null,
          print_partner: 'Repro India',
          available_on: ['Amazon India'],
        },
      ],
    },
  ],
};

export const PASSWORDS = { author: 'Author@Test1', admin: 'Admin@Test1' };
export const ADMIN_EMAIL = 'support.lead@bookleaf.test';
