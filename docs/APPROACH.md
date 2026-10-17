# Approach (one-page write-up)

**What I prioritised.** The core loop — an author raises a ticket, it is classified and
prioritised, an admin answers with an AI-drafted, policy-accurate reply, and the author
sees it live — had to be solid before anything else. Within that loop I prioritised
(1) AI that is _useful and safe_ rather than impressive, (2) hard data-privacy boundaries
between authors and between public replies and internal notes, and (3) an admin workflow
that feels like a real ops tool (urgency-first queue, tabbed workspace, overrides).

**Architecture.** A pnpm/Turborepo monorepo: Next.js (UI only) + Express API + MongoDB, with
a shared `contracts` package so the browser and server validate with the _same_ Zod
schemas. The API is layered (routes → auth/CSRF/RBAC → typed validation → services → models)
and wired through a composition root, which made it easy to test every flow with an
in-memory MongoDB and a fake LLM. Real-time updates use SSE with id-only events — clients
re-fetch through authorised endpoints, so the stream can't leak content.

**AI strategy.** Three jobs, each with a different cost/quality profile:

- _Triage_ — one call to a small model returns category **and** priority as validated
  structured output; deterministic "floor rules" then raise priority for policy cases the
  model must never under-rate (ISBN errors, months without royalty, legal threats).
- _Drafting_ — a stronger model, grounded only in the 1–3 relevant knowledge-base sections,
  verified book/author facts and **royalty dates computed in code**, so it quotes real
  numbers instead of inventing them. It must list what the agent should verify, and the UI
  turns that into a checklist before sending.
- _Configuration_ — all prompts live in versioned, admin-editable strategies (per category),
  with prompt preview, a test console, rollback, and tickets recording the version used.

Graceful degradation is a first-class path: no key, 429s, timeouts or bad output fall back
to keyword rules and policy templates, a circuit breaker stops hammering a failing provider,
and ticket creation never waits on AI. Cost is controlled by context selection, caching
drafts until the conversation changes, in-flight de-duplication, rate limits and a run log
with token usage.

**Trade-offs.**

- In-process event bus, rate limits and job runner: right for one instance, documented
  interfaces for Redis/queues later.
- No multi-document transactions (works on a standalone MongoDB); writes are ordered so the
  source of truth lands first.
- Services use Mongoose directly instead of a separate repository layer — fewer files, same
  testability.
- Regex search instead of Atlas Search; keyword fallback instead of an embedding classifier.
- Attachments are UI-only (clearly labelled), per the brief.
- Brand pink `#FF4975` (sampled from the BookLeaf site) is used for buttons and accents, but
  small pink text uses a deeper `#D6295A` so it still meets WCAG AA contrast.
- I did not run real model calls or deploy, to keep the provided data local; AI paths are
  covered by tests with a fake provider.

**Evolving this into production.**

1. Evaluation: build a labelled set from real tickets; measure classification accuracy and
   draft acceptance (we already record whether replies were sent unedited/edited) per
   strategy version; A/B new versions before activating them.
2. Durability & scale: queue (BullMQ/SQS) for triage with retries, Redis pub/sub for events,
   Redis rate limits, Atlas Search, a replica set with transactions for the reply flow.
3. Product: real attachment uploads (S3 + virus scanning), email notifications, SLA timers
   and breach alerts, canned responses, macros for bulk incidents (e.g. a platform outage
   affecting many books), author-side satisfaction rating.
4. Integrations: pull live royalty/payout and production status from BookLeaf's systems so
   drafts can cite actual transfer dates; finance/production escalation hand-offs.
5. Operations: OpenTelemetry tracing, dashboards for AI cost/latency, CSP, SSO for staff.
