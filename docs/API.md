# REST API reference

Base URL: `http://localhost:4000/api/v1` · OpenAPI spec: `GET /api/openapi.json` ·
Swagger UI (development): <http://localhost:4000/api/docs>

## Conventions

- JSON only. Mutations must send `Content-Type: application/json` (otherwise **415**).
- Auth: `bl_session` HTTP-only cookie set by `POST /auth/login`. All other endpoints
  require it (**401** otherwise).
- CSRF: send the `csrfToken` from the login / `me` response as `X-CSRF-Token` on every
  POST/PATCH (**403 `CSRF_TOKEN_INVALID`** otherwise).
- Success envelope: `{ "success": true, "data": … }`; lists add
  `"meta": { "page", "pageSize", "total", "totalPages" }`.
- Error envelope:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body failed validation",
    "details": [{ "path": "subject", "message": "Subject must be at least 5 characters" }],
    "requestId": "8f0b…"
  }
}
```

| HTTP | Codes                                                                           |
| ---- | ------------------------------------------------------------------------------- |
| 400  | `VALIDATION_ERROR` (path/query params, malformed JSON)                          |
| 401  | `UNAUTHENTICATED`, `INVALID_CREDENTIALS`, `SESSION_EXPIRED`                     |
| 403  | `FORBIDDEN` (wrong role), `CSRF_TOKEN_INVALID`                                  |
| 404  | `NOT_FOUND` (also for other authors' resources)                                 |
| 409  | `CONFLICT` (duplicate ticket, strategy scope clash), `INVALID_STATE_TRANSITION` |
| 413  | `PAYLOAD_TOO_LARGE`                                                             |
| 415  | unsupported content type                                                        |
| 422  | `VALIDATION_ERROR` (body failed business validation)                            |
| 429  | `RATE_LIMITED`                                                                  |
| 500  | `INTERNAL_ERROR` (no internals leaked; use `requestId` to find the log)         |

Lists accept `page` (≥1, default 1) and `pageSize` (1–100, default 20). Multi-value filters
accept comma-separated values (`status=OPEN,IN_PROGRESS`).

---

## Health

| Method | Path            | Auth | Description                                                   |
| ------ | --------------- | ---- | ------------------------------------------------------------- |
| GET    | `/health`       | —    | Liveness: `{ status: "ok", uptimeSeconds }`                   |
| GET    | `/health/ready` | —    | Readiness: 200 `{status:"ready"}` or 503 when MongoDB is down |

## Auth

### `POST /auth/login` (public, rate-limited)

```json
{ "email": "priya.sharma@email.com", "password": "Author@2026" }
```

→ 200 (sets cookie)

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "…",
      "email": "priya.sharma@email.com",
      "name": "Priya Sharma",
      "role": "AUTHOR",
      "authorCode": "AUTH001"
    },
    "csrfToken": "Zk3…",
    "expiresAt": "2026-10-15T20:00:00.000Z"
  }
}
```

Errors: 401 `INVALID_CREDENTIALS`, 422, 429.

### `POST /auth/logout` (public) → clears the cookie.

### `GET /auth/me` → same shape as login (used to restore the session and CSRF token).

## Author — own data (`role: AUTHOR`)

| Method | Path                        | Description                                                                                                                                                                                                                                                                               |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/authors/me`               | Profile `{ id, authorCode, name, email, phone, city, joinedDate }`                                                                                                                                                                                                                        |
| GET    | `/authors/me/dashboard`     | `{ totals{totalBooks,publishedBooks,inProductionBooks,totalCopiesSold,totalRoyaltyEarned,royaltyPaid,royaltyPending,openTickets}, royaltyCalendar{currentQuarterLabel,currentQuarterEnd,currentQuarterPayoutBy,previousQuarterPayoutBy,payoutThreshold,pendingBelowThreshold}, books[] }` |
| GET    | `/authors/me/books`         | Paginated `BookDto[]`. Query: `search`, `stage=PUBLISHED                                                                                                                                                                                                                                  | IN_PRODUCTION` |
| GET    | `/authors/me/books/:bookId` | One book by code (`BK001`). 404 if not the caller's.                                                                                                                                                                                                                                      |

`BookDto`: `id, bookCode, title, isbn|null, genre, publicationDate|null, status, stage,
productionStage|null, mrp|null, authorRoyaltyPerCopy|null, totalCopiesSold,
totalRoyaltyEarned, royaltyPaid, royaltyPending, lastRoyaltyPayoutDate|null,
printPartner|null, availableOn[]`.

## Author tickets (`role: AUTHOR`)

### `POST /tickets` — create (rate-limited 10 / 10 min)

```json
{
  "bookId": "BK005",
  "subject": "No royalty received yet",
  "description": "My book was published months ago and I have not received any royalty."
}
```

`bookId: null` = General / Account level. Validation: subject 5–150, description 20–5000.

→ **201** `AuthorTicketDetailDto` with `status: "OPEN"` immediately; AI triage runs in the
background (category/priority appear moments later via SSE).
Errors: 422 (validation, or a book that isn't yours), 409 (identical ticket within 2 minutes).

### `GET /tickets/mine`

Query: `status` (comma-separated), `search` (subject or `BL-1001`), paging. Sorted by last
activity. Item: `{ id, reference, subject, book{id,bookCode,title}|null, category|null,
priority|null, status, createdAt, updatedAt, lastActivityAt, latestAdminResponse{excerpt,createdAt}|null, hasTeamReply }`.

### `GET /tickets/mine/:id`

Summary + `description`, `messages[]` (public only: `{id, senderType, senderName, body, createdAt}`), `canReply`.
Never includes internal notes, triage internals, drafts or assignment.

### `POST /tickets/mine/:id/messages` → 201

`{ "body": "…" }` (1–10000). Re-opens a RESOLVED ticket (→ IN_PROGRESS); 409 on CLOSED.

### `GET /tickets/mine/events` — Server-Sent Events

`event: ready` on connect, then `event: ticket` with
`{ "type": "ticket.message.created", "ticketId": "…", "reference": "BL-1004", "at": "…" }`.
Types delivered to authors: `ticket.created`, `ticket.updated`, `ticket.triaged`,
`ticket.status.changed`, `ticket.message.created` — only for the caller's tickets.
Heartbeat comment every 25 s; `retry: 5000`.

## Admin tickets (`role: ADMIN`)

### `GET /admin/tickets`

Query: `search` (subject, author name/email/code, BL-number), `status`, `category`,
`priority` (comma lists), `assignee` (`me` | `unassigned` | admin id), `authorId`,
`createdFrom`, `createdTo` (YYYY-MM-DD, inclusive), `sort` (`urgency` default = priority
desc + oldest first, `newest`, `oldest`, `updated`, `priority`), paging.

Item (`AdminTicketSummaryDto`): `id, reference, subject, author{id,authorCode,name},
book|null, category, categorySource (AI|RULES|ADMIN), priority, prioritySource, status,
triageStatus (PENDING|COMPLETED|FAILED|SKIPPED), assignee{id,name}|null, createdAt,
updatedAt, lastActivityAt, firstResponseAt, awaitingTeamReply`.

### `GET /admin/tickets/:id`

Summary + `description, authorProfile, bookDetail, triage{status, source, category,
categoryConfidence, priority, rationale, priorityRationale, escalate, rulesApplied[], model,
strategyVersions[], failureKind, failureMessage, attempts, completedAt}, messages[] (with
origin), internalNotes[], activity[], draft (cached AiDraftDto)|null, allowedTransitions[]`.

### `PATCH /admin/tickets/:id`

```json
{ "status": "RESOLVED" }            // and/or
{ "category": "ISBN_METADATA", "priority": "HIGH" }
```

Category/priority become admin overrides (`source: ADMIN`) — later AI runs keep them.
Status transitions: OPEN→IN_PROGRESS/RESOLVED/CLOSED, IN_PROGRESS→OPEN/RESOLVED/CLOSED,
RESOLVED→IN_PROGRESS/CLOSED, CLOSED→IN_PROGRESS. Invalid → 409 `INVALID_STATE_TRANSITION`.
Unknown fields → 422. Returns the full detail.

### `POST /admin/tickets/:id/assign`

`{ "assigneeId": "<admin id>" }` or `{ "assigneeId": null }`. Assignee must be an active admin (422).

### `POST /admin/tickets/:id/notes` → 201

`{ "body": "Finance confirmed transfer on 12 Nov" }` — internal only.

### `POST /admin/tickets/:id/responses` → 201

```json
{ "body": "Dear Ananya, …", "statusAfter": "RESOLVED", "draftId": "6f1c…" }
```

`statusAfter` optional (default: OPEN → IN_PROGRESS). `draftId` records provenance
(`AI_DRAFT_UNEDITED` / `AI_DRAFT_EDITED` / `TEMPLATE`; otherwise `MANUAL`). Sets first-response
time, assigns an unassigned ticket to the responder, clears the cached draft, notifies the
author in real time. 409 on CLOSED tickets.

### `POST /admin/tickets/:id/ai/classify` (AI rate limit)

Re-runs triage synchronously and returns the detail. Admin overrides are preserved.

### `POST /admin/tickets/:id/ai/draft` (AI rate limit)

`{ "force": false }` → `{ draft: AiDraftDto|null, failure: {kind,message}|null, fromCache }`.
Returns the cached draft when still fresh; `force: true` regenerates. On AI failure returns
a policy **template** (`draft.source = "TEMPLATE"`) plus `failure`.

`AiDraftDto`: `id, body, source, model, strategy{id,name,version}|null,
knowledgeSectionsUsed[], verificationChecklist[], suggestedStatus, escalationRecommended,
generatedAt, stale, usage{inputTokens,outputTokens}|null`.

## Admin — other

| Method | Path                 | Description                                                                                                                                                                                                                                                                                                           |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/admin/dashboard`   | Counters (`total, open, inProgress, resolved, closed, criticalUnresolved, highUnresolved, unassignedUnresolved, awaitingTeamReply, myUnresolved`), `avgFirstResponseMinutes`, `unresolvedByCategory[]`, `needsAttention[]` (8 most urgent/oldest), `recentActivity[]`, `ai{configured, runsLast24h, failuresLast24h}` |
| GET    | `/admin/authors`     | Paginated directory with `bookCount`, `openTicketCount`; `search`                                                                                                                                                                                                                                                     |
| GET    | `/admin/authors/:id` | `{ author, books[], tickets[], totals }`                                                                                                                                                                                                                                                                              |
| GET    | `/admin/users`       | Active admins `{id, name, email}[]`                                                                                                                                                                                                                                                                                   |
| GET    | `/admin/events`      | SSE stream of all ticket events (incl. notes/assignment)                                                                                                                                                                                                                                                              |

## AI configuration (`role: ADMIN`, prefix `/admin/ai`)

| Method | Path                        | Description                                                                                                                                                 |
| ------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/status`                   | `{ configured, provider, defaultModels{triage,draft}, circuitOpenUntil, last24h{runs,failures,inputTokens,outputTokens} }` — never includes keys            |
| GET    | `/knowledge-base`           | KB sections `{id, title, categories[], content, approxTokens}`                                                                                              |
| GET    | `/runs`                     | Run log; `strategyId`, `status=SUCCESS                                                                                                                      | FAILED`, paging                                                                                                       |
| GET    | `/strategies`               | All strategies (`kind`, `category` filters) with active config and run stats                                                                                |
| POST   | `/strategies`               | Create (v1). Body: `{ name, kind, category                                                                                                                  | null, purpose?, enabled?, config, changeNote? }`. Classification must have `category: null`. 409 if enabling clashes. |
| GET    | `/strategies/:id`           | One strategy                                                                                                                                                |
| PATCH  | `/strategies/:id`           | `{ name?, purpose?, enabled?, config?, changeNote?, activate=true }` — `config` creates version N+1; enabling disables the other strategy in the same scope |
| GET    | `/strategies/:id/versions`  | Version history                                                                                                                                             |
| POST   | `/strategies/:id/activate`  | `{ version }` — activate / roll back                                                                                                                        |
| POST   | `/strategies/:id/duplicate` | Copy (created disabled)                                                                                                                                     |
| POST   | `/strategies/:id/test`      | `{ subject, description, bookId?, version?, dryRun? }` → `{ preview{system,prompt,estimatedInputTokens,knowledgeSections}, output (TRIAGE                   | DRAFT)                                                                                                                | null, model, latencyMs, usage, failure }` (AI rate limit) |

`config` (`AiStrategyConfig`): `instructions` (20–6000), `categoryInstructions` (≤3000),
`tone` (≤800), `priorityRules[]` (≤15 × 300), `floorRules[]` (`{label, keywords[1..25],
minimumPriority}`), `knowledgeSections[]`, `provider` (`anthropic|openai`), `model`,
`temperature` (0–1 or null), `maxOutputTokens` (64–4000), `includeExamples`,
`maxHistoryMessages` (0–20).
