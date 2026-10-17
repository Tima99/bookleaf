import bcrypt from 'bcryptjs';
import { PRIORITY_RANK } from '@bookleaf/contracts';
import { BCRYPT_COST } from '../../modules/auth/auth.service';
import { deriveStage } from '../../modules/books/book.mapper';
import { classifyByKeywords } from '../../modules/ai/rules/keyword-classifier';
import {
  CATEGORY_BASELINE_PRIORITY,
  evaluateFloorRules,
  maxPriority,
} from '../../modules/ai/rules/priority-rules';
import type { StrategyService } from '../../modules/ai/services/strategy.service';
import { buildDefaultStrategies } from '../../modules/ai/strategies/defaults';
import {
  AuthorModel,
  BookModel,
  nextSequence,
  TicketMessageModel,
  TicketModel,
  UserModel,
} from '../models';
import { RawDatasetSchema, type RawDataset } from './dataset.schema';
import { DEMO_ADMINS, DEMO_TICKETS } from './demo-data';

const toDate = (value: string | null | undefined): Date | null =>
  value ? new Date(`${value}T00:00:00.000Z`) : null;

export interface SeedOptions {
  authorPassword: string;
  adminPassword: string;
  withDemoTickets: boolean;
  strategies: StrategyService;
  now?: Date;
}

export interface SeedSummary {
  authors: number;
  books: number;
  authorUsers: number;
  adminUsers: number;
  strategiesCreated: number;
  demoTicketsCreated: number;
}

export function parseDataset(raw: unknown): RawDataset {
  return RawDatasetSchema.parse(raw);
}

/**
 * Idempotent seed. Authors/books are upserted by their external ids (AUTH001 / BK001),
 * so re-running updates data in place without duplicates. Passwords and demo tickets
 * are only written on first insert (`$setOnInsert` / existence checks), so re-seeding
 * never resets a changed password or duplicates tickets.
 */
export async function seedDatabase(
  dataset: RawDataset,
  options: SeedOptions,
): Promise<SeedSummary> {
  const [authorHash, adminHash] = await Promise.all([
    bcrypt.hash(options.authorPassword, BCRYPT_COST),
    bcrypt.hash(options.adminPassword, BCRYPT_COST),
  ]);

  let books = 0;
  for (const raw of dataset.authors) {
    const author = await AuthorModel.findOneAndUpdate(
      { authorCode: raw.author_id },
      {
        $set: {
          name: raw.name,
          email: raw.email.toLowerCase(),
          phone: raw.phone ?? null,
          city: raw.city ?? null,
          joinedDate: toDate(raw.joined_date),
        },
      },
      { upsert: true, returnDocument: 'after', runValidators: true },
    ).lean();
    if (!author) throw new Error(`Failed to upsert author ${raw.author_id}`);

    for (const b of raw.books) {
      const { stage, productionStage } = deriveStage(b.status);
      await BookModel.updateOne(
        { bookCode: b.book_id },
        {
          $set: {
            author: author._id,
            title: b.title,
            isbn: b.isbn,
            genre: b.genre,
            publicationDate: toDate(b.publication_date),
            status: b.status,
            stage,
            productionStage,
            mrp: b.mrp,
            authorRoyaltyPerCopy: b.author_royalty_per_copy,
            totalCopiesSold: b.total_copies_sold,
            totalRoyaltyEarned: b.total_royalty_earned,
            royaltyPaid: b.royalty_paid,
            royaltyPending: b.royalty_pending,
            lastRoyaltyPayoutDate: toDate(b.last_royalty_payout_date),
            printPartner: b.print_partner,
            availableOn: b.available_on,
          },
        },
        { upsert: true, runValidators: true },
      );
      books += 1;
    }

    await UserModel.updateOne(
      { email: raw.email.toLowerCase() },
      {
        $set: { name: raw.name, role: 'AUTHOR', author: author._id, isActive: true },
        $setOnInsert: { passwordHash: authorHash },
      },
      { upsert: true },
    );
  }

  for (const admin of DEMO_ADMINS) {
    await UserModel.updateOne(
      { email: admin.email },
      {
        $set: { name: admin.name, role: 'ADMIN', author: null, isActive: true },
        $setOnInsert: { passwordHash: adminHash },
      },
      { upsert: true },
    );
  }

  const { created: strategiesCreated } = await options.strategies.ensureDefaults();
  const demoTicketsCreated = options.withDemoTickets
    ? await seedDemoTickets(options.now ?? new Date())
    : 0;

  return {
    authors: dataset.authors.length,
    books,
    authorUsers: dataset.authors.length,
    adminUsers: DEMO_ADMINS.length,
    strategiesCreated,
    demoTicketsCreated,
  };
}

/**
 * A handful of realistic demo tickets (mirroring BookLeaf's sample queries) so the
 * admin queue isn't empty on first login. They are triaged with the deterministic
 * rules (source RULES), never presented as AI output; "Re-run AI triage" upgrades them.
 */
async function seedDemoTickets(now: Date): Promise<number> {
  const floorRules = buildDefaultStrategies()
    .filter((s) => s.kind !== 'RESPONSE')
    .flatMap((s) => s.config.floorRules ?? []);
  const adminUser = await UserModel.findOne({ email: DEMO_ADMINS[0]?.email }).lean();
  let created = 0;

  for (const demo of DEMO_TICKETS) {
    if (await TicketModel.exists({ seedKey: demo.seedKey })) continue;
    const author = await AuthorModel.findOne({ authorCode: demo.authorCode }).lean();
    if (!author) continue;
    const book = demo.bookCode ? await BookModel.findOne({ bookCode: demo.bookCode }).lean() : null;

    const keyword = classifyByKeywords(demo.subject, demo.description);
    const floor = evaluateFloorRules(floorRules, demo.subject, demo.description);
    const baseline = CATEGORY_BASELINE_PRIORITY[keyword.category];
    const priority = floor.floor ? maxPriority(baseline, floor.floor) : baseline;
    const createdAt = new Date(now.getTime() - demo.hoursAgo * 3_600_000);
    const replied = demo.adminReply && adminUser;
    const replyAt = new Date(createdAt.getTime() + 3 * 3_600_000);

    // timestamps:false keeps the back-dated createdAt/updatedAt values.
    const [ticket] = await TicketModel.create(
      [
        {
          ticketNumber: await nextSequence('ticket'),
          seedKey: demo.seedKey,
          author: author._id,
          book: book?._id ?? null,
          subject: demo.subject,
          description: demo.description,
          status: demo.status,
          category: keyword.category,
          categorySource: 'RULES',
          priority,
          priorityRank: PRIORITY_RANK[priority],
          prioritySource: 'RULES',
          triage: {
            status: 'SKIPPED',
            source: 'RULES',
            category: keyword.category,
            categoryConfidence: keyword.confidence,
            priority,
            rationale: `Seeded demo ticket classified by keyword rules (${keyword.matched.slice(0, 5).join(', ') || 'no strong signal'}).`,
            priorityRationale: floor.applied.length
              ? `Policy rules: ${floor.applied.join('; ')}`
              : 'Category baseline priority.',
            escalate: priority === 'HIGH' || priority === 'CRITICAL',
            rulesApplied: floor.applied,
            failureKind: null,
            failureMessage: 'Seed data: use "Re-run AI triage" to classify with the model.',
            attempts: 0,
            completedAt: createdAt,
          },
          assignee: replied ? adminUser._id : null,
          publicMessageCount: replied ? 1 : 0,
          lastPublicSender: replied ? 'ADMIN' : null,
          lastActivityAt: replied ? replyAt : createdAt,
          firstResponseAt: replied ? replyAt : null,
          latestAdminResponse:
            replied && demo.adminReply
              ? { excerpt: demo.adminReply.slice(0, 220), at: replyAt }
              : null,
          resolvedAt: demo.status === 'RESOLVED' ? replyAt : null,
          createdAt,
          updatedAt: replied ? replyAt : createdAt,
        },
      ],
      { timestamps: false },
    );
    if (!ticket) continue;

    if (replied && demo.adminReply) {
      await TicketMessageModel.create(
        [
          {
            ticket: ticket._id,
            senderType: 'ADMIN',
            sender: adminUser._id,
            senderName: adminUser.name,
            body: demo.adminReply,
            origin: 'MANUAL',
            createdAt: replyAt,
          },
        ],
        { timestamps: false },
      );
    }
    created += 1;
  }
  return created;
}
