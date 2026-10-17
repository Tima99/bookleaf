# Architecture

## Overview

```
┌─────────────────────────┐   HTTPS (JSON, cookies)   ┌──────────────────────────────┐
│  apps/web  (Next.js 16) │ ────────────────────────▶ │  apps/api  (Express 5)        │
│  React 19, Ant Design 6,│ ◀──────── SSE ─────────── │  REST /api/v1 + SSE streams   │
│  Tailwind 4, TanStack Q │                           │  ┌──────────┐  ┌───────────┐ │
│  (UI only — no API      │                           │  │ Services │─▶│ MongoDB   │ │
│   routes / actions)     │                           │  └────┬─────┘  └───────────┘ │
└─────────────────────────┘                           │       │ LlmClient (AI SDK 7) │
            ▲                                         │       ▼                      │
            │  shared types + Zod schemas             │  Anthropic / OpenAI (server- │
┌───────────┴─────────────┐                           │  side key, optional)         │
│ packages/contracts      │◀──────────────────────────┴──────────────────────────────┘
│ packages/utils          │
└─────────────────────────┘
```

## Why a monorepo

The frontend and backend share a lot: enums (categories, priorities, statuses), request
schemas, DTO shapes, currency/date helpers and the royalty calendar. A pnpm-workspace
monorepo with Turborepo lets both apps import **one** definition of each:

- `@bookleaf/contracts` — Zod schemas (canonical request validation) and DTO types derived with `z.infer`.
  The API validates with them; React Hook Form validates the same rules client-side.
- `@bookleaf/utils` — framework-agnostic helpers (INR formatting, dates, royalty calendar).
- `@bookleaf/config` — shared TypeScript and ESLint configuration.

The internal packages are "just-in-time" packages (they export TypeScript source). Next.js
compiles them via `transpilePackages`; the API bundles them with `tsup` for production.
This avoids a separate build step for the packages while keeping strict type-checking.

## Why Next.js and Express are separate

The brief asks for a clean REST API with documentation, auth middleware and RBAC. Keeping
it in a dedicated Express service:

- gives one place for **all** business rules, authorisation and AI orchestration;
- keeps AI keys and database credentials on a server that never ships code to browsers;
- lets the API be tested with Supertest independently of any UI;
- allows independent scaling/deployment (static-friendly frontend on Vercel, long-lived
  API process on Render/Railway that can hold SSE connections).

The Next.js app contains **no** API routes, route handlers or server actions. It renders
UI and calls the API through a typed client (`apps/web/src/lib/api-client.ts`).

## Backend layering

```
Route (Express Router)
  → authenticate (session cookie → req.user, re-reads the user each request)
  → csrfProtection (X-CSRF-Token bound to the session)
  → authorize(role)
  → handle({ params, query, body }) — Zod validation, typed values
  → Service (business rules, authorisation scoping, audit, events)
  → Mongoose models (data access)
→ centralised error handler (uniform ApiError envelope + requestId)
```

- **Controllers are inline and thin** — each route is a few lines in `*.routes.ts` that
  call one service method. `common/http.ts#handle` performs validation so a controller
  cannot forget it.
- **Services own business logic**: `AuthorTicketService`, `AdminTicketService`,
  `BookService`, `AdminService`, and the AI services (`TriageService`,
  `ResponseDraftService`, `StrategyService`, `StrategyTestService`, `AiRunService`).
- **Data access** uses Mongoose models directly inside services. A separate repository
  layer was considered and skipped: queries are short, the models are typed, and an extra
  indirection would add files without adding a seam we need (documented trade-off).
- **Composition root** (`src/container.ts`) wires every service with explicit
  dependencies. Tests swap in a fake `LlmClient` and nothing else changes.

## Request lifecycle (example: author creates a ticket)

1. `POST /api/v1/tickets` → rate limit → `authenticate` → CSRF check → `authorize('AUTHOR')`.
2. Body validated against `CreateTicketRequestSchema` (422 with field details if invalid).
3. `AuthorTicketService.create` checks the book belongs to the author (identity from the
   session, never the body), blocks a duplicate submitted in the last 2 minutes, allocates
   `BL-<n>` atomically, stores the ticket with `triage.status = PENDING`, writes an audit
   event, publishes `ticket.created` and **returns 201 immediately**.
4. A background job runs `TriageService.triageTicket`: one model call (or the rules
   fallback) → validated, policy floors applied → conditional updates that never replace
   an admin override → `ticket.triaged` event.
5. SSE delivers the event ids to connected admins (queue refreshes) and to the author.

## Authentication & authorisation

- Email + password (bcrypt, cost 12). Login issues an HS256 JWT in an **HTTP-only** cookie
  (`bl_session`) plus a CSRF token returned in the response body. The token embeds the
  CSRF value, so the server can verify `X-CSRF-Token` statelessly.
- Every request re-loads the user (deactivation and role changes take effect immediately).
- **Authors** are scoped by `req.user.authorId` in every query; another author's resource
  returns **404** (indistinguishable from "doesn't exist").
- **Admins** access `/api/v1/admin/*` (router-level `authorize('ADMIN')`).
- The frontend `RoleGuard` is UX only; the API is the security boundary.

See [SECURITY.md](SECURITY.md) for cookies, CSRF, CORS and rate limits.

## Real-time architecture

- Transport: **Server-Sent Events** (`/api/v1/tickets/mine/events`, `/api/v1/admin/events`).
  One-way server→client is all we need; SSE works over plain HTTP, reconnects natively
  and needs no extra infrastructure.
- `TicketEventBus` interface with an in-process `EventEmitter` implementation. Services
  publish **after** the database write succeeds.
- Events carry ids only (`type`, `ticketId`, `reference`, `at`). Clients invalidate the
  matching TanStack Query keys and re-fetch through authorised endpoints — so the stream
  can never leak a message body or internal note.
- Per-connection filtering: authors receive only their own tickets' events and never
  `ticket.note.created` / `ticket.assigned`.
- Heartbeat every 25s; stream closes at session expiry; client reconnects with
  exponential backoff and falls back to 20s polling while disconnected.
- **Limitation:** in-process fan-out works for one API instance. For several instances,
  implement `TicketEventBus` on Redis pub/sub or MongoDB change streams — no caller changes.

## Admin tab workspace

The admin layout hosts a persistent workspace. The URL is the source of truth: the shell
maps the current path to a tab (`tabFromPath`) and activates it in a Zustand store; route
pages (`/admin/tickets/[id]`, …) render nothing and exist only for deep links. Switching
tabs updates the URL with `history.pushState` (no route fetch, no `<head>` re-render).
`WorkspaceHost` renders every open tab, keeping inactive ones mounted and cached, so typed
replies, scroll position and filters survive tab switches. Details in [UI_UX.md](UI_UX.md).

## Deployment topology (target)

- Web → Vercel (`NEXT_PUBLIC_API_URL` points at the API).
- API → Render / Railway (single instance; long-lived connections for SSE).
- MongoDB Atlas.
  See [DEPLOYMENT.md](DEPLOYMENT.md). (No live deployment was performed from this workspace.)
