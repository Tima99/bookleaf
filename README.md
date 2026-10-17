# BookLeaf — Author Support & Communication Portal

A web application for BookLeaf Publishing's author support: authors track their books and
royalties and raise tickets; the operations team works an urgency-ordered queue in a tabbed
workspace with **AI classification, AI priority scoring and AI-drafted replies grounded in
BookLeaf's knowledge base** — with graceful fallbacks when AI is unavailable.

|          |                                                                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | Next.js 16 (App Router, UI only) · React 19 · TypeScript · Ant Design 6 · Tailwind CSS 4 · Framer Motion · TanStack Query · React Hook Form + Zod · Zustand |
| Backend  | Node.js 24 · Express 5 · TypeScript · MongoDB + Mongoose 9 · Zod · JWT (HTTP-only cookie) + CSRF · Pino · SSE                                               |
| AI       | Vercel AI SDK 7 (`@ai-sdk/anthropic`, `@ai-sdk/openai`) · structured outputs validated with Zod                                                             |
| Tooling  | pnpm 12 workspaces · Turborepo · Vitest · Supertest · mongodb-memory-server · ESLint · Prettier                                                             |

**Docs:** [Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) ·
[API](docs/API.md) (+ OpenAPI at `/api/docs`) · [AI strategy](docs/AI_STRATEGY.md) ·
[AI prompts](docs/AI_PROMPTS.md) · [Security](docs/SECURITY.md) · [UI/UX](docs/UI_UX.md) ·
[Deployment](docs/DEPLOYMENT.md) · [Approach (1-page write-up)](docs/APPROACH.md)

---

## Features

**Author portal**

- Email/password sign-in; authors only ever see their own data (enforced by the API).
- Dashboard: books, copies sold, royalty earned/paid/pending, open tickets, royalty calendar
  with real payout deadlines and the ₹1,000 threshold notice.
- My Books: searchable, filterable, paginated; books in production show "Available once
  published" instead of fake zeros; detail drawer.
- Raise a query: book selector incl. "General / Account level", validated subject and
  description, contextual policy tips, attachment UI (clearly marked as not uploaded).
- My Tickets: status filter + search, conversation thread, reply / re-open, **live updates
  via SSE** with automatic polling fallback.

**Admin portal**

- Operations dashboard from real data (open/in-progress/critical/unassigned/awaiting reply,
  average first-response time, unresolved by category, needs-attention list, activity).
- Ticket queue: server-side search, filters (status, category, priority, assignee, date
  range), urgency-first sort, overdue (>48h) and priority highlighting; filters persist.
- **Tabbed workspace**: tickets, authors and strategies open as tabs; no duplicates; tabs
  stay mounted so unsaved replies survive switching; unsaved-changes guard; refresh restores.
- Ticket workspace: AI triage with provenance (AI / Rules / Admin) and override, re-run,
  AI-drafted reply (editable, verification checklist, regenerate), send / send & resolve,
  internal notes (never visible to authors), assignment, status lifecycle, audit timeline.
- Author directory with books, royalties and tickets per author.
- **Column chooser** on every data table (show/hide columns from a dropdown, remembered per viewer).
- **AI strategies**: versioned per-category strategies for classification, priority scoring
  and drafting — edit, duplicate, enable/disable, preview the composed prompt, test on a
  sample ticket, roll back; run log with latency, tokens and failures; knowledge-base viewer.

---

## Prerequisites

- **Node.js 24 LTS** (`.nvmrc` → `nvm use`)
- **pnpm 12** (`npm i -g pnpm@12.11.2` or `corepack enable`)
- **MongoDB 7+** running locally (or a MongoDB Atlas URI)
- Optional: an Anthropic (or OpenAI) API key — without one the app runs in **manual mode**

## Monorepo layout

```
apps/
  api/          Express REST API (src/modules/{auth,authors,books,tickets,admin,ai,knowledge-base,audit})
  web/          Next.js frontend (src/app routes, src/features, src/components, src/stores)
packages/
  contracts/    Shared Zod schemas, enums and DTO types
  utils/        Formatting + royalty calendar helpers
  config/       Shared tsconfig / ESLint config
data/           bookleaf_sample_data.json (provided by BookLeaf — git-ignored, add locally)
docs/           Technical documentation
```

## Setup

```bash
nvm use                       # Node 24
pnpm install

# 1. Environment
cp apps/api/.env.example apps/api/.env       # set JWT_SECRET; optionally ANTHROPIC_API_KEY
cp apps/web/.env.example apps/web/.env.local # NEXT_PUBLIC_API_URL=http://localhost:4000

# 2. Database (any MongoDB works; this starts a local one)
mkdir -p .data/db && mongod --dbpath .data/db --bind_ip 127.0.0.1 --fork --logpath .data/mongod.log

# 3. Seed — put the provided dataset at data/bookleaf_sample_data.json first
pnpm seed

# 4. Run both apps (API :4000, web :3000)
pnpm dev
```

Open <http://localhost:3000>. API docs: <http://localhost:4000/api/docs>.

### Commands

| Command                                      | What it does                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | API (tsx watch) + web (next dev) via Turborepo                                                                                               |
| `pnpm dev:api` / `pnpm dev:web`              | One app only                                                                                                                                 |
| `pnpm seed`                                  | Idempotent seed (dataset, demo users, AI strategies, demo tickets). `--no-demo-tickets` to skip tickets, `--file <path>` for another dataset |
| `pnpm build`                                 | Production builds (API bundled with tsup → `apps/api/dist`, web → `.next`)                                                                   |
| `pnpm start:api` / `pnpm start:web`          | Run production builds                                                                                                                        |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Strict TS, ESLint, Vitest across the workspace                                                                                               |
| `pnpm format`                                | Prettier                                                                                                                                     |

## Demo credentials

Created by `pnpm seed` (passwords come from `SEED_AUTHOR_PASSWORD` / `SEED_ADMIN_PASSWORD`;
the values below are the local defaults in `apps/api/.env.example`):

| Role                        | Email                                                            | Password      |
| --------------------------- | ---------------------------------------------------------------- | ------------- |
| Admin                       | `support.lead@bookleaf.test` (Aditi Rao)                         | `Admin@2026`  |
| Admin                       | `ops.agent@bookleaf.test` (Karan Mehta)                          | `Admin@2026`  |
| Author                      | any author email from the dataset, e.g. `priya.sharma@email.com` | `Author@2026` |
| Author (book in production) | `kavita.deshmukh@email.com`, `sneha.kulkarni@email.com`          | `Author@2026` |
| Author (no payout yet)      | `ananya.reddy@email.com`, `arjun.malhotra@email.com`             | `Author@2026` |

The login page shows one-click demo shortcuts when `NEXT_PUBLIC_DEMO_MODE=true`.

## AI configuration

Set in `apps/api/.env` (server-side only):

```bash
AI_PROVIDER=anthropic            # or openai | none
ANTHROPIC_API_KEY=sk-ant-...     # empty → manual mode
# AI_TRIAGE_MODEL=claude-haiku-5-5   AI_DRAFT_MODEL=claude-opus-5-5 (defaults)
```

- Triage (category + priority) runs in the background after each ticket is created.
- Drafts are generated when an admin opens a ticket, cached until the conversation changes.
- Without a key (or if the provider fails), tickets are triaged by keyword rules and replies
  start from policy templates — everything else works. See [AI strategy](docs/AI_STRATEGY.md).

## Testing

```bash
pnpm test        # all packages
pnpm --filter @bookleaf/api test
```

API tests spin up an in-memory MongoDB (using the local `mongod` binary,
`MONGOMS_SYSTEM_BINARY`, default `/usr/bin/mongod`) and a fake LLM — no network calls.
Coverage: login success/failure/enumeration, CSRF, content-type guard, RBAC, cross-author
isolation (books + tickets), null book fields, ticket creation with AI success / rate limit /
not configured, priority floor rules, duplicate prevention, queue filters + pagination,
admin overrides surviving re-triage, status transitions, mass-assignment rejection,
assignment, internal-note privacy, draft caching / regeneration / template fallback, reply
provenance, author follow-ups and re-open, dashboard, author directory, strategy defaults,
validation, versioning + rollback, one-enabled-per-scope, prompt preview (KB selection,
injection neutralisation), seed idempotency, and — when the dataset file is present —
exactly 10 authors / 18 books.

### Verification status

| Check                                                                                                                                                                                 | Result                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm typecheck` (strict TS, 4 packages)                                                                                                                                              | ✅ pass                                                                          |
| `pnpm lint` (ESLint incl. React Compiler rules)                                                                                                                                       | ✅ pass                                                                          |
| `pnpm test`                                                                                                                                                                           | ✅ 67 tests (64 API in 6 files + 3 utils), incl. the real-dataset seed test      |
| `pnpm build` (API bundle + Next.js production build)                                                                                                                                  | ✅ pass                                                                          |
| Seed against local MongoDB, run twice                                                                                                                                                 | ✅ 10 authors, 18 books, 12 users, 13 strategies, 7 demo tickets — no duplicates |
| API smoke test on the running build (24 checks: auth, RBAC, CSRF, rules triage, floors, override, reply, note privacy, SSE delivery/filtering, strategy preview)                      | ✅ pass                                                                          |
| Headless-Chrome walkthrough of both portals (author raises ticket → admin replies → author sees it live; unsaved reply survives tab switch; mobile 390 px has no horizontal overflow) | ✅ pass                                                                          |
| Live LLM calls                                                                                                                                                                        | ⏸ not run (no key; data kept local) — covered by fake-provider tests             |

## Deployment

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) (Vercel + Render/Railway + MongoDB Atlas, env vars,
seeding a remote database, post-deploy checks). **This submission was not deployed** —
everything was built and verified locally.

## Known limitations

- Single-instance assumptions: in-process SSE fan-out, rate limits, background jobs and
  circuit breaker (interfaces are in place for Redis/queues).
- Attachments are UI only (not uploaded or stored).
- No real model calls were made during development (no key; data kept local) — AI paths are
  verified with a fake provider in tests.
- Regex search; Atlas Search would be the production choice.
- No email notifications, SLA alerts, password reset or MFA.
- Brand palette is sampled from the BookLeaf website (pink `#FF4975` on lightest-pink canvas); the logo mark is a drawn approximation, not the official asset.
