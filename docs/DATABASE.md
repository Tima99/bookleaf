# Database design (MongoDB + Mongoose)

All models live in `apps/api/src/database/models`. Every collection has explicit TypeScript
interfaces, enum validation backed by the shared contract constants, and timestamps.

## Collections

| Collection           | Purpose                                     | Key fields                                                                                                                                                                                                                                 |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`              | Login identity for authors **and** admins   | `email` (unique, lower-case), `passwordHash` (`select: false`), `role`, `author` → Author (AUTHOR only), `isActive`, `lastLoginAt`                                                                                                         |
| `authors`            | Author profile from the dataset             | `authorCode` (AUTH001, unique), `name`, `email` (unique), `phone`, `city`, `joinedDate`                                                                                                                                                    |
| `books`              | Books from the dataset                      | `bookCode` (BK001, unique), `author` → Author, all dataset fields, derived `stage` + `productionStage`                                                                                                                                     |
| `tickets`            | Support tickets                             | `ticketNumber` (unique, shown as BL-1001), `author`, `book?`, `subject`, `description`, `status`, effective `category`/`priority` + `*Source`, `priorityRank`, `triage` (AI/rules output), overrides, `assignee`, counters, cached `draft` |
| `ticketmessages`     | **Public** conversation (author ↔ team)     | `ticket`, `senderType`, `sender`, `senderName` (snapshot), `body`, `origin` (MANUAL / AI_DRAFT_EDITED / AI_DRAFT_UNEDITED / TEMPLATE)                                                                                                      |
| `internalnotes`      | **Admin-only** notes                        | `ticket`, `author` (admin), `authorName`, `body`                                                                                                                                                                                           |
| `aistrategies`       | Strategy identity + which version is active | `key` (unique), `kind`, `category?`, `enabled`, `isDefault`, `activeVersion`, `latestVersion`                                                                                                                                              |
| `aistrategyversions` | Immutable strategy configurations           | `strategy`, `version`, `config` (validated by `AiStrategyConfigSchema`), `changeNote`, `createdBy`                                                                                                                                         |
| `airuns`             | One row per model call (success/failure)    | `kind`, `status`, `ticket?`, `strategies[{id,name,version}]`, `model`, `latencyMs`, token usage, `failureKind` — **no prompts or outputs**                                                                                                 |
| `auditevents`        | Append-only audit trail                     | `entityType`, `entityId`, `ticketNumber?`, `action`, `summary`, `actor{user,name,role}`, `changes[]`                                                                                                                                       |
| `counters`           | Atomic sequences                            | `_id` = sequence name, `seq`                                                                                                                                                                                                               |

### Relationships

```
User (AUTHOR) 1─1 Author 1─* Book
Author 1─* Ticket *─0..1 Book
Ticket 1─* TicketMessage        (public)
Ticket 1─* InternalNote         (admin only — separate collection by design)
Ticket *─0..1 User (assignee, ADMIN)
AiStrategy 1─* AiStrategyVersion
Ticket.triage.strategyVersions → (AiStrategy, version) used
AiRun → Ticket?, (AiStrategy, version)[]
```

### Design decisions

- **User vs Author.** Authentication data is separate from the author profile so admins
  use the same login flow, and credential fields never travel with book/author queries.
- **Internal notes in their own collection.** Author-facing code only ever queries
  `ticketmessages`; it is structurally impossible for an author endpoint to return a note
  through a forgotten `visibility` filter.
- **Effective vs AI values.** `ticket.category/priority` are the values the queue uses;
  `ticket.triage.*` keeps what the model (or rules) suggested; `categorySource /
prioritySource` record provenance (`AI`, `RULES`, `ADMIN`) and `*Override` records who
  and when. Triage writes use conditional updates (`categorySource != 'ADMIN'`), so an
  admin decision is never overwritten — even by a concurrent AI run.
- **`priorityRank`** (CRITICAL=4 … LOW=1, 0 unknown) is stored so MongoDB can sort by
  urgency server-side.
- **Strategy versions are immutable.** A change creates version N+1; tickets keep a
  reference to the version that produced their AI output; rollback = activate an older
  version.
- **Denormalised fields** (`senderName`, `authorName`, `latestAdminResponse.excerpt`,
  `publicMessageCount`, `lastPublicSender`) are deliberate snapshots for list views and
  history; they are written in the same service call as the source record.

## Null handling

Books still in production have no publication date, MRP, royalty-per-copy, print partner
or payout date. These are stored as `null` (never 0 or empty strings) so the UI can show
"Available once published" and the AI prompt states "not yet published" instead of
inventing values. Counters that are genuinely zero in the dataset (`total_copies_sold: 0`,
`royalty_paid: 0`) stay `0`.

`stage` (`PUBLISHED` / `IN_PRODUCTION`) and `productionStage` ("Cover Design") are derived
from the raw `status` string at seed time; the original status is preserved verbatim.

## Indexes (and the queries they serve)

| Collection         | Index                                                  | Used by                                                             |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| users              | `{email}` unique                                       | login                                                               |
| users              | `{author}` unique, partial (author is ObjectId)        | one login per author; session → author lookup                       |
| users              | `{role, name}`                                         | admin directory / assignee picker                                   |
| authors            | `{authorCode}` unique, `{email}` unique                | seed upserts, integrity                                             |
| authors            | `{name}`                                               | author directory sort                                               |
| books              | `{bookCode}` unique                                    | seed upserts, `GET /authors/me/books/:bookId`                       |
| books              | `{author, stage}`                                      | My Books filtered by stage (prefix also serves author-only lookups) |
| books              | `{author, publicationDate: -1}`                        | My Books default sort                                               |
| tickets            | `{ticketNumber}` unique                                | BL-number search, integrity                                         |
| tickets            | `{author, createdAt: -1}`                              | author's tickets, author detail                                     |
| tickets            | `{status, priorityRank: -1, createdAt: 1}`             | admin queue default "urgency" sort, dashboard needs-attention       |
| tickets            | `{category, status, createdAt: -1}`                    | queue category filter, dashboard by-category                        |
| tickets            | `{assignee, status}`                                   | "assigned to me" / unassigned filters, dashboard counters           |
| tickets            | `{lastActivityAt: -1}`                                 | "recently updated" sort                                             |
| tickets            | `{seedKey}` unique, partial                            | idempotent demo-ticket seeding                                      |
| ticketmessages     | `{ticket, createdAt}`                                  | conversation thread, draft history window                           |
| internalnotes      | `{ticket, createdAt}`                                  | admin ticket workspace                                              |
| aistrategies       | `{key}` unique                                         | seeding                                                             |
| aistrategies       | `{kind, category}` unique, **partial `enabled: true`** | active-strategy lookup + "one enabled per scope" invariant          |
| aistrategyversions | `{strategy, version: -1}` unique                       | version history, exact version lookup                               |
| airuns             | `{createdAt: -1}` with TTL 90 days                     | run log, 24h usage aggregation, automatic expiry                    |
| airuns             | `{strategies.strategy, createdAt: -1}`                 | per-strategy stats and run filter                                   |
| auditevents        | `{entityType, entityId, createdAt: -1}`                | ticket activity timeline                                            |
| auditevents        | `{createdAt: -1}`                                      | dashboard recent activity                                           |

Indexes are declared on the schemas and synchronised at startup (`syncIndexes`). In a
larger system this would move to a migration step.

**Search.** Subject/author search uses an escaped, case-insensitive regex combined with
the other (indexed) filters and bounded page sizes. At BookLeaf's ticket volume this is
fine; the documented next step is a MongoDB Atlas Search index (prefix + fuzzy matching).

## Pagination

Every list endpoint is server-side paginated (`page`, `pageSize ≤ 100`) with a stable sort
(an `_id` tiebreaker) and returns `meta { page, pageSize, total, totalPages }`. Nothing
loads a whole collection into memory.

## Consistency strategy

The API does not depend on multi-document transactions (a standalone MongoDB — e.g. the
local dev instance — does not support them). Multi-write flows are ordered so the source
of truth is written first:

- Reply: insert `ticketmessages` row → `$inc`/`$set` ticket counters → audit → event.
  If the second write failed, the message still exists and the counters can be recomputed.
- Ticket numbers come from an atomic `$inc` on `counters`.
- Strategy enable: disable others in scope, then enable target; the partial unique index
  rejects any race (mapped to HTTP 409).
- Audit writes are best-effort (logged on failure) and never roll back the business change.

With a replica set (Atlas), wrapping the reply flow in a transaction is a small change.

## Seed strategy

`pnpm seed` (`apps/api/src/database/seed`):

1. Validates the JSON file with a Zod schema before writing anything.
2. Upserts authors by `author_id` and books by `book_id` — every field and every `null`
   preserved; re-running updates in place (no duplicates).
3. Upserts one AUTHOR user per author and two demo ADMIN users. Passwords are bcrypt-hashed
   and only set on insert (`$setOnInsert`), so re-seeding never resets a changed password.
4. Inserts the 13 default AI strategies (version 1) if missing — never overwrites edits.
5. Optionally inserts 7 demo tickets (by `seedKey`, once) modelled on the brief's sample
   queries, triaged by the keyword rules (`source: RULES`, clearly labelled).

The seed test (`apps/api/tests/seed.test.ts`) runs the seed twice and asserts counts; when
the provided dataset file is present locally it also asserts exactly 10 authors and 18 books.
